import type { Game } from '../types/game';
import type { TasteSignal, TasteSignalKind } from './tasteProfile';
import { isGenericPreferenceTag, recommendationFranchiseKey } from './userProfile';

export const tasteDragHintStorageKey = 'questshelf.tasteProfile.dragHintSeen.v1';

export type TasteTriageKeyboardAction = 'reject' | 'opposite' | 'confirm' | 'pin';

export type TasteSuggestion = {
  kind: TasteSignalKind;
  label: string;
};

const kindLabels: Record<TasteSignalKind, string> = {
  developer: 'Developer',
  franchise: 'Franchise',
  genre: 'Genre',
  length: 'Game length',
  platform: 'Platform',
  'release-era': 'Release era',
  tag: 'Style or mechanic',
};

export function shouldShowTasteDragHint(storedValue: string | null): boolean {
  return storedValue !== 'seen';
}

export function getTasteTriageKeyboardAction(key: string, shiftKey: boolean): TasteTriageKeyboardAction | null {
  if (key === 'ArrowLeft') return shiftKey ? 'opposite' : 'reject';
  if (key === 'ArrowRight' || key === 'Enter') return shiftKey ? 'pin' : 'confirm';
  return null;
}

export function getTasteConfidenceLabel(signal: Pick<TasteSignal, 'confidence' | 'origin' | 'supportingGameCount'>): string {
  if (signal.origin === 'explicit') return 'Clear preference';
  if (signal.origin === 'temporary') return 'Temporary interest';
  if (signal.confidence >= 0.9 && signal.supportingGameCount >= 5) return 'Very strong read';
  if (signal.confidence >= 0.75) return 'Strong read';
  if (signal.confidence >= 0.55) return 'Moderate read';
  return 'Emerging pattern';
}

export function getTasteSignalKindLabel(kind: TasteSignalKind): string {
  return kindLabels[kind];
}

export function getTasteSignalOriginLabel(signal: Pick<TasteSignal, 'evidence' | 'origin'>): string {
  if (signal.origin === 'temporary') return 'Temporary interest';
  if (signal.origin === 'observed') return 'Observed by Questory';
  return signal.evidence.gameIds.length > 0 || signal.evidence.gameTitles.length > 0
    ? 'Confirmed by you'
    : 'Explicitly added';
}

export function getTasteEvidenceSummary(signal: Pick<TasteSignal, 'origin' | 'supportingGameCount'>): string {
  if (signal.supportingGameCount === 1) return 'Seen in 1 game';
  if (signal.supportingGameCount > 1) return `Seen across ${signal.supportingGameCount} games`;
  return signal.origin === 'temporary' ? 'Active for this moment' : 'Added directly by you';
}

export function getTasteConsistencyLabel(signal: Pick<TasteSignal, 'contradictoryGameCount' | 'supportingGameCount'>): string {
  if (signal.contradictoryGameCount === 0) {
    return signal.supportingGameCount > 1 ? 'Consistent across your shelf' : 'No contradictory signals';
  }
  return `${signal.contradictoryGameCount} contradictory ${signal.contradictoryGameCount === 1 ? 'signal' : 'signals'}`;
}

export function getTasteBehaviorCopy(signal: Pick<TasteSignal, 'evidence' | 'kind' | 'label' | 'sentiment'>): string {
  const explanation = signal.evidence.explanation.trim();
  if (explanation) return explanation;
  if (signal.sentiment === 'avoid') return `Your shelf suggests ${signal.label} is usually not your thing.`;
  if (signal.kind === 'platform') return `${signal.label} is a recurring part of how you choose to play.`;
  return `Your shelf keeps returning to ${signal.label}.`;
}

export function buildTasteIdentitySummary(lovedSignals: TasteSignal[], avoidedSignals: TasteSignal[]): string {
  const strongest = uniqueLabels(lovedSignals).slice(0, 3);
  const avoided = uniqueLabels(avoidedSignals).slice(0, 1);
  if (strongest.length === 0) return 'Your profile will take shape as Questory sees more finished, rated, and planned games.';
  const loveCopy = joinNaturalList(strongest);
  const agreement = strongest.length === 1 ? 'is the clearest pattern' : 'are the clearest patterns';
  if (avoided.length === 0) return `${loveCopy} ${agreement} in what keeps drawing you back.`;
  return `${loveCopy} ${strongest.length === 1 ? 'keeps' : 'keep'} drawing you back, while ${avoided[0]} appears less often among games you enjoy.`;
}

export function buildTasteSuggestions(games: Game[], signals: TasteSignal[]): TasteSuggestion[] {
  const suggestions = new Map<string, TasteSuggestion & { rank: number }>();
  const add = (kind: TasteSignalKind, value: string | null | undefined, rank: number) => {
    const label = value?.trim();
    if (!label) return;
    const key = `${kind}:${label.toLocaleLowerCase()}`;
    const existing = suggestions.get(key);
    if (existing) {
      existing.rank += rank;
      return;
    }
    suggestions.set(key, { kind, label: humanizeLabel(label), rank });
  };

  signals.forEach((signal, index) => add(signal.kind, signal.label, Math.max(20, 100 - index)));
  games.forEach((game) => {
    (game.genres ?? []).forEach((genre) => add('genre', genre, 1));
    (game.rawgTags ?? []).filter((tag) => !isGenericPreferenceTag(tag)).forEach((tag) => add('tag', tag, 1));
    (game.tags ?? []).filter((tag) => !isGenericPreferenceTag(tag)).forEach((tag) => add('tag', tag, 1));
    (game.developers ?? []).forEach((developer) => add('developer', developer, 1));
    add('platform', game.platform, 1);
    const franchise = recommendationFranchiseKey(game.rawgSlug ?? game.rawgTitle ?? game.title);
    if (franchise) add('franchise', franchise, 1);
  });
  ['Under 10 hours', '10 to 25 hours', '25 to 50 hours', 'Long games'].forEach((length) => add('length', length, 1));

  return [...suggestions.values()]
    .sort((first, second) => second.rank - first.rank || first.label.localeCompare(second.label))
    .map(({ kind, label }) => ({ kind, label }));
}

function uniqueLabels(signals: TasteSignal[]): string[] {
  return [...new Set(signals.map((signal) => signal.label))];
}

function joinNaturalList(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function humanizeLabel(value: string): string {
  if (!value.includes('-') || value.includes(' ')) return value;
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.toLocaleLowerCase() === 'rpg' ? 'RPG' : part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(' ');
}
