import { ShelfAvatar } from '../ShelfIdentity';
import {
  maxShelfNameLength,
  type ShelfAvatarSelection,
  type ShelfIdentitySettings,
} from '../../lib/shelfIdentity';

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
];

export function PersonalizationSettingsPanel({
  personalizedQuestShelfTitle,
  shelfIdentity,
  onShelfIdentityChange,
}: {
  personalizedQuestShelfTitle: string;
  shelfIdentity: ShelfIdentitySettings;
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
    onShelfIdentityChange({ ...shelfIdentity, avatarSelection });
  }

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Personalization</h2>
        <p className="mt-1 text-sm text-slate-400">
          Set the shelf identity shown in places like Library and Home without changing Appearance theme or accent settings.
        </p>
      </div>

      <div className="mt-4 space-y-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
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

        <div className="rounded-lg border border-mint/20 bg-mint/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">Preview</div>
          <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-white">
            <ShelfAvatar {...previewIdentity} sizeClassName="h-10 w-10" />
            <span>{personalizedQuestShelfTitle}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
