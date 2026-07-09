import { DiscoveryInboxPanel } from '../../../components/DiscoveryInboxPanel';
import type { AppSectionRouteModel } from '../AppSectionRouter';

type DiscoveryInboxRouteProps = Pick<AppSectionRouteModel, 'discoveryInboxItems' | 'promoteInboxDiscoveryToLibrary' | 'promoteInboxDiscoveryToWishlist' | 'promoteInboxDiscoveryToPlans' | 'handleInboxIgnore'>;
export function DiscoveryInboxRoute({ discoveryInboxItems, promoteInboxDiscoveryToLibrary, promoteInboxDiscoveryToWishlist, promoteInboxDiscoveryToPlans, handleInboxIgnore }: DiscoveryInboxRouteProps) {
  return <DiscoveryInboxPanel items={discoveryInboxItems} onAddToLibrary={promoteInboxDiscoveryToLibrary} onAddToWishlist={promoteInboxDiscoveryToWishlist} onAddToPlans={promoteInboxDiscoveryToPlans} onIgnore={handleInboxIgnore} />;
}
