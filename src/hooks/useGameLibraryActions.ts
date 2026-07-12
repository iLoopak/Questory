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
import type { UndoActionHistoryEntry } from '../lib/undoHistoryStorage';
import type { UndoOperation } from '../lib/undoOperations';
import type { Game, GameCollectionType, GameStatus } from '../types/game';

type GameTrackingUpdate = Partial<Game>;

/**
 * AS-04: every undoable action registers the INVERSE of what it did, scoped to the records it
 * touched. `extraOperations` lets a composite caller (Quest Queue review, which changes review
 * state as well as the game) extend that inverse without a second toast.
 */
type AddUndoAction = (
  message: string,
  historyEntry: Omit<UndoActionHistoryEntry, 'createdAt'>,
  operations: UndoOperation[],
  notification?: Partial<NotificationDraft>,
) => void;

type UseGameLibraryActionsOptions = {
  addUndoAction: AddUndoAction;
  games: Game[];
  setGames: Dispatch<SetStateAction<Game[]>>;
  setIgnoredSteamGames: Dispatch<SetStateAction<IgnoredSteamGame[]>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
  t: ReturnType<typeof createTranslator>;
};

export function useGameLibraryActions({
  addUndoAction,
  games,
  setGames,
  setIgnoredSteamGames,
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

    return formatMessageTemplate(t('app.statusUpdatedSingle'), { game: formatGameToastMessage('{game}', game), status: translateOption(game.status, t) });
  }

  function updateGameStatus(gameId: string, status: GameStatus, extraOperations: UndoOperation[] = []) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    const nextLastPlayedAt = game
      ? status === 'Playing'
        ? new Date().toISOString().slice(0, 10)
        : game.lastPlayedAt
      : null;

    if (game && (status === 'Playing' || status === 'Finished' || status === 'Dropped')) {
      addUndoAction(getLocalizedStatusToastMessage(game, status), {
        actionType: `mark-${status.toLowerCase()}`,
        affectedGameIds: [gameId],
        description: formatMessageTemplate(t('app.restoreGameStatus'), { game: game.title, status: translateOption(game.status, t) }),
      }, [
        // Only the two fields this action writes. A later edit to the same game's notes or tags
        // survives the undo; a later edit to its STATUS makes the undo stale instead of silently
        // overwriting the newer status.
        {
          kind: 'game-fields',
          gameId,
          previous: { status: game.status, lastPlayedAt: game.lastPlayedAt },
          expected: { status, lastPlayedAt: nextLastPlayedAt },
        },
        ...extraOperations,
      ], { actions: [getUndoAction(), getViewGameAction(gameId)] });
    }

    setGames((currentGames) =>
      currentGames.map((currentGame) =>
        currentGame.id === gameId
          ? touchGameRecord({
              ...currentGame,
              status,
              lastPlayedAt: status === 'Playing' ? new Date().toISOString().slice(0, 10) : currentGame.lastPlayedAt,
            })
          : currentGame,
      ),
    );
  }

  function updateManyGameStatuses(gameIds: string[], status: GameStatus) {
    const targetGameIds = new Set(gameIds);
    const updatedGames = games.filter((game) => targetGameIds.has(game.id));
    const today = new Date().toISOString().slice(0, 10);

    if (updatedGames.length > 0 && (status === 'Playing' || status === 'Finished' || status === 'Dropped')) {
      addUndoAction(updatedGames.length === 1 ? getLocalizedStatusToastMessage(updatedGames[0], status) : formatMessageTemplate(t('app.statusUpdated'), { count: updatedGames.length, status: translateOption(status, t) }), {
        actionType: `bulk-mark-${status.toLowerCase()}`,
        affectedGameIds: updatedGames.map((game) => game.id),
        description: formatMessageTemplate(t('app.restoreGameStatuses'), { count: updatedGames.length }),
      }, updatedGames.map((game): UndoOperation => ({
        kind: 'game-fields',
        gameId: game.id,
        previous: { status: game.status, lastPlayedAt: game.lastPlayedAt },
        expected: {
          status,
          lastPlayedAt: status === 'Playing' && game.status !== 'Playing' ? today : game.lastPlayedAt,
        },
      })));
    }

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
    }, [{ kind: 'game-remove', gameId: game.id }], { actions: [getUndoAction(), getViewGameAction(game.id)] });
    setGames((currentGames) => [...currentGames, touchGameRecord(game)]);
  }

  function addToWishlist(game: Game, extraOperations: UndoOperation[] = []) {
    const wishlistId = createCollectionCopyId(game, 'wishlist', new Set(games.map((currentGame) => currentGame.id)));
    const alreadyWishlisted = games.some((currentGame) => isWishlistCopyOfGame(currentGame, game));

    if (!alreadyWishlisted) {
      addUndoAction(formatGameToastMessage(t('toast.addedToWishlist'), game), {
        actionType: 'add-to-wishlist',
        affectedGameIds: [game.id],
        description: formatMessageTemplate(t('app.removeGameFromCollection'), { game: game.title, collection: t('collection.wishlist') }),
      }, [
        // The inverse removes the COPY that was created, not the Library record it was made from.
        { kind: 'game-remove', gameId: wishlistId },
        ...extraOperations,
      ], { actions: [getUndoAction(), getViewGameAction(game.id)] });
    }

    setGames((currentGames) => {
      if (currentGames.some((currentGame) => isWishlistCopyOfGame(currentGame, game))) {
        return currentGames;
      }

      return [...currentGames, createWishlistCopy(game, wishlistId)];
    });
  }

  function addManyToWishlist(targetGames: Game[]) {
    // The copies are minted here rather than inside the updater, so the undo record knows exactly
    // which ids to remove (a pure transition, per AS-14's preference).
    const existingGameIds = new Set(games.map((game) => game.id));
    const copies: Game[] = [];

    targetGames.forEach((game) => {
      if (games.some((currentGame) => isWishlistCopyOfGame(currentGame, game)) ||
        copies.some((copy) => isWishlistCopyOfGame(copy, game))) {
        return;
      }

      const wishlistId = createCollectionCopyId(game, 'wishlist', existingGameIds);
      existingGameIds.add(wishlistId);
      copies.push(createWishlistCopy(game, wishlistId));
    });

    if (targetGames.length > 0 && copies.length > 0) {
      addUndoAction(targetGames.length === 1 ? formatGameToastMessage(t('toast.addedToWishlist'), targetGames[0]) : getBulkWishlistToastMessage(targetGames.length), {
        actionType: 'bulk-add-to-wishlist',
        affectedGameIds: targetGames.map((game) => game.id),
        description: formatMessageTemplate(t('app.removeWishlistCopies'), { count: targetGames.length }),
      }, copies.map((copy): UndoOperation => ({ kind: 'game-remove', gameId: copy.id })));
    }

    setGames((currentGames) => {
      const newCopies = copies.filter(
        (copy) => !currentGames.some((currentGame) => currentGame.id === copy.id || isWishlistCopyOfGame(currentGame, copy)),
      );

      return newCopies.length > 0 ? [...currentGames, ...newCopies] : currentGames;
    });
  }

  function moveWishlistToLibrary(game: Game) {
    addUndoAction(`${game.title} moved to Library`, {
      actionType: 'move-to-library',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.restoreGameToCollection'), { game: game.title, collection: t('collection.wishlist') }),
    }, [{
      kind: 'game-fields',
      gameId: game.id,
      previous: {
        collectionType: 'wishlist',
        expectedPlaytime: game.expectedPlaytime,
        priceTarget: game.priceTarget,
        priority: game.priority,
        status: game.status,
      },
      expected: { collectionType: 'library', status: 'Want to play' },
    }], { actions: [getUndoAction(), getViewGameAction(game.id)] });

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
    if (game) {
      addUndoAction(`${game.title} removed from ${game.collectionType === 'wishlist' ? 'Wishlist' : 'Library'}`, {
        actionType: game.collectionType === 'wishlist' ? 'remove-wishlist-item' : 'delete-game',
        affectedGameIds: [gameId],
        description: formatMessageTemplate(t('app.restoreGame'), { game: game.title }),
      }, [{ kind: 'game-restore', game }]);
    }

    setGames((currentGames) => currentGames.filter((currentGame) => currentGame.id !== gameId));
    setSelectedGameId((currentSelectedGameId) => (currentSelectedGameId === gameId ? null : currentSelectedGameId));
  }

  function removeAndIgnoreSteamGame(game: Game) {
    if (typeof game.steamAppId !== 'number') {
      return;
    }

    addUndoAction(`${game.title} hidden from Steam imports`, {
      actionType: 'ignore-game',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.restoreGameRemoveIgnored'), { game: game.title }),
    }, [
      { kind: 'game-restore', game },
      { kind: 'ignored-steam-remove', steamAppId: game.steamAppId },
    ]);

    setIgnoredSteamGames((currentIgnoredGames) =>
      addIgnoredSteamGame(currentIgnoredGames, game.steamAppId as number, game.title),
    );
    setGames((currentGames) => currentGames.filter((currentGame) => currentGame.id !== game.id));
    setSelectedGameId((currentSelectedGameId) => (currentSelectedGameId === game.id ? null : currentSelectedGameId));
  }

  function removeManyGames(gameIds: string[]) {
    const targetGameIds = new Set(gameIds);
    const removedGames = games.filter((game) => targetGameIds.has(game.id));
    if (removedGames.length > 0) {
      addUndoAction(`${removedGames.length} games removed from Library`, {
        actionType: 'bulk-remove-games',
        affectedGameIds: removedGames.map((game) => game.id),
        description: formatMessageTemplate(t('app.restoreRemovedGames'), { count: removedGames.length }),
      }, removedGames.map((game): UndoOperation => ({ kind: 'game-restore', game })));
    }
    setGames((currentGames) => currentGames.filter((game) => !targetGameIds.has(game.id)));
    setSelectedGameId((currentSelectedGameId) =>
      currentSelectedGameId && targetGameIds.has(currentSelectedGameId) ? null : currentSelectedGameId,
    );
  }

  function removeAndIgnoreManyGames(targetGames: Game[]) {
    const steamGames = targetGames.filter((game) => typeof game.steamAppId === 'number');

    if (targetGames.length > 0) {
      addUndoAction(`${targetGames.length} games hidden from Steam imports`, {
        actionType: 'bulk-remove-and-ignore-games',
        affectedGameIds: targetGames.map((game) => game.id),
        description: formatMessageTemplate(t('app.restoreRemovedGamesAndIgnored'), { count: targetGames.length }),
      }, [
        ...targetGames.map((game): UndoOperation => ({ kind: 'game-restore', game })),
        ...steamGames.map((game): UndoOperation => ({
          kind: 'ignored-steam-remove',
          steamAppId: game.steamAppId as number,
        })),
      ]);
    }

    const targetGameIds = new Set(targetGames.map((game) => game.id));

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

  function updateGameReviewFields(gameId: string, changes: Partial<Game>, extraOperations: UndoOperation[] = []) {
    const game = games.find((currentGame) => currentGame.id === gameId);

    if (game && (changes.status === 'Playing' || changes.status === 'Finished' || changes.status === 'Dropped')) {
      const nextLastPlayedAt =
        changes.status === 'Playing' && game.status !== 'Playing'
          ? new Date().toISOString().slice(0, 10)
          : game.lastPlayedAt;

      addUndoAction(getLocalizedStatusToastMessage(game, changes.status), {
        actionType: `mark-${changes.status.toLowerCase()}`,
        affectedGameIds: [gameId],
        description: formatMessageTemplate(t('app.restoreGameStatus'), { game: game.title, status: translateOption(game.status, t) }),
      }, [
        {
          kind: 'game-fields',
          gameId,
          // Only the fields this call actually changes are captured, so undoing a review decision
          // cannot revert an unrelated field the user edited afterwards.
          previous: { ...pickFields(game, Object.keys(changes) as Array<keyof Game>), lastPlayedAt: game.lastPlayedAt },
          expected: { ...changes, lastPlayedAt: nextLastPlayedAt },
        },
        ...extraOperations,
      ], { actions: [getUndoAction(), getViewGameAction(gameId)] });
    }

    setGames((currentGames) =>
      currentGames.map((currentGame) =>
        currentGame.id === gameId
          ? touchGameRecord({
              ...currentGame,
              ...changes,
              lastPlayedAt:
                changes.status === 'Playing' && currentGame.status !== 'Playing'
                  ? new Date().toISOString().slice(0, 10)
                  : currentGame.lastPlayedAt,
            })
          : currentGame,
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
    moveToLibrary: moveWishlistToLibrary,
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

function pickFields(game: Game, fields: Array<keyof Game>): Partial<Game> {
  return fields.reduce<Partial<Game>>((picked, field) => {
    (picked as Record<string, unknown>)[field as string] = game[field];
    return picked;
  }, {});
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

function createWishlistCopy(game: Game, wishlistId: string): Game {
  return {
    ...touchGameRecord(game),
    id: wishlistId,
    collectionType: 'wishlist',
    status: 'Want to play',
    playtimeHours: 0,
    lastPlayedAt: null,
    priority: game.priority ?? 'medium',
    importedAt: new Date().toISOString(),
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
