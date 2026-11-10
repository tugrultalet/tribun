-- Türkiye ve taraftar sıralamaları yalnızca hesaba (Apple / e-posta) bağlı profilleri sıralar: sahte/çoklu hesaplar
-- sıralamayı bozmasın. Bağlı olmayan kullanıcı kendi puanını görür ama sırası yoktur (rank null, linked false);
-- uygulama "Sıralamada görünmek için hesabını bağla" der.
create or replace function public._week_board(p_me uuid, p_week date, p_team bigint)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  with s as (
    select t.profile_id, sum(t.total)::int as pts, count(*) filter (where t.outcome = 'exact')::int as exact
    from points t join profiles p on p.id = t.profile_id
    where t.week = p_week and (p_team is null or p.main_team = p_team) and p.auth_user is not null
    group by t.profile_id),
  r as (select s.*, rank() over (order by pts desc, exact desc) as rk, p.name, p.hide_global from s join profiles p on p.id = s.profile_id),
  mine as (
    select sum(t.total)::int as pts from points t where t.profile_id = p_me and t.week = p_week)
  select json_build_object(
    'active', (select count(*) from s),
    'top', coalesce((select json_agg(json_build_object('rank', rk, 'name', name, 'points', pts, 'me', profile_id = p_me) order by rk, name)
                     from (select * from r where not hide_global or profile_id = p_me order by rk, name limit 10) x), '[]'::json),
    'me', case
      when exists (select 1 from r where profile_id = p_me) then (select json_build_object('rank', rk, 'points', pts, 'linked', true) from r where profile_id = p_me)
      when p_me is not null and (select auth_user from profiles where id = p_me) is null and (select pts from mine) is not null
        then json_build_object('rank', null, 'points', (select pts from mine), 'linked', false)
    end)
$$;
