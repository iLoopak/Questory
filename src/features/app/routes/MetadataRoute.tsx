import { Suspense, lazy } from 'react';
import { PanelLoadingFallback } from '../../../components/PanelLoadingFallback';
import type { AppSectionRouterProps } from '../AppSectionRouter';

const MetadataEnrichmentPanel = lazy(() => import('../../../components/MetadataEnrichmentPanel').then((m) => ({ default: m.MetadataEnrichmentPanel })));

type MetadataRouteProps = Pick<AppSectionRouterProps, 'games' | 'metadataSelectionRequest' | 'updateGameMetadataManagement' | 'markOnboardingItemComplete' | 'updateGameMetadata'>;
export function MetadataRoute({ games, metadataSelectionRequest, updateGameMetadataManagement, markOnboardingItemComplete, updateGameMetadata }: MetadataRouteProps) {
  return <Suspense fallback={<PanelLoadingFallback />}><MetadataEnrichmentPanel games={games} initialSelectedGameIds={metadataSelectionRequest?.ids} onMetadataManagementChange={updateGameMetadataManagement} onMetadataEnriched={() => markOnboardingItemComplete('metadata-enriched')} onMetadataUpdate={updateGameMetadata} selectionRequestId={metadataSelectionRequest?.requestId} /></Suspense>;
}
