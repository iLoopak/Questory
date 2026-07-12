import { DiscoverPanel } from '../../../components/DiscoverPanel';
import { getPlannedGameIds } from '../../../lib/plannedGames';
import type { AppRouterCoreModel, AppRouterDiscoveryModel, AppRouterGameModel, AppRouterQueueModel } from './routeModels';

type DiscoveryRouteProps = {
  core: Pick<AppRouterCoreModel, 'setActiveNavItem' | 'setActiveSettingsCategory'>;
  games: Pick<AppRouterGameModel, 'games'>;
  discovery: Pick<AppRouterDiscoveryModel, 'discoveryInboxRawgIds' | 'addToDiscoveryInbox' | 'openDiscoveryPreview' | 'promoteDiscoveryToWishlist' | 'promoteDiscoveryToPlans'>;
  queue: Pick<AppRouterQueueModel, 'platformQueueState'>;
};

export function DiscoveryRoute({ core, games, discovery, queue }: DiscoveryRouteProps) {
  return (
    <DiscoverPanel
      games={games.games}
      discoveryInboxRawgIds={discovery.discoveryInboxRawgIds}
      plannedGameIds={getPlannedGameIds(queue.platformQueueState, games.games)}
      onAddToInbox={discovery.addToDiscoveryInbox}
      onOpenGame={discovery.openDiscoveryPreview}
      onAddToWishlist={discovery.promoteDiscoveryToWishlist}
      onAddToPlans={discovery.promoteDiscoveryToPlans}
      onOpenSettings={() => {
        core.setActiveNavItem('Settings');
        core.setActiveSettingsCategory('Integrations');
      }}
      onOpenTasteProfile={() => core.setActiveNavItem('Taste Profile')}
    />
  );
}
