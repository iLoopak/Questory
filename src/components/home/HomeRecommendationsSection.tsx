import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { PersonalRecommendationsSection } from '../discovery/PersonalRecommendationsSection';

type HomeRecommendationsSectionProps = {
  games: Game[];
  libraryGameCount: number;
  inboxRawgIds: Set<number>;
  onSelectGame?: (game: DiscoveryGame) => void;
  onOpenPreview?: (candidate: DiscoveryCandidate) => void;
};

export function HomeRecommendationsSection({
  games,
  libraryGameCount,
  inboxRawgIds,
  onSelectGame,
  onOpenPreview,
}: HomeRecommendationsSectionProps) {
  if (!onSelectGame || libraryGameCount === 0) {
    return null;
  }

  return (
    <section className="qs-home-section min-w-0 overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/74 p-4 shadow-panel">
      <PersonalRecommendationsSection
        userGames={games}
        inboxRawgIds={inboxRawgIds}
        onSelectGame={onSelectGame}
        onOpenPreview={onOpenPreview}
      />
    </section>
  );
}
