import { useEffect, useState } from 'react';
import type { Game } from '../../types/game';
import type { DiscoveryGame, DiscoverySection } from '../../lib/discovery';
import { fetchDiscoverySections } from '../../services/discoveryService';
import { DiscoveryGameCard, DiscoveryGameCardSkeleton } from './DiscoveryGameCard';

const SKELETON_COUNT = 5;

type Props = {
  rawgId: number | undefined;
  userGames: Game[];
  onSelectGame: (game: DiscoveryGame) => void;
};

export function DiscoverySectionList({ rawgId, userGames, onSelectGame }: Props) {
  const [sections, setSections] = useState<DiscoverySection[] | null>(null);

  useEffect(() => {
    if (!rawgId) {
      setSections([]);
      return;
    }

    let cancelled = false;
    setSections(null);

    fetchDiscoverySections(rawgId)
      .then((result) => { if (!cancelled) setSections(result); })
      .catch(() => { if (!cancelled) setSections([]); });

    return () => { cancelled = true; };
  }, [rawgId]);

  if (sections !== null && sections.length === 0) return null;

  return (
    <div className="space-y-4">
      {sections === null ? (
        <DiscoverySkeletonSection />
      ) : (
        sections.map((section) => (
          <DiscoverySectionRow
            key={section.id}
            section={section}
            userGames={userGames}
            onSelectGame={onSelectGame}
          />
        ))
      )}
    </div>
  );
}

function DiscoverySectionRow({
  section,
  userGames,
  onSelectGame,
}: {
  section: DiscoverySection;
  userGames: Game[];
  onSelectGame: (game: DiscoveryGame) => void;
}) {
  return (
    <section aria-label={section.title} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">{section.title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {section.games.map((game) => {
          const libraryMatch = userGames.find((g) => g.rawgId === game.rawgId);
          return (
            <DiscoveryGameCard
              key={game.rawgId}
              game={game}
              userGames={userGames}
              onClick={libraryMatch ? () => onSelectGame(game) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

function DiscoverySkeletonSection() {
  return (
    <section aria-label="Loading recommendations" aria-busy="true" className="space-y-3">
      <div className="h-4 w-40 animate-pulse rounded bg-ink-800" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <DiscoveryGameCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
