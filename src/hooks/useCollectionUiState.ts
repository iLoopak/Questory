import { useEffect, useRef, useState } from 'react';
import {
  collectionViewModeStorageKey,
  collectionViewModes,
  initialCollectionFilters,
  libraryFiltersStorageKey,
  wishlistFiltersStorageKey,
  type CollectionFilters,
  type CollectionViewMode,
} from '../config/collection';
import { normalizeCollectionFilters } from '../utils/gameFilters';
import type { GameCollectionType } from '../types/game';

export function useCollectionUiState() {
  const [libraryFilters, setLibraryFilters] = useState<CollectionFilters>(() =>
    loadCollectionFilters(libraryFiltersStorageKey),
  );
  const [wishlistFilters, setWishlistFilters] = useState<CollectionFilters>(() =>
    loadCollectionFilters(wishlistFiltersStorageKey),
  );

  useEffect(() => {
    saveCollectionFilters(libraryFiltersStorageKey, libraryFilters);
  }, [libraryFilters]);

  useEffect(() => {
    saveCollectionFilters(wishlistFiltersStorageKey, wishlistFilters);
  }, [wishlistFilters]);

  return { libraryFilters, setLibraryFilters, setWishlistFilters, wishlistFilters };
}

export function useCollectionViewMode(collectionType: GameCollectionType) {
  const [viewMode, setViewMode] = useState<CollectionViewMode>(() => loadCollectionViewMode(collectionType));
  const activeViewModeCollectionRef = useRef(collectionType);

  useEffect(() => {
    saveCollectionViewMode(activeViewModeCollectionRef.current, viewMode);
  }, [viewMode]);

  useEffect(() => {
    activeViewModeCollectionRef.current = collectionType;
    setViewMode(loadCollectionViewMode(collectionType));
  }, [collectionType]);

  return { setViewMode, viewMode };
}

function loadCollectionFilters(storageKey: string): CollectionFilters {
  if (typeof window === 'undefined') {
    return initialCollectionFilters;
  }

  try {
    const storedFilters = window.localStorage.getItem(storageKey);

    if (!storedFilters) {
      return initialCollectionFilters;
    }

    return normalizeCollectionFilters(JSON.parse(storedFilters));
  } catch {
    return initialCollectionFilters;
  }
}

function saveCollectionFilters(storageKey: string, filters: CollectionFilters) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  } catch {
    // Filter persistence is nice to have; the library itself still works without it.
  }
}

function getCollectionViewModeKey(collectionType: GameCollectionType) {
  return `${collectionViewModeStorageKey}.${collectionType}`;
}

function loadCollectionViewMode(collectionType: GameCollectionType): CollectionViewMode {
  if (typeof window === 'undefined') {
    return 'Grid View';
  }

  try {
    const storedViewMode = window.localStorage.getItem(getCollectionViewModeKey(collectionType));

    return isCollectionViewMode(storedViewMode) ? storedViewMode : 'Grid View';
  } catch {
    return 'Grid View';
  }
}

function saveCollectionViewMode(collectionType: GameCollectionType, viewMode: CollectionViewMode) {
  try {
    window.localStorage.setItem(getCollectionViewModeKey(collectionType), viewMode);
  } catch {
    // View mode persistence is optional; browsing still works without it.
  }
}

function isCollectionViewMode(value: unknown): value is CollectionViewMode {
  return collectionViewModes.some((viewMode) => viewMode === value);
}
