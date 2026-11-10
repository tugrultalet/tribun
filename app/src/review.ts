import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

// Uygulamayı değerlendirme isteği: kullanıcı 5 tahmin kaydettikten sonra bir kez sorulur. Apple ayrıca yılda en çok
// üç kez gösterilmesine izin verir; gösterip göstermemeye sistem karar verir.
const KEY = 'tribun:review';
export async function notePickSaved(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as { picks: number; asked: boolean }) : { picks: 0, asked: false };
    s.picks += 1;
    if (!s.asked && s.picks >= 5 && (await StoreReview.hasAction())) {
      s.asked = true;
      await StoreReview.requestReview();
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* değerlendirme isteği isteğe bağlı */ }
}
