import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { National, Team, useApi } from '../api';
import type { FollowedTeam } from '../follow';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Crest } from '../ui';
import { NationalTeams, TeamGrid } from './Picker';
import { Backdrop } from './Screen';

const STEPS = 4;
const national = (team: Team): FollowedTeam => ({ ...team, kind: 'national' });

// İlk açılış: 1) tuttuğun takım (ana takım), 2) milli takım, 3) sevdiğin başka takımlar, 4) grup (atlanabilir).
// Turnuva seçimi sorulmaz: varsayılan kurallar geçerlidir, sonra Takımlarım'dan değiştirilir.
export default function Onboarding() {
  const t = useTheme();
  const store = useStore();
  const [step, setStep] = useState(0);
  const [main, setMain] = useState<FollowedTeam | null>(store.mainTeam ?? null);
  const [country, setCountry] = useState<string | undefined>();
  const [nat, setNat] = useState<FollowedTeam[]>(store.teams.filter((x) => x.kind === 'national' && x.id !== store.main));
  const [others, setOthers] = useState<FollowedTeam[]>(store.teams.filter((x) => x.kind !== 'national' && x.id !== store.main));
  const preselected = useRef(false);

  const title = (text: string) => <Text style={{ fontWeight: '800', fontSize: 32, lineHeight: 37, letterSpacing: -0.5, color: t.fg, marginTop: 6 }}>{text}</Text>;
  const lead = (text: string) => <Text style={{ color: t.muted, fontSize: 15, lineHeight: 22 }}>{text}</Text>;
  const progress = (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: STEPS }, (_, i) => i + 1).map((i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 3, backgroundColor: step >= i ? t.accent : t.line }} />)}
    </View>
  );
  const all = (): FollowedTeam[] => (main ? [main, ...nat.filter((x) => x.id !== main.id), ...others.filter((x) => x.id !== main.id && !nat.some((n) => n.id === x.id))] : [...nat, ...others]);
  const finish = (tab?: 'Groups') => store.finishOnboarding(all(), main?.id, tab);
  // Ana takım zaten milli takımsa milli takım adımı atlanır.
  const next = () => setStep(step === 1 && main?.kind === 'national' ? 3 : step + 1);

  const pickMain = (team: Team, kind: 'club' | 'national', ctry?: string) => {
    if (main?.id === team.id) return setMain(null);
    setMain(kind === 'national' ? national(team) : team);
    setCountry(kind === 'club' ? ctry : undefined);
  };
  const toggleNat = (team: Team) => setNat((l) => (l.some((x) => x.id === team.id) ? l.filter((x) => x.id !== team.id) : [...l, national(team)]));
  const toggleOther = (team: Team, kind: 'club' | 'national') => {
    if (team.id === main?.id || nat.some((x) => x.id === team.id)) return;
    setOthers((l) => (l.some((x) => x.id === team.id) ? l.filter((x) => x.id !== team.id) : [...l, kind === 'national' ? national(team) : team]));
  };

  // Milli takım adımı: Türkiye önceden seçilir; ana takım başka ülkedense kendi ülkesinin milli takımı önerilir.
  const natList = useApi<National>(step === 2 ? '/api/national' : null);
  useEffect(() => {
    if (step !== 2 || preselected.current || !natList.data) return;
    preselected.current = true;
    const tr = natList.data.teams.find((x) => x.name === 'Türkiye');
    if (tr && !nat.some((x) => x.id === tr.id)) setNat((l) => [...l, national(tr)]);
  }, [step, natList.data]);
  const suggestion = country && country !== 'Türkiye' ? natList.data?.teams.find((x) => x.name === country) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop team={main?.name} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 }}>
          {step === 0 && (
            <View style={{ flex: 1, justifyContent: 'flex-end', gap: 14 }}>
              <Text style={{ fontWeight: '800', fontSize: 52, lineHeight: 56, letterSpacing: -1, color: t.fg }}>Sadece <Text style={{ color: t.accent }}>senin</Text> maçların.</Text>
              {lead('Takımını seç. Fikstür, canlı skor, kadro ve puan durumu tek yerde; arkadaşlarınla tahmin oyunu da cabası.')}
              <Button label="Başla" onPress={() => setStep(1)} />
            </View>
          )}
          {step === 1 && (
            <>
              {progress}
              {title('Tuttuğun takım hangisi?')}
              {lead('Tek takım seç. Renkler, canlı skor ve öncelikli bildirimler bu takıma göre olur.')}
              <ScrollView style={{ flex: 1, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
                <TeamGrid selected={(id) => main?.id === id} onToggle={pickMain} />
              </ScrollView>
              <Button label={main ? `Devam · ${main.name}` : 'Takım seç'} disabled={!main} onPress={next} />
            </>
          )}
          {step === 2 && (
            <>
              {progress}
              {title('Milli takımı da takip edelim mi?')}
              {lead('Milli takımın tüm maçları (hazırlık, elemeler, turnuvalar) ana ekranına gelir.')}
              {suggestion && !nat.some((x) => x.id === suggestion.id) && (
                <Pressable onPress={() => toggleNat(suggestion)} accessibilityRole="button" accessibilityLabel={`${suggestion.name} milli takımını ekle`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: t.surface2 }}>
                  <Crest uri={suggestion.logo} size={28} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.fg }}>Ülkenin milli takımı: {suggestion.name}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>Ekle</Text>
                </Pressable>
              )}
              <ScrollView style={{ flex: 1, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
                <NationalTeams selected={(id) => nat.some((x) => x.id === id)} onToggle={toggleNat} />
              </ScrollView>
              <Button label={nat.length ? `Devam (${nat.length} milli takım)` : 'Milli takım istemiyorum'} onPress={next} />
            </>
          )}
          {step === 3 && (
            <>
              {progress}
              {title('Sevdiğin başka takımlar var mı?')}
              {lead('İstersen ekle; bunlar için varsayılan olarak yalnızca Avrupa kupası maçları gösterilir (Avrupa\'da oynamıyorlarsa tüm maçları). Sonra Takımlarım\'dan değiştirebilirsin.')}
              <ScrollView style={{ flex: 1, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
                <TeamGrid selected={(id) => id === main?.id || nat.some((x) => x.id === id) || others.some((x) => x.id === id)} onToggle={toggleOther} />
              </ScrollView>
              <Button label={others.length ? `Devam (${others.length} takım)` : 'Atla'} onPress={() => setStep(4)} />
            </>
          )}
          {step === 4 && (
            <>
              {progress}
              <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
                {title('Arkadaşlarınla oyna')}
                {lead('Grup kur, davet linkini WhatsApp\'tan gönder; maçlara skor tahmini yapın, sohbet edin. Ya da arkadaşının gönderdiği kodla katıl.')}
              </View>
              <Button label="Grup kur / koda katıl" onPress={() => finish('Groups')} />
              <Button kind="sec" label="Şimdilik atla" onPress={() => finish()} />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
