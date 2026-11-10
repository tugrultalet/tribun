-- Hesap bağlama: anonim başlangıç sürer; Apple/Google ile giriş yapınca profil Supabase Auth kullanıcısına bağlanır.
-- Yeni telefonda aynı hesapla giriş yapınca o cihazın sırrı profile eklenir (birden çok cihaz). Telefonda zaten
-- anonim bir profil varsa verileri (tahminler, üyelikler, mesajlar, kurduğu gruplar) bağlı profile taşınır.

alter table public.profiles add column if not exists auth_user uuid unique references auth.users (id) on delete set null;
alter table public.profiles add column if not exists auth_provider text check (auth_provider in ('apple', 'google'));
alter table public.profiles add column if not exists hide_global boolean not null default false;

create table if not exists public.devices (
  secret_hash text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists devices_profile_idx on public.devices (profile_id);
alter table public.devices enable row level security;

create or replace function public._hash(p text) returns text language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;

-- Profil arama: ilk cihazın sırrı profiles'ta, sonradan eklenen cihazlarınki devices'ta.
create or replace function public._profile_or_null(p_secret text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select id from profiles where secret_hash = _hash(p_secret)), (select profile_id from devices where secret_hash = _hash(p_secret)))
$$;

create or replace function public._profile(p_secret text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid := _profile_or_null(p_secret);
begin
  if v_id is null then raise exception 'Oturum bulunamadı.' using errcode = 'P0001'; end if;
  return v_id;
end $$;

-- Anonim profilin verilerini hedef profile taşır ve anonim profili siler.
create or replace function public._merge_profile(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_from = p_into then return; end if;
  -- Aynı maça iki tahmin varsa en son girilen kalır.
  insert into picks (profile_id, match_id, home_goals, away_goals, kickoff, updated_at)
  select p_into, match_id, home_goals, away_goals, kickoff, updated_at from picks where profile_id = p_from
  on conflict (profile_id, match_id) do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals,
    kickoff = coalesce(picks.kickoff, excluded.kickoff), updated_at = excluded.updated_at
    where excluded.updated_at > picks.updated_at;
  insert into members (group_id, profile_id, joined_at, last_read)
  select group_id, p_into, joined_at, last_read from members where profile_id = p_from
  on conflict (group_id, profile_id) do nothing;
  update messages set profile_id = p_into where profile_id = p_from;
  update groups set owner = p_into where owner = p_from;
  update devices set profile_id = p_into where profile_id = p_from;
  delete from profiles where id = p_from;
end $$;

-- Giriş sonrası çağrılır (Authorization: kullanıcının Supabase oturum anahtarı).
-- p_secret: bu cihazın sırrı (profili olmayabilir). Dönüş: status 'linked' | 'restored' | 'new'.
create or replace function public.link_account(p_secret text, p_provider text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_linked uuid; v_here uuid; v_status text;
begin
  if v_uid is null then raise exception 'Giriş yapılmadı.' using errcode = 'P0001'; end if;
  if char_length(coalesce(p_secret, '')) < 32 then raise exception 'Geçersiz oturum.' using errcode = 'P0001'; end if;
  if p_provider not in ('apple', 'google') then raise exception 'Geçersiz giriş yöntemi.' using errcode = 'P0001'; end if;
  perform _rate('link:' || v_uid::text, 20, interval '1 hour');
  select id into v_linked from profiles where auth_user = v_uid;
  v_here := _profile_or_null(p_secret);
  if v_linked is null then
    if v_here is null then return json_build_object('status', 'new'); end if;
    if (select auth_user from profiles where id = v_here) is not null then
      raise exception 'Bu cihaz başka bir hesaba bağlı.' using errcode = 'P0001';
    end if;
    update profiles set auth_user = v_uid, auth_provider = p_provider where id = v_here;
    v_linked := v_here; v_status := 'linked';
  else
    if v_here is not null and v_here <> v_linked then
      if (select auth_user from profiles where id = v_here) is not null then
        raise exception 'Bu cihaz başka bir hesaba bağlı.' using errcode = 'P0001';
      end if;
      perform _merge_profile(v_here, v_linked);
    end if;
    insert into devices (secret_hash, profile_id) values (_hash(p_secret), v_linked)
    on conflict (secret_hash) do update set profile_id = excluded.profile_id;
    v_status := 'restored';
  end if;
  return json_build_object('status', v_status, 'name', (select name from profiles where id = v_linked));
end $$;

-- Hesap bilgisi (Ayarlar ve Profil için).
create or replace function public.account_info(p_secret text) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  return (select json_build_object('name', name, 'provider', auth_provider, 'hide_global', hide_global) from profiles where id = v_me);
end $$;

create or replace function public.set_hide_global(p_secret text, p_hide boolean) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  update profiles set hide_global = coalesce(p_hide, false) where id = v_me;
  return json_build_object('ok', true);
end $$;

-- Takma ad: sonradan eklenen cihazdan çağrılınca yeni profil açmak yerine bağlı profilin adı değişir.
create or replace function public.register(p_secret text, p_name text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if char_length(coalesce(p_secret, '')) < 32 then raise exception 'Geçersiz oturum.' using errcode = 'P0001'; end if;
  if char_length(v_name) not between 1 and 30 then raise exception 'Takma ad 1-30 karakter olmalı.' using errcode = 'P0001'; end if;
  perform _rate('reg:ip:' || _client_ip(), 10, interval '1 hour');
  v_id := _profile_or_null(p_secret);
  if v_id is null then
    insert into profiles (secret_hash, name) values (_hash(p_secret), v_name) returning id into v_id;
  else
    update profiles set name = v_name where id = v_id;
  end if;
  return json_build_object('id', v_id, 'name', v_name);
end $$;

-- Hesap silme: bağlı giriş kaydı da silinir.
create or replace function public.delete_account(p_secret text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); g record; v_next uuid; v_uid uuid;
begin
  select auth_user into v_uid from profiles where id = v_me;
  for g in select id from groups where owner = v_me loop
    select profile_id into v_next from members where group_id = g.id and profile_id <> v_me order by joined_at limit 1;
    if v_next is null then delete from groups where id = g.id; else update groups set owner = v_next where id = g.id; end if;
  end loop;
  delete from profiles where id = v_me;
  delete from rate_events where key like '%' || v_me::text || '%';
  if v_uid is not null then delete from auth.users where id = v_uid; end if;
  return json_build_object('ok', true);
end $$;

revoke all on function public._hash(text), public._profile_or_null(text), public._merge_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function public.link_account(text, text), public.account_info(text), public.set_hide_global(text, boolean) from public;
revoke execute on function public.link_account(text, text) from anon;
grant execute on function public.link_account(text, text) to authenticated;
grant execute on function public.account_info(text), public.set_hide_global(text, boolean) to anon, authenticated;
