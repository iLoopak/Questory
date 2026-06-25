import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  fetchSteamGridDbArtworkCandidates,
  type SteamGridDbArtworkCandidate,
  type SteamGridDbArtworkCandidates,
} from '../lib/steamGridDbArtwork';
import type { Game } from '../types/game';
import { useI18n, type TFunction } from '../i18n';
import { Icon } from './Icon';

type PickerTab = 'cover' | 'wideCover' | 'hero' | 'logo' | 'icon';
type PickerStatus = 'loading' | 'ready' | 'error' | 'no-key' | 'no-match';

type TabConfig = {
  id: PickerTab;
  labelKey: Parameters<TFunction>[0];
  gameField: keyof Pick<Game, 'coverImage' | 'wideCoverImage' | 'heroImage' | 'logoImage' | 'iconImage'>;
  aspect: string;
  cols: string;
  objectFit: 'cover' | 'contain';
};

const TABS: TabConfig[] = [
  { id: 'cover', labelKey: 'artwork.picker.tabCover', gameField: 'coverImage', aspect: 'aspect-[2/3]', cols: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5', objectFit: 'cover' },
  { id: 'wideCover', labelKey: 'artwork.picker.tabWideCover', gameField: 'wideCoverImage', aspect: 'aspect-[460/215]', cols: 'grid-cols-2 sm:grid-cols-3', objectFit: 'cover' },
  { id: 'hero', labelKey: 'artwork.picker.tabHero', gameField: 'heroImage', aspect: 'aspect-[1920/620]', cols: 'grid-cols-1 sm:grid-cols-2', objectFit: 'cover' },
  { id: 'logo', labelKey: 'artwork.picker.tabLogo', gameField: 'logoImage', aspect: 'aspect-square', cols: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6', objectFit: 'contain' },
  { id: 'icon', labelKey: 'artwork.picker.tabIcon', gameField: 'iconImage', aspect: 'aspect-square', cols: 'grid-cols-5 sm:grid-cols-6 md:grid-cols-8', objectFit: 'contain' },
];

export function SteamGridDbArtworkPickerModal({
  game,
  onClose,
  onSave,
}: {
  game: Game;
  onClose: () => void;
  onSave: (changes: Partial<Game>) => void;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<PickerStatus>('loading');
  const [candidates, setCandidates] = useState<SteamGridDbArtworkCandidates | null>(null);
  const [activeTab, setActiveTab] = useState<PickerTab>('cover');
  const [changed, setChanged] = useState<Set<PickerTab>>(new Set());
  const [selections, setSelections] = useState<Partial<Record<PickerTab, string>>>({
    cover: game.coverImage || undefined,
    wideCover: game.wideCoverImage || undefined,
    hero: game.heroImage || undefined,
    logo: game.logoImage || undefined,
    icon: game.iconImage || undefined,
  });
  useScrollLock();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchSteamGridDbArtworkCandidates(game);
      if (cancelled) return;
      if (result.status === 'ok') {
        setCandidates(result.candidates);
        setStatus('ready');
      } else {
        setStatus(result.status);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [game.id]);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  function handleSelect(tab: PickerTab, url: string) {
    setSelections((prev) => ({ ...prev, [tab]: url }));
    setChanged((prev) => new Set(prev).add(tab));
  }

  function handleApply() {
    const changes: Partial<Game> = {};
    for (const tab of changed) {
      const url = selections[tab];
      if (!url) continue;
      const tabConfig = TABS.find((tc) => tc.id === tab);
      if (tabConfig) changes[tabConfig.gameField] = url;
    }
    if (Object.keys(changes).length > 0) {
      changes.artworkSource = 'steamgriddb';
      changes.artworkUpdatedAt = new Date().toISOString();
      onSave(changes);
    }
    onClose();
  }

  const activeTabConfig = TABS.find((tab) => tab.id === activeTab)!;
  const tabCandidates: SteamGridDbArtworkCandidate[] = candidates ? candidates[activeTab] : [];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/70 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${t('artwork.picker.title')} — ${game.title}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-950 shadow-panel sm:max-h-[80dvh] sm:rounded-2xl"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-spread text-slate-500">SteamGridDB</p>
            <h3 className="text-lg font-semibold text-white">{t('artwork.picker.title')}</h3>
            <p className="mt-0.5 truncate text-sm text-slate-400">{game.title}</p>
          </div>
          <button
            className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 transition hover:text-white"
            onClick={onClose}
            type="button"
          >
            {t('action.close')}
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto px-4 pt-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-mint/20 text-mint'
                  : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {status === 'loading' ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-slate-400">{t('artwork.picker.loading')}</p>
            </div>
          ) : status === 'no-key' ? (
            <div className="flex h-40 items-center justify-center px-6 text-center">
              <p className="text-sm text-slate-400">{t('artwork.picker.noKey')}</p>
            </div>
          ) : status === 'no-match' ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-slate-400">{t('artwork.picker.noMatch')}</p>
            </div>
          ) : status === 'error' ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-red-400">{t('artwork.picker.error')}</p>
            </div>
          ) : tabCandidates.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-slate-400">{t('artwork.picker.empty')}</p>
            </div>
          ) : (
            <div className={`grid gap-2 ${activeTabConfig.cols}`}>
              {tabCandidates.map((candidate) => (
                <ArtworkCandidateCell
                  key={candidate.url}
                  aspect={activeTabConfig.aspect}
                  candidate={candidate}
                  isSelected={selections[activeTab] === candidate.url}
                  objectFit={activeTabConfig.objectFit}
                  onSelect={() => handleSelect(activeTab, candidate.url)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 p-4">
          <button
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:text-white"
            onClick={onClose}
            type="button"
          >
            {t('action.cancel')}
          </button>
          <button
            className="rounded-xl border border-mint/30 bg-mint/10 px-4 py-2 text-sm font-semibold text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={status !== 'ready' || changed.size === 0}
            onClick={handleApply}
            type="button"
          >
            {t('artwork.picker.apply')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ArtworkCandidateCell({
  aspect,
  candidate,
  isSelected,
  objectFit,
  onSelect,
}: {
  aspect: string;
  candidate: SteamGridDbArtworkCandidate;
  isSelected: boolean;
  objectFit: 'cover' | 'contain';
  onSelect: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <button
      className={`relative overflow-hidden rounded-lg border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1 focus-visible:ring-offset-ink-950 ${
        isSelected
          ? 'border-mint'
          : 'border-white/10 hover:border-white/30'
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className={`${aspect} bg-ink-800`}>
        <img
          alt=""
          className={`h-full w-full ${objectFit === 'contain' ? 'object-contain p-1' : 'object-cover'}`}
          decoding="async"
          loading="lazy"
          src={candidate.url}
          onError={() => setFailed(true)}
        />
      </div>
      {isSelected ? (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-mint text-ink-950">
            <Icon name="check" />
          </span>
        </div>
      ) : null}
    </button>
  );
}
