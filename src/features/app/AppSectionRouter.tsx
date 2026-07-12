import type { Dispatch, RefObject, SetStateAction } from 'react';
import { PlaceholderPanel } from './components/PlaceholderPanel';
import { ArtworkRoute } from './routes/ArtworkRoute';
import { DiscoveryInboxRoute } from './routes/DiscoveryInboxRoute';
import { DiscoveryRoute } from './routes/DiscoveryRoute';
import { HomeRoute } from './routes/HomeRoute';
import { LibraryRoute } from './routes/LibraryRoute';
import { MetadataRoute } from './routes/MetadataRoute';
import { QuestQueueRoute } from './routes/QuestQueueRoute';
import { QuestRunnerRoute } from './routes/QuestRunnerRoute';
import { ReviewModeRoute } from './routes/ReviewModeRoute';
import { SettingsRoute } from './routes/SettingsRoute';
import { StatsRoute } from './routes/StatsRoute';
import { TasteProfileRoute } from './routes/TasteProfileRoute';
import { WishlistRoute } from './routes/WishlistRoute';

import type {
  AppSectionRouteModel,
  AppRouterCoreModel,
  AppRouterGameModel,
  AppRouterCollectionModel,
  AppRouterQueueModel,
  AppRouterReviewModel,
  AppRouterSyncModel,
  AppRouterShelfModel,
  AppRouterDiscoveryModel,
  AppRouterOnboardingModel,
  AppRouterSettingsModel,
  AppRouterMetadataModel,
  AppRouterImportModel,
} from './routes/routeModels';

// The models are the routes' contract (see routes/routeModels.ts); re-exported so every
// existing `from '../AppSectionRouter'` import keeps resolving.
export type {
  AppRouterCoreModel,
  AppRouterGameModel,
  AppRouterCollectionModel,
  AppRouterQueueModel,
  AppRouterReviewModel,
  AppRouterSyncModel,
  AppRouterShelfModel,
  AppRouterDiscoveryModel,
  AppRouterOnboardingModel,
  AppRouterSettingsModel,
  AppRouterMetadataModel,
  AppRouterImportModel,
  AppSectionRouteModel,
} from './routes/routeModels';

export type AppSectionRouterProps = {
  core: AppRouterCoreModel;
  games: AppRouterGameModel;
  collections: AppRouterCollectionModel;
  queue: AppRouterQueueModel;
  review: AppRouterReviewModel;
  sync: AppRouterSyncModel;
  shelf: AppRouterShelfModel;
  discovery: AppRouterDiscoveryModel;
  onboarding: AppRouterOnboardingModel;
  settings: AppRouterSettingsModel;
  metadata: AppRouterMetadataModel;
  imports: AppRouterImportModel;
};

export function AppSectionRouter(props: AppSectionRouterProps) {
  const { core, games, collections, queue, review, sync, shelf, discovery, onboarding, settings, metadata, imports } = props;
  const { activeNavItem, mainContentRef } = core;

  return (
    <section ref={mainContentRef} className={`qs-main-scroll py-2 ${activeNavItem === 'Home' ? 'qs-main-scroll--home' : 'bg-ink-950'}`}>
      {activeNavItem === 'Home' ? (
        <HomeRoute
          core={core}
          games={games}
          queue={queue}
          review={review}
          sync={sync}
          shelf={shelf}
          discovery={discovery}
        />
      ) : activeNavItem === 'Library' ? (
        <LibraryRoute
          core={core}
          games={games}
          collections={collections}
          queue={queue}
          review={review}
          sync={sync}
          metadata={metadata}
          imports={imports}
        />
      ) : activeNavItem === 'Wishlist' ? (
        <WishlistRoute
          core={core}
          games={games}
          collections={collections}
          queue={queue}
          review={review}
          sync={sync}
          metadata={metadata}
          imports={imports}
        />
      ) : activeNavItem === 'Queue' ? (
        <QuestQueueRoute core={core} games={games} queue={queue} review={review} metadata={metadata} />
      ) : activeNavItem === 'Review Mode' ? (
        <ReviewModeRoute core={core} games={games} queue={queue} review={review} metadata={metadata} />
      ) : activeNavItem === 'Discovery Inbox' ? (
        <DiscoveryInboxRoute core={core} discovery={discovery} />
      ) : activeNavItem === 'Metadata' ? (
        <MetadataRoute games={games} metadata={metadata} onboarding={onboarding} />
      ) : activeNavItem === 'Artwork' ? (
        <ArtworkRoute core={core} games={games} metadata={metadata} />
      ) : activeNavItem === 'Discover' ? (
        <DiscoveryRoute core={core} games={games} discovery={discovery} />
      ) : activeNavItem === 'Taste Profile' ? (
        <TasteProfileRoute core={core} games={games} />
      ) : activeNavItem === 'Stats' ? (
        <StatsRoute core={core} games={games} queue={queue} />
      ) : activeNavItem === 'Quest Runner' ? (
        <QuestRunnerRoute games={games} />
      ) : activeNavItem === 'Settings' ? (
        <SettingsRoute
          core={core}
          games={games}
          collections={collections}
          queue={queue}
          review={review}
          sync={sync}
          shelf={shelf}
          onboarding={onboarding}
          settings={settings}
          imports={imports}
        />
      ) : (
        <PlaceholderPanel title={activeNavItem} />
      )}
    </section>
  );
}
