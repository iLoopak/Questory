import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { PersonalRecommendationsSection } from '../discovery/PersonalRecommendationsSection';

type HomeRecommendationsSectionProps = {
  games: Game[];
  libraryGameCount: number;
  inboxRawgIds: Set<number>;
  onSelectGame?: (game: DiscoveryGame) => void;
  onOpenPreview?: (candidate: DiscoveryCandidate) => void;
  onOpenRawgSettings?: () => void;
};

export function HomeRecommendationsSection({
  games,
  libraryGameCount,
  inboxRawgIds,
  onSelectGame,
  onOpenPreview,
  onOpenRawgSettings,
}: HomeRecommendationsSectionProps) {
  if (!onSelectGame || libraryGameCount === 0) {
    return null;
  }

  return (
    <PersonalRecommendationsSection
      userGames={games}
      inboxRawgIds={inboxRawgIds}
      onSelectGame={onSelectGame}
      onOpenPreview={onOpenPreview}
      onOpenRawgSettings={onOpenRawgSettings}
    />
  );
}
