import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getSteamArtworkUrls } from '../lib/steamArtwork';
import type { Game, GameStatus } from '../types/game';
import { gameStatuses } from '../types/game';

type GameDetailViewProps = {
  game: Game;
  onBack: () => void;
  onTrackingChange: (gameId: string, tracking: Pick<Game, 'notes' | 'status' | 'tags'>) => void;
};

export function GameDetailView({ game, onBack, onTrackingChange }: GameDetailViewProps) {
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [tagText, setTagText] = useState(() => game.tags.join(', '));

  const coverSources = useMemo(() => {
    if (typeof game.steamAppId === 'number') {
      const artworkUrls = getSteamArtworkUrls(game.steamAppId);
      return [artworkUrls.library, artworkUrls.header, artworkUrls.capsule];
    }

    return game.coverImage ? [game.coverImage] : [];
  }, [game.coverImage, game.steamAppId]);

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
    setTagText(game.tags.join(', '));
  }, [coverSources, game.id, game.tags]);

  const activeCoverSource = coverSources[coverSourceIndex];
  const parsedTags = useMemo(() => parseTags(tagText), [tagText]);

  function updateTracking(changes: Partial<Pick<Game, 'notes' | 'status' | 'tags'>>) {
    onTrackingChange(game.id, {
      notes: changes.notes ?? game.notes,
      status: changes.status ?? game.status,
      tags: changes.tags ?? game.tags,
    });
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-ink-900/70 lg:h-[calc(100vh-116px)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-3 border-b border-white/10 bg-ink-950/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <button
              className="mb-2 text-sm font-medium text-mint transition hover:text-white"
              onClick={onBack}
              type="button"
            >
              Back to library
            </button>
            <h2 className="truncate text-2xl font-semibold text-white">{game.title}</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-md border border-white/10 bg-ink-900 px-3 py-2 text-sm text-slate-300">
              {game.platform}
            </span>
            <span className="rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-sm font-medium text-mint">
              {game.status}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-white/10 bg-ink-800 shadow-panel">
                <div className="aspect-[2/3] bg-ink-700">
                  {activeCoverSource ? (
                    <div className="relative h-full">
                      {!isCoverLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
                      <img
                        alt=""
                        className={`h-full w-full object-cover transition-opacity duration-300 ${
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
                        <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                          No cover
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {game.backgroundImage ? (
                <section className="overflow-hidden rounded-lg border border-white/10 bg-ink-800">
                  <img
                    alt=""
                    className="aspect-video w-full bg-ink-700 object-cover"
                    decoding="async"
                    loading="lazy"
                    src={game.backgroundImage}
                  />
                </section>
              ) : null}
            </div>

            <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
              <DetailSection kicker="Editable" title="My tracking">
                <div className="grid gap-3 sm:grid-cols-3">
                  <ReadOnlyField label="Playtime" value={`${game.playtimeHours}h`} />
                  <ReadOnlyField label="Last played" value={formatDate(game.lastPlayedAt)} />
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</span>
                    <select
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
                      value={game.status}
                      onChange={(event) => updateTracking({ status: event.target.value as GameStatus })}
                    >
                      {gameStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Custom tags</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    value={tagText}
                    onBlur={() => {
                      setTagText(parsedTags.join(', '));
                      updateTracking({ tags: parsedTags });
                    }}
                    onChange={(event) => setTagText(event.target.value)}
                    placeholder="cozy, backlog, handheld"
                    type="text"
                  />
                </label>

                {parsedTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {parsedTags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</span>
                  <textarea
                    className="mt-2 min-h-32 w-full resize-y rounded-md border border-white/10 bg-ink-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    value={game.notes}
                    onChange={(event) => updateTracking({ notes: event.target.value })}
                    placeholder="What matters about this game?"
                  />
                </label>
              </DetailSection>

              {game.collectionType === 'wishlist' ? (
                <DetailSection kicker="Wishlist" title="Wishlist planning">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReadOnlyField label="Priority" value={game.priority ?? 'medium'} />
                    <ReadOnlyField label="Expected playtime" value={formatHours(game.expectedPlaytime)} />
                    <ReadOnlyField label="Price target" value={game.priceTarget || 'n/a'} />
                    <ReadOnlyField label="Release date" value={game.releaseDate || 'n/a'} />
                    <ReadOnlyLink label="Store URL" value={game.storeUrl} />
                  </div>
                </DetailSection>
              ) : null}

              <DetailSection kicker="Read-only" title="Steam data">
                {game.externalSource === 'steam' || typeof game.steamAppId === 'number' || game.externalUrl ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReadOnlyField label="Steam App ID" value={game.steamAppId?.toString() ?? 'n/a'} />
                    <ReadOnlyField label="Imported" value={formatDateTime(game.importedAt)} />
                    <ReadOnlyField label="Source" value={game.externalSource ?? 'n/a'} />
                    <ReadOnlyLink label="External URL" value={game.externalUrl} />
                  </div>
                ) : (
                  <EmptyState text="No Steam metadata is attached to this game yet." />
                )}
              </DetailSection>

              <DetailSection kicker="Read-only" title="RAWG metadata">
                {game.metadataSource === 'rawg' ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ReadOnlyField label="Released" value={game.released ?? 'Unknown'} />
                      <ReadOnlyField label="Metacritic" value={game.metacritic?.toString() ?? 'n/a'} />
                      <ReadOnlyField label="Average playtime" value={formatHours(game.averagePlaytime)} />
                      <ReadOnlyField label="Updated" value={formatDateTime(game.metadataUpdatedAt)} />
                      <ReadOnlyField label="Developers" value={formatList(game.developers)} />
                      <ReadOnlyField label="Publishers" value={formatList(game.publishers)} />
                    </div>

                    <ChipGroup label="Genres" values={game.genres} accent="mint" />
                    <ChipGroup label="RAWG tags" values={game.rawgTags} />
                  </div>
                ) : (
                  <EmptyState text="No RAWG metadata is attached to this game yet." />
                )}
              </DetailSection>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type DetailSectionProps = {
  children: ReactNode;
  kicker: string;
  title: string;
};

function DetailSection({ children, kicker, title }: DetailSectionProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-ink-800 p-4">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{kicker}</div>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

type ReadOnlyFieldProps = {
  label: string;
  value: string;
};

function ReadOnlyField({ label, value }: ReadOnlyFieldProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-ink-950 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm text-slate-200">{value}</div>
    </div>
  );
}

type ReadOnlyLinkProps = {
  label: string;
  value?: string;
};

function ReadOnlyLink({ label, value }: ReadOnlyLinkProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-ink-950 px-3 py-2 sm:col-span-2">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
      {value ? (
        <a className="mt-1 block truncate text-sm text-mint transition hover:text-white" href={value} rel="noreferrer" target="_blank">
          {value}
        </a>
      ) : (
        <div className="mt-1 text-sm text-slate-200">n/a</div>
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
  return <div className="rounded-md border border-dashed border-white/15 bg-ink-950/60 p-4 text-sm text-slate-400">{text}</div>;
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
