import type { AppLanguage } from '../../i18n';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import type { PlatformQueueState, PlatformQueueSummary } from '../../lib/platformQueueStorage';
import type { Game } from '../../types/game';

export type ContextualGreeting = {
  headline: string;
  priority: number;
  subtext: string;
};

export type ContextualGreetingInput = {
  activity: PlayActivityRecord[];
  date?: Date;
  featuredGame?: Game | null;
  games: Game[];
  language: AppLanguage;
  queue?: PlatformQueueState | null;
  shelfStats?: Pick<PlatformQueueSummary, 'platformSizes' | 'queuedCount'> | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getContextualGreeting({ activity, date = new Date(), featuredGame, games, language, queue, shelfStats }: ContextualGreetingInput): ContextualGreeting | null {
  const libraryGames = games.filter((game) => game.collectionType === 'library');
  const playingGames = libraryGames.filter((game) => game.status === 'Playing');
  const eligibleLibraryGames = libraryGames.filter((game) => !isFinishedOrDropped(game));
  const candidates: ContextualGreeting[] = [];

  if (libraryGames.length > 1000) {
    candidates.push({
      headline: language === 'cs' ? `${libraryGames.length.toLocaleString('cs-CZ')} her.` : `${libraryGames.length.toLocaleString('en-US')} games.`,
      priority: 100,
      subtext: language === 'cs' ? 'Skutečný achievement je vybrat jednu.' : 'The real achievement is choosing one.',
    });
  } else if (libraryGames.length > 500) {
    candidates.push({
      headline: language === 'cs' ? '500+ her.' : '500+ games.',
      priority: 90,
      subtext: language === 'cs' ? 'A pořád vybíráš?' : 'Still looking for something to play?',
    });
  }

  if (playingGames.length > 5) {
    candidates.push({
      headline: language === 'cs' ? `${playingGames.length.toLocaleString('cs-CZ')} rozehraných her.` : `${playingGames.length.toLocaleString('en-US')} active adventures.`,
      priority: 80,
      subtext: language === 'cs' ? 'Odvážná strategie.' : 'Bold strategy.',
    });
  }

  const queuedCount = shelfStats?.queuedCount ?? queue?.entries.length ?? 0;
  if (queuedCount > 100) {
    candidates.push({
      headline: language === 'cs' ? `Quest Queue obsahuje ${queuedCount.toLocaleString('cs-CZ')} kandidátů.` : `Quest Queue contains ${queuedCount.toLocaleString('en-US')} candidates.`,
      priority: 70,
      subtext: language === 'cs' ? 'Žádný tlak.' : 'No pressure.',
    });
  }

  if (featuredGame && featuredGame.collectionType === 'library' && featuredGame.status !== 'Playing' && !isFinishedOrDropped(featuredGame)) {
    candidates.push({
      headline: language === 'cs' ? `${featuredGame.title} stále čeká.` : `${featuredGame.title} is still waiting.`,
      priority: 65,
      subtext: '',
    });
  }

  const recentSteamGame = getRecentSteamActivityGame(eligibleLibraryGames, activity, date);
  if (recentSteamGame) {
    candidates.push({
      headline: language === 'cs' ? `${recentSteamGame.title} zaznamenal tvůj návrat.` : `${recentSteamGame.title} noticed your return.`,
      priority: 60,
      subtext: '',
    });
  }

  if (playingGames.length === 1) {
    candidates.push({
      headline: language === 'cs' ? 'Dnešní mise vypadá jasně.' : "Today's mission seems obvious.",
      priority: 55,
      subtext: '',
    });
  }

  const almostCompleteGame = eligibleLibraryGames
    .filter((game) => game.status !== 'Finished' && typeof game.steamAchievementsPercent === 'number' && game.steamAchievementsPercent > 90)
    .sort((first, second) => (second.steamAchievementsPercent ?? 0) - (first.steamAchievementsPercent ?? 0) || first.title.localeCompare(second.title))[0];
  if (almostCompleteGame) {
    candidates.push({
      headline: language === 'cs' ? `${almostCompleteGame.title} je téměř hotový.` : `${almostCompleteGame.title} is almost complete.`,
      priority: 50,
      subtext: '',
    });
  }

  const abandonedGame = playingGames
    .filter((game) => getDaysSince(game.lastPlayedAt, date) > 30)
    .sort((first, second) => (Date.parse(first.lastPlayedAt ?? '') || 0) - (Date.parse(second.lastPlayedAt ?? '') || 0) || first.title.localeCompare(second.title))[0];
  if (abandonedGame) {
    candidates.push({
      headline: language === 'cs' ? `${abandonedGame.title} trpělivě čeká.` : `${abandonedGame.title} has been waiting patiently.`,
      priority: 45,
      subtext: '',
    });
  }

  const platformBacklog = getDominantPlannedPlatform(queue, shelfStats);
  if (platformBacklog) {
    candidates.push({
      headline: language === 'cs' ? `Backlog platformy ${platformBacklog} roste.` : `Your ${platformBacklog} backlog is growing.`,
      priority: 40,
      subtext: '',
    });
  }

  return candidates.sort((first, second) => second.priority - first.priority || first.headline.localeCompare(second.headline))[0] ?? null;
}

function isFinishedOrDropped(game: Game) {
  return game.status === 'Finished' || game.status === 'Dropped';
}

function getRecentSteamActivityGame(games: Game[], activity: PlayActivityRecord[], date: Date) {
  const activityByGameId = new Map<string, string>();
  activity
    .filter((record) => record.source === 'steam' && record.type === 'playtime_delta')
    .forEach((record) => {
      const previous = activityByGameId.get(record.gameId);
      if (!previous || record.detectedAt > previous) activityByGameId.set(record.gameId, record.detectedAt);
    });

  return games
    .map((game) => ({ game, detectedAt: activityByGameId.get(game.id) ?? game.lastSteamActivityAt }))
    .filter(({ detectedAt }) => {
      const daysSince = getDaysSince(detectedAt, date);
      return typeof detectedAt === 'string' && daysSince >= 0 && daysSince <= 7;
    })
    .sort((first, second) => (second.detectedAt ?? '').localeCompare(first.detectedAt ?? '') || first.game.title.localeCompare(second.game.title))[0]?.game ?? null;
}

function getDaysSince(value: string | null | undefined, date: Date) {
  if (!value) return Number.POSITIVE_INFINITY;
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((startOfDay(date).getTime() - startOfDay(new Date(then)).getTime()) / DAY_MS);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDominantPlannedPlatform(queue: PlatformQueueState | null | undefined, shelfStats: Pick<PlatformQueueSummary, 'platformSizes' | 'queuedCount'> | null | undefined) {
  const platformSizes = shelfStats?.platformSizes ?? getPlatformSizes(queue);
  const queuedCount = shelfStats?.queuedCount ?? queue?.entries.length ?? 0;
  if (queuedCount <= 0) return null;
  return platformSizes.find(({ count }) => count > queuedCount / 2)?.platform ?? null;
}

function getPlatformSizes(queue: PlatformQueueState | null | undefined) {
  if (!queue) return [];
  const platformCounts = new Map<string, number>();
  queue.entries.forEach((entry) => platformCounts.set(entry.targetPlatform, (platformCounts.get(entry.targetPlatform) ?? 0) + 1));
  return Array.from(platformCounts.entries()).map(([platform, count]) => ({ count, platform }));
}
