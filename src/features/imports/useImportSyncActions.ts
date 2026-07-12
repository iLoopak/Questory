import { multiGameImportTransition, steamWishlistHtmlImportTransition } from '../../lib/importTransitions';
import type { MultiGameImportParseResult, MultiGameImportSummary } from '../../lib/multiGameImport';
import type { ParsedSteamWishlistImportItem } from '../../lib/steamWishlistHtmlImport';
import type { TFunction } from '../../i18n';
import { formatSteamWishlistHtmlImportSummary, type SteamWishlistHtmlImportSummary } from '../../utils/summaryFormatters';
import { type NotificationDraft } from '../../lib/notifications';
import type { SliceCommands } from '../app/useSliceCommands';

export type ImportSyncActionsOptions = {
  runGamesCommand: SliceCommands['runGamesCommand'];
  addToastNotification: (notification: NotificationDraft) => void;
  t: TFunction;
};

/**
 * AS-14: both imports used to declare a zeroed `summary`, reassign it inside `setGames(...)`, and
 * then toast it. If React had not run the updater yet, the user was told "0 imported" for an import
 * that worked. The merge now happens at the command boundary, so the toast reports the merge that
 * was actually applied.
 */
export function useImportSyncActions({ runGamesCommand, addToastNotification, t }: ImportSyncActionsOptions) {
  function importMultiGameItems(parsed: MultiGameImportParseResult): MultiGameImportSummary {
    const importedAt = new Date().toISOString();
    const summary = runGamesCommand((currentGames) => multiGameImportTransition(currentGames, parsed, importedAt));

    addToastNotification({
      category: summary.importedCount > 0 || summary.updatedExisting > 0 ? 'success' : 'info',
      dedupeKey: 'multi-game-import',
      message: `Multi Game Import: ${summary.importedCount} imported · ${summary.updatedExisting} updated · ${summary.skippedDuplicates} duplicates · ${summary.invalidRows} skipped`,
    });

    return summary;
  }

  function importSteamWishlistHtmlItems(items: ParsedSteamWishlistImportItem[], inputSkippedCount = 0): SteamWishlistHtmlImportSummary {
    const importedAt = new Date().toISOString();
    const summary = runGamesCommand((currentGames) => steamWishlistHtmlImportTransition(currentGames, items, importedAt, inputSkippedCount));

    addToastNotification({
      category: summary.addedCount > 0 ? 'success' : 'info',
      dedupeKey: 'steam-wishlist-html-import',
      message: formatSteamWishlistHtmlImportSummary(summary, t),
    });

    return summary;
  }

  return { importMultiGameItems, importSteamWishlistHtmlItems };
}
