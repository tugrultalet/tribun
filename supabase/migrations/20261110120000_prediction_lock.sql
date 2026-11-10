-- Tahmin kilidi ve gizlilik.
--
-- İstemci, tahmin girerken maçın başlama saatini (p_kickoff) bildirir. Sunucu bunu doğrulayamaz (maç verisi
-- veritabanında yok), bu yüzden şu sınırlar uygulanır: başlama saati ilk tahminde sabitlenir ve sonradan
-- ileri alınamaz; geçmişte ya da 60 günden uzakta olamaz. Başlama saatinden sonra tahmin yazılamaz ve
-- değiştirilemez; başlamamış maçlarda başkalarının skoru sunucudan hiç çıkmaz, yalnızca "girdi" bilgisi çıkar.
-- Arkadaş oyunu için yeterli bir güvence; her tahmin ayrıca updated_at ile damgalanmaya devam eder.

alter table public.predictions add column if not exists kickoff timestamptz;

drop function if exists public.set_prediction(text, uuid, bigint, int, int);
create function public.set_prediction(p_secret text, p_group uuid, p_match bigint, p_home int, p_away int, p_kickoff timestamptz default null) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret); v_old timestamptz; v_kick timestamptz;
begin
  perform _require_member(v_me, p_group);
  if p_home is null or p_away is null or p_home not between 0 and 20 or p_away not between 0 and 20 then
    raise exception 'Skor 0-20 arasında olmalı.' using errcode = 'P0001';
  end if;
  select kickoff into v_old from predictions where group_id = p_group and profile_id = v_me and match_id = p_match;
  -- Kayıtlı başlama saati varsa o geçerlidir; istemci sonradan değiştiremez.
  v_kick := coalesce(v_old, p_kickoff);
  if v_old is null and p_kickoff is not null and (p_kickoff < now() - interval '3 hours' or p_kickoff > now() + interval '60 days') then
    raise exception 'Geçersiz maç saati.' using errcode = 'P0001';
  end if;
  if v_kick is not null and now() >= v_kick then
    raise exception 'Maç başladı, tahmin kapandı.' using errcode = 'P0001';
  end if;
  insert into predictions (group_id, profile_id, match_id, home_goals, away_goals, kickoff)
  values (p_group, v_me, p_match, p_home, p_away, v_kick)
  on conflict (group_id, profile_id, match_id)
  do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals, kickoff = coalesce(predictions.kickoff, excluded.kickoff), updated_at = now();
  return json_build_object('ok', true);
end $$;
revoke all on function public.set_prediction(text, uuid, bigint, int, int, timestamptz) from public;
grant execute on function public.set_prediction(text, uuid, bigint, int, int, timestamptz) to anon, authenticated;

-- Başlamamış maçlarda başkalarının tahmini çıkmaz; onun yerine yalnızca kimin girdiği (pending) döner.
create or replace function public.group_detail(p_secret text, p_group uuid) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := _profile(p_secret);
begin
  perform _require_member(v_me, p_group);
  return json_build_object(
    'group', _group_json(p_group),
    'me', v_me,
    'members', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name) order by m.joined_at), '[]'::json)
                from members m join profiles p on p.id = m.profile_id where m.group_id = p_group),
    'predictions', (select coalesce(json_agg(json_build_object(
                      'profile_id', profile_id, 'match_id', match_id, 'h', home_goals, 'a', away_goals, 'updated_at', updated_at)), '[]'::json)
                    from predictions
                    where group_id = p_group and (profile_id = v_me or kickoff is null or kickoff <= now())),
    'pending', (select coalesce(json_agg(json_build_object('profile_id', profile_id, 'match_id', match_id)), '[]'::json)
                from predictions
                where group_id = p_group and profile_id <> v_me and kickoff > now()));
end $$;
