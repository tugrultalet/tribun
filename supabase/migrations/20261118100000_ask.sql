-- "Arkadaşına sor": tahminini girince gruplarındaki arkadaşlarına bildirim, gruplarında olmayanlara WhatsApp bağlantısı
-- (tribunapp.io/t/KOD). Bağlantıyı açan, uygulamayı indirmeden adını yazıp tahmin yapar; uygulamayı indirince web'deki
-- tahmini ve grubu uygulamaya geçer (pano kodu, olmazsa aynı IP'den "X'in davetiyle mi geldin?").

-- Kişiye özel bildirim için cihaz anahtarları (FCM).
create table if not exists public.push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_profile_idx on public.push_tokens (profile_id);
alter table public.push_tokens enable row level security;

-- Gönderilecek bildirimler (sunucu alıp FCM'e iletir).
create table if not exists public.push_queue (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null, body text not null, match_id bigint,
  created_at timestamptz not null default now(),
  taken_at timestamptz
);
create index if not exists push_queue_open_idx on public.push_queue (id) where taken_at is null;
alter table public.push_queue enable row level security;

-- Tahmin istekleri: kişi başına maç başına bir tane.
create table if not exists public.asks (
  token text primary key,
  sender uuid not null references public.profiles (id) on delete cascade,
  match_id bigint not null,
  show_pick boolean not null default true,
  group_id uuid references public.groups (id) on delete set null,  -- web'den cevaplayan bu gruba katılır
  home text, away text,
  created_at timestamptz not null default now(),
  unique (sender, match_id)
);
alter table public.asks enable row level security;

-- Web'den tahmin yapan kişinin uygulamaya geçiş kodu.
create table if not exists public.web_claims (
  code text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  inviter text not null,
  ip text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists web_claims_ip_idx on public.web_claims (ip, created_at desc);
alter table public.web_claims enable row level security;

-- Okunması kolay kısa kod (I, O, 0, 1 yok).
create or replace function public._short_code(n int) returns text language sql volatile set search_path = public, pg_temp as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, n)
$$;

create or replace function public.register_push(p_secret text, p_token text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  if char_length(coalesce(p_token, '')) not between 20 and 4096 then raise exception 'Geçersiz bildirim anahtarı.' using errcode = 'P0001'; end if;
  insert into push_tokens (token, profile_id) values (p_token, v_me)
  on conflict (token) do update set profile_id = excluded.profile_id, updated_at = now();
  return json_build_object('ok', true);
end $$;

-- Sor: tahmin girilmiş ve başlamamış maç için. Gruplarımdaki, bu maça henüz tahmin girmemiş üyelere bir kez bildirim.
-- Aynı maç için tekrar çağrılırsa yeni bildirim gitmez, aynı bağlantı döner (WhatsApp için). p_show: tahminim görünsün mü.
-- p_group: WhatsApp'tan gelen kişinin katılacağı grubum (isteğe bağlı).
create or replace function public.ask_friends(p_secret text, p_match bigint, p_show boolean, p_home text, p_away text, p_group uuid default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_pick picks; v_kick timestamptz; v_token text; v_name text; v_n int := 0; v_body text;
begin
  select * into v_pick from picks where profile_id = v_me and match_id = p_match;
  if v_pick.profile_id is null then raise exception 'Önce kendi tahminini gir.' using errcode = 'P0001'; end if;
  v_kick := coalesce((select kickoff from matches where id = p_match), v_pick.kickoff);
  if v_kick is null or now() >= v_kick then raise exception 'Maç başladı.' using errcode = 'P0001'; end if;
  if p_group is not null and not exists (select 1 from members where group_id = p_group and profile_id = v_me) then
    raise exception 'Bu grubun üyesi değilsin.' using errcode = 'P0001';
  end if;
  select token into v_token from asks where sender = v_me and match_id = p_match;
  if v_token is not null then
    update asks set show_pick = coalesce(p_show, true), group_id = coalesce(p_group, group_id) where token = v_token;
    return json_build_object('token', v_token, 'notified', 0, 'again', true);
  end if;
  perform _rate('ask:' || v_me::text, 30, interval '1 day');
  v_token := _short_code(8);
  insert into asks (token, sender, match_id, show_pick, group_id, home, away)
  values (v_token, v_me, p_match, coalesce(p_show, true), p_group, left(btrim(coalesce(p_home, '')), 40), left(btrim(coalesce(p_away, '')), 40));
  select name into v_name from profiles where id = v_me;
  v_body := case when coalesce(p_show, true)
    then format('%s %s–%s için %s–%s dedi. Sen ne diyorsun?', v_name, p_home, p_away, v_pick.home_goals, v_pick.away_goals)
    else format('%s %s–%s için tahmin yaptı. Sen ne diyorsun?', v_name, p_home, p_away) end;
  insert into push_queue (profile_id, title, body, match_id)
  select distinct x.profile_id, 'Tahmin isteği', left(v_body, 180), p_match
  from members m join members x on x.group_id = m.group_id
  where m.profile_id = v_me and x.profile_id <> v_me
    and not exists (select 1 from picks k where k.profile_id = x.profile_id and k.match_id = p_match);
  get diagnostics v_n = row_count;
  return json_build_object('token', v_token, 'notified', v_n, 'again', false);
end $$;

-- Bağlantının bilgisi (web sayfası ve uygulama): gönderen adı, maç, gösteriliyorsa tahmini.
create or replace function public.ask_info(p_token text) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object('match_id', a.match_id, 'sender', p.name, 'home', a.home, 'away', a.away, 'group', g.name,
    'kickoff', coalesce(m.kickoff, k.kickoff), 'pick', case when a.show_pick then json_build_object('h', k.home_goals, 'a', k.away_goals) end)
  from asks a join profiles p on p.id = a.sender
  left join picks k on k.profile_id = a.sender and k.match_id = a.match_id
  left join matches m on m.id = a.match_id
  left join groups g on g.id = a.group_id
  where a.token = upper(p_token)
$$;

-- Web'den cevap: profil (yoksa) açılır, tahmin girilir, uygulamaya geçiş kodu döner.
create or replace function public.web_answer(p_secret text, p_name text, p_token text, p_home int, p_away int) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare a asks; v_me uuid; v_kick timestamptz; v_code text; v_inviter text;
begin
  select * into a from asks where token = upper(p_token);
  if a.token is null then raise exception 'Bağlantı geçersiz.' using errcode = 'P0001'; end if;
  v_me := _profile_or_null(p_secret);
  if v_me is null then perform register(p_secret, p_name); v_me := _profile(p_secret); end if;
  v_kick := coalesce((select kickoff from matches where id = a.match_id), (select kickoff from picks where profile_id = a.sender and match_id = a.match_id));
  perform set_pick(p_secret, a.match_id, p_home, p_away, v_kick);
  -- Bağlantı bir gruba bağlıysa gruba katılır (dolu değilse); gönderen tahminini grupta görür.
  if a.group_id is not null and not exists (select 1 from members where group_id = a.group_id and profile_id = v_me)
     and (select count(*) from members where group_id = a.group_id) < 50 then
    insert into members (group_id, profile_id) values (a.group_id, v_me);
  end if;
  select name into v_inviter from profiles where id = a.sender;
  select code into v_code from web_claims where profile_id = v_me and claimed_at is null;
  if v_code is null then
    v_code := _short_code(8);
    insert into web_claims (code, profile_id, inviter, ip) values (v_code, v_me, v_inviter, _client_ip());
  end if;
  return json_build_object('ok', true, 'code', v_code, 'inviter', v_inviter);
end $$;

-- Uygulamaya geçiş: pano kodu ile web profilini bu cihaza bağlar.
create or replace function public.claim_web(p_code text, p_secret text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare c web_claims;
begin
  if char_length(coalesce(p_secret, '')) < 32 then raise exception 'Geçersiz oturum.' using errcode = 'P0001'; end if;
  perform _rate('claim:ip:' || _client_ip(), 20, interval '1 hour');
  select * into c from web_claims where code = upper(btrim(coalesce(p_code, ''))) and claimed_at is null and created_at > now() - interval '30 days';
  if c.code is null then return json_build_object('error', 'Kod bulunamadı.'); end if;
  insert into devices (secret_hash, profile_id) values (_hash(p_secret), c.profile_id) on conflict (secret_hash) do update set profile_id = excluded.profile_id;
  update web_claims set claimed_at = now() where code = c.code;
  return json_build_object('name', (select name from profiles where id = c.profile_id), 'inviter', c.inviter);
end $$;

-- Pano okunamazsa: aynı IP'den son 24 saatte web'de tahmin yapılmışsa davet edenin adı ve kodu.
create or replace function public.web_claim_nearby() returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c web_claims;
begin
  select * into c from web_claims where ip = _client_ip() and claimed_at is null and created_at > now() - interval '24 hours' order by created_at desc limit 1;
  if c.code is null then return json_build_object('found', false); end if;
  return json_build_object('found', true, 'code', c.code, 'inviter', c.inviter);
end $$;

-- Sunucu: bekleyen bildirimleri cihaz anahtarlarıyla alır (alınanlar işaretlenir).
create or replace function public.server_take_pushes(p_limit int default 200) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v json;
begin
  with taken as (
    update push_queue set taken_at = now() where id in (select id from push_queue where taken_at is null order by id limit greatest(1, least(p_limit, 500)))
    returning id, profile_id, title, body, match_id)
  select coalesce(json_agg(json_build_object('title', t.title, 'body', t.body, 'match_id', t.match_id, 'token', pt.token)), '[]'::json) into v
  from taken t join push_tokens pt on pt.profile_id = t.profile_id;
  delete from push_queue where taken_at < now() - interval '7 days';
  return v;
end $$;

create or replace function public.server_drop_tokens(p_tokens text[]) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from push_tokens where token = any (p_tokens)
$$;

revoke all on function public._short_code(int) from public, anon, authenticated;
revoke all on function public.server_take_pushes(int), public.server_drop_tokens(text[]) from public, anon, authenticated;
grant execute on function public.server_take_pushes(int), public.server_drop_tokens(text[]) to service_role;
revoke all on function public.register_push(text, text), public.ask_friends(text, bigint, boolean, text, text, uuid), public.ask_info(text),
  public.web_answer(text, text, text, int, int), public.claim_web(text, text), public.web_claim_nearby() from public;
grant execute on function public.register_push(text, text), public.ask_friends(text, bigint, boolean, text, text, uuid), public.ask_info(text),
  public.web_answer(text, text, text, int, int), public.claim_web(text, text), public.web_claim_nearby() to anon, authenticated;
