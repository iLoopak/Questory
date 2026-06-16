import type { AppLanguage } from '../../i18n';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import { sanitizeShelfNickname } from '../../lib/shelfIdentity';
import type { PlatformQueueState, PlatformQueueSummary } from '../../lib/platformQueueStorage';
import type { Game } from '../../types/game';
import { getPlayingNowTimeBucket } from './playingNowGreeting';

export type ContextualGreeting = {
  subtext: string;
};

export type ContextualGreetingInput = {
  activity: PlayActivityRecord[];
  date?: Date;
  featuredGame?: Game | null;
  games: Game[];
  playingNowGames?: Game[];
  language: AppLanguage;
  queue?: PlatformQueueState | null;
  seed?: string;
  previousSubtext?: string | null;
  shelfIdentity?: string | null;
  shelfStats?: Pick<PlatformQueueSummary, 'platformSizes' | 'queuedCount'> | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const classicTitles = ['Portal', 'Portal 2', 'Half-Life 2', 'BioShock', 'Mass Effect', 'Skyrim', 'Fallout: New Vegas', 'The Witcher 3', 'Hollow Knight', 'Celeste', 'Hades'];
const looseClassicSuffixes = ['anniversary', 'definitive edition', 'enhanced edition', 'game of the year edition', 'goty edition', 'remaster', 'remastered', 'special edition', 'ultimate edition'];

export function getContextualGreeting({ activity, date = new Date(), games, language, playingNowGames, previousSubtext, queue, seed, shelfIdentity, shelfStats }: ContextualGreetingInput): ContextualGreeting | null {
  const libraryGames = games.filter((game) => game.collectionType === 'library');
  const playingGames = (playingNowGames ?? libraryGames.filter((game) => game.status === 'Playing'))
    .filter((game) => game.collectionType === 'library' && game.status === 'Playing');
  const candidates: ContextualGreeting[] = [];

  if (libraryGames.length > 1000) {
    candidates.push({
      subtext: language === 'cs'
        ? `Quest Queue obsahuje ${libraryGames.length.toLocaleString('cs-CZ')} kandidátů. Žádný tlak.`
        : `Quest Queue contains ${libraryGames.length.toLocaleString('en-US')} candidates. No pressure.`,
    });
  } else if (libraryGames.length > 500) {
    candidates.push({
      subtext: language === 'cs' ? '500+ her. A pořád vybíráš?' : '500+ games. Still looking for something to play?',
    });
  }

  const unfinishedClassic = playingGames.find(isKnownClassic);
  if (unfinishedClassic) {
    candidates.push({
      subtext: language === 'cs' ? `${unfinishedClassic.title} je pořád tady.` : `${unfinishedClassic.title} is still right there.`,
    });
  }

  const idlePlayingGame = getLongIdlePlayingGame(playingGames, date);
  if (idlePlayingGame) {
    const days = getDaysSince(idlePlayingGame.lastPlayedAt, date);
    candidates.push({
      subtext: language === 'cs'
        ? `${idlePlayingGame.title} máš rozehraný už ${days.toLocaleString('cs-CZ')} dní. Odvážný tah.`
        : `You marked ${idlePlayingGame.title} as Playing ${days.toLocaleString('en-US')} days ago. Bold move.`,
    });
  }

  const currentPlayingGame = getDeterministicGame(playingGames, `${buildSeed({ date, language, seed, shelfIdentity })}-playing-reminder`);
  if (currentPlayingGame) {
    candidates.push({
      subtext: language === 'cs' ? `${currentPlayingGame.title} už čeká.` : `${currentPlayingGame.title} is already waiting.`,
    });
  }

  if (playingGames.length > 5) {
    candidates.push({
      subtext: language === 'cs' ? `${playingGames.length.toLocaleString('cs-CZ')} rozehraných her. Odvážná strategie.` : `${playingGames.length.toLocaleString('en-US')} active adventures. Bold strategy.`,
    });
  }

  const queuedCount = shelfStats?.queuedCount ?? queue?.entries.length ?? 0;
  if (queuedCount > 250) {
    candidates.push({
      subtext: language === 'cs' ? `${queuedCount.toLocaleString('cs-CZ')} kandidátů v Quest Queue. To už není fronta. To je životní styl.` : `${queuedCount.toLocaleString('en-US')} candidates in Quest Queue. That is not a queue. That is a lifestyle.`,
    });
  } else if (queuedCount > 100) {
    candidates.push({
      subtext: language === 'cs' ? `Quest Queue obsahuje ${queuedCount.toLocaleString('cs-CZ')} kandidátů. Žádný tlak.` : `Quest Queue contains ${queuedCount.toLocaleString('en-US')} candidates. No pressure.`,
    });
  }

  candidates.push(...getSteamActivityGreetingCandidates(playingGames, activity, date, language));

  if (playingGames.length === 1) {
    candidates.push({
      subtext: language === 'cs' ? 'Dnešní mise vypadá jasně.' : "Today's mission seems obvious.",
    });
  }

  const almostCompleteGame = playingGames
    .filter((game) => typeof game.steamAchievementsPercent === 'number' && game.steamAchievementsPercent > 90)
    .sort((first, second) => (second.steamAchievementsPercent ?? 0) - (first.steamAchievementsPercent ?? 0) || first.title.localeCompare(second.title))[0];
  if (almostCompleteGame) {
    candidates.push({
      subtext: language === 'cs' ? `${almostCompleteGame.title} je téměř hotový.` : `${almostCompleteGame.title} is almost complete.`,
    });
  }

  const platformBacklog = getDominantPlannedPlatform(queue, shelfStats);
  if (platformBacklog) {
    candidates.push({
      subtext: language === 'cs' ? `${platformBacklog} táhne tenhle backlog.` : `${platformBacklog} is carrying this backlog.`,
    });
  }

  return selectDeterministicCandidate(candidates, buildSeed({ date, language, seed, shelfIdentity }), previousSubtext);
}

function selectDeterministicCandidate(candidates: ContextualGreeting[], seed: string, previousSubtext?: string | null) {
  if (candidates.length === 0) return null;
  const eligibleCandidates = previousSubtext && candidates.length > 1 ? candidates.filter((candidate) => candidate.subtext !== previousSubtext) : candidates;
  return eligibleCandidates[hashString(seed) % eligibleCandidates.length] ?? null;
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

function isKnownClassic(game: Game) {
  return classicTitles.some((title) => looselyMatchesClassic(game.title, title));
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

function getSteamActivityGreetingCandidates(games: Game[], activity: PlayActivityRecord[], date: Date, language: AppLanguage): ContextualGreeting[] {
  const contexts = getSteamActivityGreetingContexts(games, activity, date);
  const candidates: ContextualGreeting[] = [];

  contexts.forEach((context) => {
    if (isSameLocalDay(context.lastActivityAt, date)) {
      candidates.push(...pickTemplates(language, [
        `You already played ${context.game.title} today.`,
        `${context.game.title} is today's front-runner.`,
        `Steam noticed activity in ${context.game.title}.`,
      ], [
        `Dnes už jsi hrál ${context.game.title}.`,
        `${context.game.title} zatím vede dnešní statistiky.`,
        `Steam zaznamenal aktivitu u ${context.game.title}.`,
      ]));
    }

    if (context.deltaMinutes > 0 && getDaysSince(context.lastActivityAt, date) >= 0 && getDaysSince(context.lastActivityAt, date) <= 7) {
      const delta = formatPlaytimeDelta(context.deltaMinutes, language);
      candidates.push(...pickTemplates(language, [
        `${context.game.title} gained ${delta} since your last sync.`,
        `${context.game.title} has seen some action recently.`,
        `${delta} added to ${context.game.title}. Progress is progress.`,
      ], [
        `${context.game.title} získal od poslední synchronizace ${delta}.`,
        `${context.game.title} v poslední době nezahálel.`,
        `${delta} přidáno do ${context.game.title}. I to se počítá.`,
      ]));

      if (context.deltaMinutes >= 120) {
        candidates.push({ subtext: language === 'cs' ? `${delta} v ${context.game.title}. To nebyla úplně rychlá session.` : `${delta} in ${context.game.title}. Not exactly a quick session.` });
      }
    }

    if (context.returnedAfterLongInactivity && getDaysSince(context.lastActivityAt, date) <= 7) {
      candidates.push(...pickTemplates(language, [
        `You returned to ${context.game.title}.`,
        `${context.game.title} noticed your comeback.`,
      ], [
        `Vrátil ses do ${context.game.title}.`,
        `${context.game.title} zaznamenal tvůj návrat.`,
      ]));
    }
  });

  const mostActive = getUniqueMostActiveContext(contexts, date);
  if (mostActive) {
    candidates.push(...pickTemplates(language, [
      `${mostActive.game.title} currently has your attention.`,
      `${mostActive.game.title} is winning the battle for your time.`,
    ], [
      `${mostActive.game.title} si aktuálně drží tvoji pozornost.`,
      `${mostActive.game.title} zatím vyhrává boj o tvůj čas.`,
    ]));
  }

  return candidates;
}

function pickTemplates(language: AppLanguage, en: string[], cs: string[]): ContextualGreeting[] {
  return (language === 'cs' ? cs : en).map((subtext) => ({ subtext }));
}

type SteamActivityGreetingContext = {
  deltaMinutes: number;
  game: Game;
  lastActivityAt: string;
  returnedAfterLongInactivity: boolean;
};

function getSteamActivityGreetingContexts(games: Game[], activity: PlayActivityRecord[], date: Date): SteamActivityGreetingContext[] {
  const recordsByGameId = new Map<string, PlayActivityRecord[]>();
  activity
    .filter((record) => record.source === 'steam' && record.type === 'playtime_delta' && typeof record.deltaMinutes === 'number' && record.deltaMinutes > 0)
    .forEach((record) => recordsByGameId.set(record.gameId, [...(recordsByGameId.get(record.gameId) ?? []), record]));

  recordsByGameId.forEach((records, gameId) => {
    recordsByGameId.set(gameId, records.sort((first, second) => second.detectedAt.localeCompare(first.detectedAt)));
  });

  return games.flatMap((game) => {
    const records = recordsByGameId.get(game.id) ?? [];
    const latestRecord = records[0];
    const deltaMinutes = latestRecord?.deltaMinutes ?? game.lastSteamActivityDeltaMinutes;
    const lastActivityAt = latestRecord?.detectedAt ?? game.lastSteamActivityAt;

    if (!lastActivityAt || !deltaMinutes || deltaMinutes <= 0 || getDaysSince(lastActivityAt, date) < 0) {
      return [];
    }

    const previousRecord = records[1];
    const returnedAfterLongInactivity = Boolean(previousRecord && getDaysBetween(previousRecord.detectedAt, lastActivityAt) >= 30);
    return [{ deltaMinutes, game, lastActivityAt, returnedAfterLongInactivity }];
  });
}

function getUniqueMostActiveContext(contexts: SteamActivityGreetingContext[], date: Date) {
  const sorted = contexts.filter((context) => context.deltaMinutes > 0 && getDaysSince(context.lastActivityAt, date) <= 7).sort((first, second) => second.deltaMinutes - first.deltaMinutes || first.game.title.localeCompare(second.game.title));
  if (sorted.length === 0) return null;
  if (sorted.length > 1 && sorted[0].deltaMinutes === sorted[1].deltaMinutes) return null;
  return sorted[0];
}

function formatPlaytimeDelta(minutes: number, language: AppLanguage) {
  const roundedMinutes = Math.max(1, Math.round(minutes));
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  if (hours <= 0) return language === 'cs' ? `${roundedMinutes} min` : `${roundedMinutes} minutes`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

function isSameLocalDay(value: string, date: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return startOfDay(parsed).getTime() === startOfDay(date).getTime();
}

function getDaysBetween(from: string, to: string) {
  const fromDate = Date.parse(from);
  const toDate = Date.parse(to);
  if (!Number.isFinite(fromDate) || !Number.isFinite(toDate)) return 0;
  return Math.floor((startOfDay(new Date(toDate)).getTime() - startOfDay(new Date(fromDate)).getTime()) / DAY_MS);
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
