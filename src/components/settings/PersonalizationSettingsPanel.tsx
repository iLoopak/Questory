import { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { ShelfAvatar } from '../ShelfIdentity';
import {
  maxShelfNameLength,
  resizeAvatarFile,
  type ShelfAvatarSelection,
  type ShelfIdentitySettings,
} from '../../lib/shelfIdentity';
import { useI18n } from '../../i18n';
import { getSteamProfileDisplayName, loadSteamSettings, saveSteamSettings } from '../../lib/steamSettingsStorage';
import { getSteamPlayerSummary } from '../../services/steamApi';
import type { QuestShelfAchievementProgress } from '../../lib/questShelfAchievements';
import { SettingsSection } from './SettingsSection';
import {
  clearRecommendationFeedback,
  loadRecommendationFeedback,
  loadRecommendationPreferences,
  removeRecommendationFeedback,
  saveRecommendationPreferences,
  type RecommendationPreferences,
} from '../../lib/recommendationFeedback';
import { clearPersonalRecommendationCaches } from '../../services/personalRecommendationsService';

const personalizationAvatarOptions: Array<{
  label: string;
  value: ShelfAvatarSelection;
}> = [
  { label: 'Questory Q', value: 'app-icon' },
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
  onSteamAvatarImported,
}: {
  personalizedQuestShelfTitle: string;
  shelfIdentity: ShelfIdentitySettings;
  achievements: QuestShelfAchievementProgress[];
  activeAchievementTitle: string;
  steamAvatarUrl?: string;
  steamPersonaName?: string;
  onShelfIdentityChange: (identity: ShelfIdentitySettings) => void;
  onSteamAvatarImported?: (personaName: string) => void;
}) {
  const { t } = useI18n();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploadStatus, setAvatarUploadStatus] = useState('');
  const [avatarUploadError, setAvatarUploadError] = useState('');
  const [isImportingSteamAvatar, setIsImportingSteamAvatar] = useState(false);
  const [recommendationPreferences, setRecommendationPreferences] = useState<RecommendationPreferences>(() => loadRecommendationPreferences());
  const [recommendationFeedback, setRecommendationFeedback] = useState(() => loadRecommendationFeedback());

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
      setAvatarUploadStatus(t('personalization.customAvatarSaved'));
    } catch (error) {
      setAvatarUploadError(error instanceof Error ? error.message : t('personalization.avatarUploadFailed'));
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  function clearCustomAvatar() {
    onShelfIdentityChange({ ...shelfIdentity, avatarSelection: 'app-icon', shelfAvatar: 'app-icon', customAvatarDataUrl: '' });
    setAvatarUploadStatus(t('personalization.customAvatarCleared'));
    setAvatarUploadError('');
  }

  async function useSteamAvatar() {
    setAvatarUploadStatus('');
    setAvatarUploadError('');
    if (steamAvatarUrl) {
      updateShelfAvatar('steam');
      setAvatarUploadStatus(t('personalization.steamAvatarSelected'));
      return;
    }

    const steamSettings = loadSteamSettings();
    if (!steamSettings.apiKey.trim() || !steamSettings.steamId64.trim()) {
      setAvatarUploadError(t('personalization.steamAvatarCredentialsMissing'));
      return;
    }

    setIsImportingSteamAvatar(true);
    try {
      const profile = await getSteamPlayerSummary(steamSettings);
      if (!profile?.avatarUrl) {
        setAvatarUploadError(t('personalization.steamAvatarUnavailable'));
        return;
      }
      const nextSettings = { ...steamSettings, profile: { ...profile, updatedAt: new Date().toISOString() } };
      saveSteamSettings(nextSettings);
      onShelfIdentityChange({ ...shelfIdentity, avatarSelection: 'steam', shelfAvatar: 'steam' });
      onSteamAvatarImported?.(getSteamProfileDisplayName(nextSettings));
      setAvatarUploadStatus(t('personalization.steamAvatarImported'));
    } catch (error) {
      setAvatarUploadError(error instanceof Error ? error.message : t('personalization.steamAvatarFetchFailed'));
    } finally {
      setIsImportingSteamAvatar(false);
    }
  }

  function updateActiveBadge(selectedActiveBadgeId: ShelfIdentitySettings['selectedActiveBadgeId']) {
    onShelfIdentityChange({ ...shelfIdentity, selectedActiveBadgeId });
  }

  function updateRecommendationPreferences(next: RecommendationPreferences) {
    setRecommendationPreferences(next);
    saveRecommendationPreferences(next);
    void clearPersonalRecommendationCaches();
  }

  function undoRecommendationFeedback(rawgId: number | null, normalizedTitle: string) {
    removeRecommendationFeedback(rawgId, normalizedTitle);
    setRecommendationFeedback(loadRecommendationFeedback());
    void clearPersonalRecommendationCaches();
  }

  function resetRecommendationFeedback() {
    if (!window.confirm('Reset recommendation feedback? Hidden games and less-like-this preferences will be cleared.')) return;
    clearRecommendationFeedback();
    setRecommendationFeedback([]);
    void clearPersonalRecommendationCaches();
  }

  function resetRecommendationCache() {
    void clearPersonalRecommendationCaches();
  }

  const activeAchievement = achievements.find((achievement) => achievement.title === activeAchievementTitle);
  const avatarOptions = [
    ...personalizationAvatarOptions,
    ...(steamAvatarUrl ? [{ label: `${t('personalization.steamAvatar')}${steamPersonaName ? ` · ${steamPersonaName}` : ''}`, value: 'steam' as const }] : []),
    ...(shelfIdentity.customAvatarDataUrl ? [{ label: t('personalization.customUpload'), value: 'custom' as const }] : []),
  ];

  return (
    <SettingsSection
      title={t('personalization.title')}
      description={t('personalization.help')}
    >
      <div className="space-y-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <label className="block">
          <span className="qs-label-caps text-muted">{t('personalization.shelfName')}</span>
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            maxLength={maxShelfNameLength}
            onChange={(event) => updateShelfName(event.target.value)}
            placeholder="Loopak"
            value={shelfIdentity.shelfName}
          />
          <span className="mt-2 block text-xs leading-5 text-slate-500">
            {t('personalization.shelfNameHelp')}
          </span>
        </label>

        <div>
          <div className="qs-label-caps text-muted">{t('personalization.shelfAvatar')}</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label={t('personalization.shelfAvatar')}>
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
              {shelfIdentity.customAvatarDataUrl ? t('personalization.replaceCustomAvatar') : t('personalization.uploadCustomAvatar')}
            </button>
            {shelfIdentity.customAvatarDataUrl ? (
              <button
                className="h-10 rounded-md border border-red-400/30 px-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10"
                onClick={clearCustomAvatar}
                type="button"
              >
                {t('personalization.clearCustomAvatar')}
              </button>
            ) : null}
            <button
              className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isImportingSteamAvatar}
              onClick={() => void useSteamAvatar()}
              type="button"
            >
              {isImportingSteamAvatar ? t('personalization.steamAvatarImporting') : t('personalization.useSteamAvatar')}
            </button>
            <span className="text-xs leading-5 text-slate-500">{steamAvatarUrl ? t('personalization.steamAvatarAvailableHelp') : t('personalization.steamAvatarMissingHelp')}</span>
            <span className="text-xs leading-5 text-slate-500">{t('personalization.avatarCropHelp')}</span>
          </div>
          {avatarUploadStatus ? <div className="mt-2 text-sm text-mint">{avatarUploadStatus}</div> : null}
          {avatarUploadError ? <div className="mt-2 text-sm text-red-200">{avatarUploadError}</div> : null}
        </div>


        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="qs-label-caps text-muted">{t('personalization.activeBadge')}</div>
              <p className="mt-1 text-sm text-slate-400">{t('personalization.activeBadgeHelp')}</p>
            </div>
            <button
              className={`h-9 rounded-md border px-3 text-sm font-semibold transition ${!shelfIdentity.selectedActiveBadgeId ? 'border-mint/60 bg-mint/10 text-mint' : 'border-skyglass/15 text-slate-300 hover:border-mint/35 hover:text-white'}`}
              onClick={() => updateActiveBadge('')}
              type="button"
            >
              {t('personalization.autoBadge')}
            </button>
          </div>
          <div className="qs-achievement-preview mt-2">
            {t('personalization.previewActiveBadge')}: <span className="qs-achievement-inline-badge">{activeAchievement ? <Icon name={activeAchievement.icon} /> : null}{activeAchievementTitle || t('personalization.noBadgeUnlocked')}</span>
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
                    {isSelected ? t('personalization.activeBadge') : achievement.isUnlocked ? t('personalization.setActive') : t('personalization.locked')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="qs-achievement-preview">
          <div className="qs-label-caps">{t('personalization.preview')}</div>
          <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-white">
            <ShelfAvatar {...shelfIdentity} isActive steamAvatarUrl={steamAvatarUrl} sizeClassName="h-10 w-10" />
            <span>{personalizedQuestShelfTitle}{activeAchievementTitle ? <span className="qs-achievement-inline-badge ml-1"> · {activeAchievement ? <Icon name={activeAchievement.icon} /> : null}{activeAchievementTitle}</span> : null}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <div>
          <div className="qs-label-caps text-muted">Recommendation preferences</div>
          <p className="mt-1 text-sm leading-6 text-slate-400">Ratings, playtime, and statuses remain the strongest signals. These controls only tune the final shelf.</p>
        </div>
        <label className="block">
          <span className="text-sm font-semibold text-white">Discovery style</span>
          <select
            className="mt-2 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
            onChange={(event) => updateRecommendationPreferences({ ...recommendationPreferences, explorationMode: event.target.value as RecommendationPreferences['explorationMode'] })}
            value={recommendationPreferences.explorationMode}
          >
            <option value="familiar">Familiar</option>
            <option value="balanced">Balanced</option>
            <option value="exploratory">Exploratory</option>
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <RecommendationPreferenceToggle
            checked={recommendationPreferences.preferNewerReleases}
            label="Prefer newer releases"
            onChange={(checked) => updateRecommendationPreferences({ ...recommendationPreferences, preferNewerReleases: checked })}
          />
          <RecommendationPreferenceToggle
            checked={recommendationPreferences.reduceFranchiseRepetition}
            label="Reduce franchise repetition"
            onChange={(checked) => updateRecommendationPreferences({ ...recommendationPreferences, reduceFranchiseRepetition: checked })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white" onClick={resetRecommendationCache} type="button">Reset recommendation cache</button>
          <button className="h-10 rounded-md border border-red-400/30 px-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10" onClick={resetRecommendationFeedback} type="button">Reset feedback</button>
        </div>
        {recommendationFeedback.length > 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Recent feedback</div>
            <div className="grid gap-2">
              {recommendationFeedback.slice(-6).reverse().map((record) => (
                <div className="flex items-center justify-between gap-3 rounded-md border border-skyglass/10 bg-ink-900/70 px-3 py-2 text-sm" key={`${record.rawgId ?? record.normalizedTitle}:${record.createdAt}`}>
                  <span className="min-w-0 truncate text-slate-300">{record.feedbackType.replaceAll('_', ' ')} · {record.normalizedTitle}</span>
                  <button className="shrink-0 text-xs font-semibold text-mint hover:text-white" onClick={() => undoRecommendationFeedback(record.rawgId, record.normalizedTitle)} type="button">Undo</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function RecommendationPreferenceToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-skyglass/15 bg-ink-900/70 px-3 py-2 text-sm text-slate-200">
      <input checked={checked} className="h-4 w-4 accent-mint" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
