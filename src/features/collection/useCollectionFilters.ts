import { useMemo } from 'react';
import { initialCollectionFilters } from '../../config/collection';
import { useCollectionUiState } from '../../hooks/useCollectionUiState';
import { getVisibleCollectionGames } from '../../utils/collectionFilters';
import { gamePlatforms } from '../../types/game';
import type { Game } from '../../types/game';

export function useCollectionFilters(games: Game[]) {
  const { libraryFilters, setLibraryFilters, setWishlistFilters, wishlistFilters } = useCollectionUiState();

  const tags = useMemo(() => {
    return Array.from(new Set(games.flatMap((game) => game.tags))).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const platformOptions = useMemo(() => {
    return Array.from(new Set([...gamePlatforms, ...games.map((game) => game.platform)])).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const filteredLibraryGames = useMemo(() => {
    return getVisibleCollectionGames(games, libraryFilters, 'library');
  }, [games, libraryFilters]);

  const filteredWishlistGames = useMemo(() => {
    return getVisibleCollectionGames(games, wishlistFilters, 'wishlist');
  }, [games, wishlistFilters]);

  return {
    filteredLibraryGames,
    filteredWishlistGames,
    initialCollectionFilters,
    libraryFilters,
    platformOptions,
    setLibraryFilters,
    setWishlistFilters,
    tags,
    wishlistFilters,
  };
}
