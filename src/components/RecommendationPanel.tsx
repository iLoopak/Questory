import { useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { CollectionGrid, CollectionList, CollectionShelf } from './CollectionViews';
import { CollectionToolbar } from './CollectionToolbar';
import { ViewportModal } from './ViewportModal';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import {
  availableTimeOptions,
  getRecommendations,
  moodOptions,
  type AvailableTime,
  type RecommendationMood,
  type RecommendationPreferences,
} from '../lib/recommendationEngine';
import type { ReviewSource } from '../lib/reviewModeStorage';
import type { Game, GamePlatform, GameStatus } from '../types/game';
import { gamePlatforms } from '../types/game';

type RecommendationPanelProps = {
  games: Game[];
  queueState: PlatformQueueState;
  onAddToQueue: (game: Game) => void;
  onAddToWishlist: (game: Game) => void;
  onMoveToLibrary: (game: Game) => void;
  onFindMetadata?: (game: Game) => void;
  onOpenDetails: (gameId: string) => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStartReview: (source: ReviewSource) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
};

type RecommendationViewMode = 'Grid View' | 'Shelf View' | 'Compact View';

const anyPlatform = 'Any';
const recommendationViewModes: readonly RecommendationViewMode[] = ['Grid View', 'Shelf View', 'Compact View'];

export function RecommendationPanel({
  games,
  queueState,
  onAddToQueue,
  onAddToWishlist,
  onMoveToLibrary,
  onFindMetadata,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStartReview,
  onStatusChange,
}: RecommendationPanelProps) {
  const { t } = useI18n();
  const [availableTime, setAvailableTime] = useState<AvailableTime>('30 min');
  const [mood, setMood] = useState<RecommendationMood>('comfort');
  const [preferredPlatform, setPreferredPlatform] = useState<GamePlatform | typeof anyPlatform>(anyPlatform);
  const [includeFinishedGames, setIncludeFinishedGames] = useState(false);
  const [includeWishlist, setIncludeWishlist] = useState(false);
  const [recommendFromQueueOnly, setRecommendFromQueueOnly] = useState(false);
  const [recommendNextGame, setRecommendNextGame] = useState(false);
  const [rerollIndex, setRerollIndex] = useState(0);
  const [recommendationSearchTerm, setRecommendationSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<RecommendationViewMode>('Grid View');
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const moreFiltersButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreFiltersCloseRef = useRef<HTMLButtonElement | null>(null);
  const queuedGameIds = useMemo(() => new Set(queueState.entries.map((entry) => entry.gameId)), [queueState.entries]);
  const platformOptions = useMemo(() => {
    return Array.from(new Set([...gamePlatforms, ...games.map((game) => game.platform)])).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const preferences: RecommendationPreferences = {
    availableTime,
    includeFinishedGames,
    includeWishlist,
    mood,
    preferredPlatform,
  };

  const recommendationGames = useMemo(() => {
    if (recommendNextGame) {
      const nextEntry = [...queueState.entries].sort((first, second) => first.queuePosition - second.queuePosition)[0];
      const nextGame = nextEntry ? games.find((game) => game.id === nextEntry.gameId) : null;
      return nextGame ? [nextGame] : [];
    }

    const sourceGames = recommendFromQueueOnly ? games.filter((game) => queuedGameIds.has(game.id)) : games;
    const normalizedSearch = recommendationSearchTerm.trim().toLowerCase();

    return sourceGames.filter((game) =>
      normalizedSearch ? `${game.title} ${game.platform} ${game.status}`.toLowerCase().includes(normalizedSearch) : true,
    );
  }, [games, queueState.entries, queuedGameIds, recommendFromQueueOnly, recommendNextGame, recommendationSearchTerm]);

  const recommendations = useMemo(() => getRecommendations(recommendationGames, preferences), [recommendationGames, preferences]);
  const recommendation = recommendations.length > 0 ? recommendations[rerollIndex % recommendations.length] : null;
  const recommendedGameIds = useMemo(() => new Set(recommendations.map((currentRecommendation) => currentRecommendation.game.id)), [recommendations]);
  const recommendationResults = useMemo(() => {
    if (!recommendation) {
      return recommendations.map((currentRecommendation) => currentRecommendation.game);
    }

    return [
      recommendation.game,
      ...recommendations
        .map((currentRecommendation) => currentRecommendation.game)
        .filter((game) => game.id !== recommendation.game.id),
    ];
  }, [recommendation, recommendations]);
  const activeMoreFilterCount = [includeFinishedGames, includeWishlist, recommendFromQueueOnly, recommendNextGame].filter(Boolean).length;

  function updatePreference(update: () => void) {
    update();
    setRerollIndex(0);
  }

  function getHighlightLabel(game: Game) {
    if (recommendation?.game.id === game.id) {
      return '🎯 Recommended Today';
    }

    if (recommendedGameIds.has(game.id)) {
      return '⭐ Recommended';
    }

    return undefined;
  }

  return (
    <section className="qs-content-panel qs-glass min-w-0 rounded-lg border p-2 sm:p-3 lg:h-[calc(100vh-74px)] lg:overflow-y-auto">
      <CollectionToolbar
        title={t('recommendations.title')}
        searchValue={recommendationSearchTerm}
        searchPlaceholder={t('toolbar.findTitle')}
        onSearchChange={setRecommendationSearchTerm}
        selects={[
          {
            label: t('toolbar.status'),
            value: availableTime,
            options: availableTimeOptions,
            onChange: (value) => updatePreference(() => setAvailableTime(value as AvailableTime)),
          },
          {
            label: t('toolbar.platform'),
            value: preferredPlatform,
            options: [anyPlatform, ...platformOptions],
            onChange: (value) => updatePreference(() => setPreferredPlatform(value as GamePlatform | typeof anyPlatform)),
          },
        ]}
        moreFiltersActiveCount={activeMoreFilterCount}
        moreFiltersOpen={isMoreFiltersOpen}
        moreFiltersButtonRef={moreFiltersButtonRef}
        onMoreFiltersClick={() => setIsMoreFiltersOpen(true)}
        viewMode={{
          label: `${t('recommendations.title')} ${t('toolbar.viewMode')}`,
          options: recommendationViewModes,
          value: viewMode,
          onChange: (mode) => setViewMode(mode as RecommendationViewMode),
        }}
        actionMenu={
          <>
            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={() => setRerollIndex((currentIndex) => currentIndex + 1)}
              type="button"
            >
              Reroll recommendation
            </button>
            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={() => onStartReview(includeWishlist ? 'wishlist' : 'backlog')}
              type="button"
            >
              Send pool to Review Mode
            </button>
          </>
        }
      />

      {isMoreFiltersOpen ? (
        <ViewportModal
          ariaLabel="Recommendations filters"
          initialFocusRef={moreFiltersCloseRef}
          restoreFocusRef={moreFiltersButtonRef}
          onClose={() => setIsMoreFiltersOpen(false)}
        >
          <div className="flex items-center justify-between gap-3 border-b border-skyglass/15 bg-ink-950/90 p-3">
              <div>
                <h3 className="text-base font-semibold text-white">Recommendations filters</h3>
                <p className="mt-0.5 text-xs text-slate-400">Tune the same result list without switching to a custom recommendation layout.</p>
              </div>
              <button
                ref={moreFiltersCloseRef}
                className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
                onClick={() => setIsMoreFiltersOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="max-h-[min(72dvh,28rem)] overflow-y-auto p-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Mood</div>
                <div className="mt-2 flex gap-1 overflow-x-auto rounded-md border border-white/10 bg-ink-900 p-1">
                  {moodOptions.map((option) => (
                    <button
                      key={option}
                      className={`h-9 shrink-0 rounded px-3 text-sm font-medium transition ${
                        option === mood ? 'bg-mint text-ink-950 shadow-glow' : 'text-slate-300 hover:bg-mint/10 hover:text-white'
                      }`}
                      onClick={() => updatePreference(() => setMood(option))}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <RecommendationToggle checked={includeFinishedGames} label="Finished" onChange={(checked) => updatePreference(() => setIncludeFinishedGames(checked))} />
                <RecommendationToggle checked={includeWishlist} label="Wishlist" onChange={(checked) => updatePreference(() => setIncludeWishlist(checked))} />
                <RecommendationToggle checked={recommendFromQueueOnly} label="Queue only" onChange={(checked) => updatePreference(() => setRecommendFromQueueOnly(checked))} />
                <RecommendationToggle checked={recommendNextGame} label="Next planned" onChange={(checked) => updatePreference(() => setRecommendNextGame(checked))} />
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90"
                  onClick={() => setIsMoreFiltersOpen(false)}
                  type="button"
                >
                  Show games
                </button>
              </div>
          </div>
        </ViewportModal>
      ) : null}


      {recommendationResults.length > 0 ? (
        viewMode === 'Shelf View' ? (
          <CollectionShelf
            games={recommendationResults}
            getHighlightLabel={getHighlightLabel}
            includeDetailsAction
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
            onRemoveAndIgnore={onRemoveAndIgnore}
            onStatusChange={onStatusChange}
            platformQueueState={queueState}
          />
        ) : viewMode === 'Compact View' ? (
          <CollectionList
            games={recommendationResults}
            getHighlightLabel={getHighlightLabel}
            includeDetailsAction
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
            onRemoveAndIgnore={onRemoveAndIgnore}
            onStatusChange={onStatusChange}
            platformQueueState={queueState}
          />
        ) : (
          <CollectionGrid
            games={recommendationResults}
            getHighlightLabel={getHighlightLabel}
            includeDetailsAction
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
            onRemoveAndIgnore={onRemoveAndIgnore}
            onStatusChange={onStatusChange}
            platformQueueState={queueState}
          />
        )
      ) : (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-skyglass/20 bg-ink-950/60 p-4 text-center">
          <div>
            <h3 className="text-lg font-semibold text-white">{t('recommendations.emptyTitle')}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{t('recommendations.emptyText')}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function RecommendationToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
      <input checked={checked} className="h-4 w-4 accent-mint" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}
