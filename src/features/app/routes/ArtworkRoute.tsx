import { ArtworkBrowserView } from '../../artwork/ArtworkBrowserView';
import type { AppSectionRouteModel } from '../AppSectionRouter';

type ArtworkRouteProps = Pick<AppSectionRouteModel, 'games' | 'updateGameArtwork' | 'startMetadataWorkflow' | 'refreshGameMetadataFromActions' | 'setSelectedGameId'>;
export function ArtworkRoute({ games, updateGameArtwork, startMetadataWorkflow, refreshGameMetadataFromActions, setSelectedGameId }: ArtworkRouteProps) {
  return <ArtworkBrowserView games={games} onApplyArtworkUpdate={updateGameArtwork} onEnrichGames={startMetadataWorkflow} onFindArtwork={(game, mode = 'artwork') => refreshGameMetadataFromActions(game, mode as 'metadata' | 'artwork')} onOpenDetails={setSelectedGameId} />;
}
