import type { ChangeEvent } from 'react';
import { platformAccentPalette, platformArtworkPresetOptions, type PlatformArtworkPreset } from '../lib/platformQueueStorage';
import { useI18n } from '../i18n';

const maxUploadedArtworkWidth = 1440;
const maxUploadedArtworkHeight = 480;
const uploadedArtworkMimeType = 'image/jpeg';
const uploadedArtworkQuality = 0.86;

type PlatformIdentityFieldsProps = {
  accentColor: string;
  artworkUrl: string;
  platformTag: string;
  onAccentColorChange: (accentColor: string) => void;
  onArtworkUrlChange: (artworkUrl: string) => void;
  onPlatformTagChange: (platformTag: string) => void;
  onPresetArtwork: (preset: PlatformArtworkPreset) => void;
};

export function PlatformIdentityFields({
  accentColor,
  artworkUrl,
  platformTag,
  onAccentColorChange,
  onArtworkUrlChange,
  onPlatformTagChange,
  onPresetArtwork,
}: PlatformIdentityFieldsProps) {
  const { t } = useI18n();

  function uploadArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void readPlatformArtworkFile(file).then(onArtworkUrlChange);
    event.target.value = '';
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-1">
        <span className="text-xs font-semibold text-slate-400">{t('settings.accentColor')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <input className="h-9 w-12 rounded border border-white/10 bg-transparent" type="color" value={accentColor} onChange={(event) => onAccentColorChange(event.target.value)} />
          {platformAccentPalette.map((color) => (
            <button key={color} aria-label={t('settings.useColor').replace('{color}', color)} className="h-7 w-7 rounded-full border border-white/20" style={{ backgroundColor: color }} onClick={() => onAccentColorChange(color)} type="button" />
          ))}
        </div>
      </label>
      <label className="grid gap-1">
        <span className="text-xs font-semibold text-slate-400">{t('settings.platformArtworkUrl')}</span>
        <input className="h-9 rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint" placeholder="https://... or data:image/..." value={artworkUrl} onChange={(event) => onArtworkUrlChange(event.target.value)} />
      </label>
      <label className="grid gap-1">
        <span className="text-xs font-semibold text-slate-400">{t('settings.uploadImage')}</span>
        <input className="text-xs text-slate-300 file:mr-2 file:h-8 file:rounded file:border-0 file:bg-mint file:px-2 file:text-xs file:font-semibold file:text-ink-950" accept="image/*" type="file" onChange={uploadArtwork} />
        <span className="text-xs text-slate-500">Recommended size: 1080 × 340 px. Uploaded files are saved as a persistent Data URL for reloads and backups.</span>
      </label>
      <div>
        <span className="text-xs font-semibold text-slate-400">{t('settings.presetImage')}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {platformArtworkPresetOptions.map((preset) => (
            <button key={preset} className="min-h-9 rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/10" onClick={() => onPresetArtwork(preset)} type="button">{preset}</button>
          ))}
          <button className="min-h-9 rounded-md border border-red-300/30 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/10" onClick={() => onArtworkUrlChange('')} type="button">{t('toolbar.clear')}</button>
        </div>
      </div>
      <label className="grid gap-1">
        <span className="text-xs font-semibold text-slate-400">{t('settings.platformTag')}</span>
        <input className="h-9 rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint" placeholder="handheld, pc, retro..." value={platformTag} onChange={(event) => onPlatformTagChange(event.target.value)} />
        <span className="text-xs text-slate-500">{t('settings.platformTagHelp')}</span>
      </label>
    </div>
  );
}

async function readPlatformArtworkFile(file: File): Promise<string> {
  const sourceDataUrl = await readFileAsDataUrl(file);

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return sourceDataUrl;
  }

  const image = await loadImage(sourceDataUrl);
  const scale = Math.min(1, maxUploadedArtworkWidth / image.naturalWidth, maxUploadedArtworkHeight / image.naturalHeight);

  if (scale >= 1 && sourceDataUrl.length <= 750_000) {
    return sourceDataUrl;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');

  if (!context) {
    return sourceDataUrl;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(uploadedArtworkMimeType, uploadedArtworkQuality);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Uploaded artwork could not be read as a Data URL.'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Uploaded artwork could not be read.')));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Uploaded artwork could not be decoded.')));
    image.src = src;
  });
}
