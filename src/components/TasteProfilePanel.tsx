import { useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, type IconName } from './Icon';
import type { Game } from '../types/game';
import { clearPersonalRecommendationCaches } from '../services/personalRecommendationsService';
import {
  addExplicitTasteSignal,
  addTemporaryTasteSignal,
  confirmObservedTasteSignal,
  createOppositeTasteSignal,
  exportTasteProfile,
  getActiveTasteSignals,
  getTasteProfileForGames,
  hideTasteSignal,
  pinTasteSignal,
  recomputeAndSaveTasteProfile,
  rejectTasteSignal,
  removeTasteSignal,
  resetAllTasteProfile,
  resetExplicitTasteProfile,
  resetObservedTasteProfile,
  resetTemporaryTasteProfile,
  saveTasteProfile,
  type TasteProfile,
  type TasteSignal,
  type TasteSignalKind,
  type TasteSignalSentiment,
} from '../lib/tasteProfile';
import {
  buildTasteIdentitySummary,
  buildTasteSuggestions,
  getTasteBehaviorCopy,
  getTasteConfidenceLabel,
  getTasteConsistencyLabel,
  getTasteEvidenceSummary,
  getTasteSignalKindLabel,
  getTasteSignalOriginLabel,
  getTasteTriageKeyboardAction,
  shouldShowTasteDragHint,
  tasteDragHintStorageKey,
  type TasteSuggestion,
} from '../lib/tasteProfilePresentation';

type TasteProfilePanelProps = {
  games: Game[];
  onDone?: () => void;
  variant?: 'page' | 'embedded';
};

type WizardStep = 'welcome' | 'overview' | 'loves' | 'less' | 'current' | 'tune';

const steps: Array<{ id: WizardStep; label: string; eyebrow: string }> = [
  { id: 'welcome', label: 'Welcome', eyebrow: '1' },
  { id: 'overview', label: 'Snapshot', eyebrow: '2' },
  { id: 'loves', label: 'What you love', eyebrow: '3' },
  { id: 'less', label: 'Less your thing', eyebrow: '4' },
  { id: 'current', label: 'Right now', eyebrow: '5' },
  { id: 'tune', label: 'Fine tune', eyebrow: '6' },
];

type TasteTriageAction = 'reject' | 'opposite' | 'confirm' | 'pin';
type SwipePhase = 'idle' | 'dragging' | 'settling' | 'exiting';
type SwipeHorizontalDirection = 'left' | 'right';
type SwipeVerticalDirection = 'up' | 'down';
type SwipeQuadrant = `${SwipeHorizontalDirection}-${SwipeVerticalDirection}`;
type SwipeState = { offsetX: number; offsetY: number; phase: SwipePhase };
type SwipeStart = { pointerId: number; x: number; y: number };

const emptySwipeState: SwipeState = { offsetX: 0, offsetY: 0, phase: 'idle' };
const swipeReleaseThreshold = 110;
const swipeVerticalDeadZone = 34;
const swipeCommitDelayMs = 180;
const dragStartScale = 0.85;
const minDragScale = 0.74;

const tasteTriageActions: Array<{ action: TasteTriageAction; icon: IconName; label: string; tone: 'negative' | 'positive' | 'neutral' }> = [
  { action: 'reject', icon: 'x', label: 'Not accurate', tone: 'neutral' },
  { action: 'opposite', icon: 'eye-off', label: 'Dislike this', tone: 'negative' },
  { action: 'confirm', icon: 'check', label: 'Yes', tone: 'positive' },
  { action: 'pin', icon: 'bookmark-pen', label: 'Pin', tone: 'neutral' },
];

const tasteSwipeZones: Record<SwipeHorizontalDirection, ReadonlyArray<{ action: TasteTriageAction; quadrant: SwipeQuadrant }>> = {
  left: [
    { action: 'opposite', quadrant: 'left-up' },
    { action: 'reject', quadrant: 'left-down' },
  ],
  right: [
    { action: 'confirm', quadrant: 'right-up' },
    { action: 'pin', quadrant: 'right-down' },
  ],
};

function getSwipeHorizontalDirection(offsetX: number): SwipeHorizontalDirection | null {
  if (offsetX < -16) return 'left';
  if (offsetX > 16) return 'right';
  return null;
}

function getSwipeVerticalDirection(offsetY: number, horizontal: SwipeHorizontalDirection): SwipeVerticalDirection {
  if (offsetY < -swipeVerticalDeadZone) return 'up';
  if (offsetY > swipeVerticalDeadZone) return 'down';
  return horizontal === 'left' ? 'down' : 'up';
}

function getTasteSwipeTarget(offsetX: number, offsetY: number) {
  const horizontal = getSwipeHorizontalDirection(offsetX);
  if (!horizontal) return null;
  const vertical = getSwipeVerticalDirection(offsetY, horizontal);
  const quadrant: SwipeQuadrant = `${horizontal}-${vertical}`;
  const zone = tasteSwipeZones[horizontal].find((item) => item.quadrant === quadrant);
  if (!zone) return null;
  const action = tasteTriageActions.find((item) => item.action === zone.action);
  if (!action) return null;
  return {
    action,
    actionIndex: tasteTriageActions.findIndex((item) => item.action === action.action),
    horizontal,
    quadrant,
    vertical,
  };
}

export function TasteProfilePanel({ games, onDone, variant = 'page' }: TasteProfilePanelProps) {
  const [tasteProfile, setTasteProfile] = useState<TasteProfile>(() => getTasteProfileForGames(games));
  const [activeStep, setActiveStep] = useState<WizardStep>('welcome');
  const [newTasteLabel, setNewTasteLabel] = useState('');
  const [newTasteKind, setNewTasteKind] = useState<TasteSignalKind>('tag');
  const [newTasteSentiment, setNewTasteSentiment] = useState<TasteSignalSentiment>('love');
  const [temporaryTasteLabel, setTemporaryTasteLabel] = useState('');
  const [lastAppliedCorrection, setLastAppliedCorrection] = useState('');
  const [editingTasteSignalId, setEditingTasteSignalId] = useState<string | null>(null);

  const lovedTasteSignals = useMemo(() => getActiveTasteSignals(tasteProfile, 'love').slice(0, 10), [tasteProfile]);
  const avoidedTasteSignals = useMemo(() => getActiveTasteSignals(tasteProfile, 'avoid').slice(0, 8), [tasteProfile]);
  const temporaryTasteSignals = useMemo(() => tasteProfile.temporary.filter((signal) => !signal.hidden).slice(0, 6), [tasteProfile]);
  const explicitTasteSignals = useMemo(() => tasteProfile.explicit.filter((signal) => !signal.hidden).slice(-8).reverse(), [tasteProfile]);
  const tasteSuggestions = useMemo(
    () => buildTasteSuggestions(games, [...tasteProfile.observed, ...tasteProfile.explicit]),
    [games, tasteProfile.explicit, tasteProfile.observed],
  );
  const featuredSignals = lovedTasteSignals.slice(0, 3);
  const strongestSignal = lovedTasteSignals[0] ?? null;
  const shouldShowTasteConfirmation = Boolean(tasteProfile.prompt.firstReadyAt && !tasteProfile.prompt.confirmedAt && !tasteProfile.prompt.dismissedAt && lovedTasteSignals.length >= 3);
  const activeStepIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep));

  function applyTasteProfileUpdate(next: TasteProfile) {
    setTasteProfile(next);
    void clearPersonalRecommendationCaches();
  }

  function recomputeTasteProfile() {
    applyTasteProfileUpdate(recomputeAndSaveTasteProfile(games));
  }

  function addManualTasteSignal() {
    const label = newTasteLabel.trim();
    if (!label) return;
    if (editingTasteSignalId) removeTasteSignal(editingTasteSignalId);
    applyTasteProfileUpdate(addExplicitTasteSignal(label, newTasteSentiment, newTasteKind));
    setLastAppliedCorrection(label);
    setNewTasteLabel('');
    setEditingTasteSignalId(null);
  }

  function addTemporaryInterest() {
    if (!temporaryTasteLabel.trim()) return;
    applyTasteProfileUpdate(addTemporaryTasteSignal(temporaryTasteLabel, 30, 'tag'));
    setTemporaryTasteLabel('');
  }

  function removeExplicitTasteSignal(signalId: string) {
    applyTasteProfileUpdate(removeTasteSignal(signalId));
    setLastAppliedCorrection('');
    if (editingTasteSignalId === signalId) cancelEditingTasteSignal();
  }

  function editExplicitTasteSignal(signal: TasteSignal) {
    setEditingTasteSignalId(signal.id);
    setNewTasteKind(signal.kind);
    setNewTasteLabel(signal.label);
    setNewTasteSentiment(signal.sentiment);
    setLastAppliedCorrection('');
  }

  function cancelEditingTasteSignal() {
    setEditingTasteSignalId(null);
    setNewTasteLabel('');
  }

  function resetEverythingTasteProfile() {
    applyTasteProfileUpdate(resetAllTasteProfile());
    setLastAppliedCorrection('');
  }

  function exportCurrentTasteProfile() {
    const blob = new Blob([exportTasteProfile(tasteProfile)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `questory-taste-profile-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function confirmTasteProfile() {
    const now = new Date().toISOString();
    applyTasteProfileUpdate(saveTasteProfile({
      ...tasteProfile,
      explicit: [
        ...tasteProfile.explicit,
        ...tasteProfile.observed
          .filter((signal) => signal.sentiment === 'love')
          .slice(0, 5)
          .map((signal) => ({ ...signal, origin: 'explicit' as const, confidence: Math.max(signal.confidence, 0.85), confirmedAt: now, pinned: signal.strength === 'strong' })),
      ],
      prompt: { ...tasteProfile.prompt, confirmedAt: now },
      lastUpdatedAt: now,
    }));
  }

  function dismissTasteProfilePrompt() {
    applyTasteProfileUpdate(saveTasteProfile({ ...tasteProfile, prompt: { ...tasteProfile.prompt, dismissedAt: new Date().toISOString() }, lastUpdatedAt: new Date().toISOString() }));
  }

  function goNext() {
    setActiveStep(steps[Math.min(steps.length - 1, activeStepIndex + 1)].id);
  }

  function goBack() {
    setActiveStep(steps[Math.max(0, activeStepIndex - 1)].id);
  }

  const shellClassName = variant === 'page'
    ? 'mx-auto max-w-7xl space-y-2 px-3 pb-12 pt-2'
    : 'space-y-4';
  const isWelcomeStep = activeStep === 'welcome';

  return (
    <section className={shellClassName}>
      <WizardProgress activeStep={activeStep} activeStepIndex={activeStepIndex} steps={steps} onStepChange={setActiveStep} />

      <div className={`overflow-hidden rounded-lg border border-mint/20 bg-ink-950 shadow-panel ${isWelcomeStep ? '' : 'min-h-[calc(100dvh-9rem)]'}`}>
        {shouldShowTasteConfirmation && activeStep === 'overview' ? (
          <div className="border-b border-mint/15 bg-mint/10 p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">This looks like a real pattern.</div>
                <p className="mt-1 text-sm text-slate-400">Confirm the strongest signals, or walk through the profile step by step.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="h-9 rounded-md border border-mint/40 bg-mint/15 px-3 text-sm font-semibold text-mint transition hover:bg-mint/25" onClick={confirmTasteProfile} type="button">Looks right</button>
                <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/35 hover:text-white" onClick={() => setActiveStep('loves')} type="button">Walk me through it</button>
                <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-400 transition hover:text-white" onClick={dismissTasteProfilePrompt} type="button">Later</button>
              </div>
            </div>
          </div>
        ) : null}

        <div className={isWelcomeStep ? '' : 'flex min-h-[calc(100dvh-11rem)] flex-col p-3 sm:p-4'}>
          <div className={isWelcomeStep ? '' : 'mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center'}>
            {activeStep === 'welcome' ? (
              <WelcomeStep
                featuredSignals={featuredSignals}
                games={games}
                lastUpdatedAt={tasteProfile.lastUpdatedAt}
                onNext={() => setActiveStep('overview')}
              />
            ) : activeStep === 'overview' ? (
              <OverviewStep
                avoidedTasteSignals={avoidedTasteSignals}
                featuredSignals={featuredSignals}
                games={games}
                lovedTasteSignals={lovedTasteSignals}
                strongestSignal={strongestSignal}
                onNext={() => setActiveStep('loves')}
              />
            ) : activeStep === 'loves' ? (
              <TasteTriageStep
                emptyLabel="Questory needs a few more strong signals before it can name what you love."
                games={games}
                intro="Does each signal feel like part of your gaming taste?"
                signals={lovedTasteSignals}
                title="What you seem to love"
                onConfirm={(signal) => applyTasteProfileUpdate(confirmObservedTasteSignal(signal.id))}
                onHide={(signal) => applyTasteProfileUpdate(hideTasteSignal(signal.id))}
                onOpposite={(signal) => applyTasteProfileUpdate(createOppositeTasteSignal(signal.id))}
                onPin={(signal) => applyTasteProfileUpdate(pinTasteSignal(signal.id, !signal.pinned))}
                onReject={(signal) => applyTasteProfileUpdate(rejectTasteSignal(signal.id))}
                completionAvoids={avoidedTasteSignals}
                completionCurrent={temporaryTasteSignals}
                completionLoves={getActiveTasteSignals(tasteProfile, 'love').slice(0, 3)}
                onContinue={() => setActiveStep('less')}
                onOpenRecommendations={onDone}
              />
            ) : activeStep === 'less' ? (
              <CompactSignalReviewStep
                emptyLabel="No strong dislikes yet. Questory only calls these after repeated evidence."
                games={games}
                intro="Questory is less confident here. These are gentle avoid signals, not hard rules."
                signals={avoidedTasteSignals}
                title="Usually not your thing"
                onConfirm={(signal) => applyTasteProfileUpdate(confirmObservedTasteSignal(signal.id))}
                onHide={(signal) => applyTasteProfileUpdate(hideTasteSignal(signal.id))}
                onOpposite={(signal) => applyTasteProfileUpdate(createOppositeTasteSignal(signal.id))}
                onPin={(signal) => applyTasteProfileUpdate(pinTasteSignal(signal.id, !signal.pinned))}
                onReject={(signal) => applyTasteProfileUpdate(rejectTasteSignal(signal.id))}
              />
            ) : activeStep === 'current' ? (
              <CurrentInterestsStep
                onAddTemporaryInterest={addTemporaryInterest}
                temporaryTasteLabel={temporaryTasteLabel}
                temporaryTasteSignals={temporaryTasteSignals}
                onTemporaryTasteLabelChange={setTemporaryTasteLabel}
                onRemoveTemporaryInterest={(signalId) => applyTasteProfileUpdate(removeTasteSignal(signalId))}
              />
            ) : (
              <FineTuneStep
                editingTasteSignalId={editingTasteSignalId}
                explicitTasteSignals={explicitTasteSignals}
                lastAppliedCorrection={lastAppliedCorrection}
                newTasteKind={newTasteKind}
                newTasteLabel={newTasteLabel}
                newTasteSentiment={newTasteSentiment}
                onAddManualTasteSignal={addManualTasteSignal}
                onCancelEditingTasteSignal={cancelEditingTasteSignal}
                onEditExplicitTasteSignal={editExplicitTasteSignal}
                onExport={exportCurrentTasteProfile}
                onNewTasteKindChange={setNewTasteKind}
                onNewTasteLabelChange={setNewTasteLabel}
                onNewTasteSentimentChange={setNewTasteSentiment}
                onRemoveExplicitTasteSignal={removeExplicitTasteSignal}
                onRecompute={recomputeTasteProfile}
                onResetExplicit={() => applyTasteProfileUpdate(resetExplicitTasteProfile())}
                onResetInferred={() => applyTasteProfileUpdate(resetObservedTasteProfile())}
                onResetTemporary={() => applyTasteProfileUpdate(resetTemporaryTasteProfile())}
                onResetAll={resetEverythingTasteProfile}
                tasteSuggestions={tasteSuggestions}
              />
            )}

            {!isWelcomeStep ? (
              <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-skyglass/10 pt-4">
                <button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={activeStepIndex === 0} onClick={goBack} type="button">Back</button>
                <button
                  className="h-10 rounded-md border border-mint/35 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20"
                  onClick={activeStepIndex === steps.length - 1 ? onDone ?? (() => setActiveStep('welcome')) : goNext}
                  type="button"
                >
                  {activeStepIndex === steps.length - 1 ? 'Finish and return home' : 'Next'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function WizardProgress({
  activeStep,
  activeStepIndex,
  steps,
  onStepChange,
}: {
  activeStep: WizardStep;
  activeStepIndex: number;
  steps: Array<{ id: WizardStep; label: string; eyebrow: string }>;
  onStepChange: (step: WizardStep) => void;
}) {
  return (
    <nav className="rounded-lg border border-skyglass/15 bg-ink-950 px-2 py-2 shadow-panel" aria-label="Gaming DNA review flow">
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((step, index) => {
          const isActive = step.id === activeStep;
          const isPast = index < activeStepIndex;
          return (
            <button
              aria-current={isActive ? 'step' : undefined}
              className={`group flex min-w-fit flex-none items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                isActive
                  ? 'bg-mint/12 text-white'
                  : 'text-slate-300 hover:bg-ink-900 hover:text-white'
              }`}
              key={step.id}
              onClick={() => onStepChange(step.id)}
              type="button"
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${isActive || isPast ? 'border-mint/40 text-mint' : 'border-skyglass/30 text-slate-400'}`}>
                {isPast ? <Icon name="check" size={11} /> : step.eyebrow}
              </span>
              <span>{step.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-900">
        <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${((activeStepIndex + 1) / steps.length) * 100}%` }} />
      </div>
    </nav>
  );
}

function WelcomeStep({
  featuredSignals,
  games,
  lastUpdatedAt,
  onNext,
}: {
  featuredSignals: TasteSignal[];
  games: Game[];
  lastUpdatedAt: string;
  onNext: () => void;
}) {
  const heroGames = getHeroArtworkGames(featuredSignals, games);
  return (
    <div className="relative min-h-[min(42rem,calc(100dvh-7rem))] overflow-hidden bg-ink-950">
      <div className="absolute inset-0 grid grid-cols-2 opacity-35 sm:grid-cols-3">
        {heroGames.map((game) => (
          <img alt="" className="h-full w-full object-cover" key={game.id} src={getGameArtwork(game)} />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/86 to-ink-950/45" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-ink-950/50" />
      <div className="relative flex min-h-[min(42rem,calc(100dvh-7rem))] flex-col justify-between gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex justify-end">
          <div className="rounded-md border border-skyglass/15 bg-ink-950/85 px-3 py-2 text-right">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Updated</div>
            <div className="text-sm font-semibold text-slate-200">{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleDateString() : 'Not yet'}</div>
          </div>
        </div>
        <div className="max-w-3xl pb-4">
          <div className="qs-label-caps text-mint">Taste Profile</div>
          <h2 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">Gaming DNA</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Questory looked across your shelf and found the patterns that seem to light you up.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="h-11 rounded-md border border-mint/40 bg-mint/15 px-5 text-sm font-bold text-mint transition hover:bg-mint/25" onClick={onNext} type="button">
              Start review
            </button>
            <span className="flex h-11 items-center rounded-md border border-skyglass/15 bg-ink-950/65 px-4 text-sm font-semibold text-slate-300">
              {featuredSignals.length > 0 ? `${featuredSignals.length} strongest signals ready` : 'Waiting for more shelf evidence'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewStep({
  avoidedTasteSignals,
  featuredSignals,
  games,
  lovedTasteSignals,
  onNext,
  strongestSignal,
}: {
  avoidedTasteSignals: TasteSignal[];
  featuredSignals: TasteSignal[];
  games: Game[];
  lovedTasteSignals: TasteSignal[];
  onNext: () => void;
  strongestSignal: TasteSignal | null;
}) {
  const identitySummary = buildTasteIdentitySummary(lovedTasteSignals, avoidedTasteSignals);
  return (
    <div className="grid gap-5">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(420px,1.12fr)]">
        <div>
        <div className="qs-label-caps text-mint">Snapshot</div>
        <h3 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Your shelf has a point of view.</h3>
        <p className="mt-3 max-w-2xl text-lg font-semibold leading-7 text-slate-200 sm:text-xl">
          {identitySummary}
        </p>
        <div className="mt-5 grid gap-3 border-y border-skyglass/10 py-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-mint">Keeps drawing you back</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {lovedTasteSignals.slice(0, 5).map((signal) => <TasteChip key={signal.id} signal={signal} />)}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-red-200">Usually less your thing</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {avoidedTasteSignals.length > 0
                ? avoidedTasteSignals.slice(0, 3).map((signal) => <TasteChip key={signal.id} signal={signal} />)
                : <span className="text-sm text-slate-500">No recurring avoid pattern yet.</span>}
            </div>
          </div>
        </div>
        <button className="mt-5 h-10 rounded-md border border-mint/35 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20" onClick={onNext} type="button">
          Review these signals
        </button>
        </div>
        <div className="border-l-0 border-skyglass/10 xl:border-l xl:pl-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">Strongest reads</div>
          {strongestSignal ? <span className="max-w-[14rem] text-right text-xs font-semibold leading-5 text-mint">Strongest: {strongestSignal.label}</span> : null}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {featuredSignals.length > 0 ? featuredSignals.map((signal) => (
            <TasteSnapshotCard games={games} key={signal.id} signal={signal} />
          )) : (
            <div className="rounded-lg border border-dashed border-skyglass/20 bg-ink-950/70 p-4 text-sm leading-6 text-slate-400 sm:col-span-3">
              Finish, rate, wishlist, or give feedback on a few more games and Questory will start sketching your Gaming DNA.
            </div>
          )}
        </div>
      </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-skyglass/10 pt-4" aria-label="Library context for this profile">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Built from your activity</div>
        <StatTile label="Taste signals" value={String(lovedTasteSignals.length)} />
        <StatTile label="Library games" value={String(games.filter((game) => game.collectionType === 'library').length)} />
        <StatTile label="Finished games" value={String(games.filter((game) => game.status === 'Finished').length)} />
      </div>
    </div>
  );
}

function CompactSignalReviewStep({
  emptyLabel,
  games,
  intro,
  signals,
  title,
  onConfirm,
  onHide,
  onOpposite,
  onPin,
  onReject,
}: {
  emptyLabel: string;
  games: Game[];
  intro: string;
  signals: TasteSignal[];
  title: string;
  onConfirm: (signal: TasteSignal) => void;
  onHide: (signal: TasteSignal) => void;
  onOpposite: (signal: TasteSignal) => void;
  onPin: (signal: TasteSignal) => void;
  onReject: (signal: TasteSignal) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="qs-label-caps text-mint">Taste read</div>
          <h3 className="mt-2 text-2xl font-bold text-white">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{intro}</p>
        </div>
        <span className="rounded-full border border-skyglass/15 bg-ink-950/80 px-3 py-1 text-xs font-bold text-slate-400">
          {signals.length} signals
        </span>
      </div>
      {signals.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-skyglass/15 bg-ink-950/60 p-5 text-sm leading-6 text-slate-500">{emptyLabel}</div>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {signals.map((signal) => (
            <CompactSignalCard
              games={games}
              key={signal.id}
              signal={signal}
              onConfirm={signal.origin === 'observed' ? () => onConfirm(signal) : undefined}
              onHide={() => onHide(signal)}
              onOpposite={() => onOpposite(signal)}
              onPin={() => onPin(signal)}
              onReject={() => onReject(signal)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompactSignalCard({
  games,
  signal,
  onConfirm,
  onHide,
  onOpposite,
  onPin,
  onReject,
}: {
  games: Game[];
  signal: TasteSignal;
  onConfirm?: () => void;
  onHide: () => void;
  onOpposite: () => void;
  onPin: () => void;
  onReject: () => void;
}) {
  const evidenceGames = getEvidenceGames(signal, games).slice(0, 3);
  return (
    <article className="rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
      <div className="flex gap-3">
        <div className="flex shrink-0 -space-x-3">
          {evidenceGames.length > 0 ? evidenceGames.map((game) => (
            <div className="h-14 w-10 overflow-hidden rounded-md border border-ink-950 bg-ink-900" key={game.id}>
              <img alt={game.title} className="h-full w-full object-cover" loading="lazy" src={getGameArtwork(game)} />
            </div>
          )) : (
            <div className="grid h-14 w-10 place-items-center rounded-md border border-skyglass/15 bg-ink-900 text-slate-700">
              <Icon name="sparkles" size={18} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 break-words text-base font-bold leading-5 text-white">{signal.label}</h4>
            <span className="rounded-full border border-skyglass/15 px-2 py-0.5 text-2xs font-bold uppercase text-slate-400">{getTasteSignalKindLabel(signal.kind)}</span>
            <span className="rounded-full border border-red-300/25 bg-red-500/10 px-2 py-0.5 text-2xs font-bold uppercase text-red-200" title={`${Math.round(signal.confidence * 100)}% confidence`}>{getTasteConfidenceLabel(signal)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{getTasteBehaviorCopy(signal)}</p>
          <p className="mt-1 text-xs text-slate-500">{getTasteEvidenceSummary(signal)}. {getTasteConsistencyLabel(signal)}.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {onConfirm ? <button className="h-8 rounded-md border border-mint/30 bg-mint/10 px-2 text-xs font-semibold text-mint transition hover:bg-mint/20" onClick={onConfirm} type="button">Accurate</button> : null}
            <button className="h-8 rounded-md border border-skyglass/15 px-2 text-xs font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white" onClick={onReject} type="button">Not accurate</button>
            <button className="h-8 rounded-md border border-red-400/30 px-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/10" onClick={onOpposite} type="button">Actually like this</button>
            <button className="h-8 rounded-md border border-skyglass/15 px-2 text-xs font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white" onClick={onPin} type="button">{signal.pinned ? 'Unpin' : 'Pin'}</button>
            <button className="h-8 rounded-md border border-skyglass/15 px-2 text-xs font-semibold text-slate-400 transition hover:text-white" onClick={onHide} type="button">Hide</button>
          </div>
        </div>
      </div>
    </article>
  );
}

function TasteTriageStep({
  completionAvoids,
  completionCurrent,
  completionLoves,
  emptyLabel,
  games,
  intro,
  signals,
  title,
  onConfirm,
  onContinue,
  onHide,
  onOpenRecommendations,
  onOpposite,
  onPin,
  onReject,
}: {
  completionAvoids: TasteSignal[];
  completionCurrent: TasteSignal[];
  completionLoves: TasteSignal[];
  emptyLabel: string;
  games: Game[];
  intro: string;
  signals: TasteSignal[];
  title: string;
  onConfirm: (signal: TasteSignal) => void;
  onContinue: () => void;
  onHide: (signal: TasteSignal) => void;
  onOpenRecommendations?: () => void;
  onOpposite: (signal: TasteSignal) => void;
  onPin: (signal: TasteSignal) => void;
  onReject: (signal: TasteSignal) => void;
}) {
  const [reviewedSignalKeys, setReviewedSignalKeys] = useState<Set<string>>(() => new Set());
  const [appliedActionCount, setAppliedActionCount] = useState(0);
  const [showDragHint, setShowDragHint] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return shouldShowTasteDragHint(window.localStorage.getItem(tasteDragHintStorageKey));
    } catch {
      return true;
    }
  });
  const [swipeState, setSwipeState] = useState<SwipeState>(emptySwipeState);
  const swipeStartRef = useRef<SwipeStart | null>(null);
  const initialSignalCountRef = useRef(signals.length);
  const pendingSignals = signals.filter((signal) => !reviewedSignalKeys.has(getTasteSignalReviewKey(signal)));
  const activeSignal = pendingSignals[0] ?? null;
  const totalCount = Math.max(initialSignalCountRef.current, signals.length);
  const reviewedCount = Math.min(reviewedSignalKeys.size, totalCount);
  const negativeActions = tasteTriageActions.filter((action) => action.action === 'opposite' || action.action === 'reject');
  const positiveActions = tasteTriageActions.filter((action) => action.action === 'confirm' || action.action === 'pin');
  const swipeTarget = getTasteSwipeTarget(swipeState.offsetX, swipeState.offsetY);
  const swipeDirection = swipeTarget?.horizontal ?? getSwipeHorizontalDirection(swipeState.offsetX);
  const activeSwipeAction = swipeTarget?.action ?? null;
  const swipeProgress = Math.min(Math.abs(swipeState.offsetX) / swipeReleaseThreshold, 1);
  const isSwipeDragging = swipeState.phase === 'dragging';
  const isSwipeExiting = swipeState.phase === 'exiting';
  const isSwipeEngaged = isSwipeDragging || isSwipeExiting;
  const dragScale = isSwipeEngaged ? dragStartScale - (dragStartScale - minDragScale) * swipeProgress : 1;
  const rotation = Math.max(-10, Math.min(10, swipeState.offsetX / 18));
  const swipeStyle = {
    '--qs-swipe-x': `${swipeState.offsetX}px`,
    '--qs-swipe-y': `${swipeState.offsetY}px`,
    '--qs-swipe-rotate': `${rotation}deg`,
    '--qs-swipe-progress': swipeProgress,
    '--qs-swipe-scale': dragScale,
  } as CSSProperties;

  function completeActive(action: (signal: TasteSignal) => void) {
    if (!activeSignal) return;
    setReviewedSignalKeys((current) => new Set([...current, getTasteSignalReviewKey(activeSignal)]));
    action(activeSignal);
  }

  function skipActive() {
    if (!activeSignal) return;
    setReviewedSignalKeys((current) => new Set([...current, getTasteSignalReviewKey(activeSignal)]));
  }

  function acknowledgeDragHint() {
    if (!showDragHint) return;
    try {
      window.localStorage.setItem(tasteDragHintStorageKey, 'seen');
    } catch {
      // The hint can still dismiss for this session when storage is unavailable.
    }
    setShowDragHint(false);
  }

  function handleAction(action: TasteTriageAction) {
    const handlers: Record<TasteTriageAction, (signal: TasteSignal) => void> = {
      confirm: onConfirm,
      opposite: onOpposite,
      pin: onPin,
      reject: onReject,
    };
    acknowledgeDragHint();
    setAppliedActionCount((count) => count + 1);
    completeActive(handlers[action]);
  }

  function restartTriage() {
    setReviewedSignalKeys(new Set());
    setAppliedActionCount(0);
  }

  function handleCardKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const action = getTasteTriageKeyboardAction(event.key, event.shiftKey);
    if (!action) return;
    event.preventDefault();
    handleAction(action);
  }

  function beginSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (swipeState.phase === 'exiting') return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, a, input, select, textarea, summary')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    swipeStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setSwipeState({ offsetX: 0, offsetY: 0, phase: 'dragging' });
  }

  function updateSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId || swipeState.phase !== 'dragging') return;
    const nextOffsetX = event.clientX - swipeStart.x;
    const nextOffsetY = event.clientY - swipeStart.y;
    if (Math.abs(nextOffsetX) > 8) event.preventDefault();
    if (Math.abs(nextOffsetX) > 24) acknowledgeDragHint();
    setSwipeState({ offsetX: nextOffsetX, offsetY: nextOffsetY, phase: 'dragging' });
  }

  function finishSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    swipeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const target = Math.abs(swipeState.offsetX) >= swipeReleaseThreshold ? getTasteSwipeTarget(swipeState.offsetX, swipeState.offsetY) : null;
    if (!target) {
      setSwipeState({ offsetX: 0, offsetY: 0, phase: 'settling' });
      window.setTimeout(() => setSwipeState(emptySwipeState), swipeCommitDelayMs);
      return;
    }
    const exitX = target.horizontal === 'left' ? -window.innerWidth : window.innerWidth;
    const exitY = target.vertical === 'up' ? -window.innerHeight * 0.45 : window.innerHeight * 0.45;
    setSwipeState({ offsetX: exitX, offsetY: exitY, phase: 'exiting' });
    window.setTimeout(() => {
      setSwipeState(emptySwipeState);
      handleAction(target.action.action);
    }, swipeCommitDelayMs);
  }

  function cancelSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (swipeStartRef.current?.pointerId !== event.pointerId) return;
    swipeStartRef.current = null;
    setSwipeState({ offsetX: 0, offsetY: 0, phase: 'settling' });
    window.setTimeout(() => setSwipeState(emptySwipeState), swipeCommitDelayMs);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="qs-label-caps text-mint">Taste triage</div>
          <h3 className="mt-2 text-2xl font-bold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{intro}</p>
        </div>
        <div className="rounded-full border border-amber-400/30 bg-ink-950/85 px-3 py-1.5 text-center shadow-panel">
          <div className="text-sm font-bold leading-none text-amber-400">{totalCount === 0 ? '-' : `${reviewedCount} of ${totalCount}`}</div>
          <div className="mt-0.5 text-2xs font-semibold uppercase tracking-widest leading-none text-amber-400/50">reviewed</div>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-skyglass/15 bg-ink-950/60 p-5 text-sm leading-6 text-slate-500">{emptyLabel}</div>
      ) : activeSignal ? (
        <article
          className={`qs-review-stage qs-taste-triage-stage mt-4 min-h-[460px] ${isSwipeEngaged ? 'is-swipe-engaged' : ''}`}
          data-swipe-active={isSwipeEngaged ? (swipeTarget?.quadrant ?? swipeDirection ?? 'none') : 'none'}
          data-swipe-left="negative"
          data-swipe-right="positive"
        >
          <section
            className={`qs-review-zone qs-review-zone-negative ${isSwipeEngaged && swipeDirection === 'left' ? 'qs-review-zone-active' : ''}`}
            aria-label="Correct this taste"
          >
            <div className="qs-review-zone-label">Correct</div>
            <TasteActionButtons actions={negativeActions.map((action) => action.action === 'opposite' ? { ...action, label: 'Dislike this' } : action)} activeAction={swipeTarget?.action.action ?? null} onAction={handleAction} />
          </section>

          <section className="qs-review-hero flex flex-col items-center" aria-label={`${activeSignal.label} taste signal. Drag left to correct or right to confirm. Use the visible buttons for every action.`}>
            <div className="w-full">
              {showDragHint ? (
                <div className="mb-2 flex items-start gap-2 rounded-md border border-mint/25 bg-mint/10 px-3 py-2 text-xs leading-5 text-slate-300" data-testid="taste-drag-first-use-hint" role="status">
                  <Icon className="mt-0.5 shrink-0 text-mint" name="sliders-horizontal" size={15} />
                  <span className="min-w-0 flex-1"><strong className="text-white">Make it yours.</strong> Drag left to correct, right to confirm. Angle up or down for the secondary action.</span>
                  <button aria-label="Dismiss drag hint" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white" onClick={acknowledgeDragHint} title="Dismiss hint" type="button"><Icon name="x" size={13} /></button>
                </div>
              ) : null}
              <TriageSignalCard
                activeSwipeLabel={activeSwipeAction?.label ?? null}
                games={games}
                isSwipeEngaged={isSwipeEngaged}
                isShowingDragHint={showDragHint}
                onKeyDown={handleCardKeyDown}
                onPointerCancel={cancelSwipe}
                onPointerDown={beginSwipe}
                onPointerMove={updateSwipe}
                onPointerUp={finishSwipe}
                signal={activeSignal}
                swipeDirection={swipeDirection}
                swipeState={swipeState}
                style={swipeStyle}
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  className="min-h-10 rounded-md border border-skyglass/15 bg-ink-950/70 px-3 text-sm font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white"
                  onClick={skipActive}
                  type="button"
                >
                  Skip for now
                </button>
                <button
                  className="min-h-10 rounded-md border border-skyglass/15 bg-ink-950/70 px-3 text-sm font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white"
                  onClick={restartTriage}
                  type="button"
                >
                  Restart queue
                </button>
              </div>
            </div>
          </section>

          <section
            className={`qs-review-zone qs-review-zone-positive ${isSwipeEngaged && swipeDirection === 'right' ? 'qs-review-zone-active' : ''}`}
            aria-label="Confirm this taste"
          >
            <div className="qs-review-zone-label">Keep</div>
            <TasteActionButtons actions={positiveActions.map((action) => action.action === 'pin' && activeSignal.pinned ? { ...action, label: 'Unpin' } : action)} activeAction={swipeTarget?.action.action ?? null} onAction={handleAction} />
          </section>
        </article>
      ) : (
        <div className="mx-auto mt-4 w-full max-w-4xl rounded-lg border border-mint/25 bg-mint/10 p-5 sm:p-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-mint/30 bg-mint/10 text-mint">
            <Icon name="check-circle" size={24} />
          </div>
          <h4 className="mt-3 text-center text-2xl font-bold text-white">Your Gaming DNA is ready</h4>
          <p className="mt-1 text-center text-sm leading-6 text-slate-300">{appliedActionCount > 0 ? 'Recommendations updated. Your choices are already shaping what Questory shows next.' : 'Review complete. Your existing recommendations stay unchanged.'}</p>
          <div className="mt-5 grid gap-3 border-y border-mint/15 py-4 sm:grid-cols-3">
            <CompletionSummaryItem label="Strongest signals" signals={completionLoves} fallback="Still taking shape" />
            <CompletionSummaryItem label="Less your thing" signals={completionAvoids} fallback="No clear avoid pattern" />
            <CompletionSummaryItem label="Current mood" signals={completionCurrent} fallback="Nothing temporary yet" />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className="h-10 rounded-md border border-mint/35 bg-mint/15 px-4 text-sm font-semibold text-mint transition hover:bg-mint/25" onClick={onContinue} type="button">Continue</button>
            <button className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white" onClick={restartTriage} type="button">Review again</button>
            {onOpenRecommendations ? <button className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white" onClick={onOpenRecommendations} type="button">Open recommendations</button> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function TasteActionButtons({
  actions,
  activeAction,
  onAction,
}: {
  actions: typeof tasteTriageActions;
  activeAction: TasteTriageAction | null;
  onAction: (action: TasteTriageAction) => void;
}) {
  return (
    <div className="grid gap-2">
      {actions.map((action) => {
        const isTarget = activeAction === action.action;
        return (
          <button
            className={`qs-review-action qs-review-action-side flex min-h-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 text-center transition ${getTasteActionClassName(action.tone, isTarget)} ${activeAction !== null && !isTarget ? 'pointer-events-none opacity-30' : ''}`}
            key={action.action}
            onClick={() => onAction(action.action)}
            type="button"
          >
            <div className="flex items-center justify-center gap-1.5">
              <Icon className="select-none" name={action.icon} />
              <span className="text-xs font-bold leading-none tracking-wide sm:text-sm">{action.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function getTasteActionClassName(tone: 'negative' | 'positive' | 'neutral', isTarget: boolean): string {
  if (tone === 'positive') {
    return isTarget
      ? 'border-mint/80 bg-mint/25 text-mint'
      : 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20';
  }
  if (tone === 'negative') {
    return isTarget
      ? 'border-red-200/70 bg-red-500/25 text-red-100'
      : 'border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20';
  }
  return isTarget
    ? 'border-white/60 bg-white/10 text-white'
    : 'border-skyglass/15 bg-ink-950/70 text-slate-200 hover:bg-mint/10 hover:text-white';
}

function TriageSignalCard({
  activeSwipeLabel,
  games,
  isSwipeEngaged,
  isShowingDragHint,
  onKeyDown,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  signal,
  swipeDirection,
  swipeState,
  style,
}: {
  activeSwipeLabel: string | null;
  games: Game[];
  isSwipeEngaged: boolean;
  isShowingDragHint: boolean;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  signal: TasteSignal;
  swipeDirection: SwipeHorizontalDirection | null;
  swipeState: SwipeState;
  style: CSSProperties;
}) {
  const evidenceGames = getEvidenceGames(signal, games);
  return (
    <article
      aria-label={`${signal.label}. ${getTasteBehaviorCopy(signal)} Press Left Arrow to mark not accurate, Shift Left Arrow to dislike, Right Arrow to confirm, or Shift Right Arrow to pin.`}
      className={`qs-review-swipe-card overflow-hidden rounded-lg border border-skyglass/15 bg-ink-950/80 shadow-panel ${isShowingDragHint ? 'qs-taste-card-nudge' : ''} ${swipeState.phase === 'dragging' ? 'is-dragging' : ''} ${swipeState.phase === 'exiting' ? 'is-exiting' : ''} ${swipeState.phase === 'settling' ? 'is-settling' : ''}`}
      data-testid="taste-triage-card"
      onKeyDown={onKeyDown}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="group"
      style={style}
      tabIndex={0}
    >
      {isSwipeEngaged && activeSwipeLabel && swipeDirection ? (
        <div className={`qs-review-swipe-label qs-review-swipe-label-${swipeDirection}`} aria-hidden="true">
          {activeSwipeLabel}
        </div>
      ) : null}
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-skyglass/15 px-2 py-1 text-2xs font-bold uppercase text-slate-300">{getTasteSignalOriginLabel(signal)}</span>
            <span className="rounded-full border border-skyglass/15 px-2 py-1 text-2xs font-bold uppercase text-slate-400">{getTasteSignalKindLabel(signal.kind)}</span>
            <span className="rounded-full border border-mint/25 bg-mint/10 px-2 py-1 text-2xs font-bold uppercase text-mint" title={`${Math.round(signal.confidence * 100)}% confidence`}>{getTasteConfidenceLabel(signal)}</span>
            {signal.pinned ? <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-2xs font-bold uppercase text-amber-300">Pinned for quick access</span> : null}
          </div>
          <span className="flex items-center gap-1.5 rounded-md border border-mint/25 bg-mint/10 px-2.5 py-1.5 text-xs font-bold text-mint">
            <Icon name="sliders-horizontal" size={13} />
            Drag card
          </span>
        </div>
        <p className="mt-3 text-xs font-bold uppercase text-mint">Does this feel like you?</p>
        <h4 className="mt-1 break-words text-2xl font-bold leading-tight text-white">{signal.label}</h4>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300">{getTasteBehaviorCopy(signal)}</p>
        <MiniEvidenceCovers evidenceGames={evidenceGames} signal={signal} />
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-ink-900 px-2 py-1">{getTasteEvidenceSummary(signal)}</span>
          <span className="rounded-full bg-ink-900 px-2 py-1">{getTasteConsistencyLabel(signal)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-skyglass/10 pt-3 text-xs font-bold text-slate-400" aria-hidden="true">
          <span>← Correct</span>
          <span>Confirm →</span>
        </div>
      </div>
    </article>
  );
}

function MiniEvidenceCovers({ evidenceGames, signal }: { evidenceGames: Game[]; signal: TasteSignal }) {
  const shownGames = evidenceGames.slice(0, 4);
  const fallbackTitles = signal.evidence.gameTitles.slice(shownGames.length, 4);
  if (shownGames.length === 0 && fallbackTitles.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-skyglass/15 bg-ink-900/50 px-3 py-2 text-xs text-slate-500">
        Evidence came from feedback or imported metadata.
      </div>
    );
  }
  return (
    <div className="mt-3 flex gap-2 overflow-hidden">
      {shownGames.map((game) => (
        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-skyglass/10 bg-ink-900" key={game.id}>
          <img alt={game.title} className="h-full w-full object-cover" loading="lazy" src={getGameArtwork(game)} />
        </div>
      ))}
      {fallbackTitles.map((title) => (
        <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-skyglass/15 bg-ink-900/70 p-1 text-center text-[9px] font-semibold leading-tight text-slate-500" key={title}>
          {title}
        </div>
      ))}
    </div>
  );
}

function CurrentInterestsStep({
  onAddTemporaryInterest,
  onRemoveTemporaryInterest,
  onTemporaryTasteLabelChange,
  temporaryTasteLabel,
  temporaryTasteSignals,
}: {
  onAddTemporaryInterest: () => void;
  onRemoveTemporaryInterest: (signalId: string) => void;
  onTemporaryTasteLabelChange: (value: string) => void;
  temporaryTasteLabel: string;
  temporaryTasteSignals: TasteSignal[];
}) {
  const prompts = ['Steam Deck picks', 'Short games', 'Co-op night', 'Something cozy'];
  function submitTemporaryInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAddTemporaryInterest();
  }
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="qs-label-caps text-mint">Current mood</div>
      <h3 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Tell Questory what you are looking for right now.</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Temporary interests steer recommendations for 30 days. Remove one whenever the mood passes.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((prompt) => {
          const isSelected = temporaryTasteLabel.trim().toLocaleLowerCase() === prompt.toLocaleLowerCase();
          return (
            <button aria-pressed={isSelected} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition ${isSelected ? 'border-mint/50 bg-mint/15 text-mint' : 'border-skyglass/15 bg-ink-950/70 text-slate-300 hover:border-mint/35 hover:text-mint'}`} key={prompt} onClick={() => onTemporaryTasteLabelChange(isSelected ? '' : prompt)} type="button">
              {isSelected ? <Icon name="check" size={14} /> : null}{prompt}
            </button>
          );
        })}
      </div>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submitTemporaryInterest}>
        <label className="sr-only" htmlFor="temporary-taste-interest">Add a temporary interest</label>
        <input className="h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint" id="temporary-taste-interest" onChange={(event) => onTemporaryTasteLabelChange(event.target.value)} placeholder="Games under 15 hours, couch co-op..." value={temporaryTasteLabel} />
        <button className="h-11 rounded-md border border-mint/35 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:opacity-50" disabled={!temporaryTasteLabel.trim()} type="submit"><Icon className="mr-1 inline" name="plus" size={14} />Add mood</button>
      </form>
      <div className="mt-5 border-t border-skyglass/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">Active right now</div>
          <span className="text-xs text-slate-500">Each one expires automatically</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {temporaryTasteSignals.length > 0
            ? temporaryTasteSignals.map((signal) => <TemporaryTasteChip key={signal.id} onRemove={() => onRemoveTemporaryInterest(signal.id)} signal={signal} />)
            : <span className="text-sm text-slate-500">Nothing active. Your long-term taste still guides recommendations.</span>}
        </div>
      </div>
    </div>
  );
}

function FineTuneStep({
  editingTasteSignalId,
  explicitTasteSignals,
  lastAppliedCorrection,
  newTasteKind,
  newTasteLabel,
  newTasteSentiment,
  onAddManualTasteSignal,
  onCancelEditingTasteSignal,
  onEditExplicitTasteSignal,
  onExport,
  onNewTasteKindChange,
  onNewTasteLabelChange,
  onNewTasteSentimentChange,
  onRemoveExplicitTasteSignal,
  onRecompute,
  onResetExplicit,
  onResetInferred,
  onResetTemporary,
  onResetAll,
  tasteSuggestions,
}: {
  editingTasteSignalId: string | null;
  explicitTasteSignals: TasteSignal[];
  lastAppliedCorrection: string;
  newTasteKind: TasteSignalKind;
  newTasteLabel: string;
  newTasteSentiment: TasteSignalSentiment;
  onAddManualTasteSignal: () => void;
  onCancelEditingTasteSignal: () => void;
  onEditExplicitTasteSignal: (signal: TasteSignal) => void;
  onExport: () => void;
  onNewTasteKindChange: (kind: TasteSignalKind) => void;
  onNewTasteLabelChange: (value: string) => void;
  onNewTasteSentimentChange: (sentiment: TasteSignalSentiment) => void;
  onRemoveExplicitTasteSignal: (signalId: string) => void;
  onRecompute: () => void;
  onResetExplicit: () => void;
  onResetInferred: () => void;
  onResetTemporary: () => void;
  onResetAll: () => void;
  tasteSuggestions: TasteSuggestion[];
}) {
  const kindOptions: TasteSignalKind[] = ['tag', 'genre', 'developer', 'franchise', 'platform', 'length'];
  const matchingSuggestions = tasteSuggestions
    .filter((suggestion) => suggestion.kind === newTasteKind)
    .filter((suggestion) => !newTasteLabel.trim() || suggestion.label.toLocaleLowerCase().includes(newTasteLabel.trim().toLocaleLowerCase()))
    .slice(0, 6);
  const moreSignals = explicitTasteSignals.filter((signal) => signal.sentiment === 'love');
  const lessSignals = explicitTasteSignals.filter((signal) => signal.sentiment === 'avoid');

  function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAddManualTasteSignal();
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
      <div>
        <div className="qs-label-caps text-mint">Fine tune</div>
        <h3 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Tell Questory what it missed.</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
          Pick a kind, choose a suggestion or name one clear preference, then preview what recommendations will remember.
        </p>

        <form className="mt-5 grid gap-4 border-y border-skyglass/10 py-4" onSubmit={submitCorrection}>
          <fieldset>
            <legend className="text-xs font-bold uppercase text-slate-500">What kind of preference is it?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {kindOptions.map((kind) => (
                <button aria-pressed={newTasteKind === kind} className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${newTasteKind === kind ? 'border-mint/45 bg-mint/15 text-mint' : 'border-skyglass/15 text-slate-300 hover:border-mint/30 hover:text-white'}`} key={kind} onClick={() => onNewTasteKindChange(kind)} type="button">
                  {getTasteSignalKindLabel(kind)}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500" htmlFor="taste-correction-label">The preference</label>
            <input
              autoComplete="off"
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
              id="taste-correction-label"
              list="taste-correction-suggestions"
              onChange={(event) => onNewTasteLabelChange(event.target.value)}
              placeholder="Deckbuilders, tactical RPGs, FromSoftware..."
              value={newTasteLabel}
            />
            <datalist id="taste-correction-suggestions">
              {tasteSuggestions.filter((suggestion) => suggestion.kind === newTasteKind).slice(0, 80).map((suggestion) => <option key={`${suggestion.kind}:${suggestion.label}`} value={suggestion.label} />)}
            </datalist>
            {matchingSuggestions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2" aria-label={`${getTasteSignalKindLabel(newTasteKind)} suggestions`}>
                {matchingSuggestions.map((suggestion) => (
                  <button className="rounded-full border border-skyglass/15 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-mint/35 hover:text-mint" key={`${suggestion.kind}:${suggestion.label}`} onClick={() => onNewTasteLabelChange(suggestion.label)} type="button">{suggestion.label}</button>
                ))}
              </div>
            ) : null}
          </div>

          <fieldset>
            <legend className="text-xs font-bold uppercase text-slate-500">How should this shape recommendations?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-ink-900/70 p-1" role="group" aria-label="Preference direction">
              <button aria-pressed={newTasteSentiment === 'love'} className={`min-h-10 rounded-md px-3 text-sm font-semibold transition ${newTasteSentiment === 'love' ? 'bg-mint/15 text-mint shadow-panel' : 'text-slate-400 hover:text-white'}`} onClick={() => onNewTasteSentimentChange('love')} type="button"><Icon className="mr-1 inline" name="plus" size={14} />More of this</button>
              <button aria-pressed={newTasteSentiment === 'avoid'} className={`min-h-10 rounded-md px-3 text-sm font-semibold transition ${newTasteSentiment === 'avoid' ? 'bg-red-500/15 text-red-200 shadow-panel' : 'text-slate-400 hover:text-white'}`} onClick={() => onNewTasteSentimentChange('avoid')} type="button"><Icon className="mr-1 inline" name="eye-off" size={14} />Less of this</button>
            </div>
          </fieldset>

          {newTasteLabel.trim() ? (
            <div className={`rounded-md border px-3 py-3 ${newTasteSentiment === 'love' ? 'border-mint/25 bg-mint/10' : 'border-red-300/25 bg-red-500/10'}`} aria-live="polite">
              <div className="text-xs font-bold uppercase text-slate-400">Preview</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <strong className="break-words text-white">{newTasteLabel.trim()}</strong>
                <span className="text-xs text-slate-400">{getTasteSignalKindLabel(newTasteKind)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-300">Questory will look for {newTasteSentiment === 'love' ? 'more' : 'less'} of this in personalized recommendations.</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button className="h-11 rounded-md border border-mint/35 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:opacity-50" disabled={!newTasteLabel.trim()} type="submit">{editingTasteSignalId ? 'Update preference' : 'Remember this preference'}</button>
            {editingTasteSignalId ? <button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm font-semibold text-slate-300 transition hover:text-white" onClick={onCancelEditingTasteSignal} type="button">Cancel edit</button> : null}
          </div>
        </form>

        {lastAppliedCorrection ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-mint/25 bg-mint/10 px-3 py-2 text-sm font-semibold text-mint" role="status">
            <Icon name="check-circle" size={16} />Recommendations now remember {lastAppliedCorrection}.
          </div>
        ) : null}
      </div>

      <div className="border-l-0 border-skyglass/10 lg:border-l lg:pl-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">Preferences you set</div>
          <span className="text-xs text-slate-500">Explicitly added</span>
        </div>
        {explicitTasteSignals.length > 0 ? (
          <div className="mt-3 grid gap-4">
            <AppliedCorrectionGroup label="More of this" onEdit={onEditExplicitTasteSignal} onRemove={onRemoveExplicitTasteSignal} signals={moreSignals} tone="positive" />
            <AppliedCorrectionGroup label="Less of this" onEdit={onEditExplicitTasteSignal} onRemove={onRemoveExplicitTasteSignal} signals={lessSignals} tone="negative" />
          </div>
        ) : <p className="mt-3 text-sm leading-6 text-slate-500">No manual preferences yet. Add one and it will appear here immediately.</p>}

        <details className="mt-4 rounded-md border border-skyglass/15 bg-ink-900/60 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-300">Profile maintenance</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/35 hover:text-white" onClick={onRecompute} type="button">Recompute inferred taste</button>
            <button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/35 hover:text-white" onClick={onExport} type="button">Export</button>
            <button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white" onClick={onResetTemporary} type="button">Clear current mood</button>
            <button className="h-10 rounded-md border border-red-400/30 px-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10" onClick={onResetInferred} type="button">Clear inferred taste</button>
            <button className="h-10 rounded-md border border-red-400/30 px-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10 sm:col-span-2" onClick={onResetExplicit} type="button">Reset corrections</button>
            <button className="h-10 rounded-md border border-red-400/30 px-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10 sm:col-span-2" onClick={onResetAll} type="button">Reset all Taste Profile data</button>
          </div>
        </details>
      </div>
    </div>
  );
}

function SignalEvidenceCard({
  games,
  isFeature = false,
  rank,
  signal,
  onConfirm,
  onHide,
  onPin,
  onReject,
}: {
  games: Game[];
  isFeature?: boolean;
  rank?: number;
  signal: TasteSignal;
  onConfirm?: () => void;
  onHide?: () => void;
  onPin?: () => void;
  onReject?: () => void;
}) {
  const evidenceGames = getEvidenceGames(signal, games);
  return (
    <article className={`overflow-hidden rounded-lg border border-skyglass/15 bg-ink-950/75 ${isFeature ? 'min-h-64' : ''}`}>
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {rank ? <span className="rounded-full border border-mint/30 bg-mint/10 px-2 py-1 text-xs font-bold text-mint">#{rank}</span> : null}
            <span className="rounded-full border border-skyglass/15 px-2 py-1 text-xs font-semibold text-slate-400">{getTasteSignalOriginLabel(signal)}</span>
            <span className="rounded-full border border-skyglass/15 px-2 py-1 text-xs font-semibold text-slate-400">{getTasteSignalKindLabel(signal.kind)}</span>
            <span className="rounded-full border border-mint/25 bg-mint/10 px-2 py-1 text-xs font-semibold text-mint" title={`${Math.round(signal.confidence * 100)}% confidence`}>{getTasteConfidenceLabel(signal)}</span>
          </div>
          <h4 className="mt-3 break-words text-xl font-bold leading-6 text-white">{signal.label}</h4>
          <p className="mt-2 text-sm leading-6 text-slate-400">{getTasteBehaviorCopy(signal)}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-ink-900 px-2 py-1 text-slate-400">{getTasteEvidenceSummary(signal)}</span>
            <span className="rounded-full bg-ink-900 px-2 py-1 text-slate-400">{getTasteConsistencyLabel(signal)}</span>
          </div>
          {onConfirm || onReject || onPin || onHide ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {onConfirm ? <button className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20" onClick={onConfirm} type="button">Yes, that's me</button> : null}
              {onReject ? <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white" onClick={onReject} type="button">Not quite</button> : null}
              {onPin ? <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-300 transition hover:border-mint/35 hover:text-white" onClick={onPin} type="button">{signal.pinned ? 'Unkeep' : 'Keep this'}</button> : null}
              {onHide ? <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-400 transition hover:text-white" onClick={onHide} type="button">Hide</button> : null}
            </div>
          ) : null}
        </div>
        <EvidenceArtworkStrip evidenceGames={evidenceGames} signal={signal} />
      </div>
    </article>
  );
}

function EvidenceArtworkStrip({ evidenceGames, signal }: { evidenceGames: Game[]; signal: TasteSignal }) {
  if (evidenceGames.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center border-t border-skyglass/10 bg-ink-900/50 p-3 text-center text-xs leading-5 text-slate-500 md:border-l md:border-t-0">
        Evidence came from feedback or imported metadata.
      </div>
    );
  }
  return (
    <div className="grid min-h-48 grid-cols-3 gap-1 border-t border-skyglass/10 bg-ink-900/50 p-2 md:border-l md:border-t-0 md:grid-cols-1">
      {evidenceGames.slice(0, 3).map((game) => (
        <div className="relative min-h-24 overflow-hidden rounded-md bg-ink-950" key={game.id}>
          <img alt={game.title} className="h-full w-full object-cover" loading="lazy" src={getGameArtwork(game)} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/75 to-transparent p-2">
            <div className="line-clamp-2 text-[11px] font-semibold leading-tight text-white">{game.title}</div>
          </div>
        </div>
      ))}
      {evidenceGames.length < 3 && signal.evidence.gameTitles.slice(evidenceGames.length, 3).map((title) => (
        <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-skyglass/15 bg-ink-950/70 p-2 text-center text-[11px] font-semibold leading-tight text-slate-500" key={title}>
          {title}
        </div>
      ))}
    </div>
  );
}

function TasteSnapshotCard({ games, signal }: { games: Game[]; signal: TasteSignal }) {
  const evidenceGame = getEvidenceGames(signal, games)[0];
  return (
    <div className="overflow-hidden rounded-lg border border-skyglass/15 bg-ink-950/70">
      <div className="flex min-h-32 gap-3 p-3">
        <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-ink-900">
          {evidenceGame ? <img alt={evidenceGame.title} className="h-full w-full object-cover" src={getGameArtwork(evidenceGame)} /> : <div className="flex h-full items-center justify-center text-slate-700"><Icon name="sparkles" size={22} /></div>}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-semibold uppercase text-mint">{getTasteConfidenceLabel(signal)}</span>
            <span className="text-xs text-slate-500">{getTasteSignalKindLabel(signal.kind)}</span>
          </div>
          <div className="mt-1 line-clamp-2 break-words text-base font-bold leading-5 text-white" title={signal.label}>{signal.label}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{getTasteBehaviorCopy(signal)}</p>
          <p className="mt-1 text-[11px] text-slate-500">{getTasteEvidenceSummary(signal)}</p>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
    </div>
  );
}

function TasteChip({ signal }: { signal: TasteSignal }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${signal.sentiment === 'love' ? 'border-mint/30 bg-mint/10 text-mint' : 'border-red-300/30 bg-red-500/10 text-red-200'}`}>
      {signal.label}
    </span>
  );
}

function TemporaryTasteChip({ signal, onRemove }: { signal: TasteSignal; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-mint/30 bg-mint/10 py-1 pl-2.5 pr-1 text-xs font-semibold text-mint">
      <span className="min-w-0 break-words">{signal.label}</span>
      {signal.expiresAt ? <span className="hidden font-normal text-slate-400 sm:inline">until {new Date(signal.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> : null}
      <button
        aria-label={`Remove current mood ${signal.label}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-current opacity-70 transition hover:bg-white/10 hover:opacity-100"
        onClick={onRemove}
        title={`Remove ${signal.label}`}
        type="button"
      >
        <Icon name="x" size={12} />
      </button>
    </span>
  );
}

function AppliedCorrectionGroup({
  label,
  onEdit,
  onRemove,
  signals,
  tone,
}: {
  label: string;
  onEdit: (signal: TasteSignal) => void;
  onRemove: (signalId: string) => void;
  signals: TasteSignal[];
  tone: 'negative' | 'positive';
}) {
  if (signals.length === 0) return null;
  return (
    <section>
      <div className={`text-xs font-bold uppercase ${tone === 'positive' ? 'text-mint' : 'text-red-200'}`}>{label}</div>
      <div className="mt-2 divide-y divide-skyglass/10 border-y border-skyglass/10">
        {signals.map((signal) => (
          <div className="flex items-center gap-3 py-2.5" key={signal.id}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${tone === 'positive' ? 'bg-mint' : 'bg-red-300'}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="break-words text-sm font-semibold text-white">{signal.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{getTasteSignalKindLabel(signal.kind)} · Explicitly added</div>
            </div>
            <button aria-label={`Edit ${signal.label}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-skyglass/15 text-slate-400 transition hover:border-mint/35 hover:text-white" onClick={() => onEdit(signal)} title="Edit preference" type="button"><Icon name="pencil" size={14} /></button>
            <button aria-label={`Remove ${signal.label}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-skyglass/15 text-slate-400 transition hover:border-red-300/35 hover:text-red-200" onClick={() => onRemove(signal.id)} title="Remove preference" type="button"><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompletionSummaryItem({ label, signals, fallback }: { label: string; signals: TasteSignal[]; fallback: string }) {
  return (
    <div className="text-center sm:text-left">
      <div className="text-xs font-bold uppercase text-slate-500">{label}</div>
      <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-white">
        {signals.length > 0 ? signals.slice(0, 3).map((signal) => signal.label).join(', ') : fallback}
      </div>
    </div>
  );
}

function getHeroArtworkGames(signals: TasteSignal[], games: Game[]): Game[] {
  const picked: Game[] = [];
  for (const signal of signals) {
    for (const game of getEvidenceGames(signal, games)) {
      if (!picked.some((item) => item.id === game.id)) picked.push(game);
      if (picked.length >= 3) return picked;
    }
  }
  return games.filter((game) => getGameArtwork(game)).slice(0, 3);
}

function getEvidenceGames(signal: TasteSignal, games: Game[]): Game[] {
  const byId = new Map(games.map((game) => [game.id, game]));
  const fromIds = signal.evidence.gameIds.map((id) => byId.get(id)).filter((game): game is Game => Boolean(game));
  if (fromIds.length > 0) return fromIds;
  const titleSet = new Set(signal.evidence.gameTitles.map((title) => normalizeTitle(title)));
  return games.filter((game) => titleSet.has(normalizeTitle(game.title))).slice(0, 4);
}

function getGameArtwork(game: Game): string {
  return game.coverImage || game.backgroundImage || game.wideCoverImage || game.heroImage || '';
}

function getTasteSignalReviewKey(signal: TasteSignal): string {
  return `${signal.kind}:${signal.key}:${signal.sentiment}`;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
