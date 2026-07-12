import { useEffect } from 'react';
import { DiscoveryInboxPanel } from '../../../components/DiscoveryInboxPanel';
import type { AppRouterCoreModel, AppRouterDiscoveryModel } from './routeModels';

type DiscoveryInboxRouteProps = {
  core: Pick<AppRouterCoreModel, 'setActiveNavItem'>;
  discovery: Pick<AppRouterDiscoveryModel, 'discoveryInboxItems' | 'requestDiscoveryInboxRecommendations' | 'isRequestingDiscoveryInboxRecommendations' | 'promoteInboxDiscoveryToLibrary' | 'promoteInboxDiscoveryToWishlist' | 'promoteInboxDiscoveryToPlans' | 'handleInboxIgnore' | 'handleInboxSkip' | 'startDiscoveryInboxRun'>;
};

export function DiscoveryInboxRoute({ core, discovery }: DiscoveryInboxRouteProps) {
  useEffect(() => {
    discovery.startDiscoveryInboxRun();
  }, [discovery.startDiscoveryInboxRun]);

  return (
    <DiscoveryInboxPanel
      items={discovery.discoveryInboxItems}
      onAddToLibrary={discovery.promoteInboxDiscoveryToLibrary}
      onAddToWishlist={discovery.promoteInboxDiscoveryToWishlist}
      onAddToPlans={discovery.promoteInboxDiscoveryToPlans}
      onIgnore={discovery.handleInboxIgnore}
      isRequestingRecommendations={discovery.isRequestingDiscoveryInboxRecommendations}
      onRequestRecommendations={discovery.requestDiscoveryInboxRecommendations}
      onSkip={discovery.handleInboxSkip}
      onOpenTasteProfile={() => core.setActiveNavItem('Taste Profile')}
    />
  );
}
