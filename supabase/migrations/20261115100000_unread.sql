-- Gruplar sekmesi rozeti: her üyenin grupta en son okuduğu mesaj.
alter table public.members add column if not exists last_read bigint not null default 0;

-- Okundu işareti: sohbet açıkken en son görülen mesaj numarası (geri gitmez).
create or replace function public.mark_read(p_secret text, p_group uuid, p_last bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  update members set last_read = greatest(last_read, least(p_last, (select coalesce(max(id), 0) from messages where group_id = p_group)))
  where group_id = p_group and profile_id = v_me;
end $$;

-- Grup başına başkalarından gelen okunmamış mesaj sayısı (en çok 99 sayılır).
create or replace function public.unread_counts(p_secret text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  return coalesce((
    select json_object_agg(m.group_id, n) from members m
    cross join lateral (
      select count(*) as n from (
        select 1 from messages x where x.group_id = m.group_id and x.id > m.last_read and x.profile_id <> v_me limit 99
      ) s
    ) c
    where m.profile_id = v_me and c.n > 0), '{}'::json);
end $$;

revoke all on function public.mark_read(text, uuid, bigint) from public;
revoke all on function public.unread_counts(text) from public;
grant execute on function public.mark_read(text, uuid, bigint) to anon, authenticated;
grant execute on function public.unread_counts(text) to anon, authenticated;

-- Mevcut üyeler için başlangıç: şimdiye kadarki mesajlar okunmuş sayılır.
update public.members m set last_read = coalesce((select max(id) from public.messages x where x.group_id = m.group_id), 0);

-- Başka bir üyenin profili: yalnızca ortak bir grubumuz varsa. Başlamamış maçların tahminleri gösterilmez.
create or replace function public.member_profile(p_secret text, p_profile uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  if p_profile <> v_me and not exists (
    select 1 from members a join members b on b.group_id = a.group_id where a.profile_id = v_me and b.profile_id = p_profile
  ) then
    return json_build_object('error', 'Bu profili yalnızca ortak gruptaki üyeler görebilir.');
  end if;
  return json_build_object(
    'name', (select name from profiles where id = p_profile),
    'picks', coalesce((
      select json_agg(json_build_object('match_id', x.match_id, 'h', x.home_goals, 'a', x.away_goals, 'updated_at', x.updated_at, 'kickoff', x.kickoff) order by x.kickoff desc)
      from (select * from picks where profile_id = p_profile and kickoff is not null and kickoff <= now() order by kickoff desc limit 500) x), '[]'::json));
end $$;
revoke all on function public.member_profile(text, uuid) from public;
grant execute on function public.member_profile(text, uuid) to anon, authenticated;
