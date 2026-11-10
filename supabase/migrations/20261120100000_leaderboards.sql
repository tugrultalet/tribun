-- Sıralamalar ve Keşfet bölümleri: hepsi aynı puan defterinden (points). Keşfet bölümleri eşik aşılana kadar görünmez;
-- eşikler `settings` tablosundan değiştirilebilir (uygulama güncellemesi gerekmez).

create table if not exists public.settings (key text primary key, value numeric not null);
alter table public.settings enable row level security;
insert into public.settings (key, value) values
  ('explore_min_picks', 20),          -- "Bugün en çok tahmin edilenler": maç başına en az tahmin
  ('explore_min_open_leagues', 1),    -- "Öne çıkan ligler": en az doğrulanmış açık lig
  ('explore_min_week_active', 500),   -- "Haftanın en iyileri": bu hafta puan alan en az kişi
  ('explore_min_fan_active', 20)      -- taraftar sıralaması: bu hafta puan alan en az taraftar
on conflict (key) do nothing;

create or replace function public._setting(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from settings where key = p_key), p_default)
$$;

-- Taraftar sıralaması için ana takım (uygulama ana takım değişince bildirir).
alter table public.profiles add column if not exists main_team bigint;
create or replace function public.set_main_team(p_secret text, p_team bigint) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  update profiles set main_team = p_team where id = v_me;
  return json_build_object('ok', true);
end $$;

-- Grup ayrıntısı: puanlanmış maçlarda üyelerin defter puanları da gelir (sürpriz bonusu ve joker dahil).
create or replace function public.group_detail(p_secret text, p_group uuid, p_matches bigint[] default null) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  return json_build_object(
    'group', _group_json(p_group),
    'me', v_me,
    'members', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name) order by m.joined_at), '[]'::json)
                from members m join profiles p on p.id = m.profile_id where m.group_id = p_group),
    'predictions', (select coalesce(json_agg(json_build_object('profile_id', x.profile_id, 'match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at, 'joker', x.joker)), '[]'::json)
                    from (select k.* from picks k join members m on m.profile_id = k.profile_id and m.group_id = p_group
                          where (k.profile_id = v_me or k.kickoff is null or k.kickoff <= now())
                            and (case when p_matches is null then k.updated_at > now() - interval '60 days' else k.match_id = any (p_matches) end)
                          limit 4000) x),
    'points', (select coalesce(json_agg(json_build_object('profile_id', x.profile_id, 'match_id', x.match_id, 'total', x.total, 'outcome', x.outcome)), '[]'::json)
               from (select t.* from points t join members m on m.profile_id = t.profile_id and m.group_id = p_group
                     where (case when p_matches is null then t.kickoff > now() - interval '60 days' else t.match_id = any (p_matches) end)
                     limit 4000) x),
    'pending', (select coalesce(json_agg(json_build_object('profile_id', x.profile_id, 'match_id', x.match_id)), '[]'::json)
                from (select k.profile_id, k.match_id from picks k join members m on m.profile_id = k.profile_id and m.group_id = p_group
                      where k.profile_id <> v_me and k.kickoff > now()
                        and (case when p_matches is null then k.updated_at > now() - interval '60 days' else k.match_id = any (p_matches) end)
                      limit 4000) x));
end $$;

-- Haftalık sıralama (Türkiye geneli ya da bir takımın taraftarları): ilk 10 ve benim sıram. "Genel sıralamada görünme"
-- diyenler listede yer almaz (kendi sırasını yine görür).
create or replace function public._week_board(p_me uuid, p_week date, p_team bigint) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (
    select t.profile_id, sum(t.total)::int as pts, count(*) filter (where t.outcome = 'exact')::int as exact
    from points t join profiles p on p.id = t.profile_id
    where t.week = p_week and (p_team is null or p.main_team = p_team)
    group by t.profile_id),
  r as (select s.*, rank() over (order by pts desc, exact desc) as rk, p.name, p.hide_global from s join profiles p on p.id = s.profile_id)
  select json_build_object(
    'active', (select count(*) from s),
    'top', coalesce((select json_agg(json_build_object('rank', rk, 'name', name, 'points', pts, 'me', profile_id = p_me) order by rk, name)
                     from (select * from r where not hide_global or profile_id = p_me order by rk, name limit 10) x), '[]'::json),
    'me', (select json_build_object('rank', rk, 'points', pts) from r where profile_id = p_me))
$$;

-- Keşfet bölümleri: eşik aşılmadıysa bölüm hiç dönmez (uygulama göstermez).
create or replace function public.explore(p_secret text default null) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := case when p_secret is null then null else _profile_or_null(p_secret) end;
  v_today date := (now() at time zone 'Europe/Istanbul')::date; v_week date := _week(now()); v_board json; v_fans json; v_team bigint; v_out jsonb := '{}'::jsonb; v_popular json;
begin
  -- Bugün en çok tahmin edilen maçlar.
  select json_agg(x order by x.n desc) into v_popular from (
    select m.id as match_id, m.home, m.away, m.kickoff, m.league, c.n, c.h, c.d, c.a
    from matches m cross join lateral (
      select count(*)::int as n, count(*) filter (where home_goals > away_goals)::int as h,
             count(*) filter (where home_goals = away_goals)::int as d, count(*) filter (where home_goals < away_goals)::int as a
      from picks k where k.match_id = m.id and k.updated_at < m.kickoff) c
    where (m.kickoff at time zone 'Europe/Istanbul')::date = v_today and m.status <> 'off' and c.n >= _setting('explore_min_picks', 20)
    order by c.n desc limit 5) x;
  if v_popular is not null then v_out := v_out || jsonb_build_object('popular', v_popular); end if;

  -- Haftanın en iyileri (Türkiye) ve ana takımımın taraftarları.
  v_board := _week_board(v_me, v_week, null);
  if (v_board->>'active')::int >= _setting('explore_min_week_active', 500) then
    v_out := v_out || jsonb_build_object('week', v_board);
    select main_team into v_team from profiles where id = v_me;
    if v_team is not null then
      v_fans := _week_board(v_me, v_week, v_team);
      if (v_fans->>'active')::int >= _setting('explore_min_fan_active', 20) then
        v_out := v_out || jsonb_build_object('fans', v_fans::jsonb || jsonb_build_object('team', v_team));
      end if;
    end if;
  end if;
  -- "Öne çıkan ligler": açık ligler gelince (PR 8) doldurulur.
  return v_out::json;
end $$;

revoke all on function public._setting(text, numeric), public._week_board(uuid, date, bigint) from public, anon, authenticated;
revoke all on function public.set_main_team(text, bigint), public.explore(text) from public;
grant execute on function public.set_main_team(text, bigint), public.explore(text) to anon, authenticated;
