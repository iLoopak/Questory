import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ReviewModeAction, ReviewModeActionContext } from '../components/ReviewModePanel';
import { createTranslator } from '../i18n';
import { formatGameToastMessage } from '../lib/notifications';
import { removeGameFromPlatformQueue, type PlatformQueueState } from '../lib/platformQueueStorage';
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
  addGameToQueue: (game: Game, platform: GamePlatform) => void;
  addToWishlist: (game: Game) => void;
  addUndoAction: (message: string, payload: ReviewUndoPayload) => void;
  refreshGameMetadataFromActions: (game: Game, mode?: 'metadata' | 'artwork') => Promise<unknown>;
  reviewModeState: ReviewModeState;
  setActiveNavItem: (navItem: 'Library' | 'Wishlist' | 'Review Mode') => void;
  setActiveReviewSource: Dispatch<SetStateAction<ReviewSource>>;
  setIgnoredSteamGames: Dispatch<SetStateAction<IgnoredSteamGame[]>>;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
  setReviewModeState: Dispatch<SetStateAction<ReviewModeState>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
  startMetadataWorkflow: (gameIds: string[]) => void;
  t: ReturnType<typeof createTranslator>;
  updateGameReviewFields: (gameId: string, changes: Partial<Game>) => void;
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
      const currentQueueOrder = context?.queueGameIds?.length ? context.queueGameIds : currentState.queueOrder;
      const reorderedCurrentQueue = [...currentQueueOrder.filter((queuedGameId) => queuedGameId !== gameId), gameId];
      const reorderedGameIds = new Set(reorderedCurrentQueue);
      const outsideCurrentQueue = currentState.queueOrder.filter((queuedGameId) => !reorderedGameIds.has(queuedGameId));

      return {
        ...currentState,
        queueOrder: [...reorderedCurrentQueue, ...outsideCurrentQueue],
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

  function handleReviewAction(game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform, context?: ReviewModeActionContext) {
    if (action === 'skip') {
      const message = formatGameToastMessage(t('toast.skipped'), game);
      addUndoAction(message, {
        actionType: 'skip-game',
        affectedGameIds: [game.id],
        description: formatMessageTemplate(t('app.restoreToReviewQueue'), { game: game.title }),
      });
      recordReviewDecision('skipped');
      moveQuestQueueGameToEnd(game.id);
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
      addToWishlist(game);
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
      });

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
        addGameToQueue(game, targetPlatform);
      }
      recordReviewDecision('queueCandidates');
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
      return;
    }

    if (action === 'playing') {
      updateGameReviewFields(game.id, {
        platform: targetPlatform ?? game.platform,
        status: 'Playing',
      });
      setPlatformQueueState((currentState) => removeGameFromPlatformQueue(currentState, game.id, targetPlatform ?? game.platform));
      recordReviewDecision('playing');
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
      return;
    }

    if (action === 'finished') {
      updateGameReviewFields(game.id, {
        finishedAt: new Date().toISOString(),
        status: 'Finished',
      });
      recordReviewDecision('reviewed');
      markQuestQueueReviewed(game.id);
      return;
    }

    if (action === 'dropped') {
      updateGameReviewFields(game.id, {
        droppedAt: new Date().toISOString(),
        status: 'Dropped',
      });
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
