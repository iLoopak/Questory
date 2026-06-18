import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { GameStatus } from '../types/game';

const STATUSES: GameStatus[] = ['Finished', 'Playing', 'Paused', 'Want to play', 'Dropped'];

type CollectionBulkToolbarProps = {
  collectionType: 'library' | 'wishlist';
  selectedCount: number;
  isHltbSyncing: boolean;
  isSteamPlaytimeSyncing: boolean;
  isWishlistDealSyncing: boolean;
  isWishlistDealSyncDisabled: boolean;
  wishlistDealSyncTitle?: string;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onStatusChange: (status: GameStatus) => void;
  onEnrich: () => void;
  onSyncHltb: () => void;
  onAddToWishlist?: () => void;
  onRefreshSteamPlaytime?: () => void;
  onSyncSteamAchievements?: () => void;
  onSyncWishlistDeals?: () => void;
  onRemove: () => void;
  onRemoveAndIgnore?: () => void;
};

export function CollectionBulkToolbar({
  selectedCount,
  isHltbSyncing,
  isSteamPlaytimeSyncing,
  isWishlistDealSyncing,
  isWishlistDealSyncDisabled,
  wishlistDealSyncTitle,
  onSelectAll,
  onClearSelection,
  onStatusChange,
  onEnrich,
  onSyncHltb,
  onAddToWishlist,
  onRefreshSteamPlaytime,
  onSyncSteamAchievements,
  onSyncWishlistDeals,
  onRemove,
  onRemoveAndIgnore,
}: CollectionBulkToolbarProps) {
  const { t } = useI18n();
  const statusMenuRef = useRef<HTMLDetailsElement | null>(null);
  const dataMenuRef = useRef<HTMLDetailsElement | null>(null);
  const dangerMenuRef = useRef<HTMLDetailsElement | null>(null);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [isDangerOpen, setIsDangerOpen] = useState(false);

  useEffect(() => {
    if (!isStatusOpen && !isDataOpen && !isDangerOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        statusMenuRef.current?.contains(target) ||
        dataMenuRef.current?.contains(target) ||
        dangerMenuRef.current?.contains(target)
      ) return;
      setIsStatusOpen(false);
      setIsDataOpen(false);
      setIsDangerOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsStatusOpen(false);
        setIsDataOpen(false);
        setIsDangerOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isStatusOpen, isDataOpen, isDangerOpen]);

  function closeAll() {
    setIsStatusOpen(false);
    setIsDataOpen(false);
    setIsDangerOpen(false);
  }

  const disabled = selectedCount === 0;

  const btnCls =
    'h-9 shrink-0 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
  const summaryCls =
    'h-9 shrink-0 cursor-pointer rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white select-none flex items-center gap-1';
  const itemCls =
    'flex w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="qs-bulk-toolbar mt-2 flex flex-wrap items-center gap-2 border-t border-mint/15 pt-2">
      <span className="shrink-0 text-sm font-semibold tabular-nums text-mint">{selectedCount} selected</span>

      <button className={btnCls} onClick={onSelectAll} type="button">
        All
      </button>
      <button className={btnCls} onClick={onClearSelection} type="button">
        Clear
      </button>

      <span className="h-5 w-px shrink-0 bg-white/10" aria-hidden="true" />

      <details
        ref={statusMenuRef}
        className="qs-toolbar-menu shrink-0"
        open={isStatusOpen}
        onToggle={(e) => setIsStatusOpen(e.currentTarget.open)}
      >
        <summary className={summaryCls}>
          Status <span aria-hidden="true" className="opacity-60 text-xs">▾</span>
        </summary>
        <div className="qs-toolbar-menu-panel qs-toolbar-menu-panel--start">
          {STATUSES.map((status) => (
            <button
              key={status}
              className={itemCls}
              disabled={disabled}
              onClick={() => { closeAll(); onStatusChange(status); }}
              type="button"
            >
              {status}
            </button>
          ))}
          {onAddToWishlist ? (
            <>
              <hr className="border-skyglass/15" />
              <button
                className={itemCls}
                disabled={disabled}
                onClick={() => { closeAll(); onAddToWishlist(); }}
                type="button"
              >
                Add to Wishlist
              </button>
            </>
          ) : null}
        </div>
      </details>

      <details
        ref={dataMenuRef}
        className="qs-toolbar-menu shrink-0"
        open={isDataOpen}
        onToggle={(e) => setIsDataOpen(e.currentTarget.open)}
      >
        <summary className={summaryCls}>
          Data <span aria-hidden="true" className="opacity-60 text-xs">▾</span>
        </summary>
        <div className="qs-toolbar-menu-panel qs-toolbar-menu-panel--start">
          <button className={itemCls} disabled={disabled} onClick={() => { closeAll(); onEnrich(); }} type="button">
            Enrich selected
          </button>
          <button
            className={itemCls}
            disabled={disabled || isHltbSyncing}
            onClick={() => { closeAll(); onSyncHltb(); }}
            type="button"
          >
            {isHltbSyncing ? t('hltb.syncing') : t('hltb.sync')}
          </button>
          {onRefreshSteamPlaytime ? (
            <button
              className={itemCls}
              disabled={disabled || isSteamPlaytimeSyncing}
              onClick={() => { closeAll(); onRefreshSteamPlaytime(); }}
              type="button"
            >
              {isSteamPlaytimeSyncing ? t('collection.syncingSteamPlaytime') : 'Refresh Steam Playtime'}
            </button>
          ) : null}
          {onSyncSteamAchievements ? (
            <button
              className={itemCls}
              disabled={disabled}
              onClick={() => { closeAll(); onSyncSteamAchievements(); }}
              type="button"
            >
              Sync Steam Achievements
            </button>
          ) : null}
          {onSyncWishlistDeals ? (
            <button
              className={itemCls}
              disabled={isWishlistDealSyncDisabled}
              title={wishlistDealSyncTitle}
              onClick={() => { closeAll(); onSyncWishlistDeals(); }}
              type="button"
            >
              {isWishlistDealSyncing ? t('itad.syncingDeals') : t('itad.syncDeals')}
            </button>
          ) : null}
        </div>
      </details>

      <details
        ref={dangerMenuRef}
        className="qs-toolbar-menu shrink-0"
        open={isDangerOpen}
        onToggle={(e) => setIsDangerOpen(e.currentTarget.open)}
      >
        <summary className={`${summaryCls} border-red-400/25 text-red-300 hover:bg-red-500/10 hover:text-red-200`}>
          Remove <span aria-hidden="true" className="opacity-60 text-xs">▾</span>
        </summary>
        <div className="qs-toolbar-menu-panel qs-toolbar-menu-panel--start">
          <button
            className={`${itemCls} text-red-300 hover:bg-red-500/10 hover:text-red-200`}
            disabled={disabled}
            onClick={() => { closeAll(); onRemove(); }}
            type="button"
          >
            Remove selected
          </button>
          {onRemoveAndIgnore ? (
            <button
              className={`${itemCls} text-red-300 hover:bg-red-500/10 hover:text-red-200`}
              disabled={disabled}
              onClick={() => { closeAll(); onRemoveAndIgnore(); }}
              type="button"
            >
              Remove + Ignore
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
