import { useEffect, useMemo, useState } from 'react';
import { getVisibleNavItems, isNavigationItemVisible, isTopNavItem, type NavItem, type TopNavItem } from '../config/navigation';
import { settingsCategories, settingsCategoryStorageKey, type SettingsCategory } from '../config/settings';
import { isOption } from '../utils/gameFilters';
import {
  loadNavigationVisibilityPreferences,
  saveNavigationVisibilityPreferences,
  type NavigationVisibilityPreferences,
} from '../lib/navigationVisibilityPreferences';

export function useAppNavigation({ onSectionChange }: { onSectionChange?: () => void } = {}) {
  const [activeNavItem, setActiveNavItem] = useState<NavItem>('Library');
  const [activeSettingsCategory, setActiveSettingsCategory] = useState<SettingsCategory>(() => loadSettingsCategory());
  const [navigationVisibility, setNavigationVisibility] = useState<NavigationVisibilityPreferences>(() =>
    loadNavigationVisibilityPreferences(),
  );
  const visibleNavItems = useMemo(() => getVisibleNavItems(navigationVisibility), [navigationVisibility]);

  function switchSection(item: NavItem) {
    setActiveNavItem(item);
    onSectionChange?.();
  }

  function switchSettingsCategory(category: SettingsCategory) {
    setActiveSettingsCategory(category);
  }

  function openSettingsCategory(category: SettingsCategory) {
    setActiveNavItem('Settings');
    setActiveSettingsCategory(category);
    onSectionChange?.();
  }

  useEffect(() => {
    saveNavigationVisibilityPreferences(navigationVisibility);
  }, [navigationVisibility]);

  useEffect(() => {
    saveSettingsCategory(activeSettingsCategory);
  }, [activeSettingsCategory]);

  useEffect(() => {
    if (!isTopNavItem(activeNavItem) || isNavigationItemVisible(activeNavItem, navigationVisibility)) {
      return;
    }

    setActiveNavItem('Library');
    onSectionChange?.();
  }, [activeNavItem, navigationVisibility, onSectionChange]);

  return {
    activeNavItem,
    activeSettingsCategory,
    navigationVisibility,
    openSettingsCategory,
    setActiveNavItem,
    setActiveSettingsCategory,
    setNavigationVisibility,
    switchSection,
    switchSettingsCategory,
    visibleNavItems,
  };
}

function loadSettingsCategory(): SettingsCategory {
  if (typeof window === 'undefined') {
    return 'Integrations';
  }

  try {
    const storedCategory = window.localStorage.getItem(settingsCategoryStorageKey);

    if (storedCategory === 'Data') {
      return 'Data & Backup';
    }

    if (storedCategory === 'Queue Platforms') {
      return 'Platforms';
    }

    return isOption(storedCategory, settingsCategories) ? storedCategory : 'Integrations';
  } catch {
    return 'Integrations';
  }
}

function saveSettingsCategory(category: SettingsCategory) {
  try {
    window.localStorage.setItem(settingsCategoryStorageKey, category);
  } catch {
    // Settings navigation should stay usable even when preference persistence is unavailable.
  }
}
