-- Çoklu maç Live Activity'si: aynı anda birden fazla takip edilen maç tek kartta. Yayın kanalı tek maç taşıyabildiği için
-- bu kart cihaza özel anahtarla (push token) güncellenir: uygulama anahtarı ve kartın maçlarını kaydeder, sunucu okur.
create table if not exists public.live_tokens (
  token text primary key,
  profile_id uuid references public.profiles (id) on delete cascade,
  match_ids bigint[] not null,
  created_at timestamptz not null default now()
);
alter table public.live_tokens enable row level security;

create or replace function public.register_live_token(p_secret text, p_token text, p_matches bigint[]) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile_or_null(p_secret);
begin
  if char_length(coalesce(p_token, '')) not between 32 and 512 or coalesce(array_length(p_matches, 1), 0) not between 1 and 4 then
    raise exception 'Geçersiz istek.' using errcode = 'P0001';
  end if;
  perform _rate('livetok:ip:' || _client_ip(), 60, interval '1 hour');
  insert into live_tokens (token, profile_id, match_ids) values (p_token, v_me, p_matches)
  on conflict (token) do update set match_ids = excluded.match_ids, created_at = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.server_live_tokens() returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object('token', token, 'matches', match_ids)), '[]'::json)
  from live_tokens where created_at > now() - interval '8 hours'
$$;
create or replace function public.server_drop_live_token(p_token text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from live_tokens where token = p_token
$$;

revoke all on function public.register_live_token(text, text, bigint[]) from public;
grant execute on function public.register_live_token(text, text, bigint[]) to anon, authenticated;
revoke all on function public.server_live_tokens(), public.server_drop_live_token(text) from public, anon, authenticated;
grant execute on function public.server_live_tokens(), public.server_drop_live_token(text) to service_role;
