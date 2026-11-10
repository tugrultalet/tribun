// Profil ekranının saf mantığı: sezon puanı, seri, rozetler ve "Tahminlerim" listesinin haftalara bölünmesi (testli).
import { weekStart } from '../groups/standings.ts';
import { type Ledger, type MyPick, type Result } from './stats.ts';

const TR = 3 * 3600000;
// Türkiye saatiyle YYYY-AA-GG.
export const trDate = (ms: number) => new Date(ms + TR).toISOString().slice(0, 10);
const pickTime = (p: MyPick) => (p.kickoff ? new Date(p.kickoff).getTime() : new Date(p.updated_at).getTime());

// Sezon 1 Temmuz'da başlar (Türkiye saatiyle).
export function seasonStart(now = Date.now()): number {
  const d = trDate(now);
  const y = Number(d.slice(0, 4)) - (Number(d.slice(5, 7)) < 7 ? 1 : 0);
  return Date.parse(`${y}-07-01T00:00:00+03:00`);
}

export type Outcome = 'exact' | 'correct' | 'miss';
export type PickRow = { pick: MyPick; result?: Result; pts: number | null; outcome?: Outcome; date: string; bonus?: number; joker?: boolean };

// Sonuç biliniyorsa puan (tam skor 3, doğru sonuç 1), maç başlamadan girilmemiş tahmin sayılmaz.
// Defterde satır varsa (veritabanında puanlandıysa) o geçerlidir: sürpriz bonusu ve joker dahil.
export function rowOf(p: MyPick, r: Result | undefined, l?: Ledger): PickRow {
  const date = trDate(pickTime(p));
  if (l) return { pick: p, result: r, pts: l.total, outcome: l.outcome, date, bonus: l.bonus, joker: l.joker };
  if (!r || new Date(p.updated_at).getTime() >= r.ts * 1000) return { pick: p, result: r, pts: null, date };
  const pts = p.h === r.s[0] && p.a === r.s[1] ? 3 : Math.sign(p.h - p.a) === Math.sign(r.s[0] - r.s[1]) ? 1 : 0;
  return { pick: p, result: r, pts, outcome: pts === 3 ? 'exact' : pts ? 'correct' : 'miss', date };
}

// Seri: üst üste en az doğru sonucu bilinen tahminler. `current` en son biten maçtan geriye, `best` tüm zamanlar.
export function streaks(rows: PickRow[]): { current: number; best: number } {
  const done = rows.filter((r) => r.outcome).sort((a, b) => pickTime(a.pick) - pickTime(b.pick));
  let run = 0, best = 0;
  for (const r of done) { run = r.outcome === 'miss' ? 0 : run + 1; best = Math.max(best, run); }
  return { current: run, best };
}

export const BADGES = [3, 5, 10] as const;
export const badgesFor = (best: number) => BADGES.filter((n) => best >= n);

export type Summary = { total: number; exact: number; correct: number; played: number; rate: number; streak: number; best: number; badges: number[] };
export function summary(picks: MyPick[], results: Map<number, Result>, now = Date.now(), ledger: Map<number, Ledger> = new Map()): Summary {
  const from = seasonStart(now);
  const rows = picks.filter((p) => pickTime(p) >= from).map((p) => rowOf(p, results.get(p.match_id), ledger.get(p.match_id)));
  let total = 0, exact = 0, correct = 0, played = 0;
  for (const r of rows) {
    if (r.pts === null || !r.outcome) continue;
    played += 1; total += r.pts;
    if (r.outcome === 'exact') exact += 1;
    if (r.outcome !== 'miss') correct += 1;
  }
  const st = streaks(rows);
  return { total, exact, correct, played, rate: played ? correct / played : 0, streak: st.current, best: st.best, badges: badgesFor(st.best) };
}

export type Filter = 'all' | 'exact' | 'miss';
export type Week = { start: string; rows: PickRow[]; points: number };

// Haftalara (Pazartesi–Pazar) bölünmüş liste, en yeni hafta ve maç önce.
export function byWeek(picks: MyPick[], results: Map<number, Result>, filter: Filter = 'all', ledger: Map<number, Ledger> = new Map()): Week[] {
  const rows = picks.map((p) => rowOf(p, results.get(p.match_id), ledger.get(p.match_id)))
    .filter((r) => filter === 'all' || r.outcome === filter)
    .sort((a, b) => pickTime(b.pick) - pickTime(a.pick));
  const weeks = new Map<string, Week>();
  for (const r of rows) {
    const k = weekStart(r.date);
    const w = weeks.get(k) ?? { start: k, rows: [], points: 0 };
    w.rows.push(r); w.points += r.pts ?? 0;
    weeks.set(k, w);
  }
  return [...weeks.values()];
}
