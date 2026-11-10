// Maç Live Activity'leri: maç başına bir APNs yayın kanalı; skor/durum değişince güncelleme gönderilir.
// Kanal numaraları Supabase'de tutulur (sunucu yeniden başlasa da açık aktiviteler güncellenmeye devam eder).

// Uygulamadaki MatchActivityAttributes.ContentState ile aynı alanlar.
// clock: maçın 0. dakikası sayılan an (unix sn); kilit ekranındaki süre çubuğu buna göre kendiliğinden ilerler.
export function liveState(f, now = Date.now()) {
  const s = f.s || [0, 0];
  const status = f.st === 'live' ? (f.short === 'HT' ? 'ht' : 'live') : f.st === 'ft' ? 'ft' : 'ns';
  const minute = status === 'ht' ? 'Devre arası' : status === 'ft' ? 'Maç sonu' : status === 'live' ? `${f.min ?? ''}${f.extra ? `+${f.extra}` : ''}'` : (f.time || '');
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
  if (scored || state.status !== prev.state.status) return { state, priority: 10, kind: state.status === 'ft' ? 'end' : scored ? 'goal' : 'status', side };
  if (state.minute !== prev.state.minute && now - prev.at >= 60000) return { state, priority: 5, kind: 'tick' };
  return null;
}

export function payloadFor(u, f, now = Date.now()) {
  const aps = { timestamp: Math.floor(now / 1000), event: u.kind === 'end' ? 'end' : 'update', 'content-state': { ...u.state, note: null } };
  if (u.kind === 'goal') {
    const team = u.side === 'a' ? f.a.name : u.side === 'h' ? f.h.name : null;
    aps['content-state'].note = team ? `⚽ GOL! ${team}` : '⚽ GOL!';
    aps.alert = { title: team ? `GOL! ${team}` : 'GOL!', body: `${f.h.name} ${u.state.home}–${u.state.away} ${f.a.name}` };
  }
  if (u.kind === 'end') {
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
  let tokens = [], tokensAt = 0;
  async function loadTokens(now) {
    if (now - tokensAt < 60000) return;
    tokensAt = now;
    try {
      tokens = ((await supa.rpc('server_live_tokens')) || []).map((x) => ({ token: x.token, matches: (x.matches || []).map(Number) }));
      if (watch) for (const id of new Set(tokens.flatMap((x) => x.matches))) Promise.resolve(watch(id)).catch(() => {});
    } catch { /* sonraki turda yeniden */ }
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
    async channelFor(matchId) {
      await load();
      if (channels.has(matchId)) return channels.get(matchId);
      const channel = await apns.createChannel();
      channels.set(matchId, channel);
      await supa.rpc('server_set_live_channel', { p_match: matchId, p_channel: channel, p_env: apns.env }).catch(() => {});
      return channel;
    },
    // Canlı yenilemeden sonra: kanalı olan maçlara güncelleme.
    async onFixtures(fixtures, now = Date.now()) {
      await load();
      await loadTokens(now);
      const multiIds = new Set(tokens.flatMap((x) => x.matches));
      const changed = new Map(); // matchId -> güncelleme (çoklu kartlar için)
      for (const f of fixtures) {
        const channel = channels.get(f.id);
        if (!channel && !multiIds.has(f.id)) continue;
        const u = nextUpdate(sent.get(f.id), f, now);
        if (!u) continue;
        states.set(f.id, u.state);
        if (u.kind === 'goal') {
          const team = u.side === 'a' ? f.a.name : u.side === 'h' ? f.h.name : null;
          notes.set(f.id, team ? `⚽ GOL! ${team}` : '⚽ GOL!');
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
        const priority = hits.some((h) => h.u.priority === 10) ? 10 : 5;
        const alert = goal ? { title: notes.get(goal.f.id) || 'GOL!', body: `${goal.f.h.name} ${goal.u.state.home}–${goal.u.state.away} ${goal.f.a.name}` } : null;
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
