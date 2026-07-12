import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ReviewModeAction, ReviewModeActionContext } from '../components/ReviewModePanel';
import { createTranslator } from '../i18n';
import { formatGameToastMessage } from '../lib/notifications';
import { removeGameFromPlatformQueue, type PlatformQueueState } from '../lib/platformQueueStorage';
import { derivePlanUndoOperations, type UndoOperation } from '../lib/undoOperations';
import { reorderSkippedGameToPendingQueueEnd } from '../lib/reviewQueueOrder';
import {
  saveReviewModeState,
  type ReviewDecision,
  type ReviewModeState,
  type ReviewSource,
} from '../lib/reviewModeStorage';
import { addIgnoredSteamGame, type IgnoredSteamGame } from '../lib/steamIgnoredGamesStorage';
import type { Game, GamePlatform } from '../types/game';

type ReviewUndoPayload = {
  actionType: string;
  affectedGameIds: string[];
  description: string;
};

type UseReviewModeActionsParams = {
  addGameToQueue: (game: Game, platform: GamePlatform, extraOperations?: UndoOperation[]) => void;
  addToWishlist: (game: Game, extraOperations?: UndoOperation[]) => void;
  addUndoAction: (message: string, payload: ReviewUndoPayload, operations: UndoOperation[]) => void;
  refreshGameMetadataFromActions: (game: Game, mode?: 'metadata' | 'artwork') => Promise<unknown>;
  reviewModeState: ReviewModeState;
  setActiveNavItem: (navItem: 'Library' | 'Wishlist' | 'Review Mode') => void;
  setActiveReviewSource: Dispatch<SetStateAction<ReviewSource>>;
  setIgnoredSteamGames: Dispatch<SetStateAction<IgnoredSteamGame[]>>;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
  setReviewModeState: Dispatch<SetStateAction<ReviewModeState>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
  platformQueueState: PlatformQueueState;
  startMetadataWorkflow: (gameIds: string[]) => void;
  t: ReturnType<typeof createTranslator>;
  updateGameReviewFields: (gameId: string, changes: Partial<Game>, extraOperations?: UndoOperation[]) => void;
};

function formatMessageTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, String(value)), template);
}

function appendReviewNote(existingNotes: string, note: string) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const reviewNote = `[Quest Queue ${timestamp}] ${note}`;

  return existingNotes.trim() ? `${existingNotes.trim()}\n\n${reviewNote}` : reviewNote;
}

export function useReviewModeActions({
  addGameToQueue,
  addToWishlist,
  addUndoAction,
  platformQueueState,
  refreshGameMetadataFromActions,
  reviewModeState,
  setActiveNavItem,
  setActiveReviewSource,
  setIgnoredSteamGames,
  setPlatformQueueState,
  setReviewModeState,
  setSelectedGameId,
  startMetadataWorkflow,
  t,
  updateGameReviewFields,
}: UseReviewModeActionsParams) {
  useEffect(() => {
    saveReviewModeState(reviewModeState);
  }, [reviewModeState]);


  function markQuestQueueReviewed(gameId: string) {
    setReviewModeState((currentState) => ({
      ...currentState,
      queueOrder: currentState.queueOrder.filter((queuedGameId) => queuedGameId !== gameId),
      reviewedGames: {
        ...currentState.reviewedGames,
        [gameId]: { reviewedAt: new Date().toISOString() },
      },
    }));
  }

  function moveQuestQueueGameToEnd(gameId: string, context?: ReviewModeActionContext) {
    setReviewModeState((currentState) => {
      const pendingQueueOrder = context?.pendingGameIds?.length ? context.pendingGameIds : currentState.queueOrder;

      return {
        ...currentState,
        queueOrder: reorderSkippedGameToPendingQueueEnd(gameId, pendingQueueOrder, currentState.queueOrder),
      };
    });
  }

  function recordReviewDecision(decision: ReviewDecision) {
    setReviewModeState((currentState) => ({
      ...currentState,
      stats: {
        ...currentState.stats,
        [decision]: currentState.stats[decision] + 1,
      },
    }));
  }

  function startReviewMode(source: ReviewSource) {
    setActiveReviewSource(source);
    setReviewModeState((currentState) => ({
      ...currentState,
      lastSource: source,
    }));
    setSelectedGameId(null);
    setActiveNavItem('Review Mode');
  }

  function setReviewSource(source: ReviewSource) {
    setActiveReviewSource(source);
    setReviewModeState((currentState) => ({
      ...currentState,
      lastSource: source,
    }));
  }

  /**
   * The review-slice half of a review decision's inverse (AS-04).
   *
   * A review action changes the game (or the Plan) AND the review slice: the game leaves the
   * queue, gains a `reviewedGames` entry, and bumps some counters. The game-level action owns the
   * first half of the inverse, so these operations are handed to it as extras — one action, one
   * toast, one complete inverse.
   */
  function reviewDecisionUndoOperations(gameId: string, decisions: ReviewDecision[]): UndoOperation[] {
    const queueIndex = reviewModeState.queueOrder.indexOf(gameId);

    return [
      { kind: 'review-unreview', gameId, index: queueIndex < 0 ? reviewModeState.queueOrder.length : queueIndex },
      { kind: 'review-stats-decrement', decisions },
    ];
  }

  function handleReviewAction(game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform, context?: ReviewModeActionContext) {
    if (action === 'skip') {
      const message = formatGameToastMessage(t('toast.skipped'), game);
      const queueIndex = reviewModeState.queueOrder.indexOf(game.id);
      addUndoAction(message, {
        actionType: 'skip-game',
        affectedGameIds: [game.id],
        description: formatMessageTemplate(t('app.restoreToReviewQueue'), { game: game.title }),
      }, [
        // Skipping only moves the game inside the queue order, so its inverse only moves it back.
        { kind: 'review-queue-reinsert', gameId: game.id, index: queueIndex < 0 ? 0 : queueIndex },
        { kind: 'review-stats-decrement', decisions: ['skipped'] },
      ]);
      recordReviewDecision('skipped');
      moveQuestQueueGameToEnd(game.id, context);
      return;
    }

    if (action === 'open-details') {
      setSelectedGameId(game.id);
      return;
    }

    if (action === 'enrich') {
      recordReviewDecision('enriched');
      void refreshGameMetadataFromActions(game, 'metadata');
      return;
    }

    if (action === 'find-artwork') {
      void refreshGameMetadataFromActions(game, 'artwork');
      return;
    }

    if (action === 'wishlist') {
      addToWishlist(game, reviewDecisionUndoOperations(game.id, ['wishlisted', 'reviewed']));
      recordReviewDecision('wishlisted');
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
      return;
    }

    if (action === 'ignore') {
      addUndoAction(formatGameToastMessage(t('toast.ignored'), game), {
        actionType: 'ignore-game',
        affectedGameIds: [game.id],
        description: formatMessageTemplate(t('app.restoreToReviewQueue'), { game: game.title }),
      }, [
        { kind: 'review-unignore', gameId: game.id },
        ...reviewDecisionUndoOperations(game.id, ['ignored', 'reviewed']),
        ...(typeof game.steamAppId === 'number'
          ? [{ kind: 'ignored-steam-remove', steamAppId: game.steamAppId } as UndoOperation]
          : []),
      ]);

      setReviewModeState((currentState) => ({
        ...currentState,
        ignoredGameIds: Array.from(new Set([...currentState.ignoredGameIds, game.id])),
      }));

      if (typeof game.steamAppId === 'number') {
        setIgnoredSteamGames((currentIgnoredGames) => addIgnoredSteamGame(currentIgnoredGames, game.steamAppId as number, game.title));
      }

      recordReviewDecision('ignored');
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
      return;
    }

    if (action === 'note' && note) {
      updateGameReviewFields(game.id, {
        notes: appendReviewNote(game.notes, note),
      });
      return;
    }

    if (action === 'queue') {
      if (targetPlatform) {
        addGameToQueue(game, targetPlatform, reviewDecisionUndoOperations(game.id, ['queueCandidates', 'reviewed']));
        recordReviewDecision('queueCandidates');
      }
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
      return;
    }

    if (action === 'playing') {
      const platform = targetPlatform ?? game.platform;
      // The game leaves its Plan as well as changing status, so the Plan half of the inverse is
      // derived the same way the queue actions derive theirs.
      const nextQueueState = removeGameFromPlatformQueue(platformQueueState, game.id, platform);

      updateGameReviewFields(game.id, { platform, status: 'Playing' }, [
        ...derivePlanUndoOperations(platformQueueState, nextQueueState),
        ...reviewDecisionUndoOperations(game.id, ['playing', 'reviewed']),
      ]);
      setPlatformQueueState(nextQueueState);
      recordReviewDecision('playing');
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
      return;
    }

    if (action === 'finished') {
      updateGameReviewFields(
        game.id,
        { finishedAt: new Date().toISOString(), status: 'Finished' },
        reviewDecisionUndoOperations(game.id, ['reviewed']),
      );
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
      return;
    }

    if (action === 'dropped') {
      updateGameReviewFields(
        game.id,
        { droppedAt: new Date().toISOString(), status: 'Dropped' },
        reviewDecisionUndoOperations(game.id, ['dropped', 'reviewed']),
      );
      recordReviewDecision('dropped');
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
    }
  }

  function restoreReviewIgnoredGames() {
    setReviewModeState((currentState) => ({
      ...currentState,
      ignoredGameIds: [],
    }));
  }

  return {
    handleReviewAction,
    restoreReviewIgnoredGames,
    setReviewSource,
    startReviewMode,
  };
}
