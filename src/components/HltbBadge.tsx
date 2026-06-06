import { formatHltbBadge, hasHltbData } from '../lib/hltb';
import type { Game } from '../types/game';
import { useI18n } from '../i18n';

export function HltbBadge({ className = '', game, includeLabel = false }: { className?: string; game: Game; includeLabel?: boolean }) {
  const { t } = useI18n();

  if (!hasHltbData(game)) {
    return null;
  }

  const label = formatHltbBadge(game, { includeLabel }) ?? t('hltb.estimatedTime');

  return (
    <span
      className={`inline-flex items-center rounded-full border border-skyglass/20 bg-skyglass/10 px-2.5 py-1 text-xs font-semibold text-sky-100 ${className}`}
      title={`${t('hltb.estimatedTime')} · HowLongToBeat`}
    >
      {label}
    </span>
  );
}
