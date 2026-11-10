import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// Uygulama ön planda mı? Arka plandayken periyodik yenilemeler durur (pil, veri ve sunucu yükü).
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}
