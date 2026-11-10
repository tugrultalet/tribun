-- Tahmin oyunu: her maç için kullanıcı başına TEK tahmin (picks). Gruplar aynı tahminleri üyeler arasında karşılaştırır;
-- kişisel puan da bu tablodan hesaplanır. Eski grup tahminleri (predictions) buraya taşınır, tablo silinmez.
--
-- Kilit ve gizlilik kuralları aynen sürer: başlama saati ilk tahminde sabitlenir ve ileri alınamaz, başladıktan sonra
-- tahmin yazılamaz, başlamamış maçta başkalarının skoru sunucudan çıkmaz (yalnızca kaç kişinin girdiği).

create table public.picks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  match_id bigint not null,
  home_goals int not null check (home_goals between 0 and 20),
  away_goals int not null check (away_goals between 0 and 20),
  kickoff timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, match_id)
);
create index picks_match_idx on public.picks (match_id);
alter table public.picks enable row level security;

-- Aynı maça birden çok grupta girilmiş tahminlerden en son girileni kalır.
insert into public.picks (profile_id, match_id, home_goals, away_goals, kickoff, updated_at)
select distinct on (profile_id, match_id) profile_id, match_id, home_goals, away_goals, kickoff, updated_at
from public.predictions order by profile_id, match_id, updated_at desc
on conflict do nothing;

create function public.set_pick(p_secret text, p_match bigint, p_home int, p_away int, p_kickoff timestamptz default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_old timestamptz; v_exists boolean; v_kick timestamptz;
begin
  if p_home is null or p_away is null or p_home not between 0 and 20 or p_away not between 0 and 20 then
    raise exception 'Skor 0-20 arasında olmalı.' using errcode = 'P0001';
  end if;
  select kickoff, true into v_old, v_exists from picks where profile_id = v_me and match_id = p_match;
  v_kick := coalesce(v_old, p_kickoff);
  if v_exists is null then
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
  do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals, kickoff = coalesce(picks.kickoff, excluded.kickoff), updated_at = now();
  return json_build_object('ok', true);
end $$;
revoke all on function public.set_pick(text, bigint, int, int, timestamptz) from public;
grant execute on function public.set_pick(text, bigint, int, int, timestamptz) to anon, authenticated;

-- Eski istemciler: grup parametresi yok sayılır, tahmin kişisel tabloya yazılır.
create or replace function public.set_prediction(p_secret text, p_group uuid, p_match bigint, p_home int, p_away int, p_kickoff timestamptz default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return set_pick(p_secret, p_match, p_home, p_away, p_kickoff);
end $$;

-- Benim tüm tahminlerim (en yeniden eskiye, en çok 1000): kişisel puan için.
create function public.my_picks(p_secret text) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  return coalesce((
    select json_agg(json_build_object('match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at, 'kickoff', x.kickoff) order by x.updated_at desc)
    from (select * from picks where profile_id = v_me order by updated_at desc limit 1000) x), '[]'::json);
end $$;
revoke all on function public.my_picks(text) from public;
grant execute on function public.my_picks(text) to anon, authenticated;

-- Bir maçta, ortak grubum olan arkadaşlarımın tahminleri. Başlamamış maçta skorlar çıkmaz, yalnızca kaç kişinin girdiği.
create function public.match_picks(p_secret text, p_match bigint) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  return (
    with friends as (
      select distinct m2.profile_id from members m1 join members m2 on m2.group_id = m1.group_id
      where m1.profile_id = v_me and m2.profile_id <> v_me)
    select json_build_object(
      'revealed', coalesce((select json_agg(json_build_object('profile_id', k.profile_id, 'name', p.name, 'h', k.home_goals, 'a', k.away_goals, 'updated_at', k.updated_at) order by p.name)
                  from picks k join friends f on f.profile_id = k.profile_id join profiles p on p.id = k.profile_id
                  where k.match_id = p_match and (k.kickoff is null or k.kickoff <= now())), '[]'::json),
      'pending', (select count(*)::int from picks k join friends f on f.profile_id = k.profile_id
                  where k.match_id = p_match and k.kickoff > now())));
end $$;
revoke all on function public.match_picks(text, bigint) from public;
grant execute on function public.match_picks(text, bigint) to anon, authenticated;

-- Grup ayrıntısı: üyeler ve üyelerin tahminleri. p_matches verilirse yalnızca o maçların tahminleri (grup ekranının
-- bildiği maçlar); verilmezse son 60 günün tahminleri (en çok 4000). Başlamamış maçta başkalarının skoru çıkmaz.
drop function if exists public.group_detail(text, uuid);
create function public.group_detail(p_secret text, p_group uuid, p_matches bigint[] default null) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  return json_build_object(
    'group', _group_json(p_group),
    'me', v_me,
    'members', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name) order by m.joined_at), '[]'::json)
                from members m join profiles p on p.id = m.profile_id where m.group_id = p_group),
    'predictions', (select coalesce(json_agg(json_build_object('profile_id', x.profile_id, 'match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at)), '[]'::json)
                    from (select k.* from picks k join members m on m.profile_id = k.profile_id and m.group_id = p_group
                          where (k.profile_id = v_me or k.kickoff is null or k.kickoff <= now())
                            and (case when p_matches is null then k.updated_at > now() - interval '60 days' else k.match_id = any (p_matches) end)
                          limit 4000) x),
    'pending', (select coalesce(json_agg(json_build_object('profile_id', x.profile_id, 'match_id', x.match_id)), '[]'::json)
                from (select k.profile_id, k.match_id from picks k join members m on m.profile_id = k.profile_id and m.group_id = p_group
                      where k.profile_id <> v_me and k.kickoff > now()
                        and (case when p_matches is null then k.updated_at > now() - interval '60 days' else k.match_id = any (p_matches) end)
                      limit 4000) x));
end $$;
revoke all on function public.group_detail(text, uuid, bigint[]) from public;
grant execute on function public.group_detail(text, uuid, bigint[]) to anon, authenticated;

-- Ana ekran etiketi: üyesi olduğum gruplarda, istenen maçlar için kaç üyenin girdiği ve benim tahminim.
create or replace function public.group_prediction_status(p_secret text, p_matches bigint[]) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  if coalesce(array_length(p_matches, 1), 0) > 200 then raise exception 'Çok fazla maç.' using errcode = 'P0001'; end if;
  return coalesce((
    select json_agg(json_build_object('group_id', x.group_id, 'match_id', x.match_id, 'entered', x.entered, 'h', x.h, 'a', x.a))
    from (
      select m.group_id, k.match_id, count(*)::int as entered,
        max(case when k.profile_id = v_me then k.home_goals end) as h,
        max(case when k.profile_id = v_me then k.away_goals end) as a
      from members m
      join picks k on k.profile_id = m.profile_id
      where m.group_id in (select group_id from members where profile_id = v_me)
        and k.match_id = any (coalesce(p_matches, '{}'))
      group by m.group_id, k.match_id) x), '[]'::json);
end $$;
