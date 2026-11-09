import type { League } from './api';

// Turnuvaların listelerde hangi başlıklar altında gösterileceği.
export const LEAGUE_GROUPS: [League['type'], string][] = [
  ['main', 'Ana ligler'],
  ['cup', 'Avrupa kupaları'],
  ['intl', 'Milli takım turnuvaları'],
  ['domcup', 'Ülke kupaları'],
];
