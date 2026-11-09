import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Team } from '../api';
import { useStore } from '../store';
import { font, useTheme } from '../theme';
import { Button, Card, Icon, LeagueBadge, HAIR } from '../ui';
import { TeamGrid } from './Picker';

export default function Onboarding() {
  const t = useTheme();
  const store = useStore();
  const [step, setStep] = useState(0);
  const [teams, setTeams] = useState<Team[]>(store.teams);
  const [leagues, setLeagues] = useState<number[]>(store.leagues);
  const toggleLeague = (id: number) => setLeagues((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const toggleTeam = (team: Team, leagueId: number) => {
    const adding = !teams.some((x) => x.id === team.id);
    setTeams((list) => (adding ? [...list, team] : list.filter((x) => x.id !== team.id)));
    if (adding) setLeagues((l) => (l.includes(leagueId) ? l : [...l, leagueId])); // takımın ligi otomatik eklenir
  };
  const title = (text: string) => <Text style={{ fontFamily: font.score, fontSize: 44, lineHeight: 44, color: t.fg, marginTop: 6 }}>{text.toLocaleUpperCase('tr')}</Text>;
  const lead = (text: string) => <Text style={{ color: t.muted, fontSize: 15, lineHeight: 22 }}>{text}</Text>;
  const progress = (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2].map((i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 3, backgroundColor: step >= i ? t.accent : t.line }} />)}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 }}>
        {step === 0 && (
          <View style={{ flex: 1, justifyContent: 'flex-end', gap: 14 }}>
            <Text style={{ fontFamily: font.score, fontSize: 76, lineHeight: 70, color: t.fg }}>SADECE <Text style={{ color: t.accent }}>SENİN</Text> MAÇLARIN.</Text>
            {lead('Takımını seç. Fikstür, canlı skor, kadro ve puan durumu tek yerde.')}
            <Button label="Başla" onPress={() => setStep(1)} />
          </View>
        )}
        {step === 1 && (
          <>
            {progress}
            {title('Hangi takımı tutuyorsun?')}
            {lead('Birden fazla seçebilirsin.')}
            <ScrollView style={{ flex: 1, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ paddingHorizontal: 0 }}><TeamGrid selected={(id) => teams.some((x) => x.id === id)} onToggle={toggleTeam} /></View>
            </ScrollView>
            <Button label={teams.length ? `Devam (${teams.length} takım)` : 'En az bir takım seç'} disabled={!teams.length} onPress={() => setStep(2)} />
          </>
        )}
        {step === 2 && (
          <>
            {progress}
            {title('Başka hangi ligleri takip edelim?')}
            {lead('Takımlarının ligleri otomatik eklendi.')}
            <ScrollView style={{ flex: 1 }}>
              <Card>
                {store.meta.leagues.map((l, i) => {
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
            </ScrollView>
            <Button label="Bitir" onPress={() => store.finishOnboarding(teams, leagues)} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
