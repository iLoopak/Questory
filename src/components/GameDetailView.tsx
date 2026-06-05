import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import { canUseRawgImageAsCover, getGameCoverSources } from '../lib/gameCoverImages';
import type { Game, GamePlatform, GameStatus } from '../types/game';
import { AchievementProgressBadge } from './AchievementProgressBadge';
import { formatSteamAchievementSummary } from '../lib/steamAchievementSummary';
import { PlatformBadge } from './PlatformBadge';
import { useI18n } from '../i18n';

type GameDetailViewProps = {
  game: Game;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onBack: () => void;
  onIgnore?: (game: Game) => void;
  onSyncSteamData?: (game: Game) => void;
  isSteamDataSyncing?: boolean;
  onStatusChange?: (gameId: string, status: GameStatus) => void;
  onTrackingChange: (gameId: string, tracking: Pick<Game, 'notes' | 'status' | 'tags'> & Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'coverImage'>>) => void;
  platformQueueState?: PlatformQueueState;
};

type GameDetailAction = {
  icon: string;
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
  onIgnore,
  onSyncSteamData,
  isSteamDataSyncing = false,
  onStatusChange,
  onTrackingChange,
  platformQueueState,
}: GameDetailViewProps) {
  const { t } = useI18n();
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [tagText, setTagText] = useState(() => game.tags.join(', '));

  const coverSources = useMemo(() => {
    return getGameCoverSources(game);
  }, [game]);

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
    setTagText(game.tags.join(', '));
  }, [coverSources, game.id, game.tags]);

  const activeCoverSource = coverSources[coverSourceIndex];
  const parsedTags = useMemo(() => parseTags(tagText), [tagText]);
  const canApplyRawgCover = canUseRawgImageAsCover(game);
  const isSteamLibraryGame = game.collectionType === 'library' && typeof game.steamAppId === 'number';
  const hasPlaytime = game.playtimeHours > 0;
  const achievementSummary = formatSteamAchievementSummary(game);
  const platformLabel = getGamePlatformLabel(game, platformQueueState);

  function updateTracking(changes: Partial<Pick<Game, 'notes' | 'status' | 'tags'>>) {
    onTrackingChange(game.id, {
      notes: changes.notes ?? game.notes,
      status: changes.status ?? game.status,
      tags: changes.tags ?? game.tags,
    });
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
      icon: '📌',
      label: 'Quest Queue',
      onClick: () => onAddToQueue?.(game),
      tone: 'accent',
      disabled: !onAddToQueue,
    },
    {
      icon: '🎮',
      label: t('status.playing'),
      onClick: () => onStatusChange?.(game.id, 'Playing'),
      tone: 'accent',
      disabled: !onStatusChange,
    },
    {
      icon: '💖',
      label: t('wishlist.title'),
      onClick: () => onAddToWishlist?.(game),
      tone: 'neutral',
      disabled: !onAddToWishlist,
    },
    {
      icon: '🏆',
      label: t('action.finished'),
      onClick: () => onStatusChange?.(game.id, 'Finished'),
      tone: 'neutral',
      disabled: !onStatusChange,
    },
  ];
  const steamActions: GameDetailAction[] = isSteamLibraryGame
    ? [
        {
          icon: '🔄',
          label: isSteamDataSyncing ? t('detail.syncingSteamData') : t('detail.syncSteamData'),
          onClick: () => onSyncSteamData?.(game),
          tone: 'neutral',
          disabled: !onSyncSteamData || isSteamDataSyncing,
        },
      ]
    : [];

  const destructiveActions: GameDetailAction[] = [
    {
      icon: '🗑️',
      label: t('queue.drop'),
      onClick: () => onStatusChange?.(game.id, 'Dropped'),
      tone: 'danger',
      disabled: !onStatusChange,
    },
    {
      icon: '🚫',
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
                  <button className="text-sm font-medium text-mint transition hover:text-white" onClick={onBack} type="button">
                    Back to library
                  </button>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t('detail.dashboard')}</div>
                    <h2 className="mt-1 text-3xl font-semibold leading-tight text-white sm:text-4xl xl:truncate">{game.title}</h2>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 xl:max-w-3xl">
                    <HeroStat label={t('detail.platformSource')} value={formatPlatformSource(game)} badge={<PlatformBadge className="mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-semibold" platform={platformLabel} queueState={platformQueueState} />} />
                    <HeroStat label={t('detail.currentStatus')} value={game.status} accent />
                    {hasPlaytime ? <HeroStat label={t('detail.playtime')} value={`${game.playtimeHours}h`} /> : null}
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
                </div>
                <div className="min-w-4 flex-1" aria-hidden="true" />
                <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                  {primaryActions.map((action) => (
                    <GameDetailActionButton key={action.label} action={action} />
                  ))}
                </div>
              </div>
            </section>

            <DetailSection kicker={t('detail.editable')} title={t('detail.myInformation')} description={t('detail.myInformationHelp')}>
              <div className="grid gap-3 md:grid-cols-3">
                <PersonalStatField label={t('detail.playtime')} value={`${game.playtimeHours}h`} />
                <PersonalStatField label={t('detail.lastPlayed')} value={formatDate(game.lastPlayedAt)} />
                <PersonalStatField label={t('toolbar.status')} value={game.status} />
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
                    <ReadOnlyField label="Priority" value={game.priority ?? 'medium'} />
                    <ReadOnlyField label="Expected playtime" value={formatHours(game.expectedPlaytime)} />
                    <ReadOnlyField label="Price target" value={game.priceTarget || 'n/a'} />
                    <ReadOnlyField label="Release date" value={game.releaseDate || 'n/a'} />
                    <ReadOnlyField label="Steam price" value={game.steamPriceInfo || 'n/a'} />
                    <ReadOnlyField label="Steam discount" value={game.steamDiscountInfo || 'n/a'} />
                    <ReadOnlyField label="Steam reviews" value={game.steamReviewInfo || 'n/a'} />
                    <ReadOnlyField label="Wishlist imported" value={formatDateTime(game.wishlistImportedAt)} />
                    <ReadOnlyField label="Wishlist synced" value={formatDateTime(game.wishlistSyncedAt)} />
                    <ReadOnlyLink label="Store URL" value={game.storeUrl} />
                  </div>
                </MetadataAccordion>
              ) : null}

              <MetadataAccordion title={t('detail.steamData')} summary={t('detail.steamDataSummary')}>
                {game.externalSource === 'steam' || typeof game.steamAppId === 'number' || game.externalUrl ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ReadOnlyField label="Steam App ID" value={game.steamAppId?.toString() ?? 'n/a'} />
                    <ReadOnlyField label="Imported" value={formatDateTime(game.importedAt)} />
                    <ReadOnlyField label="Source" value={game.externalSource ?? 'n/a'} />
                    {achievementSummary ? <ReadOnlyField label={t('collection.achievements')} value={achievementSummary} /> : null}
                    {game.steamLastAchievementUnlockTime ? (
                      <ReadOnlyField label="Last achievement unlock" value={formatDateTime(new Date(game.steamLastAchievementUnlockTime * 1000).toISOString())} />
                    ) : null}
                    <ReadOnlyLink label="External URL" value={game.externalUrl} />
                  </div>
                ) : (
                  <EmptyState text={t('detail.noSteamMetadata')} />
                )}
              </MetadataAccordion>

              <MetadataAccordion title={t('detail.rawgMetadata')} summary={t('detail.rawgSummary')}>
                {game.metadataSource === 'rawg' ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <ReadOnlyField label="Released" value={game.released ?? 'Unknown'} />
                      <ReadOnlyField label="Metacritic" value={game.metacritic?.toString() ?? 'n/a'} />
                      <ReadOnlyField label="Average playtime" value={formatHours(game.averagePlaytime)} />
                      <ReadOnlyField label="Updated" value={formatDateTime(game.metadataUpdatedAt)} />
                      <ReadOnlyField label="Developers" value={formatList(game.developers)} />
                      <ReadOnlyField label="Publishers" value={formatList(game.publishers)} />
                    </div>

                    <ChipGroup label="Genres" values={game.genres} accent="mint" />
                    <ChipGroup label="RAWG tags" values={game.rawgTags} />
                    {canApplyRawgCover ? (
                      <button
                        className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
                        onClick={useRawgImageAsCover}
                        type="button"
                      >
                        Use RAWG image as cover
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState text={t('detail.noRawgMetadata')} />
                )}
              </MetadataAccordion>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
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
        <span aria-hidden="true" className="text-base leading-none">
          {action.icon}
        </span>
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
        <span className="text-slate-500 transition group-open:rotate-90" aria-hidden="true">
          ▶
        </span>
        <span className="text-slate-500" aria-hidden="true">
          🔒
        </span>
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
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        <span aria-hidden="true">🔒</span>
        <span>{label}</span>
      </div>
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
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        <span aria-hidden="true">🔒</span>
        <span>{label}</span>
      </div>
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
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        <span aria-hidden="true">🔒</span>
        <span>{label}</span>
      </div>
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

function formatPlatformSource(game: Game) {
  if (game.externalSource && game.externalSource !== 'manual') {
    return `${game.platform} · ${game.externalSource}`;
  }

  return game.platform;
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not started';
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatDateTime(value?: string) {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatHours(value?: number | null) {
  return typeof value === 'number' ? `${value}h` : 'n/a';
}

function formatList(value?: string[]) {
  return value && value.length > 0 ? value.join(', ') : 'n/a';
}
