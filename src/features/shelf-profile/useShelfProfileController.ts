import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { getPersonalizedQuestShelfTitle, loadAppPersonalizationSettings, sanitizeLibraryOwnerNickname, saveAppPersonalizationSettings } from '../../lib/appPersonalization';
import { getResolvedShelfName, loadShelfIdentitySettings, normalizeShelfIdentitySettings, saveShelfIdentitySettings, type ShelfIdentitySettings } from '../../lib/shelfIdentity';
import type { Game } from '../../types/game';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';

export function useShelfProfileController(games: Game[], platformQueueState: PlatformQueueState, steamProfileName: string) {
  const { language } = useI18n();
  const [libraryOwnerNickname, setLibraryOwnerNicknameState] = useState(() => loadAppPersonalizationSettings().libraryOwnerNickname);
  const [shelfIdentity, setShelfIdentityState] = useState<ShelfIdentitySettings>(() => loadShelfIdentitySettings());
  const [isShelfProfileOpen, setIsShelfProfileOpen] = useState(false);
  const shelfProfileRef = useRef<HTMLDivElement | null>(null);

  const legacyQuestShelfTitle = useMemo(() => getPersonalizedQuestShelfTitle(libraryOwnerNickname, steamProfileName), [libraryOwnerNickname, steamProfileName]);
  const personalizedQuestShelfTitle = useMemo(() => getResolvedShelfName(shelfIdentity.shelfName, legacyQuestShelfTitle, language), [language, legacyQuestShelfTitle, shelfIdentity.shelfName]);
  const shelfOverview = useMemo(() => ({
    games: games.filter((game) => game.collectionType === 'library').length,
    platforms: platformQueueState.activePlatforms.length,
    playing: games.filter((game) => game.collectionType === 'library' && game.status === 'Playing').length,
    queue: platformQueueState.entries.length,
  }), [games, platformQueueState.activePlatforms.length, platformQueueState.entries.length]);

  function setShelfIdentity(value: ShelfIdentitySettings) { const normalizedValue = normalizeShelfIdentitySettings(value); setShelfIdentityState(normalizedValue); saveShelfIdentitySettings(normalizedValue); }
  function setLibraryOwnerNickname(value: string) {
    const libraryOwnerNickname = sanitizeLibraryOwnerNickname(value);
    setLibraryOwnerNicknameState(libraryOwnerNickname);
    saveAppPersonalizationSettings({ libraryOwnerNickname });
  }

  useEffect(() => { document.title = personalizedQuestShelfTitle; }, [personalizedQuestShelfTitle]);
  useEffect(() => {
    if (!isShelfProfileOpen) return;
    function handlePointerDown(event: PointerEvent) { if (!shelfProfileRef.current?.contains(event.target as Node)) setIsShelfProfileOpen(false); }
    function handleKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') setIsShelfProfileOpen(false); }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('pointerdown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown); };
  }, [isShelfProfileOpen]);

  return { isShelfProfileOpen, libraryOwnerNickname, personalizedQuestShelfTitle, setIsShelfProfileOpen, setLibraryOwnerNickname, setShelfIdentity, shelfIdentity, shelfOverview, shelfProfileRef };
}
