// Grup kapsamının saf kuralları (ağdan ve arayüzden bağımsız, testli).
import type { Fixture } from '../api';
import type { Group } from '../social';

export const MAX_SCOPE_LEAGUES = 5;
export const scopeLeagues = (g: Pick<Group, 'scope'>): number[] | null => (g.scope?.type === 'leagues' ? g.scope.ids : null);
// Bu maç grubun kapsamında mı?
export function inScope(g: Pick<Group, 'scope' | 'team'>, f: Fixture): boolean {
  const lg = scopeLeagues(g);
  return lg ? lg.includes(f.lg) : f.h.id === g.team.id || f.a.id === g.team.id;
}
