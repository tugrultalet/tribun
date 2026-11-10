-- Grup kapsamı: "Bu grupta hangi maçları tahmin edeceksiniz?"
-- scope null (mevcut gruplar) = grubun takımının maçları. {"type":"leagues","ids":[203,2]} = seçilen turnuvaların maçları.
-- Kapsam kişisel takipten bağımsızdır.
alter table public.groups add column if not exists scope jsonb;
alter table public.groups drop constraint if exists groups_scope_check;
alter table public.groups add constraint groups_scope_check check (
  scope is null or (
    jsonb_typeof(scope) = 'object' and scope->>'type' = 'leagues'
    and jsonb_typeof(scope->'ids') = 'array' and jsonb_array_length(scope->'ids') between 1 and 5)
);

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
      where x.group_id = g.id order by x.id desc limit 1)
  ) from groups g where g.id = p_group
$$;

drop function if exists public.create_group(text, text, bigint, text, text);
create function public.create_group(p_secret text, p_name text, p_team_id bigint, p_team_name text, p_team_logo text, p_scope jsonb default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := _profile(p_secret);
  v_name text := btrim(coalesce(p_name, ''));
  v_code text; v_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if char_length(v_name) not between 1 and 40 then raise exception 'Grup adı 1-40 karakter olmalı.' using errcode = 'P0001'; end if;
  if (select count(*) from groups where owner = v_me) >= 20 then raise exception 'En fazla 20 grup kurabilirsin.' using errcode = 'P0001'; end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') into v_code from generate_series(1, 6);
    exit when not exists (select 1 from groups where code = v_code);
  end loop;
  insert into groups (name, team_id, team_name, team_logo, code, owner, scope)
  values (v_name, p_team_id, p_team_name, p_team_logo, v_code, v_me, p_scope) returning id into v_id;
  insert into members (group_id, profile_id) values (v_id, v_me);
  return _group_json(v_id);
end $$;
revoke all on function public.create_group(text, text, bigint, text, text, jsonb) from public;
grant execute on function public.create_group(text, text, bigint, text, text, jsonb) to anon, authenticated;
