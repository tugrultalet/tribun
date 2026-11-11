-- Arkadaş davetinde bağın kopmaması: kişi davet sayfasını (tribunapp.io/a/KOD) açınca tarayıcıdan ziyaret kaydedilir.
-- Uygulamayı indirip ilk açtığında pano boşsa, aynı internet bağlantısından son 24 saatte açılmış davet sorulur
-- ("Seni X mi davet etti?"). Web tahminindeki web_claim_nearby ile aynı yaklaşım.
create table if not exists public.friend_invite_visits (
  code text not null references public.friend_invites (code) on delete cascade,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists friend_invite_visits_ip_idx on public.friend_invite_visits (ip, created_at desc);
alter table public.friend_invite_visits enable row level security;

create or replace function public.note_friend_visit(p_code text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not exists (select 1 from friend_invites where code = v_code) then return json_build_object('ok', false); end if;
  perform _rate('fvisit:ip:' || _client_ip(), 30, interval '1 hour');
  insert into friend_invite_visits (code, ip) values (v_code, _client_ip());
  delete from friend_invite_visits where created_at < now() - interval '2 days';
  return json_build_object('ok', true);
end $$;

create or replace function public.friend_invite_nearby()
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_code text;
begin
  select code into v_code from friend_invite_visits where ip = _client_ip() and created_at > now() - interval '24 hours' order by created_at desc limit 1;
  if v_code is null then return json_build_object('found', false); end if;
  return json_build_object('found', true, 'code', v_code, 'inviter', (select p.name from friend_invites i join profiles p on p.id = i.profile_id where i.code = v_code));
end $$;

revoke all on function public.note_friend_visit(text), public.friend_invite_nearby() from public;
grant execute on function public.note_friend_visit(text), public.friend_invite_nearby() to anon, authenticated;
