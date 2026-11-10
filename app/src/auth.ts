// Apple / Google ile giriş. Uygulama anonim başlar; giriş yalnızca gerektiğinde istenir (grup kurmak, telefon değişince
// verileri korumak). Giriş Supabase Auth'a kimlik belirteciyle yapılır; dönen oturum anahtarı yalnızca profili hesaba
// bağlamak için bir kez kullanılır, saklanmaz. Profil yine cihaz sırrıyla çalışır (bkz. supabase/migrations/*_accounts.sql).
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { ApiError } from './api';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export type Provider = 'apple' | 'google';

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

export const providerName = (p?: string | null) => (p === 'apple' ? 'Apple' : p === 'google' ? 'Google' : '');
