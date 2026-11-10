import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Bellek + disk önbelleği. Kayıtlar { exp, data } biçimindedir.
// Bellek en çok `maxEntries` kayıt tutar (en uzun süredir kullanılmayan çıkarılır; disk kopyası kalır). Diskte 45 günden
// eski dosyalar açılışta ve 12 saatte bir silinir; böylece önbellek sınırsız büyümez.
const PINNED = new Set(['state', 'teams', 'known', 'national']);
const DISK_MAX_AGE = 45 * 24 * 3600 * 1000;
export function createCache(dir, { maxEntries = Number(process.env.CACHE_MAX_ENTRIES || 4000) } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const mem = new Map();
  function remember(key, entry) {
    mem.delete(key);
    mem.set(key, entry);
    if (mem.size <= maxEntries) return;
    for (const k of mem.keys()) {
      if (mem.size <= maxEntries) break;
      if (!PINNED.has(k)) mem.delete(k);
    }
  }
  function sweepDisk() {
    fs.promises.readdir(dir).then((files) => Promise.all(files.map(async (f) => {
      const p = path.join(dir, f);
      const st = await fs.promises.stat(p).catch(() => null);
      if (st && Date.now() - st.mtimeMs > DISK_MAX_AGE) await fs.promises.unlink(p).catch(() => {});
    }))).catch(() => {});
  }
  sweepDisk();
  setInterval(sweepDisk, 12 * 3600 * 1000).unref();
  const inflight = new Map();
  const fileOf = (key) => path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json');

  function load(key) {
    if (mem.has(key)) { const hit = mem.get(key); remember(key, hit); return hit; }
    try {
      const entry = JSON.parse(fs.readFileSync(fileOf(key), 'utf8'));
      remember(key, entry);
      return entry;
    } catch {
      return null;
    }
  }
  function persist(key, entry) {
    remember(key, entry);
    fs.promises.writeFile(fileOf(key), JSON.stringify(entry)).catch(() => {});
  }
  const save = (key, data, ttl) => persist(key, { exp: Date.now() + ttl, data });

  // Taze ise önbellekten döner; değilse üretir. Üretim başarısız olursa eski veriyi `stale` işaretiyle döner.
  function cached(key, ttl, produce) {
    const entry = load(key);
    if (entry && Date.now() < entry.exp) return Promise.resolve(entry.data);
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      try {
        const data = await produce();
        save(key, data, typeof ttl === 'function' ? ttl(data) : ttl);
        return data;
      } catch (err) {
        if (entry) return { ...entry.data, stale: true };
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  // Bu işlemde belleğe alınmış, `prefix` ile başlayan anahtarlar.
  const keys = (prefix) => [...mem.keys()].filter((k) => k.startsWith(prefix));
  return { load, persist, save, cached, keys };
}
