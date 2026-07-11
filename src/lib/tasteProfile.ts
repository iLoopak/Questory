import type { Game } from '../types/game';
import { loadLocalJson, savePersistedJson } from './localPersistence';
import { loadRecommendationFeedback } from './recommendationFeedback';
import { isGenericPreferenceTag, profileFingerprint, recommendationFranchiseKey, signalInformationValue, toSlug } from './userProfile';

export const tasteProfileStorageKey = 'questshelf.tasteProfile.v1';
export const TASTE_PROFILE_VERSION = 1;

export type TasteSignalKind = 'genre' | 'tag' | 'developer' | 'franchise' | 'platform' | 'length' | 'release-era';
export type TasteSignalSentiment = 'love' | 'avoid';
export type TasteSignalOrigin = 'observed' | 'explicit' | 'temporary';
export type TasteSignalStrength = 'emerging' | 'moderate' | 'strong';
export type TasteConfidenceTrend = 'new' | 'rising' | 'steady' | 'falling';

export type TasteEvidence = {
  gameIds: string[];
  gameTitles: string[];
  explanation: string;
};

export type TasteSignal = {
  id: string;
  kind: TasteSignalKind;
  key: string;
  label: string;
  sentiment: TasteSignalSentiment;
  origin: TasteSignalOrigin;
  confidence: number;
  strength: TasteSignalStrength;
  confidenceTrend: TasteConfidenceTrend;
  supportingGameCount: number;
  contradictoryGameCount: number;
  evidence: TasteEvidence;
  lastUpdatedAt: string;
  pinned?: boolean;
  hidden?: boolean;
  confirmedAt?: string;
  rejectedAt?: string;
  expiresAt?: string;
};

export type TasteProfile = {
  version: typeof TASTE_PROFILE_VERSION;
  observed: TasteSignal[];
  explicit: TasteSignal[];
  temporary: TasteSignal[];
  lastComputedFingerprint: string;
  lastUpdatedAt: string;
  prompt: {
    firstReadyAt?: string;
    dismissedAt?: string;
    confirmedAt?: string;
    changePromptedAt?: string;
    ignoredChangeAt?: string;
    inferencePausedAt?: string;
  };
};

type SignalAccumulator = {
  kind: TasteSignalKind;
  key: string;
  label: string;
  sentiment: TasteSignalSentiment;
  weight: number;
  support: Map<string, { id: string; title: string }>;
  contradiction: Map<string, { id: string; title: string }>;
  reasons: Set<string>;
};

const fallbackProfile = (): TasteProfile => ({
  version: TASTE_PROFILE_VERSION,
  observed: [],
  explicit: [],
  temporary: [],
  lastComputedFingerprint: '',
  lastUpdatedAt: '',
  prompt: {},
});

const positiveBehaviorWords = ['finished', 'rated highly', 'spent time with', 'favorited', 'kept playing', 'planned'];
const negativeBehaviorWords = ['dropped', 'rated low'];

export function normalizeTasteProfile(value: unknown): TasteProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallbackProfile();
  const parsed = value as Partial<TasteProfile>;
  return {
    version: TASTE_PROFILE_VERSION,
    observed: normalizeSignals(parsed.observed, 'observed'),
    explicit: normalizeSignals(parsed.explicit, 'explicit'),
    temporary: normalizeSignals(parsed.temporary, 'temporary').filter((signal) => !isExpired(signal)),
    lastComputedFingerprint: typeof parsed.lastComputedFingerprint === 'string' ? parsed.lastComputedFingerprint : '',
    lastUpdatedAt: validIso(parsed.lastUpdatedAt) ? parsed.lastUpdatedAt! : '',
    prompt: normalizePrompt(parsed.prompt),
  };
}

export function loadTasteProfile(): TasteProfile {
  return loadLocalJson(tasteProfileStorageKey, fallbackProfile(), normalizeTasteProfile);
}

export function saveTasteProfile(profile: TasteProfile): TasteProfile {
  const normalized = normalizeTasteProfile(profile);
  savePersistedJson(tasteProfileStorageKey, normalized);
  return normalized;
}

export function buildTasteProfile(games: Game[], previous: TasteProfile = loadTasteProfile(), now = new Date()): TasteProfile {
  const observed = inferObservedTasteSignals(games, previous.observed, now);
  const fingerprint = tasteInputFingerprint(games);
  const lastUpdatedAt = now.toISOString();
  const prompt = {
    ...previous.prompt,
    firstReadyAt: previous.prompt.firstReadyAt ?? (observed.filter((signal) => signal.sentiment === 'love' && signal.confidence >= 0.55).length >= 3 ? lastUpdatedAt : undefined),
  };
  if (hasTasteShift(previous.observed, observed) && !previous.prompt.changePromptedAt) {
    prompt.changePromptedAt = lastUpdatedAt;
  }

  return normalizeTasteProfile({
    ...previous,
    version: TASTE_PROFILE_VERSION,
    observed,
    temporary: previous.temporary.filter((signal) => !isExpired(signal, now)),
    lastComputedFingerprint: fingerprint,
    lastUpdatedAt,
    prompt,
  });
}

export function recomputeAndSaveTasteProfile(games: Game[], now = new Date()): TasteProfile {
  const current = loadTasteProfile();
  return saveTasteProfile(buildTasteProfile(games, { ...current, prompt: { ...current.prompt, inferencePausedAt: undefined } }, now));
}

export function getTasteProfileForGames(games: Game[]): TasteProfile {
  const current = loadTasteProfile();
  if (current.prompt.inferencePausedAt) return current;
  const fingerprint = tasteInputFingerprint(games);
  if (current.lastComputedFingerprint === fingerprint && current.observed.length > 0) return current;
  return recomputeAndSaveTasteProfile(games);
}

export function resetObservedTasteProfile(): TasteProfile {
  const current = loadTasteProfile();
  const now = new Date().toISOString();
  return saveTasteProfile({ ...current, observed: [], lastComputedFingerprint: '', lastUpdatedAt: now, prompt: { ...current.prompt, firstReadyAt: undefined, changePromptedAt: undefined, inferencePausedAt: now } });
}

export function resetExplicitTasteProfile(): TasteProfile {
  const current = loadTasteProfile();
  return saveTasteProfile({ ...current, explicit: [], lastUpdatedAt: new Date().toISOString() });
}

export function resetTemporaryTasteProfile(): TasteProfile {
  const current = loadTasteProfile();
  return saveTasteProfile({ ...current, temporary: [], lastUpdatedAt: new Date().toISOString() });
}

export function resetAllTasteProfile(): TasteProfile {
  return saveTasteProfile({ ...fallbackProfile(), lastUpdatedAt: new Date().toISOString() });
}

export function confirmObservedTasteSignal(signalId: string): TasteProfile {
  const current = loadTasteProfile();
  const observed = current.observed.find((signal) => signal.id === signalId);
  if (!observed) return current;
  return upsertTasteSignal({ ...observed, origin: 'explicit', confidence: Math.max(observed.confidence, 0.85), confirmedAt: new Date().toISOString(), rejectedAt: undefined });
}

export function rejectTasteSignal(signalId: string): TasteProfile {
  const current = loadTasteProfile();
  const now = new Date().toISOString();
  const next = updateSignalAcrossLayers(current, signalId, (signal) => ({ ...signal, rejectedAt: now, hidden: true, pinned: false }));
  return saveTasteProfile({ ...next, lastUpdatedAt: now });
}

export function createOppositeTasteSignal(signalId: string): TasteProfile {
  const current = loadTasteProfile();
  const source = [...current.observed, ...current.explicit].find((signal) => signal.id === signalId);
  if (!source) return current;
  const nextSentiment: TasteSignalSentiment = source.sentiment === 'love' ? 'avoid' : 'love';
  const now = new Date().toISOString();
  const explicit = current.explicit.filter((signal) => !(signal.kind === source.kind && signal.key === source.key));
  explicit.push({
    ...source,
    id: signalIdForExplicit(source.kind, source.key, nextSentiment),
    sentiment: nextSentiment,
    origin: 'explicit',
    confidence: 1,
    strength: 'strong',
    confidenceTrend: 'new',
    confirmedAt: now,
    rejectedAt: undefined,
    hidden: false,
    pinned: true,
    evidence: { gameIds: [], gameTitles: [], explanation: nextSentiment === 'avoid' ? `You explicitly marked ${source.label} as less your thing.` : `You explicitly marked ${source.label} as more your thing.` },
    lastUpdatedAt: now,
  });
  const observed = current.observed.map((signal) => signal.id === source.id ? { ...signal, hidden: true, rejectedAt: now, pinned: false } : signal);
  return saveTasteProfile({ ...current, observed, explicit, lastUpdatedAt: now });
}

export function hideTasteSignal(signalId: string): TasteProfile {
  const current = loadTasteProfile();
  const next = updateSignalAcrossLayers(current, signalId, (signal) => ({ ...signal, hidden: true, pinned: false }));
  return saveTasteProfile({ ...next, lastUpdatedAt: new Date().toISOString() });
}

export function removeTasteSignal(signalId: string): TasteProfile {
  const current = loadTasteProfile();
  return saveTasteProfile({
    ...current,
    observed: current.observed.filter((signal) => signal.id !== signalId),
    explicit: current.explicit.filter((signal) => signal.id !== signalId),
    temporary: current.temporary.filter((signal) => signal.id !== signalId),
    lastUpdatedAt: new Date().toISOString(),
  });
}

export function pinTasteSignal(signalId: string, pinned: boolean): TasteProfile {
  const current = loadTasteProfile();
  const next = updateSignalAcrossLayers(current, signalId, (signal) => ({ ...signal, pinned, hidden: pinned ? false : signal.hidden }));
  return saveTasteProfile({ ...next, lastUpdatedAt: new Date().toISOString() });
}

export function addExplicitTasteSignal(label: string, sentiment: TasteSignalSentiment, kind: TasteSignalKind = 'tag'): TasteProfile {
  const now = new Date().toISOString();
  return upsertTasteSignal({
    id: signalId(kind, label, 'explicit', sentiment),
    kind,
    key: normalizeSignalKey(kind, label),
    label: normalizeSignalLabel(kind, label),
    sentiment,
    origin: 'explicit',
    confidence: 1,
    strength: 'strong',
    confidenceTrend: 'new',
    supportingGameCount: 0,
    contradictoryGameCount: 0,
    evidence: { gameIds: [], gameTitles: [], explanation: sentiment === 'love' ? `You added ${normalizeSignalLabel(kind, label)} to your Taste Profile.` : `You said ${normalizeSignalLabel(kind, label)} is less your thing.` },
    lastUpdatedAt: now,
    confirmedAt: now,
    pinned: true,
  });
}

export function addTemporaryTasteSignal(label: string, days = 30, kind: TasteSignalKind = 'tag'): TasteProfile {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, Math.min(180, days)));
  const current = loadTasteProfile();
  const key = normalizeSignalKey(kind, label);
  const temporary = current.temporary.filter((signal) => !(signal.kind === kind && signal.key === key));
  temporary.push({
    id: signalId(kind, key, 'temporary', 'love'),
    kind,
    key,
    label: normalizeSignalLabel(kind, label),
    sentiment: 'love',
    origin: 'temporary',
    confidence: 1,
    strength: 'moderate',
    confidenceTrend: 'new',
    supportingGameCount: 0,
    contradictoryGameCount: 0,
    evidence: { gameIds: [], gameTitles: [], explanation: `A current interest in ${normalizeSignalLabel(kind, label)}.` },
    lastUpdatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  return saveTasteProfile({ ...current, temporary, lastUpdatedAt: now.toISOString() });
}

export function getActiveTasteSignals(profile: TasteProfile, sentiment?: TasteSignalSentiment): TasteSignal[] {
  const now = new Date();
  const merged = new Map<string, TasteSignal>();
  for (const signal of [...profile.observed, ...profile.explicit, ...profile.temporary]) {
    if (signal.hidden || signal.rejectedAt || isExpired(signal, now)) continue;
    if (sentiment && signal.sentiment !== sentiment) continue;
    const key = `${signal.kind}:${signal.key}:${signal.sentiment}`;
    const existing = merged.get(key);
    if (!existing || signalRank(signal) > signalRank(existing)) merged.set(key, signal);
  }
  return [...merged.values()].sort(compareTasteSignals);
}

export function exportTasteProfile(profile: TasteProfile = loadTasteProfile()): string {
  return JSON.stringify(normalizeTasteProfile(profile), null, 2);
}

function tasteInputFingerprint(games: Game[]): string {
  const feedbackKey = loadRecommendationFeedback()
    .map((record) => [record.rawgId ?? record.normalizedTitle, record.feedbackType, record.createdAt].join(':'))
    .sort()
    .join('|');
  return `${profileFingerprint(games)}::feedback:${feedbackKey}`;
}

function inferObservedTasteSignals(games: Game[], previousObserved: TasteSignal[], now: Date): TasteSignal[] {
  const positive = new Map<string, SignalAccumulator>();
  const negative = new Map<string, SignalAccumulator>();

  for (const game of games) {
    const behavior = getTasteBehavior(game);
    if (behavior.weight === 0) continue;
    const target = behavior.weight > 0 ? positive : negative;
    const contradictionTarget = behavior.weight > 0 ? negative : positive;
    const absWeight = Math.abs(behavior.weight);
    for (const signal of extractSignals(game)) {
      const info = signal.kind === 'genre' || signal.kind === 'tag' ? signalInformationValue(signal.kind, signal.label) : 0.8;
      addAccumulatorSignal(target, signal, behavior.weight > 0 ? 'love' : 'avoid', absWeight * info, game, behavior.reason);
      addContradiction(contradictionTarget, signal, game);
    }
  }
  for (const feedback of loadRecommendationFeedback()) {
    const feedbackWeight = feedback.feedbackType === 'more_like_this' ? 2.4 :
      feedback.feedbackType === 'less_like_this' ? -2.6 :
        feedback.feedbackType === 'not_interested' || feedback.feedbackType === 'hide' ? -2 : 0;
    if (feedbackWeight === 0) continue;
    const target = feedbackWeight > 0 ? positive : negative;
    const contradictionTarget = feedbackWeight > 0 ? negative : positive;
    const reason = feedbackWeight > 0 ? 'asked for more like this' : 'marked not interested';
    const evidence = { id: `feedback:${feedback.rawgId ?? feedback.normalizedTitle}:${feedback.createdAt}`, title: feedback.normalizedTitle };
    for (const signal of extractFeedbackSignals(feedback.metadata)) {
      const info = signal.kind === 'genre' || signal.kind === 'tag' ? signalInformationValue(signal.kind, signal.label) : 0.8;
      addAccumulatorSignal(target, signal, feedbackWeight > 0 ? 'love' : 'avoid', Math.abs(feedbackWeight) * info, evidence, reason);
      addContradiction(contradictionTarget, signal, evidence);
    }
  }

  const previousById = new Map(previousObserved.map((signal) => [signal.id, signal]));
  return [...positive.values(), ...negative.values()]
    .map((accumulator) => buildObservedSignal(accumulator, previousById.get(signalId(accumulator.kind, accumulator.key, 'observed', accumulator.sentiment)), now))
    .filter((signal): signal is TasteSignal => Boolean(signal))
    .sort(compareTasteSignals)
    .slice(0, 36);
}

function buildObservedSignal(accumulator: SignalAccumulator, previous: TasteSignal | undefined, now: Date): TasteSignal | null {
  const supportingGameCount = accumulator.support.size;
  const contradictoryGameCount = accumulator.contradiction.size;
  if (accumulator.sentiment === 'avoid' && supportingGameCount < 2) return null;
  if (accumulator.sentiment === 'love' && accumulator.weight < 1.6 && supportingGameCount < 2) return null;
  const confidence = boundedConfidence(accumulator.weight, supportingGameCount, contradictoryGameCount, accumulator.sentiment);
  if (confidence < (accumulator.sentiment === 'avoid' ? 0.52 : 0.42)) return null;
  const strength = confidence >= 0.78 && (accumulator.weight >= 10 || supportingGameCount >= 3) ? 'strong' : confidence >= 0.6 ? 'moderate' : 'emerging';
  const titles = [...accumulator.support.values()].slice(0, 4).map((item) => item.title);
  return {
    id: signalId(accumulator.kind, accumulator.key, 'observed', accumulator.sentiment),
    kind: accumulator.kind,
    key: accumulator.key,
    label: accumulator.label,
    sentiment: accumulator.sentiment,
    origin: 'observed',
    confidence,
    strength,
    confidenceTrend: getConfidenceTrend(previous?.confidence, confidence),
    supportingGameCount,
    contradictoryGameCount,
    evidence: {
      gameIds: [...accumulator.support.values()].slice(0, 8).map((item) => item.id),
      gameTitles: titles,
      explanation: explainSignal(accumulator, titles),
    },
    lastUpdatedAt: now.toISOString(),
    hidden: previous?.hidden,
    rejectedAt: previous?.rejectedAt,
  };
}

function getTasteBehavior(game: Game): { weight: number; reason: string } {
  const rating = typeof game.rating === 'number' ? game.rating : null;
  if (game.status === 'Dropped') return { weight: rating != null && rating <= 2 ? -4 : -3, reason: 'dropped' };
  if (rating != null && rating <= 2 && (game.status === 'Finished' || game.playtimeHours >= 2)) return { weight: -3.2, reason: 'rated low' };
  let weight = 0;
  const reasons: string[] = [];
  if (game.favorite) { weight += 4; reasons.push('favorited'); }
  if (game.status === 'Finished') { weight += rating != null && rating >= 4 ? 4 : 2; reasons.push(rating != null && rating >= 4 ? 'finished and rated highly' : 'finished'); }
  if (game.status === 'Playing') { weight += 2.5; reasons.push('kept playing'); }
  if (game.playtimeHours >= 60) { weight += 2.5; reasons.push('spent a lot of time with'); }
  else if (game.playtimeHours >= 20) { weight += 1.5; reasons.push('spent time with'); }
  if (game.collectionType === 'wishlist' || game.status === 'Want to play') { weight += game.priority === 'high' ? 1.4 : 0.8; reasons.push('planned'); }
  return { weight: Math.min(8, weight), reason: reasons[0] ?? 'owned' };
}

function extractSignals(game: Game): Array<{ kind: TasteSignalKind; key: string; label: string }> {
  const signals: Array<{ kind: TasteSignalKind; key: string; label: string }> = [];
  const add = (kind: TasteSignalKind, raw: string | undefined | null) => {
    if (!raw?.trim()) return;
    const key = normalizeSignalKey(kind, raw);
    if (!key || (kind === 'tag' && isGenericPreferenceTag(key))) return;
    signals.push({ kind, key, label: normalizeSignalLabel(kind, raw) });
  };
  (game.genres ?? []).forEach((genre) => add('genre', genre));
  (game.rawgTags ?? []).forEach((tag) => add('tag', tag));
  (game.tags ?? []).forEach((tag) => add('tag', tag));
  (game.developers ?? []).slice(0, 3).forEach((developer) => add('developer', developer));
  add('platform', game.platform);
  const franchise = recommendationFranchiseKey(game.rawgSlug ?? game.rawgTitle ?? game.title);
  if (franchise) add('franchise', franchise);
  if (game.hltbMainHours || game.expectedPlaytime) {
    const hours = game.hltbMainHours ?? game.expectedPlaytime ?? 0;
    if (hours > 0 && hours <= 12) add('length', 'short games');
    else if (hours >= 45) add('length', 'long games');
  }
  const released = game.released ?? game.releaseDate;
  if (released) {
    const year = Number.parseInt(released.slice(0, 4), 10);
    if (Number.isFinite(year)) add('release-era', year < 2010 ? 'retro' : year >= new Date().getUTCFullYear() - 3 ? 'new releases' : '');
  }
  return dedupeSignals(signals);
}

function extractFeedbackSignals(metadata: { genres: string[]; tags: string[]; developers: string[]; franchise: string | null }): Array<{ kind: TasteSignalKind; key: string; label: string }> {
  const signals: Array<{ kind: TasteSignalKind; key: string; label: string }> = [];
  metadata.genres.forEach((genre) => signals.push({ kind: 'genre', key: normalizeSignalKey('genre', genre), label: normalizeSignalLabel('genre', genre) }));
  metadata.tags.filter((tag) => !isGenericPreferenceTag(tag)).forEach((tag) => signals.push({ kind: 'tag', key: normalizeSignalKey('tag', tag), label: normalizeSignalLabel('tag', tag) }));
  metadata.developers.forEach((developer) => signals.push({ kind: 'developer', key: normalizeSignalKey('developer', developer), label: normalizeSignalLabel('developer', developer) }));
  if (metadata.franchise) signals.push({ kind: 'franchise', key: normalizeSignalKey('franchise', metadata.franchise), label: normalizeSignalLabel('franchise', metadata.franchise) });
  return dedupeSignals(signals);
}

function addAccumulatorSignal(map: Map<string, SignalAccumulator>, signal: { kind: TasteSignalKind; key: string; label: string }, sentiment: TasteSignalSentiment, weight: number, item: { id: string; title: string }, reason: string): void {
  const id = `${signal.kind}:${signal.key}:${sentiment}`;
  const existing = map.get(id) ?? {
    ...signal,
    sentiment,
    weight: 0,
    support: new Map<string, Game>(),
    contradiction: new Map<string, Game>(),
    reasons: new Set<string>(),
  };
  existing.weight += weight;
  existing.support.set(item.id, item);
  existing.reasons.add(reason);
  map.set(id, existing);
}

function addContradiction(map: Map<string, SignalAccumulator>, signal: { kind: TasteSignalKind; key: string; label: string }, item: { id: string; title: string }): void {
  for (const sentiment of ['love', 'avoid'] as const) {
    const existing = map.get(`${signal.kind}:${signal.key}:${sentiment}`);
    if (existing) existing.contradiction.set(item.id, item);
  }
}

function boundedConfidence(weight: number, support: number, contradiction: number, sentiment: TasteSignalSentiment): number {
  const evidence = Math.min(0.34, support * 0.08) + Math.min(0.32, Math.log1p(weight) / 8);
  const base = sentiment === 'avoid' ? 0.34 : 0.38;
  const penalty = Math.min(0.28, contradiction * 0.06);
  return Math.round(Math.max(0.05, Math.min(0.95, base + evidence - penalty)) * 20) / 20;
}

function explainSignal(accumulator: SignalAccumulator, titles: string[]): string {
  const support = accumulator.support.size;
  const reason = [...accumulator.reasons][0] ?? (accumulator.sentiment === 'love' ? positiveBehaviorWords[0] : negativeBehaviorWords[0]);
  const sample = titles.length > 0 ? `, including ${titles.slice(0, 2).join(' and ')}` : '';
  if (accumulator.sentiment === 'avoid') {
    return `You have repeatedly ${reason} ${accumulator.label} games${sample}.`;
  }
  if (reason.includes('rated')) return `You ${reason} several ${accumulator.label} games${sample}.`;
  if (support >= 3) return `You consistently ${reason} ${accumulator.label} games${sample}.`;
  return `Your library shows a growing interest in ${accumulator.label}${sample}.`;
}

function normalizeSignals(value: unknown, origin: TasteSignalOrigin): TasteSignal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((signal): TasteSignal | null => {
      if (!signal || typeof signal !== 'object') return null;
      const parsed = signal as Partial<TasteSignal>;
      if (!isTasteKind(parsed.kind) || !isSentiment(parsed.sentiment)) return null;
      const key = typeof parsed.key === 'string' ? normalizeSignalKey(parsed.kind, parsed.key) : '';
      if (!key) return null;
      return {
        id: typeof parsed.id === 'string' && parsed.id ? parsed.id : signalId(parsed.kind, key, origin, parsed.sentiment),
        kind: parsed.kind,
        key,
        label: typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim() : normalizeSignalLabel(parsed.kind, key),
        sentiment: parsed.sentiment,
        origin,
        confidence: clampNumber(parsed.confidence, 0, 1, origin === 'explicit' ? 1 : 0.5),
        strength: parsed.strength === 'strong' || parsed.strength === 'moderate' || parsed.strength === 'emerging' ? parsed.strength : 'emerging',
        confidenceTrend: parsed.confidenceTrend === 'rising' || parsed.confidenceTrend === 'falling' || parsed.confidenceTrend === 'steady' || parsed.confidenceTrend === 'new' ? parsed.confidenceTrend : 'steady',
        supportingGameCount: Math.max(0, Math.round(parsed.supportingGameCount ?? 0)),
        contradictoryGameCount: Math.max(0, Math.round(parsed.contradictoryGameCount ?? 0)),
        evidence: normalizeEvidence(parsed.evidence),
        lastUpdatedAt: validIso(parsed.lastUpdatedAt) ? parsed.lastUpdatedAt! : new Date().toISOString(),
        pinned: Boolean(parsed.pinned),
        hidden: Boolean(parsed.hidden),
        confirmedAt: validIso(parsed.confirmedAt) ? parsed.confirmedAt : undefined,
        rejectedAt: validIso(parsed.rejectedAt) ? parsed.rejectedAt : undefined,
        expiresAt: validIso(parsed.expiresAt) ? parsed.expiresAt : undefined,
      };
    })
    .filter((signal): signal is TasteSignal => Boolean(signal));
}

function normalizePrompt(value: unknown): TasteProfile['prompt'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const parsed = value as TasteProfile['prompt'];
  return {
    firstReadyAt: validIso(parsed.firstReadyAt) ? parsed.firstReadyAt : undefined,
    dismissedAt: validIso(parsed.dismissedAt) ? parsed.dismissedAt : undefined,
    confirmedAt: validIso(parsed.confirmedAt) ? parsed.confirmedAt : undefined,
    changePromptedAt: validIso(parsed.changePromptedAt) ? parsed.changePromptedAt : undefined,
    ignoredChangeAt: validIso(parsed.ignoredChangeAt) ? parsed.ignoredChangeAt : undefined,
    inferencePausedAt: validIso(parsed.inferencePausedAt) ? parsed.inferencePausedAt : undefined,
  };
}

function normalizeEvidence(value: unknown): TasteEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { gameIds: [], gameTitles: [], explanation: '' };
  const parsed = value as Partial<TasteEvidence>;
  return {
    gameIds: Array.isArray(parsed.gameIds) ? parsed.gameIds.filter((item): item is string => typeof item === 'string').slice(0, 12) : [],
    gameTitles: Array.isArray(parsed.gameTitles) ? parsed.gameTitles.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
  };
}

function updateSignalAcrossLayers(profile: TasteProfile, signalIdToUpdate: string, update: (signal: TasteSignal) => TasteSignal): TasteProfile {
  return {
    ...profile,
    observed: profile.observed.map((signal) => signal.id === signalIdToUpdate ? update(signal) : signal),
    explicit: profile.explicit.map((signal) => signal.id === signalIdToUpdate ? update(signal) : signal),
    temporary: profile.temporary.map((signal) => signal.id === signalIdToUpdate ? update(signal) : signal),
  };
}

function upsertTasteSignal(signal: TasteSignal): TasteProfile {
  const current = loadTasteProfile();
  const explicit = current.explicit.filter((item) => !(item.kind === signal.kind && item.key === signal.key && item.sentiment === signal.sentiment));
  explicit.push({ ...signal, origin: 'explicit' });
  return saveTasteProfile({ ...current, explicit, lastUpdatedAt: new Date().toISOString() });
}

function dedupeSignals(signals: Array<{ kind: TasteSignalKind; key: string; label: string }>) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.kind}:${signal.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareTasteSignals(a: TasteSignal, b: TasteSignal): number {
  return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    || signalRank(b) - signalRank(a)
    || b.confidence - a.confidence
    || b.supportingGameCount - a.supportingGameCount
    || a.label.localeCompare(b.label);
}

function signalRank(signal: TasteSignal): number {
  const origin = signal.origin === 'explicit' ? 30 : signal.origin === 'temporary' ? 20 : 10;
  const sentiment = signal.sentiment === 'love' ? 4 : 2;
  const strength = signal.strength === 'strong' ? 6 : signal.strength === 'moderate' ? 3 : 1;
  return origin + sentiment + strength + signal.confidence * 10;
}

function getConfidenceTrend(previous: number | undefined, next: number): TasteConfidenceTrend {
  if (previous == null) return 'new';
  if (next >= previous + 0.08) return 'rising';
  if (next <= previous - 0.08) return 'falling';
  return 'steady';
}

function hasTasteShift(previous: TasteSignal[], next: TasteSignal[]): boolean {
  if (previous.length < 4 || next.length < 4) return false;
  const previousTop = new Set(previous.filter((signal) => signal.sentiment === 'love').slice(0, 5).map((signal) => signal.id));
  const overlap = next.filter((signal) => signal.sentiment === 'love').slice(0, 5).filter((signal) => previousTop.has(signal.id)).length;
  return overlap <= 2;
}

function normalizeSignalKey(kind: TasteSignalKind, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (kind === 'developer' || kind === 'platform') return trimmed.replace(/\s+/g, ' ');
  return toSlug(trimmed);
}

function normalizeSignalLabel(kind: TasteSignalKind, value: string): string {
  const key = normalizeSignalKey(kind, value);
  if (kind === 'developer' || kind === 'platform') return key;
  return key
    .split('-')
    .filter(Boolean)
    .map((part) => part === 'rpg' ? 'RPG' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function signalId(kind: TasteSignalKind, value: string, origin: TasteSignalOrigin, sentiment: TasteSignalSentiment): string {
  return `${origin}:${sentiment}:${kind}:${normalizeSignalKey(kind, value)}`;
}

function signalIdForExplicit(kind: TasteSignalKind, value: string, sentiment: TasteSignalSentiment): string {
  return signalId(kind, value, 'explicit', sentiment);
}

function isExpired(signal: TasteSignal, now = new Date()): boolean {
  return Boolean(signal.expiresAt && new Date(signal.expiresAt).getTime() <= now.getTime());
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(new Date(value).getTime());
}

function isTasteKind(value: unknown): value is TasteSignalKind {
  return value === 'genre' || value === 'tag' || value === 'developer' || value === 'franchise' || value === 'platform' || value === 'length' || value === 'release-era';
}

function isSentiment(value: unknown): value is TasteSignalSentiment {
  return value === 'love' || value === 'avoid';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
