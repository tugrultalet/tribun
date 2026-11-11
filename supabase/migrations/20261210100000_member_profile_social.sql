-- Arkadaş profili (sosyal profil düzeni için): tuttuğu takım, Tribün'e katılış, kafa kafaya (ortak biten maçlar) ve
-- arkadaşlık durumu. Ortak tribündeki biri arkadaş değilse "Arkadaş ekle" ile doğrudan arkadaş olunur (befriend_member).
create or replace function public.member_profile(p_secret text, p_profile uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  if p_profile <> v_me and not exists (select 1 from _friends_of(v_me) f where f = p_profile) then
    return json_build_object('error', 'Bu profili yalnızca arkadaşları ve ortak tribündeki üyeler görebilir.');
  end if;
  return json_build_object(
    'name', (select name from profiles where id = p_profile),
    'team', (select main_team from profiles where id = p_profile),
    'since', (select created_at from profiles where id = p_profile),
    'friend', exists (select 1 from friends where a = least(v_me, p_profile) and b = greatest(v_me, p_profile)),
    'friends', (select count(*) from friends where a = p_profile or b = p_profile),
    'won', (select count(*) from points x join points y on y.match_id = x.match_id and y.profile_id = p_profile where x.profile_id = v_me and x.total > y.total),
    'lost', (select count(*) from points x join points y on y.match_id = x.match_id and y.profile_id = p_profile where x.profile_id = v_me and x.total < y.total),
    'common', (select count(*) from points x join points y on y.match_id = x.match_id and y.profile_id = p_profile where x.profile_id = v_me),
    'picks', coalesce((
      select json_agg(json_build_object('match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at, 'kickoff', x.kickoff) order by x.kickoff desc)
      from (select * from picks where profile_id = p_profile and kickoff is not null and kickoff <= now() order by kickoff desc limit 500) x), '[]'::json));
end $$;

create or replace function public.befriend_member(p_secret text, p_profile uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_new boolean;
begin
  if not exists (select 1 from _friends_of(v_me) f where f = p_profile) then
    raise exception 'Yalnızca ortak tribündeki üyeleri arkadaş olarak ekleyebilirsin.' using errcode = 'P0001';
  end if;
  v_new := _befriend(v_me, p_profile, null);
  if v_new then
    insert into push_queue (profile_id, title, body)
    values (p_profile, 'Yeni arkadaş', left(format('%s seni arkadaş olarak ekledi.', (select name from profiles where id = v_me)), 180));
  end if;
  return json_build_object('ok', true, 'new', v_new);
end $$;
revoke all on function public.befriend_member(text, uuid) from public;
grant execute on function public.befriend_member(text, uuid) to anon, authenticated;
