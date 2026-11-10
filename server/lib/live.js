// Maç Live Activity'leri: maç başına bir APNs yayın kanalı; skor/durum değişince güncelleme gönderilir.
// Kanal numaraları Supabase'de tutulur (sunucu yeniden başlasa da açık aktiviteler güncellenmeye devam eder).

// Uygulamadaki MatchActivityAttributes.ContentState ile aynı alanlar.
export function liveState(f) {
  const s = f.s || [0, 0];
  const status = f.st === 'live' ? (f.short === 'HT' ? 'ht' : 'live') : f.st === 'ft' ? 'ft' : 'ns';
  const minute = status === 'ht' ? 'DA' : status === 'ft' ? 'MS' : status === 'live' ? `${f.min ?? ''}${f.extra ? `+${f.extra}` : ''}'` : (f.time || '');
  return { home: s[0], away: s[1], minute, status };
}

// Gönderilecek güncelleme: skor ya da durum değiştiyse hemen (10), yalnızca dakika ilerlediyse en çok dakikada bir (5).
export function nextUpdate(prev, f, now = Date.now()) {
  const state = liveState(f);
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
    aps['content-state'].note = 'Maç bitti';
    aps['dismissal-date'] = Math.floor(now / 1000) + 3600; // maç sonucu kilit ekranında 1 saat kalır
  }
  aps['stale-date'] = Math.floor(now / 1000) + (u.kind === 'end' ? 3600 : 15 * 60);
  return { aps };
}

export function createLive({ apns, supa, log = console }) {
  const channels = new Map(); // matchId -> { channel, env }
  const sent = new Map();     // matchId -> { state, at }
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
      for (const f of fixtures) {
        const channel = channels.get(f.id);
        if (!channel) continue;
        const u = nextUpdate(sent.get(f.id), f, now);
        if (!u) continue;
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
    },
  };
}
