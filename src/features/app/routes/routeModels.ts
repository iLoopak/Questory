/**
 * The route contracts.
 *
 * AS-22: these lived in `AppSectionRouter`, which imports every route — and every route imported the
 * models back out of it. A type-only cycle, harmless at runtime but a lie about the direction of the
 * dependency: a route depends on its CONTRACT, not on the router that happens to satisfy it. The
 * contract lives here now, and both sides import it. `AppSectionRouter` re-exports the models, so
 * every existing import path keeps working.
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { NavItem } from '../../../config/navigation';
import type { SettingsCategory } from '../../../config/settings';
import type { CollectionFilters } from '../../../config/collection';
import type { ItadDealSyncState } from '../../../config/syncStates';
import type { AppLanguage, TFunction } from '../../../i18n';
import type { Game, GamePlatform, GameStatus } from '../../../types/game';
import type { RawgMetadata } from '../../../types/rawg';
import type {
  SteamAchievementSyncState,
  SteamAchievementSyncSummary,
  SteamPlaytimeRefreshState,
  SteamPlaytimeRefreshSummary,
  SteamWishlistSyncState,
} from '../../../types/steam';
import type { PlatformQueueState, PlatformQueueSummary } from '../../../lib/platformQueueStorage';
import type { ReviewModeState, ReviewSource } from '../../../lib/reviewModeStorage';
import type {
  AccentColorPreference,
  AppTemplatePreference,
  GradientOrientationPreference,
  NeonButtonGradientBalancePreference,
  NeonButtonGradientMidpointPreference,
  NeonButtonStylePreference,
  ResolvedTheme,
  ThemePreference,
} from '../../../lib/themePreferences';
import type { IgnoredSteamGame } from '../../../lib/steamIgnoredGamesStorage';
import type { PlayActivityRecord } from '../../../lib/playActivityStorage';
import type { DiscoveryInboxItem } from '../../../lib/discoveryInboxStorage';
import type { OnboardingItemId } from '../../../lib/onboardingStorage';
import type { RuntimeEnvironment } from '../../../lib/capacitorEnvironment';
import type { NavigationVisibilityPreferences } from '../../../lib/navigationVisibilityPreferences';
import type { ShelfIdentitySettings } from '../../../lib/shelfIdentity';
import type { NotificationDraft } from '../../../lib/notifications';
import type { SetupTask } from '../../../lib/setupTasks';
import type { ConfirmCancelConvention, ControllerProfileId } from '../../../lib/controllerProfiles';
import type { DiscoveryCandidate, DiscoveryGame } from '../../../lib/discovery';
import type { HltbSyncSummary } from '../../../lib/hltb';
import type { MultiGameImportParseResult, MultiGameImportSummary } from '../../../lib/multiGameImport';
import type { ParsedSteamWishlistImportItem } from '../../../lib/steamWishlistHtmlImport';
import type { QuestShelfAchievementProgress } from '../../../lib/questShelfAchievements';
import type { MetadataRefreshMode, MetadataRefreshResult, MetadataSelectionRequest } from '../../../hooks/useMetadataArtworkActions';
import type { PlayingGameAction, ReviewModeAction, ReviewModeActionContext } from '../../../types/gameActions';
import type { PlannedGameIds } from '../../../lib/plannedGames';
import type { CollectionDetailAnchor } from '../../../hooks/useCollectionAnchorRestoration';
import type { SteamWishlistHtmlImportSummary } from '../../../utils/summaryFormatters';
import type { SteamOwnedImportSummary } from '../../../lib/importTransitions';


export type AppSectionRouteModel = {
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
  plannedGameIds: PlannedGameIds;
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
  requestDiscoveryInboxRecommendations: () => void;
  isRequestingDiscoveryInboxRecommendations: boolean;

  // ── Onboarding ─────────────────────────────────────────────────────────────
  completedOnboardingItemIds: Set<OnboardingItemId>;
  skippedOnboardingItemIds: Set<OnboardingItemId>;
  isOnboardingOpen: boolean;
  isOnboardingComplete: boolean;

  // ── Steam ──────────────────────────────────────────────────────────────────
  steamPersonaName: string;

  // ── Settings ───────────────────────────────────────────────────────────────
  activeSettingsCategory: SettingsCategory | null;
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
  collectionDetailReturnAnchor: CollectionDetailAnchor | null;
  completeCollectionDetailReturn: (requestId: number) => void;
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
  handleOpenDetailsFromCollection: (gameId: string, anchor?: CollectionDetailAnchor) => void;

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
  promoteDiscoveryToWishlist: (game: DiscoveryGame) => void;
  promoteDiscoveryToPlans: (game: DiscoveryGame) => void;
  promoteInboxDiscoveryToLibrary: (item: DiscoveryInboxItem) => void;
  promoteInboxDiscoveryToWishlist: (item: DiscoveryInboxItem) => void;
  promoteInboxDiscoveryToPlans: (item: DiscoveryInboxItem) => void;
  handleInboxIgnore: (item: DiscoveryInboxItem) => void;
  handleInboxSkip: (item: DiscoveryInboxItem) => void;
  startDiscoveryInboxRun: () => void;

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
  importMultiGameItemsWithAnalytics: (parsed: MultiGameImportParseResult) => MultiGameImportSummary;
  importSteamWishlistHtmlItemsWithAnalytics: (items: ParsedSteamWishlistImportItem[], skippedCount?: number) => SteamWishlistHtmlImportSummary;
  syncHltb: (gameIds: string[]) => Promise<HltbSyncSummary | null>;
  importNewSteamGames: () => Promise<void>;
  importSteamGames: (games: Game[]) => SteamOwnedImportSummary;
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

type AppRouterCoreKeys = 'activeNavItem' | 'mainContentRef' | 't' | 'addToastNotification' | 'setActiveNavItem' | 'setActiveSettingsCategory' | 'setSelectedGameId' | 'setIsAddGameOpen' | 'openOnboarding' | 'setIsAchievementTimelineOpen' | 'openGameFromHome' | 'collectionDetailReturnAnchor' | 'completeCollectionDetailReturn';
type AppRouterGameKeys = 'games' | 'filteredLibraryGames' | 'filteredWishlistGames' | 'playActivity' | 'reviewIgnoredGameIds' | 'ignoredSteamGames' | 'addToWishlist' | 'addManyToWishlist' | 'moveToLibrary' | 'removeGame' | 'removeAndIgnoreSteamGame' | 'removeManyGames' | 'removeAndIgnoreManyGames' | 'updateGameStatusWithCompletion' | 'updateManyGameStatuses' | 'updateGameTracking' | 'updateGameReviewFieldsWithCompletion' | 'logPlayedToday' | 'handleOpenDetailsFromCollection';
type AppRouterCollectionKeys = 'libraryFilters' | 'wishlistFilters' | 'platformOptions' | 'tags' | 'areLastRetroImportsHiddenByFilters' | 'handleClearLibraryFilters' | 'handleClearWishlistFilters' | 'handleLibraryFiltersChange' | 'handleWishlistFiltersChange' | 'setLibraryFilters';
type AppRouterQueueKeys = 'platformQueueState' | 'plannedGameIds' | 'queueSummary' | 'activeQueuePlatforms' | 'targetQueuePlatform' | 'homeSteamSyncGameIds' | 'openQueue' | 'openBacklogPicker' | 'addGameToQueue' | 'addQueuePlatform' | 'updateQueueLimit' | 'setPlatformQueueState' | 'moveQueueGame' | 'moveQueueGameToPlatform' | 'playQueueGameNow' | 'updateCurrentlyPlayingGame' | 'removeQueueGame' | 'playGameFromCompactRow' | 'finishGameFromCompactRow' | 'dropGameFromCompactRow';
type AppRouterReviewKeys = 'reviewModeState' | 'activeReviewSource' | 'confirmCancelConvention' | 'handleReviewAction' | 'startReviewMode' | 'setReviewSource' | 'restoreReviewIgnoredGames';
type AppRouterSyncKeys = 'itadDealSyncState' | 'steamAchievementSyncState' | 'steamPlaytimeRefreshState' | 'steamWishlistSyncState' | 'isImportingNewSteamGames' | 'isHltbSyncing' | 'syncSteamAchievements' | 'refreshSteamPlaytime' | 'syncWishlistDeals' | 'syncSteamWishlist' | 'syncHltb' | 'importNewSteamGames';
type AppRouterShelfKeys = 'personalizedQuestShelfTitle' | 'computedShelfTitle' | 'shelfIdentity' | 'steamAvatarUrl' | 'libraryOwnerNickname' | 'questShelfAchievements' | 'setLibraryOwnerNickname' | 'setShelfIdentity';
type AppRouterDiscoveryKeys = 'discoveryInboxItems' | 'discoveryInboxRawgIds' | 'requestDiscoveryInboxRecommendations' | 'isRequestingDiscoveryInboxRecommendations' | 'handleSelectDiscoveryGame' | 'openDiscoveryPreview' | 'addToDiscoveryInbox' | 'promoteDiscoveryToWishlist' | 'promoteDiscoveryToPlans' | 'promoteInboxDiscoveryToLibrary' | 'promoteInboxDiscoveryToWishlist' | 'promoteInboxDiscoveryToPlans' | 'handleInboxIgnore' | 'handleInboxSkip' | 'startDiscoveryInboxRun';
type AppRouterOnboardingKeys = 'completedOnboardingItemIds' | 'skippedOnboardingItemIds' | 'isOnboardingOpen' | 'isOnboardingComplete' | 'markOnboardingItemComplete' | 'markOnboardingItemsComplete' | 'hideOnboarding' | 'skipOnboardingItem' | 'handleOnboardingAction' | 'restartOnboarding';
type AppRouterSettingsKeys = 'activeSettingsCategory' | 'setupTasks' | 'runtimeEnvironment' | 'resolvedTheme' | 'themePreference' | 'appTemplatePreference' | 'accentColorPreference' | 'secondaryAccentColorPreference' | 'gradientOrientationPreference' | 'neonButtonGradientBalancePreference' | 'neonButtonGradientMidpointPreference' | 'neonButtonStylePreference' | 'language' | 'navigationVisibility' | 'controllerProfileId' | 'detectedProfileId' | 'isControllerDebugEnabled' | 'isLandscapeLockEnabled' | 'steamPersonaName' | 'setIsRawgApiKeySet' | 'handleSteamProfileNameChange' | 'setNavigationVisibility' | 'setThemePreference' | 'setAppTemplatePreference' | 'setAccentColorPreference' | 'setSecondaryAccentColorPreference' | 'setGradientOrientationPreference' | 'setNeonButtonGradientBalancePreference' | 'setNeonButtonGradientMidpointPreference' | 'setNeonButtonStylePreference' | 'setLanguage' | 'setControllerProfileId' | 'setIsControllerDebugEnabled' | 'setIsLandscapeLockEnabled' | 'handleBackupExported' | 'handleBackupImported' | 'unignoreSteamGame';
type AppRouterMetadataKeys = 'metadataSelectionRequest' | 'refreshingMetadataGameIds' | 'updateGameArtwork' | 'updateGameMetadata' | 'updateGameMetadataManagement' | 'refreshGameMetadataFromActions' | 'startMetadataWorkflow' | 'ensureRawgMetadataForGame';
type AppRouterImportKeys = 'importMultiGameItemsWithAnalytics' | 'importSteamWishlistHtmlItemsWithAnalytics' | 'importSteamGames' | 'handleRetroImportGames' | 'addRetroImportedGamesToQueue' | 'enrichRetroImportedGames' | 'viewRetroImportedGames';

export type AppRouterCoreModel = Pick<AppSectionRouteModel, AppRouterCoreKeys>;
export type AppRouterGameModel = Pick<AppSectionRouteModel, AppRouterGameKeys>;
export type AppRouterCollectionModel = Pick<AppSectionRouteModel, AppRouterCollectionKeys>;
export type AppRouterQueueModel = Pick<AppSectionRouteModel, AppRouterQueueKeys>;
export type AppRouterReviewModel = Pick<AppSectionRouteModel, AppRouterReviewKeys>;
export type AppRouterSyncModel = Pick<AppSectionRouteModel, AppRouterSyncKeys>;
export type AppRouterShelfModel = Pick<AppSectionRouteModel, AppRouterShelfKeys>;
export type AppRouterDiscoveryModel = Pick<AppSectionRouteModel, AppRouterDiscoveryKeys>;
export type AppRouterOnboardingModel = Pick<AppSectionRouteModel, AppRouterOnboardingKeys>;
export type AppRouterSettingsModel = Pick<AppSectionRouteModel, AppRouterSettingsKeys>;
export type AppRouterMetadataModel = Pick<AppSectionRouteModel, AppRouterMetadataKeys>;
export type AppRouterImportModel = Pick<AppSectionRouteModel, AppRouterImportKeys>;
