-- Puanlama veritabanında: sunucu maç saatini ve sonucunu yazar (service role), puanlar burada hesaplanır ve kalıcı
-- defterde (points) tutulur. Kilit veritabanı saatiyle: maçın başlama saati sunucudan geldiyse o geçerlidir.
--
-- Puan: tam skor 3, doğru sonuç 1. Sürpriz bonusu +2: doğru 1/X/2'yi topluluğun %25'inden azı seçtiyse (başlama anındaki
-- tahminlerle). Joker: haftada (Pzt–Paz, Türkiye saati) bir maç, puanı ×2 (bonus dahil), maç başlayınca kilitlenir.

create table if not exists public.matches (
  id bigint primary key,
  kickoff timestamptz not null,
  status text not null check (status in ('ns', 'live', 'ft', 'off')),
  home_goals int, away_goals int,
  home text, away text, league int,
  dist_h int, dist_d int, dist_a int,      -- başlama anındaki tahmin dağılımı (puanlanınca yazılır)
  updated_at timestamptz not null default now(),
  scored_at timestamptz
);
alter table public.matches enable row level security;

alter table public.picks add column if not exists joker boolean not null default false;

create table if not exists public.points (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  match_id bigint not null,
  kickoff timestamptz not null,
  week date not null,
  base int not null,
  bonus int not null default 0,
  joker boolean not null default false,
  total int not null,
  outcome text not null check (outcome in ('exact', 'correct', 'miss')),
  created_at timestamptz not null default now(),
  primary key (profile_id, match_id)
);
create index if not exists points_week_idx on public.points (week);
create index if not exists points_match_idx on public.points (match_id);
alter table public.points enable row level security;

-- Türkiye saatiyle haftanın pazartesisi.
create or replace function public._week(ts timestamptz) returns date language sql immutable set search_path = public, pg_temp as $$
  select date_trunc('week', ts at time zone 'Europe/Istanbul')::date
$$;

-- Bir maçı puanlar (yeniden çağrılırsa skor düzeltmesini işler).
create or replace function public._score_match(p_match bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m matches; v_n int; v_h int; v_d int; v_a int; v_r int; v_same int;
begin
  select * into m from matches where id = p_match;
  if m.id is null or m.status <> 'ft' or m.home_goals is null then return; end if;
  v_r := sign(m.home_goals - m.away_goals);
  select count(*), count(*) filter (where home_goals > away_goals), count(*) filter (where home_goals = away_goals), count(*) filter (where home_goals < away_goals)
    into v_n, v_h, v_d, v_a
    from picks where match_id = p_match and updated_at < m.kickoff;
  v_same := case v_r when 1 then v_h when 0 then v_d else v_a end;
  insert into points (profile_id, match_id, kickoff, week, base, bonus, joker, total, outcome)
  select k.profile_id, p_match, m.kickoff, _week(m.kickoff), s.base, s.bonus, k.joker, (s.base + s.bonus) * (case when k.joker then 2 else 1 end),
         case when s.base = 3 then 'exact' when s.base = 1 then 'correct' else 'miss' end
  from picks k
  cross join lateral (select
    case when k.home_goals = m.home_goals and k.away_goals = m.away_goals then 3 when sign(k.home_goals - k.away_goals) = v_r then 1 else 0 end as base) b
  cross join lateral (select b.base, case when b.base > 0 and v_n > 0 and v_same::numeric / v_n < 0.25 then 2 else 0 end as bonus) s
  where k.match_id = p_match and k.updated_at < m.kickoff
  on conflict (profile_id, match_id) do update set kickoff = excluded.kickoff, week = excluded.week, base = excluded.base,
    bonus = excluded.bonus, joker = excluded.joker, total = excluded.total, outcome = excluded.outcome;
  update matches set dist_h = v_h, dist_d = v_d, dist_a = v_a, scored_at = now() where id = p_match;
end $$;

-- Sunucu: puanlanmamış tahminlerin maçları (son 7 gün ve gelecek).
create or replace function public.server_open_matches() returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(id), '[]'::json) from (
    select distinct k.match_id as id from picks k left join matches m on m.id = k.match_id
    where (m.id is null or m.scored_at is null) and coalesce(m.kickoff, k.kickoff, k.updated_at) > now() - interval '7 days'
    limit 400) x
$$;

-- Sunucu: maç saati/durum/skor yazar, biten maçları puanlar. p_rows: [{id, kickoff, status, h, a, home, away, league}]
create or replace function public.server_sync_matches(p_rows jsonb) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; v_scored int := 0; v_prev matches;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    select * into v_prev from matches where id = (r->>'id')::bigint;
    insert into matches (id, kickoff, status, home_goals, away_goals, home, away, league, updated_at)
    values ((r->>'id')::bigint, (r->>'kickoff')::timestamptz, r->>'status', (r->>'h')::int, (r->>'a')::int, r->>'home', r->>'away', (r->>'league')::int, now())
    on conflict (id) do update set kickoff = excluded.kickoff, status = excluded.status, home_goals = excluded.home_goals,
      away_goals = excluded.away_goals, home = excluded.home, away = excluded.away, league = excluded.league, updated_at = now();
    -- Başlamamış maçın saati değiştiyse tahminlerin kilidi de yeni saate göre olur.
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

-- Tahmin: maç saati sunucudan biliniyorsa kilit odur; bilinmiyorsa istemcinin bildirdiği (ilk tahminde sabitlenir).
create or replace function public.set_pick(p_secret text, p_match bigint, p_home int, p_away int, p_kickoff timestamptz default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_old timestamptz; v_exists boolean; v_kick timestamptz; m matches;
begin
  if p_home is null or p_away is null or p_home not between 0 and 20 or p_away not between 0 and 20 then
    raise exception 'Skor 0-20 arasında olmalı.' using errcode = 'P0001';
  end if;
  select * into m from matches where id = p_match;
  if m.status in ('live', 'ft') then raise exception 'Maç başladı, tahmin kapandı.' using errcode = 'P0001'; end if;
  if m.status = 'off' then raise exception 'Bu maç oynanmayacak.' using errcode = 'P0001'; end if;
  select kickoff, true into v_old, v_exists from picks where profile_id = v_me and match_id = p_match;
  v_kick := coalesce(m.kickoff, v_old, p_kickoff);
  if v_exists is null and m.id is null then
    if p_kickoff is null then raise exception 'Maç saati gerekli.' using errcode = 'P0001'; end if;
    if p_kickoff < now() - interval '3 hours' or p_kickoff > now() + interval '60 days' then
      raise exception 'Geçersiz maç saati.' using errcode = 'P0001';
    end if;
  end if;
  if v_kick is not null and now() >= v_kick then
    raise exception 'Maç başladı, tahmin kapandı.' using errcode = 'P0001';
  end if;
  insert into picks (profile_id, match_id, home_goals, away_goals, kickoff)
  values (v_me, p_match, p_home, p_away, v_kick)
  on conflict (profile_id, match_id)
  do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals, kickoff = excluded.kickoff, updated_at = now();
  return json_build_object('ok', true);
end $$;

-- Joker: haftada bir. Aynı haftada başka (henüz başlamamış) maçta joker varsa oradan alınır.
create or replace function public.set_joker(p_secret text, p_match bigint, p_on boolean) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_kick timestamptz; v_other record;
begin
  select coalesce(m.kickoff, k.kickoff) into v_kick from picks k left join matches m on m.id = k.match_id
  where k.profile_id = v_me and k.match_id = p_match;
  if v_kick is null then raise exception 'Önce skor tahminini gir.' using errcode = 'P0001'; end if;
  if now() >= v_kick then raise exception 'Maç başladı, joker kilitlendi.' using errcode = 'P0001'; end if;
  if coalesce(p_on, false) then
    select k.match_id, coalesce(m.kickoff, k.kickoff) as kick, coalesce(m.home || ' – ' || m.away, 'başka bir maç') as label into v_other
    from picks k left join matches m on m.id = k.match_id
    where k.profile_id = v_me and k.joker and k.match_id <> p_match and _week(coalesce(m.kickoff, k.kickoff)) = _week(v_kick);
    if v_other.match_id is not null then
      if now() >= v_other.kick then
        raise exception 'Bu haftanın jokerini % maçında kullandın.', v_other.label using errcode = 'P0001';
      end if;
      update picks set joker = false where profile_id = v_me and match_id = v_other.match_id;
    end if;
  end if;
  update picks set joker = coalesce(p_on, false) where profile_id = v_me and match_id = p_match;
  return json_build_object('ok', true, 'moved_from', v_other.match_id);
end $$;

-- Benim tahminlerim: joker bilgisiyle.
create or replace function public.my_picks(p_secret text) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  return coalesce((
    select json_agg(json_build_object('match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at, 'kickoff', x.kickoff, 'joker', x.joker) order by x.updated_at desc)
    from (select * from picks where profile_id = v_me order by updated_at desc limit 1000) x), '[]'::json);
end $$;

-- Puan defteri (kendim ya da ortak gruptaki biri): [{match_id, total, base, bonus, joker, outcome, kickoff, week}]
create or replace function public.points_of(p_secret text, p_profile uuid default null) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_who uuid := coalesce(p_profile, v_me);
begin
  if v_who <> v_me and not exists (select 1 from members a join members b on b.group_id = a.group_id where a.profile_id = v_me and b.profile_id = v_who) then
    return '[]'::json;
  end if;
  return coalesce((select json_agg(json_build_object('match_id', match_id, 'total', total, 'base', base, 'bonus', bonus, 'joker', joker,
      'outcome', outcome, 'kickoff', kickoff, 'week', week) order by kickoff desc)
    from (select * from points where profile_id = v_who order by kickoff desc limit 1000) x), '[]'::json);
end $$;

-- Topluluk yüzdesi: tahmin girene ya da maç başlayana kadar gizli. Tribün geneli en az 20 tahminle gösterilir.
-- Gruplar: her grubumda kaç üyenin hangi sonucu seçtiği.
create or replace function public.match_community(p_secret text, p_match bigint) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_kick timestamptz; v_started boolean; v_mine boolean; v_n int; v_h int; v_d int; v_a int;
begin
  select coalesce(m.kickoff, (select max(kickoff) from picks where match_id = p_match)), coalesce(m.status in ('live', 'ft'), false)
    into v_kick, v_started from (select 1) one left join matches m on m.id = p_match;
  v_started := v_started or (v_kick is not null and now() >= v_kick);
  v_mine := exists (select 1 from picks where profile_id = v_me and match_id = p_match);
  if not v_mine and not v_started then return json_build_object('hidden', true); end if;
  select count(*), count(*) filter (where home_goals > away_goals), count(*) filter (where home_goals = away_goals), count(*) filter (where home_goals < away_goals)
    into v_n, v_h, v_d, v_a
    from picks where match_id = p_match and (v_kick is null or updated_at < v_kick);
  return json_build_object(
    'hidden', false,
    'tribun', case when v_n >= 20 then json_build_object('n', v_n, 'h', v_h, 'd', v_d, 'a', v_a) end,
    'groups', coalesce((
      select json_agg(json_build_object('name', g.name, 'members', (select count(*) from members where group_id = g.id), 'n', c.n, 'h', c.h, 'd', c.d, 'a', c.a) order by g.name)
      from members me join groups g on g.id = me.group_id
      cross join lateral (
        select count(*) as n, count(*) filter (where k.home_goals > k.away_goals) as h, count(*) filter (where k.home_goals = k.away_goals) as d,
               count(*) filter (where k.home_goals < k.away_goals) as a
        from members x join picks k on k.profile_id = x.profile_id and k.match_id = p_match
        where x.group_id = g.id and (v_kick is null or k.updated_at < v_kick)) c
      where me.profile_id = v_me and c.n > 0), '[]'::json));
end $$;

revoke all on function public._week(timestamptz), public._score_match(bigint) from public, anon, authenticated;
revoke all on function public.server_open_matches(), public.server_sync_matches(jsonb) from public, anon, authenticated;
grant execute on function public.server_open_matches(), public.server_sync_matches(jsonb) to service_role;
revoke all on function public.set_joker(text, bigint, boolean), public.points_of(text, uuid), public.match_community(text, bigint) from public;
grant execute on function public.set_joker(text, bigint, boolean), public.points_of(text, uuid), public.match_community(text, bigint) to anon, authenticated;

-- Hesap birleştirmede joker ve puan defteri de taşınır.
create or replace function public._merge_profile(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_from = p_into then return; end if;
  insert into picks (profile_id, match_id, home_goals, away_goals, kickoff, updated_at, joker)
  select p_into, match_id, home_goals, away_goals, kickoff, updated_at, joker from picks where profile_id = p_from
  on conflict (profile_id, match_id) do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals,
    kickoff = coalesce(picks.kickoff, excluded.kickoff), updated_at = excluded.updated_at, joker = excluded.joker
    where excluded.updated_at > picks.updated_at;
  insert into points (profile_id, match_id, kickoff, week, base, bonus, joker, total, outcome, created_at)
  select p_into, match_id, kickoff, week, base, bonus, joker, total, outcome, created_at from points where profile_id = p_from
  on conflict (profile_id, match_id) do nothing;
  insert into members (group_id, profile_id, joined_at, last_read)
  select group_id, p_into, joined_at, last_read from members where profile_id = p_from
  on conflict (group_id, profile_id) do nothing;
  update messages set profile_id = p_into where profile_id = p_from;
  update groups set owner = p_into where owner = p_from;
  update devices set profile_id = p_into where profile_id = p_from;
  delete from profiles where id = p_from;
end $$;
revoke all on function public._merge_profile(uuid, uuid) from public, anon, authenticated;
