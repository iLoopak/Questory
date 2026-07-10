import { useEffect, useMemo, useRef } from 'react';
import { bucketLibrarySize, bucketItemCount } from '../../lib/analytics';
import { trackAnalyticsEvent, type TelemetryProperties } from '../../lib/analytics';
import type { NavItem } from '../../config/navigation';
import type { SettingsCategory } from '../../config/settings';
import type { Game, GamePlatform } from '../../types/game';

type UseAnalyticsParams = { activeNavItem: NavItem; activeQueuePlatforms: GamePlatform[]; activeSettingsCategory: SettingsCategory | null; games: Game[]; isAppReady: boolean; isOnboardingComplete: boolean; queuedCount: number };

export function useAnalytics({ activeNavItem, activeQueuePlatforms, activeSettingsCategory, games, isAppReady, isOnboardingComplete, queuedCount }: UseAnalyticsParams) {
  const counts = useMemo(() => ({ librarySize: games.filter((game) => game.collectionType === 'library').length, wishlistSize: games.filter((game) => game.collectionType === 'wishlist').length, platformCount: activeQueuePlatforms.length, playingCount: games.filter((game) => game.collectionType === 'library' && game.status === 'Playing').length, queueCount: queuedCount }), [activeQueuePlatforms.length, games, queuedCount]);
  const trackedSessionEventsRef = useRef(new Set<string>());
  function trackMinimalAnalyticsEvent(eventName: Parameters<typeof trackAnalyticsEvent>[0], properties: TelemetryProperties = {}) { trackAnalyticsEvent(eventName, properties); }
  function trackSessionAnalyticsEvent(eventName: Parameters<typeof trackAnalyticsEvent>[0], properties: TelemetryProperties = {}) { const eventKey = `${eventName}:${JSON.stringify(properties)}`; if (trackedSessionEventsRef.current.has(eventKey)) return; trackedSessionEventsRef.current.add(eventKey); trackMinimalAnalyticsEvent(eventName, properties); }
  useEffect(() => { if (isAppReady) trackSessionAnalyticsEvent('app_session_started', { install_mode: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches ? 'installed' : 'browser_tab', library_size_bucket: bucketLibrarySize(counts.librarySize), has_completed_onboarding: isOnboardingComplete, telemetry_schema_version: 2 }); }, [isAppReady, isOnboardingComplete, counts.librarySize]);
  useEffect(() => { if (isOnboardingComplete) trackSessionAnalyticsEvent('onboarding_completed', { completion_path: counts.librarySize > 0 ? 'existing_library' : 'fresh_install', integrations_configured_bucket: counts.platformCount <= 0 ? 'none' : counts.platformCount === 1 ? 'one' : 'multiple' }); }, [isOnboardingComplete, counts.librarySize, counts.platformCount]);
  useEffect(() => { if (activeNavItem === 'Queue') trackSessionAnalyticsEvent('quest_queue_started', { queue_source: 'library', batch_size_bucket: counts.queueCount <= 5 ? '1_5' : counts.queueCount <= 10 ? '6_10' : counts.queueCount <= 20 ? '11_20' : '20_plus', filter_mode: activeQueuePlatforms.length > 0 ? 'filtered' : 'default' }); }, [activeNavItem, activeQueuePlatforms.length, counts.queueCount]);
  useEffect(() => { if (activeNavItem === 'Settings' && activeSettingsCategory === 'Platforms') trackSessionAnalyticsEvent('discover_section_opened', { section: 'other' }); }, [activeNavItem, activeSettingsCategory]);
  return { trackMinimalAnalyticsEvent, counts, bucketItemCount };
}
