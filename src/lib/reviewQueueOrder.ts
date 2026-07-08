export function reorderSkippedGameToPendingQueueEnd(
  gameId: string,
  pendingGameIds: string[],
  currentQueueOrder: string[],
) {
  const reorderedPendingQueue = [...pendingGameIds.filter((queuedGameId) => queuedGameId !== gameId), gameId];
  const reorderedPendingIds = new Set(reorderedPendingQueue);
  const outsidePendingQueue = currentQueueOrder.filter((queuedGameId) => !reorderedPendingIds.has(queuedGameId));

  return Array.from(new Set([...reorderedPendingQueue, ...outsidePendingQueue]));
}
