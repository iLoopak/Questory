import { getGameRomKey, getGameTitlePlatformKey, type GameIdentitySignal } from './gameIdentity';
import { normalizePlatformQueueState, type PlatformQueueEntry, type PlatformQueueState } from './platformQueueStorage';
import { normalizePlayActivityRecords, type PlayActivityRecord } from './playActivityStorage';
import { normalizeReviewModeState, type ReviewModeState } from './reviewModeStorage';
import { normalizeIgnoredSteamGames, type IgnoredSteamGame } from './steamIgnoredGamesStorage';
import type { Game } from '../types/game';

export type BackupMergePolicyKind =
  | 'additive-union'
  | 'record-level-merge'
  | 'local-wins'
  | 'backup-wins-replacement'
  | 'derived-data-ignored'
  | 'requires-explicit-user-choice';

export type BackupMergePolicy = {
  key: string;
  label: string;
  policy: BackupMergePolicyKind;
  detail: string;
};

/** One explicit policy for every section in backup schema v1. */
export const backupMergePolicies = [
  { key: 'questshelf.achievementCounters.v1', label: 'Achievement counters', policy: 'local-wins', detail: 'Local counters are preserved to avoid double-counting.' },
  { key: 'questshelf.games.v1', label: 'Games', policy: 'record-level-merge', detail: 'Match by safe identity, preserve canonical local IDs, and use the newer matching record.' },
  { key: 'questshelf.rawgMetadataCache.v1', label: 'RAWG metadata cache', policy: 'derived-data-ignored', detail: 'Incoming derived cache data is ignored.' },
  { key: 'questshelf.recommendationFeedback.v1', label: 'Recommendation feedback', policy: 'additive-union', detail: 'Feedback is unioned by its stable recommendation identity.' },
  { key: 'questshelf.recommendationPreferences.v1', label: 'Recommendation preferences', policy: 'requires-explicit-user-choice', detail: 'Local values are preserved unless backup settings are explicitly selected.' },
  { key: 'questshelf.tasteProfile.v1', label: 'Taste profile', policy: 'record-level-merge', detail: 'Explicit and temporary signals are unioned, then observed taste is rebuilt.' },
  { key: 'questshelf.steamIgnoredGames.v1', label: 'Ignored Steam games', policy: 'additive-union', detail: 'Union by Steam App ID.' },
  { key: 'questshelf.libraryFilters.v1', label: 'Library filters', policy: 'local-wins', detail: 'Device-local view state is preserved.' },
  { key: 'questshelf.wishlistFilters.v1', label: 'Wishlist filters', policy: 'local-wins', detail: 'Device-local view state is preserved.' },
  { key: 'questshelf.onboarding.v1', label: 'Onboarding progress', policy: 'local-wins', detail: 'Local setup progress is preserved.' },
  { key: 'questshelf.platformQueues.v1', label: 'Platform Plans', policy: 'record-level-merge', detail: 'Plans are remapped and unioned; local entries/settings win conflicts.' },
  { key: 'questshelf.playActivity.v1', label: 'Play activity', policy: 'additive-union', detail: 'Remap game IDs, then union by stable activity ID.' },
  { key: 'questshelf.reviewMode.v1', label: 'Quest Queue review state', policy: 'record-level-merge', detail: 'References are remapped and unioned; local session settings win.' },
  { key: 'questshelf.rawgSettings.v1', label: 'RAWG settings', policy: 'requires-explicit-user-choice', detail: 'Local secrets are preserved unless backup settings are explicitly selected.' },
  { key: 'questshelf.steamGridDbSettings.v1', label: 'SteamGridDB settings', policy: 'requires-explicit-user-choice', detail: 'Local secrets are preserved unless backup settings are explicitly selected.' },
  { key: 'questshelf.isThereAnyDealSettings.v1', label: 'IsThereAnyDeal settings', policy: 'requires-explicit-user-choice', detail: 'Local secrets are preserved unless backup settings are explicitly selected.' },
  { key: 'questshelf.steamSettings.v1', label: 'Steam settings', policy: 'requires-explicit-user-choice', detail: 'Local secrets are preserved unless backup settings are explicitly selected.' },
  { key: 'questshelf.appPersonalization.v1', label: 'App personalization', policy: 'requires-explicit-user-choice', detail: 'Local values are preserved unless backup settings are explicitly selected.' },
  { key: 'questshelf.shelfIdentity.v1', label: 'Shelf identity', policy: 'requires-explicit-user-choice', detail: 'Local values are preserved unless backup settings are explicitly selected.' },
] as const satisfies readonly BackupMergePolicy[];

export type GameIdentityMapping = {
  backupGameId: string;
  canonicalGameId?: string;
  candidates?: string[];
  signal?: GameIdentitySignal;
  status: 'mapped' | 'added' | 'ambiguous';
};

export type GameMergeResult = {
  games: Game[];
  idMap: Map<string, string>;
  identities: GameIdentityMapping[];
  added: number;
  updated: number;
  unchanged: number;
  ambiguous: number;
};

export type UnresolvedGameReference = {
  gameId: string;
  section: 'Platform Plans' | 'Quest Queue review state' | 'Play activity';
};

export type SectionMergePreview = {
  added: number;
  conflicting: number;
  key: string;
  label: string;
  localOnlyPreserved: number;
  policy: BackupMergePolicyKind;
  updated: number;
  willReplace: boolean;
};

export type BackupMergePreview = {
  games: Pick<GameMergeResult, 'added' | 'updated' | 'unchanged' | 'ambiguous'>;
  identityMap: Record<string, string>;
  sections: SectionMergePreview[];
  unresolvedGameReferences: UnresolvedGameReference[];
};

export type PreparedBackupMerge = {
  games: GameMergeResult;
  ignoredSteamGames: IgnoredSteamGame[];
  playActivity: PlayActivityRecord[];
  platformQueues: PlatformQueueState;
  reviewMode: ReviewModeState;
  preview: BackupMergePreview;
};

export type PrepareBackupMergeInput = {
  backupGames: Game[];
  backupIgnoredSteamGames: IgnoredSteamGame[];
  backupPlayActivity: PlayActivityRecord[];
  backupPlatformQueues: PlatformQueueState;
  backupReviewMode: ReviewModeState;
  localGames: Game[];
  localIgnoredSteamGames: IgnoredSteamGame[];
  localPlayActivity: PlayActivityRecord[];
  localPlatformQueues: PlatformQueueState;
  localReviewMode: ReviewModeState;
  presentKeys: ReadonlySet<string>;
  useBackupSingletons?: boolean;
};

export function mergeGamesWithIdentityMap(localGames: Game[], backupGames: Game[]): GameMergeResult {
  const games = localGames.map((game) => ({ ...game }));
  const idMap = new Map<string, string>();
  const identities: GameIdentityMapping[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let ambiguous = 0;

  for (const backupGame of backupGames) {
    const match = resolveGameIdentity(games, backupGame);
    if (match.status === 'ambiguous') {
      ambiguous += 1;
      identities.push({ backupGameId: backupGame.id, candidates: match.candidates.map((game) => game.id), signal: match.signal, status: 'ambiguous' });
      // Ambiguous records are retained under their own ID unless that ID is already occupied.
      if (!games.some((game) => game.id === backupGame.id)) {
        games.push(backupGame);
        idMap.set(backupGame.id, backupGame.id);
        added += 1;
      }
      continue;
    }

    if (match.status === 'none') {
      games.push(backupGame);
      idMap.set(backupGame.id, backupGame.id);
      identities.push({ backupGameId: backupGame.id, canonicalGameId: backupGame.id, status: 'added' });
      added += 1;
      continue;
    }

    idMap.set(backupGame.id, match.game.id);
    identities.push({ backupGameId: backupGame.id, canonicalGameId: match.game.id, signal: match.signal, status: 'mapped' });
    const index = games.findIndex((game) => game.id === match.game?.id);
    if (index >= 0 && isBackupGameNewer(backupGame, games[index])) {
      games[index] = { ...games[index], ...backupGame, id: games[index].id };
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  return { added, ambiguous, games, idMap, identities, unchanged, updated };
}

export function prepareBackupMerge(input: PrepareBackupMergeInput): PreparedBackupMerge {
  const games = mergeGamesWithIdentityMap(input.localGames, input.backupGames);
  const localGameIds = new Set(games.games.map((game) => game.id));
  const unresolved = new Map<string, UnresolvedGameReference>();
  const remap = (gameId: string, section: UnresolvedGameReference['section']) => {
    const canonical = games.idMap.get(gameId);
    if (canonical) return canonical;
    if (localGameIds.has(gameId)) return gameId;
    unresolved.set(`${section}:${gameId}`, { gameId, section });
    return gameId;
  };

  const ignoredSteamGames = mergeIgnoredSteamGames(input.localIgnoredSteamGames, input.backupIgnoredSteamGames);
  const playActivity = mergePlayActivity(input.localPlayActivity, input.backupPlayActivity, (id) => remap(id, 'Play activity'));
  const platformQueues = mergePlatformQueues(input.localPlatformQueues, input.backupPlatformQueues, (id) => remap(id, 'Platform Plans'));
  const reviewMode = mergeReviewMode(input.localReviewMode, input.backupReviewMode, (id) => remap(id, 'Quest Queue review state'));

  const sections = backupMergePolicies
    .filter((policy) => input.presentKeys.has(policy.key))
    .map<SectionMergePreview>((policy) => {
      if (policy.key === 'questshelf.games.v1') {
        const matchedLocalIds = new Set(games.identities.flatMap((identity) => identity.status === 'mapped' && identity.canonicalGameId ? [identity.canonicalGameId] : []));
        return {
          added: games.added,
          conflicting: games.ambiguous,
          key: policy.key,
          label: policy.label,
          localOnlyPreserved: input.localGames.filter((game) => !matchedLocalIds.has(game.id)).length,
          policy: policy.policy,
          updated: games.updated,
          willReplace: false,
        };
      }
      if (policy.key === 'questshelf.steamIgnoredGames.v1') return sectionPreview(policy, input.localIgnoredSteamGames.length, input.backupIgnoredSteamGames.length, ignoredSteamGames.length);
      if (policy.key === 'questshelf.playActivity.v1') return sectionPreview(policy, input.localPlayActivity.length, input.backupPlayActivity.length, playActivity.length);
      if (policy.key === 'questshelf.platformQueues.v1') return sectionPreview(policy, input.localPlatformQueues.entries.length, input.backupPlatformQueues.entries.length, platformQueues.entries.length);
      if (policy.key === 'questshelf.reviewMode.v1') return sectionPreview(policy, reviewReferenceCount(input.localReviewMode), reviewReferenceCount(input.backupReviewMode), reviewReferenceCount(reviewMode));
      const willReplace = policy.policy === 'requires-explicit-user-choice' && Boolean(input.useBackupSingletons);
      return { added: 0, conflicting: willReplace ? 1 : 0, key: policy.key, label: policy.label, localOnlyPreserved: willReplace ? 0 : 1, policy: policy.policy, updated: willReplace ? 1 : 0, willReplace };
    });

  return {
    games,
    ignoredSteamGames,
    playActivity,
    platformQueues,
    reviewMode,
    preview: {
      games: { added: games.added, ambiguous: games.ambiguous, unchanged: games.unchanged, updated: games.updated },
      identityMap: Object.fromEntries(games.idMap),
      sections,
      unresolvedGameReferences: [...unresolved.values()],
    },
  };
}

function resolveGameIdentity(games: Game[], backupGame: Game): { status: 'none' } | { status: 'matched'; game: Game; signal: GameIdentitySignal } | { status: 'ambiguous'; candidates: Game[]; signal: GameIdentitySignal } {
  const exact = games.find((game) => game.id === backupGame.id);
  if (exact) return { status: 'matched', game: exact, signal: 'id' };
  const sameCollection = games.filter((game) => game.collectionType === backupGame.collectionType);
  const tiers: Array<[GameIdentitySignal, (game: Game) => boolean]> = [
    ['steam-app-id', (game) => typeof backupGame.steamAppId === 'number' && game.steamAppId === backupGame.steamAppId],
    ['rawg-id', (game) => typeof backupGame.rawgId === 'number' && game.rawgId === backupGame.rawgId],
    ['rom-path', (game) => Boolean(getGameRomKey(backupGame)) && getGameRomKey(game) === getGameRomKey(backupGame)],
    ['title-platform', (game) => getGameTitlePlatformKey(game) === getGameTitlePlatformKey(backupGame)],
  ];
  for (const [signal, matches] of tiers) {
    const candidates = sameCollection.filter(matches);
    if (candidates.length === 1) return { status: 'matched', game: candidates[0], signal };
    if (candidates.length > 1) return { status: 'ambiguous', candidates, signal };
  }
  return { status: 'none' };
}

function mergeIgnoredSteamGames(local: IgnoredSteamGame[], backup: IgnoredSteamGame[]): IgnoredSteamGame[] {
  const byAppId = new Map(normalizeIgnoredSteamGames(local).map((record) => [record.steamAppId, record]));
  for (const record of normalizeIgnoredSteamGames(backup)) {
    const current = byAppId.get(record.steamAppId);
    if (!current) byAppId.set(record.steamAppId, record);
    else if (!current.title && record.title) byAppId.set(record.steamAppId, { ...current, title: record.title });
  }
  return [...byAppId.values()];
}

function mergePlayActivity(local: PlayActivityRecord[], backup: PlayActivityRecord[], remap: (id: string) => string): PlayActivityRecord[] {
  const incoming = normalizePlayActivityRecords(backup).map((record) => ({ ...record, gameId: remap(record.gameId) }));
  return normalizePlayActivityRecords([...normalizePlayActivityRecords(local), ...incoming]);
}

function mergePlatformQueues(localValue: PlatformQueueState, backupValue: PlatformQueueState, remap: (id: string) => string): PlatformQueueState {
  const local = normalizePlatformQueueState(localValue);
  const backup = normalizePlatformQueueState(backupValue);
  const entries = [...local.entries];
  const entryKeys = new Set(entries.map(platformEntryKey));
  const perPlatformCount = new Map<string, number>();
  entries.forEach((entry) => perPlatformCount.set(entry.targetPlatform, Math.max(perPlatformCount.get(entry.targetPlatform) ?? 0, entry.queuePosition)));
  for (const incoming of backup.entries) {
    const remapped = { ...incoming, gameId: remap(incoming.gameId) };
    const key = platformEntryKey(remapped);
    if (entryKeys.has(key)) continue;
    const queuePosition = (perPlatformCount.get(remapped.targetPlatform) ?? 0) + 1;
    perPlatformCount.set(remapped.targetPlatform, queuePosition);
    entries.push({ ...remapped, queuePosition });
    entryKeys.add(key);
  }
  const localSettings = new Set(local.settings.map((setting) => setting.platform));
  return normalizePlatformQueueState({
    activePlatforms: [...new Set([...local.activePlatforms, ...backup.activePlatforms])],
    entries,
    schemaVersion: local.schemaVersion,
    settings: [...local.settings, ...backup.settings.filter((setting) => !localSettings.has(setting.platform))],
  });
}

function mergeReviewMode(localValue: ReviewModeState, backupValue: ReviewModeState, remap: (id: string) => string): ReviewModeState {
  const local = normalizeReviewModeState(localValue);
  const backup = normalizeReviewModeState(backupValue);
  const ignoredGameIds = [...new Set([...local.ignoredGameIds, ...backup.ignoredGameIds.map(remap)])];
  const queueOrder = [...new Set([...local.queueOrder, ...backup.queueOrder.map(remap)])];
  const reviewedGames = { ...local.reviewedGames };
  for (const [gameId, record] of Object.entries(backup.reviewedGames)) {
    const canonicalId = remap(gameId);
    const existing = reviewedGames[canonicalId];
    if (!existing || record.reviewedAt > existing.reviewedAt) reviewedGames[canonicalId] = record;
  }
  return normalizeReviewModeState({
    ...local,
    ignoredGameIds,
    queueOrder,
    reviewedGames,
    stats: Object.fromEntries(Object.keys(local.stats).map((key) => [key, Math.max(local.stats[key as keyof typeof local.stats], backup.stats[key as keyof typeof backup.stats])])),
  });
}

function platformEntryKey(entry: Pick<PlatformQueueEntry, 'gameId' | 'targetPlatform'>) {
  return `${entry.targetPlatform.trim().toLowerCase()}:${entry.gameId}`;
}

function sectionPreview(policy: BackupMergePolicy, localCount: number, backupCount: number, mergedCount: number): SectionMergePreview {
  const added = Math.max(0, mergedCount - localCount);
  return { added, conflicting: Math.max(0, backupCount - added), key: policy.key, label: policy.label, localOnlyPreserved: Math.max(0, localCount - Math.max(0, backupCount - added)), policy: policy.policy, updated: Math.max(0, backupCount - added), willReplace: false };
}

function reviewReferenceCount(state: ReviewModeState) {
  return new Set([...state.ignoredGameIds, ...state.queueOrder, ...Object.keys(state.reviewedGames)]).size;
}

function isBackupGameNewer(backupGame: Game, localGame: Game) {
  const backupUpdatedAt = getGameUpdatedAt(backupGame);
  const localUpdatedAt = getGameUpdatedAt(localGame);
  if (!backupUpdatedAt || !localUpdatedAt) return Boolean(backupUpdatedAt && !localUpdatedAt);
  return backupUpdatedAt >= localUpdatedAt;
}

function getGameUpdatedAt(game: Game) {
  return game.updatedAt ?? game.metadataUpdatedAt ?? game.wishlistSyncedAt ?? game.importedAt ?? game.wishlistImportedAt ?? null;
}
