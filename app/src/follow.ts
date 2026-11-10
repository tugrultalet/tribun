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

// Aynı takımın kopyalarını tanımak için anahtar: tür + ad (numaralar farklı kaynaklardan gelmiş olsa da aynı takım tek sayılır).
export const teamKey = (t: Pick<FollowedTeam, 'name' | 'kind'>) => `${t.kind ?? 'club'}:${t.name.trim().toLocaleLowerCase('tr')}`;

// Takip listesindeki kopyaları temizler: aynı takımın ilk kaydı kalır (ana takım başta olduğu için onun kaydı korunur),
// ana takım silinen bir kopyaya işaret ediyorsa kalan kayda yönlendirilir. Sıra korunur.
export function dedupeTeams(teams: FollowedTeam[], main: number | undefined): { teams: FollowedTeam[]; main: number | undefined } {
  const ordered = main === undefined ? teams : [...teams.filter((t) => t.id === main), ...teams.filter((t) => t.id !== main)];
  const keep = new Map<string, FollowedTeam>();
  const alias = new Map<number, number>();
  for (const t of ordered) {
    const k = teamKey(t);
    const first = keep.get(k);
    if (!first) keep.set(k, t); else alias.set(t.id, first.id);
  }
  const kept = new Set([...keep.values()].map((t) => t.id));
  const out = teams.filter((t) => kept.has(t.id) && keep.get(teamKey(t))?.id === t.id);
  return { teams: out, main: main === undefined ? undefined : (alias.get(main) ?? main) };
}

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
