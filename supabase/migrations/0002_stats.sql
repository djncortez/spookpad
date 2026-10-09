-- Public counts for the home page's stats (redesign spec "Data"). Counts only: no wallets, no rows.
-- Like the other views it runs with its owner's rights, so it can count the locked tables.
create view v_stats as
  select (select count(*) from launches where state = 'live')::int as coins_launched,
         (select count(*) from generations where result_path is not null)::int as costumes_summoned;

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

-- The lock-down above also took back 0001's view grants (views count as tables): grant every browser view again.
grant select on v_settings_public, v_costumes, v_graveyard, v_stats to anon, authenticated;
grant select on v_my_generations to authenticated;
