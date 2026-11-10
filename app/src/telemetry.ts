// Analiz ve hata raporlama için tek giriş noktası. Şimdilik yalnızca geliştirmede konsola yazar.
// Firebase (Analytics, Crashlytics) eklenince yalnızca bu dosya doldurulacak; uygulamanın geri kalanı değişmeyecek.
type Params = Record<string, string | number | boolean | undefined>;

export function track(event: string, params?: Params): void {
  if (__DEV__) console.log('[analiz]', event, params ?? '');
}
export function screen(name: string): void {
  track('screen_view', { screen: name });
}
export function reportError(error: unknown, context?: string): void {
  if (__DEV__) console.warn('[hata]', context ?? '', error);
}
