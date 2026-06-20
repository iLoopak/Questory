export type PsnSettings = {
  npssoToken: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  onlineId: string;
};

export type PsnTrophyCounts = {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
};

export type PsnTrophyTitle = {
  npCommunicationId: string;
  trophyTitleName: string;
  trophyTitlePlatform: string;
  trophyTitleIconUrl?: string;
  definedTrophies: PsnTrophyCounts;
  earnedTrophies: PsnTrophyCounts;
  progress: number;
  lastUpdatedDateTime?: string;
};

export type PsnConnectionState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

export type PsnTrophySyncProgress = {
  completed: number;
  total: number;
};

export type PsnTrophySyncSummary = {
  matchedCount: number;
  updatedCount: number;
  skippedCount: number;
};

export type PsnTrophySyncState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  progress: PsnTrophySyncProgress;
  summary?: PsnTrophySyncSummary;
};
