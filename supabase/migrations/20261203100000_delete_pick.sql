-- Aktif tahmini silme (Profil'de sola kaydırınca): yalnızca maç başlamadan. Joker de o tahminle birlikte gider.
create or replace function public.delete_pick(p_secret text, p_match bigint)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_kick timestamptz;
begin
  select coalesce(m.kickoff, k.kickoff) into v_kick from picks k left join matches m on m.id = k.match_id
  where k.profile_id = v_me and k.match_id = p_match;
  if v_kick is not null and now() >= v_kick then raise exception 'Maç başladı, tahmin silinemez.' using errcode = 'P0001'; end if;
  delete from picks where profile_id = v_me and match_id = p_match;
  return json_build_object('ok', true);
end $$;
revoke all on function public.delete_pick(text, bigint) from public;
grant execute on function public.delete_pick(text, bigint) to anon, authenticated;
