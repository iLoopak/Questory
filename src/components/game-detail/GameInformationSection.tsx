import type { Game } from '../../types/game';
import type { TFunction } from '../../i18n';

export function formatMetacriticScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${Math.round(value)}%` : null;
}

export function formatRawgPlaytime(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${Math.round(value)}h` : null;
}

function formatList(value: string[] | undefined, unavailableText: string) {
  return value && value.length > 0 ? value.join(', ') : unavailableText;
}

/**
 * Canonical "Game Information" metadata panel — release date, developers,
 * publishers, scores, genre and tag chips. Shared by the Library Game Hub
 * and Discovery Preview.
 */
export function GameInformationSection({
  game,
  metacriticScore,
  rawgPlaytime,
  t,
}: {
  game: Game;
  metacriticScore: string | null;
  rawgPlaytime: string | null;
  t: TFunction;
}) {
  const hasInfo =
    game.released ||
    (game.developers?.length ?? 0) > 0 ||
    (game.publishers?.length ?? 0) > 0 ||
    metacriticScore ||
    rawgPlaytime ||
    (game.genres?.length ?? 0) > 0 ||
    (game.rawgTags?.length ?? 0) > 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-ink-900/40 p-4 space-y-4" aria-label="Game Information">
      <h3 className="text-base font-semibold text-white">Game Information</h3>
      {hasInfo ? (
        <div className="space-y-5">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCard label="Released" value={game.released ?? t('detail.notAvailable')} />
            <InfoCard label={t('detail.developers')} value={formatList(game.developers, t('detail.notAvailable'))} />
            <InfoCard label={t('detail.publishers')} value={formatList(game.publishers, t('detail.notAvailable'))} />
            {metacriticScore ? <InfoCard label="Metacritic" value={metacriticScore} /> : null}
            {rawgPlaytime ? <InfoCard label="Average playtime" value={rawgPlaytime} /> : null}
          </div>
          <ChipGroup label={t('detail.genres')} values={game.genres} accent="mint" />
          <ChipGroup label={t('detail.rawgTags')} values={game.rawgTags} />
        </div>
      ) : (
        <p className="text-sm text-slate-600">{t('detail.noRawgMetadata')}</p>
      )}
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-caps text-slate-600">{label}</div>
      <div className="mt-0.5 text-sm text-slate-200 leading-snug">{value}</div>
    </div>
  );
}

type ChipGroupProps = {
  accent?: 'mint';
  label: string;
  values?: string[];
};

export function ChipGroup({ accent, label, values }: ChipGroupProps) {
  if (!values || values.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-caps text-slate-500">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              accent === 'mint' ? 'bg-mint/10 text-mint' : 'bg-white/10 text-slate-300'
            }`}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
