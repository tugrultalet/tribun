-- "Gruplarıma bildir" ile WhatsApp paylaşımı ayrıldı: WhatsApp bağlantısı bildirim göndermez (p_notify=false).
-- Bildirim maç başına bir kez gider; kimseye gitmediyse (herkes tahmin girmişse) sonra yeniden denenebilir.
-- Yanıt her durumda ne olduğunu söyler: notified (bu sefer giden), already (daha önce gitti), friends (grup arkadaşı sayısı).
alter table asks add column if not exists notified_at timestamptz;
update asks set notified_at = created_at where notified_at is null
  and exists (select 1 from push_queue q where q.match_id = asks.match_id and q.created_at between asks.created_at - interval '1 minute' and asks.created_at + interval '1 minute');

drop function if exists public.ask_friends(text, bigint, boolean, text, text, uuid);
create or replace function public.ask_friends(p_secret text, p_match bigint, p_show boolean, p_home text, p_away text, p_group uuid default null, p_notify boolean default true)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_pick picks; v_kick timestamptz; v_ask asks; v_token text; v_name text; v_n int := 0; v_friends int; v_body text;
begin
  select * into v_pick from picks where profile_id = v_me and match_id = p_match;
  if v_pick.profile_id is null then raise exception 'Önce kendi tahminini gir.' using errcode = 'P0001'; end if;
  v_kick := coalesce((select kickoff from matches where id = p_match), v_pick.kickoff);
  if v_kick is null or now() >= v_kick then raise exception 'Maç başladı.' using errcode = 'P0001'; end if;
  if p_group is not null and not exists (select 1 from members where group_id = p_group and profile_id = v_me) then
    raise exception 'Bu grubun üyesi değilsin.' using errcode = 'P0001';
  end if;
  select * into v_ask from asks where sender = v_me and match_id = p_match;
  if v_ask.token is null then
    perform _rate('ask:' || v_me::text, 30, interval '1 day');
    v_token := _short_code(8);
    insert into asks (token, sender, match_id, show_pick, group_id, home, away)
    values (v_token, v_me, p_match, coalesce(p_show, true), p_group, left(btrim(coalesce(p_home, '')), 40), left(btrim(coalesce(p_away, '')), 40))
    returning * into v_ask;
  else
    update asks set show_pick = coalesce(p_show, true), group_id = coalesce(p_group, group_id) where token = v_ask.token returning * into v_ask;
  end if;
  select count(*) into v_friends from _friends_of(v_me);
  if not coalesce(p_notify, true) then
    return json_build_object('token', v_ask.token, 'notified', 0, 'already', v_ask.notified_at is not null, 'friends', v_friends, 'again', false);
  end if;
  if v_ask.notified_at is not null then
    return json_build_object('token', v_ask.token, 'notified', 0, 'already', true, 'friends', v_friends, 'again', true);
  end if;
  select name into v_name from profiles where id = v_me;
  v_body := case when v_ask.show_pick
    then format('%s %s–%s için %s–%s dedi. Sen ne diyorsun?', v_name, v_ask.home, v_ask.away, v_pick.home_goals, v_pick.away_goals)
    else format('%s %s–%s için tahmin yaptı. Sen ne diyorsun?', v_name, v_ask.home, v_ask.away) end;
  insert into push_queue (profile_id, title, body, match_id)
  select f, 'Tahmin isteği', left(v_body, 180), p_match from _friends_of(v_me) f
  where not exists (select 1 from picks k where k.profile_id = f and k.match_id = p_match);
  get diagnostics v_n = row_count;
  if v_n > 0 then update asks set notified_at = now() where token = v_ask.token; end if;
  return json_build_object('token', v_ask.token, 'notified', v_n, 'already', false, 'friends', v_friends, 'again', false);
end $$;
revoke all on function public.ask_friends(text, bigint, boolean, text, text, uuid, boolean) from public;
grant execute on function public.ask_friends(text, bigint, boolean, text, text, uuid, boolean) to anon, authenticated;
