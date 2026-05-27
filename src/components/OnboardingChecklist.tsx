import type { OnboardingItemId } from '../lib/onboardingStorage';

type OnboardingChecklistItem = {
  actionLabel?: string;
  description: string;
  helpHref?: string;
  helpLabel?: string;
  id: OnboardingItemId;
  title: string;
};

type OnboardingChecklistProps = {
  completedItemIds: Set<OnboardingItemId>;
  isSettingsPanel?: boolean;
  onAction: (itemId: OnboardingItemId) => void;
  onClose?: () => void;
  onSkip?: () => void;
};

const onboardingItems: OnboardingChecklistItem[] = [
  {
    id: 'manual-game',
    title: 'Add first game manually',
    description: 'Create one local entry so QuestShelf has something to track.',
    actionLabel: 'Add game',
  },
  {
    id: 'steam-api-key',
    title: 'Configure Steam API key',
    description: 'Paste your personal Steam Web API key in Settings.',
    helpHref: 'https://steamcommunity.com/dev/apikey',
    helpLabel: 'Get Steam API key',
    actionLabel: 'Open Settings',
  },
  {
    id: 'steam-id64',
    title: 'Add SteamID64',
    description: 'Use the numeric SteamID64 for the profile you want to import.',
    helpHref: 'https://www.steamidfinder.com/',
    helpLabel: 'Look up SteamID64',
    actionLabel: 'Open Settings',
  },
  {
    id: 'steam-test',
    title: 'Test Steam connection',
    description: 'Confirm credentials, privacy, and the local proxy are working.',
    actionLabel: 'Open Settings',
  },
  {
    id: 'steam-import',
    title: 'Import Steam library',
    description: 'Select Steam games from the preview and import them locally.',
    actionLabel: 'Open Settings',
  },
  {
    id: 'rawg-api-key',
    title: 'Configure RAWG API key',
    description: 'Add a RAWG key for optional metadata enrichment.',
    helpHref: 'https://rawg.io/apidocs',
    helpLabel: 'Get RAWG API key',
    actionLabel: 'Open Settings',
  },
  {
    id: 'metadata-enriched',
    title: 'Enrich metadata',
    description: 'Attach RAWG metadata to at least one library or wishlist item.',
    actionLabel: 'Open Metadata',
  },
  {
    id: 'wishlist-item',
    title: 'Create wishlist item',
    description: 'Add one future game to the Wishlist collection.',
    actionLabel: 'Add wishlist',
  },
  {
    id: 'backup-exported',
    title: 'Export backup',
    description: 'Download a JSON backup before moving between devices.',
    actionLabel: 'Open Settings',
  },
];

export function OnboardingChecklist({
  completedItemIds,
  isSettingsPanel = false,
  onAction,
  onClose,
  onSkip,
}: OnboardingChecklistProps) {
  const completedCount = onboardingItems.filter((item) => completedItemIds.has(item.id)).length;

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">First-run checklist</div>
          <h2 className="mt-1 text-xl font-semibold text-white">Set up QuestShelf</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Complete the essentials at your pace. Credentials stay local; do not paste API keys into docs or code.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="grid h-10 place-items-center rounded-md border border-skyglass/15 bg-ink-950 px-3 text-sm text-slate-300">
            {completedCount}/{onboardingItems.length}
          </span>
          {onClose ? (
            <button
              className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Hide
            </button>
          ) : null}
          {onSkip ? (
            <button
              className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={onSkip}
              type="button"
            >
              Skip
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 xl:grid-cols-3">
        {onboardingItems.map((item) => {
          const isComplete = completedItemIds.has(item.id);

          return (
            <article
              key={item.id}
              className={`rounded-md border p-3 ${
                isComplete ? 'border-mint/30 bg-mint/10' : 'border-skyglass/15 bg-ink-950/80'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                    isComplete ? 'border-mint bg-mint text-ink-950' : 'border-skyglass/30 text-slate-400'
                  }`}
                >
                  {isComplete ? 'OK' : ''}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 pl-9">
                {item.actionLabel && !isComplete ? (
                  <button
                    className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-xs font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
                    onClick={() => onAction(item.id)}
                    type="button"
                  >
                    {item.actionLabel}
                  </button>
                ) : null}
                {item.helpHref ? (
                  <a
                    className="grid h-9 place-items-center rounded-md border border-skyglass/15 px-3 text-xs font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
                    href={item.helpHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {item.helpLabel}
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {isSettingsPanel ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Reopening this panel never changes stored credentials. Checklist progress is saved only in local QuestShelf data.
        </p>
      ) : null}
    </section>
  );
}
