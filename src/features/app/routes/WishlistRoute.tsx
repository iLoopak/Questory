import { CollectionPanel } from '../../collection/CollectionPanel';
import type { AppRouterCollectionModel, AppRouterCoreModel, AppRouterGameModel, AppRouterImportModel, AppRouterMetadataModel, AppRouterQueueModel, AppRouterReviewModel, AppRouterSyncModel } from './routeModels';

type WishlistRouteProps = {
  core: Pick<AppRouterCoreModel, 'mainContentRef' | 'setIsAddGameOpen'>;
  games: Pick<AppRouterGameModel, 'filteredWishlistGames' | 'addToWishlist' | 'addManyToWishlist' | 'moveToLibrary' | 'handleOpenDetailsFromCollection' | 'removeGame' | 'removeAndIgnoreSteamGame' | 'updateGameStatusWithCompletion' | 'removeManyGames' | 'removeAndIgnoreManyGames' | 'updateManyGameStatuses'>;
  collections: Pick<AppRouterCollectionModel, 'wishlistFilters' | 'platformOptions' | 'tags' | 'handleClearWishlistFilters' | 'handleWishlistFiltersChange'>;
  queue: Pick<AppRouterQueueModel, 'platformQueueState' | 'openBacklogPicker' | 'playGameFromCompactRow' | 'finishGameFromCompactRow' | 'dropGameFromCompactRow'>;
  review: Pick<AppRouterReviewModel, 'startReviewMode'>;
  sync: Pick<AppRouterSyncModel, 'steamWishlistSyncState' | 'itadDealSyncState' | 'isHltbSyncing' | 'syncHltb' | 'syncSteamWishlist' | 'syncWishlistDeals'>;
  metadata: Pick<AppRouterMetadataModel, 'refreshGameMetadataFromActions' | 'startMetadataWorkflow'>;
  imports: Pick<AppRouterImportModel, 'importSteamWishlistHtmlItemsWithAnalytics'>;
};

export function WishlistRoute({ core, games, collections, queue, review, sync, metadata, imports }: WishlistRouteProps) {
  return (
    <CollectionPanel
      collectionType="wishlist"
      contentScrollRef={core.mainContentRef}
      filters={collections.wishlistFilters}
      games={games.filteredWishlistGames}
      platformOptions={collections.platformOptions}
      steamWishlistSyncState={sync.steamWishlistSyncState}
      itadDealSyncState={sync.itadDealSyncState}
      tags={collections.tags}
      platformQueueState={queue.platformQueueState}
      isHltbSyncing={sync.isHltbSyncing}
      collectionActions={{
        addGame: () => core.setIsAddGameOpen(true),
        addToWishlist: games.addToWishlist,
        addManyToWishlist: games.addManyToWishlist,
        findArtwork: (game) => metadata.refreshGameMetadataFromActions(game, 'artwork'),
        findMetadata: metadata.refreshGameMetadataFromActions,
        moveToLibrary: games.moveToLibrary,
        openDetails: games.handleOpenDetailsFromCollection,
        remove: games.removeGame,
        removeAndIgnore: games.removeAndIgnoreSteamGame,
        statusChange: games.updateGameStatusWithCompletion,
      }}
      bulkActions={{
        enrich: metadata.startMetadataWorkflow,
        remove: games.removeManyGames,
        removeAndIgnore: games.removeAndIgnoreManyGames,
        statusChange: games.updateManyGameStatuses,
        syncHltb: sync.syncHltb,
      }}
      queueActions={{
        addToQueue: queue.openBacklogPicker,
        playNow: queue.playGameFromCompactRow,
        finish: queue.finishGameFromCompactRow,
        drop: queue.dropGameFromCompactRow,
      }}
      reviewActions={{ startReview: review.startReviewMode }}
      filterActions={{ clearFilters: collections.handleClearWishlistFilters, filtersChange: collections.handleWishlistFiltersChange }}
      syncActions={{
        syncSteamWishlist: sync.syncSteamWishlist,
        importSteamWishlistHtml: imports.importSteamWishlistHtmlItemsWithAnalytics,
        syncItadDeals: sync.syncWishlistDeals,
      }}
    />
  );
}
