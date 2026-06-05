export type IsThereAnyDealSettings = {
  apiKey: string;
};

export type ItadMatchConfidence = 'exact' | 'title-normalized';

export type ItadDealSyncSummary = {
  failedCount: number;
  noMatchCount: number;
  updatedCount: number;
};
