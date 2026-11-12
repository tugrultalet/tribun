// Maç Live Activity'leri: maç başına bir APNs yayın kanalı; skor/durum değişince güncelleme gönderilir.
// Kanal numaraları Supabase'de tutulur (sunucu yeniden başlasa da açık aktiviteler güncellenmeye devam eder).

// Uygulamadaki MatchActivityAttributes.ContentState ile aynı alanlar.
// clock: maçın 0. dakikası sayılan an (unix sn); kilit ekranındaki süre çubuğu buna göre kendiliğinden ilerler.
const COUNTDOWN_MS = 60 * 60000;
export function liveState(f, now = Date.now()) {
  const s = f.s || [0, 0];
  const status = f.st === 'live' ? (f.short === 'HT' ? 'ht' : 'live') : f.st === 'ft' ? 'ft' : 'ns';
  // Başlamamış maçta son 1 saat başlama saatinin yanında geri sayım ("20:00 · 25 dk"); öncesinde yalnızca saat.
  const left = status === 'ns' && f.ts ? f.ts * 1000 - now : null;
  const countdown = left != null && left > 0 && left <= COUNTDOWN_MS ? [f.time, `${Math.ceil(left / 60000)} dk`].filter(Boolean).join(' · ') : null;
  const minute = status === 'ht' ? 'Devre arası' : status === 'ft' ? 'Maç sonu' : status === 'live' ? `${f.min ?? ''}${f.extra ? `+${f.extra}` : ''}'` : (countdown || f.time || '');
  const clock = status === 'live' && f.min != null ? Math.floor(now / 1000) - f.min * 60 : null;
  return { home: s[0], away: s[1], minute, status, clock };
}

// Gönderilecek güncelleme: skor ya da durum değiştiyse hemen (10), yalnızca dakika ilerlediyse en çok dakikada bir (5).
export function nextUpdate(prev, f, now = Date.now()) {
  const state = liveState(f, now);
  if (!prev) return { state, priority: 10, kind: 'start' };
  const scored = state.home !== prev.state.home || state.away !== prev.state.away;
  // Golü atan taraf: skoru artan (iki taraf birden artmışsa son artan sayılmaz, ev sahibi yazılır).
  const side = state.home > prev.state.home ? 'h' : state.away > prev.state.away ? 'a' : null;
  if (scored || state.status !== prev.state.status) return { state, priority: 10, kind: state.status === 'ft' ? 'end' : scored ? 'goal' : 'status', side, from: prev.state.status };
  if (state.minute !== prev.state.minute && now - prev.at >= 60000) return { state, priority: 5, kind: 'tick' };
  return null;
}

// Gol satırı: golü atan oyuncu (olaylar skorla birlikte geldiyse) ve dakika; yoksa takım adı. `side` satırın hangi
// tarafta duracağı (golü atan takımın tarafı).
export function goalNote(u, f) {
  const team = u.side === 'a' ? f.a.name : u.side === 'h' ? f.h.name : null;
  const g = f.goal && f.goal.side === u.side && f.goal.n === u.state.home + u.state.away ? f.goal : null;
  const min = g?.min != null ? ` ${g.min}${g.extra ? `+${g.extra}` : ''}'` : '';
  const who = g?.p || team;
  return { note: who ? `⚽ GOL! ${who}${min}` : '⚽ GOL!', side: u.side, team, who: g?.p ? `${g.p}${min}` : null };
}

// Gol satırı kilit ekranında bu kadar kalır, sonra satırı silen sessiz bir güncelleme gider.
export const NOTE_MS = 8000;

export function payloadFor(u, f, now = Date.now()) {
  const aps = { timestamp: Math.floor(now / 1000), event: u.kind === 'end' ? 'end' : 'update', 'content-state': { ...u.state, note: null, side: null } };
  if (u.kind === 'goal') {
    const g = goalNote(u, f);
    aps['content-state'].note = g.note;
    aps['content-state'].side = g.side;
    const score = `${f.h.name} ${u.state.home}–${u.state.away} ${f.a.name}`;
    aps.alert = { title: g.team ? `GOL! ${g.team}` : 'GOL!', body: g.who ? `${g.who} · ${score}` : score, sound: 'default' };
  }
  // Devre arası ve maç sonu da kısa uyarı ve titreşimle bildirilir (kilit ekranı yanar, Dynamic Island genişler).
  if (u.kind === 'status' && u.state.status === 'live') {
    aps.alert = { title: u.from === 'ht' ? 'İkinci yarı başladı' : 'Maç başladı', body: `${f.h.name} ${u.state.home}–${u.state.away} ${f.a.name}`, sound: 'default' };
  }
  if (u.kind === 'status' && u.state.status === 'ht') {
    aps.alert = { title: 'Devre arası', body: `${f.h.name} ${u.state.home}–${u.state.away} ${f.a.name}`, sound: 'default' };
  }
  if (u.kind === 'end') {
    aps.alert = { title: 'Maç bitti', body: `${f.h.name} ${u.state.home}–${u.state.away} ${f.a.name}`, sound: 'default' };
    aps['content-state'].note = null; // "Maç sonu" üstte yazıyor
    aps['dismissal-date'] = Math.floor(now / 1000) + 3600; // maç sonucu kilit ekranında 1 saat kalır
  }
  aps['stale-date'] = Math.floor(now / 1000) + (u.kind === 'end' ? 3600 : 15 * 60);
  return { aps };
}

// Çoklu maç kartının durumu: her maç için bir satır (uygulamadaki MultiMatchAttributes.ContentState ile aynı alanlar).
export function multiPayload(matchIds, states, notes, kind, now = Date.now()) {
  const slots = matchIds.map((id) => {
    const st = states.get(id) || { home: 0, away: 0, minute: '', status: 'ns', clock: null };
    return { id, ...st, note: notes.get(id) ?? null };
  });
  const allDone = slots.every((x) => x.status === 'ft');
  const aps = { timestamp: Math.floor(now / 1000), event: allDone ? 'end' : 'update', 'content-state': { slots }, 'stale-date': Math.floor(now / 1000) + (allDone ? 3600 : 900) };
  if (allDone) aps['dismissal-date'] = Math.floor(now / 1000) + 3600;
  if (kind?.alert) aps.alert = kind.alert;
  return { aps };
}

export function createLive({ apns, supa, log = console, watch = null }) {
  const channels = new Map(); // matchId -> { channel, env }
  const sent = new Map();     // matchId -> { state, at }
  const states = new Map();   // matchId -> son durum (çoklu kart için)
  const notes = new Map();    // matchId -> son olay ("⚽ GOL! …")
  const fixtures = new Map(); // matchId -> son bilinen maç bilgisi (geri sayım için)
  let tokens = [], tokensAt = 0;
  async function loadTokens(now) {
    if (now - tokensAt < 60000) return;
    tokensAt = now;
    try {
      tokens = ((await supa.rpc('server_live_tokens')) || []).map((x) => ({ token: x.token, matches: (x.matches || []).map(Number) }));
      if (watch) for (const id of new Set(tokens.flatMap((x) => x.matches))) Promise.resolve(watch(id)).catch(() => {});
    } catch { /* sonraki turda yeniden */ }
  }
  // Gol satırını birkaç saniye sonra siler (skor aynı kalır). Bu arada yeni bir gol olduysa o satır silinmez.
  const clearTimers = new Map();
  function clearLater(f, state) {
    clearTimeout(clearTimers.get(f.id));
    clearTimers.set(f.id, setTimeout(async () => {
      clearTimers.delete(f.id);
      const cur = states.get(f.id);
      if (!cur || cur.home !== state.home || cur.away !== state.away) return;
      notes.delete(f.id);
      const now = Date.now();
      const channel = channels.get(f.id);
      const quiet = { aps: { timestamp: Math.floor(now / 1000), event: 'update', 'content-state': { ...cur, note: null, side: null }, 'stale-date': Math.floor(now / 1000) + 900 } };
      if (channel) await apns.broadcast(channel, quiet, 10).catch((e) => log.warn?.(`Gol satırı silinemedi (${f.id}): ${e.message}`));
      for (const t of tokens) {
        if (!t.matches.includes(f.id)) continue;
        await apns.toToken(t.token, multiPayload(t.matches, states, notes, null, now), 10).catch(() => {});
      }
    }, NOTE_MS));
    clearTimers.get(f.id).unref?.();
  }

  let loaded = false;
  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      for (const r of (await supa.rpc('server_live_channels')) || []) if (r.env === apns.env) channels.set(Number(r.match_id), r.channel);
    } catch (e) { loaded = false; throw e; }
  }
  return {
    // Uygulama "kilit ekranında takip et" deyince: maçın kanalı (yoksa oluşturulur).
    async channelFor(matchId, f = null) {
      if (f) fixtures.set(matchId, f);
      await load();
      if (channels.has(matchId)) return channels.get(matchId);
      const channel = await apns.createChannel();
      channels.set(matchId, channel);
      await supa.rpc('server_set_live_channel', { p_match: matchId, p_channel: channel, p_env: apns.env }).catch(() => {});
      return channel;
    },
    // Canlı yenilemeden sonra: kanalı olan maçlara güncelleme.
    // Dakikada bir: başlamasına 1 saatten az kalan, takip edilen maçlara geri sayım ("20:00 · 25 dk"). Canlı yenileme yalnızca
    // başlamasına 5 dakika kalan maçları kapsadığı için bu ayrı çalışır.
    async countdown(now = Date.now()) {
      await load();
      await loadTokens(now);
      const ids = new Set([...channels.keys(), ...tokens.flatMap((x) => x.matches)]);
      const due = [];
      for (const id of ids) {
        let f = fixtures.get(id);
        if (!f && watch) { f = await Promise.resolve(watch(id)).catch(() => null); if (f) fixtures.set(id, f); }
        if (f && f.st === 'ns' && f.ts && f.ts * 1000 - now > 0 && f.ts * 1000 - now <= COUNTDOWN_MS + 60000) due.push(f);
      }
      if (due.length) await this.onFixtures(due, now);
    },
    async onFixtures(list, now = Date.now()) {
      for (const f of list) fixtures.set(f.id, f);
      const fixturesNow = list;
      await load();
      await loadTokens(now);
      const multiIds = new Set(tokens.flatMap((x) => x.matches));
      const changed = new Map(); // matchId -> güncelleme (çoklu kartlar için)
      for (const f of fixturesNow) {
        const channel = channels.get(f.id);
        if (!channel && !multiIds.has(f.id)) continue;
        const u = nextUpdate(sent.get(f.id), f, now);
        if (!u) continue;
        states.set(f.id, u.state);
        if (u.kind === 'goal') {
          notes.set(f.id, goalNote(u, f).note);
          clearLater(f, u.state);
        }
        changed.set(f.id, { u, f });
        if (!channel) { sent.set(f.id, { state: u.state, at: now }); continue; }
        try {
          await apns.broadcast(channel, payloadFor(u, f, now), u.priority);
          sent.set(f.id, { state: u.state, at: now });
        } catch (e) { log.warn?.(`Live Activity güncellemesi gönderilemedi (${f.id}): ${e.message}`); }
        if (u.kind === 'end') {
          // Kanal maç bitince 2 saat sonra silinir (aktiviteler o zamana kadar kapanmış olur).
          setTimeout(() => {
            apns.deleteChannel(channel).catch(() => {});
            channels.delete(f.id); sent.delete(f.id);
            supa.rpc('server_drop_live_channel', { p_match: f.id }).catch(() => {});
          }, 2 * 3600000).unref?.();
        }
      }
      // Çoklu maç kartları: maçlarından biri değiştiyse kartın tamamı gönderilir (gol varsa uyarıyla, hemen).
      for (const t of tokens) {
        const hits = t.matches.map((id) => changed.get(id)).filter(Boolean);
        if (!hits.length) continue;
        const goal = hits.find((h) => h.u.kind === 'goal');
        const ended = hits.find((h) => h.u.kind === 'end');
        const half = hits.find((h) => h.u.kind === 'status' && h.u.state.status === 'ht');
        const kick = hits.find((h) => h.u.kind === 'status' && h.u.state.status === 'live');
        const priority = hits.some((h) => h.u.priority === 10) ? 10 : 5;
        const pick = goal || ended || half || kick;
        const title = goal ? notes.get(goal.f.id) || 'GOL!' : ended ? 'Maç bitti' : half ? 'Devre arası'
          : kick ? (kick.u.from === 'ht' ? 'İkinci yarı başladı' : 'Maç başladı') : null;
        const alert = pick ? { title, body: `${pick.f.h.name} ${pick.u.state.home}–${pick.u.state.away} ${pick.f.a.name}`, sound: 'default' } : null;
        try {
          await apns.toToken(t.token, multiPayload(t.matches, states, notes, { alert }, now), priority);
        } catch (e) {
          if (e.status === 410 || e.status === 400) { supa.rpc('server_drop_live_token', { p_token: t.token }).catch(() => {}); tokens = tokens.filter((x) => x !== t); }
          else log.warn?.(`Çoklu Live Activity güncellemesi gönderilemedi: ${e.message}`);
        }
      }
    },
  };
}
