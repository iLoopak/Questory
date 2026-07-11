import type { DiscoveryCandidate } from './discovery';
import type { FinalSelectionDiagnostics } from '../services/personalRecommendationsService';

export type RecommendationQualitySummary = {
  coverage: {
    resultCount: number;
    fallbackCount: number;
    personalizedCount: number;
    sourceCoverage: number;
    tasteClusterCoverage: number;
  };
  diversity: {
    maxGenreShare: number;
    maxSourceShare: number;
    nearDuplicateRate: number;
  };
  confidence: {
    tier0Count: number;
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    minScore: number | null;
    medianScore: number | null;
    maxScore: number | null;
  };
};

function maxShare(counts: Record<string, number>, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, ...Object.values(counts)) / total;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function summarizeRecommendationQuality(candidates: DiscoveryCandidate[], finalSelection?: FinalSelectionDiagnostics): RecommendationQualitySummary {
  const resultCount = candidates.length;
  const fallbackCount = candidates.filter((candidate) => candidate.source === 'broad-discovery' || candidate.source === 'trending').length;
  const scores = candidates.map((candidate) => candidate.score).filter((score) => Number.isFinite(score));
  return {
    coverage: {
      resultCount,
      fallbackCount,
      personalizedCount: resultCount - fallbackCount,
      sourceCoverage: new Set(candidates.map((candidate) => candidate.source ?? 'unknown')).size,
      tasteClusterCoverage: Object.keys(finalSelection?.tasteClusterCountsAfter ?? {}).length,
    },
    diversity: {
      maxGenreShare: maxShare(finalSelection?.primaryGenreCountsAfter ?? {}, resultCount),
      maxSourceShare: maxShare(finalSelection?.sourceCountsAfter ?? {}, resultCount),
      nearDuplicateRate: finalSelection?.beforeCount ? finalSelection.nearDuplicateSuppressions.length / finalSelection.beforeCount : 0,
    },
    confidence: {
      tier0Count: finalSelection?.fallbackTierCountsAfter['tier0-personalized'] ?? 0,
      tier1Count: finalSelection?.fallbackTierCountsAfter['tier1-taste-quality'] ?? 0,
      tier2Count: finalSelection?.fallbackTierCountsAfter['tier2-adjacent'] ?? 0,
      tier3Count: finalSelection?.fallbackTierCountsAfter['tier3-broad'] ?? 0,
      minScore: scores.length ? Math.min(...scores) : null,
      medianScore: median(scores),
      maxScore: scores.length ? Math.max(...scores) : null,
    },
  };
}
