import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { inviteFriend } from '../game/friendInvite';
import { useMyPicks, useOpenMatches, usePoints, useResults } from '../game/hooks';
import { ActivePicks, PicksList, splitPicks } from '../game/PicksView';
import { summary } from '../game/profile';
import { useNav } from '../nav';
import { useRpc } from '../social';
import { useStore } from '../store';
import { teamColor } from '../teamColors';
import { useTheme } from '../theme';
import { Card, Crest, Empty, HAIR, Icon, Seg } from '../ui';
import { Screen } from './Screen';
import { RestoreBlock } from './SignIn';

type Friend = { id: string; name: string; me: boolean; week: number; season: number };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Profilim (sosyal profil): avatar (ana takımın renginde halka) ve Puan · Tahmin · Arkadaş sayıları; Arkadaş sayısı
// Tribün → Arkadaşlarım'ı açar. Ad ve kısa bilgi, takımlar, Profili düzenle / Arkadaş ekle, rozetler, arkadaşlar arası
// sıra ve Aktif | Geçmiş | Takımlarım sekmeleri. Ayarlar sağ üstteki dişliden.
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
  const [tab, setTab] = useState<'active' | 'past' | 'teams'>('active');

  const friends = Array.isArray(friendsRaw) ? friendsRaw : [];
  const others = friends.filter((f) => !f.me);
  const ranking = [...friends].sort((a, b) => b.season - a.season || a.name.localeCompare(b.name, 'tr'));
  const myRank = ranking.findIndex((f) => f.me) + 1;
  const leader = ranking[0];
  const mine = ranking.find((f) => f.me);
  const main = store.mainTeam;
  const ring = teamColor(main?.name) ?? t.accent;
  const since = account?.created_at ? new Date(account.created_at) : null;
  const jokers = all.filter((p) => p.joker).length;
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
  const badge = (icon: string, line1: string, line2: string, on: boolean) => (
    <View key={icon} style={{ width: 64, alignItems: 'center', gap: 4 }} accessibilityLabel={`${line1} ${line2}${on ? '' : ' (henüz yok)'}`}>
      <View style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
        borderColor: on ? '#FDB912' : t.line, backgroundColor: on ? 'rgba(253,185,18,0.14)' : t.surface, opacity: on ? 1 : 0.55 }}>
        <Text style={{ fontSize: 23 }}>{icon}</Text>
      </View>
      <Text style={{ fontSize: 10.5, lineHeight: 13, color: t.muted, textAlign: 'center' }}>{line1}{'\n'}{line2}</Text>
    </View>
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
      {/* Üst: avatar ve sayılar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 }}>
        <Pressable onPress={() => nav.navigate('Account')} accessibilityRole="button" accessibilityLabel="Hesap"
          style={{ width: 84, height: 84, borderRadius: 42, padding: 3, backgroundColor: ring }}>
          <View style={{ flex: 1, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, borderWidth: 3, borderColor: t.bg }}>
            <Text style={{ fontSize: 32, fontWeight: '800', color: t.fg }}>{store.me.name.slice(0, 1).toLocaleUpperCase('tr')}</Text>
          </View>
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {stat(s.total, 'Puan')}
          {stat(all.length, 'Tahmin')}
          {stat(others.length, 'Arkadaş', goFriends)}
        </View>
      </View>

      <Text style={{ fontSize: 16, fontWeight: '800', color: t.fg, marginTop: 12 }}>{store.me.name}</Text>
      <Text style={{ fontSize: 13, color: t.muted, marginTop: 2, lineHeight: 18 }}>
        {[main ? `${main.name} taraftarı` : null, since ? `${MONTHS[since.getMonth()]} ${since.getFullYear()}'dan beri Tribün'de` : null].filter(Boolean).join(' · ')}
      </Text>
      {store.teams.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {store.teams.slice(0, 8).map((x) => (
            <Pressable key={x.id} onPress={() => nav.navigate('Team', { team: x })} accessibilityRole="button" accessibilityLabel={x.name}
              style={{ padding: 3, borderRadius: 7, backgroundColor: t.surface2 }}>
              <Crest uri={x.logo} size={20} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {button('Profili düzenle', () => nav.navigate('Account'))}
        {button('➕ Arkadaş ekle', () => secret && inviteFriend(secret), true)}
      </View>

      {/* Rozetler */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
        {badge('🔥', s.streak ? `${s.streak} maç` : 'Seri', 'seri', s.streak >= 3)}
        {badge('🎯', s.played ? `%${Math.round(s.rate * 100)}` : '–', 'isabet', s.played >= 5 && s.rate >= 0.5)}
        {badge('⚽', `${s.exact} tam`, 'skor', s.exact > 0)}
        {badge('🃏', jokers ? `${jokers} joker` : 'Joker', 'kullandın', jokers > 0)}
        {badge('🏆', 'Arkadaşlar', 'lideri', myRank === 1 && others.length > 0)}
      </View>

      {/* Arkadaşlar arası sıra */}
      {others.length > 0 && mine && leader && (
        <Pressable onPress={goFriends} accessibilityRole="button"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: pressed ? t.surface2 : t.surface })}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#FDB912', fontVariant: ['tabular-nums'] }}>{myRank}.</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.fg }}>Arkadaşlar arasında {myRank}.</Text>
            <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>
              Bu sezon · {myRank === 1 ? 'zirvedesin 👑' : `${leader.name}'in ${leader.season - mine.season} puan gerisindesin`}
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.accent }}>Sıralama ›</Text>
        </Pressable>
      )}

      {/* Aktif | Geçmiş | Takımlarım */}
      <View style={{ marginTop: 16 }}>
        <Seg value={tab} onChange={setTab} options={[['active', `Aktif${active.length ? ` · ${active.length}` : ''}`], ['past', 'Geçmiş'], ['teams', 'Takımlarım']]} />
      </View>
      <View style={{ marginTop: 10 }}>
        {tab === 'active' && <ActivePicks picks={active} open={open} onDeleted={picks.reload} />}
        {tab === 'past' && (past.length ? <PicksList picks={past} title="Geçmiş tahminlerim" /> : <Empty>Henüz biten maçta tahminin yok.</Empty>)}
        {tab === 'teams' && (
          <Card>
            {[...store.teams].sort((a, b) => Number(b.id === store.main) - Number(a.id === store.main)).map((team, i) => (
              <Pressable key={team.id} onPress={() => nav.navigate('Team', { team })} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: i ? HAIR : 0, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                <Crest uri={team.logo} size={28} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: t.fg }}>{team.name}</Text>
                {team.id === store.main && <Text style={{ color: t.accent, fontSize: 15 }}>★</Text>}
                <Icon.chevron color={t.fg} />
              </Pressable>
            ))}
            <View style={{ flexDirection: 'row', borderTopWidth: store.teams.length ? HAIR : 0, borderColor: t.line }}>
              <Pressable onPress={() => nav.navigate('Picker')} accessibilityRole="button" style={{ flex: 1, padding: 13 }}>
                <Text style={{ fontSize: 15, color: t.accent, fontWeight: '600' }}>+ Takım ekle</Text>
              </Pressable>
              <Pressable onPress={() => nav.navigate('MyTeams')} accessibilityRole="button" style={{ padding: 13 }}>
                <Text style={{ fontSize: 15, color: t.accent, fontWeight: '600' }}>Düzenle</Text>
              </Pressable>
            </View>
          </Card>
        )}
      </View>
    </Screen>
  );
}
