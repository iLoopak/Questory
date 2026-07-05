import { useEffect, useState } from 'react';
import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../lib/discovery';
import { PersonalRecommendationsSection } from './discovery/PersonalRecommendationsSection';
import { DiscoveryGameCard, DiscoveryGameCardSkeleton } from './discovery/DiscoveryGameCard';
import {
  fetchTrendingGames,
  fetchHiddenGems,
  fetchRecentlyReleasedGames,
} from '../services/discoverFeedsService';

type DiscoverPanelProps = {
  games: Game[];
  discoveryInboxRawgIds: Set<number>;
  onAddToInbox: (game: DiscoveryGame, reason: string) => void;
};

const SKELETON_COUNT = 5;

type FeedSection = {
  id: string;
  title: string;
  fetch: (userGames: Game[], inboxRawgIds: Set<number>) => Promise<DiscoveryCandidate[]>;
};

const FEED_SECTIONS: FeedSection[] = [
  { id: 'trending', title: 'Trending', fetch: fetchTrendingGames },
  { id: 'hidden-gems', title: 'Hidden Gems', fetch: fetchHiddenGems },
  { id: 'recently-released', title: 'Recently Released', fetch: fetchRecentlyReleasedGames },
];

type DiscoverFeedProps = {
  section: FeedSection;
  userGames: Game[];
  inboxRawgIds: Set<number>;
  onAddToInbox: (game: DiscoveryGame, reason: string) => void;
};

function DiscoverFeed({ section, userGames, inboxRawgIds, onAddToInbox }: DiscoverFeedProps) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    section
      .fetch(userGames, inboxRawgIds)
      .then((result) => {
        if (!cancelled) setCandidates(result);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
    // section is a module-level constant — stable identity.
    // userGames / inboxRawgIds re-stamp library and inbox status; RAWG data is served
    // from the module-level cache so re-fetching is fast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, userGames, inboxRawgIds]);

  if (candidates !== null && candidates.length === 0) return null;

  return (
    <section aria-label={section.title} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">{section.title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {candidates === null
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => <DiscoveryGameCardSkeleton key={i} />)
          : candidates.map((c) => (
              <DiscoveryGameCard key={c.game.rawgId} candidate={c} onAddToInbox={onAddToInbox} />
            ))}
      </div>
    </section>
  );
}

export function DiscoverPanel({ games, discoveryInboxRawgIds, onAddToInbox }: DiscoverPanelProps) {
  return (
    <div className="flex flex-col gap-6 px-4 pt-4 pb-24">
      <div>
        <h1 className="text-xl font-semibold text-white">Discover</h1>
        <p className="mt-0.5 text-sm text-slate-500">Great games you haven't played yet</p>
      </div>

      <PersonalRecommendationsSection
        userGames={games}
        inboxRawgIds={discoveryInboxRawgIds}
        onSelectGame={() => {}}
        onAddToInbox={onAddToInbox}
      />

      {FEED_SECTIONS.map((section) => (
        <DiscoverFeed
          key={section.id}
          section={section}
          userGames={games}
          inboxRawgIds={discoveryInboxRawgIds}
          onAddToInbox={onAddToInbox}
        />
      ))}
    </div>
  );
}
