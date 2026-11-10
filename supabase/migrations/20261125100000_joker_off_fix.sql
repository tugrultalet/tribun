-- Jokeri kapatırken "record v_other is not assigned yet" hatası: v_other yalnızca açarken doldurulduğu için
-- dönüşte okunamıyordu. Taşınan maç numarası ayrı değişkende tutulur.
create or replace function public.set_joker(p_secret text, p_match bigint, p_on boolean)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_kick timestamptz; v_other record; v_moved bigint;
begin
  select coalesce(m.kickoff, k.kickoff) into v_kick from picks k left join matches m on m.id = k.match_id
  where k.profile_id = v_me and k.match_id = p_match;
  if v_kick is null then raise exception 'Önce skor tahminini gir.' using errcode = 'P0001'; end if;
  if now() >= v_kick then raise exception 'Maç başladı, joker kilitlendi.' using errcode = 'P0001'; end if;
  if coalesce(p_on, false) then
    select k.match_id, coalesce(m.kickoff, k.kickoff) as kick, coalesce(m.home || ' – ' || m.away, 'başka bir maç') as label into v_other
    from picks k left join matches m on m.id = k.match_id
    where k.profile_id = v_me and k.joker and k.match_id <> p_match and _week(coalesce(m.kickoff, k.kickoff)) = _week(v_kick);
    if found and v_other.match_id is not null then
      if now() >= v_other.kick then
        raise exception 'Bu haftanın jokerini % maçında kullandın.', v_other.label using errcode = 'P0001';
      end if;
      update picks set joker = false where profile_id = v_me and match_id = v_other.match_id;
      v_moved := v_other.match_id;
    end if;
  end if;
  update picks set joker = coalesce(p_on, false) where profile_id = v_me and match_id = p_match;
  return json_build_object('ok', true, 'moved_from', v_moved);
end $$;
