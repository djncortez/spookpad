-- SpookPad's own token for the home page's hero: the admin sets it on the admin page (null hides it).

alter table settings add column site_ca text check (site_ca is null or site_ca ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

create or replace function public.admin_update_settings(p_changes jsonb, p_admin text) returns settings
language plpgsql security definer set search_path = public as $$
declare k text; nxt settings;
begin
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('costume_fee_lamports', 'launch_fee_lamports', 'max_dev_buy_lamports', 'max_generations_per_hour',
                 'min_ai_credit_usd', 'generations_paused', 'launches_paused', 'pause_reason', 'site_ca') then
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
    site_ca = case when p_changes ? 'site_ca' then p_changes ->> 'site_ca' else s.site_ca end,
    updated_at = now()
  where s.id
  returning * into nxt;
  insert into admin_log (admin_wallet, action, payload) values (p_admin, 'settings.update', p_changes);
  return nxt;
end $$;

-- a new column goes at the end, so the view can be replaced in place
create or replace view v_settings_public as
  select costume_fee_lamports, launch_fee_lamports, max_dev_buy_lamports, generations_paused, launches_paused, pause_reason, site_ca
  from settings;

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

grant select on v_settings_public, v_costumes, v_graveyard, v_stats to anon, authenticated;
grant select on v_my_generations to authenticated;
