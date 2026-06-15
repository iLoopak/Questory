import { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { ShelfAvatar } from '../ShelfIdentity';
import {
  maxShelfNameLength,
  resizeAvatarFile,
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
  steamAvatarUrl = '',
  steamPersonaName = '',
  onShelfIdentityChange,
}: {
  personalizedQuestShelfTitle: string;
  shelfIdentity: ShelfIdentitySettings;
  achievements: QuestShelfAchievementProgress[];
  activeAchievementTitle: string;
  steamAvatarUrl?: string;
  steamPersonaName?: string;
  onShelfIdentityChange: (identity: ShelfIdentitySettings) => void;
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploadStatus, setAvatarUploadStatus] = useState('');
  const [avatarUploadError, setAvatarUploadError] = useState('');

  function updateShelfName(shelfName: string) {
    onShelfIdentityChange({ ...shelfIdentity, shelfName });
  }

  function updateShelfAvatar(avatarSelection: ShelfAvatarSelection) {
    onShelfIdentityChange({ ...shelfIdentity, avatarSelection, shelfAvatar: avatarSelection });
    setAvatarUploadError('');
  }

  async function uploadCustomAvatar(file?: File) {
    if (!file) return;
    setAvatarUploadStatus('');
    setAvatarUploadError('');
    try {
      const customAvatarDataUrl = await resizeAvatarFile(file);
      onShelfIdentityChange({ ...shelfIdentity, avatarSelection: 'custom', shelfAvatar: 'custom', customAvatarDataUrl });
      setAvatarUploadStatus('Custom avatar saved locally and selected.');
    } catch (error) {
      setAvatarUploadError(error instanceof Error ? error.message : 'Avatar upload failed.');
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  function clearCustomAvatar() {
    onShelfIdentityChange({ ...shelfIdentity, avatarSelection: 'app-icon', shelfAvatar: 'app-icon', customAvatarDataUrl: '' });
    setAvatarUploadStatus('Custom avatar cleared. QuestShelf Q selected.');
    setAvatarUploadError('');
  }

  function updateActiveBadge(selectedActiveBadgeId: ShelfIdentitySettings['selectedActiveBadgeId']) {
    onShelfIdentityChange({ ...shelfIdentity, selectedActiveBadgeId });
  }

  const activeAchievement = achievements.find((achievement) => achievement.title === activeAchievementTitle);
  const avatarOptions = [
    ...personalizationAvatarOptions,
    ...(steamAvatarUrl ? [{ label: `Steam avatar${steamPersonaName ? ` · ${steamPersonaName}` : ''}`, value: 'steam' as const }] : []),
    ...(shelfIdentity.customAvatarDataUrl ? [{ label: 'Custom upload', value: 'custom' as const }] : []),
  ];

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
            {avatarOptions.map((option) => {
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
                  <ShelfAvatar {...shelfIdentity} avatarSelection={option.value} isActive={isSelected} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-11 w-11" />
                  <span className="font-semibold">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-skyglass/15 bg-ink-900/60 p-3">
          <input
            accept="image/*"
            className="hidden"
            onChange={(event) => void uploadCustomAvatar(event.target.files?.[0])}
            ref={uploadInputRef}
            type="file"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white"
              onClick={() => uploadInputRef.current?.click()}
              type="button"
            >
              {shelfIdentity.customAvatarDataUrl ? 'Replace custom avatar' : 'Upload custom avatar'}
            </button>
            {shelfIdentity.customAvatarDataUrl ? (
              <button
                className="h-10 rounded-md border border-red-400/30 px-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10"
                onClick={clearCustomAvatar}
                type="button"
              >
                Clear custom avatar
              </button>
            ) : null}
            <span className="text-xs leading-5 text-slate-500">Images are cropped to 256×256 and saved locally with Shelf Identity.</span>
          </div>
          {avatarUploadStatus ? <div className="mt-2 text-sm text-mint">{avatarUploadStatus}</div> : null}
          {avatarUploadError ? <div className="mt-2 text-sm text-red-200">{avatarUploadError}</div> : null}
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
          <div className="qs-achievement-preview mt-2">
            Preview active badge: <span className="qs-achievement-inline-badge">{activeAchievement ? <Icon name={activeAchievement.icon} /> : null}{activeAchievementTitle || 'No badge unlocked yet'}</span>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {achievements.map((achievement) => {
              const isSelected = shelfIdentity.selectedActiveBadgeId === achievement.id;
              return (
                <div className={`qs-achievement-card ${achievement.isUnlocked ? 'qs-achievement-card--unlocked' : 'qs-achievement-card--locked'} ${isSelected ? 'qs-achievement-card--active' : ''}`} key={achievement.id}>
                  <div className="flex items-start gap-3">
                    <div className="qs-achievement-card__icon"><Icon name={achievement.icon} size={20} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="qs-achievement-card__title"><Icon name={achievement.icon} />{achievement.title}</strong>
                        <span className="qs-achievement-card__progress">{achievement.progressLabel}</span>
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

        <div className="qs-achievement-preview">
          <div className="text-xs font-semibold uppercase tracking-[0.14em]">Preview</div>
          <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-white">
            <ShelfAvatar {...shelfIdentity} isActive steamAvatarUrl={steamAvatarUrl} sizeClassName="h-10 w-10" />
            <span>{personalizedQuestShelfTitle}{activeAchievementTitle ? <span className="qs-achievement-inline-badge ml-1"> · {activeAchievement ? <Icon name={activeAchievement.icon} /> : null}{activeAchievementTitle}</span> : null}</span>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
