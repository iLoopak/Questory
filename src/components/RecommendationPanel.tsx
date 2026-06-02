import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import type { PlatformQueueEntry } from '../lib/platformQueueStorage';
import {
  availableTimeOptions,
  getRecommendations,
  moodOptions,
  type AvailableTime,
  type RecommendationMood,
  type RecommendationPreferences,
} from '../lib/recommendationEngine';
import type { ReviewSource } from '../lib/reviewModeStorage';
import type { Game, GamePlatform } from '../types/game';
import { gamePlatforms } from '../types/game';
import { CollectionToolbar } from './CollectionToolbar';

type RecommendationPanelProps = {
  games: Game[];
  queueEntries: PlatformQueueEntry[];
  onOpenDetails: (gameId: string) => void;
  onStartReview: (source: ReviewSource) => void;
  onStatusChange: (gameId: string, status: 'Playing') => void;
};

const anyPlatform = 'Any';

export function RecommendationPanel({ games, queueEntries, onOpenDetails, onStartReview, onStatusChange }: RecommendationPanelProps) {
  const [availableTime, setAvailableTime] = useState<AvailableTime>('30 min');
  const [mood, setMood] = useState<RecommendationMood>('comfort');
  const [preferredPlatform, setPreferredPlatform] = useState<GamePlatform | typeof anyPlatform>(anyPlatform);
  const [includeFinishedGames, setIncludeFinishedGames] = useState(false);
  const [includeWishlist, setIncludeWishlist] = useState(false);
  const [recommendFromQueueOnly, setRecommendFromQueueOnly] = useState(false);
  const [recommendNextGame, setRecommendNextGame] = useState(false);
  const [rerollIndex, setRerollIndex] = useState(0);
  const [recommendationSearchTerm, setRecommendationSearchTerm] = useState('');
  const queuedGameIds = useMemo(() => new Set(queueEntries.map((entry) => entry.gameId)), [queueEntries]);
  const platformOptions = useMemo(() => {
    return Array.from(new Set([...gamePlatforms, ...games.map((game) => game.platform)])).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const preferences: RecommendationPreferences = {
    availableTime,
    includeFinishedGames,
    includeWishlist,
    mood,
    preferredPlatform,
  };

  const recommendationGames = useMemo(() => {
    if (recommendNextGame) {
      const nextEntry = [...queueEntries].sort((first, second) => first.queuePosition - second.queuePosition)[0];
      const nextGame = nextEntry ? games.find((game) => game.id === nextEntry.gameId) : null;
      return nextGame ? [nextGame] : [];
    }

    const sourceGames = recommendFromQueueOnly ? games.filter((game) => queuedGameIds.has(game.id)) : games;
    const normalizedSearch = recommendationSearchTerm.trim().toLowerCase();

    return sourceGames.filter((game) =>
      normalizedSearch ? `${game.title} ${game.platform} ${game.status}`.toLowerCase().includes(normalizedSearch) : true,
    );
  }, [games, queueEntries, queuedGameIds, recommendFromQueueOnly, recommendNextGame, recommendationSearchTerm]);

  const recommendations = useMemo(() => getRecommendations(recommendationGames, preferences), [recommendationGames, preferences]);
  const recommendation = recommendations.length > 0 ? recommendations[rerollIndex % recommendations.length] : null;

  function updatePreference(update: () => void) {
    update();
    setRerollIndex(0);
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-ink-900/70 lg:h-[calc(100vh-74px)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-white/10 bg-ink-950/70 p-2 sm:p-3">
          <CollectionToolbar
            title="Recommendation"
            summary={`${recommendations.length} matches`}
            searchValue={recommendationSearchTerm}
            searchPlaceholder="Search pool"
            onSearchChange={setRecommendationSearchTerm}
            selects={[
              {
                label: 'Status',
                value: availableTime,
                options: availableTimeOptions,
                onChange: (value) => updatePreference(() => setAvailableTime(value as AvailableTime)),
              },
              {
                label: 'Platform',
                value: preferredPlatform,
                options: [anyPlatform, ...platformOptions],
                onChange: (value) => updatePreference(() => setPreferredPlatform(value as GamePlatform | typeof anyPlatform)),
              },
            ]}
            moreFiltersActiveCount={[includeFinishedGames, includeWishlist, recommendFromQueueOnly, recommendNextGame].filter(Boolean).length}
            actionMenu={
              <>
                <SegmentedControl
                  label="Mood"
                  options={moodOptions}
                  value={mood}
                  onChange={(value) => updatePreference(() => setMood(value as RecommendationMood))}
                />
                <button
                  className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20"
                  onClick={() => onStartReview(includeWishlist ? 'wishlist' : 'backlog')}
                  type="button"
                >
                  Review this pool
                </button>
                <details className="rounded-md border border-white/10 bg-ink-900 p-2">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-300">More Filters</summary>
                  <div className="mt-3 grid gap-2">
                    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
                      <input checked={includeFinishedGames} className="h-4 w-4 accent-mint" onChange={(event) => updatePreference(() => setIncludeFinishedGames(event.target.checked))} type="checkbox" />
                      Finished
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
                      <input checked={includeWishlist} className="h-4 w-4 accent-mint" onChange={(event) => updatePreference(() => setIncludeWishlist(event.target.checked))} type="checkbox" />
                      Wishlist
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
                      <input checked={recommendFromQueueOnly} className="h-4 w-4 accent-mint" onChange={(event) => updatePreference(() => setRecommendFromQueueOnly(event.target.checked))} type="checkbox" />
                      Queue only
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
                      <input checked={recommendNextGame} className="h-4 w-4 accent-mint" onChange={(event) => updatePreference(() => setRecommendNextGame(event.target.checked))} type="checkbox" />
                      Next queued
                    </label>
                  </div>
                </details>
              </>
            }
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
          {recommendation ? (
            <RecommendationCard
              key={recommendation.game.id}
              confidence={recommendation.confidence}
              game={recommendation.game}
              onMarkPlaying={() => onStatusChange(recommendation.game.id, 'Playing')}
              onOpenDetails={() => onOpenDetails(recommendation.game.id)}
              onReroll={() => setRerollIndex((currentIndex) => currentIndex + 1)}
              reasons={recommendation.reasons}
            />
          ) : (
            <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-white/15 bg-ink-950/50 p-4 text-center">
              <div>
                <h3 className="text-lg font-semibold text-white">No recommendation available</h3>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type RecommendationCardProps = {
  confidence: number;
  game: Game;
  onMarkPlaying: () => void;
  onOpenDetails: () => void;
  onReroll: () => void;
  reasons: string[];
};

function RecommendationCard({
  confidence,
  game,
  onMarkPlaying,
  onOpenDetails,
  onReroll,
  reasons,
}: RecommendationCardProps) {
  const coverSources = getCoverSources(game);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [game.id]);

  return (
    <article className="grid gap-3 rounded-lg border border-white/10 bg-ink-800 p-3 shadow-panel xl:grid-cols-[180px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-ink-700">
        <div className="aspect-[2/3]">
          {activeCoverSource ? (
            <div className="relative h-full">
              {!isCoverLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
              <img
                alt=""
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  isCoverLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                decoding="async"
                loading="lazy"
                onError={() => {
                  setIsCoverLoaded(false);
                  setCoverSourceIndex((currentIndex) => currentIndex + 1);
                }}
                onLoad={() => setIsCoverLoaded(true)}
                src={activeCoverSource}
              />
            </div>
          ) : (
            <div className="grid h-full place-items-center bg-ink-700 px-4 text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-md border border-white/10 bg-ink-900 text-2xl font-semibold text-mint">
                  {game.title.slice(0, 1).toUpperCase()}
                </div>
                <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">No cover</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-white">{game.title}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{game.platform}</Badge>
            {game.collectionType === 'wishlist' ? <Badge>Wishlist</Badge> : null}
            <Badge>{game.status}</Badge>
          </div>
        </div>

        <section className="rounded-md border border-white/10 bg-ink-950 p-3">
          <h4 className="text-sm font-semibold text-white">Why this?</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <span key={reason} className="rounded-full bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
                {reason}
              </span>
            ))}
          </div>
        </section>

        <div className="mt-auto flex flex-wrap gap-2">
          <button
            className="h-10 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            onClick={onReroll}
            type="button"
          >
            Reroll
          </button>
          <button
            className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
            onClick={onMarkPlaying}
            type="button"
          >
            Play now
          </button>
          <button
            className="h-10 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            onClick={onOpenDetails}
            type="button"
          >
            Details
          </button>
        </div>
      </div>
    </article>
  );
}

type SegmentedControlProps = {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
};

function SegmentedControl({ label, onChange, options, value }: SegmentedControlProps) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 flex gap-1 overflow-x-auto rounded-md border border-white/10 bg-ink-900 p-1">
        {options.map((option) => (
          <button
            key={option}
            className={`h-8 shrink-0 rounded px-2 text-xs font-medium transition ${
              option === value ? 'bg-white text-ink-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
            onClick={() => onChange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">{children}</span>;
}

function getCoverSources(game: Game) {
  return getGameCoverSources(game);
}
