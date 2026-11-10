// Grup kapsamının saf kuralları (ağdan ve arayüzden bağımsız, testli).
//  - kapsamsız (eski gruplar): grubun takımının maçları
//  - {type:'teams', ids}: seçilen 1–3 takımın maçları (yeni arkadaş grupları)
//  - {type:'leagues', ids}: seçilen turnuvaların maçları (açık ligler ve eski gruplar)
import type { Fixture } from '../api';
import type { Group } from '../social';

export const MAX_SCOPE_LEAGUES = 5;
export const MAX_SCOPE_TEAMS = 3;
export const scopeLeagues = (g: Pick<Group, 'scope'>): number[] | null => (g.scope?.type === 'leagues' ? g.scope.ids : null);
// Takım kapsamlı grupta takımlar (eski gruplarda tek takım); turnuva kapsamında null.
export const scopeTeams = (g: Pick<Group, 'scope' | 'team'>): number[] | null =>
  g.scope?.type === 'leagues' ? null : g.scope?.type === 'teams' ? g.scope.ids : [g.team.id];
// Bu maç grubun kapsamında mı?
export function inScope(g: Pick<Group, 'scope' | 'team'>, f: Fixture): boolean {
  const lg = scopeLeagues(g);
  if (lg) return lg.includes(f.lg);
  const teams = scopeTeams(g) ?? [];
  return teams.includes(f.h.id) || teams.includes(f.a.id);
}

// Derbi: dört büyükten (Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor) ikisinin karşılaşması ya da grubun seçtiği iki
// takımın birbiriyle oynadığı maç. Maç odası farklı renkte ve "DERBİ" rozetiyle gösterilir.
export const BIG_FOUR = [645, 611, 549, 998];
const BIG_NAMES = ['galatasaray', 'fenerbahçe', 'beşiktaş', 'trabzonspor'];
export function isDerby(f: { h: { id: number }; a: { id: number } }, g?: Pick<Group, 'scope' | 'team'>): boolean {
  if (BIG_FOUR.includes(f.h.id) && BIG_FOUR.includes(f.a.id)) return true;
  const teams = g ? scopeTeams(g) : null;
  return !!teams && teams.length > 1 && teams.includes(f.h.id) && teams.includes(f.a.id);
}
// Arşivdeki odalar yalnızca takım adlarını taşır: adla dört büyük kontrolü.
export const isDerbyByName = (home: string | null, away: string | null) =>
  [home, away].every((n) => !!n && BIG_NAMES.some((b) => n.toLocaleLowerCase('tr').includes(b)));
