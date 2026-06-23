import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n, type TFunction } from '../i18n';
import { loadAchievementCounters } from '../lib/achievementCounters';
import { getQuestShelfAchievements, type QuestShelfAchievementProgress } from '../lib/questShelfAchievements';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import type { ReviewModeState } from '../lib/reviewModeStorage';
import type { Game } from '../types/game';
import { Icon } from './Icon';

const SHOWCASE_SIZE = 5;
const TOOLTIP_WIDTH = 224;

type HomeAchievementsShowcaseProps = {
  games: Game[];
  queueState: PlatformQueueState;
  reviewModeState: ReviewModeState;
  onViewAll?: () => void;
};

export function HomeAchievementsShowcase({
  games,
  queueState,
  reviewModeState,
  onViewAll,
}: HomeAchievementsShowcaseProps) {
  const { language, t } = useI18n();

  const achievements = useMemo(() => {
    const counters = loadAchievementCounters();
    const ctx = {
      language,
      counters,
      reviewStats: reviewModeState.stats,
      reviewedGamesCount: Object.keys(reviewModeState.reviewedGames).length,
    };
    return getQuestShelfAchievements(games, queueState, ctx);
  }, [games, queueState, reviewModeState, language]);

  const showcase = useMemo(() => selectShowcase(achievements), [achievements]);

  if (showcase.length === 0) return null;

  return (
    <section className="qs-home-section rounded-2xl border border-skyglass/15 bg-ink-900/74 shadow-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="qs-home-section-title text-lg font-semibold text-white">{t('home.qsAchievements')}</h3>
        {onViewAll ? (
          <button
            className="qs-home-section-action min-h-10 rounded-lg border border-skyglass/15 px-3 qs-label-caps text-slate-300 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white"
            type="button"
            onClick={onViewAll}
          >
            {t('home.qsAchievementsViewAll')}
          </button>
        ) : null}
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {showcase.map((achievement) => (
          <AchievementShowcaseCard
            key={achievement.id}
            achievement={achievement}
            language={language}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

type TooltipCoords = { top: number; bottom: number; centerX: number };

function AchievementShowcaseCard({
  achievement,
  language,
  t,
}: {
  achievement: QuestShelfAchievementProgress;
  language: string;
  t: TFunction;
}) {
  const target = achievement.target ?? 1;
  const progressPct = target > 0 ? Math.min(100, Math.round((achievement.current / target) * 100)) : 0;

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords>({ top: 0, bottom: 0, centerX: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function computeCoords() {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    setCoords({ top: r.top, bottom: r.bottom, centerX: r.left + r.width / 2 });
  }

  function openTooltip() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    computeCoords();
    setOpen(true);
  }

  function scheduleClose() {
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  }

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }

  function handleClick() {
    if (open) {
      cancelClose();
      setOpen(false);
    } else {
      openTooltip();
    }
  }

  // Close on outside interaction while open
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside, true);
    document.addEventListener('touchstart', handleOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside, true);
      document.removeEventListener('touchstart', handleOutside, true);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const tooltipId = `qs-ach-tip-${achievement.id}`;

  return (
    <>
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-label={achievement.title}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        className={`qs-achievement-card flex w-36 shrink-0 cursor-pointer select-none flex-col gap-2 p-3 ${
          achievement.isUnlocked ? 'qs-achievement-card--unlocked' : 'qs-achievement-card--locked'
        }`}
        onMouseEnter={openTooltip}
        onMouseLeave={scheduleClose}
        onClick={handleClick}
        onFocus={openTooltip}
        onBlur={scheduleClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="qs-achievement-card__icon">
            <Icon name={achievement.icon} size={18} />
          </div>
          {achievement.isUnlocked ? (
            <Icon name="check-circle" size={13} className="mt-0.5 shrink-0 text-mint" />
          ) : null}
        </div>

        <div className="flex-1">
          <p className="line-clamp-2 text-xs font-semibold leading-tight text-white">{achievement.title}</p>
        </div>

        {achievement.isUnlocked ? (
          <span className="qs-achievement-card__progress self-start">{t('home.qsAchievementsUnlocked')}</span>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-2xs text-slate-500">{achievement.progressLabel}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-mint/60 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {open && (
        <AchievementTooltip
          id={tooltipId}
          achievement={achievement}
          language={language}
          coords={coords}
          t={t}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
    </>
  );
}

function AchievementTooltip({
  id,
  achievement,
  language,
  coords,
  t,
  onMouseEnter,
  onMouseLeave,
}: {
  id: string;
  achievement: QuestShelfAchievementProgress;
  language: string;
  coords: TooltipCoords;
  t: TFunction;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const title = language === 'cs' && achievement.titleCs ? achievement.titleCs : achievement.title;
  const description =
    language === 'cs' && achievement.descriptionCs ? achievement.descriptionCs : achievement.description;
  const hasProgress =
    typeof achievement.target === 'number' && achievement.target > 1 && !achievement.isUnlocked;

  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;

  // Prefer showing above the card; fall back to below if too little room
  const showAbove = coords.top > 148;
  const left = Math.max(8, Math.min(coords.centerX - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 8));

  const positionStyle: React.CSSProperties = showAbove
    ? { bottom: vh - coords.top + 8, left, width: TOOLTIP_WIDTH }
    : { top: coords.bottom + 8, left, width: TOOLTIP_WIDTH };

  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-auto fixed z-50 rounded-xl border border-mint/20 bg-ink-950/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl"
      style={positionStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <p className="text-xs font-bold text-white">{title}</p>

      {!achievement.isUnlocked ? (
        <>
          <p className="mt-2 text-2xs font-semibold uppercase tracking-widest text-slate-500">
            {t('home.qsAchievementsUnlockReq')}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-slate-300">{achievement.unlockCondition}</p>
          {hasProgress && (
            <>
              <p className="mt-2 text-2xs font-semibold uppercase tracking-widest text-slate-500">
                {t('home.qsAchievementsProgress')}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-white">{achievement.progressLabel}</p>
            </>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs leading-snug text-slate-400">{description}</p>
      )}
    </div>
  );
}

function selectShowcase(achievements: QuestShelfAchievementProgress[]): QuestShelfAchievementProgress[] {
  const unlocked = achievements
    .filter((a) => a.isUnlocked && !a.isMeta)
    .sort((a, b) => b.priority - a.priority);

  const inProgress = achievements
    .filter((a) => !a.isUnlocked && !a.isMeta && a.current > 0)
    .sort((a, b) => {
      const pctA = a.current / (a.target ?? 1);
      const pctB = b.current / (b.target ?? 1);
      return pctB - pctA;
    });

  const locked = achievements
    .filter((a) => !a.isUnlocked && !a.isMeta && a.current === 0)
    .sort((a, b) => (a.target ?? 1) - (b.target ?? 1));

  const result: QuestShelfAchievementProgress[] = [];

  // 1–2 recently unlocked
  result.push(...unlocked.slice(0, 2));

  // fill remaining with nearest-to-completion in-progress
  const remaining = SHOWCASE_SIZE - result.length;
  result.push(...inProgress.slice(0, remaining));

  // if still short, pad with easiest locked achievements
  if (result.length < 3) {
    const pad = 3 - result.length;
    result.push(...locked.slice(0, pad));
  }

  return result.slice(0, SHOWCASE_SIZE);
}
