import { useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { builtInAvatars, questShelfAppIconAvatarUrl, resizeAvatarFile, type ShelfAvatarSelection, type ShelfIdentitySettings } from '../lib/shelfIdentity';

export function ShelfAvatar({ avatarSelection, customAvatarDataUrl, steamAvatarUrl, sizeClassName = 'h-10 w-10', isActive = false }: ShelfIdentitySettings & { steamAvatarUrl?: string; sizeClassName?: string; isActive?: boolean }) {
  const selectedBuiltInId = avatarSelection.startsWith('built-in:') ? avatarSelection.slice('built-in:'.length) : '';
  const builtInAvatar = builtInAvatars.find((avatar) => avatar.id === selectedBuiltInId);
  const imageUrl = avatarSelection === 'custom' ? customAvatarDataUrl : avatarSelection === 'steam' ? steamAvatarUrl : '';
  const className = `qs-shelf-avatar${isActive ? ' qs-shelf-avatar--active' : ''} ${sizeClassName}`;

  if (avatarSelection === 'app-icon') {
    return (
      <div className={`${className} qs-shelf-avatar--app-icon overflow-hidden`} title="QuestShelf Q">
        <img
          alt=""
          className="h-full w-full object-contain opacity-100"
          src={questShelfAppIconAvatarUrl}
          style={{ filter: 'none', mixBlendMode: 'normal' }}
        />
      </div>
    );
  }

  if (builtInAvatar) {
    return (
      <div className={className} title={builtInAvatar.label}>
        <Icon name={builtInAvatar.icon as IconName} size={20} strokeWidth={2.1} />
      </div>
    );
  }

  return <div className={`${className} overflow-hidden`} title={avatarSelection === 'steam' ? 'Steam avatar' : 'Custom avatar'}>{imageUrl ? <img className="h-full w-full object-cover" src={imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <span>Q</span>}</div>;
}

type ShelfIdentityEditorProps = {
  identity: ShelfIdentitySettings;
  onIdentityChange: (identity: ShelfIdentitySettings) => void;
  shelfNamePlaceholder?: string;
  steamAvatarUrl?: string;
  steamPersonaName?: string;
};

export function ShelfIdentityEditor({ identity, onIdentityChange, shelfNamePlaceholder = 'Loopak\'s QuestShelf', steamAvatarUrl, steamPersonaName }: ShelfIdentityEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const setSelection = (avatarSelection: ShelfAvatarSelection) => onIdentityChange({ ...identity, avatarSelection, shelfAvatar: avatarSelection });
  async function handleUpload(file?: File) {
    if (!file) return;
    try {
      const customAvatarDataUrl = await resizeAvatarFile(file);
      onIdentityChange({ ...identity, avatarSelection: 'custom', shelfAvatar: 'custom', customAvatarDataUrl });
      setUploadStatus('Custom avatar saved locally.');
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : 'Avatar upload failed.');
    }
  }
  const options: Array<{ label: string; value: ShelfAvatarSelection; recommended?: boolean }> = [
    { label: 'QuestShelf Q', value: 'app-icon' },
    ...(steamAvatarUrl ? [{ label: `Steam avatar${steamPersonaName ? ` · ${steamPersonaName}` : ''}`, value: 'steam' as const, recommended: true }] : []),
    ...builtInAvatars.map((avatar) => ({ label: avatar.label, value: `built-in:${avatar.id}` as ShelfAvatarSelection })),
    ...(identity.customAvatarDataUrl ? [{ label: 'Custom upload', value: 'custom' as const }] : []),
  ];
  return <div className="space-y-4">
    <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shelf Name</span><input className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" maxLength={48} onChange={(event) => onIdentityChange({ ...identity, shelfName: event.target.value })} placeholder={shelfNamePlaceholder} value={identity.shelfName} /></label>
    <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Avatar</div><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{options.map((option) => <button aria-pressed={identity.avatarSelection === option.value} className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${identity.avatarSelection === option.value ? 'border-mint/60 bg-mint/10 text-white shadow-glow' : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/35'}`} key={option.value} onClick={() => setSelection(option.value)} type="button"><ShelfAvatar {...identity} avatarSelection={option.value} isActive={identity.avatarSelection === option.value} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-11 w-11" /><span><strong>{option.label}</strong>{option.recommended ? <span className="mt-1 block text-xs text-mint">Recommended</span> : null}</span></button>)}</div></div>
    <div className="flex flex-wrap items-center gap-2"><input accept="image/*" className="hidden" onChange={(event) => void handleUpload(event.target.files?.[0])} ref={inputRef} type="file" /><button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 hover:bg-mint/10" onClick={() => inputRef.current?.click()} type="button">Upload custom avatar</button><span className="text-xs text-slate-500">Resized locally for PWA and Android storage.</span></div>{uploadStatus ? <div className="rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2 text-sm text-slate-300">{uploadStatus}</div> : null}
  </div>;
}
