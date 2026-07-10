import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryExclusionReason } from '../lib/discovery';
import type { UserProfile } from '../lib/userProfile';
import type { RawgSearchResult } from '../types/rawg';
import { buildUserProfile, getRecommendationSignalWeight, profileFingerprint } from '../lib/userProfile';
import { mapRawgResult } from './discoveryService';
import { fetchRecommendedGames, fetchSuggestedGames } from './rawgApi';
import { readAppCacheValue, writeAppCacheValue } from '../lib/indexedDbAppCache';

// ---------------------------------------------------------------------------
// Recommendation waterfall
// ---------------------------------------------------------------------------

const TARGET_PERSONAL_RECOMMENDATIONS = 12;
const PERSONALIZED_FLOOR_BEFORE_TRENDING = 10;
const TRENDING_FALLBACK_LIMIT_WITH_PERSONALIZED = 2;
const DEBUG_RECOMMENDATIONS = import.meta.env.DEV && import.meta.env.VITE_DEBUG_RECOMMENDATIONS === 'true';

type CandidateSource =
  | 'liked-game-similar'
  | 'affinity-strict'
  | 'plans-wishlist'
  | 'recently-interacted'
  | 'affinity-relaxed'
  | 'second-order'
  | 'trending-fallback';

type ScoredCandidate = {
  result: RawgSearchResult;
  score: RecommendationScore;
  reason: string;
  source: CandidateSource;
  anchorTitle?: string;
};

type DebugEvent = Record<string, unknown> & { event: string };

function debugRecommendationPipeline(events: DebugEvent[]): void {
  if (!DEBUG_RECOMMENDATIONS || events.length === 0) return;
  console.groupCollapsed(`[QuestShelf recommendations] ${events.length} pipeline events`);
  for (const event of events) console.debug(event);
  console.groupEnd();
}

// ---------------------------------------------------------------------------
// Recommendation scoring
// ---------------------------------------------------------------------------

export interface RecommendationScore {
  genreMatch: number;      // 0–50: weighted overlap with user's liked genres
  tagMatch: number;        // 0–30: weighted overlap with user's liked RAWG tags
  developerMatch: number;  // 0–15: weighted overlap with liked developers when present
  platformMatch: number;   // 0–10: platform-plan/library platform affinity
  negativeMatch: number;   // penalty from low-rated/dropped signals
  metacriticMatch: number; // 0–10: closeness to user's avg MC
  ownershipPenalty: number; // 0 or negative: already owned/wishlisted
  total: number;
}

export function scorePersonalRecommendationCandidate(
  result: RawgSearchResult,
  profile: UserProfile,
  relaxation = 0,
): RecommendationScore {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);
  const candidateTags = (result.tags ?? []).map((t) => t.slug ?? t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
  const candidateDevelopers = (result as RawgSearchResult & { developers?: Array<{ name: string }> }).developers?.map((d) => d.name) ?? [];
  const candidatePlatforms = (result.platforms ?? []).map((p) => p.platform.name);

  const consideredGenres = profile.topGenres.slice(0, Math.min(profile.topGenres.length, 3 + relaxation));
  const consideredTags = profile.topTags.slice(0, Math.min(profile.topTags.length, 5 + relaxation * 3));
  const consideredPlatforms = profile.topPlatforms.slice(0, Math.min(profile.topPlatforms.length, 3 + relaxation));

  const totalGenreWeight = consideredGenres.reduce((s, g) => s + g.weight, 0) || 1;
  const genreMatch = Math.round(Math.min(50, consideredGenres.reduce((sum, pg) => (
    candidateGenres.includes(pg.name) ? sum + (pg.weight / totalGenreWeight) * 50 : sum
  ), 0)));

  const tagMatch = Math.min(30, consideredTags.filter((tag) => candidateTags.includes(tag)).length * (relaxation >= 2 ? 5 : 6));
  const developerMatch = Math.min(15, profile.topDevelopers.filter((dev) => candidateDevelopers.includes(dev)).length * 8);
  const platformMatch = Math.min(10, consideredPlatforms.filter((platform) => candidatePlatforms.includes(platform) || candidatePlatforms.includes(platform === 'Steam' ? 'PC' : platform)).length * (relaxation >= 2 ? 4 : 5));

  const negativeGenre = profile.negativeGenres.filter((ng) => candidateGenres.includes(ng.name)).reduce((sum, ng) => sum + ng.weight * 5, 0);
  const negativeTag = profile.negativeTags.filter((nt) => candidateTags.includes(nt.name)).reduce((sum, nt) => sum + nt.weight * 3, 0);
  const negativeDeveloper = profile.negativeDevelopers.filter((nd) => candidateDevelopers.includes(nd.name)).reduce((sum, nd) => sum + nd.weight * 4, 0);
  const negativePlatform = profile.negativePlatforms.filter((np) => candidatePlatforms.includes(np.name)).reduce((sum, np) => sum + np.weight * 2, 0);
  const negativeMatch = -Math.round(Math.min(45, negativeGenre + negativeTag + negativeDeveloper + negativePlatform));

  let metacriticMatch = 0;
  if (result.metacritic && profile.avgMetacritic) {
    const diff = Math.abs(result.metacritic - profile.avgMetacritic);
    metacriticMatch = Math.round(Math.max(0, 10 - diff / (5 + relaxation * 2)));
  }

  const total = genreMatch + tagMatch + developerMatch + platformMatch + negativeMatch + metacriticMatch;
  return { genreMatch, tagMatch, developerMatch, platformMatch, negativeMatch, metacriticMatch, ownershipPenalty: 0, total };
}

function generateReason(result: RawgSearchResult, score: RecommendationScore, profile: UserProfile, source: CandidateSource, anchorTitle?: string): string {
  if (source === 'trending-fallback') return 'Trending fallback';
  if (anchorTitle && source === 'liked-game-similar') return `Because you liked ${anchorTitle}`;
  if (anchorTitle && source === 'plans-wishlist') return `Related to your interest in ${anchorTitle}`;
  if (anchorTitle && source === 'recently-interacted') return `Similar to ${anchorTitle}`;
  if (anchorTitle && source === 'second-order') return `More like ${anchorTitle}`;

  const candidateGenres = (result.genres ?? []).map((g) => g.name);
  const matched = profile.topGenres.slice(0, 3).map((pg) => pg.name).filter((name) => candidateGenres.includes(name));
  if (matched.length >= 2) return `Matches your taste for ${matched[0]} & ${matched[1]}`;
  if (matched.length === 1) return `Based on your ${matched[0]} preference`;
  if (score.tagMatch > 0 && profile.topTags.length > 0) return `Similar to tags from games you liked`;
  if (score.metacriticMatch >= 8 && result.metacritic) return `Critically acclaimed in your preferred range`;
  return `Based on your gaming history`;
}

function getPositiveSignalGames(userGames: Game[]): Game[] {
  return userGames
    .map((game) => ({ game, signal: getRecommendationSignalWeight(game) }))
    .filter(({ game, signal }) => signal.weight >= 3 && game.rawgId)
    .sort((a, b) => b.signal.weight - a.signal.weight || (b.game.playtimeHours ?? 0) - (a.game.playtimeHours ?? 0))
    .map(({ game }) => game);
}

function getPlanAndWishlistGames(userGames: Game[]): Game[] {
  return userGames.filter((game) => game.rawgId && (game.collectionType === 'wishlist' || game.status === 'Want to play')).slice(0, 5);
}

function getRecentlyInteractedGames(userGames: Game[]): Game[] {
  return userGames
    .filter((game) => game.rawgId && game.lastPlayedAt)
    .sort((a, b) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)))
    .slice(0, 4);
}

function hasLibraryMatch(result: RawgSearchResult, userGames: Game[]): { rejected: boolean; reason?: DiscoveryExclusionReason } {
  const match = userGames.find((game) => game.rawgId === result.id);
  if (!match) return { rejected: false };
  return { rejected: true, reason: match.status === 'Dropped' ? 'dropped' : match.status === 'Finished' ? 'finished' : match.collectionType === 'wishlist' ? 'wishlist' : 'owned' };
}

async function collectFromResults(
  results: RawgSearchResult[],
  source: CandidateSource,
  profile: UserProfile,
  userGames: Game[],
  seen: Set<number>,
  events: DebugEvent[],
  options: { minScore: number; relaxation?: number; anchorTitle?: string },
): Promise<ScoredCandidate[]> {
  const output: ScoredCandidate[] = [];
  for (const result of results) {
    const score = scorePersonalRecommendationCandidate(result, profile, options.relaxation ?? 0);
    const libraryMatch = hasLibraryMatch(result, userGames);
    if (seen.has(result.id)) {
      events.push({ event: 'candidate_rejected', source, rawgId: result.id, title: result.name, score: score.total, reason: 'duplicate' });
      continue;
    }
    if (libraryMatch.rejected) {
      events.push({ event: 'candidate_rejected', source, rawgId: result.id, title: result.name, score: score.total, reason: libraryMatch.reason });
      continue;
    }
    if (score.total < options.minScore && source !== 'trending-fallback') {
      events.push({ event: 'candidate_rejected', source, rawgId: result.id, title: result.name, score: score.total, reason: `below-threshold:${options.minScore}` });
      continue;
    }
    seen.add(result.id);
    output.push({ result, score, source, anchorTitle: options.anchorTitle, reason: generateReason(result, score, profile, source, options.anchorTitle) });
    events.push({ event: 'candidate_accepted', source, rawgId: result.id, title: result.name, score: score.total, reason: output.at(-1)?.reason });
  }
  return output;
}

function applyDiversityFilter(scored: ScoredCandidate[], max: number, events: DebugEvent[], hasPersonalizedCandidates = true): ScoredCandidate[] {
  const genreCounts = new Map<string, number>();
  const sourceCounts = new Map<CandidateSource, number>();
  const output: ScoredCandidate[] = [];

  for (const item of scored) {
    const primaryGenre = item.result.genres?.[0]?.name ?? 'unknown';
    const genreCount = genreCounts.get(primaryGenre) ?? 0;
    const sourceCount = sourceCounts.get(item.source) ?? 0;
    const sourceLimit = item.source === 'trending-fallback' ? (hasPersonalizedCandidates ? TRENDING_FALLBACK_LIMIT_WITH_PERSONALIZED : max) : 5;
    if (genreCount >= 3) {
      events.push({ event: 'candidate_rejected', source: item.source, rawgId: item.result.id, title: item.result.name, score: item.score.total, reason: `genre-diversity:${primaryGenre}` });
      continue;
    }
    if (sourceCount >= sourceLimit) {
      events.push({ event: 'candidate_rejected', source: item.source, rawgId: item.result.id, title: item.result.name, score: item.score.total, reason: `source-diversity:${item.source}` });
      continue;
    }
    output.push(item);
    genreCounts.set(primaryGenre, genreCount + 1);
    sourceCounts.set(item.source, sourceCount + 1);
    if (output.length >= max) break;
  }
  return output;
}

interface CacheEntry { candidates: DiscoveryCandidate[]; fingerprint: string; fetchedAt: number; }
let cache: CacheEntry | null = null;
const CACHE_STORAGE_KEY = 'questshelf.personalRecommendations.v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function readStoredCache(): Promise<CacheEntry | null> {
  const parsed = await readAppCacheValue<Partial<CacheEntry>>(CACHE_STORAGE_KEY);
  if (!parsed || !Array.isArray(parsed.candidates) || typeof parsed.fingerprint !== 'string' || typeof parsed.fetchedAt !== 'number') return null;
  return { candidates: parsed.candidates as DiscoveryCandidate[], fingerprint: parsed.fingerprint, fetchedAt: parsed.fetchedAt };
}
function writeStoredCache(entry: CacheEntry): void { cache = entry; void writeAppCacheValue(CACHE_STORAGE_KEY, entry); }
async function getFreshCacheEntry(fingerprint: string): Promise<CacheEntry | null> {
  const entry = cache?.fingerprint === fingerprint ? cache : await readStoredCache();
  if (!entry || entry.fingerprint !== fingerprint || Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return null;
  cache = entry;
  return entry;
}

export async function fetchPersonalRecommendations(userGames: Game[], inboxRawgIds: Set<number> = new Set()): Promise<DiscoveryCandidate[]> {
  const profile = buildUserProfile(userGames);
  const fp = profileFingerprint(userGames);
  const events: DebugEvent[] = [];

  const freshCache = await getFreshCacheEntry(fp);
  if (freshCache) {
    events.push({ event: 'cache_hit', candidates: freshCache.candidates.length });
    debugRecommendationPipeline(events);
    return applyLibraryStatus(freshCache.candidates.map((c) => c.game), userGames, freshCache.candidates.map((c) => c.reason), inboxRawgIds, freshCache.candidates.map((c) => c.score));
  }

  if (profile.topGenres.length === 0) return [];

  const seen = new Set<number>();
  const collected: ScoredCandidate[] = [];
  const addStage = async (name: CandidateSource, producer: () => Promise<Array<{ results: RawgSearchResult[]; anchorTitle?: string }>>, minScore: number, relaxation = 0) => {
    if (collected.length >= PERSONALIZED_FLOOR_BEFORE_TRENDING) return;
    const before = collected.length;
    for (const batch of await producer()) collected.push(...await collectFromResults(batch.results, name, profile, userGames, seen, events, { minScore, relaxation, anchorTitle: batch.anchorTitle }));
    events.push({ event: 'stage_complete', source: name, produced: collected.length - before, totalPersonalized: collected.length, minScore, relaxation });
  };

  await addStage('liked-game-similar', async () => Promise.all(getPositiveSignalGames(userGames).slice(0, 5).map(async (game) => ({ anchorTitle: game.title, results: await fetchSuggestedGames(game.rawgId!) }))), 22);

  await addStage('affinity-strict', async () => [{ results: await fetchRecommendedGames({ genres: profile.topGenres.slice(0, 3).map((g) => g.slug).join(','), tags: profile.topTags.slice(0, 5).join(',') || undefined, metacriticMin: profile.avgMetacritic != null && profile.avgMetacritic >= 70 ? Math.max(55, profile.avgMetacritic - 18) : undefined, pageSize: 40 }) }], 24);

  await addStage('plans-wishlist', async () => Promise.all(getPlanAndWishlistGames(userGames).map(async (game) => ({ anchorTitle: game.title, results: await fetchSuggestedGames(game.rawgId!) }))), 18, 1);

  await addStage('recently-interacted', async () => Promise.all(getRecentlyInteractedGames(userGames).map(async (game) => ({ anchorTitle: game.title, results: await fetchSuggestedGames(game.rawgId!) }))), 16, 1);

  await addStage('affinity-relaxed', async () => [
    { results: await fetchRecommendedGames({ genres: profile.topGenres.slice(0, 5).map((g) => g.slug).join(','), pageSize: 40 }) },
    { results: profile.topTags.length > 0 ? await fetchRecommendedGames({ tags: profile.topTags.slice(0, 8).join(','), pageSize: 40 }) : [] },
    { results: await fetchRecommendedGames({ genres: profile.topGenres.slice(0, 5).map((g) => g.slug).join(','), ordering: '-added', pageSize: 40 }) },
  ], 12, 2);

  await addStage('second-order', async () => Promise.all(collected.slice(0, 3).map(async (item) => ({ anchorTitle: item.result.name, results: await fetchSuggestedGames(item.result.id) }))), 10, 3);

  let ranked = collected.sort((a, b) => b.score.total - a.score.total);
  const personalizedCountBeforeTrending = ranked.length;
  if (ranked.length < PERSONALIZED_FLOOR_BEFORE_TRENDING) {
    events.push({ event: 'fallback_considered', fallback: 'trending', personalizedCandidates: ranked.length, reason: `below-floor:${PERSONALIZED_FLOOR_BEFORE_TRENDING}` });
    const trending = await collectFromResults(await fetchRecommendedGames({ ordering: '-added', pageSize: 24 }), 'trending-fallback', profile, userGames, seen, events, { minScore: 0, relaxation: 3 });
    const allowedTrending = ranked.length > 0 ? Math.min(TRENDING_FALLBACK_LIMIT_WITH_PERSONALIZED, TARGET_PERSONAL_RECOMMENDATIONS - ranked.length) : TARGET_PERSONAL_RECOMMENDATIONS;
    ranked = [...ranked, ...trending.slice(0, Math.max(0, allowedTrending))];
    events.push({ event: 'fallback_selected', fallback: 'trending', added: Math.max(0, ranked.length - personalizedCountBeforeTrending), personalizedCandidates: personalizedCountBeforeTrending });
  }

  const diverse = applyDiversityFilter(ranked, TARGET_PERSONAL_RECOMMENDATIONS, events, personalizedCountBeforeTrending > 0);
  const candidates = applyLibraryStatus(diverse.map(({ result }) => mapRawgResult(result)), userGames, diverse.map(({ reason }) => reason), inboxRawgIds, diverse.map(({ score }) => score.total));
  const pool = candidates.filter((c) => !c.excluded);
  events.push({ event: 'pipeline_complete', candidates: pool.length, personalized: diverse.filter((c) => c.source !== 'trending-fallback').length, trending: diverse.filter((c) => c.source === 'trending-fallback').length });
  debugRecommendationPipeline(events);

  writeStoredCache({ candidates: pool, fingerprint: fp, fetchedAt: Date.now() });
  return pool;
}

function applyLibraryStatus(
  games: DiscoveryCandidate['game'][],
  userGames: Game[],
  reasons?: (string | undefined)[],
  inboxRawgIds: Set<number> = new Set(),
  scores?: number[],
): DiscoveryCandidate[] {
  return games.map((game, i) => {
    const match = userGames.find((g) => g.rawgId === game.rawgId);
    const libraryStatus = match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';
    const inboxStatus = inboxRawgIds.has(game.rawgId);
    let excluded = false;
    let exclusionReason: DiscoveryExclusionReason | null = null;
    if (match) {
      excluded = true;
      exclusionReason = match.status === 'Dropped' ? 'dropped' : match.status === 'Finished' ? 'finished' : match.collectionType === 'wishlist' ? 'wishlist' : 'owned';
    }
    return { game, libraryStatus, inboxStatus, excluded, exclusionReason, score: scores?.[i] ?? (libraryStatus === null ? 0 : -30), reason: reasons?.[i] };
  });
}
