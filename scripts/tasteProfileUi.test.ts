import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { TasteSignal } from '../src/lib/tasteProfile';
import {
  buildTasteIdentitySummary,
  getTasteConfidenceLabel,
  getTasteSignalOriginLabel,
  getTasteTriageKeyboardAction,
  shouldShowTasteDragHint,
} from '../src/lib/tasteProfilePresentation';

const panelSource = readFileSync('src/components/TasteProfilePanel.tsx', 'utf8');
const stylesSource = readFileSync('src/styles.css', 'utf8');

function signal(overrides: Partial<TasteSignal> = {}): TasteSignal {
  return {
    id: overrides.id ?? 'observed:love:tag:mystery',
    kind: overrides.kind ?? 'tag',
    key: overrides.key ?? 'mystery',
    label: overrides.label ?? 'Mystery',
    sentiment: overrides.sentiment ?? 'love',
    origin: overrides.origin ?? 'observed',
    confidence: overrides.confidence ?? 0.91,
    strength: overrides.strength ?? 'strong',
    confidenceTrend: overrides.confidenceTrend ?? 'steady',
    supportingGameCount: overrides.supportingGameCount ?? 12,
    contradictoryGameCount: overrides.contradictoryGameCount ?? 0,
    evidence: overrides.evidence ?? { gameIds: ['game-1'], gameTitles: ['Return of the Obra Dinn'], explanation: 'Mystery games recur among games you finish and rate highly.' },
    lastUpdatedAt: overrides.lastUpdatedAt ?? '2026-07-11T10:00:00.000Z',
    pinned: overrides.pinned,
    hidden: overrides.hidden,
    confirmedAt: overrides.confirmedAt,
    rejectedAt: overrides.rejectedAt,
    expiresAt: overrides.expiresAt,
  };
}

test('Gaming DNA drag hint is first-use only and dismissible', () => {
  assert.equal(shouldShowTasteDragHint(null), true);
  assert.equal(shouldShowTasteDragHint('seen'), false);
  assert.match(panelSource, /tasteDragHintStorageKey/);
  assert.match(panelSource, /data-testid="taste-drag-first-use-hint"/);
  assert.match(panelSource, /Dismiss drag hint/);
});

test('reduced-motion users do not receive the taste-card nudge', () => {
  assert.match(stylesSource, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?qs-taste-card-nudge/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.qs-taste-card-nudge\s*{\s*animation: none !important;/);
});

test('keyboard mapping covers confirm, reject, dislike, and pin while skip stays a button', () => {
  assert.equal(getTasteTriageKeyboardAction('ArrowLeft', false), 'reject');
  assert.equal(getTasteTriageKeyboardAction('ArrowLeft', true), 'opposite');
  assert.equal(getTasteTriageKeyboardAction('ArrowRight', false), 'confirm');
  assert.equal(getTasteTriageKeyboardAction('ArrowRight', true), 'pin');
  assert.equal(getTasteTriageKeyboardAction('Enter', false), 'confirm');
  assert.match(panelSource, /onKeyDown={handleCardKeyDown}/);
  assert.match(panelSource, />\s*Skip for now\s*</);
});

test('normal confidence presentation uses human labels instead of requiring percentages', () => {
  const labels = [
    getTasteConfidenceLabel(signal({ confidence: 0.94, supportingGameCount: 20 })),
    getTasteConfidenceLabel(signal({ confidence: 0.81 })),
    getTasteConfidenceLabel(signal({ confidence: 0.61 })),
    getTasteConfidenceLabel(signal({ confidence: 0.4 })),
  ];
  assert.deepEqual(labels, ['Very strong read', 'Strong read', 'Moderate read', 'Emerging pattern']);
  labels.forEach((label) => assert.doesNotMatch(label, /%/));
});

test('long signal names wrap and retain their complete accessible title', () => {
  assert.match(panelSource, /line-clamp-2 break-words text-base font-bold/);
  assert.match(panelSource, /title={signal.label}/);
  assert.match(panelSource, /break-words text-2xl font-bold/);
});

test('observed, confirmed, explicit, and temporary origins remain distinguishable', () => {
  assert.equal(getTasteSignalOriginLabel(signal()), 'Observed by Questory');
  assert.equal(getTasteSignalOriginLabel(signal({ origin: 'explicit' })), 'Confirmed by you');
  assert.equal(getTasteSignalOriginLabel(signal({ origin: 'explicit', evidence: { gameIds: [], gameTitles: [], explanation: 'Added directly.' } })), 'Explicitly added');
  assert.equal(getTasteSignalOriginLabel(signal({ origin: 'temporary' })), 'Temporary interest');
  assert.match(panelSource, /Pinned for quick access/);
});

test('Snapshot and completion present a meaningful profile summary', () => {
  const summary = buildTasteIdentitySummary(
    [signal({ label: 'Mystery' }), signal({ id: 'two', label: 'Tactical RPGs' })],
    [signal({ id: 'three', label: 'In-app purchases', sentiment: 'avoid' })],
  );
  assert.match(summary, /Mystery and Tactical RPGs/);
  assert.match(summary, /In-app purchases/);
  assert.match(panelSource, /Your Gaming DNA is ready/);
  assert.match(panelSource, /Strongest signals/);
  assert.match(panelSource, /Recommendations now remember/);
});

test('Fine Tune corrections expose structured suggestions plus edit and remove actions', () => {
  assert.match(panelSource, /taste-correction-suggestions/);
  assert.match(panelSource, /Preview/);
  assert.match(panelSource, /onEditExplicitTasteSignal/);
  assert.match(panelSource, /aria-label={`Edit \${signal.label}`}/);
  assert.match(panelSource, /aria-label={`Remove \${signal.label}`}/);
});

test('Current Mood supports adding, removing, and explaining temporary interests', () => {
  assert.match(panelSource, /Add mood/);
  assert.match(panelSource, /Remove current mood/);
  assert.match(panelSource, /steer recommendations for 30 days/);
  assert.match(panelSource, /expires automatically/);
});

test('mobile taste triage preserves the card and both action zones', () => {
  assert.match(stylesSource, /\.qs-taste-triage-stage\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(stylesSource, /\.qs-taste-triage-stage \.qs-review-hero\s*{\s*grid-column: 1 \/ -1;/);
  assert.match(panelSource, /touch-action: pan-y|qs-review-swipe-card/);
});
