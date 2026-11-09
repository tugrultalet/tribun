import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const sample = (name) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(`./samples/${name}.json`, import.meta.url)), 'utf8'));

// Sahte `fetch`: gelen istekleri kaydeder, `handler(path)` yanıtını döner.
export function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    const path = String(url).replace(/^https?:\/\/[^/]+\//, '');
    calls.push({ path, headers: opts?.headers });
    const { status = 200, headers = {}, body } = await handler(path);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      json: async () => body,
    };
  };
  fn.calls = calls;
  return fn;
}
