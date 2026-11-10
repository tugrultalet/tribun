-- Arkadaşlar: davet linki ya da onay yok. Bir kişi "Arkadaşlarına sor" bağlantısıyla gelip o maça tahmin yapınca
-- gönderenle arkadaş olur (web'de tahmin yapınca, uygulamada tahmini kaydedince). Arkadaşlar birbirinin tahminini
-- (maç başlayınca), puanını ve profilini görür; tahmin isteği arkadaşlara da gider. "Arkadaşlıktan çıkar" ile silinir.
create table if not exists public.friends (
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  via_match bigint,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists friends_b_idx on public.friends (b);
alter table public.friends enable row level security;

create or replace function public._befriend(p_x uuid, p_y uuid, p_match bigint default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_x is null or p_y is null or p_x = p_y then return false; end if;
  insert into friends (a, b, via_match) values (least(p_x, p_y), greatest(p_x, p_y), p_match) on conflict do nothing;
  return found;
end $$;

-- Arkadaşlarım: arkadaşlık listesi + ortak arkadaş grubundaki üyeler.
create or replace function public._friends_of(p_me uuid)
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when f.a = p_me then f.b else f.a end from friends f where f.a = p_me or f.b = p_me
  union
  select m2.profile_id from members m1 join groups g on g.id = m1.group_id and g.kind = 'friends'
  join members m2 on m2.group_id = m1.group_id where m1.profile_id = p_me and m2.profile_id <> p_me
$$;

-- Uygulamada: bağlantıyla gelen kişi o maça tahmin yaptıysa gönderenle arkadaş olur.
create or replace function public.ask_connect(p_secret text, p_token text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); a asks; v_new boolean := false;
begin
  select * into a from asks where token = upper(btrim(coalesce(p_token, '')));
  if a.token is null then return json_build_object('connected', false); end if;
  if a.sender <> v_me and exists (select 1 from picks where profile_id = v_me and match_id = a.match_id) then
    v_new := _befriend(v_me, a.sender, a.match_id);
    return json_build_object('connected', true, 'new', v_new, 'name', (select name from profiles where id = a.sender));
  end if;
  return json_build_object('connected', false, 'name', (select name from profiles where id = a.sender));
end $$;

-- Arkadaş listesi ve sıralama: bu hafta ve bu sezon puanı (ben dahil), hafta puanına göre.
create or replace function public.my_friends(p_secret text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_week date := _week(now());
  v_season timestamptz := make_timestamptz(extract(year from now() at time zone 'Europe/Istanbul')::int - case when extract(month from now() at time zone 'Europe/Istanbul') < 7 then 1 else 0 end, 7, 1, 0, 0, 0, 'Europe/Istanbul');
begin
  return coalesce((
    with ids as (
      select case when f.a = v_me then f.b else f.a end as id, f.created_at from friends f where f.a = v_me or f.b = v_me
      union all select v_me, null)
    select json_agg(json_build_object('id', p.id, 'name', p.name, 'me', p.id = v_me, 'since', ids.created_at,
      'week', coalesce((select sum(t.total) from points t where t.profile_id = p.id and t.week = v_week), 0),
      'season', coalesce((select sum(t.total) from points t where t.profile_id = p.id and t.kickoff >= v_season), 0))
      order by p.name)
    from ids join profiles p on p.id = ids.id), '[]'::json);
end $$;

create or replace function public.remove_friend(p_secret text, p_profile uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  delete from friends where a = least(v_me, p_profile) and b = greatest(v_me, p_profile);
  return json_build_object('ok', true);
end $$;

-- Web'de bağlantıyla tahmin yapan kişi (yeni ya da mevcut web profili) gönderenle arkadaş olur.
create or replace function public.web_answer(p_secret text, p_name text, p_token text, p_home integer, p_away integer)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare a asks; v_me uuid; v_kick timestamptz; v_code text; v_inviter text;
begin
  select * into a from asks where token = upper(p_token);
  if a.token is null then raise exception 'Bağlantı geçersiz.' using errcode = 'P0001'; end if;
  v_me := _profile_or_null(p_secret);
  if v_me is null then perform register(p_secret, p_name); v_me := _profile(p_secret); end if;
  v_kick := coalesce((select kickoff from matches where id = a.match_id), (select kickoff from picks where profile_id = a.sender and match_id = a.match_id));
  perform set_pick(p_secret, a.match_id, p_home, p_away, v_kick);
  perform _befriend(v_me, a.sender, a.match_id);
  if a.group_id is not null and not exists (select 1 from members where group_id = a.group_id and profile_id = v_me)
     and (select count(*) from members where group_id = a.group_id) < 50 then
    insert into members (group_id, profile_id) values (a.group_id, v_me);
  end if;
  select name into v_inviter from profiles where id = a.sender;
  select code into v_code from web_claims where profile_id = v_me and claimed_at is null;
  if v_code is null then
    v_code := _short_code(8);
    insert into web_claims (code, profile_id, inviter, ip) values (v_code, v_me, v_inviter, _client_ip());
  end if;
  return json_build_object('ok', true, 'code', v_code, 'inviter', v_inviter);
end $$;

create or replace function public.member_profile(p_secret text, p_profile uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  if p_profile <> v_me and not exists (select 1 from _friends_of(v_me) f where f = p_profile) then
    return json_build_object('error', 'Bu profili yalnızca arkadaşları ve ortak gruptaki üyeler görebilir.');
  end if;
  return json_build_object(
    'name', (select name from profiles where id = p_profile),
    'friend', exists (select 1 from friends where a = least(v_me, p_profile) and b = greatest(v_me, p_profile)),
    'picks', coalesce((
      select json_agg(json_build_object('match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at, 'kickoff', x.kickoff) order by x.kickoff desc)
      from (select * from picks where profile_id = p_profile and kickoff is not null and kickoff <= now() order by kickoff desc limit 500) x), '[]'::json));
end $$;

revoke all on function public._befriend(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.ask_connect(text, text), public.my_friends(text), public.remove_friend(text, uuid) from public;
grant execute on function public.ask_connect(text, text), public.my_friends(text), public.remove_friend(text, uuid) to anon, authenticated;

-- Profil birleşince (hesapla girişte) arkadaşlıklar da taşınır.
create or replace function public._merge_profile(p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
  perform _befriend(p_into, case when f.a = p_from then f.b else f.a end, f.via_match) from friends f where f.a = p_from or f.b = p_from;
  update messages set profile_id = p_into where profile_id = p_from;
  update groups set owner = p_into where owner = p_from;
  update devices set profile_id = p_into where profile_id = p_from;
  delete from profiles where id = p_from;
end $$;
