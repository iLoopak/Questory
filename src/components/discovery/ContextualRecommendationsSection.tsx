import { useEffect, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { profileFingerprint } from '../../lib/userProfile';
import { fetchContextualRecommendations } from '../../services/contextualRecommendationsService';
import { DiscoveryGameCard, DiscoveryGameCardSkeleton } from './DiscoveryGameCard';

const SKELETON_COUNT = 5;

type Props = {
  game: Game;
  userGames: Game[];
  onSelectGame: (game: DiscoveryGame) => void;
  onAddToWishlist?: (game: DiscoveryGame) => void;
  onAddToLibrary?: (game: DiscoveryGame) => void;
};

export function ContextualRecommendationsSection({
  game,
  userGames,
  onSelectGame,
  onAddToWishlist,
  onAddToLibrary,
}: Props) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);

  // Trigger a full re-fetch only when the rawgId OR the profile fingerprint changes.
  // Library-only changes (wishlist add, status change that doesn't affect the
  // fingerprint) are handled by the second effect below which re-applies library
  // status from the service's cache without a new RAWG request.
  const fetchKeyRef = useRef<string | null>(null);

  const fetchKey = game.rawgId
    ? `${game.rawgId}:${profileFingerprint(userGames)}`
    : null;

  useEffect(() => {
    if (!fetchKey) {
      setCandidates([]);
      return;
    }

    // Only show skeleton + re-fetch when the fetch key actually changes.
    if (fetchKey === fetchKeyRef.current && candidates !== null) return;
    fetchKeyRef.current = fetchKey;

    let cancelled = false;
    if (candidates !== null) setCandidates(null); // show skeleton on key change

    fetchContextualRecommendations(game, userGames).then((result) => {
      if (!cancelled) setCandidates(result);
    });

    return () => { cancelled = true; };
    // game + userGames deliberately not in deps — we key off fetchKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  // Lightweight re-apply when userGames changes without a fetchKey change
  // (e.g., a wishlist or library badge needs updating after a quick-add action).
  useEffect(() => {
    if (candidates === null || !fetchKey) return;
    let cancelled = false;
    fetchContextualRecommendations(game, userGames).then((result) => {
      if (!cancelled) setCandidates(result);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userGames]);

  if (!game.rawgId) return null;
  if (candidates !== null && candidates.length === 0) return null;

  return (
    <section aria-label="Because You Liked This" className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Because You Liked This</h3>
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
