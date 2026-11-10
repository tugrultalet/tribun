-- Hesap silme (App Store şartı) ve uygulama içi geri bildirim.

-- Hesabımı sil: profil ve ona bağlı her şey (üyelikler, mesajlar, tahminler) silinir. Kurduğu gruplar silinmez:
-- başka üye varsa grup en eski üyeye devredilir, yoksa grup silinir.
create function public.delete_account(p_secret text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); g record; v_next uuid;
begin
  for g in select id from groups where owner = v_me loop
    select profile_id into v_next from members where group_id = g.id and profile_id <> v_me order by joined_at limit 1;
    if v_next is null then delete from groups where id = g.id; else update groups set owner = v_next where id = g.id; end if;
  end loop;
  delete from profiles where id = v_me; -- members, messages, picks, predictions zincirleme silinir
  delete from rate_events where key like '%' || v_me::text || '%';
  return json_build_object('ok', true);
end $$;
revoke all on function public.delete_account(text) from public;
grant execute on function public.delete_account(text) to anon, authenticated;

-- Geri bildirim: takma adı olmayan da gönderebilir. Uygulama sürümü ve platform gibi küçük bir bilgi (meta) eklenir.
create table public.feedback (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  meta jsonb check (meta is null or pg_column_size(meta) < 2000),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;

create function public.send_feedback(p_body text, p_meta jsonb default null, p_secret text default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_body text := btrim(coalesce(p_body, '')); v_me uuid;
begin
  if char_length(v_body) not between 1 and 2000 then raise exception 'Mesaj 1-2000 karakter olmalı.' using errcode = 'P0001'; end if;
  if p_secret is not null then v_me := _profile(p_secret); end if;
  perform _rate('fb:ip:' || _client_ip(), 5, interval '1 hour');
  perform _rate('fb:' || v_me, 5, interval '1 hour');
  insert into feedback (profile_id, body, meta) values (v_me, v_body, p_meta);
  return json_build_object('ok', true);
end $$;
revoke all on function public.send_feedback(text, jsonb, text) from public;
grant execute on function public.send_feedback(text, jsonb, text) to anon, authenticated;
