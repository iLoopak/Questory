import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { createTranslator } from '../i18n';
import type { NavItem } from '../config/navigation';
import { hasRealArtwork, getStoredArtworkSource } from '../lib/gameCoverImages';
import { mergeRawgMetadataIntoGame } from '../lib/metadataMerge';
import { formatGameToastMessage, getLinkRawgGameAction, type NotificationDraft } from '../lib/notifications';
import { refreshRawgMetadataForGame } from '../lib/rawgMetadataEnrichment';
import { fetchSteamGridDbArtworkForGame, mergeSteamGridDbArtworkIntoGame } from '../lib/steamGridDbArtwork';
import { RawgApiError } from '../services/rawgApi';
import type { Game } from '../types/game';
import type { RawgMetadata } from '../types/rawg';

export type MetadataSelectionRequest = {
  ids: string[];
  requestId: number;
};

export type MetadataRefreshMode = 'metadata' | 'artwork';

export type MetadataRefreshResult = 'updated' | 'no-match' | 'error';

type UseMetadataArtworkActionsOptions = {
  addToastNotification: (notification: NotificationDraft) => void;
  games: Game[];
  markOnboardingItemComplete: (itemId: 'metadata-enriched') => void;
  refreshingMetadataGameIds: Set<string>;
  setActiveNavItem: Dispatch<SetStateAction<NavItem>>;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setMetadataSelectionRequest: Dispatch<SetStateAction<MetadataSelectionRequest | null>>;
  setRefreshingMetadataGameIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
  t: ReturnType<typeof createTranslator>;
};

export function useMetadataArtworkActions({
  addToastNotification,
  games,
  markOnboardingItemComplete,
  refreshingMetadataGameIds,
  setActiveNavItem,
  setGames,
  setMetadataSelectionRequest,
  setRefreshingMetadataGameIds,
  setSelectedGameId,
  t,
}: UseMetadataArtworkActionsOptions) {
  const automaticRawgRefreshIdsRef = useRef<Set<string>>(new Set());

  const ensureRawgMetadataForGame = useCallback(async (game: Game) => {
    if (hasPositiveNumber(game.metacriticScore) && hasPositiveNumber(game.rawgPlaytimeHours)) {
      return;
    }

    if (refreshingMetadataGameIds.has(game.id) || automaticRawgRefreshIdsRef.current.has(game.id)) {
      return;
    }

    automaticRawgRefreshIdsRef.current.add(game.id);
    setRefreshingMetadataGameIds((currentGameIds) => new Set(currentGameIds).add(game.id));

    try {
      const result = await refreshRawgMetadataForGame(game);
      if (result.status !== 'updated') {
        return;
      }

      setGames((currentGames) => currentGames.map((currentGame) => {
        if (currentGame.id !== game.id) {
          return currentGame;
        }

        return touchGameRecord({
          ...mergeRawgMetadataIntoGame(currentGame, result.metadata, { preserveArtwork: true }),
          metadataSkippedAt: undefined,
          metadataManualManagedAt: undefined,
        });
      }));
    } catch (error) {
      console.debug('[Quest Queue RAWG metadata] skipped automatic metadata fetch', {
        gameId: game.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      automaticRawgRefreshIdsRef.current.delete(game.id);
      setRefreshingMetadataGameIds((currentGameIds) => {
        const nextGameIds = new Set(currentGameIds);
        nextGameIds.delete(game.id);
        return nextGameIds;
      });
    }
  }, [refreshingMetadataGameIds, setGames, setRefreshingMetadataGameIds]);

  function startMetadataWorkflow(gameIds: string[]) {
    setMetadataSelectionRequest({
      ids: gameIds,
      requestId: Date.now(),
    });
    setSelectedGameId(null);
    setActiveNavItem('Metadata');
  }

  function updateGameMetadata(gameId: string, metadata: RawgMetadata) {
    setGames((currentGames) =>
      currentGames.map((game) => {
        if (game.id !== gameId) {
          return game;
        }

        return touchGameRecord({
          ...mergeRawgMetadataIntoGame(game, metadata, { preserveArtwork: true }),
          metadataSkippedAt: undefined,
          metadataManualManagedAt: undefined,
        });
      }),
    );
  }

  function updateGameMetadataManagement(
    gameId: string,
    changes: Pick<Game, 'metadataManualManagedAt' | 'metadataSkippedAt'>,
  ) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...changes,
            })
          : game,
      ),
    );
  }

  function updateGameArtwork(gameId: string, changes: Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'artworkSourceMetadata' | 'coverImage' | 'wideCoverImage' | 'heroImage' | 'logoImage' | 'iconImage'>>) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...changes,
            })
          : game,
      ),
    );
  }

  async function refreshGameMetadataFromActions(game: Game, mode: MetadataRefreshMode = 'metadata'): Promise<MetadataRefreshResult> {
    const targetGame = games.find((currentGame) => currentGame.id === game.id)
      ?? (typeof game.steamAppId === 'number'
        ? games.find((currentGame) => currentGame.steamAppId === game.steamAppId && currentGame.collectionType === game.collectionType)
        : undefined);
    const toastKey = `${mode}-refresh:${game.id}`;
    const isArtworkRefresh = mode === 'artwork';

    if (!targetGame) {
      addToastNotification({
        category: 'error',
        dedupeKey: toastKey,
        message: isArtworkRefresh ? t('artwork.notFoundGame') : t('app.metadataRefreshGameNotFound'),
      });
      return 'error';
    }

    if (refreshingMetadataGameIds.has(targetGame.id)) {
      return 'error';
    }

    if (isArtworkRefresh && hasRealArtwork(targetGame)) {
      console.info('[Questory artwork] preserved-existing-artwork', {
        gameId: targetGame.id,
        title: targetGame.title,
        previousArtworkSource: getStoredArtworkSource(targetGame) ?? 'none',
        newArtworkSource: 'unchanged',
        reason: 'Find Artwork only downloads automatically when the game has no valid cover artwork',
      });
      addToastNotification({
        category: 'info',
        dedupeKey: toastKey,
        message: formatGameToastMessage(t('toast.noArtworkFound'), targetGame),
      });
      return 'no-match';
    }

    setRefreshingMetadataGameIds((currentGameIds) => new Set(currentGameIds).add(targetGame.id));
    addToastNotification({
      category: 'info',
      dedupeKey: toastKey,
      message: formatGameToastMessage(isArtworkRefresh ? t('toast.searchingArtwork') : t('toast.refreshingMetadata'), targetGame),
    });

    try {
      const result = await refreshRawgMetadataForGame(targetGame);

      if (result.status === 'no-match') {
        if (isArtworkRefresh) {
          const sgdbArtwork = await fetchSteamGridDbArtworkForGame(targetGame);
          const enrichedGame = mergeSteamGridDbArtworkIntoGame(targetGame, sgdbArtwork);
          if (enrichedGame !== targetGame) {
            setGames((currentGames) => currentGames.map((game) => (game.id === targetGame.id ? touchGameRecord(mergeSteamGridDbArtworkIntoGame(game, sgdbArtwork)) : game)));
            addToastNotification({ category: 'success', dedupeKey: toastKey, message: formatGameToastMessage(t('toast.artworkUpdated'), targetGame) });
            return 'updated';
          }
        }
        addToastNotification({
          actions: [getLinkRawgGameAction(targetGame.id, mode)],
          category: 'info',
          dedupeKey: toastKey,
          message: formatGameToastMessage(isArtworkRefresh ? t('toast.noArtworkFound') : t('toast.noMetadataFound'), targetGame),
        });
        return 'no-match';
      }

      const sgdbArtwork = isArtworkRefresh ? await fetchSteamGridDbArtworkForGame(targetGame) : null;
      let appliedArtwork = false;
      setGames((currentGames) => currentGames.map((game) => {
        if (game.id !== targetGame.id) {
          return game;
        }

        let nextGame = mergeRawgMetadataIntoGame(game, result.metadata, { preserveArtwork: true });
        nextGame = mergeSteamGridDbArtworkIntoGame(nextGame, sgdbArtwork);
        appliedArtwork = appliedArtwork || nextGame !== game;
        // Persist the winning retro search title so future lookups skip candidate iteration
        if (result.winningSearchTitle && result.winningSearchTitle !== game.metadataSearchTitle && result.winningSearchTitle !== game.title) {
          nextGame = { ...nextGame, metadataSearchTitle: result.winningSearchTitle };
        }
        return touchGameRecord({ ...nextGame, metadataSkippedAt: undefined, metadataManualManagedAt: undefined });
      }));
      markOnboardingItemComplete('metadata-enriched');

      const foundArtwork = isArtworkRefresh ? appliedArtwork : Boolean(result.metadata.coverImage?.trim() || result.metadata.backgroundImage?.trim() || sgdbArtwork);
      addToastNotification({
        category: foundArtwork || !isArtworkRefresh ? 'success' : 'info',
        dedupeKey: toastKey,
        message: formatGameToastMessage(
          isArtworkRefresh
            ? (foundArtwork ? t('toast.artworkUpdated') : t('toast.noArtworkFound'))
            : t('toast.metadataUpdated'),
          targetGame,
        ),
      });

      return foundArtwork || !isArtworkRefresh ? 'updated' : 'no-match';
    } catch (error) {
      if (isArtworkRefresh) {
        const sgdbArtwork = await fetchSteamGridDbArtworkForGame(targetGame);
        const enrichedGame = mergeSteamGridDbArtworkIntoGame(targetGame, sgdbArtwork);
        if (enrichedGame !== targetGame) {
          setGames((currentGames) => currentGames.map((game) => (game.id === targetGame.id ? touchGameRecord(mergeSteamGridDbArtworkIntoGame(game, sgdbArtwork)) : game)));
          addToastNotification({ category: 'success', dedupeKey: toastKey, message: formatGameToastMessage(t('toast.artworkUpdated'), targetGame) });
          return 'updated';
        }
      }
      const message = error instanceof RawgApiError
        ? error.message
        : t('app.metadataRefreshFailed');
      addToastNotification({
        actions: error instanceof RawgApiError && error.code === 'missing-api-key' ? undefined : [getLinkRawgGameAction(targetGame.id, mode)],
        category: error instanceof RawgApiError && error.code === 'missing-api-key' ? 'warning' : 'error',
        dedupeKey: toastKey,
        message: formatGameToastMessage(message, targetGame),
      });
      return 'error';
    } finally {
      setRefreshingMetadataGameIds((currentGameIds) => {
        const nextGameIds = new Set(currentGameIds);
        nextGameIds.delete(targetGame.id);
        return nextGameIds;
      });
    }
  }

  return {
    ensureRawgMetadataForGame,
    refreshGameMetadataFromActions,
    startMetadataWorkflow,
    updateGameArtwork,
    updateGameMetadata,
    updateGameMetadataManagement,
  };
}

function hasPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function touchGameRecord(game: Game): Game {
  return {
    ...game,
    updatedAt: new Date().toISOString(),
  };
}
