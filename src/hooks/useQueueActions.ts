import type { Dispatch, SetStateAction } from 'react';
import type { PlayingGameAction } from '../types/gameActions';
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
import { transitionGameStatus, type StatusTransitionEffects } from '../lib/gameStatusTransitions';
import type { UndoActionHistoryEntry } from '../lib/undoHistoryStorage';
import { derivePlanUndoOperations, type UndoOperation } from '../lib/undoOperations';
import type { Game, GamePlatform, GameStatus } from '../types/game';

type AddUndoAction = (
  message: string,
  historyEntry: Omit<UndoActionHistoryEntry, 'createdAt'>,
  operations: UndoOperation[],
  notification?: Partial<NotificationDraft>,
) => void;

/** What a batch Plan addition actually did, so the caller can report it honestly. */
export type AddGamesToQueueSummary = {
  addedCount: number;
  alreadyInPlanCount: number;
  /** Games already being played on the target platform: a Plan entry would be stripped anyway. */
  skippedPlayingCount: number;
  platform: GamePlatform;
};

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

  /**
   * Add several games to one Plan in a single action (AS-06: the Retro import's "Add to Platform
   * Plans", which used to tag the games and mark them Playing without ever writing a Plan entry).
   *
   * It is the same canonical Plan mutation as `addGameToQueue`, applied once per game against one
   * evolving Plan state — not a second Plan persistence path. Nothing about the games' progress is
   * touched: no status, no play timestamps, no play activity.
   */
  function addGamesToQueue(targetGames: Game[], platform: GamePlatform): AddGamesToQueueSummary {
    const platformTag = getPlatformTag(platformQueueState, platform);
    const summary: AddGamesToQueueSummary = { addedCount: 0, alreadyInPlanCount: 0, skippedPlayingCount: 0, platform };
    const tagOperations: UndoOperation[] = [];
    const addedGames: Game[] = [];

    const plan = planTransition((currentState) =>
      targetGames.reduce((state, game) => {
        // A game that is already being played on this platform has no Plan entry by design — the
        // Plan owner strips entries for currently-playing games. Adding one would create a row
        // that immediately disappears, so it is reported as skipped rather than faked.
        if (game.status === 'Playing' && game.platform === platform) {
          summary.skippedPlayingCount += 1;
          return state;
        }

        const alreadyPlanned = state.entries.some(
          (entry) => entry.gameId === game.id && entry.targetPlatform === platform,
        );

        if (alreadyPlanned) {
          // addGameToPlatformQueue would replace the entry, which is idempotent but would reset
          // its position. Leave it exactly as it is.
          summary.alreadyInPlanCount += 1;
          return state;
        }

        summary.addedCount += 1;
        addedGames.push(game);
        return addGameToPlatformQueue(state, game, platform);
      }, currentState),
    );

    if (summary.addedCount === 0) {
      return summary;
    }

    addedGames.forEach((game) => {
      tagOperations.push(...withPlatformTag(game, platformTag));
    });

    addUndoAction(
      addedGames.length === 1
        ? formatMessageTemplate(t('toast.addedToPlatformPlan'), { game: formatToastGameTitle(addedGames[0].title), platform })
        : formatMessageTemplate(t('toast.gamesAddedToPlatformPlan'), { count: addedGames.length, platform }),
      {
        actionType: 'add-many-to-queue',
        affectedGameIds: addedGames.map((game) => game.id),
        description: formatMessageTemplate(t('app.removeFromPlatformBacklog'), {
          game: addedGames.map((game) => game.title).join(', '),
          platform,
        }),
      },
      [...plan.operations, ...tagOperations],
      { actions: [getUndoAction(), getOpenQueueAction()] },
    );

    plan.commit();
    markOnboardingItemComplete('queue-game');
    return summary;
  }

  /** The Plan half of a status transition, applied by the owner of Plan state (AS-07). */
  function planStateForEffects(state: PlatformQueueState, gameId: string, effects: StatusTransitionEffects) {
    if (effects.removeFromAllPlans) {
      return removeGameFromPlatformQueue(state, gameId);
    }
    if (effects.removeFromPlanForPlatform) {
      return removeGameFromPlatformQueue(state, gameId, effects.removeFromPlanForPlatform);
    }
    return state;
  }

  /** The transition's fields, so the undo guard and inverse cover exactly what it wrote. */
  function statusFields(game: Game, nextGame: Game, extra: Array<keyof Game> = []): UndoOperation {
    const fields: Array<keyof Game> = ['status', 'lastPlayedAt', 'finishedAt', 'droppedAt', ...extra];
    const pick = (source: Game) =>
      fields.reduce<Partial<Game>>((picked, field) => {
        (picked as Record<string, unknown>)[field as string] = source[field];
        return picked;
      }, {});

    return { kind: 'game-fields', gameId: game.id, previous: pick(game), expected: pick(nextGame) };
  }

  function playQueueGameNow(gameId: string, platform: GamePlatform) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game) return;

    const platformTag = getPlatformTag(platformQueueState, platform);
    const nextTags = platformTag ? Array.from(new Set([...game.tags, platformTag])) : game.tags;

    // Starting a game moves it to the platform it is played on and stamps the play date — through
    // the same canonical transition the Library and Game Detail use.
    const { nextGame, effects } = transitionGameStatus({
      game,
      nextStatus: 'Playing',
      now: new Date(),
      context: 'plan',
      platform,
      changes: { platform, tags: nextTags },
    });

    const plan = planTransition((currentState) => removeCurrentlyPlayingFromPlatformQueue(
      planStateForEffects(currentState, gameId, effects),
      [...games.filter((currentGame) => currentGame.id !== gameId), nextGame],
    ));

    addUndoAction(formatGameToastMessage(t('toast.markedPlayingNow'), game), {
      actionType: 'play-now',
      affectedGameIds: [game.id],
      description: formatMessageTemplate(t('app.restoreToPlatformBacklog'), { game: game.title, platform }),
    }, [
      statusFields(game, nextGame, ['platform', 'tags']),
      ...plan.operations,
    ], { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });

    setGames((currentGames) => currentGames.map((currentGame) => currentGame.id === gameId ? nextGame : currentGame));
    plan.commit();
  }

  function updateCurrentlyPlayingGame(gameId: string, platform: GamePlatform, action: PlayingGameAction) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game) return;

    const nextStatus: GameStatus = action === 'finished' ? 'Finished' : action === 'drop' ? 'Dropped' : 'Want to play';
    const actionLabels: Record<PlayingGameAction, string> = {
      'move-to-backlog': formatGameToastMessage(t('toast.addedToPlatforms'), game),
      finished: formatGameToastMessage(t('toast.markedFinished'), game),
      drop: formatGameToastMessage(t('toast.dropped'), game),
      'remove-from-playing': `${formatGameToastMessage(t('toast.removedFromPlayingNow'), game)} on ${platform}`,
    };

    const { nextGame, effects } = transitionGameStatus({
      game,
      nextStatus,
      now: new Date(),
      context: 'plan',
      platform,
    });

    const plan = planTransition((currentState) => action === 'move-to-backlog'
      // Moving back to the backlog is the one action that ADDS a Plan entry rather than clearing
      // one: the game stops being played and becomes planned work again, at the top of the Plan.
      ? addGameToPlatformQueueTop(currentState, nextGame, platform)
      : planStateForEffects(currentState, gameId, effects));

    addUndoAction(actionLabels[action], {
      actionType: 'playing-action', affectedGameIds: [game.id], description: formatMessageTemplate(t('app.restoreToPlayingNow'), { game: game.title }),
    }, [
      statusFields(game, nextGame),
      ...plan.operations,
    ], { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });

    setGames((currentGames) => currentGames.map((currentGame) => currentGame.id === gameId ? nextGame : currentGame));
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

  return { addGamesToQueue, addGameToQueue, addQueuePlatform, dropGameFromCompactRow, finishGameFromCompactRow, moveQueueGame, moveQueueGameToPlatform, playGameFromCompactRow, playQueueGameNow, removeQueueGame, updateCurrentlyPlayingGame, updateQueueLimit };
}
