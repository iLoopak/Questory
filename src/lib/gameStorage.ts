import { mockGameIds, mockGames } from '../data/mockGames';
import { loadLocalJson, loadPersistedJson, removePersistedKeys, savePersistedJson } from './localPersistence';
import {
  createIndexedDbGameRepository,
  type GameRepairResult,
  type GameRepositoryStatus,
  type GameSnapshotRepairResult,
  type GameStorageVerification,
  type LegacyRecoveryMode,
  type LegacyRecoveryPreview,
  type LegacyRecoveryResult,
} from './indexedDbGameRepository';
import { isGameExternalSource } from './gameIdentity';
import { gameStatuses, type Game, type GameCollectionType, type GamePlatform, type GameStatus } from '../types/game';
import { markBackupRelevantChange } from './backupRevision';
import { SerializedPersistenceCoordinator, type PersistenceState } from './gamePersistenceLifecycle';

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

const gamePersistence = new SerializedPersistenceCoordinator<Game[]>({
  initialValue: gameRepository.getAllSync(),
  serialize: (games) => JSON.stringify(normalizeLoadedGames(games)),
  write: (games) => gameRepository.replaceAllDurable(normalizeLoadedGames(games)),
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

export function saveGames(games: Game[]) {
  if (gamePersistence.save(normalizeLoadedGames(games))) markBackupRelevantChange(STORAGE_KEY);
}

/** Await every older game write and durably persist the supplied latest canonical snapshot. */
export function flushGameWrites(games?: Game[]): Promise<void> {
  return gamePersistence.flush(typeof games === 'undefined' ? undefined : normalizeLoadedGames(games));
}

export function getGamePersistenceState(): PersistenceState {
  return gamePersistence.getState();
}

export function subscribeGamePersistence(listener: () => void): () => void {
  return gamePersistence.subscribe(listener);
}

// Wave 5: storage verification / repair / recovery (games). See indexedDbGameRepository.
export function verifyGameStorage(): Promise<GameStorageVerification> {
  return gameRepository.verify();
}

export function repairGameSnapshot(): Promise<GameSnapshotRepairResult> {
  return gameRepository.repairSnapshot();
}

/** Durable repair: rewrites the valid rows and deletes invalid/duplicate ones in IndexedDB. */
export function repairGameStorage(): Promise<GameRepairResult> {
  return gameRepository.repairDurable();
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

/** Why a persisted/backup game row could not be loaded. */
export type GameRowRejectionReason = 'not-an-object' | 'missing-id' | 'missing-title' | 'invalid-id' | 'invalid-title';
export type GameRowIssueReason = GameRowRejectionReason | 'duplicate-id' | 'malformed-steam-app-id' | 'invalid-rating' | 'invalid-boolean' | 'invalid-date';
export type GameRowIssue = { index: number; reason: GameRowIssueReason; id?: string };

export type GameRowRejection = {
  /** Position in the original array, so a report can point at the offending row. */
  index: number;
  reason: GameRowRejectionReason;
};

export type GameRowsParseResult = {
  games: Game[];
  rejected: GameRowRejection[];
  /** Rows present in the input (0 when the input was not an array at all). */
  rowCount: number;
  /** Rows that normalized successfully. */
  acceptedCount: number;
  isArray: boolean;
};

function getGameRowRejectionReason(value: unknown): GameRowRejectionReason | null {
  if (!value || typeof value !== 'object') {
    return 'not-an-object';
  }

  const game = value as Partial<Game>;

  if (typeof game.id !== 'string') {
    return 'missing-id';
  }
  if (!game.id.trim()) return 'invalid-id';

  if (typeof game.title !== 'string') {
    return 'missing-title';
  }
  if (!game.title.trim()) return 'invalid-title';

  return null;
}

/**
 * Per-row parse of a games array (the `questshelf.games.v1` backup section, or the legacy blob).
 *
 * Same acceptance rules as `normalizeLoadedGames`, but it reports which rows were dropped and
 * why, so restore can refuse to silently replace a populated collection with nothing.
 */
export function parseLoadedGameRows(value: unknown): GameRowsParseResult {
  if (!Array.isArray(value)) {
    return { games: [], rejected: [], rowCount: 0, acceptedCount: 0, isArray: false };
  }

  const games: Game[] = [];
  const rejected: GameRowRejection[] = [];

  value.forEach((row, index) => {
    const reason = getGameRowRejectionReason(row);
    if (reason) {
      rejected.push({ index, reason });
      return;
    }
    games.push(normalizeLoadedGame(row) as Game);
  });

  return { games, rejected, rowCount: value.length, acceptedCount: games.length, isArray: true };
}

export function normalizeLoadedGame(value: unknown): Game | null {
  if (getGameRowRejectionReason(value)) {
    return null;
  }

  const game = value as Partial<Game> & Pick<Game, 'id' | 'title'>;

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
    favorite: typeof game.favorite === 'boolean' ? game.favorite : undefined,
    rating: typeof game.rating === 'number' && Number.isFinite(game.rating) && game.rating >= 0 && game.rating <= 5 ? game.rating : game.rating === null ? null : undefined,
    steamAppId: typeof game.steamAppId === 'number' && Number.isInteger(game.steamAppId) && game.steamAppId > 0 ? game.steamAppId : undefined,
    lastPlayedAt: validDateString(game.lastPlayedAt) ? game.lastPlayedAt : null,
    lastSteamActivityAt: validDateString(game.lastSteamActivityAt) ? game.lastSteamActivityAt : undefined,
    lastSteamActivityDeltaMinutes: getOptionalNonNegativeNumber(game.lastSteamActivityDeltaMinutes),
    metadataSearchTitle: typeof game.metadataSearchTitle === 'string' ? game.metadataSearchTitle : undefined,
    metacriticScore: getOptionalPositiveNumber(game.metacriticScore ?? game.metacritic),
    notes: typeof game.notes === 'string' ? game.notes : '',
    originalImportedTitle: typeof game.originalImportedTitle === 'string' ? game.originalImportedTitle : undefined,
    platform: normalizeLoadedPlatform(game.platform),
    playtimeHours: getNonNegativeNumber(game.playtimeHours),
    rawgId: getOptionalNonNegativeNumber(game.rawgId),
    rawgRating: getOptionalPositiveNumber(game.rawgRating),
    rawgRatingsCount: getOptionalNonNegativeNumber(game.rawgRatingsCount),
    rawgSlug: typeof game.rawgSlug === 'string' ? game.rawgSlug : undefined,
    rawgTitle: typeof game.rawgTitle === 'string' ? game.rawgTitle : undefined,
    steamPlaytimeMinutes: getOptionalNonNegativeNumber(game.steamPlaytimeMinutes),
    priority: normalizeWishlistPriority(game.priority),
    romFiles: normalizeRomFiles(game.romFiles),
    status: normalizeLoadedStatus(game.status),
    tags: Array.isArray(game.tags) ? game.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    title: game.title.trim(),
  };
}

/** Inspect raw rows without mutating or exposing their contents in diagnostics. */
export function analyzePersistedGameRows(value: unknown): { games: Game[]; issues: GameRowIssue[]; problematicRows: unknown[] } {
  if (!Array.isArray(value)) return { games: [], issues: [], problematicRows: [] };
  const issues: GameRowIssue[] = []; const problematic = new Set<number>(); const seen = new Set<string>();
  value.forEach((row, index) => {
    const rejection = getGameRowRejectionReason(row);
    if (rejection) { issues.push({ index, reason: rejection }); problematic.add(index); return; }
    const game = row as Partial<Game> & { id: string };
    if (seen.has(game.id)) { issues.push({ index, reason: 'duplicate-id', id: game.id }); problematic.add(index); } else seen.add(game.id);
    if (game.steamAppId !== undefined && !(typeof game.steamAppId === 'number' && Number.isInteger(game.steamAppId) && game.steamAppId > 0)) { issues.push({ index, reason: 'malformed-steam-app-id', id: game.id }); problematic.add(index); }
    if (game.rating !== undefined && game.rating !== null && !(typeof game.rating === 'number' && Number.isFinite(game.rating) && game.rating >= 0 && game.rating <= 5)) { issues.push({ index, reason: 'invalid-rating', id: game.id }); problematic.add(index); }
    if (game.favorite !== undefined && typeof game.favorite !== 'boolean') { issues.push({ index, reason: 'invalid-boolean', id: game.id }); problematic.add(index); }
    for (const date of [game.lastPlayedAt, game.updatedAt, game.importedAt, game.finishedAt, game.droppedAt]) if (date !== undefined && date !== null && !validDateString(date)) { issues.push({ index, reason: 'invalid-date', id: game.id }); problematic.add(index); break; }
  });
  return { games: normalizeLoadedGames(value), issues, problematicRows: [...problematic].map((index) => value[index]) };
}

function validDateString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value)); }

export function normalizeLoadedGames(value: unknown): Game[] {
  return parseLoadedGameRows(value).games;
}

function normalizeLoadedCollectionType(collectionType: unknown): GameCollectionType {
  return collectionType === 'wishlist' ? 'wishlist' : 'library';
}

function normalizeLoadedPlatform(platform: unknown): GamePlatform {
  return typeof platform === 'string' && platform.trim() ? platform : 'Other';
}

function normalizeExternalSource(externalSource: unknown): Game['externalSource'] {
  // Guards against the canonical list in types/game.ts. Previously this hard-coded four values
  // and silently erased `playstation-library` / `nintendo-virtual-game-cards` provenance on
  // every load and backup round-trip, even though importers write them.
  return isGameExternalSource(externalSource) ? externalSource : undefined;
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
