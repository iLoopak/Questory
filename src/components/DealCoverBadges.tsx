import { useMemo } from 'react';
import { useI18n, type TFunction } from '../i18n';
import type { Game } from '../types/game';

type DealCoverBadgesProps = {
  game: Game;
  isInteractive?: boolean;
  variant?: 'grid' | 'shelf' | 'compact';
};

export function DealCoverBadges({ game, isInteractive = true, variant = 'grid' }: DealCoverBadgesProps) {
  const { t } = useI18n();

  const dealSummary = useMemo(() => getDealSummary(game, t), [game, t]);

  if (!dealSummary) {
    return null;
  }

  const isCompact = variant === 'compact';
  const historicalLowLabel = isCompact ? '🏆 Low' : `🏆 ${t('itad.historicalLow')}`;
  const containerClass = isCompact
    ? 'absolute inset-x-1 bottom-1 z-10 flex max-w-[calc(100%-0.5rem)] flex-col items-start gap-0.5'
    : 'absolute bottom-3 right-3 z-10 flex max-w-[58%] flex-col items-end gap-1.5 sm:max-w-[52%]';
  const badgeClass = isCompact
    ? 'max-w-full truncate rounded-full border border-white/20 bg-ink-950/88 px-1.5 py-0.5 text-[0.55rem] font-extrabold leading-none text-white shadow-panel backdrop-blur-md'
    : 'max-w-full truncate rounded-full border border-white/20 bg-ink-950/88 px-2.5 py-1 text-xs font-extrabold leading-none text-white shadow-panel backdrop-blur-md';
  const priceBadgeClass = `${badgeClass} border-mint/35 bg-mint/20 text-mint`;
  const discountBadgeClass = `${badgeClass} border-amber-300/45 bg-amber-300/95 text-ink-950`;
  const historicalBadgeClass = `${badgeClass} border-fuchsia-200/45 bg-fuchsia-500/30 text-fuchsia-50`;

  const content = (
    <>
      <span className={priceBadgeClass}>💰 {dealSummary.price}</span>
      {dealSummary.discount ? <span className={discountBadgeClass}>{dealSummary.discount}</span> : null}
      {game.itadIsHistoricalLow ? <span className={historicalBadgeClass}>{historicalLowLabel}</span> : null}
    </>
  );

  if (isInteractive && game.itadCurrentBestUrl) {
    return (
      <a
        aria-label={dealSummary.accessibleLabel}
        className={containerClass}
        data-card-action
        href={game.itadCurrentBestUrl}
        onClick={(event) => event.stopPropagation()}
        rel="noreferrer"
        target="_blank"
        title={dealSummary.tooltip}
      >
        {content}
      </a>
    );
  }

  return (
    <span aria-label={dealSummary.accessibleLabel} className={containerClass} title={dealSummary.tooltip}>
      {content}
    </span>
  );
}

function getDealSummary(game: Game, t: TFunction) {
  if (game.collectionType !== 'wishlist' || typeof game.itadCurrentBestPrice !== 'number' || !game.itadCurrentBestCurrency) {
    return null;
  }

  const price = formatDealPrice(game.itadCurrentBestPrice, game.itadCurrentBestCurrency);
  const discount = typeof game.itadDiscountPercent === 'number' && game.itadDiscountPercent > 0 ? `-${game.itadDiscountPercent}%` : null;
  const historicalLow = typeof game.itadHistoricalLowPrice === 'number' && game.itadHistoricalLowCurrency
    ? formatDealPrice(game.itadHistoricalLowPrice, game.itadHistoricalLowCurrency)
    : undefined;
  const details = [
    `${t('itad.bestPrice')}: ${price}`,
    game.itadCurrentBestShop,
    discount,
    game.itadIsHistoricalLow ? t('itad.historicalLow') : undefined,
    historicalLow ? `${t('itad.historicalLow')}: ${historicalLow}` : undefined,
  ].filter(Boolean);

  return {
    accessibleLabel: details.join(', '),
    discount,
    price,
    tooltip: details.join(' • '),
  };
}

export function formatDealPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { currency, style: 'currency' }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
