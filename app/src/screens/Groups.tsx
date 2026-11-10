import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { ApiError, Team } from '../api';
import { cleanCode } from '../invite';
import { TabParams, useNav } from '../nav';
import { Group, rpc, useRpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { track } from '../telemetry';
import { MAX_SCOPE_TEAMS } from '../groups/scope';
import { FriendsSection } from '../game/Friends';
import { Button, Card, Crest, Empty, GAP, Icon, Loader, Panel, Seg } from '../ui';
import { Screen } from './Screen';
import { fbPushPermission } from '../fb';
import { RestoreBlock, SignInButtons, useCanSignIn } from './SignIn';

import { Field } from '../ui';

// Arkadaşlar sekmesi: üstte Arkadaşlar | Gruplar. Arkadaşlar: tahmin paylaşımıyla eklenen arkadaşlar ve sıralama.
// Gruplar: küçük sohbet grupları (kurma, koda katılma). Takma ad yoksa önce o istenir. Davet bağlantısıyla gelindiyse
// Gruplar açılır (katılma formu kodla).
export default function Groups() {
  const store = useStore();
  const t = useTheme();
  const linked = cleanCode(useRoute<RouteProp<TabParams, 'Groups'>>().params?.code);
  const [tab, setTab] = useState<'friends' | 'groups'>(linked ? 'groups' : 'friends');
  useEffect(() => { if (linked) setTab('groups'); }, [linked]);
  // "Arkadaş ekle" bağlantısıyla gelip yeni takma ad seçtiyse: davet edenle arkadaş olunur.
  const [joined, setJoined] = useState('');
  useEffect(() => {
    const code = store.friendCode;
    if (!store.me || !code) return;
    store.setFriendCode(undefined);
    rpc<{ ok: boolean; new?: boolean; name?: string }>('accept_friend', { p_secret: store.me.secret, p_code: code })
      .then((r) => { if (r.ok && r.name) { setTab('friends'); setJoined(`${r.name} ile artık arkadaşsınız 🤝`); } }).catch(() => {});
  }, [store.me?.secret, store.friendCode]);
  return (
    <Screen tab title="Tribün">
      {store.me ? (
        <>
          <Seg value={tab} onChange={setTab} options={[['friends', 'Arkadaşlarım'], ['groups', 'Tribün']]} />
          {!!joined && <Text style={{ fontSize: 14, fontWeight: '600', color: t.win, textAlign: 'center', marginTop: 10 }}>{joined}</Text>}
          <View style={{ marginTop: 4 }}>{tab === 'friends' ? <FriendsSection /> : <MyGroups secret={store.me.secret} />}</View>
        </>
      ) : <NameForm />}
    </Screen>
  );
}

function NameForm() {
  const t = useTheme();
  const { setName } = useStore();
  const [name, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try { await setName(name.trim()); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Panel title="Arkadaşlarınla tahmin et">
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>Arkadaşlarınla skor tahmini yap, puanlarınızı karşılaştırın, maç sohbetlerine katıl. Başlamak için bir takma ad seç.</Text>
        <Field value={name} onChange={setValue} placeholder="Takma adın" maxLength={30} />
        {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
        <Button label={busy ? 'Kaydediliyor…' : 'Devam'} disabled={busy || !name.trim()} onPress={submit} />
        <RestoreBlock />
      </View>
    </Panel>
  );
}

function MyGroups({ secret }: { secret: string }) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const state = useRpc<Group[]>('my_groups', { p_secret: secret }, 20000);
  // Grup kurmak hesap ister (giriş bu cihazda kullanılabiliyorsa; web ve Expo Go'da istenmez).
  const canSignIn = useCanSignIn();
  const needsAccount = canSignIn && !store.me?.provider;
  const unreadRaw = useRpc<Record<string, number>>('unread_counts', { p_secret: secret }, 20000).data;
  const unread = unreadRaw && typeof unreadRaw === 'object' && !Array.isArray(unreadRaw) ? unreadRaw : {};
  // Davet bağlantısından gelen kod varsa katılma formu onunla açılır.
  const linked = cleanCode(useRoute<RouteProp<TabParams, 'Groups'>>().params?.code);
  const [form, setForm] = useState<'none' | 'create' | 'join'>(linked ? 'join' : 'none');
  const [name, setName] = useState('');
  const [code, setCode] = useState(linked);
  // Uygulama açıkken bağlantıya dokunulursa (sıcak açılış) form yine kodla açılır.
  useEffect(() => { if (linked) { setForm('join'); setCode(linked); } }, [linked]);
  // Grup = takım(lar): 1–3 takım seçilir, grup bu takımların bütün maçlarını tahmin eder (derbiler dahil). Turnuva kapsamı ve
  // açık lig yeni grupta sunulmuyor (eski gruplar çalışmaya devam eder).
  const [teamIds, setTeamIds] = useState<number[]>(() => { const first = store.mainTeam ?? store.teams[0]; return first ? [first.id] : []; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (call: () => Promise<Group>) => {
    setBusy(true); setError('');
    try {
      const group = await call();
      // Kodla katılmada hata mesajı yanıt olarak gelir (deneme sınırının sayılması için; bkz. join_group).
      const failed = (group as unknown as { error?: string }).error;
      if (failed) throw new ApiError('social', failed);
      setForm('none'); setName(''); setCode('');
      nav.setParams({ code: undefined } as never);
      state.reload();
      track(form === 'join' ? 'group_joined' : 'group_created', form === 'join' ? undefined : { teams: teamIds.length });
      // Gruptan tahmin isteği ve mesaj bildirimi gelebilsin (sistem izni bir kez sorulur).
      fbPushPermission().catch(() => {});
      nav.navigate('Group', { id: group.id });
    } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  const uniqueTeams = store.teams.filter((x, i, all) => all.findIndex((y) => y.name === x.name) === i);
  const toggleTeam = (id: number) => setTeamIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= MAX_SCOPE_TEAMS ? l : [...l, id]));
  const create = () => {
    const chosen = teamIds.map((id) => store.teams.find((x) => x.id === id)).filter((x): x is Team => !!x);
    if (!chosen.length) return;
    return run(() => rpc<Group>('create_group', {
      p_secret: secret, p_name: name.trim(), p_team_id: chosen[0].id, p_team_name: chosen.map((x) => x.name).join(' · ').slice(0, 80), p_team_logo: chosen[0].logo,
      // Tek takımda kapsam boş kalır (eski gruplarla aynı); birden çok takımda {type:'teams'}.
      p_scope: chosen.length > 1 ? { type: 'teams', ids: chosen.map((x) => x.id) } : null, p_kind: 'friends',
    }));
  };
  const canCreate = !!name.trim() && teamIds.length > 0;
  const join = () => run(() => rpc<Group>('join_group', { p_secret: secret, p_code: code.trim() }));
  const open = (next: 'create' | 'join') => { setError(''); setForm(form === next ? 'none' : next); };

  return (
    <>
      <Loader state={state}>
        {(groups) => groups.length ? (
          <Panel style={{ paddingVertical: 6 }}>
            {groups.map((g) => (
              <Pressable key={g.id} onPress={() => nav.navigate('Group', { id: g.id })} accessibilityRole="button" accessibilityLabel={g.name}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                <Crest uri={g.team.logo} size={36} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: t.fg }}>{g.name}{g.verified ? ' ✓' : ''}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: t.muted }}>{g.kind === 'open' ? `Açık lig · ${g.members} üye` : g.scope?.type === 'match' ? `Maç tribünü · ${g.members} üye` : `${g.members} üye · ${g.team.name}`}</Text>
                </View>
                {unread[g.id] ? (
                  <View accessibilityLabel={`${unread[g.id]} okunmamış mesaj`} style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: t.live }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{unread[g.id] > 9 ? '9+' : unread[g.id]}</Text>
                  </View>
                ) : null}
                <Icon.chevron color={t.fg} />
              </Pressable>
            ))}
          </Panel>
        ) : <Empty>Henüz bir tribünün yok. Tribün kur ya da arkadaşının gönderdiği kodla tribüne katıl.</Empty>}
      </Loader>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <View style={{ flex: 1 }}><Button kind={form === 'create' ? 'pri' : 'sec'} label="Tribün kur" onPress={() => open('create')} /></View>
        <View style={{ flex: 1 }}><Button kind={form === 'join' ? 'pri' : 'sec'} label="Tribüne katıl" onPress={() => open('join')} /></View>
      </View>

      {form === 'create' && needsAccount && (
        <Card style={{ marginTop: GAP, padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.fg }}>Tribün kurmak için hesabını bağla</Text>
          <Text style={{ fontSize: 13, color: t.muted, lineHeight: 18 }}>Tribünün ve üyelerin telefon değişse de kaybolmaz. Takma adın aynı kalır; e-posta ya da telefon numarası paylaşılmaz.</Text>
          <SignInButtons />
        </Card>
      )}
      {form === 'create' && !needsAccount && (
        <Card style={{ marginTop: GAP, padding: 16, gap: 12 }}>
          <Field value={name} onChange={setName} placeholder="Tribün adı" maxLength={40} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>Hangi takımların maçlarını tahmin edeceksiniz?</Text>
          {uniqueTeams.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {uniqueTeams.map((x) => {
                const on = teamIds.includes(x.id);
                return (
                  <Pressable key={x.id} onPress={() => toggleTeam(x.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={x.name}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, backgroundColor: on ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: on ? t.accent : 'transparent', opacity: !on && teamIds.length >= MAX_SCOPE_TEAMS ? 0.45 : 1 }}>
                    <Crest uri={x.logo} size={20} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>{x.name}</Text>
                    {on ? <Text style={{ fontSize: 13, color: t.accent, fontWeight: '800' }}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : <Text style={{ color: t.muted, fontSize: 13 }}>Önce Profil → Takımlarım'dan takım ekle.</Text>}
          <Text style={{ color: t.muted, fontSize: 12.5, lineHeight: 18 }}>
            En fazla {MAX_SCOPE_TEAMS} takım. Örneğin Galatasaray ve Fenerbahçe seçersen ikisinin bütün maçları, derbiler dahil, tribünde tahmin edilir. Tribünün sohbeti maçlara özel: her maçın odası başlamadan 1 saat önce açılır.
          </Text>
          {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
          <Button label={busy ? 'Kuruluyor…' : 'Kur'} disabled={busy || !canCreate} onPress={create} />
        </Card>
      )}
      {form === 'join' && (
        <Card style={{ marginTop: GAP, padding: 16, gap: 12 }}>
          <Field value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="Davet kodu (6 karakter)" maxLength={6} autoCapitalize="characters" />
          {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
          <Button label={busy ? 'Katılınıyor…' : 'Katıl'} disabled={busy || code.trim().length < 6} onPress={join} />
        </Card>
      )}
      <Text style={{ textAlign: 'center', color: t.muted, fontSize: 13, marginTop: 18 }}>Takma adın: {store.me?.name}</Text>
    </>
  );
}
