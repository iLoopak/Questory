import { useEffect, useRef } from 'react';
import { formatDealPrice } from '../DealCoverBadges';
import { GameCoverImage } from '../GameCoverImage';
import { Icon } from '../Icon';
import { useBottomSheetDragToClose } from '../../hooks/useBottomSheetDragToClose';
import type { Game } from '../../types/game';
import { useI18n, type TFunction } from '../../i18n';
import { getWishlistDealInfo } from '../../lib/gameSelectors';

export function WishlistDealCard({
  game,
  onClick,
  t,
}: {
  game: Game;
  onClick: () => void;
  t: TFunction;
}) {
  const dealInfo = getWishlistDealInfo(game);
  const discount = typeof dealInfo.discount === 'number' ? `-${dealInfo.discount}%` : null;
  const price =
    typeof dealInfo.price === 'number' && dealInfo.currency
      ? formatDealPrice(dealInfo.price, dealInfo.currency)
      : null;

  return (
    <button
      className="w-36 shrink-0 overflow-hidden rounded-xl border border-skyglass/15 bg-ink-950/70 text-left transition hover:border-mint/35"
      data-home-focus="true"
      onClick={onClick}
      type="button"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-ink-800">
        <GameCoverImage className="h-full w-full object-cover" decoding="async" game={game} loading="lazy" />
        {discount ? (
          <div className="absolute left-1.5 top-1.5 rounded bg-mint/90 px-1.5 py-0.5 text-xs font-bold text-ink-950">
            {discount}
          </div>
        ) : null}
        {dealInfo.historicalLow?.isCurrent ? (
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-xs font-bold text-amber-950">
            <Icon name="trophy" size={9} strokeWidth={2.5} />
            {t('itad.historicalLow')}
          </div>
        ) : null}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-semibold text-white">{game.title}</p>
        {price ? <p className="mt-1 text-xs font-semibold text-mint">{price}</p> : null}
        {dealInfo.shop ? (
          <p className="mt-0.5 truncate text-xs text-slate-500">{dealInfo.shop}</p>
        ) : null}
      </div>
    </button>
  );
}

export function WishlistDealActionSheet({
  game,
  onClose,
  onOpenDetails,
}: {
  game: Game;
  onClose: () => void;
  onOpenDetails: (game: Game) => void;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { dragHandleProps, dragStyle } = useBottomSheetDragToClose({ panelRef, onClose });
  const dealInfo = getWishlistDealInfo(game);
  const discount = typeof dealInfo.discount === 'number' ? `-${dealInfo.discount}%` : null;
  const price =
    typeof dealInfo.price === 'number' && dealInfo.currency
      ? formatDealPrice(dealInfo.price, dealInfo.currency)
      : null;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Deal for ${game.title}`}
    >
      <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-skyglass/20 bg-ink-950 shadow-2xl"
        ref={panelRef}
        style={{ paddingBottom: 'max(1.25rem, var(--qs-safe-bottom))', ...dragStyle }}
      >
        <div className="qs-sheet-drag-region flex justify-center pb-2 pt-3" {...dragHandleProps}>
          <div className="qs-sheet-handle h-1.5 w-16 rounded-full bg-skyglass/35" title="Swipe down to dismiss" />
        </div>
        <div className="px-4 pb-2 pt-1">
          <div className="mb-5 flex gap-3.5">
            <div className="relative h-[72px] w-[52px] shrink-0 overflow-hidden rounded-xl border border-skyglass/15 bg-ink-800 shadow-panel">
              <GameCoverImage className="h-full w-full object-cover" game={game} />
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <h3 className="line-clamp-2 text-base font-bold leading-snug text-white">{game.title}</h3>
              {dealInfo.shop ? (
                <p className="mt-1 text-sm text-slate-400">{dealInfo.shop}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {discount ? (
                  <span className="rounded bg-mint/90 px-1.5 py-0.5 text-xs font-bold text-ink-950">{discount}</span>
                ) : null}
                {price ? <span className="text-sm font-semibold text-mint">{price}</span> : null}
                {dealInfo.historicalLow?.isCurrent ? (
                  <span className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                    <Icon name="trophy" size={10} strokeWidth={2.5} />
                    {t('itad.historicalLow')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {dealInfo.url ? (
            <a
              className="flex min-h-[3.5rem] w-full items-center justify-center gap-2.5 rounded-2xl bg-mint px-4 text-base font-bold text-ink-950 shadow-glow transition active:scale-[0.97] hover:bg-mint/90"
              href={dealInfo.url}
              rel="noreferrer"
              target="_blank"
              onClick={onClose}
            >
              🛒 {t('itad.openDeal')}
            </a>
          ) : null}

          <div className="mt-3.5 overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/60">
            <button
              className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition hover:bg-mint/[0.07] active:bg-mint/[0.10]"
              onClick={() => { onOpenDetails(game); onClose(); }}
              type="button"
            >
              <Icon name="external-link" size={18} strokeWidth={2} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-200">{t('home.openDetails')}</span>
              <Icon name="chevrons-right" size={14} strokeWidth={2} className="shrink-0 text-slate-500" />
            </button>
          </div>

          <button
            className="mt-3 min-h-11 w-full rounded-2xl text-sm text-slate-500 transition hover:text-slate-300"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
