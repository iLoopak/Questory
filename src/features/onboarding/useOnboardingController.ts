import { useMemo, useState } from 'react';
import { isMockGame, loadGames } from '../../lib/gameStorage';
import { loadOnboardingState, onboardingItemIds, type OnboardingItemId, type OnboardingState } from '../../lib/onboardingStorage';
import { loadSteamSettings } from '../../lib/steamSettingsStorage';
import { loadAnalyticsSettings } from '../../lib/analytics';
import type { SettingsCategory } from '../../config/settings';
import type { NavItem } from '../../config/navigation';
import type { Game } from '../../types/game';

export type OnboardingActionDependencies = {
  setActiveNavItem: (item: NavItem) => void;
  setActiveSettingsCategory: (category: SettingsCategory) => void;
  setIsAddGameOpen: (isOpen: boolean) => void;
  setSelectedGameId: (gameId: string | null) => void;
};

export function useOnboardingController({ setActiveNavItem, setActiveSettingsCategory, setIsAddGameOpen, setSelectedGameId }: OnboardingActionDependencies) {
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() => loadOnboardingState());
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    const initialState = loadOnboardingState();
    const hasExistingLibrary = loadGames().some((game) => !isMockGame(game));
    const steamSettings = loadSteamSettings();
    const hasExistingSettings = Boolean(steamSettings.apiKey.trim() || steamSettings.steamId64.trim());
    return !initialState.hasSeenChecklist && !initialState.skipped && !hasExistingLibrary && !hasExistingSettings;
  });

  const analyticsSettings = loadAnalyticsSettings();
  const requiredOnboardingItemIds = useMemo(() => onboardingItemIds, []);
  const completedOnboardingItemIds = useMemo(() => new Set(onboardingItemIds.filter((itemId) => itemId === 'analytics-notice' && analyticsSettings.hasSeenAnalyticsNotice || Boolean(onboardingState.completedAt[itemId]))), [analyticsSettings.hasSeenAnalyticsNotice, onboardingState.completedAt]);
  const skippedOnboardingItemIds = useMemo(() => new Set(onboardingItemIds.filter((itemId) => Boolean(onboardingState.skippedAt[itemId]))), [onboardingState.skippedAt]);
  const finishedOnboardingItemIds = useMemo(() => new Set(requiredOnboardingItemIds.filter((itemId) => completedOnboardingItemIds.has(itemId) || skippedOnboardingItemIds.has(itemId))), [completedOnboardingItemIds, requiredOnboardingItemIds, skippedOnboardingItemIds]);
  const isOnboardingComplete = finishedOnboardingItemIds.size === requiredOnboardingItemIds.length;

  function updateOnboardingState(updater: (currentState: OnboardingState) => OnboardingState) {
    setOnboardingState((currentState) => updater(currentState));
  }

  function markOnboardingItemComplete(itemId: OnboardingItemId) { markOnboardingItemsComplete([itemId]); }

  function markOnboardingItemsComplete(itemIds: Array<OnboardingItemId | null>) {
    const nextItemIds = itemIds.filter((itemId): itemId is OnboardingItemId => Boolean(itemId));
    if (nextItemIds.length === 0) return;
    updateOnboardingState((currentState) => {
      const nextCompletedAt = { ...currentState.completedAt };
      let changed = false;
      nextItemIds.forEach((itemId) => {
        if (!nextCompletedAt[itemId]) { nextCompletedAt[itemId] = new Date().toISOString(); changed = true; }
      });
      if (!changed) return currentState;
      const nextSkippedAt = { ...currentState.skippedAt };
      nextItemIds.forEach((itemId) => { delete nextSkippedAt[itemId]; });
      return { ...currentState, completedAt: nextCompletedAt, skippedAt: nextSkippedAt };
    });
  }

  function openOnboarding() { updateOnboardingState((s) => ({ ...s, hasSeenChecklist: true, skipped: false })); setIsOnboardingOpen(true); }
  function hideOnboarding() { updateOnboardingState((s) => ({ ...s, hasSeenChecklist: true })); setIsOnboardingOpen(false); }
  function restartOnboarding() {
    updateOnboardingState((currentState) => {
      const nextCompletedAt = { ...currentState.completedAt };
      const nextSkippedAt = { ...currentState.skippedAt };
      onboardingItemIds.forEach((itemId) => { delete nextCompletedAt[itemId]; delete nextSkippedAt[itemId]; });
      return { ...currentState, completedAt: nextCompletedAt, hasSeenChecklist: true, skipped: false, skippedAt: nextSkippedAt };
    });
    setIsOnboardingOpen(true);
  }
  function skipOnboardingItem(itemId: OnboardingItemId) {
    updateOnboardingState((currentState) => currentState.completedAt[itemId] || currentState.skippedAt[itemId] ? currentState : { ...currentState, hasSeenChecklist: true, skippedAt: { ...currentState.skippedAt, [itemId]: new Date().toISOString() } });
  }
  function handleOnboardingAction(itemId: OnboardingItemId, action: 'primary' | 'secondary' = 'primary') {
    if (itemId === 'queue-game' || itemId === 'manual-game' || itemId === 'wishlist-item') { setActiveNavItem(itemId === 'wishlist-item' ? 'Wishlist' : 'Library'); setSelectedGameId(null); setIsAddGameOpen(true); return; }
    if (itemId === 'ready') { setActiveNavItem(action === 'secondary' ? 'Queue' : 'Library'); setSelectedGameId(null); setIsOnboardingOpen(false); return; }
    if (itemId === 'metadata-enriched') { setActiveNavItem('Metadata'); setSelectedGameId(null); return; }
    setActiveNavItem('Settings'); setSelectedGameId(null);
    if (itemId === 'platforms') { setActiveSettingsCategory('Platforms'); return; }
    if (itemId === 'retro-import') { setActiveSettingsCategory('Retro'); return; }
    if (itemId === 'backup-exported') { setActiveSettingsCategory('Data & Backup'); return; }
    setActiveSettingsCategory('Integrations');
  }

  return { completedOnboardingItemIds, finishedOnboardingItemIds, handleOnboardingAction, hideOnboarding, isOnboardingComplete, isOnboardingOpen, markOnboardingItemComplete, markOnboardingItemsComplete, onboardingState, openOnboarding, restartOnboarding, setOnboardingState, skipOnboardingItem, skippedOnboardingItemIds };
}
