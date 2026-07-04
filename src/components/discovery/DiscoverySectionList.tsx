import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../../types/game';
import type { DiscoveryGame, DiscoverySection } from '../../lib/discovery';
import { buildDiscoveryCandidates, fetchDiscoverySections } from '../../services/discoveryService';
import { DiscoveryGameCard, DiscoveryGameCardSkeleton } from './DiscoveryGameCard';

const SKELETON_COUNT = 5;

type Props = {
  rawgId: number | undefined;
  userGames: Game[];
  onSelectGame: (game: DiscoveryGame) => void;
  onAddToWishlist?: (game: DiscoveryGame) => void;
  onAddToLibrary?: (game: DiscoveryGame) => void;
};

export function DiscoverySectionList({
  rawgId,
  userGames,
  onSelectGame,
  onAddToWishlist,
  onAddToLibrary,
}: Props) {
  const [rawSections, setRawSections] = useState<DiscoverySection[] | null>(null);

  useEffect(() => {
    if (!rawgId) {
      setRawSections([]);
      return;
    }

    let cancelled = false;
    setRawSections(null);

    fetchDiscoverySections(rawgId)
      .then((result) => { if (!cancelled) setRawSections(result); })
      .catch(() => { if (!cancelled) setRawSections([]); });

    return () => { cancelled = true; };
  }, [rawgId]);

  // Apply library-aware filtering and ranking on every userGames change so
  // adding a game from a discovery card immediately updates the list.
  const candidates = useMemo(
    () => (rawSections ? buildDiscoveryCandidates(rawSections, userGames) : null),
    [rawSections, userGames],
  );

  if (candidates !== null && candidates.length === 0) return null;

  return (
    <section aria-label="You Might Also Like" className="space-y-3">
      <h3 className="text-sm font-semibold text-white">You Might Also Like</h3>
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
