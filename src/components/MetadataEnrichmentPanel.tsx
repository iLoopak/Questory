import { useMemo, useRef, useState } from 'react';
import { getCachedRawgMetadata, saveRawgMetadataCacheEntry } from '../lib/rawgMetadataCache';
import {
  getHighConfidenceThreshold,
  getSuggestedConfidenceThreshold,
  isHighConfidenceMatch,
  isSuggestedMatch,
  normalizeTitle,
  rankRawgMatches,
  type RawgMatchScore,
} from '../lib/rawgMatchScoring';
import { getGameDetails, mapRawgDetailsToMetadata, RawgApiError, searchGameByName } from '../services/rawgApi';
import type { Game } from '../types/game';
import type { RawgMetadata, RawgSearchResult } from '../types/rawg';

type MetadataEnrichmentPanelProps = {
  games: Game[];
  onMetadataManagementChange: (
    gameId: string,
    changes: Pick<Game, 'metadataManualManagedAt' | 'metadataSkippedAt'>,
  ) => void;
  onMetadataUpdate: (gameId: string, metadata: RawgMetadata) => void;
};

type EnrichmentStatus =
  | 'idle'
  | 'searching'
  | 'needs-review'
  | 'suggested'
  | 'enriched'
  | 'cached'
  | 'skipped'
  | 'manual'
  | 'rate-limited'
  | 'error';

type EnrichmentState = {
  matches?: RawgMatchScore[];
  message: string;
  status: EnrichmentStatus;
};

type ManualPickerState = {
  game: Game;
  matches: RawgMatchScore[];
};

const queueDelayMs = 250;

export function MetadataEnrichmentPanel({
  games,
  onMetadataManagementChange,
  onMetadataUpdate,
}: MetadataEnrichmentPanelProps) {
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
  const [enrichmentStateByGameId, setEnrichmentStateByGameId] = useState<Record<string, EnrichmentState>>({});
  const [manualPicker, setManualPicker] = useState<ManualPickerState | null>(null);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const shouldStopQueue = useRef(false);

  const missingMetadataGames = useMemo(() => {
    return games.filter((game) => game.metadataSource !== 'rawg');
  }, [games]);

  const queueableGames = missingMetadataGames.filter((game) => {
    return !game.metadataManualManagedAt && !game.metadataSkippedAt;
  });
  const selectedQueueableGames = queueableGames.filter((game) => selectedGameIds.has(game.id));
  const enrichedCount = games.length - missingMetadataGames.length;
  const reviewGames = queueableGames.filter((game) => {
    const state = enrichmentStateByGameId[game.id];
    return state?.status === 'suggested' || state?.status === 'needs-review';
  });

  function setGameState(gameId: string, state: EnrichmentState) {
    setEnrichmentStateByGameId((currentState) => ({
      ...currentState,
      [gameId]: state,
    }));
  }

  function toggleSelected(gameId: string) {
    setSelectedGameIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (nextSelection.has(gameId)) {
        nextSelection.delete(gameId);
      } else {
        nextSelection.add(gameId);
      }

      return nextSelection;
    });
  }

  async function enrichGame(game: Game, openManualPickerForLowConfidence: boolean) {
    setGameState(game.id, {
      status: 'searching',
      message: 'Searching RAWG...',
    });

    const cachedMetadata = getCachedRawgMetadata(game.title);

    if (cachedMetadata) {
      onMetadataUpdate(game.id, cachedMetadata.metadata);
      setGameState(game.id, {
        status: 'cached',
        message: `Used cached RAWG match #${cachedMetadata.rawgId}.`,
      });
      return 'enriched';
    }

    try {
      const matches = rankRawgMatches(game, await searchRawgWithFallback(game.title));
      const bestMatch = matches[0];

      if (bestMatch && isHighConfidenceMatch(bestMatch)) {
        await saveMatch(game, bestMatch.result.id);
        setGameState(game.id, {
          status: 'enriched',
          message: `Matched ${bestMatch.result.name} at ${bestMatch.confidence}% confidence.`,
        });
        return 'enriched';
      }

      if (bestMatch && isSuggestedMatch(bestMatch)) {
        setGameState(game.id, {
          status: 'suggested',
          message: `Suggested ${bestMatch.result.name} at ${bestMatch.confidence}% confidence. Confirm before saving.`,
          matches,
        });

        return 'needs-review';
      }

      setGameState(game.id, {
        status: 'needs-review',
        message: matches.length > 0 ? 'Needs manual match selection.' : 'No RAWG matches found.',
        matches,
      });

      if (openManualPickerForLowConfidence && matches.length > 0) {
        setManualPicker({ game, matches });
      }

      return 'needs-review';
    } catch (error) {
      const message =
        error instanceof RawgApiError
          ? error.message
          : 'RAWG enrichment failed. Check the API key and network access.';
      const status = error instanceof RawgApiError && error.code === 'rate-limit' ? 'rate-limited' : 'error';

      setGameState(game.id, {
        status,
        message,
      });

      return status;
    }
  }

  async function saveMatch(game: Game, rawgId: number) {
    const details = await getGameDetails(rawgId);
    const metadata = mapRawgDetailsToMetadata(details);
    onMetadataUpdate(game.id, metadata);
    saveRawgMetadataCacheEntry({
      gameTitle: game.title,
      rawgId,
      metadata,
      cachedAt: new Date().toISOString(),
    });
  }

  async function pickManualMatch(game: Game, rawgId: number) {
    setGameState(game.id, {
      status: 'searching',
      message: 'Saving selected RAWG match...',
    });

    try {
      await saveMatch(game, rawgId);
      setGameState(game.id, {
        status: 'enriched',
        message: 'Saved selected RAWG metadata.',
      });
      setManualPicker(null);
    } catch (error) {
      setGameState(game.id, {
        status: error instanceof RawgApiError && error.code === 'rate-limit' ? 'rate-limited' : 'error',
        message: error instanceof RawgApiError ? error.message : 'Selected RAWG match failed.',
      });
    }
  }

  async function acceptSuggestedMatch(game: Game, match: RawgMatchScore) {
    setGameState(game.id, {
      status: 'searching',
      message: `Saving suggested RAWG match ${match.result.name}...`,
    });

    try {
      await saveMatch(game, match.result.id);
      setGameState(game.id, {
        status: 'enriched',
        message: `Saved suggested RAWG match ${match.result.name}.`,
      });
    } catch (error) {
      setGameState(game.id, {
        status: error instanceof RawgApiError && error.code === 'rate-limit' ? 'rate-limited' : 'error',
        message: error instanceof RawgApiError ? error.message : 'Suggested RAWG match failed.',
      });
    }
  }

  async function runQueue(targetGames: Game[]) {
    shouldStopQueue.current = false;
    setIsQueueRunning(true);
    setProgress({ completed: 0, total: targetGames.length });

    for (const game of targetGames) {
      if (shouldStopQueue.current) {
        break;
      }

      const result = await enrichGame(game, false);
      setProgress((currentProgress) => ({
        ...currentProgress,
        completed: currentProgress.completed + 1,
      }));

      if (result === 'rate-limited') {
        shouldStopQueue.current = true;
        break;
      }

      await delay(queueDelayMs);
    }

    setIsQueueRunning(false);
  }

  function skipGame(game: Game) {
    onMetadataManagementChange(game.id, {
      metadataSkippedAt: new Date().toISOString(),
      metadataManualManagedAt: undefined,
    });
    setGameState(game.id, {
      status: 'skipped',
      message: 'Skipped for now.',
    });
  }

  function markManual(game: Game) {
    onMetadataManagementChange(game.id, {
      metadataManualManagedAt: new Date().toISOString(),
      metadataSkippedAt: undefined,
    });
    setGameState(game.id, {
      status: 'manual',
      message: 'Marked as manually managed.',
    });
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-ink-900/70 lg:h-[calc(100vh-116px)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-white/10 bg-ink-950/70 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Metadata Enrichment</h2>
              <p className="mt-1 text-sm text-slate-400">
                {missingMetadataGames.length} games are missing RAWG metadata. {enrichedCount} already enriched.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                disabled={isQueueRunning || queueableGames.length === 0}
                onClick={() => void runQueue(queueableGames)}
                type="button"
              >
                Enrich all
              </button>
              <button
                className="h-10 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                disabled={isQueueRunning || selectedQueueableGames.length === 0}
                onClick={() => void runQueue(selectedQueueableGames)}
                type="button"
              >
                Enrich selected
              </button>
              <button
                className="h-10 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                disabled={!isQueueRunning}
                onClick={() => {
                  shouldStopQueue.current = true;
                }}
                type="button"
              >
                Stop enrichment
              </button>
            </div>
          </div>

          {isQueueRunning ? (
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                <span>Progress</span>
                <span>
                  {progress.completed}/{progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full bg-mint transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : null}

          {!isQueueRunning && reviewGames.length > 0 ? (
            <div className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
              {reviewGames.length} games need review. Suggested matches can be accepted below or opened for a different match.
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {missingMetadataGames.length > 0 ? (
            <div className="grid gap-3">
              {missingMetadataGames.map((game) => (
                <EnrichmentRow
                  key={game.id}
                  game={game}
                  isQueueRunning={isQueueRunning}
                  isSelected={selectedGameIds.has(game.id)}
                  state={enrichmentStateByGameId[game.id]}
                  onAcceptSuggested={(match) => void acceptSuggestedMatch(game, match)}
                  onFind={() => void enrichGame(game, true)}
                  onManual={() => markManual(game)}
                  onRetry={() => void enrichGame(game, true)}
                  onReview={(matches) => setManualPicker({ game, matches })}
                  onSkip={() => skipGame(game)}
                  onToggleSelected={() => toggleSelected(game.id)}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-white/15 bg-ink-950/50 p-8 text-center">
              <div>
                <h3 className="text-lg font-semibold text-white">Metadata is complete</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  Every local game currently has RAWG metadata attached.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {manualPicker ? (
        <ManualMatchDialog
          matches={manualPicker.matches}
          onClose={() => setManualPicker(null)}
          onPick={(rawgId) => void pickManualMatch(manualPicker.game, rawgId)}
        />
      ) : null}
    </section>
  );
}

type EnrichmentRowProps = {
  game: Game;
  isQueueRunning: boolean;
  isSelected: boolean;
  onAcceptSuggested: (match: RawgMatchScore) => void;
  onFind: () => void;
  onManual: () => void;
  onRetry: () => void;
  onReview: (matches: RawgMatchScore[]) => void;
  onSkip: () => void;
  onToggleSelected: () => void;
  state?: EnrichmentState;
};

function EnrichmentRow({
  game,
  isQueueRunning,
  isSelected,
  onAcceptSuggested,
  onFind,
  onManual,
  onRetry,
  onReview,
  onSkip,
  onToggleSelected,
  state,
}: EnrichmentRowProps) {
  const status = getDisplayStatus(game, state);
  const canReview = state?.status === 'needs-review' && state.matches && state.matches.length > 0;
  const suggestedMatch = state?.matches?.[0];
  const canAcceptSuggested = Boolean(state?.status === 'suggested' && suggestedMatch && isSuggestedMatch(suggestedMatch));

  return (
    <article className="grid gap-3 rounded-lg border border-white/10 bg-ink-800 p-3 sm:grid-cols-[auto_76px_minmax(0,1fr)] sm:items-center">
      <input
        aria-label={`Select ${game.title}`}
        checked={isSelected}
        className="h-5 w-5 accent-mint"
        disabled={isQueueRunning || Boolean(game.metadataManualManagedAt || game.metadataSkippedAt)}
        onChange={onToggleSelected}
        type="checkbox"
      />

      {game.coverImage ? (
        <img
          alt=""
          className="aspect-[2/3] w-full rounded-md bg-ink-700 object-cover sm:w-[76px]"
          decoding="async"
          loading="lazy"
          src={game.coverImage}
        />
      ) : (
        <div className="grid aspect-[2/3] w-full place-items-center rounded-md bg-ink-700 text-lg font-semibold text-mint sm:w-[76px]">
          {game.title.slice(0, 1).toUpperCase()}
        </div>
      )}

      <div className="min-w-0">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-white">{game.title}</h3>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>{game.platform}</span>
              <span>{status.label}</span>
              {state?.message ? <span>{state.message}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
              disabled={isQueueRunning}
              onClick={onFind}
              type="button"
            >
              Find metadata
            </button>
            {canAcceptSuggested ? (
              <button
                className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
                onClick={() => {
                  if (suggestedMatch) {
                    onAcceptSuggested(suggestedMatch);
                  }
                }}
                type="button"
              >
                Accept suggested match
              </button>
            ) : null}
            <button
              className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
              disabled={isQueueRunning}
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
            {canReview || canAcceptSuggested ? (
              <button
                className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
                onClick={() => onReview(state.matches ?? [])}
                type="button"
              >
                Choose different match
              </button>
            ) : null}
            <button
              className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
              disabled={isQueueRunning}
              onClick={onSkip}
              type="button"
            >
              Skip
            </button>
            <button
              className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
              disabled={isQueueRunning}
              onClick={onManual}
              type="button"
            >
              Mark as manually managed
            </button>
          </div>
        </div>

        {state?.matches && state.matches.length > 0 ? (
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <div>
              Best match confidence: {state.matches[0].confidence}% - auto at {getHighConfidenceThreshold()}%,
              suggested review at {getSuggestedConfidenceThreshold()}%.
            </div>
            <div className="flex flex-wrap gap-2">
              {state.matches[0].reasons.map((reason) => (
                <span key={reason} className="rounded-full bg-white/10 px-2 py-1 text-slate-300">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

type ManualMatchDialogProps = {
  matches: RawgMatchScore[];
  onClose: () => void;
  onPick: (rawgId: number) => void;
};

function ManualMatchDialog({ matches, onClose, onPick }: ManualMatchDialogProps) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4">
      <section className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg border border-white/10 bg-ink-900 shadow-panel">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-ink-950 p-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Pick RAWG match</h3>
            <p className="mt-1 text-sm text-slate-400">Suggested and low-confidence results need a human choice before saving.</p>
          </div>
          <button className="h-9 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="max-h-[calc(88vh-88px)] overflow-y-auto p-4">
          <div className="grid gap-3">
            {matches.map((match) => (
              <button
                key={match.result.id}
                className="grid gap-3 rounded-md border border-white/10 bg-ink-800 p-3 text-left transition hover:border-mint/50 sm:grid-cols-[96px_minmax(0,1fr)]"
                onClick={() => onPick(match.result.id)}
                type="button"
              >
                {match.result.background_image ? (
                  <img
                    alt=""
                    className="aspect-video w-full rounded bg-ink-700 object-cover sm:w-24"
                    decoding="async"
                    loading="lazy"
                    src={match.result.background_image}
                  />
                ) : (
                  <div className="aspect-video w-full rounded bg-ink-700 sm:w-24" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{match.result.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {getYearLabel(match.result.released)} - {match.confidence}% confidence
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {match.reasons.map((reason) => (
                      <span key={reason} className="rounded-full bg-mint/10 px-2 py-1 text-xs text-mint">
                        {reason}
                      </span>
                    ))}
                  </div>
                  {match.result.genres && match.result.genres.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {match.result.genres.slice(0, 5).map((genre) => (
                        <span key={genre.id} className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">
                          {genre.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function getDisplayStatus(game: Game, state?: EnrichmentState) {
  if (state) {
    return {
      label: state.status.replace('-', ' '),
    };
  }

  if (game.metadataManualManagedAt) {
    return { label: 'manually managed' };
  }

  if (game.metadataSkippedAt) {
    return { label: 'skipped' };
  }

  return { label: 'missing RAWG metadata' };
}

function getYearLabel(value: string | null) {
  return value ? value.slice(0, 4) : 'Unknown year';
}

async function searchRawgWithFallback(title: string) {
  const queries = getRawgSearchQueries(title);
  const resultsById = new Map<number, RawgSearchResult>();
  let lastError: unknown = null;

  for (const query of queries) {
    try {
      const results = await searchGameByName(query);
      results.forEach((result) => resultsById.set(result.id, result));
    } catch (error) {
      lastError = error;
    }
  }

  const results = Array.from(resultsById.values());

  if (results.length > 0) {
    return results;
  }

  throw lastError ?? new RawgApiError('No RAWG matches found for this title.', 'no-match');
}

function getRawgSearchQueries(title: string) {
  const normalizedTitle = normalizeTitle(title);
  const titleWithoutSubtitle = title.split(/\s+[-:]\s+/)[0]?.trim() ?? title;

  return Array.from(new Set([title.trim(), normalizedTitle, titleWithoutSubtitle].filter(Boolean)));
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
