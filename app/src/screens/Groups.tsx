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
import { MAX_SCOPE_LEAGUES } from '../groups/scope';
import { Button, Card, Crest, Empty, GAP, Icon, Loader, Panel, Seg } from '../ui';
import { Screen } from './Screen';
import { fbPushPermission } from '../fb';
import { RestoreBlock, SignInButtons, useCanSignIn } from './SignIn';

import { Field } from '../ui';

// Gruplar sekmesi: takma ad (ilk kez), gruplarım, grup kurma ve koda katılma.
export default function Groups() {
  const store = useStore();
  return (
    <Screen tab title="Gruplar">
      {store.me ? <MyGroups secret={store.me.secret} /> : <NameForm />}
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
        <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>Grup kur, arkadaşlarını davet et, takımının maçlarına skor tahmini gir ve grupta sohbet et. Başlamak için bir takma ad seç.</Text>
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
  const [team, setTeam] = useState<Team | undefined>(store.mainTeam ?? store.teams[0]);
  // Kapsam: "Bu grupta hangi maçları tahmin edeceksiniz?" Bir takımın maçları ya da seçilen turnuvalar.
  const [kind, setKind] = useState<'team' | 'leagues'>('team');
  // Lig türü: arkadaş grubu (sohbet, herkes birbirini görür) ya da açık lig (herkese açık bağlantı, sıralama, kurucu duyurusu).
  const [type, setType] = useState<'friends' | 'open'>('friends');
  const [picked, setPicked] = useState<number[]>([]);
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
      track(form === 'join' ? 'group_joined' : 'group_created', form === 'join' ? undefined : { scope: kind });
      // Gruptan tahmin isteği ve mesaj bildirimi gelebilsin (sistem izni bir kez sorulur).
      fbPushPermission().catch(() => {});
      nav.navigate('Group', { id: group.id });
    } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  const togglePicked = (id: number) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= MAX_SCOPE_LEAGUES ? l : [...l, id]));
  const create = () => {
    if (kind === 'leagues') {
      const chosen = picked.map((id) => store.league(id)).filter((l): l is NonNullable<typeof l> => !!l);
      if (!chosen.length) return;
      return run(() => rpc<Group>('create_group', {
        p_secret: secret, p_name: name.trim(), p_team_id: 0, p_team_name: chosen.map((l) => l.name).join(', ').slice(0, 80), p_team_logo: chosen[0].logo,
        p_scope: { type: 'leagues', ids: picked }, p_kind: type,
      }));
    }
    return team && run(() => rpc<Group>('create_group', { p_secret: secret, p_name: name.trim(), p_team_id: team.id, p_team_name: team.name, p_team_logo: team.logo, p_kind: type }));
  };
  const canCreate = !!name.trim() && (kind === 'leagues' ? picked.length > 0 : !!team);
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
                  <Text numberOfLines={1} style={{ fontSize: 13, color: t.muted }}>{g.kind === 'open' ? `Açık lig · ${g.members} üye` : g.last_message ? `${g.last_message.name}: ${g.last_message.body}` : `${g.members} üye · ${g.team.name}`}</Text>
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
        ) : <Empty>Henüz bir grubun yok. Bir grup kur ya da arkadaşının gönderdiği kodla katıl.</Empty>}
      </Loader>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <View style={{ flex: 1 }}><Button kind={form === 'create' ? 'pri' : 'sec'} label="Lig kur" onPress={() => open('create')} /></View>
        <View style={{ flex: 1 }}><Button kind={form === 'join' ? 'pri' : 'sec'} label="Kodla katıl" onPress={() => open('join')} /></View>
      </View>

      {form === 'create' && needsAccount && (
        <Card style={{ marginTop: GAP, padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.fg }}>Grup kurmak için hesabını bağla</Text>
          <Text style={{ fontSize: 13, color: t.muted, lineHeight: 18 }}>Grubun ve üyelerin telefon değişse de kaybolmaz. Takma adın aynı kalır; e-posta ya da telefon numarası paylaşılmaz.</Text>
          <SignInButtons />
        </Card>
      )}
      {form === 'create' && !needsAccount && (
        <Card style={{ marginTop: GAP, padding: 16, gap: 12 }}>
          <Seg value={type} onChange={setType} options={[['friends', 'Arkadaş grubu'], ['open', 'Açık lig']]} />
          <Text style={{ fontSize: 12.5, color: t.muted, lineHeight: 18 }}>
            {type === 'friends' ? 'En fazla 50 kişi; sohbet ve maç odaları var, herkes birbirinin tahminini görür.' : 'Bağlantıyı alan herkes katılır; ilk 10 ve herkesin kendi sırası görünür. Üyeler sohbet edemez, yalnızca sen duyuru yazarsın.'}
          </Text>
          <Field value={name} onChange={setName} placeholder={type === 'open' ? 'Lig adı' : 'Grup adı'} maxLength={40} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>Bu {type === 'open' ? 'ligde' : 'grupta'} hangi maçları tahmin edeceksiniz?</Text>
          <Seg value={kind} onChange={setKind} options={[['team', 'Bir takımın maçları'], ['leagues', 'Turnuvalar']]} />
          {kind === 'leagues' ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {store.meta.leagues.map((l) => {
                  const on = picked.includes(l.id);
                  return (
                    <Pressable key={l.id} onPress={() => togglePicked(l.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={l.name}
                      style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, backgroundColor: on ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: on ? t.accent : 'transparent' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>{l.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: t.muted, fontSize: 12.5 }}>En fazla {MAX_SCOPE_LEAGUES} turnuva seçebilirsin. Kapsam kişisel takibinden bağımsızdır.</Text>
            </>
          ) : store.teams.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {store.teams.filter((x, i, all) => all.findIndex((y) => y.name === x.name) === i).map((x) => {
                const on = x.id === team?.id;
                return (
                  <Pressable key={x.id} onPress={() => setTeam(x)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={x.name}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, backgroundColor: on ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: on ? t.accent : 'transparent' }}>
                    <Crest uri={x.logo} size={20} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>{x.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : <Text style={{ color: t.muted, fontSize: 13 }}>Bir takım seçmek için önce takım takip et ya da "Turnuvalar"ı seç.</Text>}
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
