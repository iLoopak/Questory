import { useRef, useState } from 'react';
import { builtInAvatars, questShelfAppIconAvatarUrl, resizeAvatarFile, type ShelfAvatarSelection, type ShelfIdentitySettings } from '../lib/shelfIdentity';

export function ShelfAvatar({ avatarSelection, customAvatarDataUrl, steamAvatarUrl, sizeClassName = 'h-10 w-10' }: ShelfIdentitySettings & { steamAvatarUrl?: string; sizeClassName?: string }) {
  const selectedBuiltInId = avatarSelection.startsWith('built-in:') ? avatarSelection.slice('built-in:'.length) : '';
  const builtInAvatar = builtInAvatars.find((avatar) => avatar.id === selectedBuiltInId);
  const imageUrl = avatarSelection === 'custom' ? customAvatarDataUrl : avatarSelection === 'steam' ? steamAvatarUrl : avatarSelection === 'app-icon' ? questShelfAppIconAvatarUrl : '';
  if (builtInAvatar) return <div className={`grid shrink-0 place-items-center rounded-full border border-mint/35 bg-gradient-to-br ${builtInAvatar.gradient} text-lg shadow-glow ${sizeClassName}`} title={builtInAvatar.label}>{builtInAvatar.glyph}</div>;
  return <div className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-mint/35 bg-ink-950 text-[10px] font-semibold text-mint shadow-glow ${sizeClassName}`}>{imageUrl ? <img className="h-full w-full object-cover" src={imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : 'QS'}</div>;
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
    { label: 'QuestShelf icon', value: 'app-icon' },
    ...(steamAvatarUrl ? [{ label: `Steam avatar${steamPersonaName ? ` · ${steamPersonaName}` : ''}`, value: 'steam' as const, recommended: true }] : []),
    ...builtInAvatars.map((avatar) => ({ label: avatar.label, value: `built-in:${avatar.id}` as ShelfAvatarSelection })),
    ...(identity.customAvatarDataUrl ? [{ label: 'Custom upload', value: 'custom' as const }] : []),
  ];
  return <div className="space-y-4">
    <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shelf Name</span><input className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" maxLength={48} onChange={(event) => onIdentityChange({ ...identity, shelfName: event.target.value })} placeholder={shelfNamePlaceholder} value={identity.shelfName} /></label>
    <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Avatar</div><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{options.map((option) => <button aria-pressed={identity.avatarSelection === option.value} className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${identity.avatarSelection === option.value ? 'border-mint/60 bg-mint/10 text-white shadow-glow' : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/35'}`} key={option.value} onClick={() => setSelection(option.value)} type="button"><ShelfAvatar {...identity} avatarSelection={option.value} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-11 w-11" /><span><strong>{option.label}</strong>{option.recommended ? <span className="mt-1 block text-xs text-mint">Recommended</span> : null}</span></button>)}</div></div>
    <div className="flex flex-wrap items-center gap-2"><input accept="image/*" className="hidden" onChange={(event) => void handleUpload(event.target.files?.[0])} ref={inputRef} type="file" /><button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 hover:bg-mint/10" onClick={() => inputRef.current?.click()} type="button">Upload custom avatar</button><span className="text-xs text-slate-500">Resized locally for PWA and Android storage.</span></div>{uploadStatus ? <div className="rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2 text-sm text-slate-300">{uploadStatus}</div> : null}
  </div>;
}
