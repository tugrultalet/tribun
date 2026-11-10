-- Açık ligler: herkese açık bağlantıyla katılınan büyük gruplar. Sıralama sunucuda (ilk 10 + senin sıran), üyeler sohbet
-- edemez (yalnızca kurucunun duyuruları ve maç olayları). Doğrulanmış kurucu rozeti yalnızca veritabanından verilir
-- (groups.verified). Her bağlantıdan gelen kişi bir kez ve kalıcı sayılır: kurucu "Bu linkle gelen: X kişi"yi görür.
-- Para/ödül yok. Açık lig üyeleri birbirinin profilini, tahminini görmez; tahmin isteği bildirimi açık lige gitmez.

alter table public.groups add column if not exists kind text not null default 'friends' check (kind in ('friends', 'open'));
alter table public.groups add column if not exists verified boolean not null default false;

-- Takım kapsamlı açık lig sıralaması için maçın takımları.
alter table public.matches add column if not exists home_id bigint;
alter table public.matches add column if not exists away_id bigint;

create table if not exists public.group_arrivals (
  group_id uuid not null references public.groups (id) on delete cascade,
  device text not null,                 -- cihaz sırrının özeti (aynı cihaz bir kez sayılır)
  created_at timestamptz not null default now(),
  primary key (group_id, device)
);
alter table public.group_arrivals enable row level security;

-- Ortak arkadaş grubum olan kişiler (açık ligler sayılmaz).
create or replace function public._friends_of(p_me uuid) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct m2.profile_id from members m1 join groups g on g.id = m1.group_id and g.kind = 'friends'
  join members m2 on m2.group_id = m1.group_id where m1.profile_id = p_me and m2.profile_id <> p_me
$$;

create or replace function public._group_json(p_group uuid) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'id', g.id, 'name', g.name, 'code', g.code, 'kind', g.kind, 'verified', g.verified,
    'team', json_build_object('id', g.team_id, 'name', g.team_name, 'logo', g.team_logo),
    'scope', g.scope,
    'members', (select count(*) from members m where m.group_id = g.id),
    'last_message', (
      select json_build_object('body', x.body, 'name', p.name, 'created_at', x.created_at)
      from messages x join profiles p on p.id = x.profile_id
      where x.group_id = g.id and x.match_id is null order by x.id desc limit 1)
  ) from groups g where g.id = p_group
$$;

drop function if exists public.create_group(text, text, bigint, text, text, jsonb);
create or replace function public.create_group(p_secret text, p_name text, p_team_id bigint, p_team_name text, p_team_logo text,
  p_scope jsonb default null, p_kind text default 'friends') returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_name text := btrim(coalesce(p_name, '')); v_code text; v_id uuid; v_kind text := coalesce(p_kind, 'friends');
begin
  if char_length(v_name) not between 1 and 40 then raise exception 'Grup adı 1-40 karakter olmalı.' using errcode = 'P0001'; end if;
  if v_kind not in ('friends', 'open') then raise exception 'Geçersiz grup türü.' using errcode = 'P0001'; end if;
  if (select count(*) from groups where owner = v_me) >= 20 then raise exception 'En fazla 20 grup kurabilirsin.' using errcode = 'P0001'; end if;
  if v_kind = 'open' then
    if (select auth_user from profiles where id = v_me) is null then raise exception 'Açık lig kurmak için hesabını bağla.' using errcode = 'P0001'; end if;
    if (select count(*) from groups where owner = v_me and kind = 'open') >= 3 then raise exception 'En fazla 3 açık lig kurabilirsin.' using errcode = 'P0001'; end if;
  end if;
  perform _rate('grp:ip:' || _client_ip(), 10, interval '1 hour');
  loop
    v_code := _short_code(6);
    exit when not exists (select 1 from groups where code = v_code);
  end loop;
  insert into groups (name, team_id, team_name, team_logo, code, owner, scope, kind)
  values (v_name, p_team_id, p_team_name, p_team_logo, v_code, v_me, p_scope, v_kind) returning id into v_id;
  insert into members (group_id, profile_id) values (v_id, v_me);
  return _group_json(v_id);
end $$;

create or replace function public.join_group(p_secret text, p_code text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); g groups;
begin
  perform _rate('join:' || v_me, 10, interval '10 minutes');
  perform _rate('join:ip:' || _client_ip(), 30, interval '10 minutes');
  select * into g from groups where code = upper(btrim(coalesce(p_code, '')));
  if g.id is null then return json_build_object('error', 'Bu kodla bir grup bulunamadı.'); end if;
  if not exists (select 1 from members where group_id = g.id and profile_id = v_me) then
    if (select count(*) from members where group_id = g.id) >= (case when g.kind = 'open' then 100000 else 50 end) then
      return json_build_object('error', 'Bu grup dolu.');
    end if;
    insert into members (group_id, profile_id) values (g.id, v_me);
    -- Bu bağlantıdan gelen cihaz bir kez ve kalıcı sayılır (çıkıp yeniden girse de).
    insert into group_arrivals (group_id, device) values (g.id, _hash(p_secret)) on conflict do nothing;
  end if;
  return _group_json(g.id);
end $$;

-- Açık ligde yalnızca kurucu yazar (duyuru); maç odası yoktur.
create or replace function public.send_message(p_secret text, p_group uuid, p_body text, p_match bigint default null,
  p_kickoff timestamptz default null, p_home text default null, p_away text default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_body text := btrim(coalesce(p_body, '')); v_id bigint; v_kick timestamptz; g groups;
begin
  perform _require_member(v_me, p_group);
  select * into g from groups where id = p_group;
  if g.kind = 'open' and (p_match is not null or g.owner <> v_me) then
    raise exception 'Açık ligde yalnızca kurucu duyuru yazabilir.' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 500 then raise exception 'Mesaj 1-500 karakter olmalı.' using errcode = 'P0001'; end if;
  perform _rate('msg:' || v_me, 20, interval '1 minute');
  if p_match is not null then
    select kickoff into v_kick from rooms where group_id = p_group and match_id = p_match;
    if v_kick is null then
      v_kick := coalesce((select kickoff from matches where id = p_match), p_kickoff);
      if v_kick is null or v_kick < now() - interval '3 hours' or v_kick > now() + interval '1 hour' then
        raise exception 'Bu maçın odası açık değil.' using errcode = 'P0001';
      end if;
      insert into rooms (group_id, match_id, kickoff, home, away)
      values (p_group, p_match, v_kick, left(btrim(coalesce(p_home, '')), 40), left(btrim(coalesce(p_away, '')), 40))
      on conflict do nothing;
    end if;
    if _room_state(p_match, v_kick) <> 'open' then raise exception 'Oda kapandı; mesajlar 30 gün okunabilir.' using errcode = 'P0001'; end if;
  end if;
  insert into messages (group_id, profile_id, body, match_id) values (p_group, v_me, v_body, p_match) returning id into v_id;
  return json_build_object('id', v_id);
end $$;

-- Grup ayrıntısı: açık ligde üye listesi ve başkalarının tahminleri gelmez (yalnızca benimkiler); kurucuya gelen sayısı.
create or replace function public.group_detail(p_secret text, p_group uuid, p_matches bigint[] default null) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); g groups; v_open boolean;
begin
  perform _require_member(v_me, p_group);
  select * into g from groups where id = p_group;
  v_open := g.kind = 'open';
  return json_build_object(
    'group', _group_json(p_group),
    'me', v_me,
    'owner', g.owner = v_me,
    'arrivals', case when g.owner = v_me then (select count(*) from group_arrivals where group_id = p_group) end,
    'members', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name) order by m.joined_at), '[]'::json)
                from members m join profiles p on p.id = m.profile_id where m.group_id = p_group and (not v_open or m.profile_id = v_me)),
    'predictions', (select coalesce(json_agg(json_build_object('profile_id', x.profile_id, 'match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at, 'joker', x.joker)), '[]'::json)
                    from (select k.* from picks k join members m on m.profile_id = k.profile_id and m.group_id = p_group
                          where (not v_open or k.profile_id = v_me)
                            and (k.profile_id = v_me or k.kickoff is null or k.kickoff <= now())
                            and (case when p_matches is null then k.updated_at > now() - interval '60 days' else k.match_id = any (p_matches) end)
                          limit 4000) x),
    'points', (select coalesce(json_agg(json_build_object('profile_id', x.profile_id, 'match_id', x.match_id, 'total', x.total, 'outcome', x.outcome)), '[]'::json)
               from (select t.* from points t join members m on m.profile_id = t.profile_id and m.group_id = p_group
                     where (not v_open or t.profile_id = v_me)
                       and (case when p_matches is null then t.kickoff > now() - interval '60 days' else t.match_id = any (p_matches) end)
                     limit 4000) x),
    'pending', (select coalesce(json_agg(json_build_object('profile_id', x.profile_id, 'match_id', x.match_id)), '[]'::json)
                from (select k.profile_id, k.match_id from picks k join members m on m.profile_id = k.profile_id and m.group_id = p_group
                      where not v_open and k.profile_id <> v_me and k.kickoff > now()
                        and (case when p_matches is null then k.updated_at > now() - interval '60 days' else k.match_id = any (p_matches) end)
                      limit 4000) x));
end $$;

-- Lig sıralaması (açık lig): kapsamdaki maçların defter puanları, hafta ya da sezon; ilk 10 ve benim sıram.
create or replace function public.league_table(p_secret text, p_group uuid, p_period text default 'week') returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); g groups; v_from timestamptz; v_ids bigint[];
begin
  perform _require_member(v_me, p_group);
  select * into g from groups where id = p_group;
  v_from := case when p_period = 'season'
    then make_timestamptz(extract(year from now() at time zone 'Europe/Istanbul')::int - case when extract(month from now() at time zone 'Europe/Istanbul') < 7 then 1 else 0 end, 7, 1, 0, 0, 0, 'Europe/Istanbul')
    else _week(now())::timestamp at time zone 'Europe/Istanbul' end;
  if g.scope ->> 'type' = 'leagues' then select array_agg(x::bigint) into v_ids from jsonb_array_elements_text(g.scope -> 'ids') x; end if;
  return (
    with s as (
      select t.profile_id, sum(t.total)::int as pts, count(*) filter (where t.outcome = 'exact')::int as exact
      from points t join members m on m.profile_id = t.profile_id and m.group_id = p_group
      join matches x on x.id = t.match_id
      where t.kickoff >= v_from
        and (case when v_ids is not null then x.league = any (v_ids) else g.team_id in (x.home_id, x.away_id) end)
      group by t.profile_id),
    r as (select s.*, rank() over (order by pts desc, exact desc) as rk, p.name from s join profiles p on p.id = s.profile_id)
    select json_build_object(
      'members', (select count(*) from members where group_id = p_group),
      'active', (select count(*) from s),
      'top', coalesce((select json_agg(json_build_object('rank', rk, 'name', name, 'points', pts, 'exact', exact, 'me', profile_id = v_me) order by rk, name)
                       from (select * from r order by rk, name limit 10) y), '[]'::json),
      'me', (select json_build_object('rank', rk, 'points', pts, 'exact', exact) from r where profile_id = v_me)));
end $$;

-- Sunucu maç bilgisine takım numaralarını da yazar.
create or replace function public.server_sync_matches(p_rows jsonb) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; v_scored int := 0; v_prev matches;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    select * into v_prev from matches where id = (r->>'id')::bigint;
    insert into matches (id, kickoff, status, home_goals, away_goals, home, away, league, home_id, away_id, updated_at)
    values ((r->>'id')::bigint, (r->>'kickoff')::timestamptz, r->>'status', (r->>'h')::int, (r->>'a')::int, r->>'home', r->>'away', (r->>'league')::int,
            (r->>'home_id')::bigint, (r->>'away_id')::bigint, now())
    on conflict (id) do update set kickoff = excluded.kickoff, status = excluded.status, home_goals = excluded.home_goals,
      away_goals = excluded.away_goals, home = excluded.home, away = excluded.away, league = excluded.league,
      home_id = coalesce(excluded.home_id, matches.home_id), away_id = coalesce(excluded.away_id, matches.away_id), updated_at = now();
    if r->>'status' = 'ns' then
      update picks set kickoff = (r->>'kickoff')::timestamptz where match_id = (r->>'id')::bigint and kickoff is distinct from (r->>'kickoff')::timestamptz;
    end if;
    if r->>'status' = 'ft' and (v_prev.id is null or v_prev.scored_at is null or v_prev.home_goals is distinct from (r->>'h')::int or v_prev.away_goals is distinct from (r->>'a')::int) then
      perform _score_match((r->>'id')::bigint);
      v_scored := v_scored + 1;
    end if;
  end loop;
  return json_build_object('scored', v_scored);
end $$;

-- Arkadaş görünürlüğü yalnızca arkadaş gruplarından: maçtaki tahminler, üye profili, puan defteri.
create or replace function public.match_picks(p_secret text, p_match bigint) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  return (
    with friends as (select f as profile_id from _friends_of(v_me) f)
    select json_build_object(
      'revealed', coalesce((select json_agg(json_build_object('profile_id', k.profile_id, 'name', p.name, 'h', k.home_goals, 'a', k.away_goals, 'updated_at', k.updated_at) order by p.name)
                  from picks k join friends f on f.profile_id = k.profile_id join profiles p on p.id = k.profile_id
                  where k.match_id = p_match and (k.kickoff is null or k.kickoff <= now())), '[]'::json),
      'pending', (select count(*)::int from picks k join friends f on f.profile_id = k.profile_id
                  where k.match_id = p_match and k.kickoff > now())));
end $$;

create or replace function public.member_profile(p_secret text, p_profile uuid) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  if p_profile <> v_me and not exists (select 1 from _friends_of(v_me) f where f = p_profile) then
    return json_build_object('error', 'Bu profili yalnızca ortak gruptaki üyeler görebilir.');
  end if;
  return json_build_object(
    'name', (select name from profiles where id = p_profile),
    'picks', coalesce((
      select json_agg(json_build_object('match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at, 'kickoff', x.kickoff) order by x.kickoff desc)
      from (select * from picks where profile_id = p_profile and kickoff is not null and kickoff <= now() order by kickoff desc limit 500) x), '[]'::json));
end $$;

create or replace function public.points_of(p_secret text, p_profile uuid default null) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_who uuid := coalesce(p_profile, v_me);
begin
  if v_who <> v_me and not exists (select 1 from _friends_of(v_me) f where f = v_who) then return '[]'::json; end if;
  return coalesce((select json_agg(json_build_object('match_id', match_id, 'total', total, 'base', base, 'bonus', bonus, 'joker', joker,
      'outcome', outcome, 'kickoff', kickoff, 'week', week) order by kickoff desc)
    from (select * from points where profile_id = v_who order by kickoff desc limit 1000) x), '[]'::json);
end $$;

-- Tahmin isteği bildirimi yalnızca arkadaş gruplarındaki üyelere.
create or replace function public.ask_friends(p_secret text, p_match bigint, p_show boolean, p_home text, p_away text, p_group uuid default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_pick picks; v_kick timestamptz; v_token text; v_name text; v_n int := 0; v_body text;
begin
  select * into v_pick from picks where profile_id = v_me and match_id = p_match;
  if v_pick.profile_id is null then raise exception 'Önce kendi tahminini gir.' using errcode = 'P0001'; end if;
  v_kick := coalesce((select kickoff from matches where id = p_match), v_pick.kickoff);
  if v_kick is null or now() >= v_kick then raise exception 'Maç başladı.' using errcode = 'P0001'; end if;
  if p_group is not null and not exists (select 1 from members where group_id = p_group and profile_id = v_me) then
    raise exception 'Bu grubun üyesi değilsin.' using errcode = 'P0001';
  end if;
  select token into v_token from asks where sender = v_me and match_id = p_match;
  if v_token is not null then
    update asks set show_pick = coalesce(p_show, true), group_id = coalesce(p_group, group_id) where token = v_token;
    return json_build_object('token', v_token, 'notified', 0, 'again', true);
  end if;
  perform _rate('ask:' || v_me::text, 30, interval '1 day');
  v_token := _short_code(8);
  insert into asks (token, sender, match_id, show_pick, group_id, home, away)
  values (v_token, v_me, p_match, coalesce(p_show, true), p_group, left(btrim(coalesce(p_home, '')), 40), left(btrim(coalesce(p_away, '')), 40));
  select name into v_name from profiles where id = v_me;
  v_body := case when coalesce(p_show, true)
    then format('%s %s–%s için %s–%s dedi. Sen ne diyorsun?', v_name, p_home, p_away, v_pick.home_goals, v_pick.away_goals)
    else format('%s %s–%s için tahmin yaptı. Sen ne diyorsun?', v_name, p_home, p_away) end;
  insert into push_queue (profile_id, title, body, match_id)
  select f, 'Tahmin isteği', left(v_body, 180), p_match from _friends_of(v_me) f
  where not exists (select 1 from picks k where k.profile_id = f and k.match_id = p_match);
  get diagnostics v_n = row_count;
  return json_build_object('token', v_token, 'notified', v_n, 'again', false);
end $$;

-- Keşfet: "Öne çıkan ligler" (doğrulanmış açık ligler, eşik aşılınca).
create or replace function public.explore(p_secret text default null) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := case when p_secret is null then null else _profile_or_null(p_secret) end;
  v_today date := (now() at time zone 'Europe/Istanbul')::date; v_week date := _week(now()); v_board json; v_fans json; v_team bigint; v_out jsonb := '{}'::jsonb; v_popular json; v_leagues json; v_nl int;
begin
  select json_agg(x order by x.n desc) into v_popular from (
    select m.id as match_id, m.home, m.away, m.kickoff, m.league, c.n, c.h, c.d, c.a
    from matches m cross join lateral (
      select count(*)::int as n, count(*) filter (where home_goals > away_goals)::int as h,
             count(*) filter (where home_goals = away_goals)::int as d, count(*) filter (where home_goals < away_goals)::int as a
      from picks k where k.match_id = m.id and k.updated_at < m.kickoff) c
    where (m.kickoff at time zone 'Europe/Istanbul')::date = v_today and m.status <> 'off' and c.n >= _setting('explore_min_picks', 20)
    order by c.n desc limit 5) x;
  if v_popular is not null then v_out := v_out || jsonb_build_object('popular', v_popular); end if;

  select count(*) into v_nl from groups where kind = 'open' and verified;
  if v_nl >= _setting('explore_min_open_leagues', 1) then
    select json_agg(y order by y.members desc) into v_leagues from (
      select g.id, g.name, g.code, g.team_name, g.team_logo, (select count(*) from members m where m.group_id = g.id) as members,
             exists (select 1 from members m where m.group_id = g.id and m.profile_id = v_me) as joined
      from groups g where g.kind = 'open' and g.verified order by members desc limit 5) y;
    v_out := v_out || jsonb_build_object('leagues', v_leagues);
  end if;

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
  return v_out::json;
end $$;

revoke all on function public._friends_of(uuid) from public, anon, authenticated;
revoke all on function public.create_group(text, text, bigint, text, text, jsonb, text), public.league_table(text, uuid, text) from public;
grant execute on function public.create_group(text, text, bigint, text, text, jsonb, text), public.league_table(text, uuid, text) to anon, authenticated;
