-- Grup davet bağlantısı önizlemesi (WhatsApp kartı) için herkese açık özet ve davet ekranından arkadaşları gruba ekleme.
create or replace function public.invite_info(p_code text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object('name', g.name, 'team_id', g.team_id, 'team_name', g.team_name, 'team_logo', g.team_logo,
    'scope', g.scope, 'kind', g.kind, 'expires_at', g.expires_at, 'members', (select count(*) from members m where m.group_id = g.id))
  from groups g where g.code = upper(btrim(coalesce(p_code, ''))) and (g.expires_at is null or g.expires_at > now())
$$;
revoke all on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;

-- Davet ekranında seçilen arkadaşlar gruba eklenir ve bildirim alır. Yalnızca arkadaşların (ve grup üyesi olan kişi) ekleyebilir;
-- arkadaş grubu en fazla 50 kişi.
create or replace function public.add_to_group(p_secret text, p_group uuid, p_profiles uuid[])
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); g groups; v_name text; v_n int := 0; v_match bigint;
begin
  perform _require_member(v_me, p_group);
  select * into g from groups where id = p_group;
  if g.kind <> 'friends' then raise exception 'Bu gruba yalnızca bağlantıyla katılınır.' using errcode = 'P0001'; end if;
  if (select count(*) from members where group_id = p_group) + coalesce(array_length(p_profiles, 1), 0) > 50 then
    raise exception 'Grup en fazla 50 kişi olabilir.' using errcode = 'P0001';
  end if;
  perform _rate('add:' || v_me, 60, interval '1 hour');
  with added as (
    insert into members (group_id, profile_id)
    select p_group, x from unnest(p_profiles) x
    where x <> v_me and x in (select f from _friends_of(v_me) f)
    on conflict do nothing returning profile_id)
  select count(*) into v_n from added;
  select name into v_name from profiles where id = v_me;
  v_match := case when g.scope ->> 'type' = 'match' then (g.scope -> 'ids' ->> 0)::bigint end;
  insert into push_queue (profile_id, title, body, match_id)
  select m.profile_id, left(g.name, 80), left(format('%s seni "%s" grubuna ekledi.', v_name, g.name), 180), v_match
  from members m where m.group_id = p_group and m.profile_id = any (p_profiles) and m.profile_id <> v_me
    and m.joined_at > now() - interval '1 minute';
  return json_build_object('added', v_n);
end $$;
revoke all on function public.add_to_group(text, uuid, uuid[]) from public;
grant execute on function public.add_to_group(text, uuid, uuid[]) to anon, authenticated;
