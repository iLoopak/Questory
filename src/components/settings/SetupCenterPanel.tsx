import type { SettingsCategory } from '../../config/settings';
import type { SetupTask, SetupProgress } from '../../lib/setupTasks';
import { Icon } from '../Icon';

type SetupCenterPanelProps = {
  progress: SetupProgress;
  tasks: SetupTask[];
  onNavigateToCategory: (category: SettingsCategory) => void;
  onSyncAchievements?: () => void;
  onAddGame?: () => void;
};

export function SetupCenterPanel({
  progress,
  tasks,
  onNavigateToCategory,
  onSyncAchievements,
  onAddGame,
}: SetupCenterPanelProps) {
  function handleTaskAction(task: SetupTask) {
    const { action } = task;
    if (action.type === 'navigate') {
      onNavigateToCategory(action.category);
    } else if (action.type === 'sync-achievements') {
      onSyncAchievements?.();
    } else if (action.type === 'add-game') {
      onAddGame?.();
    }
  }

  const isComplete = progress.completed === progress.total;

  return (
    <section
      aria-label="Questory Setup"
      className="rounded-2xl border border-white/10 bg-ink-900/50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 select-none">
              Setup
            </div>
            <h2 className="mt-0.5 text-base font-bold text-white leading-tight">
              {isComplete ? 'Questory is fully configured' : 'Questory Setup'}
            </h2>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-2xl font-bold text-white tabular-nums">{progress.percent}%</span>
            <p className="text-[10px] text-slate-600 whitespace-nowrap">
              {progress.completed} / {progress.total} completed
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress.percent}%`,
              background: isComplete
                ? 'rgb(52 211 153)' // emerald for 100%
                : 'var(--color-mint, #3dffc0)',
            }}
          />
        </div>
      </div>

      {/* Task list */}
      <div className="divide-y divide-white/5">
        {tasks.map((task) => (
          <SetupTaskRow
            key={task.id}
            task={task}
            onAction={() => handleTaskAction(task)}
          />
        ))}
      </div>
    </section>
  );
}

function SetupTaskRow({ task, onAction }: { task: SetupTask; onAction: () => void }) {
  const isCompleted = task.status === 'completed';
  const isAttention = task.status === 'attention';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition ${
        isAttention ? 'bg-amber-300/3' : ''
      }`}
    >
      {/* Status icon */}
      <span className="shrink-0 mt-0.5" aria-hidden="true">
        {isCompleted ? (
          <Icon name="check-circle" size={16} className="text-emerald-400" strokeWidth={2} />
        ) : isAttention ? (
          <Icon name="alert-triangle" size={16} className="text-amber-400" strokeWidth={2} />
        ) : (
          <Icon name="circle" size={16} className="text-slate-700" strokeWidth={2} />
        )}
      </span>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-snug ${isCompleted ? 'text-slate-500' : isAttention ? 'text-amber-100' : 'text-slate-200'}`}>
          {task.title}
        </p>
        <p className={`text-xs leading-snug mt-0.5 ${isCompleted ? 'text-slate-700' : isAttention ? 'text-amber-400/80' : 'text-slate-600'}`}>
          {task.description}
        </p>
      </div>

      {/* Action button */}
      {!isCompleted ? (
        <button
          type="button"
          onClick={onAction}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            isAttention
              ? 'border-amber-300/30 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20 hover:text-white'
              : 'border-skyglass/15 text-slate-400 hover:border-mint/30 hover:bg-mint/10 hover:text-white'
          }`}
        >
          {task.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
