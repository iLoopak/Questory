import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import { compareQueueEntries, type PlatformQueueEntry, type PlatformQueueState } from '../lib/platformQueueStorage';
import { scoreGame } from '../lib/recommendationEngine';
import type { ReviewSource } from '../lib/reviewModeStorage';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState } from '../types/steam';
import type { Game, GamePlatform } from '../types/game';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { PlatformBadge } from './PlatformBadge';

type HomePanelProps = {
  appTitle?: string;
  avatar?: ReactNode;
  shelfTitle?: string;
  featuredGame?: Game | null;
  games: Game[];
  ignoredReviewGameIds: Set<string>;
  queueState: PlatformQueueState;
  steamAchievementSyncState?: SteamAchievementSyncState;
  steamPlaytimeRefreshState?: SteamPlaytimeRefreshState;
  onOpenDetails: (game: Game) => void;
  onOpenLibrary: () => void;
  onOpenQueue: (platform?: GamePlatform) => void;
  onOpenReviewMode: (source: ReviewSource) => void;
  onOpenWishlist: () => void;
  onSyncSteamData?: () => void;
};

type QueuePreview = {
  entries: Array<{ entry: PlatformQueueEntry; game: Game }>;
  platform: GamePlatform;
  totalCount: number;
};

const focusSelector = '[data-home-focus="true"]';

export function HomePanel({
  appTitle = 'QuestShelf',
  avatar,
  shelfTitle = '',
  featuredGame = null,
  games,
  ignoredReviewGameIds,
  queueState,
  steamAchievementSyncState,
  steamPlaytimeRefreshState,
  onOpenDetails,
  onOpenLibrary,
  onOpenQueue,
  onOpenReviewMode,
  onOpenWishlist,
  onSyncSteamData,
}: HomePanelProps) {
  const { t } = useI18n();
  const queueEntries = queueState.entries;
  const shellRef = useRef<HTMLElement | null>(null);
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const libraryGames = useMemo(() => games.filter((game) => game.collectionType === 'library'), [games]);

  const continuePlayingGames = useMemo(() => {
    return libraryGames
      .filter((game) => game.status === 'Playing')
      .sort((firstGame, secondGame) => getActivityTime(secondGame) - getActivityTime(firstGame))
      .slice(0, 4);
  }, [libraryGames]);

  const activeQueuePreviews = useMemo<QueuePreview[]>(() => {
    const groupedEntries = new Map<GamePlatform, PlatformQueueEntry[]>();

    queueEntries.forEach((entry) => {
      const game = gamesById.get(entry.gameId);
      if (!game) {
        return;
      }

      const platformEntries = groupedEntries.get(entry.targetPlatform) ?? [];
      platformEntries.push(entry);
      groupedEntries.set(entry.targetPlatform, platformEntries);
    });

    return Array.from(groupedEntries.entries())
      .map(([platform, entries]) => ({
        entries: entries
          .sort(compareQueueEntries)
          .slice(0, 2)
          .map((entry) => ({ entry, game: gamesById.get(entry.gameId) as Game })),
        platform,
        totalCount: entries.length,
      }))
      .sort((firstQueue, secondQueue) => {
        const firstEntry = firstQueue.entries[0]?.entry;
        const secondEntry = secondQueue.entries[0]?.entry;
        return (firstEntry?.queuePosition ?? 99) - (secondEntry?.queuePosition ?? 99) || secondQueue.totalCount - firstQueue.totalCount;
      })
      .slice(0, 3);
  }, [gamesById, queueEntries]);

  const queueSnapshot = useMemo(() => {
    const platformCounts = new Map<GamePlatform, number>();
    queueEntries.forEach((entry) => platformCounts.set(entry.targetPlatform, (platformCounts.get(entry.targetPlatform) ?? 0) + 1));

    return Array.from(platformCounts.entries())
      .map(([platform, count]) => ({ count, platform }))
      .sort((first, second) => second.count - first.count || first.platform.localeCompare(second.platform))
      .slice(0, 5);
  }, [queueEntries]);

  const wishlistHighlight = useMemo(() => pickWishlistHighlight(games), [games]);

  const recentlyAddedGames = useMemo(() => {
    return games
      .filter((game) => game.collectionType === 'library' && (game.importedAt || game.updatedAt))
      .sort((firstGame, secondGame) => getRecentTime(secondGame) - getRecentTime(firstGame))
      .slice(0, 4);
  }, [games]);

  const reviewRemainingCount = useMemo(() => {
    return games.filter((game) => isBacklogReviewCandidate(game) && !ignoredReviewGameIds.has(game.id)).length;
  }, [games, ignoredReviewGameIds]);

  const hasSteamGames = useMemo(() => games.some((g) => g.steamAppId != null), [games]);

  const lastPlaytimeSyncAt = useMemo(() => {
    const times = games
      .filter((g) => g.steamAppId != null && g.lastSteamActivityAt)
      .map((g) => g.lastSteamActivityAt as string);
    return times.length > 0 ? times.reduce((a, b) => (a > b ? a : b)) : null;
  }, [games]);

  const lastAchievementSyncAt = useMemo(() => {
    const times = games
      .filter((g) => g.steamAchievementsLastCheckedAt != null)
      .map((g) => g.steamAchievementsLastCheckedAt as number);
    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }, [games]);

  const activePlayingPlatforms = useMemo(() => {
    const platformCounts = new Map<GamePlatform, number>();
    continuePlayingGames.forEach((g) => {
      platformCounts.set(g.platform, (platformCounts.get(g.platform) ?? 0) + 1);
    });
    return Array.from(platformCounts.entries()).map(([platform, count]) => ({ count, platform }));
  }, [continuePlayingGames]);

  const isSteamSyncing =
    steamAchievementSyncState?.status === 'loading' || steamPlaytimeRefreshState?.status === 'loading';

  const recommendedToday = useMemo(() => {
    const queuedGameIds = new Set(queueEntries.map((entry) => entry.gameId));
    const activePlatforms = new Set<string>([
      ...continuePlayingGames.map((game) => game.platform),
      ...queueEntries.map((entry) => entry.targetPlatform),
    ]);

    return libraryGames
      .filter((game) => game.status !== 'Finished' && game.status !== 'Dropped')
      .map((game) => {
        const scoredGame = scoreGame(game, {
          availableTime: '30 min',
          includeFinishedGames: false,
          includeWishlist: false,
          mood: 'comfort',
          preferredPlatform: 'Any',
        });
        const queueBoost = queuedGameIds.has(game.id) ? 42 : 0;
        const playingBoost = game.status === 'Playing' ? 34 : 0;
        const activePlatformBoost = activePlatforms.has(game.platform) ? 10 : 0;

        return {
          ...scoredGame,
          reasons: [
            queuedGameIds.has(game.id) ? t('home.nextInPlatforms') : null,
            game.status === 'Playing' ? t('home.alreadyInProgress') : null,
            activePlatforms.has(game.platform) ? `${t('home.fitsActivePlay')}: ${game.platform}` : null,
            ...scoredGame.reasons,
          ].filter((reason): reason is string => Boolean(reason)).slice(0, 3),
          score: scoredGame.score + queueBoost + playingBoost + activePlatformBoost,
        };
      })
      .sort((first, second) => second.score - first.score)
      .slice(0, 3);
  }, [continuePlayingGames, libraryGames, queueEntries, t]);

  useEffect(() => {
    function handleHomeKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        !shellRef.current
      ) {
        return;
      }

      const focusableItems = Array.from(shellRef.current.querySelectorAll<HTMLElement>(focusSelector));
      if (focusableItems.length === 0) {
        return;
      }

      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeIndex = activeElement ? focusableItems.indexOf(activeElement) : -1;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        focusableItems[(activeIndex + 1 + focusableItems.length) % focusableItems.length].focus();
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusableItems[(activeIndex - 1 + focusableItems.length) % focusableItems.length].focus();
        return;
      }

      if ((event.key === 'a' || event.key === 'A') && activeElement?.matches(focusSelector)) {
        event.preventDefault();
        activeElement.click();
        return;
      }

      if (event.key === 'Escape' || event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        onOpenLibrary();
        return;
      }

      if (event.key === 'x' || event.key === 'X') {
        event.preventDefault();
        onOpenReviewMode('backlog');
        return;
      }

      if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault();
        onOpenQueue();
      }
    }

    window.addEventListener('keydown', handleHomeKeyDown);
    return () => window.removeEventListener('keydown', handleHomeKeyDown);
  }, [onOpenLibrary, onOpenQueue, onOpenReviewMode]);

  return (
    <section ref={shellRef} className="qs-home-shell grid gap-4 lg:h-[calc(100vh-116px)] lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)] lg:overflow-hidden">
      <div className="min-w-0 space-y-4 lg:overflow-y-auto lg:pr-1">
        <section className="rounded-2xl border border-mint/18 bg-gradient-to-br from-ink-900 via-ink-900/95 to-ink-950 p-4 shadow-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-mint">{t('home.kicker')}</div>
              <div className="mt-1 flex items-center gap-3">{avatar}<div><h2 className="text-2xl font-semibold text-white sm:text-3xl">{appTitle}</h2>{shelfTitle ? <div className="mt-1 text-sm font-semibold text-mint">{shelfTitle}</div> : null}</div></div>
              {featuredGame ? <button className="mt-3 rounded-full border border-mint/30 bg-mint/10 px-3 py-1.5 text-sm font-semibold text-mint transition hover:bg-mint/20" data-home-focus="true" onClick={() => onOpenDetails(featuredGame)} type="button">⭐ Featured: {featuredGame.title}</button> : null}
              <p className="mt-2 max-w-2xl text-sm text-slate-400">{t('home.subtitle')}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              <span>{t('home.confirmOpen')}</span>
              <span>{t('home.faceButtons')}</span>
              <span>{t('home.cancelLibrary')}</span>
            </div>
          </div>
        </section>

        <HomeSection title={t('home.continuePlaying')} actionLabel={t('collection.library')} onAction={onOpenLibrary}>
          {continuePlayingGames.length > 0 ? (
            <div className={`grid gap-3 ${continuePlayingGames.length === 1 ? '' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
              {continuePlayingGames.map((game) => (
                <GamePosterButton
                  key={game.id}
                  game={game}
                  eyebrow={t('home.currentlyPlaying')}
                  hero={continuePlayingGames.length === 1}
                  onClick={() => onOpenDetails(game)}
                  queueState={queueState}
                />
              ))}
            </div>
          ) : (
            <OnboardingSteps
              onOpenLibrary={onOpenLibrary}
              onOpenReviewMode={() => onOpenReviewMode('backlog')}
              t={t}
            />
          )}
        </HomeSection>

        <HomeSection title={t('home.nextUp')} actionLabel={t('home.openQueue')} onAction={() => onOpenQueue()}>
          {activeQueuePreviews.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-3">
              {activeQueuePreviews.map((queue) => (
                <article key={queue.platform} className="rounded-xl border border-skyglass/15 bg-ink-950/72 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-white">{queue.platform} {t('home.planSuffix')}</h4>
                    <button
                      className="min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs font-semibold text-mint transition hover:bg-mint/20"
                      data-home-focus="true"
                      onClick={() => onOpenQueue(queue.platform)}
                      type="button"
                    >
                      Open
                    </button>
                  </div>
                  <ol className="mt-3 grid gap-2">
                    {queue.entries.map(({ entry, game }) => (
                      <li key={entry.gameId}>
                        <button
                          className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-white/10 bg-ink-900/80 px-3 py-2 text-left transition hover:border-mint/40 hover:bg-mint/10"
                          data-home-focus="true"
                          onClick={() => onOpenDetails(game)}
                          type="button"
                        >
                          <span className="w-7 shrink-0 text-center text-xs font-semibold text-slate-500">#{entry.queuePosition}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-white">{game.title}</span>
                            <PlatformBadge className="mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-semibold" platform={entry.targetPlatform} queueState={queueState} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title={t('home.noPlatformPlan')} text={t('home.noPlatformPlanText')} actionLabel={t('review.title')} onAction={() => onOpenReviewMode('backlog')} />
          )}
        </HomeSection>

        <HomeSection title={t('home.recommendedToday')} actionLabel={t('home.process')} onAction={() => onOpenReviewMode('backlog')}>
          {recommendedToday.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {recommendedToday.map((recommendation) => (
                <button
                  key={recommendation.game.id}
                  className="min-h-28 rounded-xl border border-skyglass/15 bg-ink-950/70 p-3 text-left transition hover:border-mint/35 hover:bg-mint/10 hover:shadow-glow"
                  data-home-focus="true"
                  onClick={() => onOpenDetails(recommendation.game)}
                  type="button"
                >
                  <PlatformBadge className="w-fit rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em]" platform={getGamePlatformLabel(recommendation.game, queueState)} queueState={queueState} />
                  <span className="mt-2 block line-clamp-2 text-lg font-semibold text-white">{recommendation.game.title}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {recommendation.reasons.map((reason) => (
                      <span key={reason} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">{reason}</span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title={t('home.noRecommendations')} text={t('home.noRecommendationsText')} actionLabel={t('home.openQueue')} onAction={() => onOpenQueue()} />
          )}
        </HomeSection>
      </div>

      <aside className="min-w-0 space-y-4 lg:overflow-y-auto lg:pl-1">
        <section className="rounded-2xl border border-mint/18 bg-mint/10 p-4 shadow-panel">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{t('home.reviewRemaining')}</div>
          <div className="mt-2 text-3xl font-semibold text-white">{reviewRemainingCount}</div>
          <p className="mt-1 text-sm text-slate-300">{reviewRemainingCount === 1 ? t('home.gameReadyReview') : t('home.gamesReadyReview')}</p>
          <button
            className="mt-4 min-h-11 w-full rounded-xl bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            data-home-focus="true"
            onClick={() => onOpenReviewMode('backlog')}
            type="button"
          >
            {t('home.reviewNextGame')}
          </button>
        </section>

        {hasSteamGames && onSyncSteamData ? (
          <HomeSection compact title={t('home.steamSync')}>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5">
                <span className="text-xs text-slate-400">{t('home.playtimeSync')}</span>
                <span className="text-xs font-semibold text-slate-200">
                  {steamPlaytimeRefreshState?.status === 'loading'
                    ? t('home.syncingSteamData')
                    : formatRelativeTime(lastPlaytimeSyncAt, t('home.neverSynced'))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5">
                <span className="text-xs text-slate-400">{t('home.achievementSync')}</span>
                <span className="text-xs font-semibold text-slate-200">
                  {steamAchievementSyncState?.status === 'loading'
                    ? t('home.syncingSteamData')
                    : formatRelativeTime(lastAchievementSyncAt, t('home.neverSynced'))}
                </span>
              </div>
            </div>
            <button
              className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-skyglass/15 px-3 text-xs font-semibold text-slate-200 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white disabled:opacity-50"
              data-home-focus="true"
              disabled={isSteamSyncing}
              onClick={onSyncSteamData}
              type="button"
            >
              <Icon name={isSteamSyncing ? 'refresh-cw' : 'steam'} size={13} strokeWidth={2} className={isSteamSyncing ? 'animate-spin' : ''} />
              {isSteamSyncing ? t('home.syncingSteamData') : t('home.syncSteamData')}
            </button>
          </HomeSection>
        ) : null}

        <HomeSection compact title={t('home.activePlatforms')} actionLabel={t('home.allPlatforms')} onAction={() => onOpenQueue()}>
          {activePlayingPlatforms.length > 0 ? (
            <div className="grid gap-2">
              {activePlayingPlatforms.map(({ platform, count }) => (
                <button
                  key={platform}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-skyglass/15 bg-ink-950/72 px-3 text-left transition hover:border-mint/35 hover:bg-mint/10"
                  data-home-focus="true"
                  onClick={() => onOpenQueue(platform)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{platform}</span>
                    <PlatformBadge className="mt-0.5 w-fit rounded-full px-2 py-0.5 text-xs font-semibold" platform={platform} queueState={queueState} />
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-mint">
                    {count} {count === 1 ? t('home.activeGame') : t('home.activeGames')}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title={t('home.noActivePlatforms')} text={t('home.noActivePlatformsText')} actionLabel={t('home.browseLibrary')} onAction={onOpenLibrary} />
          )}
        </HomeSection>

        <HomeSection compact title={t('home.wishlistHighlight')} actionLabel={t('wishlist.title')} onAction={onOpenWishlist}>
          {wishlistHighlight ? (
            <GamePosterButton game={wishlistHighlight} eyebrow={wishlistHighlight.priority === 'high' ? t('home.highPriority') : t('home.wishlistPick')} wide onClick={() => onOpenDetails(wishlistHighlight)} queueState={queueState} />
          ) : (
            <EmptyState title={t('home.noWishlist')} text={t('home.noWishlistText')} actionLabel={t('home.openWishlist')} onAction={onOpenWishlist} />
          )}
        </HomeSection>

        <HomeSection compact title={t('home.recentlyAdded')} actionLabel={t('collection.library')} onAction={onOpenLibrary}>
          {recentlyAddedGames.length > 0 ? (
            <div className="grid gap-2">
              {recentlyAddedGames.map((game) => (
                <button
                  key={game.id}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-white/10 bg-ink-950/70 px-3 text-left transition hover:border-mint/35 hover:bg-mint/10"
                  data-home-focus="true"
                  onClick={() => onOpenDetails(game)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{game.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{getSourceLabel(game, t)}</span>
                  </span>
                  <PlatformBadge className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.12em]" platform={getGamePlatformLabel(game, queueState)} queueState={queueState} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title={t('home.nothingAdded')} text={t('home.nothingAddedText')} actionLabel={t('home.openLibrary')} onAction={onOpenLibrary} />
          )}
        </HomeSection>
      </aside>
    </section>
  );
}


function getGamePlatformLabel(game: Game, queueState: PlatformQueueState): GamePlatform {
  return queueState.entries.find((entry) => entry.gameId === game.id)?.targetPlatform ?? game.platform;
}

function HomeSection({
  actionLabel,
  children,
  compact = false,
  title,
  onAction,
}: {
  actionLabel?: string;
  children: ReactNode;
  compact?: boolean;
  title: string;
  onAction?: () => void;
}) {
  return (
    <section className={`rounded-2xl border border-skyglass/15 bg-ink-900/74 shadow-panel ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {actionLabel && onAction ? (
          <button
            className="min-h-10 rounded-lg border border-skyglass/15 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white"
            data-home-focus="true"
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function GamePosterButton({
  game,
  eyebrow,
  hero = false,
  onClick,
  queueState,
  wide = false,
}: {
  game: Game;
  eyebrow: string;
  hero?: boolean;
  onClick: () => void;
  queueState: PlatformQueueState;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const coverSources = getGameCoverSources(game);
  const coverSource = coverSources[0];
  const minHeightClass = hero ? 'min-h-72' : 'min-h-56';
  const playtime = game.playtimeHours > 0 ? `${Math.round(game.playtimeHours)}${t('home.hoursPlayed')}` : null;

  return (
    <button
      className={`group relative overflow-hidden rounded-xl border border-white/10 bg-ink-950 text-left shadow-panel transition hover:border-mint/40 hover:shadow-glow ${minHeightClass} ${wide ? 'w-full' : ''}`}
      data-home-focus="true"
      onClick={onClick}
      type="button"
    >
      <div className="absolute inset-0">
        {coverSource ? (
          <img alt="" className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-105" decoding="async" loading="lazy" src={coverSource} />
        ) : (
          <div className="grid h-full place-items-center bg-ink-800 text-6xl font-semibold text-mint/60">{game.title.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent" />
      </div>
      <div className={`relative flex flex-col justify-end p-3 ${minHeightClass}`}>
        <span className="mb-2 w-fit rounded-full border border-mint/30 bg-ink-950/78 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-mint">{eyebrow}</span>
        <span className={`line-clamp-2 font-semibold leading-tight text-white drop-shadow ${hero ? 'text-2xl' : 'text-xl'}`}>{game.title}</span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PlatformBadge className="w-fit rounded-full px-2.5 py-1 text-xs font-semibold" platform={getGamePlatformLabel(game, queueState)} queueState={queueState} />
          {playtime ? <span className="text-xs text-slate-400">{playtime}</span> : null}
        </div>
      </div>
    </button>
  );
}

function EmptyState({ actionLabel, text, title, onAction }: { actionLabel: string; text: string; title: string; onAction: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-ink-950/55 p-4 text-center">
      <h4 className="text-base font-semibold text-white">{title}</h4>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
      <button
        className="mt-4 min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
        data-home-focus="true"
        onClick={onAction}
        type="button"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function pickWishlistHighlight(games: Game[]) {
  const wishlistGames = games.filter((game) => game.collectionType === 'wishlist');

  if (wishlistGames.length === 0) {
    return null;
  }

  const highPriorityGame = wishlistGames
    .filter((game) => game.priority === 'high')
    .sort((firstGame, secondGame) => getRecentTime(secondGame) - getRecentTime(firstGame))[0];

  if (highPriorityGame) {
    return highPriorityGame;
  }

  const recentlyAddedGame = [...wishlistGames].sort((firstGame, secondGame) => getRecentTime(secondGame) - getRecentTime(firstGame))[0];
  if (recentlyAddedGame && getRecentTime(recentlyAddedGame) > 0) {
    return recentlyAddedGame;
  }

  const stableIndex = new Date().getUTCDate() % wishlistGames.length;
  return wishlistGames[stableIndex];
}

function isBacklogReviewCandidate(game: Game) {
  return game.collectionType === 'library' && game.status !== 'Finished' && game.status !== 'Dropped';
}

function getActivityTime(game: Game) {
  return getTime(game.lastPlayedAt) || getTime(game.updatedAt) || getTime(game.importedAt);
}

function getRecentTime(game: Game) {
  return getTime(game.importedAt) || getTime(game.updatedAt) || getTime(game.wishlistImportedAt) || getTime(game.wishlistSyncedAt);
}

function getTime(value: string | null | undefined) {
  return value ? new Date(value).getTime() || 0 : 0;
}

function OnboardingSteps({
  onOpenLibrary,
  onOpenReviewMode,
  t,
}: {
  onOpenLibrary: () => void;
  onOpenReviewMode: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const steps = [
    { action: onOpenLibrary, label: t('home.importGamesTitle'), text: t('home.importGamesText') },
    { action: onOpenReviewMode, label: t('home.reviewQueueTitle'), text: t('home.reviewQueueText') },
    { action: undefined, label: t('home.chooseToPlayTitle'), text: t('home.chooseToPlayText') },
  ] as const;

  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-ink-950/55 p-4">
      <p className="mb-4 text-sm font-semibold text-white">{t('home.getStarted')}</p>
      <p className="mb-4 text-xs text-slate-400">{t('home.getStartedSubtitle')}</p>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-xs font-bold text-mint">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{step.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">{step.text}</p>
            </div>
            {step.action ? (
              <button
                className="shrink-0 rounded-lg border border-mint/30 bg-mint/10 px-3 py-1.5 text-xs font-semibold text-mint transition hover:bg-mint/20"
                data-home-focus="true"
                onClick={step.action}
                type="button"
              >
                {index === 0 ? t('home.openLibrary') : t('home.reviewNextGame')}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatRelativeTime(value: string | Date | number | null | undefined, neverLabel: string): string {
  if (!value) return neverLabel;
  const ms = typeof value === 'string' ? Date.parse(value) : value instanceof Date ? value.getTime() : value;
  if (!ms || isNaN(ms)) return neverLabel;
  const diffMs = Date.now() - ms;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 2) return 'Just now';
  if (diffHours < 1) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ms).toLocaleDateString();
}

function getSourceLabel(game: Game, t: ReturnType<typeof useI18n>['t']) {
  if (game.externalSource === 'steam') {
    return t('home.steamImport');
  }

  if (game.externalSource === 'retro-rom') {
    return t('home.retroImport');
  }

  if (game.externalSource === 'manual') {
    return t('home.manualAdd');
  }

  return t('home.recentlyAddedSource');
}
