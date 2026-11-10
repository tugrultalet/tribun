// Kişisel tahmin puanı (saf mantık; ağdan ve arayüzden bağımsız, testli).
// Puanlama gruplarla aynıdır: tam skor 3, doğru sonuç 1; maç başlamadan girilmemiş tahmin sayılmaz.
import type { Fixture } from '../api';
import { points } from '../groups/standings.ts';

export type MyPick = { match_id: number; h: number; a: number; updated_at: string; kickoff: string | null };
// /api/results yanıtındaki biten maç.
export type Result = { id: number; st: 'ft'; s: [number, number]; ts: number; date?: string; lg?: number; h?: { id: number; name: string }; a?: { id: number; name: string } };
// /api/results yanıtındaki henüz bitmemiş maç (yalnızca adlar ve saat için).
export type OpenMatch = { id: number; st: string; s?: [number, number] | null; ts: number; date: string; lg: number; h: { id: number; name: string }; a: { id: number; name: string } };
export type Stats = { total: number; exact: number; correct: number; played: number; rate: number };

const asFixture = (r: Result) => ({ st: 'ft', s: r.s, ts: r.ts }) as unknown as Fixture;

export function personalStats(picks: MyPick[], results: Map<number, Result>): Stats {
  let total = 0, exact = 0, correct = 0, played = 0;
  for (const p of picks) {
    const r = results.get(p.match_id);
    if (!r) continue;
    const pts = points({ profile_id: '', match_id: p.match_id, h: p.h, a: p.a, updated_at: p.updated_at }, asFixture(r));
    if (pts === null) continue;
    played += 1; total += pts;
    if (pts === 3) exact += 1;
    if (pts > 0) correct += 1;
  }
  // isabet oranı: en az doğru sonucu bilinen tahminlerin oranı (0..1)
  return { total, exact, correct, played, rate: played ? correct / played : 0 };
}

// Sonucu sorulması gereken tahminler: başlama saatinin üzerinden en az 2 saat geçmiş (saat bilinmiyorsa tahminden 4 saat sonra).
export function needsResult(p: MyPick, now = Date.now()): boolean {
  const base = p.kickoff ? new Date(p.kickoff).getTime() + 2 * 3600000 : new Date(p.updated_at).getTime() + 4 * 3600000;
  return base <= now;
}
