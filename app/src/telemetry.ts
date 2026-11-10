// Analiz ve hata raporlama için tek giriş noktası. Firebase Analytics ve Crashlytics'e gider (yalnızca gerçek
// uygulamada; web önizlemesinde ve Expo Go'da sessiz). Geliştirmede ayrıca konsola yazar.
import { fbError, fbEvent, fbScreen } from './fb';

type Params = Record<string, string | number | boolean | undefined>;

export function track(event: string, params?: Params): void {
  if (__DEV__) console.log('[analiz]', event, params ?? '');
  fbEvent(event, params);
}
export function screen(name: string): void {
  if (__DEV__) console.log('[ekran]', name);
  fbScreen(name);
}
export function reportError(error: unknown, context?: string): void {
  if (__DEV__) console.warn('[hata]', context ?? '', error);
  fbError(error, context);
}
