import { getPreferredArtworkSources } from '../../lib/gameCoverImages';
import { Icon } from '../Icon';
import { PlatformIdentityBadge } from '../PlatformIdentityBadge';
import type { PlatformQueueEntry, PlatformQueueState } from '../../lib/platformQueueStorage';
import type { Game } from '../../types/game';
import type { TFunction } from '../../i18n';

export function NextAdventureCard({
  entry,
  game,
  queueState,
  onPlay,
  onOpenPlan,
  t,
}: {
  entry: PlatformQueueEntry;
  game: Game;
  queueState: PlatformQueueState;
  onPlay: () => void;
  onOpenPlan: () => void;
  t: TFunction;
}) {
  const coverSource = getPreferredArtworkSources(game, 'background')[0];

  return (
    // Outer card is a div, not a button, because the inner "Play today" CTA is a real
    // button. Nested <button> inside <button> is invalid HTML and triggers a React warning.
    <div
      className="qs-home-next-adventure-card relative w-full cursor-pointer overflow-hidden rounded-xl border border-skyglass/12 bg-ink-950/55 text-left transition hover:border-skyglass/30 hover:bg-ink-950/75 focus-visible:border-mint/45 focus-visible:outline-none"
      data-home-focus="true"
      role="button"
      tabIndex={0}
      onClick={onOpenPlan}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenPlan();
        }
      }}
    >
      {coverSource ? (
        <div className="absolute inset-0">
          <img
            alt=""
            className="h-full w-full object-cover opacity-10"
            decoding="async"
            loading="lazy"
            src={coverSource}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/90 to-transparent" />
        </div>
      ) : null}
      <div className="relative flex h-full flex-col gap-2.5 p-3">
        <PlatformIdentityBadge
          className="w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold"
          platform={entry.targetPlatform}
          queueState={queueState}
        />
        <div>
          <div className="qs-home-next-candidate-label text-xs text-slate-500">{t('home.nextCandidate')}</div>
          <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-white">{game.title}</h3>
        </div>
        <div className="mt-auto">
          <button
            className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs font-semibold text-mint transition hover:bg-mint/20"
            data-home-focus="true"
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            type="button"
          >
            <Icon name="play-circle" size={16} strokeWidth={2.5} />
            {t('home.playToday')}
          </button>
        </div>
      </div>
    </div>
  );
}
