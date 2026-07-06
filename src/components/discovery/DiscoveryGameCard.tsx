import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { Icon } from '../Icon';
import { MetacriticBadge } from '../MetacriticBadge';
import { useI18n } from '../../i18n';

// ---------------------------------------------------------------------------
// DiscoveryCompactCard — matches WishlistDealCard proportions (w-36, no
// action button). Used in the Home sidebar recommendation section.
// ---------------------------------------------------------------------------

type CompactProps = {
  candidate: DiscoveryCandidate;
  onClick: (game: DiscoveryGame, reason: string) => void;
};

export function DiscoveryCompactCard({ candidate, onClick }: CompactProps) {
  const { t } = useI18n();
  const { game, libraryStatus, inboxStatus, reason } = candidate;

  const statusBadge =
    libraryStatus === 'library' ? (
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1 rounded-full bg-mint/90 px-1.5 py-0.5 text-xs font-bold text-ink-950">
        {t('discovery.inLibrary')}
      </div>
    ) : libraryStatus === 'wishlist' ? (
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1 rounded-full bg-purple-400/90 px-1.5 py-0.5 text-xs font-bold text-purple-950">
        {t('discovery.wishlisted')}
      </div>
    ) : inboxStatus ? (
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-xs font-bold text-amber-950">
        {t('discovery.inInbox')}
      </div>
    ) : null;

  return (
    <button
      className="w-36 shrink-0 overflow-hidden rounded-xl border border-skyglass/15 bg-ink-950/70 text-left transition hover:border-mint/35"
      onClick={() => onClick(game, reason ?? '')}
      type="button"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-ink-800">
        {game.coverUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            loading="lazy"
            src={game.coverUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon name="gamepad-2" size={24} className="text-slate-700" />
          </div>
        )}
        {game.metacritic ? <MetacriticBadge score={game.metacritic} variant="chip" /> : null}
        {statusBadge}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-semibold text-white">{game.title}</p>
        {reason ? (
          <p className="mt-0.5 truncate text-xs text-slate-500">{reason}</p>
        ) : null}
      </div>
    </button>
  );
}

export function DiscoveryCompactCardSkeleton() {
  return (
    <div className="w-36 shrink-0 overflow-hidden rounded-xl border border-skyglass/15 bg-ink-950/70">
      <div className="aspect-[3/4] w-full animate-pulse bg-ink-800" />
      <div className="space-y-1.5 p-2">
        <div className="h-3 w-full animate-pulse rounded bg-ink-800" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-ink-800" />
        <div className="mt-1 h-3 w-1/2 animate-pulse rounded bg-ink-800" />
      </div>
    </div>
  );
}
