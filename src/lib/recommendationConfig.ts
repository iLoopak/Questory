export const RECOMMENDATION_ENGINE_VERSION = '5.0.0';
export const RECOMMENDATION_SCORING_VERSION = '5.0.0';
export const RECOMMENDATION_CACHE_SCHEMA_VERSION = 3;

export type RecommendationConfig = {
  cacheTtlMs: number;
  attributionWindowMs: number;
  feedback: {
    notInterestedPenalty: number;
    lessLikeThisPenalty: number;
    alreadyPlayedPenalty: number;
    moreLikeThisBonus: number;
    maxMetadataPenalty: number;
  };
  exposure: {
    fatigueAfter: number;
    penaltyPerExposure: number;
    maxPenalty: number;
  };
  exploration: {
    minScore: number;
    maxDefaultShare: number;
    maxExploratoryShare: number;
    scorePenalty: number;
  };
};

export const recommendationConfig: RecommendationConfig = {
  cacheTtlMs: 24 * 60 * 60 * 1000,
  attributionWindowMs: 90 * 24 * 60 * 60 * 1000,
  feedback: {
    notInterestedPenalty: 14,
    lessLikeThisPenalty: 22,
    alreadyPlayedPenalty: 40,
    moreLikeThisBonus: 10,
    maxMetadataPenalty: 24,
  },
  exposure: {
    fatigueAfter: 3,
    penaltyPerExposure: 2,
    maxPenalty: 8,
  },
  exploration: {
    minScore: 14,
    maxDefaultShare: 1,
    maxExploratoryShare: 2,
    scorePenalty: 6,
  },
} as const;
