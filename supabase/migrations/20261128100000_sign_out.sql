-- Çıkış yap: yalnızca hesaba (Apple / e-posta) bağlı profilde. Bu cihazın anahtarı geçersiz olur (cihaz kaydı silinir;
-- profilin asıl anahtarıysa rastgele değerle değiştirilir), bu cihazın bildirim kaydı profilden ayrılır. Profil ve
-- veriler yerinde kalır; aynı hesapla yeniden girince (link_account) geri gelir.
create or replace function public.sign_out(p_secret text, p_token text default null)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  if (select auth_user from profiles where id = v_me) is null then
    raise exception 'Önce hesabını bağla; yoksa çıkış yapınca verilerine bir daha ulaşamazsın.' using errcode = 'P0001';
  end if;
  if p_token is not null then delete from push_tokens where token = p_token and profile_id = v_me; end if;
  delete from devices where secret_hash = _hash(p_secret);
  update profiles set secret_hash = _hash(gen_random_uuid()::text || gen_random_uuid()::text)
  where id = v_me and secret_hash = _hash(p_secret);
  return json_build_object('ok', true);
end $$;
revoke all on function public.sign_out(text, text) from public;
grant execute on function public.sign_out(text, text) to anon, authenticated;
