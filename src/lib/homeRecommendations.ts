import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from './discovery';
import type { RawgSearchResult } from '../types/rawg';

export type HomeRecommendationSource =
  | 'similar_game'
  | 'tag_affinity'
  | 'genre_affinity'
  | 'plan_affinity'
  | 'wishlist_affinity'
  | 'taste_filtered_fallback';

export type HomeRecommendationDiagnostics = {
  hydrationReady: boolean;
  libraryCount: number;
  finishedCount: number;
  ratedCount: number;
  playingCount: number;
  plannedCount: number;
  wishlistCount: number;
  seedCount: number;
  candidateCountsBySource: Record<string, number>;
  excludedCountsByReason: Record<string, number>;
  finalCount: number;
  finalSourceMix: Record<string, number>;
  cacheStatus: 'disabled' | 'hit' | 'miss' | 'stale' | 'write' | 'preserved';
  lastError: string | null;
};

export type HomeRecommendationsResult = {
  candidates: DiscoveryCandidate[];
  diagnostics: HomeRecommendationDiagnostics;
};

type Fetchers = {
  similar?: (rawgId: number) => Promise<RawgSearchResult[]>;
  discover?: (params: { genres?: string; tags?: string; ordering?: string; pageSize?: number }) => Promise<RawgSearchResult[]>;
};

type Options = {
  hydrationReady?: boolean;
  inboxRawgIds?: Set<number>;
  fetchers?: Fetchers;
  now?: number;
  useCache?: boolean;
  forceRefresh?: boolean;
  previous?: DiscoveryCandidate[];
};

type Profile = ReturnType<typeof buildHomeTasteProfile>;
type Candidate = { game: DiscoveryGame; source: HomeRecommendationSource; seedTitle?: string; fallback?: boolean };

const CACHE_KEY = 'questshelf.homeRecommendations.v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const HIGH_VALUE = new Set(['roguelite','roguelike','deckbuilder','deckbuilding','metroidvania','souls-like','soulslike','tactical rpg','immersive sim','colony sim','factory automation','automation','city builder','bullet heaven','party-based rpg','jrpg','strategy','tactics']);
const LOW_VALUE = new Set(['2d','3d','singleplayer','multiplayer','indie','controller','pixel graphics','fantasy']);

export function buildHomeTasteProfile(games: Game[]) {
  const tags = new Map<string, number>();
  const genres = new Map<string, number>();
  const platforms = new Map<string, number>();
  const developers = new Map<string, number>();
  const seeds: Game[] = [];
  let libraryCount = 0, finishedCount = 0, ratedCount = 0, playingCount = 0, plannedCount = 0, wishlistCount = 0;
  for (const game of games) {
    if (game.collectionType === 'library') libraryCount++;
    if (game.collectionType === 'wishlist') wishlistCount++;
    if (game.status === 'Finished') finishedCount++;
    if (game.status === 'Playing') playingCount++;
    if (game.rating) ratedCount++;
    if (game.status === 'Want to play') plannedCount++;
    const weight = signalWeight(game);
    if (weight <= 0) continue;
    add(platforms, game.platform, Math.max(0.6, weight * 0.55));
    for (const genre of game.genres ?? []) add(genres, norm(genre), weight * 1.1);
    for (const tag of [...(game.rawgTags ?? []), ...(game.tags ?? [])]) add(tags, norm(tag), weight * tagWeight(tag));
    for (const developer of game.developers ?? []) add(developers, norm(developer), weight * 0.8);
    if (weight >= 5 && game.rawgId) seeds.push(game);
  }
  seeds.sort((a, b) => signalWeight(b) - signalWeight(a));
  return { tags, genres, platforms, developers, seeds: seeds.slice(0, 8), stats: { libraryCount, finishedCount, ratedCount, playingCount, plannedCount, wishlistCount } };
}

export async function buildHomeRecommendations(games: Game[], options: Options = {}): Promise<HomeRecommendationsResult> {
  const hydrationReady = options.hydrationReady ?? games.length > 0;
  const profile = buildHomeTasteProfile(games);
  const diagnostics = baseDiagnostics(hydrationReady, profile);
  if (!hydrationReady) return { candidates: options.previous ?? [], diagnostics: { ...diagnostics, cacheStatus: 'preserved' } };

  const fingerprint = profileFingerprint(games);
  if (options.useCache !== false && !options.forceRefresh) {
    const cached = readCache(options.now ?? Date.now(), fingerprint);
    if (cached) return { candidates: cached, diagnostics: { ...diagnostics, finalCount: cached.length, cacheStatus: 'hit', finalSourceMix: mix(cached) } };
    diagnostics.cacheStatus = 'miss';
  }

  try {
    const local = localCandidates(games, profile);
    const remote = await remoteCandidates(profile, options.fetchers, diagnostics);
    const ranked = selectHomeRecommendations([...local, ...remote], games, profile, options.inboxRawgIds ?? new Set(), diagnostics);
    if (ranked.length > 0 && options.useCache !== false) writeCache(fingerprint, ranked, options.now ?? Date.now());
    return { candidates: ranked, diagnostics: { ...diagnostics, finalCount: ranked.length, finalSourceMix: mix(ranked), cacheStatus: ranked.length ? 'write' : diagnostics.cacheStatus } };
  } catch (error) {
    return { candidates: options.previous ?? [], diagnostics: { ...diagnostics, finalCount: options.previous?.length ?? 0, finalSourceMix: mix(options.previous ?? []), cacheStatus: 'preserved', lastError: error instanceof Error ? error.message : String(error) } };
  }
}

export function selectHomeRecommendations(candidates: Candidate[], games: Game[], profile: Profile, inboxRawgIds: Set<number>, diagnostics = baseDiagnostics(true, profile)): DiscoveryCandidate[] {
  const byRawg = new Map<number, DiscoveryCandidate>();
  const ownedRawg = new Set(games.filter(g => g.rawgId && g.collectionType === 'library').map(g => g.rawgId as number));
  const blockedTitles = new Set(games.filter(g => g.status === 'Finished' || g.status === 'Dropped').map(g => norm(g.title)));
  for (const c of candidates) {
    const titleKey = norm(c.game.title);
    if (ownedRawg.has(c.game.rawgId)) { inc(diagnostics.excludedCountsByReason, 'owned'); continue; }
    if (blockedTitles.has(titleKey)) { inc(diagnostics.excludedCountsByReason, 'resolved_title'); continue; }
    if (inboxRawgIds.has(c.game.rawgId)) { inc(diagnostics.excludedCountsByReason, 'inbox'); continue; }
    const score = scoreCandidate(c, profile);
    if (c.fallback && score < 10) { inc(diagnostics.excludedCountsByReason, 'weak_fallback'); continue; }
    const reason = reasonFor(c, profile);
    const next: DiscoveryCandidate = { game: c.game, libraryStatus: null, inboxStatus: false, excluded: false, exclusionReason: null, score, reason, source: c.source };
    const prev = byRawg.get(c.game.rawgId);
    if (!prev || next.score > prev.score) byRawg.set(c.game.rawgId, next);
  }
  const sorted = [...byRawg.values()].sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title));
  const personalized = sorted.filter(c => c.source !== 'taste_filtered_fallback').slice(0, 9);
  const fallback = sorted.filter(c => c.source === 'taste_filtered_fallback').slice(0, personalized.length >= 6 ? 1 : 2);
  return [...personalized, ...fallback].sort((a, b) => b.score - a.score).slice(0, 10);
}

function localCandidates(games: Game[], profile: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const game of games) {
    if (game.collectionType !== 'wishlist' && game.status !== 'Want to play') continue;
    if (!game.rawgId) continue;
    out.push({ game: gameToDiscovery(game), source: game.collectionType === 'wishlist' ? 'wishlist_affinity' : 'plan_affinity', seedTitle: game.title });
  }
  for (const seed of profile.seeds) {
    // Local affinity cannot invent new games, but this gives planned/wishlist records truthful seed context.
    void seed;
  }
  return out;
}

async function remoteCandidates(profile: Profile, fetchers: Fetchers | undefined, diagnostics: HomeRecommendationDiagnostics): Promise<Candidate[]> {
  if (!fetchers) return [];
  const jobs: Promise<Candidate[]>[] = [];
  for (const seed of profile.seeds.slice(0, 4)) if (seed.rawgId && fetchers.similar) jobs.push(fetchers.similar(seed.rawgId).then(r => r.map(game => ({ game: rawgToDiscovery(game), source: 'similar_game' as const, seedTitle: seed.title }))));
  const topTags = top(profile.tags, 4).join(',');
  const topGenres = top(profile.genres, 3).join(',');
  if (fetchers.discover && topTags) jobs.push(fetchers.discover({ tags: topTags, pageSize: 24 }).then(r => r.map(game => ({ game: rawgToDiscovery(game), source: 'tag_affinity' as const }))));
  if (fetchers.discover && topGenres) jobs.push(fetchers.discover({ genres: topGenres, pageSize: 24 }).then(r => r.map(game => ({ game: rawgToDiscovery(game), source: 'genre_affinity' as const }))));
  if (fetchers.discover && (topTags || topGenres)) jobs.push(fetchers.discover({ tags: topTags, genres: topGenres, ordering: '-added', pageSize: 12 }).then(r => r.map(game => ({ game: rawgToDiscovery(game), source: 'taste_filtered_fallback' as const, fallback: true }))));
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((s) => s.status === 'fulfilled' ? s.value.map(c => (inc(diagnostics.candidateCountsBySource, c.source), c)) : (inc(diagnostics.candidateCountsBySource, 'failed_source'), []));
}

function scoreCandidate(c: Candidate, profile: Profile) { let score = c.source === 'similar_game' ? 22 : c.source === 'taste_filtered_fallback' ? -8 : 10; for (const tag of c.game.tags) score += (profile.tags.get(norm(tag)) ?? 0) * tagWeight(tag); for (const genre of c.game.genres) score += (profile.genres.get(norm(genre)) ?? 0) * 1.2; for (const p of c.game.platforms) score += (profile.platforms.get(p) ?? 0) * 0.5; if (c.game.metacritic) score += Math.max(0, c.game.metacritic - 70) / 4; if (c.game.rawgRating) score += c.game.rawgRating; return Math.round(score * 10) / 10; }
function reasonFor(c: Candidate, profile: Profile) { if (c.seedTitle && c.source === 'similar_game') return `Similar to ${c.seedTitle}`; if (c.source === 'plan_affinity') return 'Fits your Platform Plans'; if (c.source === 'wishlist_affinity') return 'Matches your Wishlist interests'; const tag = top(profile.tags, 1)[0]; if (tag && c.game.tags.map(norm).includes(tag)) return `Matches your ${tag} interests`; const genre = top(profile.genres, 1)[0]; if (genre && c.game.genres.map(norm).includes(genre)) return `Based on your ${genre} library`; return 'Recommended for you'; }
function signalWeight(g: Game) { let w = g.collectionType === 'library' ? 1 : 2.5; if (g.rating && g.rating >= 4) w += 7; else if (g.rating && g.rating >= 3) w += 3; if (g.favorite) w += 7; if (g.playtimeHours >= 40) w += 6; else if (g.playtimeHours >= 10) w += 3; if (g.status === 'Finished') w += 5; if (g.status === 'Playing') w += 4; if (g.status === 'Dropped') w -= 12; return Math.max(0, w); }
function tagWeight(tag: string) { const n = norm(tag); if (HIGH_VALUE.has(n)) return 2.8; if (LOW_VALUE.has(n)) return 0.25; return 1; }
function rawgToDiscovery(r: RawgSearchResult): DiscoveryGame { const platforms = r.platforms?.map(p => p.platform.name).filter(Boolean) ?? []; return { rawgId: r.id, title: r.name, coverUrl: r.background_image, metacritic: r.metacritic, rawgRating: r.rating ?? undefined, rawgRatingsCount: r.ratings_count ?? undefined, platforms, hasSteamVersion: platforms.some(p => /pc|steam/i.test(p)), genres: r.genres?.map(g => g.name) ?? [], tags: r.tags?.map(t => t.name || t.slug || '').filter(Boolean) ?? [], released: r.released, slug: r.slug ?? null }; }
function gameToDiscovery(g: Game): DiscoveryGame { return { rawgId: g.rawgId!, title: g.title, coverUrl: g.coverImage || g.backgroundImage || null, metacritic: g.metacritic ?? g.metacriticScore ?? null, rawgRating: g.rawgRating, rawgRatingsCount: g.rawgRatingsCount, platforms: [g.platform], hasSteamVersion: /steam|pc/i.test(g.platform), genres: g.genres ?? [], tags: [...(g.rawgTags ?? []), ...(g.tags ?? [])], released: g.released ?? null, slug: g.rawgSlug ?? null }; }
function add(m: Map<string, number>, key: string | undefined, v: number) { if (!key) return; m.set(norm(key), (m.get(norm(key)) ?? 0) + v); }
function norm(s: string) { return s.trim().toLowerCase(); }
function top(m: Map<string, number>, n: number) { return [...m.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,n).map(([k])=>k); }
function inc(r: Record<string, number>, k: string) { r[k] = (r[k] ?? 0) + 1; }
function mix(candidates: DiscoveryCandidate[]) { const r: Record<string, number> = {}; candidates.forEach(c => inc(r, c.source ?? 'unknown')); return r; }
function baseDiagnostics(hydrationReady: boolean, profile: Profile): HomeRecommendationDiagnostics { return { hydrationReady, ...profile.stats, seedCount: profile.seeds.length, candidateCountsBySource: {}, excludedCountsByReason: {}, finalCount: 0, finalSourceMix: {}, cacheStatus: 'disabled', lastError: null }; }
function profileFingerprint(games: Game[]) { return games.map(g => [g.id,g.rawgId,g.status,g.rating,g.favorite,g.playtimeHours,g.collectionType,g.updatedAt].join(':')).sort().join('|'); }
function readCache(now: number, fingerprint: string) { try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null; const parsed = JSON.parse(raw); if (parsed.fingerprint !== fingerprint || now - parsed.createdAt > CACHE_TTL) return null; return parsed.candidates as DiscoveryCandidate[]; } catch { return null; } }
function writeCache(fingerprint: string, candidates: DiscoveryCandidate[], now: number) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ fingerprint, candidates, createdAt: now })); } catch { /* ignore */ } }
