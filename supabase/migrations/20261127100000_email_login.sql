-- E-posta ile giriş (Supabase Auth e-posta kodu / sihirli bağlantı): profil Apple'daki gibi hesaba bağlanır.
alter table profiles drop constraint if exists profiles_auth_provider_check;
alter table profiles add constraint profiles_auth_provider_check check (auth_provider = any (array['apple', 'google', 'email']));

create or replace function public.link_account(p_secret text, p_provider text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_linked uuid; v_here uuid; v_status text;
begin
  if v_uid is null then raise exception 'Giriş yapılmadı.' using errcode = 'P0001'; end if;
  if char_length(coalesce(p_secret, '')) < 32 then raise exception 'Geçersiz oturum.' using errcode = 'P0001'; end if;
  if p_provider not in ('apple', 'google', 'email') then raise exception 'Geçersiz giriş yöntemi.' using errcode = 'P0001'; end if;
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
