import { useEffect, useMemo, useRef } from 'react';
import { trackAnalyticsEvent, type AnalyticsCounts, type AnalyticsImportSource } from '../../lib/analytics';
import type { NavItem } from '../../config/navigation';
import type { SettingsCategory } from '../../config/settings';
import type { Game, GamePlatform } from '../../types/game';

type UseAnalyticsParams = {
  activeNavItem: NavItem;
  activeQueuePlatforms: GamePlatform[];
  activeSettingsCategory: SettingsCategory | null;
  games: Game[];
  isAppReady: boolean;
  isOnboardingComplete: boolean;
  queuedCount: number;
};

export function useAnalytics({
  activeNavItem,
  activeQueuePlatforms,
  activeSettingsCategory,
  games,
  isAppReady,
  isOnboardingComplete,
  queuedCount,
}: UseAnalyticsParams) {
  const analyticsCounts = useMemo<AnalyticsCounts>(() => ({
    librarySize: games.filter((game) => game.collectionType === 'library').length,
    wishlistSize: games.filter((game) => game.collectionType === 'wishlist').length,
    platformCount: activeQueuePlatforms.length,
    playingCount: games.filter((game) => game.collectionType === 'library' && game.status === 'Playing').length,
    queueCount: queuedCount,
  }), [activeQueuePlatforms.length, games, queuedCount]);

  const trackedSessionEventsRef = useRef(new Set<string>());

  function trackMinimalAnalyticsEvent(eventName: Parameters<typeof trackAnalyticsEvent>[0], importSource?: AnalyticsImportSource) {
    trackAnalyticsEvent(eventName, analyticsCounts, importSource ? { importSource } : undefined);
  }

  function trackSessionAnalyticsEvent(eventName: Parameters<typeof trackAnalyticsEvent>[0], importSource?: AnalyticsImportSource) {
    const eventKey = importSource ? `${eventName}:${importSource}` : eventName;
    if (trackedSessionEventsRef.current.has(eventKey)) return;
    trackedSessionEventsRef.current.add(eventKey);
    trackMinimalAnalyticsEvent(eventName, importSource);
  }

  useEffect(() => {
    if (isAppReady) trackSessionAnalyticsEvent('app_open');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppReady, analyticsCounts]);

  useEffect(() => {
    if (isOnboardingComplete) trackSessionAnalyticsEvent('first_run_completed');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnboardingComplete, analyticsCounts]);

  useEffect(() => {
    if (activeNavItem === 'Queue') trackSessionAnalyticsEvent('quest_queue_opened');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNavItem, analyticsCounts]);

  useEffect(() => {
    if (activeNavItem === 'Settings' && activeSettingsCategory === 'Platforms') trackSessionAnalyticsEvent('platform_plans_opened');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNavItem, activeSettingsCategory, analyticsCounts]);

  return { trackMinimalAnalyticsEvent };
}
