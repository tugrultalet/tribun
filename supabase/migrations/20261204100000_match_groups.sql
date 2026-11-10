-- Maça özel sohbet grubu ({"type":"match","ids":[maç]}): tahmin kartındaki "Sohbet grubu oluştur" ile kurulur, yalnızca o
-- maçı kapsar; odası maçtan 1 saat önce açılır, maç bitince kapanır, grup maçtan 7 gün sonra kendiliğinden silinir
-- (expires_at, gece temizliği). Takım grupları kalıcıdır (her maçta oda yeniden açılır).
-- Tahmin kaydedilince ilgili gruplardaki, henüz tahmin girmemiş üyelere maç başına bir kez bildirim (notify_groups);
-- tahmin maç başlayana kadar gizli kaldığı için bildirimde skor yazmaz.
alter table public.groups add column if not exists expires_at timestamptz;
alter table public.groups drop constraint if exists groups_scope_check;
alter table public.groups add constraint groups_scope_check check (
  scope is null or (
    jsonb_typeof(scope) = 'object' and jsonb_typeof(scope->'ids') = 'array' and (
      (scope->>'type' = 'leagues' and jsonb_array_length(scope->'ids') between 1 and 5)
      or (scope->>'type' = 'teams' and jsonb_array_length(scope->'ids') between 1 and 3)
      or (scope->>'type' = 'match' and jsonb_array_length(scope->'ids') = 1)))
);

drop function if exists public.create_group(text, text, bigint, text, text, jsonb, text);
create or replace function public.create_group(p_secret text, p_name text, p_team_id bigint, p_team_name text, p_team_logo text,
  p_scope jsonb default null, p_kind text default 'friends', p_kickoff timestamptz default null)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_name text := btrim(coalesce(p_name, '')); v_code text; v_id uuid; v_kind text := coalesce(p_kind, 'friends'); v_exp timestamptz;
begin
  if char_length(v_name) not between 1 and 40 then raise exception 'Grup adı 1-40 karakter olmalı.' using errcode = 'P0001'; end if;
  if v_kind not in ('friends', 'open') then raise exception 'Geçersiz grup türü.' using errcode = 'P0001'; end if;
  if (select auth_user from profiles where id = v_me) is null then raise exception 'Grup kurmak için hesabını bağla.' using errcode = 'P0001'; end if;
  if p_scope ->> 'type' = 'match' then
    if p_kickoff is null or p_kickoff < now() - interval '3 hours' then raise exception 'Bu maç için grup kurulamaz.' using errcode = 'P0001'; end if;
    v_exp := p_kickoff + interval '7 days';
    -- Aynı maç için kendi kurduğun grup varsa onu döner (iki kez basılırsa ikinci grup açılmaz).
    select id into v_id from groups where owner = v_me and scope = p_scope;
    if v_id is not null then return _group_json(v_id); end if;
  elsif (select count(*) from groups where owner = v_me and expires_at is null) >= 20 then
    raise exception 'En fazla 20 grup kurabilirsin.' using errcode = 'P0001';
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
revoke all on function public.create_group(text, text, bigint, text, text, jsonb, text, timestamptz) from public;
grant execute on function public.create_group(text, text, bigint, text, text, jsonb, text, timestamptz) to anon, authenticated;

create or replace function public._group_json(p_group uuid)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'id', g.id, 'name', g.name, 'code', g.code, 'kind', g.kind, 'verified', g.verified, 'expires_at', g.expires_at,
    'team', json_build_object('id', g.team_id, 'name', g.team_name, 'logo', g.team_logo),
    'scope', g.scope,
    'members', (select count(*) from members m where m.group_id = g.id),
    'last_message', (
      select json_build_object('body', x.body, 'name', p.name, 'created_at', x.created_at)
      from messages x join profiles p on p.id = x.profile_id
      where x.group_id = g.id and x.match_id is null order by x.id desc limit 1)
  ) from groups g where g.id = p_group
$$;

-- Tahmin kaydedilince: verilen gruplardaki (üyesi olduğun arkadaş grupları), bu maça henüz tahmin girmemiş üyelere
-- bir bildirim. Maç başına bir kez (group_notices).
create table if not exists public.group_notices (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  match_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, match_id)
);
alter table public.group_notices enable row level security;

create or replace function public.notify_groups(p_secret text, p_match bigint, p_groups uuid[], p_home text, p_away text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_name text; v_n int := 0;
begin
  if not exists (select 1 from picks where profile_id = v_me and match_id = p_match) then return json_build_object('notified', 0); end if;
  if coalesce(array_length(p_groups, 1), 0) = 0 then return json_build_object('notified', 0); end if;
  insert into group_notices (profile_id, match_id) values (v_me, p_match) on conflict do nothing;
  if not found then return json_build_object('notified', 0, 'already', true); end if;
  select name into v_name from profiles where id = v_me;
  insert into push_queue (profile_id, title, body, match_id)
  select distinct m2.profile_id, left(btrim(coalesce(p_home, '')) || ' – ' || btrim(coalesce(p_away, '')), 80),
    left(format('%s tahminini girdi. Sen de tahmin et!', v_name), 180), p_match
  from members m1 join groups g on g.id = m1.group_id and g.kind = 'friends'
  join members m2 on m2.group_id = g.id
  where m1.profile_id = v_me and g.id = any (p_groups) and m2.profile_id <> v_me
    and not exists (select 1 from picks k where k.profile_id = m2.profile_id and k.match_id = p_match);
  get diagnostics v_n = row_count;
  return json_build_object('notified', v_n);
end $$;
revoke all on function public.notify_groups(text, bigint, uuid[], text, text) from public;
grant execute on function public.notify_groups(text, bigint, uuid[], text, text) to anon, authenticated;

-- Gece: süresi dolan maç grupları (maçtan 7 gün sonra) silinir; üyelikler, mesajlar, odalar birlikte gider.
select cron.unschedule('tribun-match-groups') where exists (select 1 from cron.job where jobname = 'tribun-match-groups');
select cron.schedule('tribun-match-groups', '27 0 * * *', $cron$ delete from public.groups where expires_at is not null and expires_at < now(); $cron$);
