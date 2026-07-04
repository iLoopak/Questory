import type { Game } from '../types/game';
import type { TimelineEvent, TimelineYear } from '../types/timeline';

export function buildAchievementTimeline(games: Game[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const game of games) {
    if (game.collectionType !== 'library' || typeof game.steamAppId !== 'number') continue;
    if (!Array.isArray(game.steamAchievements)) continue;

    for (const achievement of game.steamAchievements) {
      if (!achievement?.unlocked || !achievement.unlockTime || typeof achievement.apiName !== 'string') continue;

      events.push({
        id: `${game.id}:${achievement.apiName}`,
        type: 'achievement',
        timestamp: achievement.unlockTime,
        gameId: game.id,
        gameSteamAppId: game.steamAppId,
        gameTitle: game.title,
        achievement,
      });
    }
  }

  events.sort((a, b) => b.timestamp - a.timestamp);
  return events;
}

export function groupEventsByYearMonth(events: TimelineEvent[]): TimelineYear[] {
  const yearMap = new Map<number, Map<number, TimelineEvent[]>>();

  for (const event of events) {
    const d = new Date(event.timestamp * 1000);
    const year = d.getFullYear();
    const month = d.getMonth();

    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(event);
  }

  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

  return sortedYears.map((year) => {
    const monthMap = yearMap.get(year)!;
    const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b - a);
    return {
      year,
      months: sortedMonths.map((month) => ({
        year,
        month,
        events: monthMap.get(month)!,
      })),
    };
  });
}

export function countTimelineStats(events: TimelineEvent[]): { totalEvents: number; uniqueGames: number } {
  const gameIds = new Set(events.map((e) => e.gameId));
  return { totalEvents: events.length, uniqueGames: gameIds.size };
}
