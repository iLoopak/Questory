import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { profileFingerprint } from '../../lib/userProfile';
import { fetchContextualRecommendations } from '../../services/contextualRecommendationsService';
import { GameCard } from '../GameCard';

const SKELETON_COUNT = 5;

type Props = {
  game: Game;
  userGames: Game[];
  inboxRawgIds: Set<number>;
  onSelectGame: (game: DiscoveryGame) => void;
  onAddToInbox?: (game: DiscoveryGame, reason: string) => void;
  onOpenPreview?: (candidate: DiscoveryCandidate) => void;
  /** Section heading — defaults to the Game Hub's "Because You Liked This". */
  title?: string;
};

function candidateToGame(candidate: DiscoveryCandidate, userGames: Game[]): Game {
  const { game, libraryStatus } = candidate;
  if (libraryStatus !== null) {
    const real = userGames.find((g) => g.rawgId === game.rawgId);
    if (real) return real;
  }
  return {
    id: `similar-${game.rawgId}`,
    title: game.title,
    platform: game.hasSteamVersion ? 'Steam' : (game.platforms[0] ?? 'PC'),
    status: 'Want to play',
    coverImage: game.coverUrl ?? '',
    backgroundImage: game.coverUrl ?? null,
    playtimeHours: 0,
    tags: game.tags.slice(0, 5),
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    rawgId: game.rawgId,
    genres: game.genres,
    metacritic: game.metacritic ?? null,
    released: game.released,
  };
}

function metacriticBadgeClass(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function CarouselSkeleton() {
  return (
    <div className="w-64 shrink-0 overflow-hidden rounded-lg border border-skyglass/15 bg-ink-950/50 min-h-[260px] sm:min-h-[292px]">
      <div className="aspect-[16/9] max-h-32 animate-pulse bg-ink-800 sm:max-h-36" />
      <div className="space-y-2 p-3 sm:p-3.5">
        <div className="h-5 w-3/4 animate-pulse rounded bg-ink-800" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-ink-800" />
      </div>
    </div>
  );
}

export function ContextualRecommendationsSection({
  game,
  userGames,
  inboxRawgIds,
  onSelectGame,
  onAddToInbox,
  onOpenPreview,
  title = 'Because You Liked This',
}: Props) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);
  const fetchKeyRef = useRef<string | null>(null);

  const fetchKey = game.rawgId
    ? `${game.rawgId}:${profileFingerprint(userGames)}`
    : null;

  useEffect(() => {
    if (!fetchKey) {
      setCandidates([]);
      return;
    }

    if (fetchKey === fetchKeyRef.current && candidates !== null) return;
    fetchKeyRef.current = fetchKey;

    let cancelled = false;
    if (candidates !== null) setCandidates(null);

    fetchContextualRecommendations(game, userGames, inboxRawgIds).then((result) => {
      if (!cancelled) setCandidates(result);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  useEffect(() => {
    if (candidates === null || !fetchKey) return;
    let cancelled = false;
    fetchContextualRecommendations(game, userGames, inboxRawgIds).then((result) => {
      if (!cancelled) setCandidates(result);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userGames, inboxRawgIds]);

  const adaptedGames = useMemo(
    () => (candidates ?? []).map((c) => candidateToGame(c, userGames)),
    [candidates, userGames],
  );

  if (!game.rawgId) return null;
  if (candidates !== null && candidates.length === 0) return null;

  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {candidates === null ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => <CarouselSkeleton key={i} />)
        ) : (
          candidates.map((candidate, i) => {
            const adaptedGame = adaptedGames[i];
            if (!adaptedGame) return null;

            const isLibrary = candidate.libraryStatus === 'library';
            const canAddToInbox = !candidate.libraryStatus && !candidate.inboxStatus && onAddToInbox != null;
            const metacritic = candidate.game.metacritic;

            return (
              <div key={candidate.game.rawgId} className="w-64 shrink-0">
                <GameCard
                  game={adaptedGame}
                  suppressWantToPlayStatus={!isLibrary}
                  detailsLabel={isLibrary ? undefined : 'Preview'}
                  hideActionMenu
                  onOpenDetails={
                    isLibrary
                      ? () => onSelectGame(candidate.game)
                      : () => onOpenPreview?.(candidate)
                  }
                  primaryAction={
                    canAddToInbox
                      ? {
                          label: 'Review Later',
                          onClick: () => onAddToInbox!(candidate.game, candidate.reason ?? ''),
                        }
                      : undefined
                  }
                  coverBadgeTopRight={
                    metacritic ? (
                      <span
                        className={`absolute right-3 top-3 rounded-md bg-ink-950/85 px-1.5 py-0.5 text-xs font-bold tabular-nums backdrop-blur-sm ${metacriticBadgeClass(metacritic)}`}
                      >
                        {metacritic}
                      </span>
                    ) : undefined
                  }
                  discoveryContext={candidate.reason}
                />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
