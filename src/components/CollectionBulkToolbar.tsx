import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { GameStatus } from '../types/game';

const STATUSES: GameStatus[] = ['Finished', 'Playing', 'Paused', 'Want to play', 'Dropped'];

type OpenMenu = 'status' | 'data' | 'remove' | null;

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
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  useEffect(() => {
    if (openMenu === null) return;

    function handlePointerDown(event: PointerEvent) {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  function toggleMenu(menu: Exclude<OpenMenu, null>) {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  }

  function runAndClose(fn: () => void) {
    setOpenMenu(null);
    fn();
  }

  const disabled = selectedCount === 0;

  const btnCls =
    'h-9 shrink-0 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
  const summaryCls =
    'h-9 shrink-0 cursor-pointer rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white select-none flex items-center gap-1';
  const itemCls =
    'flex w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div ref={toolbarRef} className="qs-bulk-toolbar mt-2 flex flex-wrap items-center gap-2 border-t border-mint/15 pt-2">
      <span className="shrink-0 text-sm font-semibold tabular-nums text-mint">{selectedCount} selected</span>

      <button className={btnCls} onClick={onSelectAll} type="button">
        All
      </button>
      <button className={btnCls} onClick={onClearSelection} type="button">
        Clear
      </button>

      <span className="h-5 w-px shrink-0 bg-white/10" aria-hidden="true" />

      {/* Status menu */}
      <details className="qs-toolbar-menu shrink-0" open={openMenu === 'status'}>
        <summary
          className={summaryCls}
          onClick={(e) => { e.preventDefault(); toggleMenu('status'); }}
        >
          Status <span aria-hidden="true" className="opacity-60 text-xs">▾</span>
        </summary>
        <div className="qs-toolbar-menu-panel qs-toolbar-menu-panel--start">
          {STATUSES.map((status) => (
            <button
              key={status}
              className={itemCls}
              disabled={disabled}
              onClick={() => runAndClose(() => onStatusChange(status))}
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
                onClick={() => runAndClose(onAddToWishlist)}
                type="button"
              >
                Add to Wishlist
              </button>
            </>
          ) : null}
        </div>
      </details>

      {/* Data menu */}
      <details className="qs-toolbar-menu shrink-0" open={openMenu === 'data'}>
        <summary
          className={summaryCls}
          onClick={(e) => { e.preventDefault(); toggleMenu('data'); }}
        >
          Data <span aria-hidden="true" className="opacity-60 text-xs">▾</span>
        </summary>
        <div className="qs-toolbar-menu-panel qs-toolbar-menu-panel--start">
          <button className={itemCls} disabled={disabled} onClick={() => runAndClose(onEnrich)} type="button">
            Enrich selected
          </button>
          <button
            className={itemCls}
            disabled={disabled || isHltbSyncing}
            onClick={() => runAndClose(onSyncHltb)}
            type="button"
          >
            {isHltbSyncing ? t('hltb.syncing') : t('hltb.sync')}
          </button>
          {onRefreshSteamPlaytime ? (
            <button
              className={itemCls}
              disabled={disabled || isSteamPlaytimeSyncing}
              onClick={() => runAndClose(onRefreshSteamPlaytime)}
              type="button"
            >
              {isSteamPlaytimeSyncing ? t('collection.syncingSteamPlaytime') : 'Refresh Steam Playtime'}
            </button>
          ) : null}
          {onSyncSteamAchievements ? (
            <button
              className={itemCls}
              disabled={disabled}
              onClick={() => runAndClose(onSyncSteamAchievements)}
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
              onClick={() => runAndClose(onSyncWishlistDeals)}
              type="button"
            >
              {isWishlistDealSyncing ? t('itad.syncingDeals') : t('itad.syncDeals')}
            </button>
          ) : null}
        </div>
      </details>

      {/* Remove (danger) menu */}
      <details className="qs-toolbar-menu shrink-0" open={openMenu === 'remove'}>
        <summary
          className={`${summaryCls} border-red-400/25 text-red-300 hover:bg-red-500/10 hover:text-red-200`}
          onClick={(e) => { e.preventDefault(); toggleMenu('remove'); }}
        >
          Remove <span aria-hidden="true" className="opacity-60 text-xs">▾</span>
        </summary>
        <div className="qs-toolbar-menu-panel qs-toolbar-menu-panel--start">
          <button
            className={`${itemCls} text-red-300 hover:bg-red-500/10 hover:text-red-200`}
            disabled={disabled}
            onClick={() => runAndClose(onRemove)}
            type="button"
          >
            Remove selected
          </button>
          {onRemoveAndIgnore ? (
            <button
              className={`${itemCls} text-red-300 hover:bg-red-500/10 hover:text-red-200`}
              disabled={disabled}
              onClick={() => runAndClose(onRemoveAndIgnore)}
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
