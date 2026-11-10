// Takip modeli: her şey takım üzerinden kurulur. Takibin kendisi bir takım listesi, bir ana takım ve her takım için
// hangi turnuvaların gösterileceğidir. Saf fonksiyonlar; arayüzden ve ağdan bağımsızdır.
import type { Fixture, League, Team } from './api';

export type FollowedTeam = Team & {
  // Milli takım mı? Milli takımın tüm maçları varsayılan olarak açıktır.
  kind?: 'national';
  // Kullanıcının seçtiği turnuvalar (turnuva numaraları). Yoksa varsayılan kural geçerlidir.
  sel?: number[];
};
export type Competition = { id: number; name: string; logo: string | null };

// Avrupa kupaları: katalogdaki UEFA turnuvaları (type 'cup').
export const euroIds = (leagues: League[]): Set<number> => new Set(leagues.filter((l) => l.type === 'cup').map((l) => l.id));

// Bir takımın fikstüründeki turnuvalar (çipler bunlardan oluşur), ilk görünme sırasıyla.
export function competitionsOf(teamId: number, fixtures: Fixture[]): Competition[] {
  const seen = new Map<number, Competition>();
  for (const f of fixtures) {
    if ((f.h.id === teamId || f.a.id === teamId) && !seen.has(f.lg)) seen.set(f.lg, { id: f.lg, name: f.lgName ?? '', logo: f.lgLogo ?? null });
  }
  return [...seen.values()];
}

// Varsayılan kural: ana takım ve milli takım için tüm turnuvalar; diğer takımlar için yalnızca Avrupa kupaları
// (takım Avrupa'da oynamıyorsa tüm turnuvalar).
export function defaultSelection(team: FollowedTeam, isMain: boolean, comps: number[], euro: Set<number>): number[] {
  if (isMain || team.kind === 'national') return comps;
  const eu = comps.filter((id) => euro.has(id));
  return eu.length ? eu : comps;
}
export function selectionOf(team: FollowedTeam, isMain: boolean, comps: number[], euro: Set<number>): number[] {
  return team.sel ?? defaultSelection(team, isMain, comps, euro);
}

// Takip edilen takımların, seçili turnuvalardaki maçları. Bir maç birden çok takip edilen takımı ilgilendirse de bir kez gelir.
export function followedFixtures(fixtures: Fixture[], teams: FollowedTeam[], main: number | undefined, euro: Set<number>): Fixture[] {
  const picks = new Map(teams.map((t) => [t.id, new Set(selectionOf(t, t.id === main, competitionsOf(t.id, fixtures).map((c) => c.id), euro))]));
  return fixtures.filter((f) => (picks.get(f.h.id)?.has(f.lg) ?? false) || (picks.get(f.a.id)?.has(f.lg) ?? false));
}
