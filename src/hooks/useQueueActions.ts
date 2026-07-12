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
  formatToastGameTitle,
  getMoveQueueToastMessage,
  getOpenQueueAction,
  getRemoveQueueToastMessage,
  getUndoAction,
  getViewGameAction,
  type NotificationDraft,
} from '../lib/notifications';
import type { UndoActionHistoryEntry } from '../lib/undoHistoryStorage';
import { derivePlanUndoOperations, type UndoOperation } from '../lib/undoOperations';
import type { Game, GamePlatform, GameStatus } from '../types/game';

type AddUndoAction = (
  message: string,
  historyEntry: Omit<UndoActionHistoryEntry, 'createdAt'>,
  operations: UndoOperation[],
  notification?: Partial<NotificationDraft>,
) => void;

type UseQueueActionsParams = {
  activeQueuePlatforms: GamePlatform[];
  addUndoAction: AddUndoAction;
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
  // AS-04/AS-14: Plan mutations are computed as a pure transition on the current Plan state, so
  // the inverse can be derived by diffing the two — a Plan entry the action never touched produces
  // no undo operation and can therefore never be disturbed by the undo. It also keeps the write
  // out of the React updater, where it used to hide.
  function planTransition(next: (state: PlatformQueueState) => PlatformQueueState) {
    const nextState = next(platformQueueState);
    return {
      operations: derivePlanUndoOperations(platformQueueState, nextState),
      commit: () => setPlatformQueueState(nextState),
    };
  }

  function withPlatformTag(game: Game, platformTag: string): UndoOperation[] {
    if (!platformTag || game.tags.includes(platformTag)) {
      return [];
    }

    const nextTags = Array.from(new Set([...game.tags, platformTag]));
    setGames((currentGames) =>
      currentGames.map((currentGame) =>
        currentGame.id === game.id ? touchGameRecord({ ...currentGame, tags: nextTags }) : currentGame,
      ),
    );

    return [{ kind: 'game-fields', gameId: game.id, previous: { tags: game.tags }, expected: { tags: nextTags } }];
  }

  function addQueuePlatform(platform: GamePlatform) {
    setPlatformQueueState((currentState) => addActiveQueuePlatform(currentState, platform));
    markOnboardingItemComplete('platforms');
  }

  function addGameToQueue(game: Game, platform: GamePlatform, extraOperations: UndoOperation[] = []) {
    const toastMessage = formatMessageTemplate(t('toast.addedToPlatformPlan'), { game: formatToastGameTitle(game.title), platform });
    const isRemovingCurrentQueueEntry = game.status === 'Playing' && game.platform === platform;

    const tagOperations = isRemovingCurrentQueueEntry
      ? []
      : withPlatformTag(game, getPlatformTag(platformQueueState, platform));

    const plan = planTransition((currentState) => isRemovingCurrentQueueEntry
      ? removeGameFromPlatformQueue(currentState, game.id, platform)
      : addGameToPlatformQueue(currentState, game, platform));

    addUndoAction(toastMessage, {
      actionType: 'add-to-queue',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.removeFromPlatformBacklog'), { game: game.title, platform }),
    }, [...plan.operations, ...tagOperations, ...extraOperations], { actions: [getUndoAction(), getOpenQueueAction()] });

    plan.commit();
    markOnboardingItemComplete('queue-game');
  }

  function playQueueGameNow(gameId: string, platform: GamePlatform) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game) return;

    const today = new Date().toISOString().slice(0, 10);
    const platformTag = getPlatformTag(platformQueueState, platform);
    const nextTags = platformTag ? Array.from(new Set([...game.tags, platformTag])) : game.tags;

    const plan = planTransition((currentState) => removeCurrentlyPlayingFromPlatformQueue(
      removeGameFromPlatformQueue(currentState, gameId, platform),
      [...games.filter((currentGame) => currentGame.id !== gameId), { ...game, platform, status: 'Playing' }],
    ));

    addUndoAction(formatGameToastMessage(t('toast.markedPlayingNow'), game), {
      actionType: 'play-now',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.restoreToPlatformBacklog'), { game: game.title, platform }),
    }, [
      {
        kind: 'game-fields',
        gameId,
        previous: { platform: game.platform, status: game.status, tags: game.tags, lastPlayedAt: game.lastPlayedAt },
        expected: { platform, status: 'Playing', tags: nextTags, lastPlayedAt: today },
      },
      ...plan.operations,
    ], { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });

    setGames((currentGames) => currentGames.map((currentGame) => currentGame.id === gameId
      ? touchGameRecord({ ...currentGame, platform, status: 'Playing', tags: nextTags, lastPlayedAt: today })
      : currentGame));
    plan.commit();
  }

  function updateCurrentlyPlayingGame(gameId: string, platform: GamePlatform, action: PlayingGameAction) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game) return;

    const now = new Date().toISOString();
    const nextStatus: GameStatus = action === 'finished' ? 'Finished' : action === 'drop' ? 'Dropped' : 'Want to play';
    const nextFinishedAt = action === 'finished' ? now : game.finishedAt;
    const nextDroppedAt = action === 'drop' ? now : game.droppedAt;
    const actionLabels: Record<PlayingGameAction, string> = {
      'move-to-backlog': formatGameToastMessage(t('toast.addedToPlatforms'), game),
      finished: formatGameToastMessage(t('toast.markedFinished'), game),
      drop: formatGameToastMessage(t('toast.dropped'), game),
      'remove-from-playing': `${formatGameToastMessage(t('toast.removedFromPlayingNow'), game)} on ${platform}`,
    };

    const plan = planTransition((currentState) => action === 'move-to-backlog'
      ? addGameToPlatformQueueTop(currentState, { ...game, status: 'Want to play' }, platform)
      : removeGameFromPlatformQueue(currentState, gameId, platform));

    addUndoAction(actionLabels[action], {
      actionType: 'playing-action', affectedGameIds: [game.id], description: formatMessageTemplate(t('app.restoreToPlayingNow'), { game: game.title }),
    }, [
      {
        kind: 'game-fields',
        gameId,
        previous: { status: game.status, finishedAt: game.finishedAt, droppedAt: game.droppedAt },
        expected: { status: nextStatus, finishedAt: nextFinishedAt, droppedAt: nextDroppedAt },
      },
      ...plan.operations,
    ], { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });

    setGames((currentGames) => currentGames.map((currentGame) => currentGame.id === gameId
      ? touchGameRecord({ ...currentGame, status: nextStatus, finishedAt: nextFinishedAt, droppedAt: nextDroppedAt })
      : currentGame));
    plan.commit();
  }

  const playGameFromCompactRow = (game: Game) => playQueueGameNow(game.id, game.platform);
  const finishGameFromCompactRow = (game: Game) => updateCurrentlyPlayingGame(game.id, game.platform, 'finished');
  const dropGameFromCompactRow = (game: Game) => updateCurrentlyPlayingGame(game.id, game.platform, 'drop');

  // Reordering inside one platform shows no toast today and therefore has no Undo; that is
  // unchanged here.
  const moveQueueGame = (gameId: string, platform: GamePlatform, direction: 'top' | 'up' | 'down') => setPlatformQueueState((currentState) => moveQueueEntry(currentState, gameId, direction, platform));

  function moveQueueGameToPlatform(gameId: string, sourcePlatform: GamePlatform, platform: GamePlatform) {
    if (!activeQueuePlatforms.includes(platform)) return;
    const game = games.find((currentGame) => currentGame.id === gameId);
    const currentEntry = platformQueueState.entries.find((entry) => entry.gameId === gameId && entry.targetPlatform === sourcePlatform);

    const plan = planTransition((currentState) => moveQueueEntryToPlatform(currentState, gameId, platform, sourcePlatform));

    if (game && currentEntry && currentEntry.targetPlatform !== platform) {
      addUndoAction(getMoveQueueToastMessage(game, platform), {
        actionType: 'move-between-collections', affectedGameIds: [gameId], description: formatMessageTemplate(t('app.restoreToPlatformBacklog'), { game: game.title, platform: currentEntry.targetPlatform }),
      }, plan.operations, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
    }

    plan.commit();
  }

  function removeQueueGame(gameId: string, platform?: GamePlatform) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    const entry = platformQueueState.entries.find((queueEntry) => queueEntry.gameId === gameId && (!platform || queueEntry.targetPlatform === platform));
    if (!entry) {
      return;
    }

    const platformTag = getPlatformTag(platformQueueState, entry.targetPlatform);
    const plan = planTransition((currentState) => removeGameFromPlatformQueue(currentState, gameId, entry.targetPlatform));
    const tagOperations: UndoOperation[] = [];

    if (game && platformTag && game.tags.includes(platformTag)) {
      const nextTags = game.tags.filter((tag) => tag !== platformTag);
      tagOperations.push({ kind: 'game-fields', gameId, previous: { tags: game.tags }, expected: { tags: nextTags } });
      setGames((currentGames) => currentGames.map((currentGame) => currentGame.id === gameId
        ? touchGameRecord({ ...currentGame, tags: nextTags })
        : currentGame));
    }

    if (game) {
      addUndoAction(getRemoveQueueToastMessage(game, entry.targetPlatform), {
        actionType: 'remove-from-queue', affectedGameIds: [gameId], description: formatMessageTemplate(t('app.restoreToPlanPosition'), { game: game.title, position: entry.queuePosition }),
      }, [...plan.operations, ...tagOperations], { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
    }

    plan.commit();
  }

  const updateQueueLimit = (platform: GamePlatform, maxActiveGames: number) => setPlatformQueueState((currentState) => updatePlatformQueueSetting(currentState, platform, maxActiveGames));

  return { addGameToQueue, addQueuePlatform, dropGameFromCompactRow, finishGameFromCompactRow, moveQueueGame, moveQueueGameToPlatform, playGameFromCompactRow, playQueueGameNow, removeQueueGame, updateCurrentlyPlayingGame, updateQueueLimit };
}
