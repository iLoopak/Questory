import { DiscoveryInboxPanel } from '../../../components/DiscoveryInboxPanel';
import type { AppSectionRouterProps } from '../AppSectionRouter';

type DiscoveryInboxRouteProps = Pick<AppSectionRouterProps, 'discoveryInboxItems' | 'promoteInboxDiscoveryToLibrary' | 'promoteInboxDiscoveryToWishlist' | 'promoteInboxDiscoveryToPlans' | 'handleInboxIgnore'>;
export function DiscoveryInboxRoute({ discoveryInboxItems, promoteInboxDiscoveryToLibrary, promoteInboxDiscoveryToWishlist, promoteInboxDiscoveryToPlans, handleInboxIgnore }: DiscoveryInboxRouteProps) {
  return <DiscoveryInboxPanel items={discoveryInboxItems} onAddToLibrary={promoteInboxDiscoveryToLibrary} onAddToWishlist={promoteInboxDiscoveryToWishlist} onAddToPlans={promoteInboxDiscoveryToPlans} onIgnore={handleInboxIgnore} />;
}
