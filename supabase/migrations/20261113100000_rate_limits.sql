-- Hız sınırları ve eksik indeksler.
-- rate_events: anahtar başına (profil ya da IP) olay zamanları. Sınır aşılırsa işlem reddedilir; eski kayıtlar ara ara silinir.
create table if not exists public.rate_events (key text not null, at timestamptz not null default now());
create index if not exists rate_events_key_at on public.rate_events (key, at);
alter table public.rate_events enable row level security;

-- İsteği yapanın IP'si (PostgREST istek başlıklarından). Bilinmiyorsa null (IP sınırı o zaman uygulanmaz).
create or replace function public._client_ip() returns text
language sql stable set search_path = public, pg_temp as $$
  select nullif(btrim(coalesce(
    current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
    split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)
  )), '')
$$;

create or replace function public._rate(p_key text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_key is null then return; end if;
  if (select count(*) from rate_events where key = p_key and at > now() - p_window) >= p_max then
    raise exception 'Çok sık işlem yaptın; biraz bekleyip tekrar dene.' using errcode = 'P0001';
  end if;
  insert into rate_events (key) values (p_key);
  if random() < 0.01 then delete from rate_events where at < now() - interval '1 day'; end if;
end $$;
revoke all on function public._client_ip() from public, anon, authenticated;
revoke all on function public._rate(text, int, interval) from public, anon, authenticated;

-- Takma ad: IP başına saatte 10 kayıt/değişiklik.
create or replace function public.register(p_secret text, p_name text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if char_length(coalesce(p_secret, '')) < 32 then raise exception 'Geçersiz oturum.' using errcode = 'P0001'; end if;
  if char_length(v_name) not between 1 and 30 then raise exception 'Takma ad 1-30 karakter olmalı.' using errcode = 'P0001'; end if;
  perform _rate('reg:ip:' || _client_ip(), 10, interval '1 hour');
  insert into profiles (secret_hash, name) values (encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'), v_name)
  on conflict (secret_hash) do update set name = excluded.name
  returning id into v_id;
  return json_build_object('id', v_id, 'name', v_name);
end $$;

-- Grup kurma: profil başına toplam 20 (önceden de vardı) + IP başına saatte 10.
create or replace function public.create_group(p_secret text, p_name text, p_team_id bigint, p_team_name text, p_team_logo text, p_scope jsonb default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := _profile(p_secret);
  v_name text := btrim(coalesce(p_name, ''));
  v_code text; v_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if char_length(v_name) not between 1 and 40 then raise exception 'Grup adı 1-40 karakter olmalı.' using errcode = 'P0001'; end if;
  if (select count(*) from groups where owner = v_me) >= 20 then raise exception 'En fazla 20 grup kurabilirsin.' using errcode = 'P0001'; end if;
  perform _rate('grp:ip:' || _client_ip(), 10, interval '1 hour');
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') into v_code from generate_series(1, 6);
    exit when not exists (select 1 from groups where code = v_code);
  end loop;
  insert into groups (name, team_id, team_name, team_logo, code, owner, scope)
  values (v_name, p_team_id, p_team_name, p_team_logo, v_code, v_me, p_scope) returning id into v_id;
  insert into members (group_id, profile_id) values (v_id, v_me);
  return _group_json(v_id);
end $$;

-- Kodla katılma: profil başına 10 dakikada 10, IP başına 10 dakikada 30 deneme (kod tahminini pratikte imkânsız kılar).
create or replace function public.join_group(p_secret text, p_code text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_id uuid;
begin
  perform _rate('join:' || v_me, 10, interval '10 minutes');
  perform _rate('join:ip:' || _client_ip(), 30, interval '10 minutes');
  select id into v_id from groups where code = upper(btrim(coalesce(p_code, '')));
  -- Hata fırlatılmaz, hata mesajı döner: fırlatılırsa deneme kaydı da geri alınır ve yanlış kod denemeleri sayılmazdı.
  if v_id is null then return json_build_object('error', 'Bu kodla bir grup bulunamadı.'); end if;
  if not exists (select 1 from members where group_id = v_id and profile_id = v_me) then
    if (select count(*) from members where group_id = v_id) >= 50 then return json_build_object('error', 'Bu grup dolu.'); end if;
    insert into members (group_id, profile_id) values (v_id, v_me);
  end if;
  return _group_json(v_id);
end $$;

-- Mesaj: profil başına dakikada 20.
create or replace function public.send_message(p_secret text, p_group uuid, p_body text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_body text := btrim(coalesce(p_body, '')); v_id bigint;
begin
  perform _require_member(v_me, p_group);
  if char_length(v_body) not between 1 and 500 then raise exception 'Mesaj 1-500 karakter olmalı.' using errcode = 'P0001'; end if;
  perform _rate('msg:' || v_me, 20, interval '1 minute');
  insert into messages (group_id, profile_id, body) values (p_group, v_me, v_body) returning id into v_id;
  return json_build_object('id', v_id);
end $$;

-- Tahmin: profil başına dakikada 120 kayıt (otomatik kayıt +/- ile sık yazar; bu sınır yalnızca kötüye kullanımı keser).
create or replace function public.set_pick(p_secret text, p_match bigint, p_home int, p_away int, p_kickoff timestamptz default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_old timestamptz; v_exists boolean; v_kick timestamptz;
begin
  if p_home is null or p_away is null or p_home not between 0 and 20 or p_away not between 0 and 20 then
    raise exception 'Skor 0-20 arasında olmalı.' using errcode = 'P0001';
  end if;
  perform _rate('pick:' || v_me, 120, interval '1 minute');
  select kickoff, true into v_old, v_exists from picks where profile_id = v_me and match_id = p_match;
  v_kick := coalesce(v_old, p_kickoff);
  if v_exists is null then
    if p_kickoff is null then raise exception 'Maç saati gerekli.' using errcode = 'P0001'; end if;
    if p_kickoff < now() - interval '3 hours' or p_kickoff > now() + interval '60 days' then
      raise exception 'Geçersiz maç saati.' using errcode = 'P0001';
    end if;
  end if;
  if v_kick is not null and now() >= v_kick then
    raise exception 'Maç başladı, tahmin kapandı.' using errcode = 'P0001';
  end if;
  insert into picks (profile_id, match_id, home_goals, away_goals, kickoff)
  values (v_me, p_match, p_home, p_away, v_kick)
  on conflict (profile_id, match_id)
  do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals, kickoff = coalesce(picks.kickoff, excluded.kickoff), updated_at = now();
  return json_build_object('ok', true);
end $$;

-- Eksik indeksler (Supabase önerisi): profil silinince mesaj ve grup taraması hızlı olsun.
create index if not exists groups_owner_idx on public.groups (owner);
create index if not exists messages_profile_idx on public.messages (profile_id);
