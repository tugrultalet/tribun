import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Team } from '../api';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Icon, LeagueBadge, HAIR } from '../ui';
import { LEAGUE_GROUPS } from '../leagueGroups';
import { TeamGrid } from './Picker';
import { Backdrop } from './Screen';

export default function Onboarding() {
  const t = useTheme();
  const store = useStore();
  const [step, setStep] = useState(0);
  const [teams, setTeams] = useState<Team[]>(store.teams);
  const [leagues, setLeagues] = useState<number[]>(store.leagues);
  const toggleLeague = (id: number) => setLeagues((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const toggleTeam = (team: Team) => setTeams((list) => (list.some((x) => x.id === team.id) ? list.filter((x) => x.id !== team.id) : [...list, team]));
  const title = (text: string) => <Text style={{ fontWeight: '800', fontSize: 32, lineHeight: 37, letterSpacing: -0.5, color: t.fg, marginTop: 6 }}>{text}</Text>;
  const lead = (text: string) => <Text style={{ color: t.muted, fontSize: 15, lineHeight: 22 }}>{text}</Text>;
  const progress = (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2].map((i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 3, backgroundColor: step >= i ? t.accent : t.line }} />)}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
    <Backdrop team={teams[0]?.name} />
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 }}>
        {step === 0 && (
          <View style={{ flex: 1, justifyContent: 'flex-end', gap: 14 }}>
            <Text style={{ fontWeight: '800', fontSize: 52, lineHeight: 56, letterSpacing: -1, color: t.fg }}>Sadece <Text style={{ color: t.accent }}>senin</Text> maçların.</Text>
            {lead('Takımını seç. Fikstür, canlı skor, kadro ve puan durumu tek yerde.')}
            <Button label="Başla" onPress={() => setStep(1)} />
          </View>
        )}
        {step === 1 && (
          <>
            {progress}
            {title('Hangi takımı tutuyorsun?')}
            {lead('Kulüp ya da milli takım; birden fazla seçebilirsin.')}
            <ScrollView style={{ flex: 1, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ paddingHorizontal: 0 }}><TeamGrid selected={(id) => teams.some((x) => x.id === id)} onToggle={toggleTeam} /></View>
            </ScrollView>
            <Button label={teams.length ? `Devam (${teams.length} takım)` : 'Takım seç'} disabled={!teams.length} onPress={() => setStep(2)} />
            {!teams.length && <Button kind="sec" label="Takım seçmeden turnuva seç" onPress={() => setStep(2)} />}
          </>
        )}
        {step === 2 && (
          <>
            {progress}
            {title('Turnuva takip etmek ister misin?')}
            {lead('Takip ettiğin turnuvanın yakın tarihli tüm maçları ana ekranında görünür. İstemezsen boş bırak: takımlarının maçları zaten katıldıkları bütün yarışmalarda gelir.')}
            <ScrollView style={{ flex: 1 }}>
              {LEAGUE_GROUPS.map(([type, name]) => {
                const list = store.meta.leagues.filter((l) => l.type === type);
                if (!list.length) return null;
                return (
                  <View key={type} style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: t.muted, marginBottom: 8, paddingHorizontal: 2 }}>{name.toLocaleUpperCase('tr')}</Text>
                    <Card>
                      {list.map((l, i) => {
                        const on = leagues.includes(l.id);
                        return (
                          <Pressable key={l.id} onPress={() => toggleLeague(l.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={l.name}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: i ? HAIR : 0, borderColor: t.line }}>
                            <LeagueBadge id={l.id} size={32} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontWeight: '600', fontSize: 15, color: t.fg }}>{l.name}</Text>
                              <Text style={{ fontSize: 12.5, color: t.muted }}>{l.country}</Text>
                            </View>
                            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : 'transparent' }}>
                              {on && <Icon.check color={t.accentInk} />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </Card>
                  </View>
                );
              })}
            </ScrollView>
            <Button label={teams.length || leagues.length ? 'Bitir' : 'En az bir takım ya da turnuva seç'} disabled={!teams.length && !leagues.length} onPress={() => store.finishOnboarding(teams, leagues)} />
          </>
        )}
      </View>
    </SafeAreaView>
    </View>
  );
}
