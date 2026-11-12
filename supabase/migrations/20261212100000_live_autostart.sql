-- Kilit ekranında otomatik açılma (push-to-start): uygulama telefonun başlatma anahtarını ve takip ettiği takımların
-- önümüzdeki maçlarını (Live Activity'nin sabit bilgileriyle) kaydeder; sunucu maçı 1 saat kala uygulama kapalıyken açar.
create table if not exists public.live_autostart (
  token text primary key,
  items jsonb not null default '[]'::jsonb, -- [{ matchId, ts, attrs }]
  updated_at timestamptz not null default now()
);
alter table public.live_autostart enable row level security;

create or replace function public.set_live_autostart(p_token text, p_items jsonb) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if char_length(coalesce(p_token, '')) not between 32 and 512 or jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_items) > 20 or octet_length(p_items::text) > 40000 then
    raise exception 'Geçersiz istek.' using errcode = 'P0001';
  end if;
  perform _rate('autostart:ip:' || _client_ip(), 120, interval '1 hour');
  if jsonb_array_length(p_items) = 0 then
    delete from live_autostart where token = p_token;
  else
    insert into live_autostart (token, items, updated_at) values (p_token, p_items, now())
    on conflict (token) do update set items = excluded.items, updated_at = now();
  end if;
  return json_build_object('ok', true);
end $$;

-- Sunucu: başlaması yaklaşan maçı olan anahtarlar (son 14 günde güncellenmiş).
create or replace function public.server_live_autostart() returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object('token', token, 'items', items)), '[]'::json)
  from live_autostart where updated_at > now() - interval '14 days' and jsonb_array_length(items) > 0
$$;
-- Başlatılan maç listeden çıkar (sunucu yeniden başlasa da aynı maç ikinci kez açılmaz).
create or replace function public.server_live_autostart_done(p_token text, p_match bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  update live_autostart set items = coalesce((select jsonb_agg(e) from jsonb_array_elements(items) e where (e->>'matchId')::bigint <> p_match), '[]'::jsonb)
  where token = p_token
$$;
create or replace function public.server_drop_live_autostart(p_token text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from live_autostart where token = p_token
$$;

revoke all on function public.set_live_autostart(text, jsonb) from public;
grant execute on function public.set_live_autostart(text, jsonb) to anon, authenticated;
revoke all on function public.server_live_autostart(), public.server_live_autostart_done(text, bigint), public.server_drop_live_autostart(text) from public, anon, authenticated;
grant execute on function public.server_live_autostart(), public.server_live_autostart_done(text, bigint), public.server_drop_live_autostart(text) to service_role;
