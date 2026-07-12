import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from '../../i18n';
import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import {
  appendDiscoveryInboxRecommendations,
  deferDiscoveryInboxItemForFutureSession,
  getDiscoveryInboxRequestGeneration,
  loadDiscoveryInboxState,
  reconcileDiscoveryInboxState,
  restoreDeferredDiscoveryInboxItem,
  saveDiscoveryInboxState,
  startDiscoveryInboxRun,
  type DiscoveryInboxItem,
} from '../../lib/discoveryInboxStorage';
import { formatMessageTemplate } from '../../utils/summaryFormatters';
import { fetchPersonalRecommendationsResult } from '../../services/personalRecommendationsService';
import { trackAnalyticsEvent } from '../../lib/analytics';

type ToastNotification = {
  category: 'success' | 'info';
  dedupeKey: string;
  message: string;
};

type UseDiscoveryControllerOptions = {
  games: Game[];
  t: TFunction;
  addToastNotification: (notification: ToastNotification) => void;
};

export function useDiscoveryController({ games, t, addToastNotification }: UseDiscoveryControllerOptions) {
  const [inboxState, setInboxState] = useState(() => {
    const state = startDiscoveryInboxRun(loadDiscoveryInboxState());
    saveDiscoveryInboxState(state);
    return state;
  });
  const inboxItems = inboxState.activeQueue;
  const [previewCandidate, setPreviewCandidate] = useState<DiscoveryCandidate | null>(null);
  const [isRequestingInboxRecommendations, setIsRequestingInboxRecommendations] = useState(false);
  const isRequestingInboxRecommendationsRef = useRef(false);

  // AS-09: `reconcileDiscoveryInboxState` existed but nothing called it, so a game the user imported
  // (or promoted, or restored from a backup) stayed in the Inbox and could be promoted again into a
  // duplicate. Canonical games are the trigger: whenever they change — import, manual add, either
  // promotion path, a collection move, a restore, or a metadata refresh that adds a RAWG id — the
  // resolved candidates drop out. This is a pure identity pass over state the app already holds; no
  // provider request is made.
  useEffect(() => {
    setInboxState((currentState) => {
      const reconciledState = reconcileDiscoveryInboxState(currentState, games);
      if (reconciledState === currentState) return currentState;

      saveDiscoveryInboxState(reconciledState);
      return reconciledState;
    });
  }, [games]);

  const inboxRawgIds = useMemo(
    () => new Set([...inboxState.activeQueue, ...inboxState.nextQueue].map((item) => item.rawgId)),
    [inboxState.activeQueue, inboxState.nextQueue],
  );

  const openPreview = useCallback((candidate: DiscoveryCandidate) => {
    setPreviewCandidate(candidate);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewCandidate(null);
  }, []);

  const addToInbox = useCallback((discoveryGame: DiscoveryGame, reason: string) => {
    if (inboxState.activeQueue.some((item) => item.rawgId === discoveryGame.rawgId)) {
      addToastNotification({
        category: 'info',
        dedupeKey: `inbox-dup:${discoveryGame.rawgId}`,
        message: formatMessageTemplate(t('toast.discoveryAlreadyInInbox'), { game: discoveryGame.title }),
      });
      return;
    }

    if (games.some((game) => game.rawgId === discoveryGame.rawgId)) {
      addToastNotification({
        category: 'info',
        dedupeKey: `inbox-owned:${discoveryGame.rawgId}`,
        message: formatMessageTemplate(t('toast.discoveryAlreadyInLibrary'), { game: discoveryGame.title }),
      });
      return;
    }

    const newItem: DiscoveryInboxItem = {
      id: `inbox-${Date.now()}-${discoveryGame.rawgId}`,
      rawgId: discoveryGame.rawgId,
      game: discoveryGame,
      source: 'similar',
      reason,
      createdAt: Date.now(),
    };
    const deferredState = restoreDeferredDiscoveryInboxItem(inboxState, discoveryGame.rawgId);
    const updatedState = deferredState === inboxState
      ? { ...inboxState, activeQueue: [...inboxState.activeQueue, newItem] }
      : deferredState;
    saveDiscoveryInboxState(updatedState);
    setInboxState(updatedState);
    addToastNotification({
      category: 'success',
      dedupeKey: `inbox-add:${discoveryGame.rawgId}`,
      message: formatMessageTemplate(t('toast.discoveryAddedToInbox'), { game: discoveryGame.title }),
    });
  }, [addToastNotification, games, inboxState, t]);

  const removeFromInbox = useCallback((id: string) => {
    setInboxState((currentState) => {
      const updatedState = { ...currentState, activeQueue: currentState.activeQueue.filter((item) => item.id !== id) };
      saveDiscoveryInboxState(updatedState);
      return updatedState;
    });
  }, []);

  const startInboxRun = useCallback(() => {
    setInboxState((currentState) => {
      const updatedState = startDiscoveryInboxRun(currentState);
      if (updatedState === currentState) return currentState;

      saveDiscoveryInboxState(updatedState);
      return updatedState;
    });
  }, []);

  const requestInboxRecommendations = useCallback(async () => {
    if (isRequestingInboxRecommendationsRef.current) return 0;
    isRequestingInboxRecommendationsRef.current = true;
    setIsRequestingInboxRecommendations(true);
    const requestGeneration = getDiscoveryInboxRequestGeneration();
    try {
      const latestState = loadDiscoveryInboxState();
      const queuedRawgIds = new Set([
        ...latestState.activeQueue.map((item) => item.rawgId),
        ...latestState.nextQueue.map((item) => item.rawgId),
      ]);
      const { candidates } = await fetchPersonalRecommendationsResult(games, queuedRawgIds, { forceRefresh: true });
      if (getDiscoveryInboxRequestGeneration() !== requestGeneration) return 0;
      const validCandidates = candidates
        .filter((candidate) => !candidate.excluded && candidate.libraryStatus === null && !candidate.inboxStatus)
        .slice(0, 10);
      const { state: updatedState, addedItems } = appendDiscoveryInboxRecommendations(
        latestState,
        validCandidates.map((candidate) => ({ game: candidate.game, reason: candidate.reason })),
      );

      if (updatedState !== latestState) {
        saveDiscoveryInboxState(updatedState);
        setInboxState(updatedState);
      }

      trackAnalyticsEvent('discovery_recommendations_requested', {
        requested_count: 10,
        returned_count: addedItems.length,
        source: 'discovery_inbox',
      });

      addToastNotification({
        category: addedItems.length > 0 ? 'success' : 'info',
        dedupeKey: `discovery-recommendations:${Date.now()}`,
        message: addedItems.length === 1
          ? t('toast.discoveryRecommendationsAddedOne')
          : formatMessageTemplate(t('toast.discoveryRecommendationsAddedMany'), { count: addedItems.length }),
      });

      return addedItems.length;
    } catch {
      addToastNotification({
        category: 'info',
        dedupeKey: 'discovery-recommendations-failed',
        message: t('toast.discoveryRecommendationsFailed'),
      });
      return 0;
    } finally {
      isRequestingInboxRecommendationsRef.current = false;
      setIsRequestingInboxRecommendations(false);
    }
  }, [addToastNotification, games, t]);

  const skipInboxItem = useCallback((id: string) => {
    setInboxState((currentState) => {
      const updatedState = deferDiscoveryInboxItemForFutureSession(currentState, id);
      if (updatedState === currentState) return currentState;

      saveDiscoveryInboxState(updatedState);
      return updatedState;
    });
  }, []);

  return {
    inboxItems,
    inboxRawgIds,
    previewCandidate,
    addToInbox,
    closePreview,
    openPreview,
    removeFromInbox,
    requestInboxRecommendations,
    isRequestingInboxRecommendations,
    skipInboxItem,
    startInboxRun,
  };
}
