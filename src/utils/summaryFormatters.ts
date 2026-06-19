import type { TFunction } from '../i18n';

export function formatMessageTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
import type { HltbSyncSummary } from '../lib/hltb';
import type {
  SteamAchievementSyncSummary,
  SteamPlaytimeRefreshSummary,
  SteamWishlistSyncSummary,
} from '../types/steam';

export type SteamWishlistHtmlImportSummary = {
  addedCount: number;
  existingCount: number;
  skippedCount: number;
};

export type BulkActionSummary = Partial<SteamAchievementSyncSummary> & {
  ignoredCount?: number;
  message?: string;
  removedCount?: number;
  skippedCount?: number;
  updatedCount?: number;
  wishlistedCount?: number;
};

export function didSteamPlaytimeSyncSucceed(summary: SteamPlaytimeRefreshSummary | null) {
  return summary !== null && summary.failedCount === 0;
}

export function didSteamAchievementSyncSucceed(summary: SteamAchievementSyncSummary | null) {
  return summary !== null && summary.failedCount === 0;
}

export function formatSteamDataPartialDetails(
  playtimeSummary: SteamPlaytimeRefreshSummary | null,
  achievementSummary: SteamAchievementSyncSummary | null,
) {
  const parts = [
    playtimeSummary
      ? `Playtime: ${playtimeSummary.updatedCount} updated, ${playtimeSummary.unchangedCount} unchanged, ${playtimeSummary.failedCount} failed${playtimeSummary.skippedNonSteamCount > 0 ? `, ${playtimeSummary.skippedNonSteamCount} non-Steam skipped` : ''}.`
      : 'Playtime refresh did not complete.',
    achievementSummary
      ? `Achievements: ${achievementSummary.updatedCount} updated, ${achievementSummary.unchangedCount} unchanged, ${achievementSummary.noAchievementDataCount} no achievements, ${achievementSummary.failedCount} failed${achievementSummary.skippedNonSteamCount > 0 ? `, ${achievementSummary.skippedNonSteamCount} non-Steam skipped` : ''}.`
      : 'Achievement sync did not complete.',
  ];

  return parts.join(' ');
}

export function formatSteamAchievementSyncSummary(summary: SteamAchievementSyncSummary) {
  const completionPrefix = 'Steam achievements sync complete.';
  const parts = [
    `${summary.updatedCount} updated`,
    summary.unchangedCount > 0 ? `${summary.unchangedCount} unchanged` : null,
    `${summary.noAchievementDataCount} no achievements`,
    `${summary.failedCount} failed`,
    summary.skippedNonSteamCount > 0 ? `${summary.skippedNonSteamCount} non-Steam skipped` : null,
  ].filter(Boolean);

  return `${completionPrefix} ${parts.join(' · ')}.`;
}

export function formatBulkSummary(summary: BulkActionSummary) {
  if (summary.message) {
    return summary.message;
  }

  const parts = [
    summary.updatedCount ? `${summary.updatedCount} updated` : null,
    summary.removedCount ? `${summary.removedCount} removed` : null,
    summary.ignoredCount ? `${summary.ignoredCount} ignored` : null,
    summary.failedCount ? `${summary.failedCount} failed` : null,
    summary.noAchievementDataCount ? `${summary.noAchievementDataCount} no achievements` : null,
    summary.skippedNonSteamCount ? `${summary.skippedNonSteamCount} non-Steam skipped` : null,
    summary.wishlistedCount ? `${summary.wishlistedCount} sent to Wishlist` : null,
    typeof summary.skippedCount === 'number' ? `${summary.skippedCount} skipped` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' - ') : 'Bulk action complete';
}

export function formatHltbSyncSummary(summary: HltbSyncSummary, t: TFunction) {
  const unavailablePart = summary.unavailableCount > 0 ? ` · ${summary.unavailableCount} provider unavailable` : '';
  return `${t('hltb.syncComplete')}. ${summary.updatedCount} updated · ${summary.noMatchCount} no match · ${summary.failedCount} failed${unavailablePart}.`;
}

export function formatSteamWishlistSyncSummary(summary: SteamWishlistSyncSummary, t: TFunction) {
  if (summary.fetchedCount === 0) {
    return t('collection.noSteamWishlistGames');
  }

  return `${t('collection.steamWishlistSyncComplete')}. ${summary.addedCount} added · ${summary.updatedCount} updated · ${summary.unchangedCount} unchanged · ${summary.failedCount} failed.`;
}

export function formatSteamWishlistHtmlImportSummary(summary: SteamWishlistHtmlImportSummary, t: TFunction) {
  return t('wishlist.importSummary')
    .replace('X', summary.addedCount.toString())
    .replace('Y', summary.existingCount.toString())
    .replace('Z', summary.skippedCount.toString());
}

export function formatCountMessage(message: string, count: number) {
  return message.replace('X', count.toString());
}
