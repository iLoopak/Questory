import { useMemo } from 'react';
import { onboardingItemIds, type OnboardingItemId } from '../lib/onboardingStorage';
import { useI18n } from '../i18n';

type OnboardingWizardStep = {
  actionLabel: string;
  description: string;
  id: (typeof onboardingItemIds)[number];
  secondaryActionLabel?: string;
  title: string;
  value: string;
};

type OnboardingChecklistProps = {
  completedItemIds: Set<OnboardingItemId>;
  isSettingsPanel?: boolean;
  onAction: (itemId: OnboardingItemId, action?: 'primary' | 'secondary') => void;
  onClose?: () => void;
  onComplete: (itemId: OnboardingItemId) => void;
  onSkip: (itemId: OnboardingItemId) => void;
  skippedItemIds: Set<OnboardingItemId>;
};

export const onboardingWizardSteps: OnboardingWizardStep[] = [
  {
    id: 'steam-connect',
    title: 'Connect Steam',
    description: 'Import your existing library automatically when you are ready.',
    actionLabel: 'Connect Steam',
    value: 'Automatic library import',
  },
  {
    id: 'platforms',
    title: 'Choose Platforms',
    description: 'Select the devices and stores you actively use.',
    actionLabel: 'Save Platforms',
    value: 'Personalized queues',
  },
  {
    id: 'queue-game',
    title: 'Add Your First Queue Game',
    description: 'Pick one game you want to play next.',
    actionLabel: 'Add Game',
    value: 'Know what to play next',
  },
  {
    id: 'retro-import',
    title: 'Import Retro Collection',
    description: 'Scan ROM folders from Settings whenever you want.',
    actionLabel: 'Select Folder',
    value: 'Retro shelves ready',
  },
  {
    id: 'ready',
    title: "You're Ready",
    description: 'QuestShelf is configured. Jump into your Library or Queue.',
    actionLabel: 'Open Library',
    secondaryActionLabel: 'Open Queue',
    value: 'Start playing',
  },
];

export function OnboardingChecklist({
  completedItemIds,
  isSettingsPanel = false,
  onAction,
  onClose,
  onComplete,
  onSkip,
  skippedItemIds,
}: OnboardingChecklistProps) {
  const { t } = useI18n();
  const totalSteps = onboardingWizardSteps.length;
  const finishedCount = onboardingWizardSteps.filter(
    (step) => completedItemIds.has(step.id) || skippedItemIds.has(step.id),
  ).length;
  const completedCount = onboardingWizardSteps.filter((step) => completedItemIds.has(step.id)).length;
  const activeStep = useMemo(() => {
    return (
      onboardingWizardSteps.find((step) => !completedItemIds.has(step.id) && !skippedItemIds.has(step.id)) ??
      onboardingWizardSteps.find((step) => !completedItemIds.has(step.id)) ??
      onboardingWizardSteps[onboardingWizardSteps.length - 1]
    );
  }, [completedItemIds, skippedItemIds]);
  const activeStepIndex = onboardingWizardSteps.findIndex((step) => step.id === activeStep.id);
  const stepNumber = Math.max(1, activeStepIndex + 1);
  const progressPercent = Math.round((finishedCount / totalSteps) * 100);
  const skippedSteps = onboardingWizardSteps.filter((step) => skippedItemIds.has(step.id) && !completedItemIds.has(step.id));

  function handlePrimaryAction() {
    onAction(activeStep.id, 'primary');
    onComplete(activeStep.id);
  }

  function handleSecondaryAction() {
    onAction(activeStep.id, 'secondary');
    onComplete(activeStep.id);
  }

  return (
    <section className={`qs-setup-card rounded-lg border p-4 ${isSettingsPanel ? '' : 'shadow-panel'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{t('onboarding.assistant')}</div>
          <h2 className="mt-1 text-lg font-semibold text-white">Guided setup</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">One quick step at a time. Skip anything and finish it later in Settings.</p>
        </div>

        {onClose ? (
          <button
            className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            Hide
          </button>
        ) : null}
      </div>

      <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/70 p-3">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          <span>{`Step ${stepNumber} of ${totalSteps}`}</span>
          <span>{`${progressPercent}%`}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <article className="mt-4 rounded-lg border border-mint/25 bg-ink-950/80 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{activeStep.value}</div>
        <h3 className="mt-2 text-2xl font-semibold text-white">{activeStep.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{activeStep.description}</p>

        <div className="mt-5 grid gap-2 sm:grid-cols-[auto_auto_1fr] sm:items-center">
          <button
            className="min-h-12 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            onClick={handlePrimaryAction}
            type="button"
          >
            {activeStep.actionLabel}
          </button>

          {activeStep.secondaryActionLabel ? (
            <button
              className="min-h-12 rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              onClick={handleSecondaryAction}
              type="button"
            >
              {activeStep.secondaryActionLabel}
            </button>
          ) : null}

          <button
            className="min-h-12 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint sm:justify-self-end"
            onClick={() => onSkip(activeStep.id)}
            type="button"
          >
            Skip
          </button>
        </div>
      </article>

      {isSettingsPanel && skippedSteps.length > 0 ? (
        <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/70 p-3">
          <div className="text-sm font-semibold text-white">Skipped steps available later</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {skippedSteps.map((step) => (
              <span key={step.id} className="rounded-full border border-skyglass/15 px-3 py-1 text-xs text-slate-300">
                {step.title}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 text-xs leading-5 text-slate-500">
        {`${completedCount} completed · ${skippedSteps.length} skipped`}
      </div>
    </section>
  );
}
