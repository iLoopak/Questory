import { CollectionPanel } from '../../collection/CollectionPanel';
import { formatMessageTemplate, formatSteamAchievementSyncSummary } from '../../../utils/summaryFormatters';
import type { AppRouterCollectionModel, AppRouterCoreModel, AppRouterGameModel, AppRouterImportModel, AppRouterMetadataModel, AppRouterQueueModel, AppRouterReviewModel, AppRouterSyncModel } from './routeModels';

type LibraryRouteProps = {
  core: Pick<AppRouterCoreModel, 'mainContentRef' | 'setIsAddGameOpen' | 'openOnboarding' | 'setActiveNavItem' | 'setActiveSettingsCategory' | 't'>;
  games: Pick<AppRouterGameModel, 'filteredLibraryGames' | 'games' | 'reviewIgnoredGameIds' | 'addToWishlist' | 'addManyToWishlist' | 'moveToLibrary' | 'handleOpenDetailsFromCollection' | 'removeGame' | 'removeAndIgnoreSteamGame' | 'updateGameStatusWithCompletion' | 'removeManyGames' | 'removeAndIgnoreManyGames' | 'updateManyGameStatuses'>;
  collections: Pick<AppRouterCollectionModel, 'libraryFilters' | 'platformOptions' | 'tags' | 'handleClearLibraryFilters' | 'handleLibraryFiltersChange'>;
  queue: Pick<AppRouterQueueModel, 'platformQueueState' | 'openBacklogPicker' | 'playGameFromCompactRow' | 'finishGameFromCompactRow' | 'dropGameFromCompactRow'>;
  review: Pick<AppRouterReviewModel, 'reviewModeState' | 'startReviewMode'>;
  sync: Pick<AppRouterSyncModel, 'steamAchievementSyncState' | 'steamPlaytimeRefreshState' | 'isHltbSyncing' | 'syncHltb' | 'syncSteamAchievements' | 'refreshSteamPlaytime'>;
  metadata: Pick<AppRouterMetadataModel, 'refreshGameMetadataFromActions' | 'startMetadataWorkflow'>;
  imports: Pick<AppRouterImportModel, 'importMultiGameItemsWithAnalytics'>;
};

export function LibraryRoute({ core, games, collections, queue, review, sync, metadata, imports }: LibraryRouteProps) {
  return (
    <CollectionPanel
      collectionType="library"
      contentScrollRef={core.mainContentRef}
      filters={collections.libraryFilters}
      steamAchievementSyncState={sync.steamAchievementSyncState}
      steamPlaytimeRefreshState={sync.steamPlaytimeRefreshState}
      games={games.filteredLibraryGames}
      allGames={games.games}
      ignoredReviewGameIds={games.reviewIgnoredGameIds}
      reviewModeState={review.reviewModeState}
      platformOptions={collections.platformOptions}
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
        syncSteamAchievements: (gameIds, options) => sync.syncSteamAchievements(gameIds, { completionToastMessage: formatSteamAchievementSyncSummary, emptyToastMessage: options?.emptyToastMessage, force: options?.force, showToast: true }),
        refreshSteamPlaytime: (gameIds, options) => sync.refreshSteamPlaytime(gameIds, { completionToastMessage: (summary) => formatMessageTemplate(core.t('app.updatedPlaytimeForGames'), { count: summary.updatedCount }), emptyToastMessage: options?.emptyToastMessage, showToast: true }),
      }}
      queueActions={{
        addToQueue: queue.openBacklogPicker,
        openQueue: () => review.startReviewMode('backlog'),
        playNow: queue.playGameFromCompactRow,
        finish: queue.finishGameFromCompactRow,
        drop: queue.dropGameFromCompactRow,
      }}
      reviewActions={{ startReview: review.startReviewMode }}
      syncActions={{ importMultiGames: imports.importMultiGameItemsWithAnalytics }}
      filterActions={{ clearFilters: collections.handleClearLibraryFilters, filtersChange: collections.handleLibraryFiltersChange }}
      navigationActions={{
        openOnboarding: core.openOnboarding,
        openIntegrations: () => {
          core.setActiveNavItem('Settings');
          core.setActiveSettingsCategory('Integrations');
        },
        openRetro: () => {
          core.setActiveNavItem('Settings');
          core.setActiveSettingsCategory('Retro');
        },
      }}
    />
  );
}
