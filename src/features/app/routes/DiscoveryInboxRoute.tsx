import { DiscoveryInboxPanel } from '../../../components/DiscoveryInboxPanel';
import type { AppRouterDiscoveryModel } from '../AppSectionRouter';

type DiscoveryInboxRouteProps = {
  discovery: Pick<AppRouterDiscoveryModel, 'discoveryInboxItems' | 'promoteInboxDiscoveryToLibrary' | 'promoteInboxDiscoveryToWishlist' | 'promoteInboxDiscoveryToPlans' | 'handleInboxIgnore' | 'handleInboxSkip'>;
};

export function DiscoveryInboxRoute({ discovery }: DiscoveryInboxRouteProps) {
  return (
    <DiscoveryInboxPanel
      items={discovery.discoveryInboxItems}
      onAddToLibrary={discovery.promoteInboxDiscoveryToLibrary}
      onAddToWishlist={discovery.promoteInboxDiscoveryToWishlist}
      onAddToPlans={discovery.promoteInboxDiscoveryToPlans}
      onIgnore={discovery.handleInboxIgnore}
      onSkip={discovery.handleInboxSkip}
    />
  );
}
