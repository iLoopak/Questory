import type { Game } from '../../types/game';
import { isMissingOrGeneratedCover } from '../../lib/gameCoverImages';
import type { DailyQuestSession, RevealStage, WeeklyStats } from './types';

// ─── Date utilities ──────────────────────────────────────────────────────────

export function getTodayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Hash ─────────────────────────────────────────────────────────────────────

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

// ─── Eligible games ───────────────────────────────────────────────────────────

export function getEligibleGames(games: Game[]): Game[] {
  return games.filter(
    (g) =>
      g.collectionType === 'library' &&
      g.status !== 'Finished' &&
      g.status !== 'Dropped' &&
      !isMissingOrGeneratedCover(g.coverImage),
  );
}

// ─── Daily selection ──────────────────────────────────────────────────────────

export function selectDailyGame(eligible: Game[], date: string): Game | null {
  if (eligible.length === 0) return null;
  const seed = hashString(date);
  return eligible[seed % eligible.length];
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function calculateScore(hintsUsed: number, wrongGuessCount: number): number {
  return Math.max(0, 100 - hintsUsed * 10 - wrongGuessCount * 5);
}

// ─── Hints ───────────────────────────────────────────────────────────────────

function titleHint(title: string): string {
  const words = title.trim().split(/\s+/);
  const first = title[0]?.toUpperCase() ?? '?';
  const last = title[title.length - 1]?.toUpperCase() ?? '?';
  if (words.length === 1) {
    const dashes = '─'.repeat(Math.max(0, title.length - 2));
    return `${first}${dashes}${last} (${title.length} letters)`;
  }
  return `${first}... · ${words.length} word${words.length !== 1 ? 's' : ''}`;
}

export function generateHints(game: Game): [string, string, string] {
  const hint1 = game.platform;

  const genre = game.genres?.[0];
  const year = game.released
    ? new Date(game.released).getFullYear()
    : null;
  const hint2 = genre ? genre : year ? String(year) : '—';

  const hint3 = titleHint(game.title);

  return [hint1, hint2, hint3];
}

// ─── Artwork reveal ───────────────────────────────────────────────────────────

const TILE_COUNTS: Record<RevealStage, number> = { 0: 3, 1: 6, 2: 10, 3: 14, 4: 20 };
const TOTAL_TILES = 20; // 4 cols × 5 rows

function seededShuffle(arr: number[], seed: number): number[] {
  const r = [...arr];
  let s = seed;
  for (let i = r.length - 1; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223;
    const j = (s >>> 0) % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function getRevealedTileIndices(date: string, stage: RevealStage): Set<number> {
  const count = TILE_COUNTS[stage];
  if (count >= TOTAL_TILES) return new Set(Array.from({ length: TOTAL_TILES }, (_, i) => i));
  const seed = hashString(date);
  const shuffled = seededShuffle(Array.from({ length: TOTAL_TILES }, (_, i) => i), seed);
  return new Set(shuffled.slice(0, count));
}

export function stageForRemaining(remaining: number, gameOver: boolean): RevealStage {
  if (gameOver) return 4;
  if (remaining <= 30) return 3;
  if (remaining <= 60) return 2;
  if (remaining <= 90) return 1;
  return 0;
}

export function hintsForRemaining(remaining: number): number {
  if (remaining <= 30) return 3;
  if (remaining <= 60) return 2;
  if (remaining <= 90) return 1;
  return 0;
}

// ─── Weekly stats ─────────────────────────────────────────────────────────────

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon, …
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function computeWeeklyStats(sessions: DailyQuestSession[], today: string): WeeklyStats {
  const weekStart = getMondayOf(today);

  // Sessions this calendar week
  const weekSessions = sessions.filter((s) => s.result && s.date >= weekStart && s.date <= today);
  const played = weekSessions.length;
  const solvedArr = weekSessions.filter((s) => s.result?.solved);
  const solved = solvedArr.length;
  const totalScore = solvedArr.reduce((acc, s) => acc + (s.result?.score ?? 0), 0);
  const avgScore = solved > 0 ? Math.round(totalScore / solved) : 0;
  const totalTime = solvedArr.reduce((acc, s) => acc + (s.result?.remainingTime ?? 0), 0);
  const avgRemainingTime = solved > 0 ? Math.round(totalTime / solved) : 0;

  // Current streak: consecutive days solved, ending today
  let currentStreak = 0;
  const solvedDates = new Set(sessions.filter((s) => s.result?.solved).map((s) => s.date));
  let cursor = today;
  while (solvedDates.has(cursor)) {
    currentStreak++;
    const d = new Date(cursor + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }

  // Best streak: longest consecutive run across all history
  const bestStreak = computeBestStreak(sessions);

  return { weekStart, played, solved, totalScore, avgScore, avgRemainingTime, currentStreak, bestStreak };
}

function computeBestStreak(sessions: DailyQuestSession[]): number {
  const solvedDates = sessions
    .filter((s) => s.result?.solved)
    .map((s) => s.date)
    .sort(); // ISO strings sort chronologically

  if (solvedDates.length === 0) return 0;

  let best = 1;
  let current = 1;

  for (let i = 1; i < solvedDates.length; i++) {
    const prev = new Date(solvedDates[i - 1] + 'T12:00:00');
    const curr = new Date(solvedDates[i] + 'T12:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) {
      current++;
      if (current > best) best = current;
    } else if (diff > 1) {
      current = 1;
    }
    // diff === 0 = duplicate date, skip
  }

  return best;
}
