import type { Dispatch, SetStateAction } from 'react';
import { translateOption, type createTranslator } from '../i18n';
import {
  formatGameToastMessage,
  getBulkWishlistToastMessage,
  getUndoAction,
  getViewGameAction,
  type NotificationDraft,
} from '../lib/notifications';
import { addIgnoredSteamGame, type IgnoredSteamGame } from '../lib/steamIgnoredGamesStorage';
import { removeGameFromPlatformQueue, type PlatformQueueState } from '../lib/platformQueueStorage';
import type { PlayActivityRecord } from '../lib/playActivityStorage';
import type { ReviewModeState } from '../lib/reviewModeStorage';
import type { UndoActionHistoryEntry, UndoActionSnapshot } from '../lib/undoHistoryStorage';
import type { Game, GameCollectionType, GameStatus } from '../types/game';

type GameTrackingUpdate = Pick<Game, 'notes' | 'status' | 'tags'> & Partial<Game>;

type AddUndoAction = (
  message: string,
  historyEntry: Omit<UndoActionHistoryEntry, 'createdAt'>,
  snapshot?: UndoActionSnapshot,
  notification?: Partial<NotificationDraft>,
) => void;

type UseGameLibraryActionsOptions = {
  addUndoAction: AddUndoAction;
  games: Game[];
  setGames: Dispatch<SetStateAction<Game[]>>;
  setIgnoredSteamGames: Dispatch<SetStateAction<IgnoredSteamGame[]>>;
  setPlayActivity: Dispatch<SetStateAction<PlayActivityRecord[]>>;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
  setReviewModeState: Dispatch<SetStateAction<ReviewModeState>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
  t: ReturnType<typeof createTranslator>;
};

export function useGameLibraryActions({
  addUndoAction,
  games,
  setGames,
  setIgnoredSteamGames,
  setPlayActivity,
  setPlatformQueueState,
  setReviewModeState,
  setSelectedGameId,
  t,
}: UseGameLibraryActionsOptions) {
  function getLocalizedStatusToastMessage(game: Game, status: GameStatus) {
    if (status === 'Playing') {
      return formatGameToastMessage(t('toast.markedPlayingNow'), game);
    }

    if (status === 'Finished') {
      return formatGameToastMessage(t('toast.markedFinished'), game);
    }

    if (status === 'Dropped') {
      return formatGameToastMessage(t('toast.dropped'), game);
    }

    return formatMessageTemplate(t('app.statusUpdatedSingle'), { game: formatGameToastMessage('{game}', game), status: translateOption(status, t) });
  }

  function updateGameStatus(gameId: string, status: GameStatus) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (game && (status === 'Playing' || status === 'Finished' || status === 'Dropped')) {
      addUndoAction(getLocalizedStatusToastMessage(game, status), {
        actionType: `mark-${status.toLowerCase()}`,
        affectedGameIds: [gameId],
        description: formatMessageTemplate(t('app.restoreGameStatus'), { game: game.title, status: translateOption(game.status, t) }),
      }, undefined, { actions: [getUndoAction(), getViewGameAction(gameId)] });
    }

    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              status,
              lastPlayedAt: status === 'Playing' ? new Date().toISOString().slice(0, 10) : game.lastPlayedAt,
            })
          : game,
      ),
    );
  }

  function updateManyGameStatuses(gameIds: string[], status: GameStatus) {
    const targetGameIds = new Set(gameIds);
    const updatedGames = games.filter((game) => targetGameIds.has(game.id));
    if (updatedGames.length > 0 && (status === 'Playing' || status === 'Finished' || status === 'Dropped')) {
      addUndoAction(updatedGames.length === 1 ? getLocalizedStatusToastMessage(updatedGames[0], status) : formatMessageTemplate(t('app.statusUpdated'), { count: updatedGames.length, status: translateOption(status, t) }), {
        actionType: `bulk-mark-${status.toLowerCase()}`,
        affectedGameIds: updatedGames.map((game) => game.id),
        description: formatMessageTemplate(t('app.restoreGameStatuses'), { count: updatedGames.length }),
      });
    }
    const today = new Date().toISOString().slice(0, 10);

    setGames((currentGames) =>
      currentGames.map((game) =>
        targetGameIds.has(game.id)
          ? touchGameRecord({
              ...game,
              status,
              lastPlayedAt: status === 'Playing' && game.status !== 'Playing' ? today : game.lastPlayedAt,
            })
          : game,
      ),
    );
  }

  function addManualGame(game: Game) {
    const collectionName = getLocalizedCollectionName(game.collectionType, t);
    addUndoAction(formatMessageTemplate(t('app.gameAddedToCollection'), { game: game.title, collection: collectionName }), {
      actionType: 'add-manual-game',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.removeGameFromCollection'), { game: game.title, collection: collectionName }),
    }, undefined, { actions: [getUndoAction(), getViewGameAction(game.id)] });
    setGames((currentGames) => [...currentGames, touchGameRecord(game)]);
  }

  function addToWishlist(game: Game) {
    const wishlistId = createCollectionCopyId(game, 'wishlist', new Set(games.map((currentGame) => currentGame.id)));
    const alreadyWishlisted = games.some((currentGame) => isWishlistCopyOfGame(currentGame, game));

    if (!alreadyWishlisted) {
      addUndoAction(formatGameToastMessage(t('toast.addedToWishlist'), game), {
        actionType: 'add-to-wishlist',
        affectedGameIds: [game.id],
        description: formatMessageTemplate(t('app.removeGameFromCollection'), { game: game.title, collection: t('collection.wishlist') }),
      }, undefined, { actions: [getUndoAction(), getViewGameAction(game.id)] });
    }

    setGames((currentGames) => {
      if (currentGames.some((currentGame) => isWishlistCopyOfGame(currentGame, game))) {
        return currentGames;
      }

      return [
        ...currentGames,
        {
          ...touchGameRecord(game),
          id: wishlistId,
          collectionType: 'wishlist',
          status: 'Want to play',
          playtimeHours: 0,
          lastPlayedAt: null,
          priority: game.priority ?? 'medium',
          importedAt: new Date().toISOString(),
        },
      ];
    });
  }

  function addManyToWishlist(targetGames: Game[]) {
    if (targetGames.length > 0) {
      addUndoAction(targetGames.length === 1 ? formatGameToastMessage(t('toast.addedToWishlist'), targetGames[0]) : getBulkWishlistToastMessage(targetGames.length), {
        actionType: 'bulk-add-to-wishlist',
        affectedGameIds: targetGames.map((game) => game.id),
        description: formatMessageTemplate(t('app.removeWishlistCopies'), { count: targetGames.length }),
      });
    }

    setGames((currentGames) => {
      const existingGameIds = new Set(currentGames.map((game) => game.id));
      const nextGames = [...currentGames];
      let addedCount = 0;

      targetGames.forEach((game) => {
        if (nextGames.some((currentGame) => isWishlistCopyOfGame(currentGame, game))) {
          return;
        }

        const wishlistId = createCollectionCopyId(game, 'wishlist', existingGameIds);
        existingGameIds.add(wishlistId);
        addedCount += 1;
        nextGames.push(touchGameRecord({
          ...game,
          id: wishlistId,
          collectionType: 'wishlist',
          status: 'Want to play',
          playtimeHours: 0,
          lastPlayedAt: null,
          priority: game.priority ?? 'medium',
          importedAt: new Date().toISOString(),
        }));
      });

      return addedCount > 0 ? nextGames : currentGames;
    });
  }

  function moveToLibrary(game: Game) {
    addUndoAction(`${game.title} moved to Library`, {
      actionType: 'move-to-library',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.restoreGameToCollection'), { game: game.title, collection: t('collection.wishlist') }),
    }, undefined, { actions: [getUndoAction(), getViewGameAction(game.id)] });

    setGames((currentGames) =>
      currentGames.map((currentGame) =>
        currentGame.id === game.id
          ? touchGameRecord({
              ...currentGame,
              collectionType: 'library',
              priority: undefined,
              expectedPlaytime: undefined,
              priceTarget: undefined,
              status: 'Want to play',
            })
          : currentGame,
      ),
    );
  }

  function removeGame(gameId: string) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game || !confirmGameDeletion([game])) {
      return;
    }

    if (game) {
      addUndoAction(formatMessageTemplate(t('toast.gameDeleted'), { game: game.title }), {
        actionType: 'delete-game',
        affectedGameIds: [gameId],
        description: formatMessageTemplate(t('app.restoreGame'), { game: game.title }),
      });
    }

    deleteGamesEverywhere([gameId]);
  }

  function removeAndIgnoreSteamGame(game: Game) {
    if (typeof game.steamAppId !== 'number') {
      return;
    }

    addUndoAction(`${game.title} hidden from Steam imports`, {
      actionType: 'ignore-game',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.restoreGameRemoveIgnored'), { game: game.title }),
    });

    setIgnoredSteamGames((currentIgnoredGames) =>
      addIgnoredSteamGame(currentIgnoredGames, game.steamAppId as number, game.title),
    );
    setGames((currentGames) => currentGames.filter((currentGame) => currentGame.id !== game.id));
    setSelectedGameId((currentSelectedGameId) => (currentSelectedGameId === game.id ? null : currentSelectedGameId));
  }

  function removeManyGames(gameIds: string[]) {
    const targetGameIds = new Set(gameIds);
    const removedGames = games.filter((game) => targetGameIds.has(game.id));
    if (removedGames.length === 0 || !confirmGameDeletion(removedGames)) {
      return;
    }

    addUndoAction(formatMessageTemplate(t('toast.gamesDeleted'), { count: removedGames.length }), {
      actionType: 'bulk-delete-games',
      affectedGameIds: removedGames.map((game) => game.id),
      description: formatMessageTemplate(t('app.restoreRemovedGames'), { count: removedGames.length }),
    });

    deleteGamesEverywhere(removedGames.map((game) => game.id));
  }

  function deleteGamesEverywhere(gameIds: string[]) {
    const targetGameIds = new Set(gameIds);
    setGames((currentGames) => currentGames.filter((game) => !targetGameIds.has(game.id)));
    setPlayActivity((currentActivity) => currentActivity.filter((record) => !targetGameIds.has(record.gameId)));
    setPlatformQueueState((currentState) =>
      gameIds.reduce((nextState, gameId) => removeGameFromPlatformQueue(nextState, gameId), currentState),
    );
    setReviewModeState((currentState) => ({
      ...currentState,
      ignoredGameIds: currentState.ignoredGameIds.filter((gameId) => !targetGameIds.has(gameId)),
      queueOrder: currentState.queueOrder.filter((gameId) => !targetGameIds.has(gameId)),
      reviewedGames: Object.fromEntries(Object.entries(currentState.reviewedGames).filter(([gameId]) => !targetGameIds.has(gameId))),
    }));
    setSelectedGameId((currentSelectedGameId) =>
      currentSelectedGameId && targetGameIds.has(currentSelectedGameId) ? null : currentSelectedGameId,
    );
  }

  function confirmGameDeletion(targetGames: Game[]) {
    if (typeof window === 'undefined') {
      return true;
    }

    const message = targetGames.length === 1
      ? formatMessageTemplate(t('action.confirmDeleteGame'), { game: targetGames[0].title })
      : formatMessageTemplate(t('action.confirmDeleteGames'), { count: targetGames.length });

    return window.confirm(message);
  }

  function removeAndIgnoreManyGames(targetGames: Game[]) {
    if (targetGames.length > 0) {
      addUndoAction(`${targetGames.length} games hidden from Steam imports`, {
        actionType: 'bulk-remove-and-ignore-games',
        affectedGameIds: targetGames.map((game) => game.id),
        description: formatMessageTemplate(t('app.restoreRemovedGamesAndIgnored'), { count: targetGames.length }),
      });
    }

    const targetGameIds = new Set(targetGames.map((game) => game.id));
    const steamGames = targetGames.filter((game) => typeof game.steamAppId === 'number');

    setIgnoredSteamGames((currentIgnoredGames) =>
      steamGames.reduce(
        (nextIgnoredGames, game) => addIgnoredSteamGame(nextIgnoredGames, game.steamAppId as number, game.title),
        currentIgnoredGames,
      ),
    );
    setGames((currentGames) => currentGames.filter((game) => !targetGameIds.has(game.id)));
    setSelectedGameId((currentSelectedGameId) =>
      currentSelectedGameId && targetGameIds.has(currentSelectedGameId) ? null : currentSelectedGameId,
    );
  }

  function updateGameReviewFields(gameId: string, changes: Partial<Game>) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (game && (changes.status === 'Playing' || changes.status === 'Finished' || changes.status === 'Dropped')) {
      addUndoAction(getLocalizedStatusToastMessage(game, changes.status), {
        actionType: `mark-${changes.status.toLowerCase()}`,
        affectedGameIds: [gameId],
        description: formatMessageTemplate(t('app.restoreGameStatus'), { game: game.title, status: translateOption(game.status, t) }),
      }, undefined, { actions: [getUndoAction(), getViewGameAction(gameId)] });
    }

    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...changes,
              lastPlayedAt:
                changes.status === 'Playing' && game.status !== 'Playing'
                  ? new Date().toISOString().slice(0, 10)
                  : game.lastPlayedAt,
            })
          : game,
      ),
    );
  }

  function updateGameTracking(gameId: string, tracking: GameTrackingUpdate) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...tracking,
              lastPlayedAt:
                tracking.status === 'Playing' && game.status !== 'Playing'
                  ? new Date().toISOString().slice(0, 10)
                  : game.lastPlayedAt,
            })
          : game,
      ),
    );
  }

  return {
    addManualGame,
    addManyToWishlist,
    addToWishlist,
    moveToLibrary,
    removeAndIgnoreManyGames,
    removeAndIgnoreSteamGame,
    removeGame,
    removeManyGames,
    updateGameReviewFields,
    updateGameStatus,
    updateGameTracking,
    updateManyGameStatuses,
  };
}

function formatMessageTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, String(value)), template);
}

function getLocalizedCollectionName(collectionType: GameCollectionType, t: ReturnType<typeof createTranslator>) {
  return collectionType === 'wishlist' ? t('collection.wishlist') : t('collection.library');
}

function touchGameRecord(game: Game): Game {
  const now = new Date().toISOString();
  return {
    ...game,
    updatedAt: now,
  };
}

function isWishlistCopyOfGame(currentGame: Game, game: Game) {
  if (currentGame.collectionType !== 'wishlist') {
    return false;
  }

  if (typeof game.steamAppId === 'number') {
    return currentGame.steamAppId === game.steamAppId;
  }

  return currentGame.title.toLowerCase() === game.title.toLowerCase() && currentGame.platform === game.platform;
}

function createCollectionCopyId(game: Game, collectionType: GameCollectionType, existingGameIds: Set<string>) {
  const baseId = `${collectionType}-${game.id.replace(/^(library|wishlist)-/, '')}`;
  let id = baseId;
  let suffix = 2;

  while (existingGameIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}
