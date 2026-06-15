import type { Dispatch, SetStateAction } from 'react';
import type { createTranslator } from '../i18n';
import type { NavItem } from '../config/navigation';
import { mergeRawgMetadataIntoGame } from '../lib/metadataMerge';
import { formatGameToastMessage, type NotificationDraft } from '../lib/notifications';
import { refreshRawgMetadataForGame } from '../lib/rawgMetadataEnrichment';
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
          ...mergeRawgMetadataIntoGame(game, metadata),
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

  function updateGameArtwork(gameId: string, changes: Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'coverImage'>>) {
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

    setRefreshingMetadataGameIds((currentGameIds) => new Set(currentGameIds).add(targetGame.id));
    addToastNotification({
      category: 'info',
      dedupeKey: toastKey,
      message: formatGameToastMessage(isArtworkRefresh ? t('toast.searchingArtwork') : t('toast.refreshingMetadata'), targetGame),
    });

    try {
      const result = await refreshRawgMetadataForGame(targetGame);

      if (result.status === 'no-match') {
        addToastNotification({
          category: 'info',
          dedupeKey: toastKey,
          message: formatGameToastMessage(isArtworkRefresh ? t('toast.noArtworkFound') : t('toast.noMetadataFound'), targetGame),
        });
        return 'no-match';
      }

      updateGameMetadata(targetGame.id, result.metadata);
      markOnboardingItemComplete('metadata-enriched');

      const foundArtwork = Boolean(result.metadata.coverImage?.trim() || result.metadata.backgroundImage?.trim());
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
      const message = error instanceof RawgApiError
        ? error.message
        : t('app.metadataRefreshFailed');
      addToastNotification({
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
    refreshGameMetadataFromActions,
    startMetadataWorkflow,
    updateGameArtwork,
    updateGameMetadata,
    updateGameMetadataManagement,
  };
}

function touchGameRecord(game: Game): Game {
  return {
    ...game,
    updatedAt: new Date().toISOString(),
  };
}
