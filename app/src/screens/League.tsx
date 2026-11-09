import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Fixture, LeagueFixtures, Standings, useApi } from '../api';
import { dayLabel, seasonLabel } from '../dates';
import { RootParams, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Empty, LeagueBadge, Loader, MatchList, Note, Section, StandingsTable, StarButton, Tabs } from '../ui';
import { Screen } from './Screen';

export default function League({ route }: NativeStackScreenProps<RootParams, 'League'>) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const id = route.params.id;
  const league = store.league(id);
  const [tab, setTab] = useState<'table' | 'fix'>('table');
  const table = useApi<Standings>(tab === 'table' ? `/api/standings/${id}` : null);
  const fixtures = useApi<LeagueFixtures>(tab === 'fix' ? `/api/league/${id}/fixtures` : null, 60000);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });
  return (
    <Screen league={id}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 16 }}>
        <LeagueBadge id={id} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 24, lineHeight: 28, letterSpacing: -0.3, color: t.fg }}>{league?.name ?? ''}</Text>
          <Text style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>{league?.country} · {seasonLabel(store.meta.season)}</Text>
        </View>
        <StarButton on={store.followsLeague(id)} onPress={() => store.toggleLeague(id)} label={`${league?.name} takip et`} />
      </View>
      <Tabs value={tab} onChange={setTab} options={[['table', 'Tablo'], ['fix', 'Fikstür']]} />
      {tab === 'table' ? (
        <>
          <Loader state={table}>
            {(d) => d.groups.length ? <StandingsTable data={d} highlight={store.teams.map((x) => x.id)} onTeam={(r) => nav.navigate('Team', { team: r.team })} /> : <Empty>Bu lig için puan durumu yok.</Empty>}
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
