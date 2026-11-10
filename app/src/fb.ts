// Firebase erişimi (varsayılan / web): web önizlemesinde ve Firebase'in olmadığı ortamlarda her şey sessizce devre dışıdır.
// Gerçek uygulama (iOS/Android geliştirme ve mağaza derlemesi) `fb.native.ts`'i kullanır.
export const firebaseAvailable = (): boolean => false;
export function fbEvent(_name: string, _params?: Record<string, unknown>): void {}
export function fbScreen(_name: string): void {}
export function fbError(_error: unknown, _context?: string): void {}
export async function fbRemoteValues(_defaults: Record<string, string>): Promise<Record<string, string> | null> { return null; }
export async function fbPushPermission(): Promise<boolean> { return false; }
export async function fbSubscribe(_topics: string[], _previous: string[]): Promise<boolean> { return false; }
export function fbOnNotificationOpen(_handler: (data: Record<string, string>) => void): () => void { return () => {}; }
