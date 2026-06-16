import type { AppLanguage } from '../../i18n';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import { sanitizeShelfNickname } from '../../lib/shelfIdentity';
import type { PlatformQueueState, PlatformQueueSummary } from '../../lib/platformQueueStorage';
import type { Game } from '../../types/game';
import { getPlayingNowTimeBucket } from './playingNowGreeting';

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
  seed?: string;
  shelfIdentity?: string | null;
  shelfStats?: Pick<PlatformQueueSummary, 'platformSizes' | 'queuedCount'> | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const classicTitles = ['Portal', 'Portal 2', 'Half-Life 2', 'BioShock', 'Mass Effect', 'Skyrim', 'Fallout: New Vegas', 'The Witcher 3', 'Hollow Knight', 'Celeste', 'Hades'];
const looseClassicSuffixes = ['anniversary', 'definitive edition', 'enhanced edition', 'game of the year edition', 'goty edition', 'remaster', 'remastered', 'special edition', 'ultimate edition'];

export function getContextualGreeting({ activity, date = new Date(), featuredGame, games, language, queue, seed, shelfIdentity, shelfStats }: ContextualGreetingInput): ContextualGreeting | null {
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

  const unfinishedClassic = eligibleLibraryGames.find(isKnownUnfinishedClassic);
  if (unfinishedClassic) {
    candidates.push({
      headline: language === 'cs' ? `${libraryGames.length.toLocaleString('cs-CZ')} her.` : `${libraryGames.length.toLocaleString('en-US')} games.`,
      priority: 85,
      subtext: language === 'cs' ? `${unfinishedClassic.title} je pořád tady.` : `${unfinishedClassic.title} is still right there.`,
    });
  }

  const idlePlayingGame = getLongIdlePlayingGame(playingGames, date);
  if (idlePlayingGame) {
    const days = getDaysSince(idlePlayingGame.lastPlayedAt, date);
    candidates.push({
      headline: language === 'cs' ? `${idlePlayingGame.title} máš rozehraný už ${days.toLocaleString('cs-CZ')} dní.` : `You marked ${idlePlayingGame.title} as Playing ${days.toLocaleString('en-US')} days ago.`,
      priority: 82,
      subtext: language === 'cs' ? 'Odvážný tah.' : 'Bold move.',
    });
  }

  const currentPlayingGame = getDeterministicGame(playingGames, `${buildSeed({ date, language, seed, shelfIdentity })}-playing-reminder`);
  if (currentPlayingGame) {
    candidates.push({
      headline: language === 'cs' ? `${currentPlayingGame.title} už čeká.` : `${currentPlayingGame.title} is already waiting.`,
      priority: 78,
      subtext: '',
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
  if (queuedCount > 250) {
    candidates.push({
      headline: language === 'cs' ? `${queuedCount.toLocaleString('cs-CZ')} kandidátů v Quest Queue.` : `${queuedCount.toLocaleString('en-US')} candidates in Quest Queue.`,
      priority: 76,
      subtext: language === 'cs' ? 'To už není fronta. To je životní styl.' : 'That is not a queue. That is a lifestyle.',
    });
  } else if (queuedCount > 100) {
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
      headline: language === 'cs' ? `Steam zaznamenal pohyb u ${recentSteamGame.title}.` : `Steam noticed movement in ${recentSteamGame.title}.`,
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

  const platformBacklog = getDominantPlannedPlatform(queue, shelfStats);
  if (platformBacklog) {
    candidates.push({
      headline: language === 'cs' ? `${platformBacklog} táhne tenhle backlog.` : `${platformBacklog} is carrying this backlog.`,
      priority: 40,
      subtext: '',
    });
  }

  return selectWeightedCandidate(candidates, buildSeed({ date, language, seed, shelfIdentity }));
}

function selectWeightedCandidate(candidates: ContextualGreeting[], seed: string) {
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((total, candidate) => total + getPriorityWeight(candidate.priority), 0);
  let cursor = hashString(seed) % totalWeight;
  const stableCandidates = [...candidates].sort((first, second) => second.priority - first.priority || first.headline.localeCompare(second.headline) || first.subtext.localeCompare(second.subtext));
  for (const candidate of stableCandidates) {
    cursor -= getPriorityWeight(candidate.priority);
    if (cursor < 0) return candidate;
  }
  return stableCandidates[stableCandidates.length - 1] ?? null;
}

function getPriorityWeight(priority: number) {
  if (priority >= 90) return 4;
  if (priority >= 70) return 3;
  if (priority >= 50) return 2;
  return 1;
}

function buildSeed({ date, language, seed, shelfIdentity }: { date: Date; language: AppLanguage; seed?: string; shelfIdentity?: string | null }) {
  return seed ?? `${formatSeedDate(date)}-${getPlayingNowTimeBucket(date)}-${language}-${sanitizeShelfNickname(shelfIdentity)}`;
}

function formatSeedDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

function getDeterministicGame(games: Game[], seed: string) {
  if (games.length === 0) return null;
  const stableGames = [...games].sort((first, second) => first.title.localeCompare(second.title) || first.id.localeCompare(second.id));
  return stableGames[hashString(seed) % stableGames.length] ?? null;
}

function isFinishedOrDropped(game: Game) {
  return game.status === 'Finished' || game.status === 'Dropped';
}

function isKnownUnfinishedClassic(game: Game) {
  return !isFinishedOrDropped(game) && classicTitles.some((title) => looselyMatchesClassic(game.title, title));
}

function looselyMatchesClassic(gameTitle: string, classicTitle: string) {
  const normalizedGameTitle = normalizeTitle(gameTitle);
  const normalizedClassicTitle = normalizeTitle(classicTitle);
  if (normalizedGameTitle === normalizedClassicTitle) return true;
  return looseClassicSuffixes.some((suffix) => normalizedGameTitle === `${normalizedClassicTitle} ${normalizeTitle(suffix)}`);
}

function normalizeTitle(value: string) {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function getLongIdlePlayingGame(games: Game[], date: Date) {
  return games
    .filter((game) => getDaysSince(game.lastPlayedAt, date) > 14 && Number.isFinite(getDaysSince(game.lastPlayedAt, date)))
    .sort((first, second) => (Date.parse(first.lastPlayedAt ?? '') || 0) - (Date.parse(second.lastPlayedAt ?? '') || 0) || first.title.localeCompare(second.title))[0] ?? null;
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
    .map((game) => ({ game, detectedAt: activityByGameId.get(game.id) ?? (game.lastSteamActivityDeltaMinutes && game.lastSteamActivityDeltaMinutes > 0 ? game.lastSteamActivityAt : undefined) }))
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
