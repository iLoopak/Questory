import type { Dispatch, SetStateAction } from 'react';
import type { PlayingGameAction } from '../components/QueuePanel';
import { createTranslator } from '../i18n';
import {
  addActiveQueuePlatform,
  addGameToPlatformQueue,
  addGameToPlatformQueueTop,
  getPlatformTag,
  moveQueueEntry,
  moveQueueEntryToPlatform,
  removeCurrentlyPlayingFromPlatformQueue,
  removeGameFromPlatformQueue,
  updatePlatformQueueSetting,
  type PlatformQueueState,
} from '../lib/platformQueueStorage';
import {
  formatGameToastMessage,
  getMoveQueueToastMessage,
  getOpenQueueAction,
  getRemoveQueueToastMessage,
  getUndoAction,
  getViewGameAction,
  type ToastAction,
} from '../lib/notifications';
import type { Game, GamePlatform, GameStatus } from '../types/game';

type UseQueueActionsParams = {
  activeQueuePlatforms: GamePlatform[];
  addUndoAction: (message: string, payload: any, snapshot?: any, options?: { actions?: ToastAction[] }) => void;
  games: Game[];
  markOnboardingItemComplete: (itemId: 'platforms' | 'queue-game') => void;
  platformQueueState: PlatformQueueState;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
  t: ReturnType<typeof createTranslator>;
};

function formatMessageTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, String(value)), template);
}

function touchGameRecord(game: Game): Game {
  return {
    ...game,
    updatedAt: new Date().toISOString(),
  };
}

export function useQueueActions({
  activeQueuePlatforms,
  addUndoAction,
  games,
  markOnboardingItemComplete,
  platformQueueState,
  setGames,
  setPlatformQueueState,
  t,
}: UseQueueActionsParams) {
  function addQueuePlatform(platform: GamePlatform) {
    setPlatformQueueState((currentState) => addActiveQueuePlatform(currentState, platform));
    markOnboardingItemComplete('platforms');
  }

  function addGameToQueue(game: Game, platform: GamePlatform) {
    addUndoAction(formatGameToastMessage(t('toast.addedToPlatforms'), game), {
      actionType: 'add-to-queue',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.removeFromPlatformBacklog'), { game: game.title, platform }),
    }, undefined, { actions: [getUndoAction()] });

    const platformTag = getPlatformTag(platformQueueState, platform);
    if (platformTag && !game.tags.includes(platformTag)) {
      setGames((currentGames) =>
        currentGames.map((currentGame) =>
          currentGame.id === game.id
            ? touchGameRecord({ ...currentGame, tags: Array.from(new Set([...currentGame.tags, platformTag])) })
            : currentGame,
        ),
      );
    }

    setPlatformQueueState((currentState) => game.status === 'Playing' && game.platform === platform
      ? removeGameFromPlatformQueue(currentState, game.id, platform)
      : addGameToPlatformQueue(currentState, game, platform));
    markOnboardingItemComplete('queue-game');
  }

  function playQueueGameNow(gameId: string, platform: GamePlatform) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game) return;

    addUndoAction(formatGameToastMessage(t('toast.markedPlayingNow'), game), {
      actionType: 'play-now',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.restoreToPlatformBacklog'), { game: game.title, platform }),
    }, undefined, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });

    const today = new Date().toISOString().slice(0, 10);
    const platformTag = getPlatformTag(platformQueueState, platform);
    setGames((currentGames) => currentGames.map((currentGame) => currentGame.id === gameId
      ? touchGameRecord({ ...currentGame, platform, status: 'Playing', tags: platformTag ? Array.from(new Set([...currentGame.tags, platformTag])) : currentGame.tags, lastPlayedAt: today })
      : currentGame));
    setPlatformQueueState((currentState) => removeCurrentlyPlayingFromPlatformQueue(removeGameFromPlatformQueue(currentState, gameId, platform), [
      ...games.filter((currentGame) => currentGame.id !== gameId),
      { ...game, platform, status: 'Playing' },
    ]));
  }

  function updateCurrentlyPlayingGame(gameId: string, platform: GamePlatform, action: PlayingGameAction) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game) return;

    const now = new Date().toISOString();
    const nextStatus: GameStatus = action === 'finished' ? 'Finished' : action === 'drop' ? 'Dropped' : 'Want to play';
    const actionLabels: Record<PlayingGameAction, string> = {
      'move-to-backlog': formatGameToastMessage(t('toast.addedToPlatforms'), game),
      finished: formatGameToastMessage(t('toast.markedFinished'), game),
      drop: formatGameToastMessage(t('toast.dropped'), game),
      'remove-from-playing': `${formatGameToastMessage(t('toast.removedFromPlayingNow'), game)} on ${platform}`,
    };

    addUndoAction(actionLabels[action], {
      actionType: 'playing-action', affectedGameIds: [game.id], description: formatMessageTemplate(t('app.restoreToPlayingNow'), { game: game.title }),
    }, undefined, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });

    setGames((currentGames) => currentGames.map((currentGame) => currentGame.id === gameId
      ? touchGameRecord({ ...currentGame, status: nextStatus, finishedAt: action === 'finished' ? now : currentGame.finishedAt, droppedAt: action === 'drop' ? now : currentGame.droppedAt })
      : currentGame));
    setPlatformQueueState((currentState) => action === 'move-to-backlog' ? addGameToPlatformQueueTop(currentState, { ...game, status: 'Want to play' }, platform) : removeGameFromPlatformQueue(currentState, gameId, platform));
  }

  const playGameFromCompactRow = (game: Game) => playQueueGameNow(game.id, game.platform);
  const finishGameFromCompactRow = (game: Game) => updateCurrentlyPlayingGame(game.id, game.platform, 'finished');
  const dropGameFromCompactRow = (game: Game) => updateCurrentlyPlayingGame(game.id, game.platform, 'drop');
  const moveQueueGame = (gameId: string, platform: GamePlatform, direction: 'top' | 'up' | 'down') => setPlatformQueueState((currentState) => moveQueueEntry(currentState, gameId, direction, platform));

  function moveQueueGameToPlatform(gameId: string, sourcePlatform: GamePlatform, platform: GamePlatform) {
    if (!activeQueuePlatforms.includes(platform)) return;
    const game = games.find((currentGame) => currentGame.id === gameId);
    const currentEntry = platformQueueState.entries.find((entry) => entry.gameId === gameId && entry.targetPlatform === sourcePlatform);
    if (game && currentEntry && currentEntry.targetPlatform !== platform) {
      addUndoAction(getMoveQueueToastMessage(game, platform), {
        actionType: 'move-between-collections', affectedGameIds: [gameId], description: formatMessageTemplate(t('app.restoreToPlatformBacklog'), { game: game.title, platform: currentEntry.targetPlatform }),
      }, undefined, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
    }
    setPlatformQueueState((currentState) => moveQueueEntryToPlatform(currentState, gameId, platform, sourcePlatform));
  }

  function removeQueueGame(gameId: string, platform?: GamePlatform) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    const entry = platformQueueState.entries.find((queueEntry) => queueEntry.gameId === gameId && (!platform || queueEntry.targetPlatform === platform));
    if (game && entry) {
      addUndoAction(getRemoveQueueToastMessage(game, entry.targetPlatform), {
        actionType: 'remove-from-queue', affectedGameIds: [gameId], description: formatMessageTemplate(t('app.restoreToPlanPosition'), { game: game.title, position: entry.queuePosition }),
      }, undefined, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
    }
    setPlatformQueueState((currentState) => removeGameFromPlatformQueue(currentState, gameId, entry?.targetPlatform));
  }

  const updateQueueLimit = (platform: GamePlatform, maxActiveGames: number) => setPlatformQueueState((currentState) => updatePlatformQueueSetting(currentState, platform, maxActiveGames));

  return { addGameToQueue, addQueuePlatform, dropGameFromCompactRow, finishGameFromCompactRow, moveQueueGame, moveQueueGameToPlatform, playGameFromCompactRow, playQueueGameNow, removeQueueGame, updateCurrentlyPlayingGame, updateQueueLimit };
}
