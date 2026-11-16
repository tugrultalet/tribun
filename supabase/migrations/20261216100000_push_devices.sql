-- Maç bildirimleri cihaz cihaz: uygulama FCM anahtarını, istediği bildirim konularını (team_645, pre_team_645) ve kilit
-- ekranında takip ettiği maçları kaydeder. Sunucu maç bildirimini bu cihazlara tek tek gönderir; kilit ekranında o maçı
-- takip eden cihaza göndermez (Live Activity zaten haber veriyor). Kayıt olan cihaz konu aboneliklerinden çıkar; konuya
-- giden bildirim yalnızca eski uygulama sürümlerine ulaşır.
create table if not exists public.push_devices (
  token text primary key,
  topics text[] not null default '{}',
  live bigint[] not null default '{}',    -- kilit ekranında takip edilen maçlar
  la_token text,                           -- Live Activity başlatma anahtarı (sunucu otomatik açınca live'a eklenir)
  updated_at timestamptz not null default now()
);
alter table public.push_devices enable row level security;
create index if not exists push_devices_topics on public.push_devices using gin (topics);
create index if not exists push_devices_la on public.push_devices (la_token);

create or replace function public.set_push_device(p_token text, p_topics text[], p_live bigint[], p_la_token text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if char_length(coalesce(p_token, '')) not between 32 and 512 or coalesce(array_length(p_topics, 1), 0) > 60
     or coalesce(array_length(p_live, 1), 0) > 10 or char_length(coalesce(p_la_token, '')) > 512 then
    raise exception 'Geçersiz istek.' using errcode = 'P0001';
  end if;
  perform _rate('pushdev:ip:' || _client_ip(), 240, interval '1 hour');
  insert into push_devices (token, topics, live, la_token, updated_at)
  values (p_token, coalesce(p_topics, '{}'), coalesce(p_live, '{}'), nullif(p_la_token, ''), now())
  on conflict (token) do update set topics = excluded.topics, live = excluded.live,
    la_token = coalesce(excluded.la_token, push_devices.la_token), updated_at = now();
  return json_build_object('ok', true);
end $$;

-- Sunucu: bu konulardan birini isteyen ve maçı kilit ekranında takip etmeyen cihazlar (son 60 günde görülmüş).
create or replace function public.server_push_targets(p_topics text[], p_match bigint) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(token), '[]'::json) from push_devices
  where topics && p_topics and not (p_match = any(live)) and updated_at > now() - interval '60 days'
$$;
-- Sunucu kilit ekranını otomatik açınca o cihazın takip listesine eklenir.
create or replace function public.server_mark_live(p_la_token text, p_match bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  update push_devices set live = (select array_agg(distinct x) from unnest(live || p_match) x) where la_token = p_la_token
$$;
create or replace function public.server_drop_push_device(p_token text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from push_devices where token = p_token
$$;

revoke all on function public.set_push_device(text, text[], bigint[], text) from public;
grant execute on function public.set_push_device(text, text[], bigint[], text) to anon, authenticated;
revoke all on function public.server_push_targets(text[], bigint), public.server_mark_live(text, bigint), public.server_drop_push_device(text) from public, anon, authenticated;
grant execute on function public.server_push_targets(text[], bigint), public.server_mark_live(text, bigint), public.server_drop_push_device(text) to service_role;
