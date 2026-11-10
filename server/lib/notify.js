// Maç bildirimleri (saf, testli): iki fikstür hali arasındaki olaylar ve FCM mesajı.
// Bildirim konuya gider: takımın konusu team_<numara>. Uygulama, bildirimleri açan kullanıcıyı ana takımının konusuna abone eder.

const total = (s) => (s ? s[0] + s[1] : 0);

// Önceki ve yeni halden olaylar: maç başladı, gol (toplam skor arttı), maç bitti. Skor azalırsa (VAR iptali) bildirim yok.
export function matchEvents(prev, next) {
  if (!prev || !next || prev.id !== next.id) return [];
  const out = [];
  if (prev.st === 'ns' && next.st === 'live') out.push('start');
  if (next.st !== 'ns' && total(next.s) > total(prev.s)) out.push('goal');
  if (prev.st !== 'ft' && next.st === 'ft') out.push('end');
  return out;
}

// Aynı olay iki kez gönderilmesin diye anahtar (gol için skor dahil).
export const eventKey = (kind, f) => `${f.id}:${kind}:${f.s ? f.s.join('-') : ''}`;

const topicOf = (id) => `team_${id}`;
const score = (f) => `${f.h.name} ${f.s?.[0] ?? 0}–${f.s?.[1] ?? 0} ${f.a.name}`;

export function messageFor(kind, f) {
  const minute = f.min ? ` (${f.min}${f.extra ? `+${f.extra}` : ''}')` : '';
  const text = {
    start: { title: 'Maç başladı', body: `${f.h.name} – ${f.a.name}` },
    goal: { title: '⚽ GOL!', body: `${score(f)}${minute}` },
    end: { title: 'Maç sonu', body: score(f) },
  }[kind];
  return {
    // İki takımı da takip eden kullanıcıya bildirim bir kez gider.
    condition: `'${topicOf(f.h.id)}' in topics || '${topicOf(f.a.id)}' in topics`,
    notification: text,
    data: { matchId: String(f.id), kind },
    apns: { payload: { aps: { sound: 'default' } } },
  };
}
