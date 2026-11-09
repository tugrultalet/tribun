// Maç satırlarında tek satıra sığması için kısaltılmış takım adı. Tam ad ayrıntı ekranlarında ve erişilebilirlik
// etiketlerinde kullanılmaya devam eder. Bilinen uzun adlar tablodan, geri kalanı genel kurallarla (FK, SK, FC … eki
// ve önekleri atılır) kısaltılır; yine de sığmayan ad satırda "…" ile kesilir.
const SHORT: Record<string, string> = {
  'Manchester United': 'Man United', 'Manchester City': 'Man City', 'İstanbul Başakşehir': 'Başakşehir', 'Istanbul Basaksehir': 'Başakşehir',
  'Borussia Dortmund': 'Dortmund', 'Borussia Mönchengladbach': 'Gladbach', "Borussia M'gladbach": 'Gladbach', 'Bayern München': 'Bayern', 'Bayern Munich': 'Bayern',
  'Bayer Leverkusen': 'Leverkusen', 'Eintracht Frankfurt': 'Frankfurt', 'Atlético Madrid': 'Atlético', 'Atletico Madrid': 'Atlético', 'Athletic Club': 'Athletic',
  'Real Sociedad': 'R. Sociedad', 'Paris Saint Germain': 'PSG', 'Paris Saint-Germain': 'PSG', 'Newcastle United': 'Newcastle', 'Tottenham Hotspur': 'Tottenham',
  'West Ham United': 'West Ham', 'Wolverhampton Wanderers': 'Wolves', 'Nottingham Forest': "Nott'm Forest", 'Brighton & Hove Albion': 'Brighton',
  'Crystal Palace': 'C. Palace', 'Sporting CP': 'Sporting', 'Shakhtar Donetsk': 'Shakhtar', 'Red Bull Salzburg': 'Salzburg', 'Club Brugge KV': 'Club Brugge',
  'Slavia Praha': 'Slavia Prag', 'Sparta Praha': 'Sparta Prag', 'Gazişehir Gaziantep': 'Gaziantep', 'Kuzey Makedonya': 'K. Makedonya', 'Bosna-Hersek': 'Bosna-Hersek',
};

export function shortName(name: string): string {
  if (SHORT[name]) return SHORT[name];
  return name
    .replace(/\s+(FK|SK|FC|CF|AFC|SC|BK|KV|AC)$/i, '')
    .replace(/^(FC|AFC|AC|AS|SS|US|SV|SC|VfB|VfL|TSG|RB|1\. FC)\s+/i, '');
}
