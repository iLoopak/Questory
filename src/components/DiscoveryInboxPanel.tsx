import type { DiscoveryInboxItem } from '../lib/discoveryInboxStorage';
import { Icon } from './Icon';

function metacriticColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// Individual inbox card
// ---------------------------------------------------------------------------

type CardProps = {
  item: DiscoveryInboxItem;
  onAddToLibrary: (item: DiscoveryInboxItem) => void;
  onAddToWishlist: (item: DiscoveryInboxItem) => void;
  onAddToPlans: (item: DiscoveryInboxItem) => void;
  onIgnore: (item: DiscoveryInboxItem) => void;
};

function DiscoveryInboxCard({ item, onAddToLibrary, onAddToWishlist, onAddToPlans, onIgnore }: CardProps) {
  const { game } = item;
  const year = game.released?.match(/^(\d{4})/)?.[1] ?? null;
  const displayedGenres = game.genres.slice(0, 3);

  return (
    <div className="flex gap-3 rounded-2xl border border-white/8 bg-ink-900/60 p-3">
      {/* Cover */}
      <div className="w-16 shrink-0 overflow-hidden rounded-xl bg-ink-800">
        <div className="aspect-[2/3]">
          {game.coverUrl ? (
            <img
              src={game.coverUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Icon name="gamepad-2" size={22} className="text-slate-700" />
            </div>
          )}
        </div>
      </div>

      {/* Info + actions */}
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold leading-tight text-white">{game.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            {year && <span>{year}</span>}
            {game.metacritic ? (
              <span className={`font-semibold ${metacriticColor(game.metacritic)}`}>
                MC {game.metacritic}
              </span>
            ) : null}
            {game.hasSteamVersion ? (
              <span className="flex items-center gap-0.5">
                <Icon name="steam" size={10} className="text-slate-600" />
                <span>Steam</span>
              </span>
            ) : null}
          </div>
        </div>

        {displayedGenres.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {displayedGenres.map((g) => (
              <span
                key={g}
                className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-medium text-slate-500"
              >
                {g}
              </span>
            ))}
          </div>
        ) : null}

        {item.reason ? (
          <p className="text-[11px] italic leading-snug text-slate-600">{item.reason}</p>
        ) : null}

        {/* Triage actions */}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onAddToLibrary(item)}
            className="rounded-lg bg-mint/90 px-2.5 py-1 text-[11px] font-semibold text-ink-950 transition hover:bg-mint"
          >
            + Library
          </button>
          <button
            type="button"
            onClick={() => onAddToWishlist(item)}
            className="rounded-lg border border-white/12 bg-ink-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-ink-700 hover:text-white"
          >
            + Wishlist
          </button>
          <button
            type="button"
            onClick={() => onAddToPlans(item)}
            className="rounded-lg border border-white/12 bg-ink-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-ink-700 hover:text-white"
          >
            Plans
          </button>
          <button
            type="button"
            onClick={() => onIgnore(item)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:text-slate-400"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="rounded-full border border-white/8 bg-ink-900 p-4">
        <Icon name="compass" size={32} className="text-slate-600" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-white">Discovery Inbox is clear</p>
        <p className="text-xs leading-relaxed text-slate-500">
          Browse recommendations to collect games worth a closer look.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type Props = {
  items: DiscoveryInboxItem[];
  onAddToLibrary: (item: DiscoveryInboxItem) => void;
  onAddToWishlist: (item: DiscoveryInboxItem) => void;
  onAddToPlans: (item: DiscoveryInboxItem) => void;
  onIgnore: (item: DiscoveryInboxItem) => void;
};

export function DiscoveryInboxPanel({ items, onAddToLibrary, onAddToWishlist, onAddToPlans, onIgnore }: Props) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="compass" size={18} className="text-amber-400" strokeWidth={2} />
          <h2 className="text-base font-bold text-white">Discovery Inbox</h2>
        </div>
        {items.length > 0 ? (
          <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
            {items.length} waiting
          </span>
        ) : null}
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <EmptyInbox />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <DiscoveryInboxCard
              key={item.id}
              item={item}
              onAddToLibrary={onAddToLibrary}
              onAddToWishlist={onAddToWishlist}
              onAddToPlans={onAddToPlans}
              onIgnore={onIgnore}
            />
          ))}
        </div>
      )}
    </div>
  );
}
