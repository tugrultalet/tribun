-- Grup kapsamı: 1–3 takım ({"type":"teams","ids":[645,611]}). Arkadaş grupları artık lige göre değil takıma göre kurulur;
-- turnuva kapsamı ({"type":"leagues"}) açık ligler ve eski gruplar için sürer. Kapsamsız eski gruplar = grubun takımı.
alter table public.groups drop constraint if exists groups_scope_check;
alter table public.groups add constraint groups_scope_check check (
  scope is null or (
    jsonb_typeof(scope) = 'object' and jsonb_typeof(scope->'ids') = 'array' and (
      (scope->>'type' = 'leagues' and jsonb_array_length(scope->'ids') between 1 and 5)
      or (scope->>'type' = 'teams' and jsonb_array_length(scope->'ids') between 1 and 3)))
);

create or replace function public.league_table(p_secret text, p_group uuid, p_period text default 'week')
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); g groups; v_from timestamptz; v_ids bigint[]; v_teams bigint[];
begin
  perform _require_member(v_me, p_group);
  select * into g from groups where id = p_group;
  v_from := case when p_period = 'season'
    then make_timestamptz(extract(year from now() at time zone 'Europe/Istanbul')::int - case when extract(month from now() at time zone 'Europe/Istanbul') < 7 then 1 else 0 end, 7, 1, 0, 0, 0, 'Europe/Istanbul')
    else _week(now())::timestamp at time zone 'Europe/Istanbul' end;
  if g.scope ->> 'type' = 'leagues' then select array_agg(x::bigint) into v_ids from jsonb_array_elements_text(g.scope -> 'ids') x; end if;
  v_teams := case when g.scope ->> 'type' = 'teams' then (select array_agg(x::bigint) from jsonb_array_elements_text(g.scope -> 'ids') x) else array[g.team_id] end;
  return (
    with s as (
      select t.profile_id, sum(t.total)::int as pts, count(*) filter (where t.outcome = 'exact')::int as exact
      from points t join members m on m.profile_id = t.profile_id and m.group_id = p_group
      join matches x on x.id = t.match_id
      where t.kickoff >= v_from
        and (case when v_ids is not null then x.league = any (v_ids) else (x.home_id = any (v_teams) or x.away_id = any (v_teams)) end)
      group by t.profile_id),
    r as (select s.*, rank() over (order by pts desc, exact desc) as rk, p.name from s join profiles p on p.id = s.profile_id)
    select json_build_object(
      'members', (select count(*) from members where group_id = p_group),
      'active', (select count(*) from s),
      'top', coalesce((select json_agg(json_build_object('rank', rk, 'name', name, 'points', pts, 'exact', exact, 'me', profile_id = v_me) order by rk, name)
                       from (select * from r order by rk, name limit 10) y), '[]'::json),
      'me', (select json_build_object('rank', rk, 'points', pts, 'exact', exact) from r where profile_id = v_me)));
end $$;
