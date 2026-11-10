-- Hesap ekranı: üyelik tarihi, grup / tahmin / cihaz sayısı.
create or replace function public.account_info(p_secret text) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  return (select json_build_object('name', p.name, 'provider', p.auth_provider, 'hide_global', p.hide_global, 'created_at', p.created_at,
    'groups', (select count(*) from members where profile_id = v_me),
    'picks', (select count(*) from picks where profile_id = v_me),
    'devices', 1 + (select count(*) from devices where profile_id = v_me))
  from profiles p where p.id = v_me);
end $$;
