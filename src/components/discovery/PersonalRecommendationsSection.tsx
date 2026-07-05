import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { getUserProfileReadiness } from '../../lib/userProfile';
import { fetchPersonalRecommendations } from '../../services/personalRecommendationsService';
import { DiscoveryGameCard, DiscoveryGameCardSkeleton } from './DiscoveryGameCard';

const SKELETON_COUNT = 5;

// ---------------------------------------------------------------------------
// Cold start
// ---------------------------------------------------------------------------

function ColdStart({ progress }: { progress: number }) {
  return (
    <section
      aria-label="Recommended For You"
      className="rounded-2xl border border-white/8 bg-ink-950/60 p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold text-white">Recommended For You</h3>
      <p className="text-xs text-slate-400 leading-relaxed">
        Questory is learning your gaming taste.
      </p>
      <p className="text-xs text-slate-600 leading-relaxed">
        Play and finish more games to unlock recommendations tailored just for you.
      </p>
      <div className="space-y-1.5 pt-1">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/6">
          <div
            className="h-full rounded-full bg-mint/40 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loaded section (fetches recommendations)
// ---------------------------------------------------------------------------

type LoadedProps = {
  userGames: Game[];
  onSelectGame: (game: DiscoveryGame) => void;
  onAddToWishlist?: (game: DiscoveryGame) => void;
  onAddToLibrary?: (game: DiscoveryGame) => void;
};

function PersonalRecommendationsLoaded({
  userGames,
  onSelectGame,
  onAddToWishlist,
  onAddToLibrary,
}: LoadedProps) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);

  // Track the fingerprint so we only re-fetch when the profile meaningfully changes.
  const lastFingerprintRef = useRef<string | null>(null);

  // A lightweight fingerprint derived from the games array — cheaper than
  // re-deriving the full profile on every render.
  const fingerprint = useMemo(() => {
    const finished = userGames.filter((g) => g.status === 'Finished').length;
    const withGenres = userGames.filter((g) => (g.genres?.length ?? 0) > 0).length;
    return `f${finished}:g${withGenres}`;
  }, [userGames]);

  useEffect(() => {
    if (fingerprint === lastFingerprintRef.current && candidates !== null) return;

    let cancelled = false;
    if (fingerprint !== lastFingerprintRef.current) setCandidates(null);
    lastFingerprintRef.current = fingerprint;

    fetchPersonalRecommendations(userGames).then((result) => {
      if (!cancelled) setCandidates(result);
    });

    return () => {
      cancelled = true;
    };
    // userGames deliberately omitted — we key off the stable fingerprint instead
    // so adding a single library/wishlist game without changing the profile doesn't
    // trigger a full RAWG re-fetch. Library status is re-applied inside the service.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  // After a quick-add action, userGames changes but the fingerprint may not.
  // Re-run fetchPersonalRecommendations (which re-applies library status from cache)
  // to update badge display without a new RAWG request.
  useEffect(() => {
    if (candidates === null) return;
    let cancelled = false;
    fetchPersonalRecommendations(userGames).then((result) => {
      if (!cancelled) setCandidates(result);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userGames]);

  if (candidates !== null && candidates.length === 0) return null;

  return (
    <section aria-label="Recommended For You" className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Recommended For You</h3>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {candidates === null ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => <DiscoveryGameCardSkeleton key={i} />)
        ) : (
          candidates.map((candidate) => (
            <DiscoveryGameCard
              key={candidate.game.rawgId}
              candidate={candidate}
              onOpenDetail={
                candidate.libraryStatus === 'library'
                  ? () => onSelectGame(candidate.game)
                  : undefined
              }
              onAddToWishlist={onAddToWishlist}
              onAddToLibrary={onAddToLibrary}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

type Props = {
  userGames: Game[];
  onSelectGame: (game: DiscoveryGame) => void;
  onAddToWishlist?: (game: DiscoveryGame) => void;
  onAddToLibrary?: (game: DiscoveryGame) => void;
};

export function PersonalRecommendationsSection({
  userGames,
  onSelectGame,
  onAddToWishlist,
  onAddToLibrary,
}: Props) {
  const readiness = useMemo(() => getUserProfileReadiness(userGames), [userGames]);

  if (!readiness.ready) {
    return <ColdStart progress={readiness.progress} />;
  }

  return (
    <PersonalRecommendationsLoaded
      userGames={userGames}
      onSelectGame={onSelectGame}
      onAddToWishlist={onAddToWishlist}
      onAddToLibrary={onAddToLibrary}
    />
  );
}
