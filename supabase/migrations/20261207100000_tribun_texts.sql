-- Kullanıcıya görünen metinlerde "grup" yerine "tribün" (tribün kur, tribüne katıl, tribününe ekledi).
create or replace function public.create_group(p_secret text, p_name text, p_team_id bigint, p_team_name text, p_team_logo text,
  p_scope jsonb default null, p_kind text default 'friends', p_kickoff timestamptz default null)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_name text := btrim(coalesce(p_name, '')); v_code text; v_id uuid; v_kind text := coalesce(p_kind, 'friends'); v_exp timestamptz;
begin
  if char_length(v_name) not between 1 and 40 then raise exception 'Tribün adı 1-40 karakter olmalı.' using errcode = 'P0001'; end if;
  if v_kind not in ('friends', 'open') then raise exception 'Geçersiz tribün türü.' using errcode = 'P0001'; end if;
  if (select auth_user from profiles where id = v_me) is null then raise exception 'Tribün kurmak için hesabını bağla.' using errcode = 'P0001'; end if;
  if p_scope ->> 'type' = 'match' then
    if p_kickoff is null or p_kickoff < now() - interval '3 hours' then raise exception 'Bu maç için tribün kurulamaz.' using errcode = 'P0001'; end if;
    v_exp := p_kickoff + interval '7 days';
    -- Aynı maç için kendi kurduğun grup varsa onu döner (iki kez basılırsa ikinci grup açılmaz).
    select id into v_id from groups where owner = v_me and scope = p_scope;
    if v_id is not null then return _group_json(v_id); end if;
  elsif (select count(*) from groups where owner = v_me and expires_at is null) >= 20 then
    raise exception 'En fazla 20 tribün kurabilirsin.' using errcode = 'P0001';
  end if;
  if v_kind = 'open' and (select count(*) from groups where owner = v_me and kind = 'open') >= 3 then
    raise exception 'En fazla 3 açık lig kurabilirsin.' using errcode = 'P0001';
  end if;
  perform _rate('grp:ip:' || _client_ip(), 10, interval '1 hour');
  loop
    v_code := _short_code(6);
    exit when not exists (select 1 from groups where code = v_code);
  end loop;
  insert into groups (name, team_id, team_name, team_logo, code, owner, scope, kind, expires_at)
  values (v_name, p_team_id, p_team_name, p_team_logo, v_code, v_me, p_scope, v_kind, v_exp) returning id into v_id;
  insert into members (group_id, profile_id) values (v_id, v_me);
  return _group_json(v_id);
end $$;
create or replace function public.add_to_group(p_secret text, p_group uuid, p_profiles uuid[])
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); g groups; v_name text; v_n int := 0; v_match bigint;
begin
  perform _require_member(v_me, p_group);
  select * into g from groups where id = p_group;
  if g.kind <> 'friends' then raise exception 'Bu tribüne yalnızca bağlantıyla katılınır.' using errcode = 'P0001'; end if;
  if (select count(*) from members where group_id = p_group) + coalesce(array_length(p_profiles, 1), 0) > 50 then
    raise exception 'Tribün en fazla 50 kişi olabilir.' using errcode = 'P0001';
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
  select m.profile_id, left(g.name, 80), left(format('%s seni "%s" tribününe ekledi.', v_name, g.name), 180), v_match
  from members m where m.group_id = p_group and m.profile_id = any (p_profiles) and m.profile_id <> v_me
    and m.joined_at > now() - interval '1 minute';
  return json_build_object('added', v_n);
end $$;
