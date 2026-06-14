import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { CollectionGrid, CollectionList, CollectionShelf } from './CollectionViews';
import { CollectionToolbar } from './CollectionToolbar';
import { Icon } from './Icon';
import { GameListEmptyState, GameListShell } from './GameListShell';
import { ViewportModal } from './ViewportModal';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import type { QuestShelfAchievementProgress } from '../lib/questShelfAchievements';
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
  activeAchievement?: QuestShelfAchievementProgress | null;
  featuredGame?: Game | null;
  onOpenAchievementSettings?: () => void;
  shelfTitle?: string;
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
  activeAchievement = null,
  featuredGame = null,
  onOpenAchievementSettings,
  shelfTitle = '',
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
  const panelRef = useRef<HTMLElement | null>(null);
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
  const activeMoreFilterCount = [
    availableTime !== '30 min',
    includeFinishedGames,
    includeWishlist,
    mood !== 'comfort',
    preferredPlatform !== anyPlatform,
    recommendFromQueueOnly,
    recommendNextGame,
    viewMode !== 'Grid View',
  ].filter(Boolean).length;
  const hasActiveMoreFilters = activeMoreFilterCount > 0;

  function clearMoreFilters() {
    setAvailableTime('30 min');
    setMood('comfort');
    setPreferredPlatform(anyPlatform);
    setIncludeFinishedGames(false);
    setIncludeWishlist(false);
    setRecommendFromQueueOnly(false);
    setRecommendNextGame(false);
    setViewMode('Grid View');
    setRerollIndex(0);
  }

  function updatePreference(update: () => void) {
    update();
    setRerollIndex(0);
  }

  function getHighlightLabel(game: Game) {
    if (recommendation?.game.id === game.id) {
      return 'Recommended Today';
    }

    if (recommendedGameIds.has(game.id)) {
      return 'Recommended';
    }

    return undefined;
  }

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [availableTime, includeFinishedGames, includeWishlist, mood, preferredPlatform, recommendationSearchTerm, recommendFromQueueOnly, recommendNextGame, viewMode]);

  return (
    <GameListShell
      scrollRef={panelRef}
      stickyChrome={
        <>
        <CollectionToolbar
          title={t('recommendations.title')}
        searchValue={recommendationSearchTerm}
        searchPlaceholder={t('toolbar.findTitle')}
        onSearchChange={setRecommendationSearchTerm}
        moreFiltersActiveCount={activeMoreFilterCount}
        moreFiltersOpen={isMoreFiltersOpen}
        moreFiltersButtonRef={moreFiltersButtonRef}
        onMoreFiltersClick={() => setIsMoreFiltersOpen(true)}
        onClearFilters={hasActiveMoreFilters ? clearMoreFilters : undefined}
        leadingAccessory={
          activeAchievement || featuredGame ? (
          <RecommendationToolbarHighlights
            activeAchievement={activeAchievement}
            featuredGame={featuredGame}
            onOpenAchievementSettings={onOpenAchievementSettings}
            onOpenDetails={onOpenDetails}
          />
          ) : null
        }
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
              Send pool to Quest Queue
            </button>
          </>
        }
      />
        </>
      }
    >

      {isMoreFiltersOpen ? (
        <ViewportModal
          ariaLabel="Recommendations filters"
          initialFocusRef={moreFiltersCloseRef}
          restoreFocusRef={moreFiltersButtonRef}
          onClose={() => setIsMoreFiltersOpen(false)}
        >
          <div className="flex items-center justify-between gap-3 border-b border-skyglass/15 bg-ink-950/90 p-3">
              <div>
                <h3 className="text-base font-semibold text-white">{t('recommendations.filters')}</h3>
                <p className="mt-0.5 text-xs text-slate-400">{t('recommendations.filtersHelp')}</p>
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
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium text-slate-300">
                  <span>{t('toolbar.status')}</span>
                  <select className="mt-1 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint" value={availableTime} onChange={(event) => updatePreference(() => setAvailableTime(event.target.value as AvailableTime))}>
                    {availableTimeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-300">
                  <span>{t('toolbar.platform')}</span>
                  <select className="mt-1 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint" value={preferredPlatform} onChange={(event) => updatePreference(() => setPreferredPlatform(event.target.value as GamePlatform | typeof anyPlatform))}>
                    {[anyPlatform, ...platformOptions].map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-300">
                  <span>{t('toolbar.viewMode')}</span>
                  <select className="mt-1 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint" value={viewMode} onChange={(event) => setViewMode(event.target.value as RecommendationViewMode)}>
                    {recommendationViewModes.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('recommendations.mood')}</div>
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
                <RecommendationToggle checked={includeFinishedGames} label={t('recommendations.includeFinished')} onChange={(checked) => updatePreference(() => setIncludeFinishedGames(checked))} />
                <RecommendationToggle checked={includeWishlist} label={t('recommendations.includeWishlist')} onChange={(checked) => updatePreference(() => setIncludeWishlist(checked))} />
                <RecommendationToggle checked={recommendFromQueueOnly} label={t('recommendations.platformsOnly')} onChange={(checked) => updatePreference(() => setRecommendFromQueueOnly(checked))} />
                <RecommendationToggle checked={recommendNextGame} label={t('recommendations.nextPlanned')} onChange={(checked) => updatePreference(() => setRecommendNextGame(checked))} />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-400">
                  {hasActiveMoreFilters ? `${activeMoreFilterCount} ${activeMoreFilterCount === 1 ? 'filter' : 'filters'} active` : 'No filters active'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {hasActiveMoreFilters ? (
                    <button
                      className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
                      onClick={clearMoreFilters}
                      type="button"
                    >
                      Clear filters
                    </button>
                  ) : null}
                <button
                  className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90"
                  onClick={() => setIsMoreFiltersOpen(false)}
                  type="button"
                >
                  Show games
                </button>
                </div>
              </div>
          </div>
        </ViewportModal>
      ) : null}


      {recommendationResults.length > 0 ? (
        viewMode === 'Shelf View' ? (
          <CollectionShelf
            debugLabel="recommendations shelf"
            games={recommendationResults}
            getHighlightLabel={getHighlightLabel}
            hideRecommendationBadge
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
            scrollElementRef={panelRef}
          />
        ) : viewMode === 'Compact View' ? (
          <CollectionList
            debugLabel="recommendations compact"
            games={recommendationResults}
            getHighlightLabel={getHighlightLabel}
            hideRecommendationBadge
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
            scrollElementRef={panelRef}
          />
        ) : (
          <CollectionGrid
            debugLabel="recommendations grid"
            games={recommendationResults}
            getHighlightLabel={getHighlightLabel}
            hideRecommendationBadge
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
            scrollElementRef={panelRef}
          />
        )
      ) : (
        <GameListEmptyState title={t('recommendations.emptyTitle')} text={t('recommendations.emptyText')} />
      )}
    </GameListShell>
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

function RecommendationToolbarHighlights({
  activeAchievement,
  featuredGame,
  onOpenAchievementSettings,
  onOpenDetails,
}: {
  activeAchievement?: QuestShelfAchievementProgress | null;
  featuredGame?: Game | null;
  onOpenAchievementSettings?: () => void;
  onOpenDetails: (gameId: string) => void;
}) {
  if (!activeAchievement && !featuredGame) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
      {activeAchievement ? <RecommendationAchievementBadge achievement={activeAchievement} onClick={onOpenAchievementSettings} /> : null}
      {featuredGame ? (
        <button
          className="inline-flex h-9 min-w-0 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full border border-skyglass/15 bg-ink-900/70 px-2.5 text-xs font-semibold text-slate-300 transition hover:border-mint/30 hover:bg-mint/10 hover:text-mint focus:outline-none focus:ring-2 focus:ring-mint/60"
          onClick={() => onOpenDetails(featuredGame.id)}
          title={`Featured: ${featuredGame.title}`}
          type="button"
        >
          <Icon name="check-circle" size={14} />
          <span className="truncate">Featured: {featuredGame.title}</span>
        </button>
      ) : null}
    </div>
  );
}

function RecommendationAchievementBadge({ achievement, onClick }: { achievement: QuestShelfAchievementProgress; onClick?: () => void }) {
  const content = (
    <>
      <Icon name={achievement.icon} size={15} strokeWidth={2.2} />
      <span className="truncate">{achievement.title}</span>
    </>
  );
  const className = "inline-flex h-9 min-w-0 max-w-[12rem] shrink-0 items-center gap-1.5 rounded-full border border-mint/35 bg-mint/10 px-2.5 text-xs font-semibold text-mint shadow-glow transition focus:outline-none focus:ring-2 focus:ring-mint/60";

  if (!onClick) {
    return <span className={className} title={achievement.title}>{content}</span>;
  }

  return (
    <button className={`${className} hover:bg-mint/20`} onClick={onClick} title={`${achievement.title} - choose active badge`} type="button">
      {content}
    </button>
  );
}
