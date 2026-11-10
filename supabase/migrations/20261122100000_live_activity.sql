-- Live Activity yayın kanalları (maç başına; sunucu yeniden başlasa da kaybolmasın) ve widget için grup sırası.

create table if not exists public.live_channels (
  match_id bigint primary key,
  channel text not null,
  env text not null check (env in ('development', 'production')),
  created_at timestamptz not null default now()
);
alter table public.live_channels enable row level security;

create or replace function public.server_live_channels() returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object('match_id', match_id, 'channel', channel, 'env', env)), '[]'::json)
  from live_channels where created_at > now() - interval '2 days'
$$;
create or replace function public.server_set_live_channel(p_match bigint, p_channel text, p_env text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into live_channels (match_id, channel, env) values (p_match, p_channel, p_env)
  on conflict (match_id) do update set channel = excluded.channel, env = excluded.env, created_at = now()
$$;
create or replace function public.server_drop_live_channel(p_match bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from live_channels where match_id = p_match
$$;

-- Widget: arkadaş gruplarımda bu haftaki sıram (defter puanlarıyla). En iyi sıradaki grup önce.
create or replace function public.my_group_ranks(p_secret text) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_week date := _week(now());
begin
  return coalesce((
    select json_agg(x order by x.rank, x.total desc) from (
      select g.name as "group", g.id,
             (select count(*) from members where group_id = g.id)::int as total,
             coalesce((select sum(t.total) from points t where t.profile_id = v_me and t.week = v_week), 0)::int as points,
             1 + (select count(*) from members m2
                  where m2.group_id = g.id and m2.profile_id <> v_me
                    and coalesce((select sum(t.total) from points t where t.profile_id = m2.profile_id and t.week = v_week), 0)
                      > coalesce((select sum(t.total) from points t where t.profile_id = v_me and t.week = v_week), 0))::int as rank
      from members m join groups g on g.id = m.group_id and g.kind = 'friends'
      where m.profile_id = v_me) x), '[]'::json);
end $$;

revoke all on function public.server_live_channels(), public.server_set_live_channel(bigint, text, text), public.server_drop_live_channel(bigint) from public, anon, authenticated;
grant execute on function public.server_live_channels(), public.server_set_live_channel(bigint, text, text), public.server_drop_live_channel(bigint) to service_role;
revoke all on function public.my_group_ranks(text) from public;
grant execute on function public.my_group_ranks(text) to anon, authenticated;
