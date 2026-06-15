import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ReviewModeAction } from '../components/ReviewModePanel';
import { createTranslator } from '../i18n';
import {
  formatGameToastMessage,
  getDismissAction,
  getViewGameAction,
  type NotificationDraft,
} from '../lib/notifications';
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
  addToastNotification: (notification: NotificationDraft) => void;
  addToWishlist: (game: Game) => void;
  addUndoAction: (message: string, payload: ReviewUndoPayload) => void;
  refreshGameMetadataFromActions: (game: Game, mode?: 'metadata' | 'artwork') => Promise<unknown>;
  reviewModeState: ReviewModeState;
  setActiveNavItem: (navItem: 'Library' | 'Wishlist' | 'Review Mode') => void;
  setActiveReviewSource: Dispatch<SetStateAction<ReviewSource>>;
  setIgnoredSteamGames: Dispatch<SetStateAction<IgnoredSteamGame[]>>;
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
  addToastNotification,
  addToWishlist,
  addUndoAction,
  refreshGameMetadataFromActions,
  reviewModeState,
  setActiveNavItem,
  setActiveReviewSource,
  setIgnoredSteamGames,
  setReviewModeState,
  setSelectedGameId,
  startMetadataWorkflow,
  t,
  updateGameReviewFields,
}: UseReviewModeActionsParams) {
  useEffect(() => {
    saveReviewModeState(reviewModeState);
  }, [reviewModeState]);

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

  function handleReviewAction(game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform) {
    if (action === 'skip') {
      addToastNotification({
        actions: [getDismissAction(), getViewGameAction(game.id)],
        category: 'info',
        dedupeKey: `review-skip:${game.id}`,
        message: formatGameToastMessage(t('toast.skipped'), game),
      });
      recordReviewDecision('skipped');
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
      return;
    }

    if (action === 'note' && note) {
      updateGameReviewFields(game.id, {
        notes: appendReviewNote(game.notes, note),
      });
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'queue') {
      if (targetPlatform) {
        addGameToQueue(game, targetPlatform);
      }
      recordReviewDecision('queueCandidates');
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'playing') {
      updateGameReviewFields(game.id, {
        status: 'Playing',
      });
      recordReviewDecision('playing');
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'finished') {
      updateGameReviewFields(game.id, {
        finishedAt: new Date().toISOString(),
        status: 'Finished',
      });
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'dropped') {
      updateGameReviewFields(game.id, {
        droppedAt: new Date().toISOString(),
        status: 'Dropped',
      });
      recordReviewDecision('dropped');
      recordReviewDecision('reviewed');
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
