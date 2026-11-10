// Apple / Google ile giriş. Uygulama anonim başlar; giriş yalnızca gerektiğinde istenir (grup kurmak, telefon değişince
// verileri korumak). Giriş Supabase Auth'a kimlik belirteciyle yapılır; dönen oturum anahtarı yalnızca profili hesaba
// bağlamak için bir kez kullanılır, saklanmaz. Profil yine cihaz sırrıyla çalışır (bkz. supabase/migrations/*_accounts.sql).
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { ApiError } from './api';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export type Provider = 'apple' | 'google' | 'email';

type AppleModule = typeof import('expo-apple-authentication');
let apple: AppleModule | null = null;
if (Platform.OS === 'ios') {
  try { apple = require('expo-apple-authentication'); } catch { apple = null; } // Expo Go / eski derleme
}

export async function availableProviders(): Promise<Provider[]> {
  const list: Provider[] = [];
  if (apple && (await apple.isAvailableAsync().catch(() => false))) list.push('apple');
  // Google: iOS istemci numarası eklenince açılacak (Firebase'de Google girişi açılıp plist yenilenince).
  return list;
}

export class Cancelled extends Error {}

async function exchange(provider: Provider, idToken: string, nonce?: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, id_token: idToken, nonce }),
    });
  } catch {
    throw new ApiError('network', 'Bağlantı kurulamadı. İnternetini kontrol et.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) throw new ApiError('social', body?.msg || body?.error_description || 'Giriş yapılamadı.');
  return body.access_token as string;
}

// Giriş yapar ve Supabase oturum anahtarını döner. Kullanıcı vazgeçerse Cancelled fırlatır.
export async function signIn(provider: Provider): Promise<string> {
  if (provider === 'apple') {
    if (!apple) throw new ApiError('social', 'Apple ile giriş bu cihazda kullanılamıyor.');
    const raw = Crypto.randomUUID();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
    let cred;
    try {
      cred = await apple.signInAsync({ requestedScopes: [], nonce: hashed });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Cancelled();
      throw new ApiError('social', 'Apple ile giriş yapılamadı.');
    }
    if (!cred.identityToken) throw new ApiError('social', 'Apple kimlik bilgisi alınamadı.');
    return exchange('apple', cred.identityToken, raw);
  }
  throw new ApiError('social', 'Google ile giriş henüz açık değil.');
}

export const providerName = (p?: string | null) => (p === 'apple' ? 'Apple' : p === 'google' ? 'Google' : p === 'email' ? 'E-posta' : '');

// ---------- E-posta ile giriş ----------
// Supabase Auth e-postaya hem 6 haneli kod hem de uygulamayı açan bağlantı (tribunapp.io/giris?h=…) gönderir.
// Kod her cihazda çalışır (e-posta bilgisayarda açılsa da); bağlantı telefonda tek dokunuşla girer.
// Sık yazım hataları (gamil.com, hotmial.com…): "Bunu mu demek istedin?" önerisi için doğru adres, yoksa null.
const DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'yahoo.com', 'yandex.com', 'live.com', 'msn.com', 'me.com', 'hotmail.com.tr', 'yahoo.com.tr'];
const TYPOS: Record<string, string> = { 'gamil.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com', 'yaho.com': 'yahoo.com' };
export function emailTypo(email: string): string | null {
  const m = /^([^\s@]+)@([^\s@]+)$/.exec(email.trim().toLowerCase());
  if (!m || DOMAINS.includes(m[2])) return null;
  const fix = TYPOS[m[2]];
  return fix ? `${m[1]}@${fix}` : null;
}
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

async function authPost(path: string, body: object): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('network', 'Bağlantı kurulamadı. İnternetini kontrol et.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = String(data?.msg || data?.error_description || data?.message || '');
    if (res.status === 429 || /rate limit|security purposes/i.test(msg)) throw new ApiError('social', 'Çok sık denedin. Biraz bekleyip tekrar dene.');
    if (/expired|invalid/i.test(msg)) throw new ApiError('social', 'Kod hatalı ya da süresi dolmuş. Yeni kod iste.');
    throw new ApiError('social', msg || 'E-posta ile giriş yapılamadı.');
  }
  return data;
}

export async function sendEmailCode(email: string): Promise<void> {
  if (!validEmail(email)) throw new ApiError('social', 'Geçerli bir e-posta adresi yaz.');
  await authPost('otp', { email: email.trim().toLowerCase(), create_user: true });
}

// Kodla (e-posta + 6 haneli kod) ya da bağlantıdaki özetle (h) doğrular; Supabase oturum anahtarını döner.
export async function verifyEmail(o: { email: string; code: string } | { hash: string }): Promise<string> {
  const body = 'hash' in o ? { type: 'email', token_hash: o.hash } : { type: 'email', email: o.email.trim().toLowerCase(), token: o.code.trim() };
  const data = await authPost('verify', body);
  if (!data?.access_token) throw new ApiError('social', 'Giriş yapılamadı.');
  return data.access_token as string;
}
