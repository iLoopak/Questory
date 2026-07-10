import { useCallback, useMemo, useState } from 'react';
import type { TFunction } from '../../i18n';
import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { loadDiscoveryInbox, saveDiscoveryInbox, type DiscoveryInboxItem } from '../../lib/discoveryInboxStorage';
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
  const [inboxItems, setInboxItems] = useState<DiscoveryInboxItem[]>(() => loadDiscoveryInbox());
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
    if (inboxItems.some((item) => item.rawgId === discoveryGame.rawgId)) {
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
    const updated = [...inboxItems, newItem];
    saveDiscoveryInbox(updated);
    setInboxItems(updated);
    addToastNotification({
      category: 'success',
      dedupeKey: `inbox-add:${discoveryGame.rawgId}`,
      message: formatMessageTemplate(t('toast.discoveryAddedToInbox'), { game: discoveryGame.title }),
    });
  }, [addToastNotification, games, inboxItems, t]);

  const removeFromInbox = useCallback((id: string) => {
    setInboxItems((currentItems) => {
      const updated = currentItems.filter((item) => item.id !== id);
      saveDiscoveryInbox(updated);
      return updated;
    });
  }, []);

  const skipInboxItem = useCallback((id: string) => {
    setInboxItems((currentItems) => {
      const itemIndex = currentItems.findIndex((item) => item.id === id);
      if (itemIndex < 0 || currentItems.length <= 1) return currentItems;

      const skippedItem = currentItems[itemIndex];
      const updated = [
        ...currentItems.slice(0, itemIndex),
        ...currentItems.slice(itemIndex + 1),
        skippedItem,
      ];
      saveDiscoveryInbox(updated);
      return updated;
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
