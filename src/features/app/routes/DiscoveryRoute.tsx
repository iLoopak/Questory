import { DiscoverPanel } from '../../../components/DiscoverPanel';
import type { AppSectionRouterProps } from '../AppSectionRouter';

type DiscoveryRouteProps = Pick<AppSectionRouterProps, 'games' | 'discoveryInboxRawgIds' | 'addToDiscoveryInbox' | 'openDiscoveryPreview' | 'promoteDiscoveryToWishlist' | 'promoteDiscoveryToPlans' | 'setActiveNavItem' | 'setActiveSettingsCategory'>;
export function DiscoveryRoute({ games, discoveryInboxRawgIds, addToDiscoveryInbox, openDiscoveryPreview, promoteDiscoveryToWishlist, promoteDiscoveryToPlans, setActiveNavItem, setActiveSettingsCategory }: DiscoveryRouteProps) {
  return <DiscoverPanel games={games} discoveryInboxRawgIds={discoveryInboxRawgIds} onAddToInbox={addToDiscoveryInbox} onOpenGame={openDiscoveryPreview} onAddToWishlist={promoteDiscoveryToWishlist} onAddToPlans={promoteDiscoveryToPlans} onOpenSettings={() => { setActiveNavItem('Settings'); setActiveSettingsCategory('Integrations'); }} />;
}
