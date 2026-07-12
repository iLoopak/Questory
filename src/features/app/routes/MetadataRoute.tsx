import { Suspense, lazy } from 'react';
import { PanelLoadingFallback } from '../../../components/PanelLoadingFallback';
import type { AppRouterGameModel, AppRouterMetadataModel, AppRouterOnboardingModel } from './routeModels';

const MetadataEnrichmentPanel = lazy(() => import('../../../components/MetadataEnrichmentPanel').then((m) => ({ default: m.MetadataEnrichmentPanel })));

type MetadataRouteProps = {
  games: Pick<AppRouterGameModel, 'games'>;
  metadata: Pick<AppRouterMetadataModel, 'metadataSelectionRequest' | 'updateGameMetadataManagement' | 'updateGameMetadata'>;
  onboarding: Pick<AppRouterOnboardingModel, 'markOnboardingItemComplete'>;
};

export function MetadataRoute({ games, metadata, onboarding }: MetadataRouteProps) {
  return (
    <Suspense fallback={<PanelLoadingFallback />}>
      <MetadataEnrichmentPanel
        games={games.games}
        initialSelectedGameIds={metadata.metadataSelectionRequest?.ids}
        onMetadataManagementChange={metadata.updateGameMetadataManagement}
        onMetadataEnriched={() => onboarding.markOnboardingItemComplete('metadata-enriched')}
        onMetadataUpdate={metadata.updateGameMetadata}
        selectionRequestId={metadata.metadataSelectionRequest?.requestId}
      />
    </Suspense>
  );
}
