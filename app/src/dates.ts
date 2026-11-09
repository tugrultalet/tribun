// 'YYYY-AA-GG' biçimindeki tarihlerle çalışır; tüm saatler sunucuda Türkiye saatine çevrilmiş gelir.
const DOW = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MON = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dayOfMonth = (date: string) => utc(date).getUTCDate();
export const weekday = (date: string) => DOW[utc(date).getUTCDay()];
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Bugün';
  if (date === addDays(today, -1)) return 'Dün';
  if (date === addDays(today, 1)) return 'Yarın';
  const d = utc(date);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${DOW[d.getUTCDay()]}`;
}
const MON_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const shortDate = (date: string) => `${utc(date).getUTCDate()} ${MON_SHORT[utc(date).getUTCMonth()]}`;
export const daysBetween = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000);
export const seasonLabel = (season: number) => `${season}/${String((season + 1) % 100).padStart(2, '0')}`;
