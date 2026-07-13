import { getGameDatabase } from './gameDatabase';
import { analyzePersistedGameRows, normalizeLoadedGames } from './gameStorage';
import { normalizePlatformQueueState } from './platformQueueStorage';
import { normalizeReviewModeState } from './reviewModeStorage';
import { normalizePlayActivityRecords } from './playActivityStorage';
import { getStorageAdapter } from './storageAdapter';

export type DataIntegrityReport = {
  generatedAt: string;
  gameRows: { raw: number; safe: number; quarantined: number; issueCounts: Record<string, number> };
  malformedPlanEntries: number;
  malformedPlayActivityRows: number;
  orphans: { platformPlans: number; reviewState: number; playActivity: number };
  totalProblems: number;
};

export type DataIntegrityQuarantine = {
  format: 'questshelf-corruption-quarantine';
  version: 1;
  exportedAt: string;
  report: DataIntegrityReport;
  rawProblemRows: { games: unknown[]; platformPlans: unknown[]; reviewState: unknown[]; playActivity: unknown[] };
};

export async function inspectDataIntegrity(): Promise<{ report: DataIntegrityReport; quarantine: DataIntegrityQuarantine }> {
  const db = getGameDatabase();
  const rawGames: unknown[] = db ? await db.games.toArray() : readLocalArray('questshelf.games.v1');
  const rawActivity: unknown[] = db ? await db.playActivity.toArray() : readLocalArray('questshelf.playActivity.v1');
  const rawPlans = readLocalJson('questshelf.platformQueues.v1');
  const rawReview = readLocalJson('questshelf.reviewMode.v1');
  const gameAnalysis = analyzePersistedGameRows(rawGames);
  const games = normalizeLoadedGames(rawGames);
  const gameIds = new Set(games.map((game) => game.id));
  const plans = normalizePlatformQueueState(rawPlans);
  const review = normalizeReviewModeState(rawReview);
  const activity = normalizePlayActivityRecords(rawActivity);
  const malformedPlanRows = getMalformedPlanRows(rawPlans);
  const invalidActivityRows = rawActivity.filter((row) => normalizePlayActivityRecords([row]).length === 0);
  const issueCounts: Record<string, number> = {};
  for (const issue of gameAnalysis.issues) issueCounts[issue.reason] = (issueCounts[issue.reason] ?? 0) + 1;
  const reviewIds = new Set([...review.ignoredGameIds, ...review.queueOrder, ...Object.keys(review.reviewedGames)]);
  const orphans = {
    platformPlans: plans.entries.filter((entry) => !gameIds.has(entry.gameId)).length,
    reviewState: [...reviewIds].filter((id) => !gameIds.has(id)).length,
    playActivity: activity.filter((record) => !gameIds.has(record.gameId)).length,
  };
  const orphanActivityRows = rawActivity.filter((row) => row && typeof row === 'object' && typeof (row as { gameId?: unknown }).gameId === 'string' && !gameIds.has((row as { gameId: string }).gameId));
  const generatedAt = new Date().toISOString();
  const totalProblems = gameAnalysis.issues.length + malformedPlanRows.length + invalidActivityRows.length + orphans.platformPlans + orphans.reviewState + orphans.playActivity;
  const report: DataIntegrityReport = {
    generatedAt,
    gameRows: { raw: rawGames.length, safe: games.length, quarantined: gameAnalysis.problematicRows.length, issueCounts },
    malformedPlanEntries: malformedPlanRows.length,
    malformedPlayActivityRows: invalidActivityRows.length,
    orphans,
    totalProblems,
  };
  return { report, quarantine: { format: 'questshelf-corruption-quarantine', version: 1, exportedAt: generatedAt, report, rawProblemRows: { games: gameAnalysis.problematicRows, platformPlans: orphans.platformPlans > 0 ? [rawPlans] : malformedPlanRows, reviewState: orphans.reviewState > 0 ? [rawReview] : [], playActivity: Array.from(new Set([...invalidActivityRows, ...orphanActivityRows])) } } };
}

function readLocalJson(key: string): unknown { const raw = getStorageAdapter().readLocal(key); if (!raw) return undefined; try { return JSON.parse(raw); } catch { return undefined; } }
function readLocalArray(key: string): unknown[] { const value = readLocalJson(key); return Array.isArray(value) ? value : []; }
function getMalformedPlanRows(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return value === undefined ? [] : [value];
  const raw = value as { entries?: unknown; plans?: unknown };
  if (Array.isArray(raw.entries)) return raw.entries.filter((entry) => !entry || typeof entry !== 'object' || typeof (entry as { gameId?: unknown }).gameId !== 'string' || typeof (entry as { targetPlatform?: unknown }).targetPlatform !== 'string');
  if (Array.isArray(raw.plans)) return raw.plans.flatMap((plan) => {
    if (!plan || typeof plan !== 'object') return [plan];
    const candidate = plan as { platform?: unknown; gameIds?: unknown; items?: unknown };
    if (typeof candidate.platform !== 'string' || !Array.isArray(candidate.gameIds)) return [plan];
    const invalidGameIds = candidate.gameIds.filter((gameId) => typeof gameId !== 'string' || !gameId.trim());
    const invalidItems = Array.isArray(candidate.items) ? candidate.items.filter((item) => !item || typeof item !== 'object' || typeof (item as { gameId?: unknown }).gameId !== 'string') : candidate.items === undefined ? [] : [candidate.items];
    return [...invalidGameIds, ...invalidItems];
  });
  return [];
}
