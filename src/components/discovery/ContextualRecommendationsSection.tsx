import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import { discoveryCandidateToGame, type DiscoveryCandidate, type DiscoveryGame } from '../../lib/discovery';
import { profileFingerprint } from '../../lib/userProfile';
import { fetchContextualRecommendationsResult } from '../../services/contextualRecommendationsService';
import { ProviderStatusNotice } from './ProviderStatusNotice';
import type { ProviderStatusSummary } from '../../lib/providerResult';
import { GameCard } from '../GameCard';
import { RatingBadgeStack } from '../RatingBadgeStack';
import { useI18n } from '../../i18n';

const SKELETON_COUNT = 5;

type Props = {
  game: Game;
  userGames: Game[];
  inboxRawgIds: Set<number>;
  onSelectGame: (game: DiscoveryGame) => void;
  onAddToInbox?: (game: DiscoveryGame, reason: string) => void;
  onOpenPreview?: (candidate: DiscoveryCandidate) => void;
  /** Section heading — defaults to the Game Hub's "Because You Liked This". */
  title?: string;
};

function CarouselSkeleton() {
  return (
    <div className="w-64 shrink-0 overflow-hidden rounded-lg border border-skyglass/15 bg-ink-950/50 min-h-[260px] sm:min-h-[292px]">
      <div className="aspect-[16/9] max-h-32 animate-pulse bg-ink-800 sm:max-h-36" />
      <div className="space-y-2 p-3 sm:p-3.5">
        <div className="h-5 w-3/4 animate-pulse rounded bg-ink-800" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-ink-800" />
      </div>
    </div>
  );
}

export function ContextualRecommendationsSection({
  game,
  userGames,
  inboxRawgIds,
  onSelectGame,
  onAddToInbox,
  onOpenPreview,
  title,
}: Props) {
  const { t } = useI18n();
  const sectionTitle = title ?? t('recommendations.becauseYouLiked');
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);
  // AS-10: a RAWG failure used to arrive here as an empty list, and the section simply disappeared.
  // Now it arrives as a failure, and the user gets a line of explanation and a Retry.
  const [provider, setProvider] = useState<ProviderStatusSummary | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const fetchKeyRef = useRef<string | null>(null);

  const fetchKey = game.rawgId
    ? `${game.rawgId}:${profileFingerprint(userGames)}`
    : null;

  useEffect(() => {
    if (!fetchKey) {
      setCandidates([]);
      return;
    }

    if (fetchKey === fetchKeyRef.current && candidates !== null && retryToken === 0) return;
    fetchKeyRef.current = fetchKey;

    let cancelled = false;
    if (candidates !== null) setCandidates(null);

    fetchContextualRecommendationsResult(game, userGames, inboxRawgIds).then((result) => {
      if (cancelled) return;
      setCandidates(result.candidates);
      setProvider(result.provider);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, retryToken]);

  useEffect(() => {
    if (candidates === null || !fetchKey) return;
    let cancelled = false;
    fetchContextualRecommendationsResult(game, userGames, inboxRawgIds).then((result) => {
      if (cancelled) return;
      setCandidates(result.candidates);
      setProvider(result.provider);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userGames, inboxRawgIds]);

  const adaptedGames = useMemo(
    () => (candidates ?? []).map((c) => discoveryCandidateToGame(c, userGames, 'similar')),
    [candidates, userGames],
  );

  if (!game.rawgId) return null;

  // RAWG failed outright: say so and offer a Retry instead of vanishing, which is what an empty list
  // used to cause. A provider that genuinely knows of no similar games still hides the section.
  if (provider?.status === 'failed' && candidates !== null && candidates.length === 0) {
    return (
      <section aria-label={sectionTitle} className="space-y-3">
        <h3 className="text-sm font-semibold text-white">{sectionTitle}</h3>
        <ProviderStatusNotice provider={provider} onRetry={() => setRetryToken((token) => token + 1)} />
      </section>
    );
  }

  if (candidates !== null && candidates.length === 0) return null;

  return (
    <section aria-label={sectionTitle} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">{sectionTitle}</h3>
      <ProviderStatusNotice provider={provider} onRetry={() => setRetryToken((token) => token + 1)} />
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {candidates === null ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => <CarouselSkeleton key={i} />)
        ) : (
          candidates.map((candidate, i) => {
            const adaptedGame = adaptedGames[i];
            if (!adaptedGame) return null;

            const isLibrary = candidate.libraryStatus === 'library';
            const canAddToInbox = !candidate.libraryStatus && !candidate.inboxStatus && onAddToInbox != null;
            const metacritic = candidate.game.metacritic;

            return (
              <div key={candidate.game.rawgId} className="w-64 shrink-0">
                <GameCard
                  game={adaptedGame}
                  suppressWantToPlayStatus={!isLibrary}
                  detailsLabel={isLibrary ? undefined : t('action.preview')}
                  hideActionMenu
                  onOpenDetails={
                    isLibrary
                      ? () => onSelectGame(candidate.game)
                      : () => onOpenPreview?.(candidate)
                  }
                  primaryAction={
                    canAddToInbox
                      ? {
                          label: t('action.reviewLater'),
                          onClick: () => onAddToInbox!(candidate.game, candidate.reason ?? ''),
                        }
                      : undefined
                  }
                  coverBadgeTopRight={
                    <RatingBadgeStack
                      className="absolute right-3 top-3 z-10 items-end"
                      game={adaptedGame}
                      metacriticScore={metacritic}
                    />
                  }
                  suppressRawgRatingBadge
                  discoveryContext={candidate.reason}
                />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
