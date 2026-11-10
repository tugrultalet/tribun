// Kişiye özel bildirimleri (tahmin istekleri) veritabanı kuyruğundan alıp FCM ile gönderir.
// Uygulaması silinmiş cihazların anahtarları (UNREGISTERED / INVALID_ARGUMENT) veritabanından silinir.
export function pushMessage(p) {
  return {
    token: p.token,
    notification: { title: p.title, body: p.body },
    data: p.match_id ? { matchId: String(p.match_id) } : {},
    apns: { payload: { aps: { sound: 'default' } } },
  };
}

export async function sendPushes(supa, fcm) {
  const list = await supa.rpc('server_take_pushes', { p_limit: 200 });
  if (!Array.isArray(list) || !list.length) return { sent: 0, dropped: 0 };
  const dead = [];
  let sent = 0;
  for (const p of list) {
    try { await fcm.send(pushMessage(p)); sent++; } catch (e) {
      if (e.code === 'UNREGISTERED' || e.status === 404 || e.code === 'INVALID_ARGUMENT') dead.push(p.token);
    }
  }
  if (dead.length) await supa.rpc('server_drop_tokens', { p_tokens: dead }).catch(() => {});
  return { sent, dropped: dead.length };
}
