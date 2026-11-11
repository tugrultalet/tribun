import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { inviteFriend } from '../game/friendInvite';
import { useMyPicks, useOpenMatches, usePoints, useResults } from '../game/hooks';
import { ActivePicks, PicksList, splitPicks } from '../game/PicksView';
import { summary } from '../game/profile';
import { useNav } from '../nav';
import { useRpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Crest, Empty, HAIR, Icon, Seg } from '../ui';
import { Screen } from './Screen';
import { RestoreBlock } from './SignIn';

type Friend = { id: string; name: string; me: boolean; week: number; season: number };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Profilim: üstte profil kartı (avatar ve köşesinde ana takımın logosu, ad, kısa bilgi, Puan · Tahmin · Arkadaş, Profili
// düzenle / Arkadaş ekle); altında ince "Takip ettiğim takımlar" kartı; sonra Aktif | Geçmiş tahminler. Arkadaş sayısı
// Tribün → Arkadaşlarım'ı açar. Ayarlar sağ üstteki dişliden.
export default function Profile() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const secret = store.me?.secret;
  const picks = useMyPicks(60000);
  const all = picks.data ?? [];
  const results = useResults(all);
  const open = useOpenMatches(all);
  const ledger = usePoints();
  const { active, past } = useMemo(() => splitPicks(all, results, open), [all, results.size, open.size]);
  const s = useMemo(() => summary(all, results, Date.now(), ledger), [all, results.size, ledger]);
  const friendsRaw = useRpc<Friend[]>('my_friends', secret ? { p_secret: secret } : null, 120000).data;
  const account = useRpc<{ created_at?: string }>('account_info', secret ? { p_secret: secret } : null).data;
  const [tab, setTab] = useState<'active' | 'past'>('active');

  const friends = Array.isArray(friendsRaw) ? friendsRaw : [];
  const others = friends.filter((f) => !f.me);
  const main = store.mainTeam;
  const since = account?.created_at ? new Date(account.created_at) : null;
  const goFriends = () => nav.navigate('Tabs', { screen: 'Groups', params: { view: 'friends', at: Date.now() } });

  const gear = (
    <Pressable onPress={() => nav.navigate('Settings')} accessibilityRole="button" accessibilityLabel="Ayarlar" hitSlop={10} style={{ padding: 6 }}>
      <Icon.tabSettings color={t.fg} />
    </Pressable>
  );

  if (!store.me) {
    return (
      <Screen tab title="Profilim" right={gear}>
        <Empty>Tahmin yapmak ve puan toplamak için Tribün sekmesinden bir takma ad seç.</Empty>
        <RestoreBlock />
      </Screen>
    );
  }

  const stat = (value: number | string, label: string, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${value} ${label}`} style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 12, color: onPress ? t.accent : t.muted, fontWeight: onPress ? '700' : '400' }}>{label}{onPress ? ' ›' : ''}</Text>
    </Pressable>
  );
  const button = (label: string, onPress: () => void, green?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
        backgroundColor: green ? (pressed ? '#1DA851' : '#25D366') : pressed ? t.line : t.surface2 })}>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: green ? '#05301A' : t.fg }}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen tab title="Profilim" right={gear} onRefresh={picks.reload}>
      {/* Profil kartı: avatar (köşesinde ana takımın logosu), ad, kısa bilgi, Puan · Tahmin · Arkadaş, iki buton */}
      <Card style={{ marginTop: 4, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => nav.navigate('Account')} accessibilityRole="button" accessibilityLabel="Hesap" style={{ width: 72, height: 72 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: t.fg }}>{store.me.name.slice(0, 1).toLocaleUpperCase('tr')}</Text>
            </View>
            {main ? (
              <View style={{ position: 'absolute', right: -4, bottom: -4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, borderWidth: 2, borderColor: t.line }}>
                <Crest uri={main.logo} size={20} />
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            <Text numberOfLines={1} style={{ fontSize: 19, fontWeight: '800', color: t.fg }}>{store.me.name}</Text>
            {main ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Crest uri={main.logo} size={15} />
                <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.muted }}>{main.name} taraftarı</Text>
              </View>
            ) : null}
            {since ? <Text style={{ fontSize: 12.5, color: t.muted }}>{MONTHS[since.getMonth()]} {since.getFullYear()}'dan beri Tribün'de</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 14, paddingVertical: 10, borderTopWidth: HAIR, borderBottomWidth: HAIR, borderColor: t.line }}>
          {stat(s.total, 'Puan')}
          <View style={{ width: HAIR, backgroundColor: t.line }} />
          {stat(all.length, 'Tahmin')}
          <View style={{ width: HAIR, backgroundColor: t.line }} />
          {stat(others.length, 'Arkadaş', goFriends)}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {button('Profili düzenle', () => nav.navigate('Account'))}
          {button('➕ Arkadaş ekle', () => secret && inviteFriend(secret), true)}
        </View>
      </Card>

      {/* İnce kart: takip edilen takımlar */}
      <Card style={{ marginTop: 10 }}>
        <Pressable onPress={() => nav.navigate('MyTeams')} accessibilityRole="button" accessibilityLabel="Takip ettiğim takımlar"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>Takip ettiğim takımlar</Text>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            {store.teams.length ? store.teams.slice(0, 5).map((x) => <Crest key={x.id} uri={x.logo} size={24} />) : <Text style={{ fontSize: 13, color: t.accent, fontWeight: '600' }}>Takım ekle</Text>}
          </View>
          <Icon.chevron color={t.fg} />
        </Pressable>
      </Card>

      {/* Aktif | Geçmiş */}
      <View style={{ marginTop: 14 }}>
        <Seg value={tab} onChange={setTab} options={[['active', `Aktif${active.length ? ` · ${active.length}` : ''}`], ['past', 'Geçmiş']]} />
      </View>
      <View style={{ marginTop: 10 }}>
        {tab === 'active' ? <ActivePicks picks={active} open={open} onDeleted={picks.reload} />
          : past.length ? <PicksList picks={past} title="Geçmiş tahminlerim" /> : <Empty>Henüz biten maçta tahminin yok.</Empty>}
      </View>
    </Screen>
  );
}
