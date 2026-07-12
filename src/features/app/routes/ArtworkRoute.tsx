import { ArtworkBrowserView } from '../../artwork/ArtworkBrowserView';
import type { AppRouterCoreModel, AppRouterGameModel, AppRouterMetadataModel } from './routeModels';

type ArtworkRouteProps = {
  core: Pick<AppRouterCoreModel, 'setSelectedGameId'>;
  games: Pick<AppRouterGameModel, 'games'>;
  metadata: Pick<AppRouterMetadataModel, 'updateGameArtwork' | 'startMetadataWorkflow' | 'refreshGameMetadataFromActions'>;
};

export function ArtworkRoute({ core, games, metadata }: ArtworkRouteProps) {
  return (
    <ArtworkBrowserView
      games={games.games}
      onApplyArtworkUpdate={metadata.updateGameArtwork}
      onEnrichGames={metadata.startMetadataWorkflow}
      onFindArtwork={(game, mode = 'artwork') => metadata.refreshGameMetadataFromActions(game, mode as 'metadata' | 'artwork')}
      onOpenDetails={core.setSelectedGameId}
    />
  );
}
