// Supabase'e sunucu yetkisiyle (service role) çağrı: yalnızca server_* fonksiyonları. Anahtar ortam değişkenindedir
// (SUPABASE_SERVICE_ROLE_KEY), repoda durmaz.
export function createSupa({ url = process.env.SUPABASE_URL || 'https://kbekepfgbgxlyqllkkuu.supabase.co', key = process.env.SUPABASE_SERVICE_ROLE_KEY } = {}) {
  if (!key) return null;
  return {
    async rpc(fn, args = {}) {
      const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`supabase ${fn}: ${res.status} ${body?.message || ''}`);
      return body;
    },
  };
}

// Sunucunun bildiği maç bilgisini veritabanı satırına çevirir (saat, durum, skor).
export function matchRow(f) {
  return {
    id: f.id, kickoff: new Date(f.ts * 1000).toISOString(), status: f.st,
    h: f.s ? f.s[0] : null, a: f.s ? f.s[1] : null, home: f.h?.name ?? null, away: f.a?.name ?? null, league: f.lg ?? null,
    home_id: f.h?.id ?? null, away_id: f.a?.id ?? null,
  };
}

// Tahmin girilmiş, henüz puanlanmamış maçların saatini/sonucunu veritabanına yazar (biten maçlar orada puanlanır).
// `results(ids)`: core.results — önbellekten verir, eksikleri sınırlı sayıda kaynaktan ister.
export async function syncMatches(supa, results) {
  const ids = await supa.rpc('server_open_matches');
  if (!Array.isArray(ids) || !ids.length) return { sent: 0, scored: 0 };
  const rows = [];
  for (let i = 0; i < ids.length; i += 40) {
    const r = await results(ids.slice(i, i + 40));
    for (const f of [...(r.results || []), ...(r.open || [])]) rows.push(matchRow(f));
  }
  if (!rows.length) return { sent: 0, scored: 0 };
  const out = await supa.rpc('server_sync_matches', { p_rows: rows });
  return { sent: rows.length, scored: out?.scored ?? 0 };
}
