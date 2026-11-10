-- Grup içinde maç odaları: her maç için başlamadan 1 saat önce açılır, bittikten 1 saat sonra arşivlenir (salt okunur).
-- Genel sohbet aynen sürer (match_id boş). Oda mesajları 30 gün sonra silinir (pg_cron, her gece).

alter table public.messages add column if not exists match_id bigint;
create index if not exists messages_room_idx on public.messages (group_id, match_id, id);

create table if not exists public.rooms (
  group_id uuid not null references public.groups (id) on delete cascade,
  match_id bigint not null,
  kickoff timestamptz not null,
  home text, away text,
  created_at timestamptz not null default now(),
  primary key (group_id, match_id)
);
alter table public.rooms enable row level security;

-- Odanın durumu: 'soon' (henüz açılmadı), 'open', 'closed' (arşiv). Maç bilgisi sunucudan geldiyse (matches) o geçerlidir;
-- bitiş saati bilinmiyorsa maçın başlamadan 3 saat sonra bittiği varsayılır (yaklaşık 2 saat maç + 1 saat).
create or replace function public._room_state(p_match bigint, p_kickoff timestamptz) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when m.status = 'off' then 'closed'
    when now() < coalesce(m.kickoff, p_kickoff) - interval '1 hour' then 'soon'
    when m.status = 'live' then 'open'
    when m.status = 'ft' then case when now() < m.updated_at + interval '1 hour' then 'open' else 'closed' end
    when now() < coalesce(m.kickoff, p_kickoff) + interval '3 hours' then 'open'
    else 'closed' end
  from (select 1) one left join matches m on m.id = p_match
$$;

drop function if exists public.send_message(text, uuid, text);
create or replace function public.send_message(p_secret text, p_group uuid, p_body text, p_match bigint default null,
  p_kickoff timestamptz default null, p_home text default null, p_away text default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_body text := btrim(coalesce(p_body, '')); v_id bigint; v_kick timestamptz;
begin
  perform _require_member(v_me, p_group);
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

drop function if exists public.get_messages(text, uuid, bigint);
create or replace function public.get_messages(p_secret text, p_group uuid, p_after bigint default 0, p_match bigint default null) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  return coalesce((
    select json_agg(row_to_json(t) order by t.id) from (
      select x.id, x.profile_id, p.name, x.body, x.created_at
      from messages x join profiles p on p.id = x.profile_id
      where x.group_id = p_group and x.match_id is not distinct from p_match and x.id > coalesce(p_after, 0)
      order by x.id desc limit 100) t), '[]'::json);
end $$;

-- Grup listesindeki son mesaj: yalnızca genel sohbetten.
create or replace function public._group_json(p_group uuid) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'id', g.id, 'name', g.name, 'code', g.code,
    'team', json_build_object('id', g.team_id, 'name', g.team_name, 'logo', g.team_logo),
    'scope', g.scope,
    'members', (select count(*) from members m where m.group_id = g.id),
    'last_message', (
      select json_build_object('body', x.body, 'name', p.name, 'created_at', x.created_at)
      from messages x join profiles p on p.id = x.profile_id
      where x.group_id = g.id and x.match_id is null order by x.id desc limit 1)
  ) from groups g where g.id = p_group
$$;

-- Grubun son 30 gündeki odaları (mesaj sayısı ve durumuyla).
create or replace function public.group_rooms(p_secret text, p_group uuid) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  return coalesce((
    select json_agg(json_build_object('match_id', r.match_id, 'kickoff', coalesce(m.kickoff, r.kickoff), 'home', coalesce(m.home, r.home), 'away', coalesce(m.away, r.away),
      'state', _room_state(r.match_id, r.kickoff), 'messages', (select count(*) from messages x where x.group_id = r.group_id and x.match_id = r.match_id))
      order by coalesce(m.kickoff, r.kickoff) desc)
    from rooms r left join matches m on m.id = r.match_id
    where r.group_id = p_group and r.created_at > now() - interval '30 days'), '[]'::json);
end $$;

revoke all on function public._room_state(bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.send_message(text, uuid, text, bigint, timestamptz, text, text), public.get_messages(text, uuid, bigint, bigint), public.group_rooms(text, uuid) from public;
grant execute on function public.send_message(text, uuid, text, bigint, timestamptz, text, text), public.get_messages(text, uuid, bigint, bigint), public.group_rooms(text, uuid) to anon, authenticated;

-- Her gece: 30 günden eski oda mesajları ve odalar silinir.
create extension if not exists pg_cron;
select cron.unschedule('tribun-room-cleanup') where exists (select 1 from cron.job where jobname = 'tribun-room-cleanup');
select cron.schedule('tribun-room-cleanup', '17 0 * * *', $$
  delete from public.messages where match_id is not null and created_at < now() - interval '30 days';
  delete from public.rooms where created_at < now() - interval '30 days';
$$);
