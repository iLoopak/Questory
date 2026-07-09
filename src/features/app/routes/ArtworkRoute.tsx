import { ArtworkBrowserView } from '../../artwork/ArtworkBrowserView';
import type { AppSectionRouterProps } from '../AppSectionRouter';

type ArtworkRouteProps = Pick<AppSectionRouterProps, 'games' | 'updateGameArtwork' | 'startMetadataWorkflow' | 'refreshGameMetadataFromActions' | 'setSelectedGameId'>;
export function ArtworkRoute({ games, updateGameArtwork, startMetadataWorkflow, refreshGameMetadataFromActions, setSelectedGameId }: ArtworkRouteProps) {
  return <ArtworkBrowserView games={games} onApplyArtworkUpdate={updateGameArtwork} onEnrichGames={startMetadataWorkflow} onFindArtwork={(game, mode = 'artwork') => refreshGameMetadataFromActions(game, mode as 'metadata' | 'artwork')} onOpenDetails={setSelectedGameId} />;
}
