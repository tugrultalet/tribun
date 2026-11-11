-- Arkadaş listesine kafa kafaya: ikinizin de tahmin yaptığı biten maçlarda kaç maçta sen, kaçında o daha çok puan aldı.
create or replace function public.my_friends(p_secret text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_week date := _week(now());
  v_season timestamptz := make_timestamptz(extract(year from now() at time zone 'Europe/Istanbul')::int - case when extract(month from now() at time zone 'Europe/Istanbul') < 7 then 1 else 0 end, 7, 1, 0, 0, 0, 'Europe/Istanbul');
begin
  return coalesce((
    with ids as (
      select case when f.a = v_me then f.b else f.a end as id, f.created_at from friends f where f.a = v_me or f.b = v_me
      union all select v_me, null)
    select json_agg(json_build_object('id', p.id, 'name', p.name, 'me', p.id = v_me, 'since', ids.created_at, 'team', p.main_team,
      'week', coalesce((select sum(t.total) from points t where t.profile_id = p.id and t.week = v_week), 0),
      'season', coalesce((select sum(t.total) from points t where t.profile_id = p.id and t.kickoff >= v_season), 0),
      'won', (select count(*) from points x join points y on y.match_id = x.match_id and y.profile_id = p.id where x.profile_id = v_me and p.id <> v_me and x.total > y.total),
      'lost', (select count(*) from points x join points y on y.match_id = x.match_id and y.profile_id = p.id where x.profile_id = v_me and p.id <> v_me and x.total < y.total))
      order by p.name)
    from ids join profiles p on p.id = ids.id), '[]'::json);
end $$;
