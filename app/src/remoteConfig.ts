import { useEffect, useState } from 'react';
import { fbRemoteValues } from './fb';

// Remote Config (Firebase konsolundan, uygulama güncellemeden değiştirilebilir ayarlar). Değerler metindir.
//  - min_version: bunun altındaki sürümler "Güncelleme gerekli" ekranını görür (ör. "1.1.0")
//  - store_url: güncelleme düğmesinin açacağı App Store adresi
//  - announcement: ana ekranın üstünde gösterilecek duyuru (boşsa gösterilmez)
//  - maintenance: bakım/sorun mesajı (boşsa gösterilmez; duyurudan önce gelir)
//  - feature_group_chat: "false" ise grup sohbeti gizlenir
export const REMOTE_DEFAULTS = { min_version: '1.0.0', store_url: '', announcement: '', maintenance: '', feature_group_chat: 'true' };
export type Remote = typeof REMOTE_DEFAULTS;

let values: Remote = { ...REMOTE_DEFAULTS };
const listeners = new Set<() => void>();
let started = false;

export function startRemoteConfig(): void {
  if (started) return;
  started = true;
  fbRemoteValues(REMOTE_DEFAULTS).then((v) => {
    if (!v) return;
    values = { ...REMOTE_DEFAULTS, ...v } as Remote;
    listeners.forEach((l) => l());
  }, () => {});
}

export function useRemote(): Remote {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return values;
}
