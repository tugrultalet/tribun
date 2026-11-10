// Grup kapsamı: bir grubun hangi maçları tahmin ettiği. Kişisel takipten bağımsızdır.
//  - kapsamsız (mevcut gruplar): grubun takımının maçları
//  - {type:'leagues', ids}: seçilen turnuvaların maçları
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ApiError, Fixture, LeagueFixtures, TeamData, get } from '../api';
import type { Group } from '../social';

export { MAX_SCOPE_LEAGUES, inScope, scopeLeagues } from './scopeRules';
import { scopeLeagues } from './scopeRules';

const byTime = (a: Fixture, b: Fixture) => a.ts - b.ts || a.id - b.id;

// Turnuva numaralarına göre fikstürler (sunucu önbelleğinden); hatada eldeki veri kalır.
export function useLeagueFixtures(ids: number[], refreshMs = 60000) {
  const focused = useIsFocused();
  const key = [...ids].sort((a, b) => a - b).join(',');
  const [data, setData] = useState<Fixture[] | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef(key);
  current.current = key;
  const load = useCallback(async () => {
    if (!key) { setData(undefined); return; }
    setLoading(true);
    try {
      const lists = await Promise.all(key.split(',').map((id) => get<LeagueFixtures>(`/api/league/${id}/fixtures`)));
      if (current.current === key) { setData(lists.flatMap((l) => l.fixtures).sort(byTime)); setError(null); }
    } catch (e) { if (current.current === key) setError(e as ApiError); } finally { if (current.current === key) setLoading(false); }
  }, [key]);
  useEffect(() => {
    if (!key || !focused) return;
    load();
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [key, focused, refreshMs, load]);
  return { data, error, loading, reload: load };
}

// Grubun kapsamındaki tüm maçlar (Grup ekranı için): takım kapsamında takımın fikstürü, turnuva kapsamında turnuvaların fikstürü.
export function useGroupFixtures(group: Group | undefined) {
  const leagues = group ? scopeLeagues(group) : null;
  const league = useLeagueFixtures(leagues ?? []);
  const [team, setTeam] = useState<Fixture[] | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const focused = useIsFocused();
  const teamId = group && !leagues ? group.team.id : 0;
  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try { setTeam((await get<TeamData>(`/api/team/${teamId}`)).fixtures); setError(null); }
    catch (e) { setError(e as ApiError); } finally { setLoading(false); }
  }, [teamId]);
  useEffect(() => {
    if (!teamId || !focused) return;
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [teamId, focused, load]);
  return leagues ? league : { data: team, error, loading, reload: load };
}
