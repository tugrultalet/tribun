// Sohbet akışı: grubun takımının maç olayları (gol, kırmızı kart, devre arası, maç sonu) sohbet mesajlarıyla
// zamana göre birleştirilir. Sistem mesajları sunucudan gelen olaylardan istemcide üretilir; veritabanına yazılmaz,
// bu yüzden her üye aynı mesajları görür ve tekrar oluşmaz. Saf fonksiyonlar: arayüzden ve ağdan bağımsızdır.
import type { Fixture, MatchEvent } from '../api';

export type SystemMsg = { kind: 'system'; id: string; at: number; side: 'h' | 'a' | null; text: string; tone: 'goal' | 'red' | 'info' };
export type ChatItem<M extends { created_at: string }> = { kind: 'chat'; id: string; at: number; msg: M } | SystemMsg;

const MIN = 60000;
const ABBR: Record<string, string> = {
  Galatasaray: 'GS', 'Fenerbahçe': 'FB', 'Beşiktaş': 'BJK', Trabzonspor: 'TS', 'İstanbul Başakşehir': 'İBFK', 'Türkiye': 'TÜR',
  'Manchester United': 'MUN', 'Manchester City': 'MCI', Liverpool: 'LIV', Arsenal: 'ARS', Chelsea: 'CHE', 'Real Madrid': 'RMA', Barcelona: 'BAR',
};
// Üç harfli kısa ad; bilinmeyen takımlarda adın ilk harfleri.
export function abbr(name: string): string {
  if (ABBR[name]) return ABBR[name];
  const words = name.replace(/\b(FK|SK|FC|CF|AFC|SC)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? name);
  return raw.slice(0, 3).toLocaleUpperCase('tr');
}

// Olayın tahmini zamanı: başlama saati + dakika (ilk yarıdan sonrası için 15 dk devre arası). Uzatma dakikaları eklenir.
export function eventTime(f: Fixture, e: Pick<MatchEvent, 'min' | 'extra'>): number {
  const m = e.min + (e.extra ?? 0) + (e.min > 45 ? 15 : 0);
  return f.ts * 1000 + m * MIN;
}

const clock = (e: Pick<MatchEvent, 'min' | 'extra'>) => `${e.min}'${e.extra ? `+${e.extra}` : ''}`;
const board = (f: Fixture, h: number, a: number) => `${abbr(f.h.name)} ${h}–${a} ${abbr(f.a.name)}`;

// Bir maçın olaylarından sistem mesajları üretir. `now` gelecekteki zamanları keser (tahmini saat ileri taşmasın).
export function systemMessages(f: Fixture, events: MatchEvent[], now: number, summary?: string | null): SystemMsg[] {
  const out: SystemMsg[] = [];
  const sorted = [...events].sort((x, y) => x.min - y.min || (x.extra ?? 0) - (y.extra ?? 0));
  let h = 0, a = 0, htH = 0, htA = 0;
  sorted.forEach((e, i) => {
    const at = Math.min(eventTime(f, e), now);
    if (e.k === 'goal') {
      const own = e.x === 'Kendi kalesine';
      // Kendi kalesine atılan golü rakip takım sayar.
      if ((e.side === 'h') !== own) h += 1; else a += 1;
      if (e.min <= 45) { htH = h; htA = a; }
      out.push({ kind: 'system', id: `${f.id}:${i}`, at, side: e.side, tone: 'goal', text: `⚽ ${clock(e)} ${e.p || 'Gol'}${own ? ' (k.k.)' : ''} · ${board(f, h, a)}` });
    } else if (e.k === 'r') {
      out.push({ kind: 'system', id: `${f.id}:${i}`, at, side: e.side, tone: 'red', text: `🟥 ${clock(e)} ${e.p || 'Kırmızı kart'} · ${e.side === 'h' ? f.h.name : f.a.name}` });
    }
  });
  const firstHalfEnd = f.ts * 1000 + 47 * MIN;
  const pastHalf = f.st === 'ft' || (f.st === 'live' && ((f.min ?? 0) > 45 || f.short === 'HT'));
  if (pastHalf && firstHalfEnd <= now) {
    out.push({ kind: 'system', id: `${f.id}:ht`, at: firstHalfEnd, side: null, tone: 'info', text: `⏸ Devre arası · ${board(f, htH, htA)}` });
  }
  if (f.st === 'ft' && f.s) {
    const last = sorted.length ? eventTime(f, sorted[sorted.length - 1]) : f.ts * 1000;
    const at = Math.min(Math.max(f.ts * 1000 + 110 * MIN, last + MIN), now);
    out.push({ kind: 'system', id: `${f.id}:ft`, at, side: null, tone: 'info', text: `🏁 Maç sonu · ${board(f, f.s[0], f.s[1])}` });
    // Grubun tahmin özeti ("Tam skoru bilen: …") maç sonu mesajının hemen ardından gelir.
    if (summary) out.push({ kind: 'system', id: `${f.id}:sum`, at: at + 1000, side: null, tone: 'info', text: `🎯 ${summary}` });
  }
  return out;
}

// Sohbet mesajları ve sistem mesajları zamana göre tek akışta birleşir (aynı anda olanlarda sohbet önce gelir).
export function mergeTimeline<M extends { id: number | string; created_at: string }>(chat: M[], system: SystemMsg[]): ChatItem<M>[] {
  const items: ChatItem<M>[] = [
    ...chat.map((msg) => ({ kind: 'chat' as const, id: `c${msg.id}`, at: new Date(msg.created_at).getTime(), msg })),
    ...system,
  ];
  return items.sort((x, y) => x.at - y.at || (x.kind === 'chat' ? -1 : 1) - (y.kind === 'chat' ? -1 : 1));
}
