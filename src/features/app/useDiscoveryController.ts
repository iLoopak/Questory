import { useCallback, useMemo, useState } from 'react';
import type { TFunction } from '../../i18n';
import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import {
  deferDiscoveryInboxItemForFutureSession,
  loadDiscoveryInboxState,
  restoreDeferredDiscoveryInboxItem,
  saveDiscoveryInboxState,
  type DiscoveryInboxItem,
} from '../../lib/discoveryInboxStorage';
import { formatMessageTemplate } from '../../utils/summaryFormatters';

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
  const [inboxState, setInboxState] = useState(() => loadDiscoveryInboxState());
  const inboxItems = inboxState.activeQueue;
  const [previewCandidate, setPreviewCandidate] = useState<DiscoveryCandidate | null>(null);

  const inboxRawgIds = useMemo(
    () => new Set(inboxItems.map((item) => item.rawgId)),
    [inboxItems],
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
    skipInboxItem,
  };
}
