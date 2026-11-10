// İstek sınırları (saf, testli).
//  - Kova: anahtar başına (ör. IP) dakikada `rate` istek, en çok `burst` birikir.
//  - Pencere: anahtar başına `windowMs` içinde en çok `max` olay (ör. kaynağa gidecek "soğuk" istek).

export class Buckets {
  constructor({ rate, burst, now = () => Date.now() }) {
    this.rate = rate; this.burst = burst; this.now = now;
    this.map = new Map();
  }
  take(key, cost = 1) {
    const t = this.now();
    const b = this.map.get(key) || { tokens: this.burst, at: t };
    b.tokens = Math.min(this.burst, b.tokens + ((t - b.at) / 60000) * this.rate);
    b.at = t;
    const ok = b.tokens >= cost;
    if (ok) b.tokens -= cost;
    this.map.set(key, b);
    return ok;
  }
  // Uzun süredir dolu (kullanılmayan) kovaları siler; bellek büyümesin.
  sweep() {
    const t = this.now();
    for (const [k, b] of this.map) if (t - b.at > 10 * 60000) this.map.delete(k);
  }
}

export class Windows {
  constructor({ max, windowMs, now = () => Date.now() }) {
    this.max = max; this.windowMs = windowMs; this.now = now;
    this.map = new Map();
  }
  // Olay için yer varsa sayar ve true döner.
  hit(key) {
    const t = this.now();
    const list = (this.map.get(key) || []).filter((x) => t - x < this.windowMs);
    const ok = list.length < this.max;
    if (ok) list.push(t);
    this.map.set(key, list);
    return ok;
  }
  sweep() {
    const t = this.now();
    for (const [k, list] of this.map) if (!list.some((x) => t - x < this.windowMs)) this.map.delete(k);
  }
}

// İsteği yapanın IP'si. Render gibi bir vekilin arkasında vekil gerçek IP'yi X-Forwarded-For'un SONUNA ekler; baştaki
// değerleri istemci uydurabileceği için son değer alınır. Vekil yoksa bağlantının adresi.
export function clientIp(headers, socketAddress) {
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return socketAddress || 'unknown';
}

// YYYY-AA-GG gerçek bir tarih mi ve bugünden en çok `days` gün uzakta mı?
export function dateInWindow(date, todayStr, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(d) || new Date(d).toISOString().slice(0, 10) !== date) return false;
  return Math.abs(d - Date.parse(`${todayStr}T00:00:00Z`)) <= days * 86400000;
}
