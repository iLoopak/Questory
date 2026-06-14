import { ShelfAvatar } from '../ShelfIdentity';
import {
  maxShelfNameLength,
  type ShelfAvatarSelection,
  type ShelfIdentitySettings,
} from '../../lib/shelfIdentity';
import type { QuestShelfAchievementProgress } from '../../lib/questShelfAchievements';
import { SettingsSection } from './SettingsSection';

const personalizationAvatarOptions: Array<{
  label: string;
  value: ShelfAvatarSelection;
}> = [
  { label: 'QuestShelf Q', value: 'app-icon' },
  { label: 'Controller', value: 'built-in:controller' },
  { label: 'Achievement Hunter', value: 'built-in:achievement-hunter' },
  { label: 'Retro', value: 'built-in:retro-explorer' },
  { label: 'RPG', value: 'built-in:rpg-adventurer' },
  { label: 'Sci-Fi', value: 'built-in:sci-fi-pilot' },
  { label: 'Fantasy', value: 'built-in:fantasy-hero' },
  { label: 'Collector', value: 'built-in:collector' },
  { label: 'Backlog Slayer', value: 'built-in:backlog-slayer' },
  { label: 'Curator', value: 'built-in:curator' },
  { label: 'Platform Hopper', value: 'built-in:platform-hopper' },
  { label: 'Handheld Hero', value: 'built-in:handheld-hero' },
  { label: 'Playing Right Now', value: 'built-in:playing-right-now' },
];

export function PersonalizationSettingsPanel({
  personalizedQuestShelfTitle,
  shelfIdentity,
  achievements,
  activeAchievementTitle,
  onShelfIdentityChange,
}: {
  personalizedQuestShelfTitle: string;
  shelfIdentity: ShelfIdentitySettings;
  achievements: QuestShelfAchievementProgress[];
  activeAchievementTitle: string;
  onShelfIdentityChange: (identity: ShelfIdentitySettings) => void;
}) {
  const previewIdentity = {
    ...shelfIdentity,
    avatarSelection: shelfIdentity.avatarSelection === 'steam' || shelfIdentity.avatarSelection === 'custom' ? 'app-icon' : shelfIdentity.avatarSelection,
  };

  function updateShelfName(shelfName: string) {
    onShelfIdentityChange({ ...shelfIdentity, shelfName });
  }

  function updateShelfAvatar(avatarSelection: ShelfAvatarSelection) {
    onShelfIdentityChange({ ...shelfIdentity, avatarSelection, shelfAvatar: avatarSelection });
  }

  function updateActiveBadge(selectedActiveBadgeId: ShelfIdentitySettings['selectedActiveBadgeId']) {
    onShelfIdentityChange({ ...shelfIdentity, selectedActiveBadgeId });
  }

  return (
    <SettingsSection
      title="Personalization"
      description="Set the shelf identity shown in places like Library and Home without changing Appearance theme or accent settings."
    >
      <div className="space-y-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shelf Name</span>
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            maxLength={maxShelfNameLength}
            onChange={(event) => updateShelfName(event.target.value)}
            placeholder="Loopak's QuestShelf"
            value={shelfIdentity.shelfName}
          />
          <span className="mt-2 block text-xs leading-5 text-slate-500">
            Optional. Examples: Loopak's QuestShelf, My QuestShelf, Viktor's QuestShelf.
          </span>
        </label>

        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shelf Avatar</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Shelf Avatar">
            {personalizationAvatarOptions.map((option) => {
              const isSelected = shelfIdentity.avatarSelection === option.value;
              return (
                <button
                  aria-checked={isSelected}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${
                    isSelected
                      ? 'border-mint/60 bg-mint/10 text-white shadow-glow'
                      : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/35 hover:text-white'
                  }`}
                  key={option.value}
                  onClick={() => updateShelfAvatar(option.value)}
                  role="radio"
                  type="button"
                >
                  <ShelfAvatar {...shelfIdentity} avatarSelection={option.value} sizeClassName="h-11 w-11" />
                  <span className="font-semibold">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>



        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Active Badge</div>
              <p className="mt-1 text-sm text-slate-400">Choose an unlocked QuestShelf achievement as your shelf badge, or use automatic priority.</p>
            </div>
            <button
              className={`h-9 rounded-md border px-3 text-sm font-semibold transition ${!shelfIdentity.selectedActiveBadgeId ? 'border-mint/60 bg-mint/10 text-mint' : 'border-skyglass/15 text-slate-300 hover:border-mint/35 hover:text-white'}`}
              onClick={() => updateActiveBadge('')}
              type="button"
            >
              Auto badge
            </button>
          </div>
          <div className="mt-2 rounded-lg border border-mint/20 bg-mint/10 p-3 text-sm font-semibold text-white">
            Preview active badge: <span className="text-mint">{activeAchievementTitle || 'No badge unlocked yet'}</span>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {achievements.map((achievement) => {
              const isSelected = shelfIdentity.selectedActiveBadgeId === achievement.id;
              return (
                <div className={`rounded-lg border p-3 transition ${achievement.isUnlocked ? 'border-skyglass/15 bg-ink-900/70 text-slate-200' : 'border-white/5 bg-ink-950/60 text-slate-500 opacity-75'}`} key={achievement.id}>
                  <div className="flex items-start gap-3">
                    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border text-lg ${achievement.isUnlocked ? 'border-mint/35 bg-mint/10 shadow-glow' : 'border-white/10 bg-ink-900'}`}>{achievement.glyph}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className={achievement.isUnlocked ? 'text-white' : 'text-slate-400'}>{achievement.title}</strong>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${achievement.isUnlocked ? 'border-mint/30 text-mint' : 'border-white/10 text-slate-500'}`}>{achievement.progressLabel}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5">{achievement.description}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{achievement.unlockCondition}</p>
                    </div>
                  </div>
                  <button
                    className="mt-3 h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-600"
                    disabled={!achievement.isUnlocked || isSelected}
                    onClick={() => updateActiveBadge(achievement.id)}
                    type="button"
                  >
                    {isSelected ? 'Active badge' : achievement.isUnlocked ? 'Set active' : 'Locked'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-mint/20 bg-mint/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">Preview</div>
          <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-white">
            <ShelfAvatar {...previewIdentity} sizeClassName="h-10 w-10" />
            <span>{personalizedQuestShelfTitle}{activeAchievementTitle ? <span className="text-mint"> · {activeAchievementTitle}</span> : null}</span>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
