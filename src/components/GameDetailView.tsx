import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { getRecentSteamActivityForGame, type PlayActivityRecord } from '../lib/playActivityStorage';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import { canUseRawgImageAsCover, getGameCoverSources, getPreferredLogoUrl, isMissingOrGeneratedCover } from '../lib/gameCoverImages';
import { gameCollectionTypes, gamePlatforms, gameStatuses, type Game, type GameCollectionType, type GamePlatform, type GameStatus } from '../types/game';
import { formatSteamAchievementSummary } from '../lib/steamAchievementSummary';
import { translateOption, useI18n, type TFunction } from '../i18n';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBottomSheetDragToClose } from '../hooks/useBottomSheetDragToClose';
import { formatDealPrice } from './DealCoverBadges';
import { buildHltbSearchUrl, formatHltbBadge, getHltbGameSearchTitle, hasHltbData } from '../lib/hltb';
import type { RawgSearchResult } from '../types/rawg';
import { RawgLinkDialog } from './RawgLinkDialog';
import { SteamGridDbArtworkPickerModal } from './SteamGridDbArtworkPickerModal';
import { SteamAchievementsPanel } from './SteamAchievementsPanel';
import { Icon, type IconName } from './Icon';
import { PlatformIdentityBadge } from './PlatformIdentityBadge';
import { QueueGhost, pickQueueGhostSlot, releaseQueueGhostHabitat, shouldShowQueueGhostInHabitat } from './QueueGhost';

type GameDetailViewProps = {
  activity?: PlayActivityRecord[];
  game: Game;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onBack: () => void;
  onFindArtwork?: (game: Game, mode?: 'metadata' | 'artwork') => void | Promise<unknown>;
  isFindingArtwork?: boolean;
  onIgnore?: (game: Game) => void;
  onSyncSteamData?: (game: Game) => void;
  isSteamDataSyncing?: boolean;
  onStatusChange?: (gameId: string, status: GameStatus) => void;
  onTrackingChange: (gameId: string, tracking: Pick<Game, 'notes' | 'status' | 'tags'> & Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'coverImage'>>) => void;
  onGameEdit?: (gameId: string, changes: Partial<Game>) => void;
  onGameEditSaved?: (game: Game) => void;
  platformQueueState?: PlatformQueueState;
};

type GameDetailAction = {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone: 'accent' | 'neutral' | 'danger';
  disabled?: boolean;
};

export function GameDetailView({
  activity = [],
  game,
  onAddToQueue,
  onAddToWishlist,
  onBack,
  onFindArtwork,
  isFindingArtwork = false,
  onIgnore,
  onSyncSteamData,
  isSteamDataSyncing = false,
  onStatusChange,
  onTrackingChange,
  platformQueueState,
  onGameEdit,
  onGameEditSaved,
}: GameDetailViewProps) {
  const { t } = useI18n();
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [heroBgSourceIndex, setHeroBgSourceIndex] = useState(0);
  const [tagText, setTagText] = useState(() => game.tags.join(', '));
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(() => createEditDraft(game));
  const [editError, setEditError] = useState('');
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isRawgLinkOpen, setIsRawgLinkOpen] = useState(false);
  const [isArtworkPickerOpen, setIsArtworkPickerOpen] = useState(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const overflowButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const overflowMenuId = useId();
  const [pausedGhostSlot] = useState(() => pickQueueGhostSlot('gameDetail'));
  const [showPausedGhost, setShowPausedGhost] = useState(() => Boolean(pausedGhostSlot) && isLongPausedGame(game) && shouldShowQueueGhostInHabitat('gameDetail'));

  const coverSources = useMemo(() => getGameCoverSources(game), [game]);

  const heroBgSources = useMemo(() => {
    const candidates = [
      game.heroImage?.trim(),
      game.wideCoverImage?.trim(),
      game.backgroundImage?.trim(),
      !isMissingOrGeneratedCover(game.coverImage) ? game.coverImage?.trim() : null,
    ].filter((s): s is string => Boolean(s));
    return [...new Set(candidates)];
  }, [game.heroImage, game.wideCoverImage, game.backgroundImage, game.coverImage]);

  useEffect(() => () => releaseQueueGhostHabitat('gameDetail'), []);

  useLayoutEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [game.id]);

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
    setHeroBgSourceIndex(0);
    setTagText(game.tags.join(', '));
    setEditDraft(createEditDraft(game));
    setIsEditing(false);
    setEditError('');
  }, [coverSources, heroBgSources, game.id, game.tags]);

  const activeCoverSource = coverSources[coverSourceIndex];
  const activeHeroBgSource = heroBgSources[heroBgSourceIndex] ?? null;
  const parsedTags = useMemo(() => parseTags(tagText), [tagText]);
  const canApplyRawgCover = canUseRawgImageAsCover(game);
  const isSteamLibraryGame = game.collectionType === 'library' && typeof game.steamAppId === 'number';
  const hasPlaytime = game.playtimeHours > 0;
  const achievementSummary = formatSteamAchievementSummary(game);
  const logoUrl = getPreferredLogoUrl(game);
  const currentItadPrice = typeof game.itadCurrentBestPrice === 'number' && game.itadCurrentBestCurrency
    ? formatDealPrice(game.itadCurrentBestPrice, game.itadCurrentBestCurrency)
    : undefined;
  const historicalItadPrice = typeof game.itadHistoricalLowPrice === 'number' && game.itadHistoricalLowCurrency
    ? formatDealPrice(game.itadHistoricalLowPrice, game.itadHistoricalLowCurrency)
    : undefined;
  const hltbBadge = formatHltbBadge(game, { includeLabel: true });
  const metacriticScore = formatMetacriticScore(game.metacriticScore ?? game.metacritic);
  const rawgPlaytime = formatRawgPlaytime(game.rawgPlaytimeHours ?? game.averagePlaytime);
  const canEditGame = isGameEditable(game);
  const recentSteamActivity = useMemo(() => getRecentSteamActivityForGame(activity, game.id), [activity, game.id]);
  const lastSteamActivityAt = recentSteamActivity?.detectedAt ?? game.lastSteamActivityAt;
  const recentSteamDeltaMinutes = recentSteamActivity?.deltaMinutes ?? game.lastSteamActivityDeltaMinutes;

  function updateTracking(changes: Partial<Pick<Game, 'notes' | 'status' | 'tags'>>) {
    onTrackingChange(game.id, {
      notes: changes.notes ?? game.notes,
      status: changes.status ?? game.status,
      tags: changes.tags ?? game.tags,
    });
  }

  function saveArtworkFromPicker(changes: Partial<Game>) {
    const artworkChanges = pickArtworkChanges(changes);
    if (Object.keys(artworkChanges).length === 0) return;
    onGameEdit?.(game.id, artworkChanges);
  }



  function updateEditDraft<K extends keyof GameEditDraft>(field: K, value: GameEditDraft[K]) {
    setEditDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  }

  function saveEditDraft() {
    const validationError = validateEditDraft(editDraft);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    onGameEdit?.(game.id, getGameEditChanges(game, editDraft));
    setIsEditing(false);
    setEditError('');
    onGameEditSaved?.({ ...game, ...getGameEditChanges(game, editDraft) });
  }

  function linkRawgGame(result: RawgSearchResult) {
    onGameEdit?.(game.id, {
      notes: game.notes,
      rawgId: result.id,
      rawgSlug: result.slug,
      rawgTitle: result.name,
      status: game.status,
      tags: game.tags,
      metadataSkippedAt: undefined,
      metadataManualManagedAt: undefined,
    });
    setIsRawgLinkOpen(false);
  }

  function useRawgImageAsCover() {
    if (!canApplyRawgCover || !game.backgroundImage) {
      return;
    }

    onTrackingChange(game.id, {
      artworkSource: 'rawg',
      artworkUpdatedAt: new Date().toISOString(),
      coverImage: game.backgroundImage,
      notes: game.notes,
      status: game.status,
      tags: game.tags,
    });
  }

  const primaryActions: GameDetailAction[] = [
    {
      icon: 'list-plus',
      label: 'Quest Queue',
      onClick: () => onAddToQueue?.(game),
      tone: 'accent',
      disabled: !onAddToQueue,
    },
    {
      icon: 'gamepad-2',
      label: t('status.playing'),
      onClick: () => onStatusChange?.(game.id, 'Playing'),
      tone: 'accent',
      disabled: !onStatusChange,
    },
    {
      icon: 'heart',
      label: t('wishlist.title'),
      onClick: () => onAddToWishlist?.(game),
      tone: 'neutral',
      disabled: !onAddToWishlist,
    },
    {
      icon: 'trophy',
      label: t('action.finished'),
      onClick: () => onStatusChange?.(game.id, 'Finished'),
      tone: 'neutral',
      disabled: !onStatusChange,
    },
  ];

  return (
    <section className="relative h-full min-w-0 overflow-hidden rounded-lg border border-white/10 bg-ink-950 lg:h-[calc(100vh-116px)]">
      {showPausedGhost && pausedGhostSlot ? (
        <div className={`queue-ghost-habitat queue-ghost-habitat--game-detail queue-ghost-slot--${pausedGhostSlot}`}>
          <QueueGhost variant="sleepy" message={pickQueueGhostMessage(pausedGameGhostMessages)} onVanish={() => { releaseQueueGhostHabitat('gameDetail'); setShowPausedGhost(false); }} />
        </div>
      ) : null}
      <div className="flex h-full min-h-0 flex-col">
        <div ref={detailScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="space-y-3 sm:space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-panel">
              {activeHeroBgSource ? (
                <div className="absolute inset-0" aria-hidden="true">
                  <img
                    alt=""
                    className="h-full w-full object-cover opacity-[0.85]"
                    decoding="async"
                    loading="lazy"
                    onError={() => setHeroBgSourceIndex((i) => i + 1)}
                    src={activeHeroBgSource}
                  />
                </div>
              ) : null}
              {/* Left-to-right veil: solid over cover/title area, fades to ~25% on far right so hero is clearly visible */}
              <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/75 to-ink-950/25" aria-hidden="true" />
              {/* Bottom vignette: light darkening only where stat cards sit */}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/50 to-transparent" aria-hidden="true" />

              <div className="relative grid gap-4 p-4 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-center xl:grid-cols-[150px_minmax(0,1fr)] xl:p-5">
                <div className="mx-auto w-32 overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-panel sm:mx-0 sm:w-full">
                  <div className="aspect-[2/3] bg-ink-700">
                    {activeCoverSource ? (
                      <div className="relative h-full">
                        {!isCoverLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
                        <img
                          alt=""
                          className={`h-full w-full bg-ink-950 object-contain transition-opacity duration-300 ${
                            isCoverLoaded ? 'opacity-100' : 'opacity-0'
                          }`}
                          decoding="async"
                          loading="lazy"
                          onError={() => {
                            setIsCoverLoaded(false);
                            setCoverSourceIndex((currentIndex) => currentIndex + 1);
                          }}
                          onLoad={() => setIsCoverLoaded(true)}
                          src={activeCoverSource}
                        />
                      </div>
                    ) : (
                      <div className="grid h-full place-items-center bg-ink-700 px-4 text-center">
                        <div>
                          <div className="mx-auto grid h-16 w-16 place-items-center rounded-md border border-white/10 bg-ink-900 text-2xl font-semibold text-mint">
                            {game.title.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="mt-3 text-xs font-medium uppercase tracking-caps text-slate-500">{t('common.noCover')}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 space-y-4">
                  <button className="inline-flex items-center gap-1.5 text-sm font-medium text-mint transition hover:text-white" onClick={onBack} type="button">
                    <Icon name="arrow-left" />
                    <span>{t('detail.back')}</span>
                  </button>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-spread text-slate-500">{t('detail.dashboard')}</div>
                    {logoUrl ? (
                      <img
                        alt=""
                        aria-hidden="true"
                        className="mt-2 max-h-12 max-w-[180px] object-contain drop-shadow"
                        decoding="async"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        src={logoUrl}
                      />
                    ) : null}
                    <h2 className="mt-1 min-w-0 text-3xl font-semibold leading-tight text-white sm:text-4xl xl:truncate">{getDisplayTitle(game)}</h2>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fit,minmax(6.75rem,1fr))] gap-1.5 xl:max-w-4xl">
                    <HeroStat label={t('detail.platformSource')} value={formatPlatformSource(game)} />
                    <HeroStat label={t('detail.currentStatus')} value={translateOption(game.status, t)} accent />
                    {hasPlaytime ? <HeroStat label={t('detail.playtime')} value={`${game.playtimeHours}h`} /> : null}
                    {achievementSummary ? (
                      <HeroStat
                        label={t('collection.achievements')}
                        value={achievementSummary}
                        onClick={game.steamAchievements ? () => setIsAchievementsOpen(true) : undefined}
                      />
                    ) : null}
                    {metacriticScore ? <HeroStat label="Metacritic" value={metacriticScore} /> : null}
                    {rawgPlaytime ? <HeroStat label="Average playtime" value={rawgPlaytime} /> : null}
                    {hltbBadge ? <HeroStat label={t('hltb.estimatedTime')} value={hltbBadge} /> : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-ink-950/80 p-3" aria-label={t('detail.actionsA11y')}>
              <div className="flex flex-wrap items-center gap-2">
                {primaryActions.map((action) => (
                  <GameDetailActionButton key={action.label} action={action} />
                ))}
                <button
                  ref={overflowButtonRef}
                  aria-controls={isOverflowOpen ? overflowMenuId : undefined}
                  aria-expanded={isOverflowOpen}
                  aria-haspopup="dialog"
                  aria-label={t('action.moreActions')}
                  className="min-h-10 rounded-xl border border-skyglass/15 bg-ink-950/70 px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-mint/10 hover:text-white"
                  onClick={() => setIsOverflowOpen(true)}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    <Icon name="more-horizontal" />
                    <span>{t('action.more')}</span>
                  </span>
                </button>
              </div>
              {isOverflowOpen ? (
                <GameDetailOverflowMenu
                  anchorRef={overflowButtonRef}
                  canEditGame={canEditGame}
                  currentItadPrice={currentItadPrice}
                  game={game}
                  isFindingArtwork={isFindingArtwork}
                  isSteamDataSyncing={isSteamDataSyncing}
                  isSteamLibraryGame={isSteamLibraryGame}
                  menuId={overflowMenuId}
                  onChangeArtwork={() => setIsArtworkPickerOpen(true)}
                  onClose={() => setIsOverflowOpen(false)}
                  onEdit={() => setIsEditing(true)}
                  onFindArtwork={onFindArtwork}
                  onIgnore={onIgnore}
                  onStatusChange={onStatusChange}
                  onSyncSteamData={onSyncSteamData}
                  t={t}
                />
              ) : null}
            </section>

            {isRawgLinkOpen ? (
              <RawgLinkDialog game={game} onClose={() => setIsRawgLinkOpen(false)} onSelect={linkRawgGame} />
            ) : null}

            {isArtworkPickerOpen ? (
              <SteamGridDbArtworkPickerModal game={game} onClose={() => setIsArtworkPickerOpen(false)} onSave={saveArtworkFromPicker} />
            ) : null}

            {isAchievementsOpen && game.steamAchievements ? (
              <SteamAchievementsPanel
                achievements={game.steamAchievements}
                gameTitle={game.title}
                onClose={() => setIsAchievementsOpen(false)}
              />
            ) : null}

            {isEditing ? (
              <GameEditForm draft={editDraft} error={editError} game={game} isFindingArtwork={isFindingArtwork} onCancel={() => { setEditDraft(createEditDraft(game)); setEditError(''); setIsEditing(false); }} onFindArtwork={onFindArtwork} onSave={saveEditDraft} onUpdate={updateEditDraft} />
            ) : null}

            <DetailSection title={t('detail.myGameLog')} description={t('detail.myGameLogHelp')}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
                <label className="block rounded-xl border border-mint/20 bg-ink-950/80 p-3 shadow-inner shadow-mint/5">
                  <span className="qs-label-caps text-accent">{t('detail.tags')}</span>
                  <input
                    className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint focus:ring-2 focus:ring-mint/20"
                    value={tagText}
                    onBlur={() => {
                      setTagText(parsedTags.join(', '));
                      updateTracking({ tags: parsedTags });
                    }}
                    onChange={(event) => setTagText(event.target.value)}
                    placeholder="cozy, backlog, handheld"
                    type="text"
                  />
                  {parsedTags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {parsedTags.map((tag) => (
                        <span key={tag} className="rounded-full border border-mint/20 bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </label>

                <label className="block rounded-xl border border-mint/20 bg-ink-950/80 p-3 shadow-inner shadow-mint/5">
                  <span className="qs-label-caps text-accent">{t('detail.myNotes')}</span>
                  <textarea
                    className="mt-2 min-h-20 w-full resize-y rounded-lg border border-white/15 bg-ink-900 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-mint focus:ring-2 focus:ring-mint/20"
                    value={game.notes}
                    onChange={(event) => updateTracking({ notes: event.target.value })}
                    placeholder={t('detail.notesPlaceholder')}
                  />
                </label>
              </div>

              <div className="space-y-2 rounded-xl border border-mint/20 bg-ink-950/60 p-3 shadow-inner shadow-mint/5">
                <div>
                  <div className="qs-label-caps text-accent">{t('detail.activity')}</div>
                  {isSteamLibraryGame ? <p className="mt-1 text-xs text-slate-500">{t('detail.steamActivityHelp')}</p> : null}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <PersonalStatField label={t('detail.lastPlayed')} value={formatDate(game.lastPlayedAt, t('detail.notStarted'))} />
                  {isSteamLibraryGame ? <PersonalStatField label={t('detail.lastSteamActivity')} value={formatRelativeActivityDate(lastSteamActivityAt)} /> : null}
                  {isSteamLibraryGame ? <PersonalStatField label={t('detail.recentDelta')} value={formatDeltaMinutes(recentSteamDeltaMinutes)} /> : null}
                  {!hasPlaytime ? <PersonalStatField label={t('detail.playtime')} value={`${game.playtimeHours}h`} /> : null}
                  {hltbBadge ? <PersonalStatField label={t('hltb.estimatedTime')} value={hltbBadge} /> : null}
                </div>
              </div>
            </DetailSection>

            <section className="space-y-2" aria-label={t('detail.importedMetadata')}>
              <div className="px-1 text-xs font-semibold uppercase tracking-spread text-slate-500">{t('detail.importedMetadata')}</div>

              {game.collectionType === 'wishlist' ? (
                <MetadataAccordion title={t('detail.wishlistPlanning')} summary={t('detail.wishlistPlanningSummary')}>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ReadOnlyField label={t('detail.priority')} value={t(`priority.${game.priority ?? 'medium'}` as 'priority.low' | 'priority.medium' | 'priority.high')} />
                    <ReadOnlyField label={t('detail.expectedPlaytime')} value={formatHours(game.expectedPlaytime, t('detail.notAvailable'))} />
                    <ReadOnlyField label={t('detail.priceTarget')} value={game.priceTarget || t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.releaseDate')} value={game.releaseDate || t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.steamPrice')} value={game.steamPriceInfo || t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.steamDiscount')} value={game.steamDiscountInfo || t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.steamReviews')} value={game.steamReviewInfo || t('detail.notAvailable')} />
                    <ReadOnlyField label={t('itad.bestPrice')} value={currentItadPrice || t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.dealStore')} value={game.itadCurrentBestShop || t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.discount')} value={typeof game.itadDiscountPercent === 'number' ? `-${game.itadDiscountPercent}%` : t('detail.notAvailable')} />
                    <ReadOnlyField label={t('itad.historicalLow')} value={historicalItadPrice || t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.historicalLowStatus')} value={game.itadIsHistoricalLow ? t('itad.historicalLow') : t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.wishlistImported')} value={formatDateTime(game.wishlistImportedAt, t('detail.notAvailable'))} />
                    <ReadOnlyField label={t('detail.wishlistSynced')} value={formatDateTime(game.wishlistSyncedAt, t('detail.notAvailable'))} />
                    <ReadOnlyLink label={t('detail.storeUrl')} value={game.storeUrl} />
                    <ReadOnlyLink label={t('itad.openDeal')} value={game.itadCurrentBestUrl} />
                  </div>
                </MetadataAccordion>
              ) : null}

              {isRetroGame(game) ? (
                <MetadataAccordion title="Retro ROM source" summary="Original import files preserved read-only">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ReadOnlyField label="Original imported title" value={game.originalImportedTitle ?? game.romFileName ?? game.title} />
                    <ReadOnlyField label="ROM file name" value={game.romFileName ?? t('detail.notAvailable')} />
                    <ReadOnlyField label="ROM path" value={game.romPath ?? t('detail.notAvailable')} />
                    {(game.romFiles ?? []).map((file, index) => (
                      <ReadOnlyField key={`${file.path}-${index}`} label={`ROM file ${index + 1}${file.role ? ` · ${file.role}` : ''}`} value={file.path} />
                    ))}
                  </div>
                </MetadataAccordion>
              ) : null}

              <MetadataAccordion title={t('detail.steamData')} summary={t('detail.steamDataSummary')}>
                {game.externalSource === 'steam' || typeof game.steamAppId === 'number' || game.externalUrl ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ReadOnlyField label="Steam App ID" value={game.steamAppId?.toString() ?? t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.imported')} value={formatDateTime(game.importedAt, t('detail.notAvailable'))} />
                    <ReadOnlyField label={t('detail.source')} value={game.externalSource ?? t('detail.notAvailable')} />
                    {achievementSummary ? (
                      <ReadOnlyField
                        label={t('collection.achievements')}
                        value={achievementSummary}
                        onClick={game.steamAchievements ? () => setIsAchievementsOpen(true) : undefined}
                      />
                    ) : null}
                    {game.steamLastAchievementUnlockTime ? (
                      <ReadOnlyField label={t('detail.lastAchievementUnlock')} value={formatDateTime(new Date(game.steamLastAchievementUnlockTime * 1000).toISOString(), t('detail.notAvailable'))} />
                    ) : null}
                    <ReadOnlyLink label={t('detail.externalUrl')} value={game.externalUrl} />
                  </div>
                ) : (
                  <EmptyState text={t('detail.noSteamMetadata')} />
                )}
              </MetadataAccordion>


              {hasHltbData(game) ? (
                <MetadataAccordion title="HowLongToBeat" summary={t('hltb.estimatedTime')}>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ReadOnlyField label={t('hltb.mainStory')} value={formatHours(game.hltbMainHours, t('detail.notAvailable'))} />
                    <ReadOnlyField label={t('hltb.mainExtra')} value={formatHours(game.hltbMainExtraHours, t('detail.notAvailable'))} />
                    <ReadOnlyField label={t('hltb.completionist')} value={formatHours(game.hltbCompletionistHours, t('detail.notAvailable'))} />
                    <ReadOnlyField label={t('detail.matchedTitle')} value={game.hltbTitle ?? t('detail.notAvailable')} />
                    <ReadOnlyField label={t('detail.matchConfidence')} value={formatConfidence(game.hltbMatchConfidence, t('detail.notAvailable'))} />
                    <ReadOnlyField label={t('detail.lastSynced')} value={formatDateTime(game.hltbLastSyncedAt, t('detail.notAvailable'))} />
                    {game.hltbSourceUrl ? <ReadOnlyLink label={t('detail.source')} value={game.hltbSourceUrl} /> : null}
                  </div>
                </MetadataAccordion>
              ) : null}

              <MetadataSourceSection game={game} isFindingArtwork={isFindingArtwork} onChangeLink={() => setIsRawgLinkOpen(true)} onFindArtwork={onFindArtwork} />

              <MetadataAccordion title={t('detail.rawgMetadata')} summary={t('detail.rawgSummary')}>
                {game.metadataSource === 'rawg' ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <ReadOnlyField label={t('detail.released')} value={game.released ?? t('detail.unknown')} />
                      <ReadOnlyField label="Metacritic" value={game.metacritic?.toString() ?? t('detail.notAvailable')} />
                      <ReadOnlyField label={t('detail.averagePlaytime')} value={formatHours(game.averagePlaytime, t('detail.notAvailable'))} />
                      <ReadOnlyField label={t('detail.updated')} value={formatDateTime(game.metadataUpdatedAt, t('detail.notAvailable'))} />
                      <ReadOnlyField label={t('detail.developers')} value={formatList(game.developers, t('detail.notAvailable'))} />
                      <ReadOnlyField label={t('detail.publishers')} value={formatList(game.publishers, t('detail.notAvailable'))} />
                    </div>

                    <ChipGroup label={t('detail.genres')} values={game.genres} accent="mint" />
                    <ChipGroup label={t('detail.rawgTags')} values={game.rawgTags} />
                    {canApplyRawgCover ? (
                      <button
                        className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
                        onClick={useRawgImageAsCover}
                        type="button"
                      >
                        {t('detail.useRawgCover')}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <EmptyState text={t('detail.noRawgMetadata')} />
                    {onFindArtwork ? (
                      <button
                        className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isFindingArtwork}
                        onClick={() => void onFindArtwork(game, 'metadata')}
                        type="button"
                      >
                        {isFindingArtwork ? t('action.refreshingMetadata') : t('action.refreshMetadata')}
                      </button>
                    ) : null}
                  </div>
                )}
              </MetadataAccordion>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetadataSourceSection({
  game,
  isFindingArtwork,
  onChangeLink,
  onFindArtwork,
}: {
  game: Game;
  isFindingArtwork: boolean;
  onChangeLink: () => void;
  onFindArtwork?: (game: Game, mode?: 'metadata' | 'artwork') => void | Promise<unknown>;
}) {
  const rawgUrl = getRawgUrl(game);
  const linkedTitle = game.rawgTitle?.trim() || game.metadataSearchTitle?.trim() || game.title;

  return (
    <MetadataAccordion title="Metadata Source" summary={game.rawgId ? `RAWG #${game.rawgId}` : 'Not linked'}>
      {typeof game.rawgId === 'number' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="Linked RAWG title" value={linkedTitle} />
            <ReadOnlyField label="RAWG ID" value={game.rawgId.toString()} />
            <ReadOnlyField label="RAWG slug" value={game.rawgSlug || 'Optional'} />
          </div>
          <div className="flex flex-wrap gap-2">
            {onFindArtwork ? (
              <>
                <button className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:opacity-50" disabled={isFindingArtwork} onClick={() => void onFindArtwork(game, 'metadata')} type="button">
                  {isFindingArtwork ? 'Refreshing…' : 'Refresh Metadata'}
                </button>
                <button className="h-10 rounded-md border border-skyglass/15 bg-ink-950 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={isFindingArtwork} onClick={() => void onFindArtwork(game, 'artwork')} type="button">
                  {isFindingArtwork ? 'Refreshing…' : 'Refresh Artwork'}
                </button>
              </>
            ) : null}
            {rawgUrl ? (
              <a className="grid h-10 place-items-center rounded-md border border-skyglass/15 bg-ink-950 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white" href={rawgUrl} rel="noreferrer" target="_blank">
                Open RAWG
              </a>
            ) : null}
            <button className="h-10 rounded-md border border-skyglass/15 bg-ink-950 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white" onClick={onChangeLink} type="button">
              Change Link
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <EmptyState text="Not linked" />
          <button className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20" onClick={onChangeLink} type="button">
            Link RAWG Game
          </button>
        </div>
      )}
    </MetadataAccordion>
  );
}


type GameEditDraft = {
  title: string;
  platform: GamePlatform;
  status: GameStatus;
  collectionType: GameCollectionType;
  coverImage: string;
  metadataSearchTitle: string;
  notes: string;
  tags: string;
  rating: string;
  favorite: boolean;
  hltbMainHours: string;
  hltbMainExtraHours: string;
  hltbCompletionistHours: string;
};

function pickArtworkChanges(changes: Partial<Game>): Partial<Game> {
  const artworkChanges: Partial<Game> = {};

  if (changes.coverImage !== undefined) artworkChanges.coverImage = changes.coverImage;
  if (changes.wideCoverImage !== undefined) artworkChanges.wideCoverImage = changes.wideCoverImage;
  if (changes.heroImage !== undefined) artworkChanges.heroImage = changes.heroImage;
  if (changes.logoImage !== undefined) artworkChanges.logoImage = changes.logoImage;
  if (changes.iconImage !== undefined) artworkChanges.iconImage = changes.iconImage;
  if (changes.artworkSource !== undefined) artworkChanges.artworkSource = changes.artworkSource;
  if (changes.artworkSourceMetadata !== undefined) artworkChanges.artworkSourceMetadata = changes.artworkSourceMetadata;
  if (changes.artworkUpdatedAt !== undefined) artworkChanges.artworkUpdatedAt = changes.artworkUpdatedAt;

  return artworkChanges;
}

function GameEditForm({ draft, error, game, isFindingArtwork, onCancel, onFindArtwork, onSave, onUpdate }: { draft: GameEditDraft; error: string; game: Game; isFindingArtwork: boolean; onCancel: () => void; onFindArtwork?: (game: Game, mode?: 'metadata' | 'artwork') => void | Promise<unknown>; onSave: () => void; onUpdate: <K extends keyof GameEditDraft>(field: K, value: GameEditDraft[K]) => void }) {
  return (
    <DetailSection kicker="Edit mode" title="Edit game details" description="Update user-managed display data. Source IDs, Steam fields, and ROM paths stay read-only.">
      {error ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <EditText label="Title" value={draft.title} onChange={(value) => onUpdate('title', value)} />
        <EditSelect label="Platform" value={draft.platform} options={gamePlatforms} onChange={(value) => onUpdate('platform', value as GamePlatform)} />
        <EditSelect label="Status" value={draft.status} options={gameStatuses} onChange={(value) => onUpdate('status', value as GameStatus)} />
        <EditSelect label="Collection" value={draft.collectionType} options={gameCollectionTypes} onChange={(value) => onUpdate('collectionType', value as GameCollectionType)} />
        <EditText label="Cover image URL" value={draft.coverImage} onChange={(value) => onUpdate('coverImage', value)} />
        <EditText label="RAWG / metadata search title" value={draft.metadataSearchTitle} onChange={(value) => onUpdate('metadataSearchTitle', value)} />
        <EditText label="Rating (0-5)" inputMode="decimal" value={draft.rating} onChange={(value) => onUpdate('rating', value)} />
        <EditText label="HLTB main story hours" inputMode="decimal" value={draft.hltbMainHours} onChange={(value) => onUpdate('hltbMainHours', value)} />
        <EditText label="HLTB main + extra hours" inputMode="decimal" value={draft.hltbMainExtraHours} onChange={(value) => onUpdate('hltbMainExtraHours', value)} />
        <EditText label="HLTB completionist hours" inputMode="decimal" value={draft.hltbCompletionistHours} onChange={(value) => onUpdate('hltbCompletionistHours', value)} />
        <label className="flex min-h-12 items-center gap-3 rounded-lg border border-white/10 bg-ink-950/80 px-3 py-2 text-sm text-slate-200">
          <input checked={draft.favorite} onChange={(event) => onUpdate('favorite', event.target.checked)} type="checkbox" />
          Favorite
        </label>
      </div>
      <EditText label="Tags" value={draft.tags} onChange={(value) => onUpdate('tags', value)} />
      <label className="block rounded-xl border border-white/10 bg-ink-950/80 p-3">
        <span className="qs-label-caps text-slate-400">Notes</span>
        <textarea className="mt-2 min-h-28 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-3 text-sm text-white outline-none focus:border-mint" value={draft.notes} onChange={(event) => onUpdate('notes', event.target.value)} />
      </label>
      {isRetroGame(game) ? <ReadOnlyField label="Original ROM path" value={game.romPath ?? game.romFiles?.[0]?.path ?? 'n/a'} /> : null}
      <div className="flex flex-wrap gap-2">
        <button className="min-h-10 rounded-xl border border-mint/30 bg-mint/10 px-3 py-2 text-sm font-bold text-mint" onClick={onSave} type="button">Save</button>
        <button className="min-h-10 rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-sm font-bold text-slate-200" onClick={onCancel} type="button">Cancel</button>
        {onFindArtwork ? <button className="min-h-10 rounded-xl border border-skyglass/15 bg-ink-950 px-3 py-2 text-sm font-bold text-slate-200 disabled:opacity-50" disabled={isFindingArtwork} onClick={() => void onFindArtwork(game, 'metadata')} type="button">{isFindingArtwork ? 'Refreshing…' : 'Refresh Metadata'}</button> : null}
      </div>
    </DetailSection>
  );
}

function EditText({ inputMode, label, onChange, value }: { inputMode?: 'decimal'; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="block rounded-xl border border-white/10 bg-ink-950/80 p-3"><span className="qs-label-caps text-slate-400">{label}</span><input className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} type="text" /></label>;
}

function EditSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: readonly string[]; value: string }) {
  return <label className="block rounded-xl border border-white/10 bg-ink-950/80 p-3"><span className="qs-label-caps text-slate-400">{label}</span><select className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function formatMetacriticScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${Math.round(value)}%` : null;
}

function formatRawgPlaytime(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${Math.round(value)}h` : null;
}

function HeroStat({ accent, label, onClick, value }: { accent?: boolean; label: string; onClick?: () => void; value: string }) {
  const className = `rounded-xl border px-2.5 py-2 text-left ${accent ? 'border-mint/30 bg-mint/10' : 'border-white/10 bg-ink-900/80'} ${onClick ? 'cursor-pointer transition hover:border-mint/40 hover:bg-mint/5 active:scale-[0.98]' : ''}`;
  const content = (
    <>
      <div className="qs-label-caps truncate text-muted">{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold ${accent ? 'text-mint' : 'text-slate-100'}`}>{value}</div>
    </>
  );
  return onClick ? (
    <button className={className} type="button" onClick={onClick}>{content}</button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function GameDetailActionButton({ action }: { action: GameDetailAction }) {
  return (
    <button
      className={`min-h-10 rounded-xl border px-3 py-2 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${getGameDetailActionClassName(
        action.tone,
      )}`}
      disabled={action.disabled}
      onClick={action.onClick}
      type="button"
    >
      <span className="flex items-center gap-2">
        <Icon name={action.icon} />
        <span>{action.label}</span>
      </span>
    </button>
  );
}

function getGameDetailActionClassName(tone: GameDetailAction['tone']) {
  if (tone === 'accent') {
    return 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20 hover:shadow-glow';
  }

  if (tone === 'danger') {
    return 'border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20';
  }

  return 'border-skyglass/15 bg-ink-950/70 text-slate-200 hover:bg-mint/10 hover:text-white';
}

type GameDetailOverflowMenuProps = {
  anchorRef: RefObject<HTMLButtonElement | null>;
  canEditGame: boolean;
  currentItadPrice?: string;
  game: Game;
  isFindingArtwork: boolean;
  isSteamDataSyncing: boolean;
  isSteamLibraryGame: boolean;
  menuId: string;
  onChangeArtwork: () => void;
  onClose: () => void;
  onEdit: () => void;
  onFindArtwork?: (game: Game, mode?: 'metadata' | 'artwork') => void | Promise<unknown>;
  onIgnore?: (game: Game) => void;
  onStatusChange?: (gameId: string, status: GameStatus) => void;
  onSyncSteamData?: (game: Game) => void;
  t: TFunction;
};

function GameDetailOverflowMenu({
  anchorRef,
  canEditGame,
  currentItadPrice,
  game,
  isFindingArtwork,
  isSteamDataSyncing,
  isSteamLibraryGame,
  menuId,
  onChangeArtwork,
  onClose,
  onEdit,
  onFindArtwork,
  onIgnore,
  onStatusChange,
  onSyncSteamData,
  t,
}: GameDetailOverflowMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { dragHandleProps, dragStyle } = useBottomSheetDragToClose({ panelRef: menuRef, onClose });
  useScrollLock();

  useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    firstItem?.focus({ preventScroll: true });
    return () => {
      window.setTimeout(() => anchorRef.current?.focus({ preventScroll: true }), 0);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const activeIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex = event.key === 'ArrowDown'
      ? (activeIndex + 1) % items.length
      : (activeIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus({ preventScroll: true });
  }

  function closeAndRun(fn: () => void) {
    onClose();
    window.setTimeout(fn, 0);
  }

  type OverflowItem = { icon: IconName; label: string; disabled?: boolean } & (
    | { href: string; onClick?: () => void }
    | { href?: never; onClick: () => void }
  );

  const toolItems: OverflowItem[] = [];

  if (canEditGame) {
    toolItems.push({
      icon: 'pencil',
      label: 'Edit',
      onClick: () => closeAndRun(onEdit),
    });
  }

  if (isSteamLibraryGame) {
    toolItems.push({
      icon: 'refresh-cw',
      label: isSteamDataSyncing ? t('detail.syncingSteamData') : t('detail.syncSteamData'),
      disabled: !onSyncSteamData || isSteamDataSyncing,
      onClick: () => closeAndRun(() => onSyncSteamData?.(game)),
    });
  }

  if (onFindArtwork) {
    toolItems.push({
      icon: 'refresh-cw',
      label: isFindingArtwork ? t('action.refreshingMetadata') : t('action.refreshMetadata'),
      disabled: isFindingArtwork,
      onClick: () => closeAndRun(() => { void onFindArtwork(game, 'metadata'); }),
    });
    toolItems.push({
      icon: 'image',
      label: isFindingArtwork ? t('artwork.searching') : t('artwork.refreshArtwork'),
      disabled: isFindingArtwork,
      onClick: () => closeAndRun(() => { void onFindArtwork(game, 'artwork'); }),
    });
  }

  toolItems.push({
    icon: 'image-frame',
    label: t('artwork.changeArtwork'),
    onClick: () => closeAndRun(onChangeArtwork),
  });

  if (game.itadCurrentBestUrl) {
    toolItems.push({
      icon: 'shopping-bag',
      label: currentItadPrice ? `${t('itad.openDeal')} · ${currentItadPrice}` : t('itad.openDeal'),
      href: game.itadCurrentBestUrl,
      onClick: onClose,
    });
  }

  toolItems.push({
    icon: 'search',
    label: t('hltb.findOn'),
    href: buildHltbSearchUrl(getHltbGameSearchTitle(game)),
    onClick: onClose,
  });

  toolItems.push({
    icon: 'archive',
    label: t('action.drop'),
    disabled: !onStatusChange,
    onClick: () => closeAndRun(() => onStatusChange?.(game.id, 'Dropped')),
  });

  const dangerItems: OverflowItem[] = [
    {
      icon: 'eye-off',
      label: t('action.ignore'),
      disabled: !onIgnore || typeof game.steamAppId !== 'number',
      onClick: () => closeAndRun(() => onIgnore?.(game)),
    },
  ];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="qs-game-action-backdrop fixed inset-0 z-[1200] flex items-end justify-center p-2 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={menuRef}
        id={menuId}
        aria-label={`${t('action.actions')} ${game.title}`}
        aria-modal="true"
        className="qs-game-action-sheet pointer-events-auto w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={dragStyle}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleMenuKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        <div className="qs-game-action-header qs-sheet-drag-region" {...dragHandleProps}>
          <div className="min-w-0">
            <p className="qs-game-action-eyebrow">{t('action.gameActions')}</p>
            <h3 className="qs-game-action-title">{game.title}</h3>
            <PlatformIdentityBadge
              className="mt-2 rounded-full px-2 py-0.5 text-xs font-semibold"
              platform={game.platform}
            />
          </div>
          <button
            aria-label={t('action.close')}
            className="qs-game-action-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="qs-game-action-scroll">
          <div aria-label={`${t('action.actions')} ${game.title}`} className="qs-game-action-sections" role="menu">
            {toolItems.length > 0 ? (
              <section className="qs-game-action-section">
                <h4 className="qs-game-action-section-title">{t('action.sectionTools')}</h4>
                <div aria-label={t('action.sectionTools')} className="qs-game-action-section-list" role="group">
                  {toolItems.map((item) =>
                    item.href ? (
                      <a
                        key={item.label}
                        className="qs-game-action-row"
                        href={item.href}
                        onClick={item.onClick}
                        rel="noreferrer"
                        role="menuitem"
                        target="_blank"
                      >
                        <span aria-hidden="true" className="qs-game-action-row-icon"><Icon name={item.icon} /></span>
                        <span className="qs-game-action-row-label">{item.label}</span>
                      </a>
                    ) : (
                      <button
                        key={item.label}
                        aria-disabled={item.disabled}
                        className={`qs-game-action-row${item.disabled ? ' qs-game-action-row-disabled' : ''}`}
                        disabled={item.disabled}
                        onClick={item.onClick}
                        role="menuitem"
                        type="button"
                      >
                        <span aria-hidden="true" className="qs-game-action-row-icon"><Icon name={item.icon} /></span>
                        <span className="qs-game-action-row-label">{item.label}</span>
                      </button>
                    ),
                  )}
                </div>
              </section>
            ) : null}
            <section className="qs-game-action-section qs-game-action-section-danger">
              <h4 className="qs-game-action-section-title">{t('action.sectionDanger')}</h4>
              <div aria-label={t('action.sectionDanger')} className="qs-game-action-section-list" role="group">
                {dangerItems.map((item) => (
                  <button
                    key={item.label}
                    aria-disabled={item.disabled}
                    className={`qs-game-action-row qs-game-action-row-danger${item.disabled ? ' qs-game-action-row-disabled' : ''}`}
                    disabled={item.disabled}
                    onClick={item.onClick}
                    role="menuitem"
                    type="button"
                  >
                    <span aria-hidden="true" className="qs-game-action-row-icon"><Icon name={item.icon} /></span>
                    <span className="qs-game-action-row-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type DetailSectionProps = {
  children: ReactNode;
  description?: string;
  kicker?: string;
  title: string;
};

function DetailSection({ children, description, kicker, title }: DetailSectionProps) {
  return (
    <section className="rounded-2xl border border-mint/20 bg-ink-800 p-4 shadow-panel">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          {kicker ? <div className="qs-label-caps text-accent">{kicker}</div> : null}
          <h3 className={kicker ? 'mt-1 text-lg font-semibold text-white' : 'text-lg font-semibold text-white'}>{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PersonalStatField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-mint/20 bg-ink-950/80 px-3 py-2 shadow-inner shadow-mint/5">
      <div className="text-xs font-medium uppercase tracking-caps text-mint">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

type MetadataAccordionProps = {
  children: ReactNode;
  summary: string;
  title: string;
};

function MetadataAccordion({ children, summary, title }: MetadataAccordionProps) {
  return (
    <details className="group rounded-xl border border-white/10 bg-ink-950/65 text-slate-300">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-white/5 [&::-webkit-details-marker]:hidden">
        <Icon className="text-slate-500 transition group-open:rotate-90" name="chevrons-right" />
        <Icon className="text-slate-500" name="lock" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-200">{title}</span>
          <span className="block truncate text-xs text-slate-500">{summary}</span>
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 qs-label-caps text-muted">
          Read-only
        </span>
      </summary>
      <div className="border-t border-white/10 p-4">{children}</div>
    </details>
  );
}

type ReadOnlyFieldProps = {
  label: string;
  onClick?: () => void;
  value: string;
};

function ReadOnlyField({ label, onClick, value }: ReadOnlyFieldProps) {
  const className = `min-w-0 rounded-md border border-white/10 bg-ink-900/60 px-3 py-2 text-left ${onClick ? 'cursor-pointer transition hover:border-mint/40 hover:bg-mint/5 active:scale-[0.98]' : ''}`;
  const content = (
    <>
      <div className="text-xs font-medium uppercase tracking-caps text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm text-slate-300">{value}</div>
    </>
  );
  return onClick ? (
    <button className={className} type="button" onClick={onClick}>{content}</button>
  ) : (
    <div className={className}>{content}</div>
  );
}

type ReadOnlyLinkProps = {
  label: string;
  value?: string;
};

function ReadOnlyLink({ label, value }: ReadOnlyLinkProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-ink-900/60 px-3 py-2 sm:col-span-2 lg:col-span-3">
      <div className="text-xs font-medium uppercase tracking-caps text-slate-500">{label}</div>
      {value ? (
        <a className="mt-1 block truncate text-sm text-mint transition hover:text-white" href={value} rel="noreferrer" target="_blank">
          {value}
        </a>
      ) : (
        <div className="mt-1 text-sm text-slate-300">n/a</div>
      )}
    </div>
  );
}

type ChipGroupProps = {
  accent?: 'mint';
  label: string;
  values?: string[];
};

function ChipGroup({ accent, label, values }: ChipGroupProps) {
  if (!values || values.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-caps text-slate-500">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              accent === 'mint' ? 'bg-mint/10 text-mint' : 'bg-white/10 text-slate-300'
            }`}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-white/15 bg-ink-900/50 p-4 text-sm text-slate-400">{text}</div>;
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function getDisplayTitle(game: Game) {
  return game.displayTitleOverride?.trim() || game.title;
}

function isRetroGame(game: Game) {
  return game.externalSource === 'retro-rom' || Boolean(game.romPath || game.romFiles?.length);
}

function getRawgUrl(game: Game) {
  if (game.rawgSlug) {
    return `https://rawg.io/games/${game.rawgSlug}`;
  }

  if (typeof game.rawgId === 'number') {
    return `https://rawg.io/games/${game.rawgId}`;
  }

  return undefined;
}

export function isGameEditable(game: Game) {
  if (game.externalSource === 'steam' || (game.collectionType === 'library' && typeof game.steamAppId === 'number')) {
    return false;
  }

  return !game.externalSource || game.externalSource === 'manual' || game.externalSource === 'retro-rom' || isRetroGame(game);
}

function createEditDraft(game: Game): GameEditDraft {
  return {
    collectionType: game.collectionType,
    coverImage: game.coverImage ?? '',
    favorite: Boolean(game.favorite),
    hltbCompletionistHours: formatOptionalNumberForInput(game.hltbCompletionistHours),
    hltbMainExtraHours: formatOptionalNumberForInput(game.hltbMainExtraHours),
    hltbMainHours: formatOptionalNumberForInput(game.hltbMainHours),
    metadataSearchTitle: game.metadataSearchTitle ?? '',
    notes: game.notes ?? '',
    platform: game.platform,
    rating: formatOptionalNumberForInput(game.rating),
    status: game.status,
    tags: (game.tags ?? []).join(', '),
    title: getDisplayTitle(game),
  };
}

function getGameEditChanges(game: Game, draft: GameEditDraft): Partial<Game> {
  const title = draft.title.trim();
  return {
    collectionType: draft.collectionType,
    coverImage: draft.coverImage.trim(),
    displayTitleOverride: title === game.title ? undefined : title,
    favorite: draft.favorite,
    hltbCompletionistHours: parseOptionalNonNegativeNumber(draft.hltbCompletionistHours),
    hltbMainExtraHours: parseOptionalNonNegativeNumber(draft.hltbMainExtraHours),
    hltbMainHours: parseOptionalNonNegativeNumber(draft.hltbMainHours),
    metadataSearchTitle: draft.metadataSearchTitle.trim() || title,
    notes: draft.notes,
    originalImportedTitle: isRetroGame(game) ? game.originalImportedTitle ?? game.title : game.originalImportedTitle,
    platform: draft.platform,
    rating: parseOptionalNonNegativeNumber(draft.rating) ?? null,
    status: draft.status,
    tags: parseTags(draft.tags),
    title,
  };
}

function validateEditDraft(draft: GameEditDraft) {
  if (!draft.title.trim()) return 'Title cannot be empty.';
  if (!gamePlatforms.includes(draft.platform as never)) return 'Platform must be valid.';
  if (draft.coverImage.trim() && !isValidUrl(draft.coverImage.trim())) return 'Cover image must be a valid URL.';
  const rating = parseOptionalNonNegativeNumber(draft.rating);
  if (draft.rating.trim() && rating === undefined) return 'Rating must be a number between 0 and 5.';
  if (rating !== undefined && rating > 5) return 'Rating must be between 0 and 5.';
  return '';
}

function formatOptionalNumberForInput(value: number | null | undefined) {
  return typeof value === 'number' ? String(value) : '';
}

function parseOptionalNonNegativeNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isValidUrl(value: string) {
  try { new URL(value); return true; } catch { return false; }
}

function formatPlatformSource(game: Game) {
  return game.platform;
}

function formatDate(value: string | null, notStartedText: string) {
  if (!value) {
    return notStartedText;
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string | undefined, unavailableText: string) {
  if (!value) {
    return unavailableText;
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatHours(value: number | null | undefined, unavailableText: string) {
  return typeof value === 'number' ? `${value}h` : unavailableText;
}

function formatList(value: string[] | undefined, unavailableText: string) {
  return value && value.length > 0 ? value.join(', ') : unavailableText;
}

function formatConfidence(value: number | undefined, unavailableText: string) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : unavailableText;
}


function formatDeltaMinutes(deltaMinutes?: number) {
  if (!deltaMinutes || deltaMinutes <= 0) {
    return 'No recent delta';
  }

  const hours = Math.floor(deltaMinutes / 60);
  const minutes = deltaMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `+${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `+${hours}h`;
  }
  return `+${minutes}m`;
}

function formatRelativeActivityDate(value?: string | null) {
  if (!value) {
    return 'Not detected';
  }

  const activityDate = new Date(value);
  if (Number.isNaN(activityDate.getTime())) {
    return 'Not detected';
  }

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const activityDay = new Date(activityDate.getFullYear(), activityDate.getMonth(), activityDate.getDate());
  const diffDays = Math.round((todayDate.getTime() - activityDay.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays >= 0 && diffDays < 7) {
    return 'This week';
  }

  return activityDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const pausedGameGhostMessages = [
  'We should return someday.',
  'This adventure still waits.',
  'The backlog remembers this one.',
] as const;

function isLongPausedGame(game: Game) {
  if (game.status !== 'Paused' || !game.lastPlayedAt) return false;
  const lastPlayedMs = new Date(game.lastPlayedAt).getTime();
  if (!Number.isFinite(lastPlayedMs)) return false;
  return Date.now() - lastPlayedMs > 30 * 24 * 60 * 60 * 1000;
}

function pickQueueGhostMessage(messages: readonly string[]) {
  return messages[Math.floor(Math.random() * messages.length)];
}
