import { Linking, Platform, Share } from 'react-native';
import { PUBLIC_URL } from './api';

type Invitable = { name: string; code: string };

// Paylaşılan bağlantı sunucudaki karşılama sayfasına gider; oradan uygulama ya da kod ile katılınır.
export const inviteLink = (g: Invitable) => `${PUBLIC_URL}/j/${g.code}?n=${encodeURIComponent(g.name)}`;
export const inviteText = (g: Invitable) =>
  `Tribün'de "${g.name}" grubuna katıl ⚽ Maçları birlikte takip edip skor tahmini yapıyoruz.\nDavet kodu: ${g.code}\n${inviteLink(g)}`;

// WhatsApp'ta doğrudan mesaj açar; yüklü değilse ya da açılamazsa sistem paylaşım menüsüne düşer.
export async function sendViaWhatsApp(g: Invitable): Promise<void> {
  const text = encodeURIComponent(inviteText(g));
  try { await Linking.openURL(Platform.OS === 'web' ? `https://wa.me/?text=${text}` : `whatsapp://send?text=${text}`); }
  catch { await shareText(g); }
}
export async function shareText(g: Invitable): Promise<void> {
  await Share.share({ message: inviteText(g) }).catch(() => {});
}
// `join/ABC234` biçimindeki derin bağlantıdan gelen kod (yalnızca izinli harf ve rakamlar).
export const cleanCode = (raw: unknown): string => String(raw ?? '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
