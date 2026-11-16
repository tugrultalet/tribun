// Cihaz bazlı maç bildirimleri: bu cihazın FCM anahtarı, istediği bildirim konuları (team_645, pre_team_645) ve kilit
// ekranında takip ettiği maçlar sunucuya kaydedilir. Sunucu maç bildirimini cihaza tek tek gönderir ve kilit ekranında
// o maçı takip eden cihazı atlar (Live Activity zaten haber veriyor). Kayıt başarılıysa cihaz konu aboneliklerinden çıkar.
import { liveMatches, liveStartToken } from '../modules/tribun-live';
import { fbToken } from './fb';
import { rpc } from './social';

let topics: string[] | null = null;
let last = '';
let running: Promise<boolean> | null = null;

// nextTopics verilirse konu listesi güncellenir; verilmezse yalnızca kilit ekranı takibi yeniden bildirilir.
// Kayıtlı (sunucu cihaza tek tek gönderecek) ise true döner.
export async function syncPushDevice(nextTopics?: string[]): Promise<boolean> {
  if (nextTopics) topics = nextTopics;
  if (topics == null) return false; // konular henüz bilinmiyor (ayarlar yüklenmedi)
  if (running) await running.catch(() => false);
  running = (async () => {
    const token = await fbToken().catch(() => null);
    if (!token) return false;
    const live = liveMatches();
    const la = liveStartToken();
    const key = JSON.stringify([token, topics, live, la]);
    if (key === last) return true;
    try {
      await rpc('set_push_device', { p_token: token, p_topics: topics, p_live: live, p_la_token: la ?? '' });
      last = key;
      return true;
    } catch {
      return false;
    }
  })();
  return running;
}
