import { createTranslator } from '../i18n';
import {
  addActiveQueuePlatform,
  moveQueueEntry,
  updatePlatformQueueSetting,
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
import {
  addGameToQueueTransition,
  addGamesToQueueTransition,
  moveQueueGameToPlatformTransition,
  playQueueGameNowTransition,
  removeQueueGameTransition,
  updateCurrentlyPlayingGameTransition,
  type AddGamesToQueueSummary,
} from '../lib/queueTransitions';
import type { PlayingGameAction } from '../types/gameActions';
import type { UndoActionHistoryEntry } from '../lib/undoHistoryStorage';
import type { UndoOperation } from '../lib/undoOperations';
import type { SliceCommands } from '../features/app/useSliceCommands';
import type { Game, GamePlatform } from '../types/game';

type AddUndoAction = (
  message: string,
  historyEntry: Omit<UndoActionHistoryEntry, 'createdAt'>,
  operations: UndoOperation[],
  notification?: Partial<NotificationDraft>,
) => void;

export type { AddGamesToQueueSummary } from '../lib/queueTransitions';

type UseQueueActionsParams = {
  activeQueuePlatforms: GamePlatform[];
  addUndoAction: AddUndoAction;
  markOnboardingItemComplete: (itemId: 'platforms' | 'queue-game') => void;
  runCrossSliceCommand: SliceCommands['runCrossSliceCommand'];
  runPlanCommand: SliceCommands['runPlanCommand'];
  t: ReturnType<typeof createTranslator>;
};

function formatMessageTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, String(value)), template);
}

/**
 * AS-14: every Plan action is now one pure cross-slice transition (`lib/queueTransitions`), applied
 * at the command boundary. Previously the games write was issued from inside the Plan state updater,
 * the batch summary was accumulated in a variable a callback mutated, and both slices read whatever
 * `games`/`platformQueueState` the last render happened to close over. The transition owns the
 * arithmetic; this hook owns only the wording, the undo entry and the onboarding ticks.
 */
export function useQueueActions({
  activeQueuePlatforms,
  addUndoAction,
  markOnboardingItemComplete,
  runCrossSliceCommand,
  runPlanCommand,
  t,
}: UseQueueActionsParams) {
  function addQueuePlatform(platform: GamePlatform) {
    runPlanCommand((currentState) => ({ nextState: addActiveQueuePlatform(currentState, platform), result: null }));
    markOnboardingItemComplete('platforms');
  }

  function addGameToQueue(game: Game, platform: GamePlatform, extraOperations: UndoOperation[] = []) {
    const result = runCrossSliceCommand((games, plan) => addGameToQueueTransition(games, plan, game, platform));
    if (!result) return;

    addUndoAction(
      formatMessageTemplate(t('toast.addedToPlatformPlan'), { game: formatToastGameTitle(game.title), platform }),
      {
        actionType: 'add-to-queue',
        affectedGameIds: [game.id],
        description: formatMessageTemplate(t('app.removeFromPlatformBacklog'), { game: game.title, platform }),
      },
      [...result.operations, ...extraOperations],
      { actions: [getUndoAction(), getOpenQueueAction()] },
    );

    markOnboardingItemComplete('queue-game');
  }

  /**
   * Add several games to one Plan in a single action (AS-06: the Retro import's "Add to Platform
   * Plans"). Nothing about the games' progress is touched: no status, no play timestamps, no play
   * activity — only the Plan entries and the platform tag.
   */
  function addGamesToQueue(targetGames: Game[], platform: GamePlatform): AddGamesToQueueSummary {
    const result = runCrossSliceCommand((games, plan) => addGamesToQueueTransition(games, plan, targetGames, platform));
    if (!result) {
      return { addedCount: 0, alreadyInPlanCount: 0, skippedPlayingCount: 0, platform };
    }

    const { addedGames, operations, summary } = result;
    if (summary.addedCount === 0) {
      return summary;
    }

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
      operations,
      { actions: [getUndoAction(), getOpenQueueAction()] },
    );

    markOnboardingItemComplete('queue-game');
    return summary;
  }

  function playQueueGameNow(gameId: string, platform: GamePlatform) {
    const result = runCrossSliceCommand((games, plan) => playQueueGameNowTransition(games, plan, gameId, platform));
    if (!result) return;

    addUndoAction(formatGameToastMessage(t('toast.markedPlayingNow'), result.nextGame), {
      actionType: 'play-now',
      affectedGameIds: [gameId],
      description: formatMessageTemplate(t('app.restoreToPlatformBacklog'), { game: result.nextGame.title, platform }),
    }, result.operations, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
  }

  function updateCurrentlyPlayingGame(gameId: string, platform: GamePlatform, action: PlayingGameAction) {
    const result = runCrossSliceCommand((games, plan) => updateCurrentlyPlayingGameTransition(games, plan, gameId, platform, action));
    if (!result) return;

    const game = result.nextGame;
    const actionLabels: Record<PlayingGameAction, string> = {
      'move-to-backlog': formatGameToastMessage(t('toast.addedToPlatforms'), game),
      finished: formatGameToastMessage(t('toast.markedFinished'), game),
      drop: formatGameToastMessage(t('toast.dropped'), game),
      'remove-from-playing': `${formatGameToastMessage(t('toast.removedFromPlayingNow'), game)} on ${platform}`,
    };

    addUndoAction(actionLabels[action], {
      actionType: 'playing-action',
      affectedGameIds: [gameId],
      description: formatMessageTemplate(t('app.restoreToPlayingNow'), { game: game.title }),
    }, result.operations, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
  }

  const playGameFromCompactRow = (game: Game) => playQueueGameNow(game.id, game.platform);
  const finishGameFromCompactRow = (game: Game) => updateCurrentlyPlayingGame(game.id, game.platform, 'finished');
  const dropGameFromCompactRow = (game: Game) => updateCurrentlyPlayingGame(game.id, game.platform, 'drop');

  // Reordering inside one platform shows no toast today and therefore has no Undo; that is unchanged.
  const moveQueueGame = (gameId: string, platform: GamePlatform, direction: 'top' | 'up' | 'down') =>
    runPlanCommand((currentState) => ({ nextState: moveQueueEntry(currentState, gameId, direction, platform), result: null }));

  function moveQueueGameToPlatform(gameId: string, sourcePlatform: GamePlatform, platform: GamePlatform) {
    if (!activeQueuePlatforms.includes(platform)) return;

    const result = runCrossSliceCommand((games, plan) => moveQueueGameToPlatformTransition(games, plan, gameId, sourcePlatform, platform));
    if (!result?.game || !result.movedFromPlatform) return;

    addUndoAction(getMoveQueueToastMessage(result.game, platform), {
      actionType: 'move-between-collections',
      affectedGameIds: [gameId],
      description: formatMessageTemplate(t('app.restoreToPlatformBacklog'), { game: result.game.title, platform: result.movedFromPlatform }),
    }, result.operations, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
  }

  function removeQueueGame(gameId: string, platform?: GamePlatform) {
    const result = runCrossSliceCommand((games, plan) => removeQueueGameTransition(games, plan, gameId, platform));
    if (!result?.removedEntry || !result.game) return;

    addUndoAction(getRemoveQueueToastMessage(result.game, result.removedEntry.targetPlatform), {
      actionType: 'remove-from-queue',
      affectedGameIds: [gameId],
      description: formatMessageTemplate(t('app.restoreToPlanPosition'), { game: result.game.title, position: result.removedEntry.queuePosition }),
    }, result.operations, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
  }

  const updateQueueLimit = (platform: GamePlatform, maxActiveGames: number) =>
    runPlanCommand((currentState) => ({ nextState: updatePlatformQueueSetting(currentState, platform, maxActiveGames), result: null }));

  return { addGamesToQueue, addGameToQueue, addQueuePlatform, dropGameFromCompactRow, finishGameFromCompactRow, moveQueueGame, moveQueueGameToPlatform, playGameFromCompactRow, playQueueGameNow, removeQueueGame, updateCurrentlyPlayingGame, updateQueueLimit };
}
