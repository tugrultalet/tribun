-- Tribün: arkadaş grupları, skor tahminleri ve grup sohbeti.
--
-- Erişim modeli: tablolarda RLS açık ve hiçbir politika yok, yani istemciler tablolara doğrudan erişemez.
-- Her işlem aşağıdaki SECURITY DEFINER fonksiyonlarından geçer. Kimlik, cihazda üretilen rastgele bir
-- sırdır (p_secret); veritabanında yalnızca SHA-256 özeti tutulur.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null unique,
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  team_id bigint not null,
  team_name text not null check (char_length(team_name) <= 80),
  team_logo text not null check (char_length(team_logo) <= 300),
  code text not null unique,
  owner uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.members (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index members_profile_idx on public.members (profile_id);

-- updated_at her zaman veritabanı saatidir; uygulama, maçın başlama saatinden sonra girilen tahmini geçersiz sayar.
create table public.predictions (
  group_id uuid not null,
  profile_id uuid not null,
  match_id bigint not null,
  home_goals int not null check (home_goals between 0 and 20),
  away_goals int not null check (away_goals between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (group_id, profile_id, match_id),
  foreign key (group_id, profile_id) references public.members (group_id, profile_id) on delete cascade
);

create table public.messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index messages_group_idx on public.messages (group_id, id);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.predictions enable row level security;
alter table public.messages enable row level security;

-- ---------- Yardımcılar (istemciye açık değil) ----------

create function public._profile(p_secret text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  select id into v_id from profiles where secret_hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex');
  if v_id is null then raise exception 'Oturum bulunamadı.' using errcode = 'P0001'; end if;
  return v_id;
end $$;

create function public._require_member(p_profile uuid, p_group uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from members where group_id = p_group and profile_id = p_profile) then
    raise exception 'Bu grubun üyesi değilsin.' using errcode = 'P0001';
  end if;
end $$;

create function public._group_json(p_group uuid) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'id', g.id, 'name', g.name, 'code', g.code,
    'team', json_build_object('id', g.team_id, 'name', g.team_name, 'logo', g.team_logo),
    'members', (select count(*) from members m where m.group_id = g.id),
    'last_message', (
      select json_build_object('body', x.body, 'name', p.name, 'created_at', x.created_at)
      from messages x join profiles p on p.id = x.profile_id
      where x.group_id = g.id order by x.id desc limit 1)
  ) from groups g where g.id = p_group
$$;

-- ---------- İstemciye açık fonksiyonlar ----------

-- Takma adı kaydeder ya da günceller. Sır en az 32 karakter olmalıdır.
create function public.register(p_secret text, p_name text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if char_length(coalesce(p_secret, '')) < 32 then raise exception 'Geçersiz oturum.' using errcode = 'P0001'; end if;
  if char_length(v_name) not between 1 and 30 then raise exception 'Takma ad 1-30 karakter olmalı.' using errcode = 'P0001'; end if;
  insert into profiles (secret_hash, name) values (encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'), v_name)
  on conflict (secret_hash) do update set name = excluded.name
  returning id into v_id;
  return json_build_object('id', v_id, 'name', v_name);
end $$;

create function public.create_group(p_secret text, p_name text, p_team_id bigint, p_team_name text, p_team_logo text) returns json
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
  insert into groups (name, team_id, team_name, team_logo, code, owner)
  values (v_name, p_team_id, p_team_name, p_team_logo, v_code, v_me) returning id into v_id;
  insert into members (group_id, profile_id) values (v_id, v_me);
  return _group_json(v_id);
end $$;

create function public.join_group(p_secret text, p_code text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_id uuid;
begin
  select id into v_id from groups where code = upper(btrim(coalesce(p_code, '')));
  if v_id is null then raise exception 'Bu kodla bir grup bulunamadı.' using errcode = 'P0001'; end if;
  if not exists (select 1 from members where group_id = v_id and profile_id = v_me) then
    if (select count(*) from members where group_id = v_id) >= 50 then raise exception 'Bu grup dolu.' using errcode = 'P0001'; end if;
    insert into members (group_id, profile_id) values (v_id, v_me);
  end if;
  return _group_json(v_id);
end $$;

-- Gruptan çıkar; son üye çıkınca grup silinir.
create function public.leave_group(p_secret text, p_group uuid) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  delete from members where group_id = p_group and profile_id = v_me;
  if not exists (select 1 from members where group_id = p_group) then delete from groups where id = p_group; end if;
  return json_build_object('ok', true);
end $$;

create function public.my_groups(p_secret text) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  return coalesce((
    select json_agg(_group_json(m.group_id) order by m.joined_at)
    from members m where m.profile_id = v_me), '[]'::json);
end $$;

-- Grup ayrıntısı: üyeler ve tüm tahminler. Başlamamış maçlarda başkalarının tahminini gizlemek uygulamanın işidir.
create function public.group_detail(p_secret text, p_group uuid) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  return json_build_object(
    'group', _group_json(p_group),
    'me', v_me,
    'members', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name) order by m.joined_at), '[]'::json)
                from members m join profiles p on p.id = m.profile_id where m.group_id = p_group),
    'predictions', (select coalesce(json_agg(json_build_object(
                      'profile_id', profile_id, 'match_id', match_id, 'h', home_goals, 'a', away_goals, 'updated_at', updated_at)), '[]'::json)
                    from predictions where group_id = p_group));
end $$;

create function public.set_prediction(p_secret text, p_group uuid, p_match bigint, p_home int, p_away int) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  if p_home is null or p_away is null or p_home not between 0 and 20 or p_away not between 0 and 20 then
    raise exception 'Skor 0-20 arasında olmalı.' using errcode = 'P0001';
  end if;
  insert into predictions (group_id, profile_id, match_id, home_goals, away_goals)
  values (p_group, v_me, p_match, p_home, p_away)
  on conflict (group_id, profile_id, match_id)
  do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals, updated_at = now();
  return json_build_object('ok', true);
end $$;

create function public.send_message(p_secret text, p_group uuid, p_body text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_body text := btrim(coalesce(p_body, '')); v_id bigint;
begin
  perform _require_member(v_me, p_group);
  if char_length(v_body) not between 1 and 500 then raise exception 'Mesaj 1-500 karakter olmalı.' using errcode = 'P0001'; end if;
  insert into messages (group_id, profile_id, body) values (p_group, v_me, v_body) returning id into v_id;
  return json_build_object('id', v_id);
end $$;

-- p_after'dan sonraki mesajlar (en fazla son 100), eskiden yeniye.
create function public.get_messages(p_secret text, p_group uuid, p_after bigint default 0) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  return coalesce((
    select json_agg(row_to_json(t) order by t.id) from (
      select x.id, x.profile_id, p.name, x.body, x.created_at
      from messages x join profiles p on p.id = x.profile_id
      where x.group_id = p_group and x.id > coalesce(p_after, 0)
      order by x.id desc limit 100) t), '[]'::json);
end $$;

-- Yardımcılar istemciye kapalı; diğerleri anahtarla (anon) çağrılabilir.
revoke all on function public._profile(text), public._require_member(uuid, uuid), public._group_json(uuid) from public, anon, authenticated;
revoke all on function
  public.register(text, text), public.create_group(text, text, bigint, text, text), public.join_group(text, text),
  public.leave_group(text, uuid), public.my_groups(text), public.group_detail(text, uuid),
  public.set_prediction(text, uuid, bigint, int, int), public.send_message(text, uuid, text), public.get_messages(text, uuid, bigint)
from public;
grant execute on function
  public.register(text, text), public.create_group(text, text, bigint, text, text), public.join_group(text, text),
  public.leave_group(text, uuid), public.my_groups(text), public.group_detail(text, uuid),
  public.set_prediction(text, uuid, bigint, int, int), public.send_message(text, uuid, text), public.get_messages(text, uuid, bigint)
to anon, authenticated;
