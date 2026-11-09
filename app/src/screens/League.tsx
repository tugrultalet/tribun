import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Fixture, LeagueFixtures, Standings, useApi } from '../api';
import { dayLabel, seasonLabel } from '../dates';
import { RootParams, useNav } from '../nav';
import { useStore } from '../store';
import { font, useTheme } from '../theme';
import { BackBar, Empty, LeagueBadge, Loader, MatchList, Note, Section, Seg, StandingsTable, StarButton, TableMode, Tabs } from '../ui';
import { Screen } from './Screen';

export default function League({ route }: NativeStackScreenProps<RootParams, 'League'>) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const id = route.params.id;
  const league = store.league(id);
  const [tab, setTab] = useState<'table' | 'fix'>('table');
  const [mode, setMode] = useState<TableMode>('short');
  const table = useApi<Standings>(tab === 'table' ? `/api/standings/${id}` : null);
  const fixtures = useApi<LeagueFixtures>(tab === 'fix' ? `/api/league/${id}/fixtures` : null, 60000);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });
  return (
    <Screen header={<BackBar onBack={nav.goBack} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 16 }}>
        <LeagueBadge id={id} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.score, fontSize: 30, lineHeight: 32, color: t.fg }}>{(league?.name ?? '').toLocaleUpperCase('tr')}</Text>
          <Text style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>{league?.country} · {seasonLabel(store.meta.season)}</Text>
        </View>
        <StarButton on={store.followsLeague(id)} onPress={() => store.toggleLeague(id)} label={`${league?.name} takip et`} />
      </View>
      <Tabs value={tab} onChange={setTab} options={[['table', 'Puan durumu'], ['fix', 'Fikstür']]} />
      {tab === 'table' ? (
        <>
          <Seg style={{ marginTop: 12 }} value={mode} onChange={setMode} options={[['short', 'Kısa'], ['full', 'Tam'], ['form', 'Form']]} />
          <Loader state={table}>
            {(d) => d.groups.length ? <StandingsTable data={d} mode={mode} highlight={store.teams.map((x) => x.id)} onTeam={(r) => nav.navigate('Team', { team: r.team })} /> : <Empty>Bu lig için puan durumu yok.</Empty>}
          </Loader>
        </>
      ) : (
        <Loader state={fixtures}>{(d) => <FixtureDays data={d} today={store.meta.today} onMatch={openMatch} />}</Loader>
      )}
    </Screen>
  );
}

export function FixtureDays({ data, today, onMatch, showLeague }: { data: { limited: boolean; fixtures: Fixture[] }; today: string; onMatch: (f: Fixture) => void; showLeague?: boolean }) {
  const dates = [...new Set(data.fixtures.map((f) => f.date))];
  return (
    <>
      {data.limited && <Note>Ücretsiz API planında yalnızca dün, bugün ve yarının maçları alınabiliyor. Tam fikstür için ücretli plan gerekir.</Note>}
      {dates.map((d) => (
        <Section key={d} title={dayLabel(d, today)}>
          <MatchList fixtures={data.fixtures.filter((f) => f.date === d)} onMatch={onMatch} showLeague={showLeague} />
        </Section>
      ))}
      {!dates.length && <Empty>Bu aralıkta maç yok.</Empty>}
    </>
  );
}
