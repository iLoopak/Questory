import { useMemo, useRef, useState } from 'react';
import {
  getGeneratedFallbackCover,
  getStoredArtworkSource,
  hasProtectedArtwork,
  hasRealArtwork,
  isMissingOrGeneratedCover,
  type ArtworkSource,
} from '../lib/gameCoverImages';
import { getSteamArtworkUrls } from '../lib/steamArtwork';
import { CollectionToolbar } from './CollectionToolbar';
import type { Game } from '../types/game';

type ArtworkAuditPanelProps = {
  games: Game[];
  onApplyArtworkUpdate: (gameId: string, changes: Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'coverImage'>>) => void;
  onEnrichGames: (gameIds: string[]) => void;
  onOpenDetails: (gameId: string) => void;
};

type ArtworkBulkSummary = {
  failedCount: number;
  fallbackGeneratedCount: number;
  fixedCount: number;
  skippedCount: number;
};

type ArtworkCandidate = {
  source: ArtworkSource;
  url: string;
};

type AuditBucket = 'missing' | 'fallback' | 'enriched';

const emptySummary: ArtworkBulkSummary = {
  failedCount: 0,
  fallbackGeneratedCount: 0,
  fixedCount: 0,
  skippedCount: 0,
};

const progressDelayMs = 120;

export function ArtworkAuditPanel({ games, onApplyArtworkUpdate, onEnrichGames, onOpenDetails }: ArtworkAuditPanelProps) {
  const [summary, setSummary] = useState<ArtworkBulkSummary | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [isFindingArtwork, setIsFindingArtwork] = useState(false);
  const shouldCancel = useRef(false);

  const audit = useMemo(() => getArtworkAudit(games), [games]);

  async function findMissingArtwork(targetGames = audit.needsRealArtwork) {
    shouldCancel.current = false;
    setIsFindingArtwork(true);
    setProgress({ completed: 0, total: targetGames.length });

    const nextSummary = { ...emptySummary };

    for (const game of targetGames) {
      if (shouldCancel.current) {
        nextSummary.skippedCount += 1;
        continue;
      }

      const result = applyBestArtwork(game);
      nextSummary.fixedCount += result.fixedCount;
      nextSummary.fallbackGeneratedCount += result.fallbackGeneratedCount;
      nextSummary.skippedCount += result.skippedCount;
      nextSummary.failedCount += result.failedCount;
      setProgress((currentProgress) => ({ ...currentProgress, completed: currentProgress.completed + 1 }));
      await delay(progressDelayMs);
    }

    setSummary(nextSummary);
    setIsFindingArtwork(false);
  }

  function applyBestArtwork(game: Game): ArtworkBulkSummary {
    const candidate = getBestRealArtworkCandidate(game);

    if (candidate && canApplyArtwork(game, candidate.source)) {
      onApplyArtworkUpdate(game.id, {
        artworkSource: candidate.source,
        artworkUpdatedAt: new Date().toISOString(),
        coverImage: candidate.url,
      });

      return { ...emptySummary, fixedCount: 1 };
    }

    if (!hasProtectedArtwork(game) && isMissingOrGeneratedCover(game.coverImage)) {
      onApplyArtworkUpdate(game.id, {
        artworkSource: 'generated-fallback',
        artworkUpdatedAt: new Date().toISOString(),
        coverImage: getGeneratedFallbackCover(game),
      });

      return { ...emptySummary, fallbackGeneratedCount: 1 };
    }

    return { ...emptySummary, skippedCount: 1 };
  }

  function applyRawgImages() {
    setSummary(runBulk(audit.enrichedWithoutAppliedCover, (game) => {
      if (!game.backgroundImage || !canApplyArtwork(game, 'rawg')) {
        return { ...emptySummary, skippedCount: 1 };
      }

      onApplyArtworkUpdate(game.id, {
        artworkSource: 'rawg',
        artworkUpdatedAt: new Date().toISOString(),
        coverImage: game.backgroundImage,
      });

      return { ...emptySummary, fixedCount: 1 };
    }));
  }

  function refreshSteamArtwork() {
    setSummary(runBulk(audit.steamMetadataWithoutCover, (game) => {
      if (typeof game.steamAppId !== 'number' || !canApplyArtwork(game, 'steam')) {
        return { ...emptySummary, skippedCount: 1 };
      }

      onApplyArtworkUpdate(game.id, {
        artworkSource: 'steam',
        artworkUpdatedAt: new Date().toISOString(),
        coverImage: getSteamArtworkUrls(game.steamAppId).library,
      });

      return { ...emptySummary, fixedCount: 1 };
    }));
  }

  function generateFallbackCovers() {
    setSummary(runBulk(audit.needsRealArtwork, (game) => {
      if (hasProtectedArtwork(game)) {
        return { ...emptySummary, skippedCount: 1 };
      }

      onApplyArtworkUpdate(game.id, {
        artworkSource: 'generated-fallback',
        artworkUpdatedAt: new Date().toISOString(),
        coverImage: getGeneratedFallbackCover(game),
      });

      return { ...emptySummary, fallbackGeneratedCount: 1 };
    }));
  }

  return (
    <section className="qs-glass min-w-0 overflow-hidden rounded-lg border lg:h-[calc(100vh-116px)]">
      <div className="flex h-full min-h-0 flex-col">
        <header className="border-b border-skyglass/15 bg-ink-950/70 p-2 sm:p-3">
          <CollectionToolbar
            title="Artwork"
            primaryAction={
              <button
                className="h-9 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                disabled={isFindingArtwork || audit.needsRealArtwork.length === 0}
                onClick={() => void findMissingArtwork()}
                type="button"
              >
                Find artwork
              </button>
            }
            actionMenu={
              <>
                <AuditActionButton disabled={isFindingArtwork || audit.needsRealArtwork.length === 0} onClick={() => void findMissingArtwork()}>
                  Fix missing artwork
                </AuditActionButton>
                <AuditActionButton disabled={isFindingArtwork || audit.enrichedWithoutAppliedCover.length === 0} onClick={applyRawgImages}>
                  Apply RAWG image
                </AuditActionButton>
                <AuditActionButton disabled={isFindingArtwork || audit.steamMetadataWithoutCover.length === 0} onClick={refreshSteamArtwork}>
                  Refresh Steam artwork
                </AuditActionButton>
                <AuditActionButton disabled={isFindingArtwork || audit.needsRealArtwork.length === 0} onClick={generateFallbackCovers}>
                  Generate fallbacks
                </AuditActionButton>
                <AuditActionButton
                  disabled={isFindingArtwork || audit.missingRawgMetadata.length === 0}
                  onClick={() => onEnrichGames(audit.missingRawgMetadata.map((game) => game.id))}
                >
                  Enrich metadata
                </AuditActionButton>
                <AuditActionButton
                  disabled={!isFindingArtwork}
                  onClick={() => {
                    shouldCancel.current = true;
                  }}
                >
                  Cancel
                </AuditActionButton>
              </>
            }
          />

          {isFindingArtwork ? (
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                <span>Finding artwork</span>
                <span>{progress.completed}/{progress.total}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full bg-mint transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : null}

          {summary ? (
            <div className="mt-4 rounded-md border border-mint/25 bg-mint/10 px-3 py-2 text-sm text-mint">
              Fixed {summary.fixedCount}, generated fallback {summary.fallbackGeneratedCount}, skipped {summary.skippedCount}, failed {summary.failedCount}.
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <ArtworkBucket title="Missing artwork" bucket="missing" games={audit.missingArtwork} onOpenDetails={onOpenDetails} />
            <ArtworkBucket title="Poor / fallback artwork" bucket="fallback" games={audit.fallbackArtwork} onOpenDetails={onOpenDetails} />
            <ArtworkBucket title="Enriched but cover not applied" bucket="enriched" games={audit.enrichedWithoutAppliedCover} onOpenDetails={onOpenDetails} />
          </div>
        </div>
      </div>
    </section>
  );
}

function getArtworkAudit(games: Game[]) {
  const missingArtwork = games.filter((game) => !game.coverImage?.trim());
  const fallbackArtwork = games.filter((game) => Boolean(game.coverImage?.trim()) && isMissingOrGeneratedCover(game.coverImage));
  const needsRealArtwork = games.filter((game) => !hasRealArtwork(game));
  const steamMetadataWithoutCover = games.filter((game) => typeof game.steamAppId === 'number' && !hasRealArtwork(game));
  const enrichedWithoutAppliedCover = games.filter((game) => {
    if (!game.backgroundImage || hasRealArtwork(game)) {
      return false;
    }

    return !hasProtectedArtwork(game);
  });

  return {
    enrichedWithoutAppliedCover,
    fallbackArtwork,
    missingArtwork,
    missingRawgMetadata: games.filter((game) => !game.rawgId && !game.metadataSource),
    needsRealArtwork,
    steamMetadataWithoutCover,
  };
}

function getBestRealArtworkCandidate(game: Game): ArtworkCandidate | null {
  if (hasProtectedArtwork(game)) {
    return null;
  }

  if (typeof game.steamAppId === 'number') {
    return { source: 'steam', url: getSteamArtworkUrls(game.steamAppId).library };
  }

  if (game.backgroundImage) {
    return { source: 'rawg', url: game.backgroundImage };
  }

  if (game.coverImage?.trim() && getStoredArtworkSource(game) === 'imported') {
    return { source: 'imported', url: game.coverImage };
  }

  return null;
}

function canApplyArtwork(game: Game, source: ArtworkSource) {
  if (source === 'generated-fallback') {
    return !hasProtectedArtwork(game);
  }

  if (getStoredArtworkSource(game) === 'user') {
    return false;
  }

  if (getStoredArtworkSource(game) === 'steam' && source !== 'steam') {
    return false;
  }

  return !hasRealArtwork(game) || getStoredArtworkSource(game) === source;
}

function runBulk(games: Game[], applyGame: (game: Game) => ArtworkBulkSummary) {
  return games.reduce<ArtworkBulkSummary>((summary, game) => {
    const result = applyGame(game);

    return {
      failedCount: summary.failedCount + result.failedCount,
      fallbackGeneratedCount: summary.fallbackGeneratedCount + result.fallbackGeneratedCount,
      fixedCount: summary.fixedCount + result.fixedCount,
      skippedCount: summary.skippedCount + result.skippedCount,
    };
  }, { ...emptySummary });
}

function AuditActionButton({ children, disabled, onClick }: { children: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="min-h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-500"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ArtworkBucket({ bucket, games, onOpenDetails, title }: { bucket: AuditBucket; games: Game[]; onOpenDetails: (gameId: string) => void; title: string }) {
  return (
    <section className="rounded-xl border border-white/10 bg-ink-950/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-white">{title}</h3>
      </div>

      <div className="mt-3 grid gap-2">
        {games.length > 0 ? games.slice(0, 30).map((game) => (
          <button
            key={`${bucket}-${game.id}`}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-mint/30 hover:bg-mint/10"
            onClick={() => onOpenDetails(game.id)}
            type="button"
          >
            <div className="font-semibold text-white">{game.title}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>{game.platform}</span>
              <span>•</span>
              <span>{getArtworkLabel(game)}</span>
              {game.rawgId ? <span>RAWG #{game.rawgId}</span> : null}
              {typeof game.steamAppId === 'number' ? <span>Steam #{game.steamAppId}</span> : null}
            </div>
          </button>
        )) : (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">No games in this bucket.</div>
        )}
      </div>
    </section>
  );
}

function getArtworkLabel(game: Game) {
  const source = getStoredArtworkSource(game);

  if (!game.coverImage?.trim()) {
    return 'No stored cover';
  }

  return source ? `${source} cover` : 'Unknown cover';
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
