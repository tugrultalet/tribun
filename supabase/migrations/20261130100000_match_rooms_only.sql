-- Arkadaş gruplarında genel sohbet kapandı: sohbet yalnızca maç odalarında (maçtan 1 saat önce açılır, bitince kapanır).
-- Açık ligde kurucunun duyuruları (match_id boş) sürer. Oda mesajları ve arşivi 30 yerine 7 gün saklanır.
create or replace function public.send_message(p_secret text, p_group uuid, p_body text, p_match bigint default null, p_kickoff timestamptz default null, p_home text default null, p_away text default null)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_body text := btrim(coalesce(p_body, '')); v_id bigint; v_kick timestamptz; g groups;
begin
  perform _require_member(v_me, p_group);
  select * into g from groups where id = p_group;
  if g.kind = 'open' and (p_match is not null or g.owner <> v_me) then
    raise exception 'Açık ligde yalnızca kurucu duyuru yazabilir.' using errcode = 'P0001';
  end if;
  if g.kind = 'friends' and p_match is null then
    raise exception 'Grup sohbeti maç odalarında: oda maçtan 1 saat önce açılır.' using errcode = 'P0001';
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
    if _room_state(p_match, v_kick) <> 'open' then raise exception 'Oda kapandı; mesajlar 7 gün okunabilir.' using errcode = 'P0001'; end if;
  end if;
  insert into messages (group_id, profile_id, body, match_id) values (p_group, v_me, v_body, p_match) returning id into v_id;
  return json_build_object('id', v_id);
end $$;

create or replace function public.group_rooms(p_secret text, p_group uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  return coalesce((
    select json_agg(json_build_object('match_id', r.match_id, 'kickoff', coalesce(m.kickoff, r.kickoff), 'home', coalesce(m.home, r.home), 'away', coalesce(m.away, r.away),
      'state', _room_state(r.match_id, r.kickoff), 'messages', (select count(*) from messages x where x.group_id = r.group_id and x.match_id = r.match_id))
      order by coalesce(m.kickoff, r.kickoff) desc)
    from rooms r left join matches m on m.id = r.match_id
    where r.group_id = p_group and r.created_at > now() - interval '7 days'), '[]'::json);
end $$;

select cron.unschedule('tribun-room-cleanup') where exists (select 1 from cron.job where jobname = 'tribun-room-cleanup');
select cron.schedule('tribun-room-cleanup', '17 0 * * *', $cron$
  delete from public.messages where match_id is not null and created_at < now() - interval '7 days';
  delete from public.rooms where created_at < now() - interval '7 days';
$cron$);
