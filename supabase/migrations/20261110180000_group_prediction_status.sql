-- Ana ekran için: istenen maçlarda, üyesi olduğum gruplardaki tahmin durumu.
-- Her (grup, maç) için kaç kişinin girdiği ve benim tahminim döner; tahmin girilmemiş maçlar satır üretmez.
-- Başkalarının skoru dönmez, yalnızca sayı.
create function public.group_prediction_status(p_secret text, p_matches bigint[]) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  if coalesce(array_length(p_matches, 1), 0) > 200 then raise exception 'Çok fazla maç.' using errcode = 'P0001'; end if;
  return coalesce((
    select json_agg(json_build_object('group_id', x.group_id, 'match_id', x.match_id, 'entered', x.entered, 'h', x.h, 'a', x.a))
    from (
      select p.group_id, p.match_id, count(*)::int as entered,
        max(case when p.profile_id = v_me then p.home_goals end) as h,
        max(case when p.profile_id = v_me then p.away_goals end) as a
      from predictions p
      join members m on m.group_id = p.group_id and m.profile_id = v_me
      where p.match_id = any (coalesce(p_matches, '{}'))
      group by p.group_id, p.match_id) x), '[]'::json);
end $$;
revoke all on function public.group_prediction_status(text, bigint[]) from public;
grant execute on function public.group_prediction_status(text, bigint[]) to anon, authenticated;
