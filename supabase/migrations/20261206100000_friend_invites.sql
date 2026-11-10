-- "Arkadaş ekle": kişiye özel kalıcı davet kodu (tribunapp.io/a/KOD). Bağlantıyla gelen kişi uygulamada profili olunca
-- (yeni geldiyse takma ad seçince) davet edenle arkadaş olur. Tahmin paylaşmadan arkadaş eklemenin yolu.
create table if not exists public.friend_invites (
  code text primary key,
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.friend_invites enable row level security;

create or replace function public.my_friend_code(p_secret text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_code text;
begin
  select code into v_code from friend_invites where profile_id = v_me;
  if v_code is null then
    loop
      v_code := _short_code(8);
      exit when not exists (select 1 from friend_invites where code = v_code);
    end loop;
    insert into friend_invites (code, profile_id) values (v_code, v_me);
  end if;
  return json_build_object('code', v_code, 'name', (select name from profiles where id = v_me));
end $$;

-- Herkese açık özet (davet sayfası ve WhatsApp kartı için): yalnızca davet edenin adı.
create or replace function public.friend_invite_info(p_code text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object('name', p.name) from friend_invites i join profiles p on p.id = i.profile_id
  where i.code = upper(btrim(coalesce(p_code, '')))
$$;

create or replace function public.accept_friend(p_secret text, p_code text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_owner uuid; v_new boolean;
begin
  perform _rate('acceptf:' || v_me, 30, interval '1 hour');
  select profile_id into v_owner from friend_invites where code = upper(btrim(coalesce(p_code, '')));
  if v_owner is null then return json_build_object('ok', false, 'error', 'Davet bulunamadı.'); end if;
  if v_owner = v_me then return json_build_object('ok', false, 'self', true); end if;
  v_new := _befriend(v_me, v_owner, null);
  if v_new then
    insert into push_queue (profile_id, title, body)
    values (v_owner, 'Yeni arkadaş', left(format('%s davetini kabul etti; artık arkadaşsınız.', (select name from profiles where id = v_me)), 180));
  end if;
  return json_build_object('ok', true, 'new', v_new, 'name', (select name from profiles where id = v_owner));
end $$;

revoke all on function public.my_friend_code(text), public.friend_invite_info(text), public.accept_friend(text, text) from public;
grant execute on function public.my_friend_code(text), public.friend_invite_info(text), public.accept_friend(text, text) to anon, authenticated;
