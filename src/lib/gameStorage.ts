import { mockGameIds, mockGames } from '../data/mockGames';
import { loadLocalJson, loadPersistedJson, removePersistedKeys, savePersistedJson } from './localPersistence';
import {
  createIndexedDbGameRepository,
  type GameRepositoryStatus,
  type GameSnapshotRepairResult,
  type GameStorageVerification,
  type LegacyRecoveryMode,
  type LegacyRecoveryPreview,
  type LegacyRecoveryResult,
} from './indexedDbGameRepository';
import { gameStatuses, type Game, type GameCollectionType, type GamePlatform, type GameStatus } from '../types/game';

const STORAGE_KEY = 'questshelf.games.v1';

/**
 * Wave 3 seam. Games live in IndexedDB via this repository, with an in-memory snapshot
 * so loadGames() stays synchronous. The legacy `questshelf.games.v1` blob is now a
 * read-only import fallback only — normal saves no longer write it. The public
 * loadGames/saveGames API below delegates here, so no caller changed.
 */
export const gameRepository = createIndexedDbGameRepository({
  legacyLoadSync: () => loadLocalJson(STORAGE_KEY, [], normalizeLoadedGames),
  legacyLoadDurable: () => loadPersistedJson(STORAGE_KEY, [], normalizeLoadedGames),
  legacyClear: () => removePersistedKeys([STORAGE_KEY]),
  normalize: normalizeLoadedGames,
  legacySaveAll: (games) => savePersistedJson(STORAGE_KEY, normalizeLoadedGames(games)),
});

/** Awaited once at boot (before React renders) so getAllSync() is correct on first paint. */
export function initGameRepository(): Promise<void> {
  return gameRepository.ready();
}

export function getGameRepositoryStatus(): GameRepositoryStatus {
  return gameRepository.getStatus();
}

export function loadGames(): Game[] {
  return gameRepository.getAllSync();
}

export function loadGamesFromPersistentStorage(): Promise<Game[]> {
  return gameRepository.loadDurable();
}

export function saveGames(games: Game[]) {
  gameRepository.replaceAll(games);
}

// Wave 5: storage verification / repair / recovery (games). See indexedDbGameRepository.
export function verifyGameStorage(): Promise<GameStorageVerification> {
  return gameRepository.verify();
}

export function repairGameSnapshot(): Promise<GameSnapshotRepairResult> {
  return gameRepository.repairSnapshot();
}

export function previewLegacyGameRecovery(): Promise<LegacyRecoveryPreview> {
  return gameRepository.previewLegacyRecovery();
}

export function recoverGamesFromLegacyBlob(mode: LegacyRecoveryMode): Promise<LegacyRecoveryResult> {
  return gameRepository.recoverFromLegacyBlob(mode);
}

export function getMockGames(): Game[] {
  return mockGames.map((game) => ({ ...game, tags: [...game.tags] }));
}

export function isMockGame(game: Game) {
  return mockGameIds.has(game.id) && typeof game.steamAppId !== 'number' && game.externalSource !== 'steam';
}

export function removeMockGames(games: Game[]) {
  return games.filter((game) => !isMockGame(game));
}

export function normalizeLoadedGame(value: unknown): Game | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const game = value as Partial<Game>;

  if (typeof game.id !== 'string' || typeof game.title !== 'string') {
    return null;
  }

  // Migration guard: preserve user-owned optional fields via spread, then repair only the fields
  // that Questory needs to render safely. Do not overwrite valid notes, tags, or status.
  return {
    ...(game as Game),
    collectionType: normalizeLoadedCollectionType(game.collectionType),
    coverImage: typeof game.coverImage === 'string' ? game.coverImage : '',
    droppedAt: typeof game.droppedAt === 'string' ? game.droppedAt : undefined,
    droppedReason: typeof game.droppedReason === 'string' ? game.droppedReason : undefined,
    externalSource: normalizeExternalSource(game.externalSource),
    finishedAt: typeof game.finishedAt === 'string' ? game.finishedAt : undefined,
    hltbCompletionistHours: getOptionalNonNegativeNumber(game.hltbCompletionistHours),
    hltbId: typeof game.hltbId === 'string' ? game.hltbId : undefined,
    hltbLastSyncedAt: typeof game.hltbLastSyncedAt === 'string' ? game.hltbLastSyncedAt : undefined,
    hltbMainExtraHours: getOptionalNonNegativeNumber(game.hltbMainExtraHours),
    hltbMainHours: getOptionalNonNegativeNumber(game.hltbMainHours),
    hltbMatchConfidence: normalizeHltbMatchConfidence(game.hltbMatchConfidence),
    hltbSourceUrl: typeof game.hltbSourceUrl === 'string' ? game.hltbSourceUrl : undefined,
    hltbTitle: typeof game.hltbTitle === 'string' ? game.hltbTitle : undefined,
    displayTitleOverride: typeof game.displayTitleOverride === 'string' ? game.displayTitleOverride : undefined,
    id: game.id,
    lastPlayedAt: typeof game.lastPlayedAt === 'string' ? game.lastPlayedAt : null,
    lastSteamActivityAt: typeof game.lastSteamActivityAt === 'string' ? game.lastSteamActivityAt : undefined,
    lastSteamActivityDeltaMinutes: getOptionalNonNegativeNumber(game.lastSteamActivityDeltaMinutes),
    metadataSearchTitle: typeof game.metadataSearchTitle === 'string' ? game.metadataSearchTitle : undefined,
    metacriticScore: getOptionalPositiveNumber(game.metacriticScore ?? game.metacritic),
    notes: typeof game.notes === 'string' ? game.notes : '',
    originalImportedTitle: typeof game.originalImportedTitle === 'string' ? game.originalImportedTitle : undefined,
    platform: normalizeLoadedPlatform(game.platform),
    playtimeHours: getNonNegativeNumber(game.playtimeHours),
    rawgId: getOptionalNonNegativeNumber(game.rawgId),
    rawgSlug: typeof game.rawgSlug === 'string' ? game.rawgSlug : undefined,
    rawgTitle: typeof game.rawgTitle === 'string' ? game.rawgTitle : undefined,
    steamPlaytimeMinutes: getOptionalNonNegativeNumber(game.steamPlaytimeMinutes),
    priority: normalizeWishlistPriority(game.priority),
    romFiles: normalizeRomFiles(game.romFiles),
    status: normalizeLoadedStatus(game.status),
    tags: Array.isArray(game.tags) ? game.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    title: game.title,
  };
}

export function normalizeLoadedGames(value: unknown): Game[] {
  return Array.isArray(value)
    ? value.map(normalizeLoadedGame).filter((game): game is Game => Boolean(game))
    : [];
}

function normalizeLoadedCollectionType(collectionType: unknown): GameCollectionType {
  return collectionType === 'wishlist' ? 'wishlist' : 'library';
}

function normalizeLoadedPlatform(platform: unknown): GamePlatform {
  return typeof platform === 'string' && platform.trim() ? platform : 'Other';
}

function normalizeExternalSource(externalSource: unknown): Game['externalSource'] {
  return externalSource === 'manual' ||
    externalSource === 'steam' ||
    externalSource === 'steam-wishlist' ||
    externalSource === 'retro-rom'
    ? externalSource
    : undefined;
}

function normalizeHltbMatchConfidence(confidence: unknown): Game['hltbMatchConfidence'] {
  if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    return Math.min(Math.max(confidence, 0), 1);
  }

  if (confidence === 'exact') {
    return 1;
  }

  if (confidence === 'high') {
    return 0.9;
  }

  if (confidence === 'medium') {
    return 0.82;
  }

  return undefined;
}

function normalizeWishlistPriority(priority: unknown): Game['priority'] {
  return priority === 'low' || priority === 'medium' || priority === 'high' ? priority : undefined;
}

function normalizeLoadedStatus(status: unknown): GameStatus {
  if (typeof status !== 'string') {
    return 'Want to play';
  }

  if (status === 'Completed') {
    return 'Finished';
  }

  if (status === 'Backlog') {
    return 'Want to play';
  }

  return gameStatuses.includes(status as GameStatus) ? (status as GameStatus) : 'Want to play';
}

function getNonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
function getOptionalNonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function getOptionalPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeRomFiles(value: unknown): Game['romFiles'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const files = value.flatMap((file): NonNullable<Game['romFiles']> => {
    if (!file || typeof file !== 'object') {
      return [];
    }

    const candidate = file as { extension?: unknown; fileName?: unknown; path?: unknown; role?: unknown; uri?: unknown };

    if (typeof candidate.fileName !== 'string' || typeof candidate.path !== 'string') {
      return [];
    }

    return [
      {
        extension: typeof candidate.extension === 'string' ? candidate.extension : undefined,
        fileName: candidate.fileName,
        path: candidate.path,
        role: candidate.role === 'primary' || candidate.role === 'track' || candidate.role === 'disc' || candidate.role === 'file' ? candidate.role : undefined,
        uri: typeof candidate.uri === 'string' ? candidate.uri : undefined,
      },
    ];
  });

  return files.length > 0 ? files : undefined;
}
