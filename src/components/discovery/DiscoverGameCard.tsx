import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getPreferredArtworkSources } from '../../lib/gameCoverImages';
import { getArtworkSet } from '../../lib/gameSelectors';
import { discoveryGameToGame, type DiscoveryGame } from '../../lib/discovery';
import { useCoverImageLoaded } from '../../hooks/useCoverImageLoaded';
import { PlatformIdentityBadge } from '../PlatformIdentityBadge';
import { RatingBadgeStack } from '../RatingBadgeStack';
import { Icon } from '../Icon';

type DiscoverCardAction = {
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
};

type DiscoverGameCardProps = {
  game: DiscoveryGame;
  title?: string;
  context?: string;
  contextTone?: 'muted' | 'accent' | 'status';
  meta?: ReactNode;
  primaryAction: DiscoverCardAction;
  secondaryAction?: DiscoverCardAction;
  overflowActions?: DiscoverCardAction[];
  platformLabel?: string;
  variant?: 'recommendation' | 'upcoming';
};

export function DiscoverGameCard({
  game,
  title = game.title,
  context,
  contextTone = 'muted',
  meta,
  primaryAction,
  secondaryAction,
  overflowActions = [],
  platformLabel,
  variant = 'recommendation',
}: DiscoverGameCardProps) {
  const renderGame = useMemo(() => discoveryGameToGame(game, 'discover-card'), [game]);
  const artworkSet = useMemo(() => getArtworkSet(renderGame), [renderGame]);
  const coverSources = useMemo(() => getPreferredArtworkSources(renderGame, 'portrait'), [renderGame]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];
  const { imgRef, isLoaded, markLoaded, markBroken } = useCoverImageLoaded(activeCoverSource);
  const hasOverflow = overflowActions.length > 0;

  return (
    <article className="qs-game-card qs-glass relative flex h-full min-h-[292px] min-w-0 flex-col overflow-hidden rounded-lg border transition hover:border-mint/35 hover:shadow-glow focus-within:border-mint/45 focus-within:shadow-glow" data-discover-card-variant={variant}>
      <div className="qs-game-card-artwork relative aspect-[16/9] max-h-36 shrink-0 overflow-hidden bg-ink-700" data-artwork-source={artworkSet.source}>
        {activeCoverSource ? (
          <>
            {!isLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
            <img
              ref={imgRef}
              alt=""
              className={`h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              decoding="async"
              loading="lazy"
              onError={() => {
                markBroken();
                setCoverSourceIndex((current) => current + 1);
              }}
              onLoad={markLoaded}
              src={activeCoverSource}
            />
          </>
        ) : (
          <div className="grid h-full place-items-center bg-ink-700 px-4 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-mint/20 bg-ink-900 text-xl font-semibold text-mint shadow-glow">
                {title.slice(0, 1).toUpperCase()}
              </div>
              <div className="mt-3 text-xs font-medium uppercase tracking-caps text-slate-500">No cover</div>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
          <PlatformIdentityBadge className="max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold" platform={platformLabel ?? game.platforms[0] ?? 'Unknown'} />
        </div>
        <RatingBadgeStack className="absolute right-3 top-3 z-10 items-end" game={renderGame} metacriticScore={game.metacritic} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3 sm:gap-3 sm:p-3.5">
        <div className="min-w-0">
          {meta ? <div className="mb-1.5">{meta}</div> : null}
          <h3 className="line-clamp-2 min-h-[3rem] text-base font-semibold leading-6 text-white sm:text-lg" title={title}>{title}</h3>
          <p className={`mt-1 line-clamp-2 min-h-[2rem] text-xs leading-snug ${contextTone === 'accent' ? 'font-medium text-mint' : contextTone === 'status' ? 'font-medium text-amber-300' : 'italic text-slate-500'}`}>
            {context ?? 'Recommended for you'}
          </p>
        </div>

        <div className="mt-auto border-t border-skyglass/15 pt-2.5 sm:pt-3">
          <div className="flex min-h-10 items-center gap-2">
            <button className="h-10 flex-1 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow focus-visible:bg-mint focus-visible:text-ink-950 focus-visible:outline-none" disabled={primaryAction.disabled} onClick={primaryAction.onClick} type="button">
              {primaryAction.label}
            </button>
            {secondaryAction ? <CardActionButton action={secondaryAction} /> : null}
            {hasOverflow ? (
              <div className="relative">
                <button aria-label="More discovery actions" aria-expanded={isOverflowOpen} className="grid h-10 w-10 place-items-center rounded-md border border-skyglass/20 bg-skyglass/10 text-slate-300 transition hover:border-mint/35 hover:text-mint focus-visible:border-mint/50 focus-visible:outline-none" onClick={() => setIsOverflowOpen((current) => !current)} type="button">
                  <Icon name="more-horizontal" size={18} />
                </button>
                {isOverflowOpen ? (
                  <div className="absolute bottom-11 right-0 z-20 min-w-32 overflow-hidden rounded-lg border border-skyglass/20 bg-ink-950 py-1 shadow-glow">
                    {overflowActions.map((action) => (
                      <button className={`block w-full px-3 py-2 text-left text-xs font-semibold transition ${action.tone === 'danger' ? 'text-red-300 hover:bg-red-400/10' : 'text-slate-200 hover:bg-skyglass/10'}`} disabled={action.disabled} key={action.label} onClick={() => { setIsOverflowOpen(false); action.onClick(); }} type="button">{action.label}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function CardActionButton({ action }: { action: DiscoverCardAction }) {
  return (
    <button className={`h-10 rounded-md border px-3 text-sm font-medium transition focus-visible:outline-none ${action.tone === 'danger' ? 'border-skyglass/15 bg-ink-800/80 text-slate-400 hover:border-red-400/40 hover:text-red-300 focus-visible:border-red-400/60' : 'border-skyglass/20 bg-skyglass/10 text-slate-200 hover:border-mint/35 hover:text-mint focus-visible:border-mint/50'}`} disabled={action.disabled} onClick={action.onClick} type="button">
      {action.label}
    </button>
  );
}
