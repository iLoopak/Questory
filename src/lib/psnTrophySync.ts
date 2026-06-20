import { getPsnTrophyTitles, PsnApiError } from '../services/psnApi';
import type { PsnTrophyTitle, PsnTrophySyncProgress, PsnTrophySyncSummary } from '../types/psn';
import type { Game } from '../types/game';
import { hasProtectedArtwork } from './gameCoverImages';

export type PsnTrophySyncResult = {
  games: Game[];
  summary: PsnTrophySyncSummary;
};

export type PsnTrophySyncBatchResult = {
  games: Game[];
  progress: PsnTrophySyncProgress;
  summary: PsnTrophySyncSummary;
};

export function isPsnSyncableGame(game: Pick<Game, 'collectionType' | 'platform'>): boolean {
  return game.collectionType === 'library' && (game.platform === 'PS4' || game.platform === 'PS5');
}

export async function syncPsnTrophiesForGames(
  games: Game[],
  accessToken: string,
  syncedAt: string,
  onProgress?: (progress: PsnTrophySyncProgress) => void,
): Promise<PsnTrophySyncResult> {
  const syncableGames = games.filter(isPsnSyncableGame);
  const summary: PsnTrophySyncSummary = { matchedCount: 0, updatedCount: 0, skippedCount: 0 };

  if (syncableGames.length === 0) {
    return { games, summary };
  }

  onProgress?.({ completed: 0, total: syncableGames.length });

  let trophyTitles: PsnTrophyTitle[];
  try {
    trophyTitles = await getPsnTrophyTitles(accessToken);
  } catch (error) {
    if (error instanceof PsnApiError) throw error;
    throw new PsnApiError('Failed to fetch PSN trophy titles.', 'api-failure');
  }

  const titlesByNpId = new Map(trophyTitles.map((t) => [t.npCommunicationId, t]));
  const titlesByNormalized = buildNormalizedTitleIndex(trophyTitles);

  let nextGames = games;
  let completed = 0;

  for (const game of syncableGames) {
    const match = findMatchingTrophyTitle(game, titlesByNpId, titlesByNormalized);
    completed += 1;
    onProgress?.({ completed, total: syncableGames.length });

    if (!match) {
      summary.skippedCount += 1;
      continue;
    }

    summary.matchedCount += 1;

    const updates = buildGameUpdates(game, match, syncedAt);
    const hasChanged = Object.keys(updates).some(
      (key) => game[key as keyof Game] !== updates[key as keyof typeof updates],
    );

    if (!hasChanged) {
      continue;
    }

    summary.updatedCount += 1;
    nextGames = nextGames.map((g) => (g.id === game.id ? { ...g, ...updates } : g));
  }

  debugPsnSync('completed', { ...summary, trophyTitleCount: trophyTitles.length });
  return { games: nextGames, summary };
}

function buildGameUpdates(game: Game, match: PsnTrophyTitle, syncedAt: string): Partial<Game> {
  const updates: Partial<Game> = {
    psnNpCommunicationId: match.npCommunicationId,
    psnTrophyPercent: match.progress,
    psnTrophyBronze: match.earnedTrophies.bronze,
    psnTrophySilver: match.earnedTrophies.silver,
    psnTrophyGold: match.earnedTrophies.gold,
    psnTrophyPlatinum: match.earnedTrophies.platinum,
    psnTrophyBronzeTotal: match.definedTrophies.bronze,
    psnTrophySilverTotal: match.definedTrophies.silver,
    psnTrophyGoldTotal: match.definedTrophies.gold,
    psnTrophyPlatinumTotal: match.definedTrophies.platinum,
    psnTrophySyncedAt: syncedAt,
    updatedAt: syncedAt,
  };

  // Use PSN icon as cover art when the game has no better source.
  // hasProtectedArtwork guards user-uploaded, Steam, and Steam-linked covers.
  // We also skip if rawg already provided art since rawg > psn in priority.
  if (
    match.trophyTitleIconUrl &&
    !hasProtectedArtwork(game) &&
    game.artworkSource !== 'rawg'
  ) {
    updates.coverImage = match.trophyTitleIconUrl;
    updates.artworkSource = 'psn';
    updates.artworkUpdatedAt = syncedAt;
  }

  // Use last trophy activity as lastPlayedAt when we have no better signal.
  // Only advance the date — never move it backward.
  if (match.lastUpdatedDateTime) {
    const psnDate = new Date(match.lastUpdatedDateTime).getTime();
    const currentDate = game.lastPlayedAt ? new Date(game.lastPlayedAt).getTime() : 0;
    if (Number.isFinite(psnDate) && psnDate > currentDate) {
      updates.lastPlayedAt = match.lastUpdatedDateTime;
    }
  }

  return updates;
}

function findMatchingTrophyTitle(
  game: Game,
  titlesByNpId: Map<string, PsnTrophyTitle>,
  titlesByNormalized: Map<string, PsnTrophyTitle[]>,
): PsnTrophyTitle | null {
  if (game.psnNpCommunicationId) {
    const byId = titlesByNpId.get(game.psnNpCommunicationId);
    if (byId) return byId;
  }

  const normalized = normalizeTitle(game.title);
  const candidates = titlesByNormalized.get(normalized) ?? [];

  const platformFilter = game.platform === 'PS5' ? 'PS5' : 'PS4';
  const platformMatch = candidates.find((t) => t.trophyTitlePlatform.includes(platformFilter));
  if (platformMatch) return platformMatch;

  return candidates[0] ?? null;
}

function buildNormalizedTitleIndex(titles: PsnTrophyTitle[]): Map<string, PsnTrophyTitle[]> {
  const index = new Map<string, PsnTrophyTitle[]>();
  for (const title of titles) {
    const key = normalizeTitle(title.trophyTitleName);
    const existing = index.get(key) ?? [];
    existing.push(title);
    index.set(key, existing);
  }
  return index;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasPsnTrophyData(game: Pick<Game, 'psnTrophyPercent' | 'psnNpCommunicationId'>): boolean {
  return typeof game.psnTrophyPercent === 'number' && Boolean(game.psnNpCommunicationId);
}

export function formatPsnTrophySummary(
  game: Pick<
    Game,
    | 'psnTrophyPercent'
    | 'psnTrophyBronze'
    | 'psnTrophySilver'
    | 'psnTrophyGold'
    | 'psnTrophyPlatinum'
    | 'psnTrophyBronzeTotal'
    | 'psnTrophySilverTotal'
    | 'psnTrophyGoldTotal'
    | 'psnTrophyPlatinumTotal'
  >,
): string {
  const percent = game.psnTrophyPercent ?? 0;
  const parts: string[] = [];

  if ((game.psnTrophyPlatinumTotal ?? 0) > 0) {
    const earned = game.psnTrophyPlatinum ?? 0;
    parts.push(earned > 0 ? '🏆 ✓' : '🏆 –');
  }

  const goldEarned = game.psnTrophyGold ?? 0;
  const goldTotal = game.psnTrophyGoldTotal;
  parts.push(goldTotal !== undefined ? `🥇 ${goldEarned}/${goldTotal}` : `🥇 ${goldEarned}`);

  const silverEarned = game.psnTrophySilver ?? 0;
  const silverTotal = game.psnTrophySilverTotal;
  parts.push(silverTotal !== undefined ? `🥈 ${silverEarned}/${silverTotal}` : `🥈 ${silverEarned}`);

  const bronzeEarned = game.psnTrophyBronze ?? 0;
  const bronzeTotal = game.psnTrophyBronzeTotal;
  parts.push(bronzeTotal !== undefined ? `🥉 ${bronzeEarned}/${bronzeTotal}` : `🥉 ${bronzeEarned}`);

  return `${percent}% · ${parts.join(' · ')}`;
}

function debugPsnSync(message: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.debug(`[PsnTrophySync] ${message}`, data ?? {});
}
