import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { getUserProfileReadiness } from '../../lib/userProfile';
import { fetchPersonalRecommendations } from '../../services/personalRecommendationsService';
import { DiscoveryCompactCard, DiscoveryCompactCardSkeleton } from './DiscoveryGameCard';

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
  inboxRawgIds: Set<number>;
  onSelectGame: (game: DiscoveryGame) => void;
  onAddToInbox?: (game: DiscoveryGame, reason: string) => void;
};

function PersonalRecommendationsLoaded({
  userGames,
  inboxRawgIds,
  onSelectGame,
  onAddToInbox,
}: LoadedProps) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);

  const lastFingerprintRef = useRef<string | null>(null);

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

    fetchPersonalRecommendations(userGames, inboxRawgIds).then((result) => {
      if (!cancelled) setCandidates(result);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  // Re-apply library/inbox status when userGames or inboxRawgIds changes without a
  // fingerprint change (e.g., adding a game to wishlist or inbox).
  useEffect(() => {
    if (candidates === null) return;
    let cancelled = false;
    fetchPersonalRecommendations(userGames, inboxRawgIds).then((result) => {
      if (!cancelled) setCandidates(result);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userGames, inboxRawgIds]);

  if (candidates !== null && candidates.length === 0) return null;

  return (
    <section aria-label="Recommended For You" className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">Recommended For You</h3>
        <p className="mt-0.5 text-xs text-slate-500">Tap a game to save it to your Discovery Inbox</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {candidates === null ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => <DiscoveryCompactCardSkeleton key={i} />)
        ) : (
          candidates.map((candidate) => (
            <DiscoveryCompactCard
              key={candidate.game.rawgId}
              candidate={candidate}
              onClick={(game, reason) => {
                if (!candidate.libraryStatus && !candidate.inboxStatus && onAddToInbox) {
                  onAddToInbox(game, reason);
                } else if (candidate.libraryStatus === 'library') {
                  onSelectGame(game);
                }
              }}
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
  inboxRawgIds: Set<number>;
  onSelectGame: (game: DiscoveryGame) => void;
  onAddToInbox?: (game: DiscoveryGame, reason: string) => void;
};

export function PersonalRecommendationsSection({
  userGames,
  inboxRawgIds,
  onSelectGame,
  onAddToInbox,
}: Props) {
  const readiness = useMemo(() => getUserProfileReadiness(userGames), [userGames]);

  if (!readiness.ready) {
    return <ColdStart progress={readiness.progress} />;
  }

  return (
    <PersonalRecommendationsLoaded
      userGames={userGames}
      inboxRawgIds={inboxRawgIds}
      onSelectGame={onSelectGame}
      onAddToInbox={onAddToInbox}
    />
  );
}
