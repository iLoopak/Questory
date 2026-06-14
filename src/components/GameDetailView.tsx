import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import { canUseRawgImageAsCover, getGameCoverSources, isMissingOrGeneratedCover } from '../lib/gameCoverImages';
import { gameCollectionTypes, gamePlatforms, gameStatuses, type Game, type GameCollectionType, type GamePlatform, type GameStatus } from '../types/game';
import { AchievementProgressBadge } from './AchievementProgressBadge';
import { formatSteamAchievementSummary } from '../lib/steamAchievementSummary';
import { PlatformBadge } from './PlatformBadge';
import { translateOption, useI18n } from '../i18n';
import { formatDealPrice } from './DealCoverBadges';
import { formatHltbBadge, hasHltbData } from '../lib/hltb';
import { Icon, type IconName } from './Icon';

type GameDetailViewProps = {
  game: Game;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onBack: () => void;
  onFindArtwork?: (game: Game) => void | Promise<unknown>;
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
  const [tagText, setTagText] = useState(() => game.tags.join(', '));
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(() => createEditDraft(game));
  const [editError, setEditError] = useState('');

  const coverSources = useMemo(() => {
    return getGameCoverSources(game);
  }, [game]);

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
    setTagText(game.tags.join(', '));
    setEditDraft(createEditDraft(game));
    setIsEditing(false);
    setEditError('');
  }, [coverSources, game.id, game.tags]);

  const activeCoverSource = coverSources[coverSourceIndex];
  const parsedTags = useMemo(() => parseTags(tagText), [tagText]);
  const canApplyRawgCover = canUseRawgImageAsCover(game);
  const isSteamLibraryGame = game.collectionType === 'library' && typeof game.steamAppId === 'number';
  const hasPlaytime = game.playtimeHours > 0;
  const achievementSummary = formatSteamAchievementSummary(game);
  const platformLabel = getGamePlatformLabel(game, platformQueueState);
  const isArtworkMissing = isMissingOrGeneratedCover(game.coverImage);
  const canFindArtwork = isArtworkMissing || game.metadataSource !== 'rawg';
  const currentItadPrice = typeof game.itadCurrentBestPrice === 'number' && game.itadCurrentBestCurrency
    ? formatDealPrice(game.itadCurrentBestPrice, game.itadCurrentBestCurrency)
    : undefined;
  const historicalItadPrice = typeof game.itadHistoricalLowPrice === 'number' && game.itadHistoricalLowCurrency
    ? formatDealPrice(game.itadHistoricalLowPrice, game.itadHistoricalLowCurrency)
    : undefined;
  const hltbBadge = formatHltbBadge(game, { includeLabel: true });
  const canEditGame = isGameEditable(game);

  function updateTracking(changes: Partial<Pick<Game, 'notes' | 'status' | 'tags'>>) {
    onTrackingChange(game.id, {
      notes: changes.notes ?? game.notes,
      status: changes.status ?? game.status,
      tags: changes.tags ?? game.tags,
    });
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
  const steamActions: GameDetailAction[] = isSteamLibraryGame
    ? [
        {
          icon: 'refresh-cw',
          label: isSteamDataSyncing ? t('detail.syncingSteamData') : t('detail.syncSteamData'),
          onClick: () => onSyncSteamData?.(game),
          tone: 'neutral',
          disabled: !onSyncSteamData || isSteamDataSyncing,
        },
      ]
    : [];


  const dealActions: GameDetailAction[] = game.itadCurrentBestUrl
    ? [
        {
          icon: 'shopping-bag',
          label: currentItadPrice ? `${t('itad.openDeal')} · ${currentItadPrice}` : t('itad.openDeal'),
          onClick: () => {
            window.open(game.itadCurrentBestUrl, '_blank', 'noopener,noreferrer');
          },
          tone: 'accent',
        },
      ]
    : [];

  const artworkActions: GameDetailAction[] = canFindArtwork
    ? [
        {
          icon: 'image',
          label: isFindingArtwork
            ? t('artwork.searching')
            : (isArtworkMissing ? t('artwork.findArtwork') : t('artwork.enrichMetadata')),
          onClick: () => {
            void onFindArtwork?.(game);
          },
          tone: 'accent',
          disabled: !onFindArtwork || isFindingArtwork,
        },
      ]
    : [];

  const destructiveActions: GameDetailAction[] = [
    {
      icon: 'trash-2',
      label: t('queue.drop'),
      onClick: () => onStatusChange?.(game.id, 'Dropped'),
      tone: 'danger',
      disabled: !onStatusChange,
    },
    {
      icon: 'eye-off',
      label: t('action.ignore'),
      onClick: () => onIgnore?.(game),
      tone: 'danger',
      disabled: !onIgnore || typeof game.steamAppId !== 'number',
    },
  ];

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-ink-900/70 lg:h-[calc(100vh-116px)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="space-y-3 sm:space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-panel">
              {game.backgroundImage ? (
                <div className="absolute inset-0 opacity-20 blur-sm" aria-hidden="true">
                  <img className="h-full w-full object-cover" src={game.backgroundImage} alt="" />
                </div>
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/95 to-ink-900/75" aria-hidden="true" />

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
                          <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{t('common.noCover')}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 space-y-4">
                  <button className="inline-flex items-center gap-1.5 text-sm font-medium text-mint transition hover:text-white" onClick={onBack} type="button">
                    <Icon name="arrow-left" />
                    <span>{t('detail.backToLibrary')}</span>
                  </button>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t('detail.dashboard')}</div>
                    <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
                      <h2 className="min-w-0 flex-1 text-3xl font-semibold leading-tight text-white sm:text-4xl xl:truncate">{getDisplayTitle(game)}</h2>
                      {canEditGame ? (
                        <button className="min-h-10 rounded-xl border border-mint/30 bg-mint/10 px-3 py-2 text-sm font-bold text-mint transition hover:bg-mint/20" onClick={() => setIsEditing(true)} type="button">
                          <span className="flex items-center gap-2"><Icon name="pencil" /> Edit</span>
                        </button>
                      ) : isSteamLibraryGame ? (
                        <button className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-500" disabled title="Steam imported games are managed from Steam data." type="button">Edit</button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 xl:max-w-3xl">
                    <HeroStat label={t('detail.platformSource')} value={formatPlatformSource(game)} badge={<PlatformBadge className="mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-semibold" platform={platformLabel} queueState={platformQueueState} />} />
                    <HeroStat label={t('detail.currentStatus')} value={translateOption(game.status, t)} accent />
                    {hasPlaytime ? <HeroStat label={t('detail.playtime')} value={`${game.playtimeHours}h`} /> : null}
                    {hltbBadge ? <HeroStat label={t('hltb.estimatedTime')} value={hltbBadge} /> : null}
                    {achievementSummary ? <HeroStat label={t('collection.achievements')} value={achievementSummary} badge={<AchievementProgressBadge game={game} />} /> : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-ink-950/80 p-3" aria-label={t('detail.actionsA11y')}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-2">
                  {destructiveActions.map((action) => (
                    <GameDetailActionButton key={action.label} action={action} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {steamActions.map((action) => (
                    <GameDetailActionButton key={action.label} action={action} />
                  ))}
                  {dealActions.map((action) => (
                    <GameDetailActionButton key={action.label} action={action} />
                  ))}
                  {artworkActions.map((action) => (
                    <GameDetailActionButton key={action.label} action={action} />
                  ))}
                </div>
                <div className="min-w-4 flex-1" aria-hidden="true" />
                <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                  {primaryActions.map((action) => (
                    <GameDetailActionButton key={action.label} action={action} />
                  ))}
                </div>
              </div>
            </section>

            {isEditing ? (
              <GameEditForm draft={editDraft} error={editError} game={game} isFindingArtwork={isFindingArtwork} onCancel={() => { setEditDraft(createEditDraft(game)); setEditError(''); setIsEditing(false); }} onFindArtwork={onFindArtwork} onSave={saveEditDraft} onUpdate={updateEditDraft} />
            ) : null}

            <DetailSection kicker={t('detail.editable')} title={t('detail.myInformation')} description={t('detail.myInformationHelp')}>
              <div className="grid gap-3 md:grid-cols-3">
                <PersonalStatField label={t('detail.playtime')} value={`${game.playtimeHours}h`} />
                {hltbBadge ? <PersonalStatField label={t('hltb.estimatedTime')} value={hltbBadge} /> : null}
                <PersonalStatField label={t('detail.lastPlayed')} value={formatDate(game.lastPlayedAt, t('detail.notStarted'))} />
                <PersonalStatField label={t('toolbar.status')} value={translateOption(game.status, t)} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
                <label className="block rounded-xl border border-mint/20 bg-ink-950/80 p-3 shadow-inner shadow-mint/5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">{t('detail.customTags')}</span>
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
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">{t('review.notes')}</span>
                  <textarea
                    className="mt-2 min-h-28 w-full resize-y rounded-lg border border-white/15 bg-ink-900 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-mint focus:ring-2 focus:ring-mint/20 xl:min-h-24"
                    value={game.notes}
                    onChange={(event) => updateTracking({ notes: event.target.value })}
                    placeholder={t('detail.notesPlaceholder')}
                  />
                </label>
              </div>
            </DetailSection>

            <section className="space-y-2" aria-label={t('detail.importedMetadata')}>
              <div className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t('detail.importedMetadata')}</div>

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
                    {achievementSummary ? <ReadOnlyField label={t('collection.achievements')} value={achievementSummary} /> : null}
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
                        onClick={() => void onFindArtwork(game)}
                        type="button"
                      >
                        {isFindingArtwork ? t('artwork.searching') : t('artwork.enrichMetadata')}
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

function GameEditForm({ draft, error, game, isFindingArtwork, onCancel, onFindArtwork, onSave, onUpdate }: { draft: GameEditDraft; error: string; game: Game; isFindingArtwork: boolean; onCancel: () => void; onFindArtwork?: (game: Game) => void | Promise<unknown>; onSave: () => void; onUpdate: <K extends keyof GameEditDraft>(field: K, value: GameEditDraft[K]) => void }) {
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
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Notes</span>
        <textarea className="mt-2 min-h-28 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-3 text-sm text-white outline-none focus:border-mint" value={draft.notes} onChange={(event) => onUpdate('notes', event.target.value)} />
      </label>
      {isRetroGame(game) ? <ReadOnlyField label="Original ROM path" value={game.romPath ?? game.romFiles?.[0]?.path ?? 'n/a'} /> : null}
      <div className="flex flex-wrap gap-2">
        <button className="min-h-10 rounded-xl border border-mint/30 bg-mint/10 px-3 py-2 text-sm font-bold text-mint" onClick={onSave} type="button">Save</button>
        <button className="min-h-10 rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-sm font-bold text-slate-200" onClick={onCancel} type="button">Cancel</button>
        {onFindArtwork ? <button className="min-h-10 rounded-xl border border-skyglass/15 bg-ink-950 px-3 py-2 text-sm font-bold text-slate-200 disabled:opacity-50" disabled={isFindingArtwork} onClick={() => void onFindArtwork(game)} type="button">{isFindingArtwork ? 'Refreshing…' : 'Refresh metadata'}</button> : null}
      </div>
    </DetailSection>
  );
}

function EditText({ inputMode, label, onChange, value }: { inputMode?: 'decimal'; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="block rounded-xl border border-white/10 bg-ink-950/80 p-3"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span><input className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} type="text" /></label>;
}

function EditSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: readonly string[]; value: string }) {
  return <label className="block rounded-xl border border-white/10 bg-ink-950/80 p-3"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span><select className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function getGamePlatformLabel(game: Game, platformQueueState?: PlatformQueueState): GamePlatform {
  return platformQueueState?.entries.find((entry) => entry.gameId === game.id)?.targetPlatform ?? game.platform;
}

function HeroStat({ accent, badge, label, value }: { accent?: boolean; badge?: ReactNode; label: string; value: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${accent ? 'border-mint/30 bg-mint/10' : 'border-white/10 bg-ink-900/80'}`}>
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold ${accent ? 'text-mint' : 'text-slate-100'}`}>{value}</div>
      {badge}
    </div>
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

type DetailSectionProps = {
  children: ReactNode;
  description?: string;
  kicker: string;
  title: string;
};

function DetailSection({ children, description, kicker, title }: DetailSectionProps) {
  return (
    <section className="rounded-2xl border border-mint/20 bg-ink-800 p-4 shadow-panel">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">{kicker}</div>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
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
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-mint">{label}</div>
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
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Read-only
        </span>
      </summary>
      <div className="border-t border-white/10 p-4">{children}</div>
    </details>
  );
}

type ReadOnlyFieldProps = {
  label: string;
  value: string;
};

function ReadOnlyField({ label, value }: ReadOnlyFieldProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-ink-900/60 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm text-slate-300">{value}</div>
    </div>
  );
}

type ReadOnlyLinkProps = {
  label: string;
  value?: string;
};

function ReadOnlyLink({ label, value }: ReadOnlyLinkProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-ink-900/60 px-3 py-2 sm:col-span-2 lg:col-span-3">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
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
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
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
  if (game.externalSource && game.externalSource !== 'manual') {
    return `${game.platform} · ${game.externalSource}`;
  }

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
