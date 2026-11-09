import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Bellek + disk önbelleği. Kayıtlar { exp, data } biçimindedir.
export function createCache(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const mem = new Map();
  const inflight = new Map();
  const fileOf = (key) => path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json');

  function load(key) {
    if (mem.has(key)) return mem.get(key);
    try {
      const entry = JSON.parse(fs.readFileSync(fileOf(key), 'utf8'));
      mem.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }
  function persist(key, entry) {
    mem.set(key, entry);
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
