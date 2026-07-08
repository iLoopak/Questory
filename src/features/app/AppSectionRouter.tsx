import { Suspense, lazy, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { HomePanel } from '../../components/HomePanel';
import { CollectionPanel } from '../collection/CollectionPanel';
import { QueuePanel } from '../../components/QueuePanel';
import { ReviewModePanel, type ReviewModeAction, type ReviewModeActionContext } from '../../components/ReviewModePanel';
import { DiscoveryInboxPanel } from '../../components/DiscoveryInboxPanel';
import { DiscoverPanel } from '../../components/DiscoverPanel';
import { ArtworkBrowserView } from '../artwork/ArtworkBrowserView';
import { PanelLoadingFallback } from '../../components/PanelLoadingFallback';
import { PlaceholderPanel } from './components/PlaceholderPanel';
import { ShelfAvatar } from '../../components/ShelfIdentity';

// Low-frequency nav screens are code-split so they stay out of the initial
// bundle. Home / Library / Wishlist / Discover / Platform Plans load eagerly.
const MetadataEnrichmentPanel = lazy(() =>
  import('../../components/MetadataEnrichmentPanel').then((m) => ({ default: m.MetadataEnrichmentPanel })),
);
const StatsPanel = lazy(() =>
  import('../../components/StatsPanel').then((m) => ({ default: m.StatsPanel })),
);
const QuestRunnerGame = lazy(() =>
  import('../../components/QuestRunnerGame').then((m) => ({ default: m.QuestRunnerGame })),
);
const SettingsView = lazy(() =>
  import('../settings/SettingsView').then((m) => ({ default: m.SettingsView })),
);

import type { NavItem } from '../../config/navigation';
import type { SettingsCategory } from '../../config/settings';
import { initialCollectionFilters, type CollectionFilters } from '../../config/collection';
import type { ItadDealSyncState } from '../../config/syncStates';
import type { AppLanguage, TFunction } from '../../i18n';
import type { Game, GamePlatform, GameStatus } from '../../types/game';
import type { RawgMetadata } from '../../types/rawg';
import type {
  SteamAchievementSyncState,
  SteamAchievementSyncSummary,
  SteamPlaytimeRefreshState,
  SteamPlaytimeRefreshSummary,
  SteamWishlistSyncState,
} from '../../types/steam';
import type { PlatformQueueState, PlatformQueueSummary } from '../../lib/platformQueueStorage';
import type { ReviewModeState, ReviewSource } from '../../lib/reviewModeStorage';
import type {
  AccentColorPreference,
  AppTemplatePreference,
  GradientOrientationPreference,
  NeonButtonGradientBalancePreference,
  NeonButtonGradientMidpointPreference,
  NeonButtonStylePreference,
  ResolvedTheme,
  ThemePreference,
} from '../../lib/themePreferences';
import type { IgnoredSteamGame } from '../../lib/steamIgnoredGamesStorage';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import type { DiscoveryInboxItem } from '../../lib/discoveryInboxStorage';
import type { OnboardingItemId } from '../../lib/onboardingStorage';
import type { RuntimeEnvironment } from '../../lib/capacitorEnvironment';
import type { NavigationVisibilityPreferences } from '../../lib/navigationVisibilityPreferences';
import type { ShelfIdentitySettings } from '../../lib/shelfIdentity';
import type { NotificationDraft } from '../../lib/notifications';
import type { SetupTask } from '../../lib/setupTasks';
import type { ConfirmCancelConvention, ControllerProfileId } from '../../lib/controllerProfiles';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import type { HltbSyncSummary } from '../../lib/hltb';
import type { ParsedSteamWishlistImportItem } from '../../lib/steamWishlistHtmlImport';
import type { QuestShelfAchievementProgress } from '../../lib/questShelfAchievements';
import type { MetadataRefreshMode, MetadataRefreshResult, MetadataSelectionRequest } from '../../hooks/useMetadataArtworkActions';
import type { PlayingGameAction } from '../../components/QueuePanel';
import { formatMessageTemplate, formatSteamAchievementSyncSummary, type SteamWishlistHtmlImportSummary } from '../../utils/summaryFormatters';

export type AppSectionRouterProps = {
  // ── Core ──────────────────────────────────────────────────────────────────
  activeNavItem: NavItem;
  mainContentRef: RefObject<HTMLElement | null>;
  t: TFunction;
  addToastNotification: (notification: NotificationDraft) => void;

  // ── Game state ────────────────────────────────────────────────────────────
  games: Game[];
  filteredLibraryGames: Game[];
  filteredWishlistGames: Game[];
  playActivity: PlayActivityRecord[];
  reviewIgnoredGameIds: Set<string>;
  ignoredSteamGames: IgnoredSteamGame[];

  // ── Platform / queue ─────────────────────────────────────────────────────
  platformQueueState: PlatformQueueState;
  queueSummary: PlatformQueueSummary;
  activeQueuePlatforms: GamePlatform[];
  targetQueuePlatform: GamePlatform | undefined;
  homeSteamSyncGameIds: string[];

  // ── Review mode ───────────────────────────────────────────────────────────
  reviewModeState: ReviewModeState;
  activeReviewSource: ReviewSource;
  confirmCancelConvention: ConfirmCancelConvention;

  // ── Collection filters ────────────────────────────────────────────────────
  libraryFilters: CollectionFilters;
  wishlistFilters: CollectionFilters;
  platformOptions: GamePlatform[];
  tags: string[];
  areLastRetroImportsHiddenByFilters: boolean;

  // ── Sync states ───────────────────────────────────────────────────────────
  itadDealSyncState: ItadDealSyncState;
  steamAchievementSyncState: SteamAchievementSyncState;
  steamPlaytimeRefreshState: SteamPlaytimeRefreshState;
  steamWishlistSyncState: SteamWishlistSyncState;
  isImportingNewSteamGames: boolean;
  isHltbSyncing: boolean;

  // ── Shelf / profile ───────────────────────────────────────────────────────
  personalizedQuestShelfTitle: string;
  computedShelfTitle: string;
  resolvedFeaturedGame: Game | undefined;
  shelfIdentity: ShelfIdentitySettings;
  steamAvatarUrl: string;
  libraryOwnerNickname: string;

  // ── Achievement ────────────────────────────────────────────────────────────
  questShelfAchievements: QuestShelfAchievementProgress[];

  // ── Metadata ───────────────────────────────────────────────────────────────
  metadataSelectionRequest: MetadataSelectionRequest | null;
  refreshingMetadataGameIds: Set<string>;

  // ── Discovery inbox ────────────────────────────────────────────────────────
  discoveryInboxItems: DiscoveryInboxItem[];
  discoveryInboxRawgIds: Set<number>;

  // ── Onboarding ─────────────────────────────────────────────────────────────
  completedOnboardingItemIds: Set<OnboardingItemId>;
  skippedOnboardingItemIds: Set<OnboardingItemId>;
  isOnboardingOpen: boolean;
  isOnboardingComplete: boolean;

  // ── Steam ──────────────────────────────────────────────────────────────────
  steamPersonaName: string;

  // ── Settings ───────────────────────────────────────────────────────────────
  activeSettingsCategory: SettingsCategory | null;
  autoBackupSignal: string;
  setupTasks: SetupTask[];
  runtimeEnvironment: RuntimeEnvironment;
  resolvedTheme: ResolvedTheme;
  themePreference: ThemePreference;
  appTemplatePreference: AppTemplatePreference;
  accentColorPreference: AccentColorPreference;
  secondaryAccentColorPreference: AccentColorPreference;
  gradientOrientationPreference: GradientOrientationPreference;
  neonButtonGradientBalancePreference: NeonButtonGradientBalancePreference;
  neonButtonGradientMidpointPreference: NeonButtonGradientMidpointPreference;
  neonButtonStylePreference: NeonButtonStylePreference;
  language: AppLanguage;
  navigationVisibility: NavigationVisibilityPreferences;
  controllerProfileId: ControllerProfileId;
  detectedProfileId: ControllerProfileId | null;
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;

  // ── Navigation actions ─────────────────────────────────────────────────────
  setActiveNavItem: Dispatch<SetStateAction<NavItem>>;
  setActiveSettingsCategory: Dispatch<SetStateAction<SettingsCategory | null>>;
  setSelectedGameId: (id: string | null) => void;
  setIsAddGameOpen: (open: boolean) => void;
  openOnboarding: () => void;
  setIsAchievementTimelineOpen: (open: boolean) => void;
  openGameFromHome: (game: Game) => void;
  openQueue: (platform?: GamePlatform) => void;

  // ── Game library actions ───────────────────────────────────────────────────
  addToWishlist: (game: Game) => void;
  addManyToWishlist: (games: Game[]) => void;
  moveToLibrary: (game: Game) => void;
  removeGame: (gameId: string) => void;
  removeAndIgnoreSteamGame: (game: Game) => void;
  removeManyGames: (gameIds: string[]) => void;
  removeAndIgnoreManyGames: (games: Game[]) => void;
  updateGameStatusWithCompletion: (gameId: string, status: GameStatus) => void;
  updateManyGameStatuses: (gameIds: string[], status: GameStatus) => void;
  updateGameTracking: (gameId: string, changes: Partial<Game>) => void;
  updateGameReviewFieldsWithCompletion: (gameId: string, changes: Partial<Game>) => void;
  updateGameArtwork: (gameId: string, changes: Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'artworkSourceMetadata' | 'coverImage' | 'wideCoverImage' | 'heroImage' | 'logoImage' | 'iconImage'>>) => void;
  updateGameMetadata: (gameId: string, metadata: RawgMetadata) => void;
  updateGameMetadataManagement: (gameId: string, changes: Pick<Game, 'metadataManualManagedAt' | 'metadataSkippedAt'>) => void;
  logPlayedToday: (game: Game) => void;
  handleOpenDetailsFromCollection: (gameId: string) => void;

  // ── Metadata actions ───────────────────────────────────────────────────────
  refreshGameMetadataFromActions: (game: Game, mode?: MetadataRefreshMode) => Promise<MetadataRefreshResult>;
  startMetadataWorkflow: (gameIds: string[]) => void;
  ensureRawgMetadataForGame: (game: Game) => Promise<void>;

  // ── Queue actions ──────────────────────────────────────────────────────────
  openBacklogPicker: (game: Game) => void;
  addGameToQueue: (game: Game, platform: GamePlatform) => void;
  addQueuePlatform: (platform: GamePlatform) => void;
  updateQueueLimit: (platform: GamePlatform, maxActiveGames: number) => void;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
  moveQueueGame: (gameId: string, platform: GamePlatform, direction: 'top' | 'up' | 'down') => void;
  moveQueueGameToPlatform: (gameId: string, sourcePlatform: GamePlatform, platform: GamePlatform) => void;
  playQueueGameNow: (gameId: string, platform: GamePlatform) => void;
  updateCurrentlyPlayingGame: (gameId: string, platform: GamePlatform, action: PlayingGameAction) => void;
  removeQueueGame: (gameId: string, platform?: GamePlatform) => void;
  playGameFromCompactRow: (game: Game) => void;
  finishGameFromCompactRow: (game: Game) => void;
  dropGameFromCompactRow: (game: Game) => void;

  // ── Discovery actions ──────────────────────────────────────────────────────
  handleSelectDiscoveryGame: (game: DiscoveryGame) => void;
  openDiscoveryPreview: (candidate: DiscoveryCandidate) => void;
  addToDiscoveryInbox: (game: DiscoveryGame, reason: string) => void;
  promoteInboxDiscoveryToLibrary: (item: DiscoveryInboxItem) => void;
  promoteInboxDiscoveryToWishlist: (item: DiscoveryInboxItem) => void;
  promoteInboxDiscoveryToPlans: (item: DiscoveryInboxItem) => void;
  handleInboxIgnore: (item: DiscoveryInboxItem) => void;

  // ── Review mode actions ────────────────────────────────────────────────────
  handleReviewAction: (game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform, context?: ReviewModeActionContext) => void;
  startReviewMode: (source: ReviewSource) => void;
  setReviewSource: (source: ReviewSource) => void;
  restoreReviewIgnoredGames: () => void;

  // ── Sync actions ───────────────────────────────────────────────────────────
  syncSteamAchievements: (gameIds?: string[], options?: { completionToastMessage?: (summary: SteamAchievementSyncSummary) => string; emptyToastMessage?: string; force?: boolean; showToast?: boolean }) => Promise<SteamAchievementSyncSummary | null>;
  refreshSteamPlaytime: (gameIds?: string[], options?: { completionToastMessage?: (summary: SteamPlaytimeRefreshSummary) => string; emptyToastMessage?: string; showToast?: boolean }) => Promise<SteamPlaytimeRefreshSummary | null>;
  syncWishlistDeals: (gameIds: string[]) => Promise<{ updatedCount: number; noMatchCount: number; failedCount: number } | null>;
  syncSteamWishlist: () => Promise<unknown>;
  importSteamWishlistHtmlItemsWithAnalytics: (items: ParsedSteamWishlistImportItem[], skippedCount?: number) => SteamWishlistHtmlImportSummary;
  syncHltb: (gameIds: string[]) => Promise<HltbSyncSummary | null>;
  importNewSteamGames: () => Promise<void>;
  importSteamGames: (games: Game[]) => Game[];
  handleRetroImportGames: (games: Game[]) => Game[];

  // ── Filter actions ─────────────────────────────────────────────────────────
  handleClearLibraryFilters: () => void;
  handleClearWishlistFilters: () => void;
  handleLibraryFiltersChange: (changes: Partial<CollectionFilters>) => void;
  handleWishlistFiltersChange: (changes: Partial<CollectionFilters>) => void;
  setLibraryFilters: Dispatch<SetStateAction<CollectionFilters>>;

  // ── Onboarding actions ─────────────────────────────────────────────────────
  markOnboardingItemComplete: (item: OnboardingItemId) => void;
  markOnboardingItemsComplete: (items: (OnboardingItemId | null)[]) => void;
  hideOnboarding: () => void;
  skipOnboardingItem: (item: OnboardingItemId) => void;
  handleOnboardingAction: (itemId: OnboardingItemId, action?: 'primary' | 'secondary') => void;
  restartOnboarding: () => void;

  // ── Settings actions ───────────────────────────────────────────────────────
  setIsRawgApiKeySet: Dispatch<SetStateAction<boolean>>;
  setLibraryOwnerNickname: (nickname: string) => void;
  setShelfIdentity: (identity: ShelfIdentitySettings) => void;
  handleSteamProfileNameChange: (name: string) => void;
  setNavigationVisibility: Dispatch<SetStateAction<NavigationVisibilityPreferences>>;
  setThemePreference: (theme: ThemePreference) => void;
  setAppTemplatePreference: (template: AppTemplatePreference) => void;
  setAccentColorPreference: (color: AccentColorPreference) => void;
  setSecondaryAccentColorPreference: (color: AccentColorPreference) => void;
  setGradientOrientationPreference: (orientation: GradientOrientationPreference) => void;
  setNeonButtonGradientBalancePreference: (balance: NeonButtonGradientBalancePreference) => void;
  setNeonButtonGradientMidpointPreference: (midpoint: NeonButtonGradientMidpointPreference) => void;
  setNeonButtonStylePreference: (style: NeonButtonStylePreference) => void;
  setLanguage: (language: AppLanguage) => void;
  setControllerProfileId: (id: ControllerProfileId) => void;
  setIsControllerDebugEnabled: Dispatch<SetStateAction<boolean>>;
  setIsLandscapeLockEnabled: Dispatch<SetStateAction<boolean>>;
  handleBackupExported: () => void;
  handleBackupImported: () => void;
  addRetroImportedGamesToQueue: (gameIds: string[]) => void;
  enrichRetroImportedGames: (gameIds: string[]) => void;
  viewRetroImportedGames: (gameIds: string[]) => void;
  unignoreSteamGame: (steamAppId: number) => void;
};

export function AppSectionRouter({
  activeNavItem,
  mainContentRef,
  t,
  addToastNotification,
  games,
  filteredLibraryGames,
  filteredWishlistGames,
  playActivity,
  reviewIgnoredGameIds,
  ignoredSteamGames,
  platformQueueState,
  queueSummary,
  activeQueuePlatforms,
  targetQueuePlatform,
  homeSteamSyncGameIds,
  reviewModeState,
  activeReviewSource,
  confirmCancelConvention,
  libraryFilters,
  wishlistFilters,
  platformOptions,
  tags,
  areLastRetroImportsHiddenByFilters,
  itadDealSyncState,
  steamAchievementSyncState,
  steamPlaytimeRefreshState,
  steamWishlistSyncState,
  isImportingNewSteamGames,
  isHltbSyncing,
  personalizedQuestShelfTitle,
  computedShelfTitle,
  resolvedFeaturedGame,
  shelfIdentity,
  steamAvatarUrl,
  libraryOwnerNickname,
  questShelfAchievements,
  metadataSelectionRequest,
  refreshingMetadataGameIds,
  discoveryInboxItems,
  discoveryInboxRawgIds,
  completedOnboardingItemIds,
  skippedOnboardingItemIds,
  isOnboardingOpen,
  isOnboardingComplete,
  steamPersonaName,
  activeSettingsCategory,
  autoBackupSignal,
  setupTasks,
  runtimeEnvironment,
  resolvedTheme,
  themePreference,
  appTemplatePreference,
  accentColorPreference,
  secondaryAccentColorPreference,
  gradientOrientationPreference,
  neonButtonGradientBalancePreference,
  neonButtonGradientMidpointPreference,
  neonButtonStylePreference,
  language,
  navigationVisibility,
  controllerProfileId,
  detectedProfileId,
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  setActiveNavItem,
  setActiveSettingsCategory,
  setSelectedGameId,
  setIsAddGameOpen,
  openOnboarding,
  setIsAchievementTimelineOpen,
  openGameFromHome,
  openQueue,
  addToWishlist,
  addManyToWishlist,
  moveToLibrary,
  removeGame,
  removeAndIgnoreSteamGame,
  removeManyGames,
  removeAndIgnoreManyGames,
  updateGameStatusWithCompletion,
  updateManyGameStatuses,
  updateGameTracking,
  updateGameReviewFieldsWithCompletion,
  updateGameArtwork,
  updateGameMetadata,
  updateGameMetadataManagement,
  logPlayedToday,
  handleOpenDetailsFromCollection,
  refreshGameMetadataFromActions,
  startMetadataWorkflow,
  ensureRawgMetadataForGame,
  openBacklogPicker,
  addGameToQueue,
  addQueuePlatform,
  updateQueueLimit,
  setPlatformQueueState,
  moveQueueGame,
  moveQueueGameToPlatform,
  playQueueGameNow,
  updateCurrentlyPlayingGame,
  removeQueueGame,
  playGameFromCompactRow,
  finishGameFromCompactRow,
  dropGameFromCompactRow,
  handleSelectDiscoveryGame,
  openDiscoveryPreview,
  addToDiscoveryInbox,
  promoteInboxDiscoveryToLibrary,
  promoteInboxDiscoveryToWishlist,
  promoteInboxDiscoveryToPlans,
  handleInboxIgnore,
  handleReviewAction,
  startReviewMode,
  setReviewSource,
  restoreReviewIgnoredGames,
  syncSteamAchievements,
  refreshSteamPlaytime,
  syncWishlistDeals,
  syncSteamWishlist,
  importSteamWishlistHtmlItemsWithAnalytics,
  syncHltb,
  importNewSteamGames,
  importSteamGames,
  handleRetroImportGames,
  handleClearLibraryFilters,
  handleClearWishlistFilters,
  handleLibraryFiltersChange,
  handleWishlistFiltersChange,
  setLibraryFilters,
  markOnboardingItemComplete,
  markOnboardingItemsComplete,
  hideOnboarding,
  skipOnboardingItem,
  handleOnboardingAction,
  restartOnboarding,
  setIsRawgApiKeySet,
  setLibraryOwnerNickname,
  setShelfIdentity,
  handleSteamProfileNameChange,
  setNavigationVisibility,
  setThemePreference,
  setAppTemplatePreference,
  setAccentColorPreference,
  setSecondaryAccentColorPreference,
  setGradientOrientationPreference,
  setNeonButtonGradientBalancePreference,
  setNeonButtonGradientMidpointPreference,
  setNeonButtonStylePreference,
  setLanguage,
  setControllerProfileId,
  setIsControllerDebugEnabled,
  setIsLandscapeLockEnabled,
  handleBackupExported,
  handleBackupImported,
  addRetroImportedGamesToQueue,
  enrichRetroImportedGames,
  viewRetroImportedGames,
  unignoreSteamGame,
}: AppSectionRouterProps) {
  return (
    <section ref={mainContentRef} className={`qs-main-scroll py-2 ${activeNavItem === 'Home' ? 'qs-main-scroll--home' : 'bg-ink-950'}`}>
      {activeNavItem === 'Home' ? (
        <HomePanel
          appTitle={personalizedQuestShelfTitle}
          shelfTitle={computedShelfTitle}
          featuredGame={resolvedFeaturedGame}
          avatar={<ShelfAvatar {...shelfIdentity} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-14 w-14" />}
          games={games}
          ignoredReviewGameIds={reviewIgnoredGameIds}
          playActivity={playActivity}
          reviewQueueOrder={reviewModeState.queueOrder}
          reviewModeState={reviewModeState}
          queueState={platformQueueState}
          itadDealSyncState={itadDealSyncState}
          steamAchievementSyncState={steamAchievementSyncState}
          steamPlaytimeRefreshState={steamPlaytimeRefreshState}
          isImportingNewSteamGames={isImportingNewSteamGames}
          onOpenDetails={openGameFromHome}
          onOpenLibrary={() => {
            setSelectedGameId(null);
            setActiveNavItem('Library');
          }}
          onOpenQueue={openQueue}
          onOpenReviewMode={startReviewMode}
          onOpenSettings={() => {
            setSelectedGameId(null);
            setActiveNavItem('Settings');
            setActiveSettingsCategory('Personalization');
          }}
          onOpenWishlist={() => {
            setSelectedGameId(null);
            setActiveNavItem('Wishlist');
          }}
          onPlayToday={(game) => {
            if (game.status === 'Playing') {
              logPlayedToday(game);
              addToastNotification({ category: 'success', dedupeKey: `play-today:${game.id}`, message: `${game.title} is already in Playing Now.` });
              return;
            }
            const targetPlatform = platformQueueState.entries.find((e) => e.gameId === game.id)?.targetPlatform ?? game.platform;
            playQueueGameNow(game.id, targetPlatform);
            logPlayedToday(game);
          }}
          onQuickNote={(gameId, notes) => {
            const target = games.find((g) => g.id === gameId);
            if (!target) return;
            updateGameTracking(gameId, { notes, status: target.status, tags: target.tags });
            addToastNotification({ category: 'success', dedupeKey: `quick-note:${gameId}`, message: 'Note saved.' });
          }}
          onStatusChange={updateGameStatusWithCompletion}
          onSyncItadDeals={() => {
            const wishlistIds = games.filter((g) => g.collectionType === 'wishlist').map((g) => g.id);
            void syncWishlistDeals(wishlistIds);
          }}
          onImportNewSteamGames={() => {
            void importNewSteamGames();
          }}
          onOpenAchievementTimeline={() => setIsAchievementTimelineOpen(true)}
          onSyncSteamAchievements={() => {
            void syncSteamAchievements(homeSteamSyncGameIds, {
              emptyToastMessage: 'No Playing Now or Platform Plan Steam games are eligible for achievement sync.',
              showToast: true,
            });
          }}
          onSyncSteamPlaytime={() => {
            void refreshSteamPlaytime(homeSteamSyncGameIds, {
              emptyToastMessage: 'No Playing Now or Platform Plan Steam games are eligible for playtime sync.',
              showToast: true,
            });
          }}
          onSelectDiscoveryGame={handleSelectDiscoveryGame}
          onOpenDiscoveryPreview={openDiscoveryPreview}
          discoveryInboxRawgIds={discoveryInboxRawgIds}
        />
      ) : activeNavItem === 'Library' ? (
        <CollectionPanel
          collectionType="library"
          contentScrollRef={mainContentRef}
          filters={libraryFilters}
          steamAchievementSyncState={steamAchievementSyncState}
          steamPlaytimeRefreshState={steamPlaytimeRefreshState}
          games={filteredLibraryGames}
          allGames={games}
          ignoredReviewGameIds={reviewIgnoredGameIds}
          reviewModeState={reviewModeState}
          platformOptions={platformOptions}
          tags={tags}
          platformQueueState={platformQueueState}
          isHltbSyncing={isHltbSyncing}
          collectionActions={{
            addGame: () => setIsAddGameOpen(true),
            addToWishlist,
            addManyToWishlist,
            findArtwork: (game) => refreshGameMetadataFromActions(game, 'artwork'),
            findMetadata: refreshGameMetadataFromActions,
            moveToLibrary,
            openDetails: handleOpenDetailsFromCollection,
            remove: removeGame,
            removeAndIgnore: removeAndIgnoreSteamGame,
            statusChange: updateGameStatusWithCompletion,
          }}
          bulkActions={{
            enrich: startMetadataWorkflow,
            remove: removeManyGames,
            removeAndIgnore: removeAndIgnoreManyGames,
            statusChange: updateManyGameStatuses,
            syncHltb,
            syncSteamAchievements: (gameIds, options) =>
              syncSteamAchievements(gameIds, {
                completionToastMessage: formatSteamAchievementSyncSummary,
                emptyToastMessage: options?.emptyToastMessage,
                force: options?.force,
                showToast: true,
              }),
            refreshSteamPlaytime: (gameIds, options) =>
              refreshSteamPlaytime(gameIds, {
                completionToastMessage: (summary) => formatMessageTemplate(t('app.updatedPlaytimeForGames'), { count: summary.updatedCount }),
                emptyToastMessage: options?.emptyToastMessage,
                showToast: true,
              }),
          }}
          queueActions={{
            addToQueue: openBacklogPicker,
            openQueue: () => startReviewMode('backlog'),
            playNow: playGameFromCompactRow,
            finish: finishGameFromCompactRow,
            drop: dropGameFromCompactRow,
          }}
          reviewActions={{ startReview: startReviewMode }}
          filterActions={{
            clearFilters: handleClearLibraryFilters,
            filtersChange: handleLibraryFiltersChange,
          }}
          navigationActions={{
            openOnboarding,
            openIntegrations: () => {
              setActiveNavItem('Settings');
              setActiveSettingsCategory('Integrations');
            },
            openRetro: () => {
              setActiveNavItem('Settings');
              setActiveSettingsCategory('Retro');
            },
          }}
        />
      ) : activeNavItem === 'Wishlist' ? (
        <CollectionPanel
          collectionType="wishlist"
          contentScrollRef={mainContentRef}
          filters={wishlistFilters}
          games={filteredWishlistGames}
          platformOptions={platformOptions}
          steamWishlistSyncState={steamWishlistSyncState}
          itadDealSyncState={itadDealSyncState}
          tags={tags}
          platformQueueState={platformQueueState}
          isHltbSyncing={isHltbSyncing}
          collectionActions={{
            addGame: () => setIsAddGameOpen(true),
            addToWishlist,
            addManyToWishlist,
            findArtwork: (game) => refreshGameMetadataFromActions(game, 'artwork'),
            findMetadata: refreshGameMetadataFromActions,
            moveToLibrary,
            openDetails: handleOpenDetailsFromCollection,
            remove: removeGame,
            removeAndIgnore: removeAndIgnoreSteamGame,
            statusChange: updateGameStatusWithCompletion,
          }}
          bulkActions={{
            enrich: startMetadataWorkflow,
            remove: removeManyGames,
            removeAndIgnore: removeAndIgnoreManyGames,
            statusChange: updateManyGameStatuses,
            syncHltb,
          }}
          queueActions={{
            addToQueue: openBacklogPicker,
            playNow: playGameFromCompactRow,
            finish: finishGameFromCompactRow,
            drop: dropGameFromCompactRow,
          }}
          reviewActions={{ startReview: startReviewMode }}
          filterActions={{
            clearFilters: handleClearWishlistFilters,
            filtersChange: handleWishlistFiltersChange,
          }}
          syncActions={{
            syncSteamWishlist,
            importSteamWishlistHtml: importSteamWishlistHtmlItemsWithAnalytics,
            syncItadDeals: syncWishlistDeals,
          }}
        />
      ) : activeNavItem === 'Queue' ? (
        <QueuePanel
          games={games}
          contentScrollRef={mainContentRef}
          initialPlatform={targetQueuePlatform}
          queueState={platformQueueState}
          onAddGameToQueue={addGameToQueue}
          onFindArtwork={(game) => refreshGameMetadataFromActions(game, 'artwork')}
          onLimitChange={updateQueueLimit}
          onQueueStateChange={setPlatformQueueState}
          onMoveEntry={moveQueueGame}
          onMoveEntryToPlatform={moveQueueGameToPlatform}
          onPlayNow={playQueueGameNow}
          onPlayingAction={updateCurrentlyPlayingGame}
          onOpenDetails={setSelectedGameId}
          onRemoveEntry={removeQueueGame}
          onStartReview={() => startReviewMode('backlog')}
        />
      ) : activeNavItem === 'Review Mode' ? (
        <ReviewModePanel
          games={games}
          ignoredGameIds={reviewIgnoredGameIds}
          queuePlatforms={activeQueuePlatforms}
          queueState={platformQueueState}
          refreshingMetadataGameIds={refreshingMetadataGameIds}
          reviewModeState={reviewModeState}
          confirmCancelConvention={confirmCancelConvention}
          source={activeReviewSource}
          onAction={handleReviewAction}
          onEnsureRawgMetadata={ensureRawgMetadataForGame}
          onAddPlatform={addQueuePlatform}
          onOpenQueue={() => setActiveNavItem('Queue')}
          onRestoreIgnored={restoreReviewIgnoredGames}
          onReturnToLibrary={() => setActiveNavItem('Library')}
          onSourceChange={setReviewSource}
        />
      ) : activeNavItem === 'Discovery Inbox' ? (
        <DiscoveryInboxPanel
          items={discoveryInboxItems}
          onAddToLibrary={promoteInboxDiscoveryToLibrary}
          onAddToWishlist={promoteInboxDiscoveryToWishlist}
          onAddToPlans={promoteInboxDiscoveryToPlans}
          onIgnore={handleInboxIgnore}
        />
      ) : activeNavItem === 'Metadata' ? (
        <Suspense fallback={<PanelLoadingFallback />}>
          <MetadataEnrichmentPanel
            games={games}
            initialSelectedGameIds={metadataSelectionRequest?.ids}
            onMetadataManagementChange={updateGameMetadataManagement}
            onMetadataEnriched={() => markOnboardingItemComplete('metadata-enriched')}
            onMetadataUpdate={updateGameMetadata}
            selectionRequestId={metadataSelectionRequest?.requestId}
          />
        </Suspense>
      ) : activeNavItem === 'Artwork' ? (
        <ArtworkBrowserView
          games={games}
          onApplyArtworkUpdate={updateGameArtwork}
          onEnrichGames={startMetadataWorkflow}
          onFindArtwork={(game, mode = 'artwork') => refreshGameMetadataFromActions(game, mode as 'metadata' | 'artwork')}
          onOpenDetails={setSelectedGameId}
        />
      ) : activeNavItem === 'Discover' ? (
        <DiscoverPanel
          games={games}
          discoveryInboxRawgIds={discoveryInboxRawgIds}
          onAddToInbox={addToDiscoveryInbox}
          onOpenGame={openDiscoveryPreview}
        />
      ) : activeNavItem === 'Stats' ? (
        <Suspense fallback={<PanelLoadingFallback />}>
          <StatsPanel
            games={games}
            queueSummary={queueSummary}
            onOpenDetails={setSelectedGameId}
          />
        </Suspense>
      ) : activeNavItem === 'Quest Runner' ? (
        <div className="px-4 py-4">
          <Suspense fallback={<PanelLoadingFallback />}>
            <QuestRunnerGame games={games} />
          </Suspense>
        </div>
      ) : activeNavItem === 'Settings' ? (
        <Suspense fallback={<PanelLoadingFallback />}>
        <SettingsView
          activeCategory={activeSettingsCategory}
          autoBackupSignal={autoBackupSignal}
          setupTasks={setupTasks}
          onAddGame={() => setIsAddGameOpen(true)}
          onSyncAchievements={() => {
            const allSteamGameIds = games
              .filter((g) => g.collectionType === 'library' && typeof g.steamAppId === 'number')
              .map((g) => g.id);
            void syncSteamAchievements(allSteamGameIds, { showToast: true });
          }}
          completedOnboardingItemIds={completedOnboardingItemIds}
          skippedOnboardingItemIds={skippedOnboardingItemIds}
          games={games}
          ignoredSteamGames={ignoredSteamGames}
          libraryOwnerNickname={libraryOwnerNickname}
          personalizedQuestShelfTitle={personalizedQuestShelfTitle}
          shelfIdentity={shelfIdentity}
          questShelfAchievements={questShelfAchievements}
          activeAchievementTitle={computedShelfTitle}
          steamAvatarUrl={steamAvatarUrl}
          steamPersonaName={steamPersonaName}
          controllerProfileId={controllerProfileId}
          detectedProfileId={detectedProfileId}
          isControllerDebugEnabled={isControllerDebugEnabled}
          isLandscapeLockEnabled={isLandscapeLockEnabled}
          isOnboardingOpen={isOnboardingOpen}
          isOnboardingComplete={isOnboardingComplete}
          lastRetroImportsHiddenByFilters={areLastRetroImportsHiddenByFilters}
          resolvedTheme={resolvedTheme}
          runtimeEnvironment={runtimeEnvironment}
          themePreference={themePreference}
          appTemplatePreference={appTemplatePreference}
          accentColorPreference={accentColorPreference}
          secondaryAccentColorPreference={secondaryAccentColorPreference}
          gradientOrientationPreference={gradientOrientationPreference}
          neonButtonGradientBalancePreference={neonButtonGradientBalancePreference}
          neonButtonGradientMidpointPreference={neonButtonGradientMidpointPreference}
          neonButtonStylePreference={neonButtonStylePreference}
          language={language}
          navigationVisibility={navigationVisibility}
          platformQueueState={platformQueueState}
          steamPlaytimeRefreshState={steamPlaytimeRefreshState}
          steamWishlistSyncState={steamWishlistSyncState}
          onAddRetroImportedToQueue={addRetroImportedGamesToQueue}
          onBackupExported={handleBackupExported}
          onBackupImported={handleBackupImported}
          onCategoryChange={setActiveSettingsCategory}
          onLibraryOwnerNicknameChange={setLibraryOwnerNickname}
          onShelfIdentityChange={setShelfIdentity}
          onSteamAvatarImported={handleSteamProfileNameChange}
          onConnectionTested={() => markOnboardingItemComplete('steam-test')}
          onClearLibraryFilters={() => setLibraryFilters(initialCollectionFilters)}
          onEnrichRetroImportedGames={enrichRetroImportedGames}
          onImportGames={importSteamGames}
          onImportRetroGames={handleRetroImportGames}
          onControllerDebugChange={setIsControllerDebugEnabled}
          onControllerProfileChange={setControllerProfileId}
          onLandscapeLockChange={setIsLandscapeLockEnabled}
          onNavigationVisibilityChange={setNavigationVisibility}
          onOnboardingAction={handleOnboardingAction}
          onOnboardingClose={hideOnboarding}
          onOnboardingComplete={markOnboardingItemComplete}
          onOnboardingSkip={skipOnboardingItem}
          onOpenOnboarding={openOnboarding}
          onRestartOnboarding={restartOnboarding}
          onPlatformQueueStateChange={setPlatformQueueState}
          onRawgApiKeyConfigured={() => {
            markOnboardingItemComplete('rawg-api-key');
            setIsRawgApiKeySet(true);
          }}
          onRefreshSteamPlaytime={() => refreshSteamPlaytime()}
          onSteamApiKeyConfigured={() => markOnboardingItemComplete('steam-api-key')}
          onSteamIdConfigured={() => markOnboardingItemComplete('steam-id64')}
          onSteamProfileNameChange={handleSteamProfileNameChange}
          onSteamLibraryImported={() => markOnboardingItemsComplete(['steam-import', 'steam-connect'])}
          onImportSteamWishlistHtml={importSteamWishlistHtmlItemsWithAnalytics}
          onSyncSteamWishlist={syncSteamWishlist}
          onReviewRetroImportedGames={() => startReviewMode('recent-imports')}
          onThemePreferenceChange={setThemePreference}
          onAppTemplatePreferenceChange={setAppTemplatePreference}
          onAccentColorChange={setAccentColorPreference}
          onSecondaryAccentColorChange={setSecondaryAccentColorPreference}
          onGradientOrientationChange={setGradientOrientationPreference}
          onNeonButtonGradientBalanceChange={setNeonButtonGradientBalancePreference}
          onNeonButtonGradientMidpointChange={setNeonButtonGradientMidpointPreference}
          onNeonButtonStyleChange={setNeonButtonStylePreference}
          onLanguageChange={setLanguage}
          onUnignoreSteamGame={unignoreSteamGame}
          onViewRetroImportedGames={viewRetroImportedGames}
        />
        </Suspense>
      ) : (
        <PlaceholderPanel title={activeNavItem} />
      )}
    </section>
  );
}
