// Takip edilen takımın numarası sunucudaki numaralarla eşleşmiyorsa (farklı kaynaktan kalma ya da bozuk kayıt) takım
// maçı getirmez. Böyle bir takım adından sunucudaki listelerle (milli takımlar, ana liglerin takımları) yeniden eşleştirilir.
import { get, LeagueTeams, League, National, Team } from './api';
import { findByName, FollowedTeam } from './follow';

export async function resolveTeam(team: FollowedTeam, leagues: League[]): Promise<Team | undefined> {
  const national = async () => { try { return findByName((await get<National>('/api/national')).teams, team.name); } catch { return undefined; } };
  const club = async () => {
    for (const l of leagues.filter((x) => x.type === 'main')) {
      try { const found = findByName((await get<LeagueTeams>(`/api/league/${l.id}/teams`)).teams, team.name); if (found) return found; } catch { /* sıradaki lig */ }
    }
    return undefined;
  };
  return team.kind === 'national' ? (await national()) ?? (await club()) : (await club()) ?? (await national());
}
