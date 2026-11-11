import { Alert, Linking, Platform, Share } from 'react-native';
import { PUBLIC_URL } from '../api';
import { rpc } from '../social';
import { track } from '../telemetry';

// "Arkadaş ekle": kişiye özel bağlantıyı (tribunapp.io/a/KOD) WhatsApp'tan gönderir; kartlı önizleme sunucudan gelir.
// Bağlantıyı açan kişi uygulamada arkadaşın olur. Tribün sekmesi ve Profilim aynı işlevi kullanır.
export async function inviteFriend(secret: string): Promise<void> {
  try {
    const r = await rpc<{ code: string }>('my_friend_code', { p_secret: secret });
    const link = `${PUBLIC_URL}/a/${r.code}?s=${Date.now().toString(36)}`;
    const text = `Tribün'de arkadaş olalım ⚽ Skor tahminlerimizi karşılaştıralım.\n${link}`;
    track('friend_invite_sent');
    try { await Linking.openURL(Platform.OS === 'web' ? `https://wa.me/?text=${encodeURIComponent(text)}` : `whatsapp://send?text=${encodeURIComponent(text)}`); }
    catch { await Share.share({ message: text }).catch(() => {}); }
  } catch (e) { Alert.alert('Davet hazırlanamadı', (e as Error).message); }
}
