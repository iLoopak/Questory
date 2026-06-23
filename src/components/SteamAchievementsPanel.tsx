import { useState } from 'react';
import { useI18n } from '../i18n';
import type { SteamAchievement } from '../types/game';
import { Icon } from './Icon';

type Filter = 'all' | 'unlocked' | 'locked';

type SteamAchievementsPanelProps = {
  achievements: SteamAchievement[];
  gameTitle: string;
  onClose: () => void;
};

export function SteamAchievementsPanel({ achievements, gameTitle, onClose }: SteamAchievementsPanelProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');

  const unlocked = achievements.filter((a) => a.unlocked).length;
  const total = achievements.length;
  const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;

  const progressLabel = t('steamAchievements.progress')
    .replace('{unlocked}', String(unlocked))
    .replace('{total}', String(total));

  const visible = achievements.filter((a) => {
    if (filter === 'unlocked') return a.unlocked;
    if (filter === 'locked') return !a.unlocked;
    return true;
  });

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t('steamAchievements.filterAll') },
    { key: 'unlocked', label: t('steamAchievements.filterUnlocked') },
    { key: 'locked', label: t('steamAchievements.filterLocked') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t('steamAchievements.title')}
    >
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-skyglass/20 bg-ink-950 shadow-2xl"
        style={{ paddingBottom: 'max(1rem, var(--qs-safe-bottom))' }}
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1.5 w-16 rounded-full bg-skyglass/35" />
        </div>

        <div className="shrink-0 px-5 pb-3 pt-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div>
              <div className="qs-label-caps text-mint">{t('steamAchievements.title')}</div>
              <p className="line-clamp-1 text-base font-bold text-white">{gameTitle}</p>
            </div>
            <button
              aria-label={t('steamAchievements.close')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
              type="button"
              onClick={onClose}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
              <span>{progressLabel}</span>
              <span className="font-semibold text-mint">{percent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-mint transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="mt-3 flex gap-1.5">
            {filters.map(({ key, label }) => (
              <button
                key={key}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  filter === key
                    ? 'bg-mint text-ink-950'
                    : 'bg-white/8 text-slate-400 hover:bg-white/12 hover:text-white'
                }`}
                type="button"
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{t('steamAchievements.noAchievements')}</p>
          ) : (
            <ul className="space-y-2">
              {visible.map((achievement) => (
                <AchievementRow key={achievement.apiName} achievement={achievement} t={t} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function AchievementRow({ achievement, t }: { achievement: SteamAchievement; t: (key: string) => string }) {
  const iconUrl = achievement.unlocked ? achievement.iconUrl : (achievement.grayIconUrl ?? achievement.iconUrl);
  const unlockDate = achievement.unlockTime
    ? new Date(achievement.unlockTime * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <li className={`flex items-start gap-3 rounded-xl p-2.5 ${achievement.unlocked ? 'bg-white/6' : 'opacity-60'}`}>
      {iconUrl ? (
        <img
          alt=""
          aria-hidden="true"
          className="mt-0.5 h-10 w-10 shrink-0 rounded-lg object-cover"
          loading="lazy"
          src={iconUrl}
        />
      ) : (
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/8">
          <Icon name="trophy" size={18} className="text-slate-500" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {achievement.unlocked && (
            <Icon name="check-circle" size={13} className="shrink-0 text-mint" />
          )}
          <span className="truncate text-sm font-semibold text-white">
            {achievement.hidden && !achievement.unlocked
              ? t('steamAchievements.hidden')
              : achievement.displayName}
          </span>
        </div>
        {achievement.description && (!achievement.hidden || achievement.unlocked) ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{achievement.description}</p>
        ) : null}
        {unlockDate ? (
          <p className="mt-0.5 text-xs text-mint/80">
            {t('steamAchievements.unlockedOn').replace('{date}', unlockDate)}
          </p>
        ) : null}
      </div>
    </li>
  );
}
