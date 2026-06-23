const ACHIEVEMENT_GHOST_SEEN_KEY = 'qs-queue-ghost-unlocked-achievements-v1';

export function getSeenAchievementGhostIds(): Set<string> {
  try {
    const stored = localStorage.getItem(ACHIEVEMENT_GHOST_SEEN_KEY);
    return new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function setSeenAchievementGhostIds(ids: Iterable<string>): void {
  try {
    localStorage.setItem(ACHIEVEMENT_GHOST_SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}
