import { DiscoverPanel } from '../../../components/DiscoverPanel';
import type { AppRouterCoreModel, AppRouterDiscoveryModel, AppRouterGameModel } from '../AppSectionRouter';

type DiscoveryRouteProps = {
  core: Pick<AppRouterCoreModel, 'setActiveNavItem' | 'setActiveSettingsCategory'>;
  games: Pick<AppRouterGameModel, 'games'>;
  discovery: Pick<AppRouterDiscoveryModel, 'discoveryInboxRawgIds' | 'addToDiscoveryInbox' | 'openDiscoveryPreview' | 'promoteDiscoveryToWishlist' | 'promoteDiscoveryToPlans'>;
};

export function DiscoveryRoute({ core, games, discovery }: DiscoveryRouteProps) {
  return (
    <DiscoverPanel
      games={games.games}
      discoveryInboxRawgIds={discovery.discoveryInboxRawgIds}
      onAddToInbox={discovery.addToDiscoveryInbox}
      onOpenGame={discovery.openDiscoveryPreview}
      onAddToWishlist={discovery.promoteDiscoveryToWishlist}
      onAddToPlans={discovery.promoteDiscoveryToPlans}
      onOpenSettings={() => {
        core.setActiveNavItem('Settings');
        core.setActiveSettingsCategory('Integrations');
      }}
    />
  );
}
