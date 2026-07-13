import { HomePanel } from '../../../components/HomePanel';
import { ShelfAvatar } from '../../../components/ShelfIdentity';
import type { AppRouterCollectionModel, AppRouterCoreModel, AppRouterDiscoveryModel, AppRouterGameModel, AppRouterQueueModel, AppRouterReviewModel, AppRouterShelfModel, AppRouterSyncModel } from './routeModels';

type HomeRouteProps = {
  core: Pick<AppRouterCoreModel, 'openGameFromHome' | 'setSelectedGameId' | 'setActiveNavItem' | 'setActiveSettingsCategory' | 'setIsAchievementTimelineOpen' | 'addToastNotification'>;
  collections: Pick<AppRouterCollectionModel, 'setLibraryFilters'>;
  games: Pick<AppRouterGameModel, 'games' | 'reviewIgnoredGameIds' | 'playActivity' | 'logPlayedToday' | 'updateGameTracking' | 'updateGameStatusWithCompletion'>;
  queue: Pick<AppRouterQueueModel, 'platformQueueState' | 'openQueue' | 'playQueueGameNow' | 'homeSteamSyncGameIds'>;
  review: Pick<AppRouterReviewModel, 'reviewModeState' | 'startReviewMode'>;
  sync: Pick<AppRouterSyncModel, 'itadDealSyncState' | 'steamAchievementSyncState' | 'steamPlaytimeRefreshState' | 'isImportingNewSteamGames' | 'syncWishlistDeals' | 'importNewSteamGames' | 'syncSteamAchievements' | 'refreshSteamPlaytime'>;
  shelf: Pick<AppRouterShelfModel, 'personalizedQuestShelfTitle' | 'computedShelfTitle' | 'shelfIdentity' | 'steamAvatarUrl'>;
  discovery: Pick<AppRouterDiscoveryModel, 'handleSelectDiscoveryGame' | 'openDiscoveryPreview' | 'discoveryInboxRawgIds'>;
};

export function HomeRoute({ core, collections, games, queue, review, sync, shelf, discovery }: HomeRouteProps) {
  return (
    <HomePanel
      appTitle={shelf.personalizedQuestShelfTitle}
      shelfTitle={shelf.computedShelfTitle}
      avatar={<ShelfAvatar {...shelf.shelfIdentity} steamAvatarUrl={shelf.steamAvatarUrl} sizeClassName="h-14 w-14" />}
      games={games.games}
      ignoredReviewGameIds={games.reviewIgnoredGameIds}
      playActivity={games.playActivity}
      reviewQueueOrder={review.reviewModeState.queueOrder}
      reviewModeState={review.reviewModeState}
      queueState={queue.platformQueueState}
      itadDealSyncState={sync.itadDealSyncState}
      steamAchievementSyncState={sync.steamAchievementSyncState}
      steamPlaytimeRefreshState={sync.steamPlaytimeRefreshState}
      isImportingNewSteamGames={sync.isImportingNewSteamGames}
      onOpenDetails={core.openGameFromHome}
      onOpenLibrary={() => {
        core.setSelectedGameId(null);
        core.setActiveNavItem('Library');
      }}
      onOpenPlayingGames={() => openPlayingLibrary(collections.setLibraryFilters, core.setSelectedGameId, core.setActiveNavItem)}
      onOpenQueue={queue.openQueue}
      onOpenReviewMode={review.startReviewMode}
      onOpenSettings={() => {
        core.setSelectedGameId(null);
        core.setActiveNavItem('Settings');
        core.setActiveSettingsCategory('Personalization');
      }}
      onOpenTasteProfile={() => {
        core.setSelectedGameId(null);
        core.setActiveNavItem('Taste Profile');
      }}
      onOpenIntegrationsSettings={() => {
        core.setSelectedGameId(null);
        core.setActiveNavItem('Settings');
        core.setActiveSettingsCategory('Integrations');
      }}
      onOpenWishlist={() => {
        core.setSelectedGameId(null);
        core.setActiveNavItem('Wishlist');
      }}
      onPlayToday={(game) => {
        if (game.status === 'Playing') {
          games.logPlayedToday(game);
          core.addToastNotification({ category: 'success', dedupeKey: `play-today:${game.id}`, message: `${game.title} is already in Playing Now.` });
          return;
        }
        const targetPlatform = queue.platformQueueState.entries.find((e) => e.gameId === game.id)?.targetPlatform ?? game.platform;
        queue.playQueueGameNow(game.id, targetPlatform);
        games.logPlayedToday(game);
      }}
      onQuickNote={(gameId, notes) => {
        const target = games.games.find((g) => g.id === gameId);
        if (!target) return;
        games.updateGameTracking(gameId, { notes, status: target.status, tags: target.tags });
        core.addToastNotification({ category: 'success', dedupeKey: `quick-note:${gameId}`, message: 'Note saved.' });
      }}
      onStatusChange={games.updateGameStatusWithCompletion}
      onSyncItadDeals={() => {
        const wishlistIds = games.games.filter((g) => g.collectionType === 'wishlist').map((g) => g.id);
        void sync.syncWishlistDeals(wishlistIds);
      }}
      onImportNewSteamGames={() => {
        void sync.importNewSteamGames();
      }}
      onOpenAchievementTimeline={() => core.setIsAchievementTimelineOpen(true)}
      onSyncSteamAchievements={() => {
        void sync.syncSteamAchievements(queue.homeSteamSyncGameIds, { emptyToastMessage: 'No Playing Now or Platform Plan Steam games are eligible for achievement sync.', showToast: true });
      }}
      onSyncSteamPlaytime={() => {
        void sync.refreshSteamPlaytime(queue.homeSteamSyncGameIds, { emptyToastMessage: 'No Playing Now or Platform Plan Steam games are eligible for playtime sync.', showToast: true });
      }}
      onSelectDiscoveryGame={discovery.handleSelectDiscoveryGame}
      onOpenDiscoveryPreview={discovery.openDiscoveryPreview}
      discoveryInboxRawgIds={discovery.discoveryInboxRawgIds}
    />
  );
}

export function openPlayingLibrary(
  setLibraryFilters: AppRouterCollectionModel['setLibraryFilters'],
  setSelectedGameId: AppRouterCoreModel['setSelectedGameId'],
  setActiveNavItem: AppRouterCoreModel['setActiveNavItem'],
) {
  setLibraryFilters((currentFilters) => ({ ...currentFilters, status: 'Playing' }));
  setSelectedGameId(null);
  setActiveNavItem('Library');
}
