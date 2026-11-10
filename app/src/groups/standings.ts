// Grup tahmin oyununun saf mantığı: puanlama, hafta/sezon sıralaması ve canlı "bu skorla biterse" tahmini.
// Ağ ve arayüzden bağımsızdır; Grup ekranı, sohbet özeti ve ileride Live Activity aynı fonksiyonları kullanır.
import type { Fixture } from '../api';

export type Member = { id: string; name: string };
export type Prediction = { profile_id: string; match_id: number; h: number; a: number; updated_at: string };
export type Detail = { me: string; members: Member[]; predictions: Prediction[]; pending?: { profile_id: string; match_id: number }[] };
export type Row = { member: Member; total: number; exact: number; played: number; live: number };

const DAY = 86400000;

/* ---------- Hafta (Pazartesi–Pazar; tarihler sunucunun Türkiye saatiyle verdiği YYYY-AA-GG) ---------- */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
}
export const sameWeek = (a: string, b: string) => weekStart(a) === weekStart(b);

/* ---------- Puanlama ---------- */
// Tahmin, maç başlamadan önce (veritabanı saatine göre) girildiyse geçerlidir.
export const isValid = (p: Prediction, f: Fixture) => new Date(p.updated_at).getTime() < f.ts * 1000;
export const hasStarted = (f: Fixture, now = Date.now()) => f.st !== 'ns' || now >= f.ts * 1000;
// Tam skor 3 puan, doğru sonuç 1 puan. Bitmemiş maçta null; `provisional` ise canlı skor şimdilik son skor sayılır.
export function points(p: Prediction, f: Fixture, provisional = false): number | null {
  const counts = f.st === 'ft' || (provisional && f.st === 'live');
  if (!counts || !f.s || !isValid(p, f)) return null;
  if (p.h === f.s[0] && p.a === f.s[1]) return 3;
  return Math.sign(p.h - p.a) === Math.sign(f.s[0] - f.s[1]) ? 1 : 0;
}

/* ---------- Sıralama ---------- */
// `inScope` verilmezse tüm maçlar (sezon). Canlı maçlar geçici puanla katılır; `live` bu geçici kısmı verir.
export function standings(detail: Detail, fixtures: Fixture[], inScope?: (f: Fixture) => boolean, provisional = true): Row[] {
  const byId = new Map(fixtures.filter((f) => !inScope || inScope(f)).map((f) => [f.id, f]));
  return detail.members
    .map((member) => {
      let total = 0, exact = 0, played = 0, live = 0;
      for (const p of detail.predictions) {
        const f = p.profile_id === member.id ? byId.get(p.match_id) : undefined;
        const pts = f ? points(p, f, provisional) : null;
        if (pts === null || !f) continue;
        total += pts; played += 1;
        if (pts === 3) exact += 1;
        if (f.st === 'live') live += pts;
      }
      return { member, total, exact, played, live };
    })
    .sort((a, b) => b.total - a.total || b.exact - a.exact || a.member.name.localeCompare(b.member.name, 'tr'));
}
// Sıra numaraları (eşit puan aynı sırayı alır).
export function ranks(rows: Row[]): number[] {
  return rows.map((r, i) => (i > 0 && rows[i - 1].total === r.total && rows[i - 1].exact === r.exact ? 0 : i + 1)).map((n, i, all) => n || all[i - 1]);
}
export function leaders(rows: Row[]): Member[] {
  if (!rows.length || rows[0].total <= 0) return [];
  return rows.filter((r) => r.total === rows[0].total).map((r) => r.member);
}

/* ---------- Maç başı özetleri ---------- */
// Maçı kaç kişi tahmin etti (gizli olanlar dahil): kendi tahminin + başkalarının görünen ve bekleyen tahminleri.
export function entryCount(detail: Detail, matchId: number): number {
  const seen = new Set(detail.predictions.filter((p) => p.match_id === matchId).map((p) => p.profile_id));
  for (const p of detail.pending ?? []) if (p.match_id === matchId) seen.add(p.profile_id);
  return seen.size;
}
const names = (ms: Member[]) => ms.map((m) => m.name).join(' ve ');
// Maç sonu sohbet özeti: "Tam skoru bilen: Ahmet (+3). Haftanın lideri: Mehmet." Grupta bu maça tahmin yoksa null.
export function finalSummary(detail: Detail, f: Fixture, fixtures: Fixture[]): string | null {
  if (f.st !== 'ft' || !f.s || !entryCount(detail, f.id)) return null;
  const exact = detail.predictions.filter((p) => p.match_id === f.id && points(p, f) === 3)
    .map((p) => detail.members.find((m) => m.id === p.profile_id)).filter((m): m is Member => !!m);
  const lead = leaders(standings(detail, fixtures, (x) => sameWeek(x.date, f.date), false));
  return [exact.length ? `Tam skoru bilen: ${names(exact)} (+3).` : 'Tam skoru bilen çıkmadı.', lead.length ? `Haftanın lideri: ${names(lead)}.` : ''].filter(Boolean).join(' ');
}
