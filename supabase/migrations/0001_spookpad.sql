-- SpookPad schema (spec §6). Amounts are lamports (bigint). Browsers (anon / authenticated) read only v_* views;
-- every write goes through an Edge Function using the service role, through the SQL functions below. Errors are
-- raised as bare codes ('paused', 'not_found', …) that packages/functions/src/store.ts turns into StoreErrors.

-- ===== tables =====
create table settings (
  id boolean primary key default true check (id),
  costume_fee_lamports bigint not null default 1000000 check (costume_fee_lamports between 0 and 1000000000),
  launch_fee_lamports bigint not null default 20000000 check (launch_fee_lamports between 0 and 1000000000),
  max_dev_buy_lamports bigint not null default 5000000000 check (max_dev_buy_lamports between 0 and 100000000000),
  max_generations_per_hour int not null default 20 check (max_generations_per_hour between 1 and 500),
  min_ai_credit_usd numeric(10, 2) not null default 2 check (min_ai_credit_usd between 0 and 1000),
  generations_paused boolean not null default false,
  launches_paused boolean not null default false,
  pause_reason text check (pause_reason in ('admin', 'low_credit')),
  updated_at timestamptz not null default now()
);
insert into settings default values;

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  wallet text not null unique check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  created_at timestamptz not null default now()
);

create table costumes (
  slug text primary key check (slug ~ '^[a-z]{2,20}$'),
  label text not null check (char_length(label) between 1 and 24),
  emoji text not null check (char_length(emoji) between 1 and 8),
  prompt text not null check (char_length(prompt) between 10 and 600),
  sort int not null default 100,
  enabled boolean not null default true
);
-- the same rows as SEED_COSTUMES in packages/core/src/costumes.ts (a test compares them)
insert into costumes (slug, label, emoji, prompt, sort) values
  ('ghost', 'Ghost sheet', '👻', 'a white bedsheet ghost costume draped over the character''s body and head, with two cut-out eye holes showing the character''s own eyes, the sheet''s folds following its shape', 1),
  ('witch', 'Witch', '🧙', 'a black pointy witch hat and a dark purple cape', 2),
  ('vampire', 'Vampire', '🧛', 'a high-collared black and red vampire cape and small fangs', 3),
  ('pumpkin', 'Pumpkin head', '🎃', 'a carved jack-o''-lantern worn as a helmet over the head, the face visible through the carved opening', 4),
  ('mummy', 'Mummy', '🧟', 'loose white bandage wrappings around the body and head, the eyes still visible', 5),
  ('skeleton', 'Skeleton', '💀', 'a black skeleton costume suit with white bones printed on it', 6),
  ('devil', 'Devil', '😈', 'small red devil horns, a red cape and a pointed tail', 7);

create type generation_state as enum ('awaiting_payment', 'paid', 'generating', 'ready', 'failed');
create table generations (
  id uuid primary key,
  wallet text not null references users (wallet),
  draft_id uuid not null,
  costume text not null references costumes (slug),
  original_path text not null,
  result_path text,
  state generation_state not null default 'awaiting_payment',
  fee_lamports bigint not null check (fee_lamports >= 0),
  attempts int not null default 0 check (attempts between 0 and 3),
  error text,
  metadata_key text,   -- the coin fields the cached metadata_uri was made for
  metadata_uri text,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index generations_wallet_created_idx on generations (wallet, created_at desc);

create table costume_payments (
  signature text primary key check (signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
  generation_id uuid not null unique references generations (id),
  wallet text not null,
  lamports bigint not null,
  created_at timestamptz not null default now()
);

create type launch_state as enum ('pending', 'live', 'abandoned');
create table launches (
  mint text primary key check (mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  wallet text not null references users (wallet),
  generation_id uuid not null references generations (id),
  name text not null,
  ticker text not null,
  description text not null default '',
  twitter text,
  telegram text,
  dev_buy_lamports bigint not null default 0,
  metadata_uri text not null,
  launch_fee_lamports bigint not null,
  create_signature text unique,
  state launch_state not null default 'pending',
  created_at timestamptz not null default now(),
  launched_at timestamptz
);
create unique index launches_one_live_per_generation on launches (generation_id) where state = 'live';
create index launches_live_idx on launches (launched_at desc) where state = 'live';

create table admin_log (
  id bigint generated always as identity primary key,
  admin_wallet text not null,
  action text not null,
  payload jsonb not null default '{}',
  at timestamptz not null default now()
);

-- public, unguessable paths: art/originals/<uuid>.<ext> and art/costumes/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('art', 'art', true, 8388608, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ===== wallet sign-up =====
-- A Supabase "Sign in with Web3" (Solana) user gets its SpookPad row. raw_user_meta_data is client-writable, so it is
-- trusted only when raw_app_meta_data.provider = 'web3' (set server-side by Supabase's Web3 provider).
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sub text := new.raw_user_meta_data ->> 'sub';
  claim_addr text := new.raw_user_meta_data -> 'custom_claims' ->> 'address';
  w text;
begin
  if new.raw_app_meta_data ->> 'provider' = 'web3' and sub like 'web3:solana:%' then
    w := substring(sub from 13);
    if (claim_addr is null or claim_addr = w) and w ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
      insert into public.users (id, wallet) values (new.id, w) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ===== costume generations =====
create or replace function public.start_generation(p_id uuid, p_wallet text, p_draft uuid, p_costume text, p_original_path text)
returns generations language plpgsql security definer set search_path = public as $$
declare s settings; g generations;
begin
  select * into s from settings;
  if s.generations_paused then raise exception 'paused'; end if;
  if not exists (select 1 from costumes where slug = p_costume and enabled) then raise exception 'bad_costume'; end if;
  if (select count(*) from generations where wallet = p_wallet and created_at > now() - interval '1 hour') >= s.max_generations_per_hour then
    raise exception 'rate_limited';
  end if;
  insert into generations (id, wallet, draft_id, costume, original_path, fee_lamports, state)
  values (p_id, p_wallet, p_draft, p_costume, p_original_path, s.costume_fee_lamports,
          case when s.costume_fee_lamports = 0 then 'paid'::generation_state else 'awaiting_payment'::generation_state end)
  returning * into g;
  return g;
end $$;

-- Records a verified fee payment and marks the costume paid, in one transaction.
create or replace function public.claim_payment(p_signature text, p_generation uuid, p_wallet text, p_lamports bigint)
returns generations language plpgsql security definer set search_path = public as $$
declare g generations;
begin
  select * into g from generations where id = p_generation for update;
  if not found or g.wallet <> p_wallet then raise exception 'not_found'; end if;
  if g.state <> 'awaiting_payment' then raise exception 'not_awaiting'; end if;
  begin
    insert into costume_payments (signature, generation_id, wallet, lamports) values (p_signature, p_generation, p_wallet, p_lamports);
  exception when unique_violation then
    raise exception 'payment_used';
  end;
  update generations set state = 'paid', updated_at = now() where id = p_generation returning * into g;
  return g;
end $$;

-- One AI attempt starts. A 'generating' row untouched for 3 minutes (the function died) may be taken over.
create or replace function public.begin_attempt(p_generation uuid, p_wallet text)
returns generations language plpgsql security definer set search_path = public as $$
declare g generations;
begin
  select * into g from generations where id = p_generation for update;
  if not found or g.wallet <> p_wallet then raise exception 'not_found'; end if;
  if not (g.state = 'paid' or (g.state = 'generating' and g.updated_at < now() - interval '3 minutes')) then
    raise exception 'not_paid';
  end if;
  if g.attempts >= 3 then raise exception 'no_attempts'; end if;
  update generations set state = 'generating', attempts = attempts + 1, error = null, updated_at = now()
  where id = p_generation returning * into g;
  return g;
end $$;

create or replace function public.finish_attempt(p_generation uuid, p_result_path text, p_error text)
returns generations language plpgsql security definer set search_path = public as $$
declare g generations;
begin
  update generations set
    state = case when p_result_path is not null then 'ready'::generation_state
                 when attempts >= 3 then 'failed'::generation_state
                 else 'paid'::generation_state end,
    result_path = coalesce(p_result_path, result_path),
    error = p_error,
    updated_at = now()
  where id = p_generation and state = 'generating'
  returning * into g;
  if not found then raise exception 'not_generating'; end if;
  return g;
end $$;

-- ===== launches =====
create or replace function public.begin_launch(
  p_mint text, p_wallet text, p_generation uuid, p_name text, p_ticker text, p_description text, p_twitter text,
  p_telegram text, p_dev_buy bigint, p_metadata_uri text, p_launch_fee bigint)
returns launches language plpgsql security definer set search_path = public as $$
declare s settings; g generations; l launches;
begin
  select * into s from settings;
  if s.launches_paused then raise exception 'paused'; end if;
  select * into g from generations where id = p_generation for update;
  if not found or g.wallet <> p_wallet then raise exception 'not_found'; end if;
  if g.state <> 'ready' then raise exception 'not_ready'; end if;
  if exists (select 1 from launches where generation_id = p_generation and state = 'live') then raise exception 'already_launched'; end if;
  update launches set state = 'abandoned' where generation_id = p_generation and state = 'pending';
  begin
    insert into launches (mint, wallet, generation_id, name, ticker, description, twitter, telegram, dev_buy_lamports,
                          metadata_uri, launch_fee_lamports)
    values (p_mint, p_wallet, p_generation, p_name, p_ticker, p_description, p_twitter, p_telegram, p_dev_buy,
            p_metadata_uri, p_launch_fee)
    returning * into l;
  exception when unique_violation then
    raise exception 'mint_used';
  end;
  return l;
end $$;

create or replace function public.confirm_launch(p_mint text, p_wallet text, p_signature text)
returns launches language plpgsql security definer set search_path = public as $$
declare l launches;
begin
  select * into l from launches where mint = p_mint for update;
  if not found or l.wallet <> p_wallet then raise exception 'not_found'; end if;
  if l.state = 'live' then return l; end if;
  if exists (select 1 from launches where generation_id = l.generation_id and state = 'live') then raise exception 'already_launched'; end if;
  update launches set state = 'abandoned' where generation_id = l.generation_id and state = 'pending' and mint <> p_mint;
  update launches set state = 'live', create_signature = p_signature, launched_at = now() where mint = p_mint returning * into l;
  return l;
end $$;

-- ===== settings, admin =====
create or replace function public.pause_for_low_credit() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update settings set generations_paused = true, pause_reason = 'low_credit', updated_at = now() where id and not generations_paused;
  return found;
end $$;

create or replace function public.admin_update_settings(p_changes jsonb, p_admin text) returns settings
language plpgsql security definer set search_path = public as $$
declare k text; nxt settings;
begin
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('costume_fee_lamports', 'launch_fee_lamports', 'max_dev_buy_lamports', 'max_generations_per_hour',
                 'min_ai_credit_usd', 'generations_paused', 'launches_paused', 'pause_reason') then
      raise exception 'unknown setting: %', k;
    end if;
  end loop;
  update settings s set
    costume_fee_lamports = coalesce((p_changes ->> 'costume_fee_lamports')::bigint, s.costume_fee_lamports),
    launch_fee_lamports = coalesce((p_changes ->> 'launch_fee_lamports')::bigint, s.launch_fee_lamports),
    max_dev_buy_lamports = coalesce((p_changes ->> 'max_dev_buy_lamports')::bigint, s.max_dev_buy_lamports),
    max_generations_per_hour = coalesce((p_changes ->> 'max_generations_per_hour')::int, s.max_generations_per_hour),
    min_ai_credit_usd = coalesce((p_changes ->> 'min_ai_credit_usd')::numeric, s.min_ai_credit_usd),
    generations_paused = coalesce((p_changes ->> 'generations_paused')::boolean, s.generations_paused),
    launches_paused = coalesce((p_changes ->> 'launches_paused')::boolean, s.launches_paused),
    pause_reason = case when p_changes ? 'pause_reason' then p_changes ->> 'pause_reason' else s.pause_reason end,
    updated_at = now()
  where s.id
  returning * into nxt;
  insert into admin_log (admin_wallet, action, payload) values (p_admin, 'settings.update', p_changes);
  return nxt;
end $$;

create or replace function public.admin_update_costume(p_slug text, p_changes jsonb, p_admin text) returns costumes
language plpgsql security definer set search_path = public as $$
declare c costumes;
begin
  update costumes set
    label = coalesce(p_changes ->> 'label', label),
    emoji = coalesce(p_changes ->> 'emoji', emoji),
    prompt = coalesce(p_changes ->> 'prompt', prompt),
    enabled = coalesce((p_changes ->> 'enabled')::boolean, enabled)
  where slug = p_slug
  returning * into c;
  if not found then raise exception 'not_found'; end if;
  insert into admin_log (admin_wallet, action, payload) values (p_admin, 'costume.update', jsonb_build_object('slug', p_slug) || p_changes);
  return c;
end $$;

create or replace function public.admin_mark_refunded(p_generation uuid, p_admin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update generations set refunded_at = now(), updated_at = now()
  where id = p_generation and state = 'failed' and refunded_at is null;
  if not found then raise exception 'not_refundable'; end if;
  insert into admin_log (admin_wallet, action, payload) values (p_admin, 'generation.refunded', jsonb_build_object('id', p_generation));
end $$;

create or replace function public.admin_overview() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'generations_24h', (select count(*) from generations where created_at > now() - interval '24 hours'),
    'ready_24h', (select count(*) from generations where state = 'ready' and updated_at > now() - interval '24 hours'),
    'launches_24h', (select count(*) from launches where state = 'live' and launched_at > now() - interval '24 hours'),
    'live_launches', (select count(*) from launches where state = 'live'),
    'failed_unrefunded', (select count(*) from generations where state = 'failed' and refunded_at is null),
    'costume_fees_lamports', (select coalesce(sum(lamports), 0) from costume_payments),
    'launch_fees_lamports', (select coalesce(sum(launch_fee_lamports), 0) from launches where state = 'live')
  )
$$;

-- ===== views =====
-- Views run with their owner's rights so they can read the locked tables; they select public columns only.
-- (Supabase's Security Advisor flags owner-rights views; that warning is expected.)
create view v_settings_public as
  select costume_fee_lamports, launch_fee_lamports, max_dev_buy_lamports, generations_paused, launches_paused, pause_reason
  from settings;

create view v_costumes as
  select slug, label, emoji, sort from costumes where enabled order by sort;

create view v_graveyard as
  select l.mint, l.name, l.ticker, l.description, l.twitter, l.telegram, l.wallet, l.launched_at,
         g.costume, g.original_path, g.result_path
  from launches l join generations g on g.id = l.generation_id
  where l.state = 'live';

create view v_my_generations as
  select g.id, g.draft_id, g.costume, g.state, g.original_path, g.result_path, g.error, g.attempts, g.fee_lamports, g.created_at,
         exists (select 1 from launches l where l.generation_id = g.id and l.state = 'live') as launched
  from generations g join users u on u.wallet = g.wallet
  where u.id = auth.uid();

-- ===== lock-down (repeat at the end of every migration) =====
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
-- ===== end lock-down =====

grant select on v_settings_public, v_costumes, v_graveyard to anon, authenticated;
grant select on v_my_generations to authenticated;
grant execute on function
  public.start_generation(uuid, text, uuid, text, text),
  public.claim_payment(text, uuid, text, bigint),
  public.begin_attempt(uuid, text),
  public.finish_attempt(uuid, text, text),
  public.begin_launch(text, text, uuid, text, text, text, text, text, bigint, text, bigint),
  public.confirm_launch(text, text, text),
  public.pause_for_low_credit(),
  public.admin_update_settings(jsonb, text),
  public.admin_update_costume(text, jsonb, text),
  public.admin_mark_refunded(uuid, text),
  public.admin_overview()
to service_role;
