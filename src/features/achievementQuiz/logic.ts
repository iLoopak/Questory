import type { Game } from '../../types/game';
import { getTodayDate, hashString } from '../dailyQuest/logic';
import type { QuizQuestion, QuizSession, WeeklyQuizStats } from './types';

export { getTodayDate, hashString };

const ADJECTIVES = [
  'Iron', 'Golden', 'Silver', 'Shadow', 'Storm', 'Sacred', 'Ancient', 'Lost',
  'Forgotten', 'Burning', 'Frozen', 'Silent', 'Dark', 'Eternal', 'Hollow',
  'Cursed', 'Blazing', 'Spectral', 'Crimson', 'Shattered',
];

const NOUNS = [
  'Relic', 'Protocol', 'Covenant', 'Cipher', 'Sentinel', 'Vanguard', 'Throne',
  'Oracle', 'Wanderer', 'Chronicle', 'Dominion', 'Nexus', 'Summit', 'Guardian',
  'Catalyst', 'Harbinger', 'Mantle', 'Crucible', 'Requiem', 'Arbiter',
];

function lcgNext(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const r = [...arr];
  let s = seed >>> 0;
  for (let i = r.length - 1; i > 0; i--) {
    s = lcgNext(s);
    const j = s % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function generateFakeName(existingLower: Set<string>, seed: number): string {
  let s = seed;
  for (let attempt = 0; attempt < 200; attempt++) {
    s = lcgNext(s);
    const adjIdx = s % ADJECTIVES.length;
    s = lcgNext(s);
    const nounIdx = s % NOUNS.length;
    const name = `${ADJECTIVES[adjIdx]} ${NOUNS[nounIdx]}`;
    if (!existingLower.has(name.toLowerCase())) return name;
  }
  return 'The Secret Achievement';
}

export function getEligibleGames(games: Game[]): Game[] {
  return games.filter((g) => {
    if (g.collectionType !== 'library') return false;
    const achs = g.steamAchievements;
    if (!Array.isArray(achs) || achs.length < 10) return false;
    return achs.filter((a) => !a.hidden).length >= 5;
  });
}

export function selectDailyGame(eligible: Game[], date: string): Game | null {
  if (eligible.length === 0) return null;
  const seed = hashString(date + 'achievement');
  return eligible[seed % eligible.length];
}

export function generateQuestion(game: Game, date: string): QuizQuestion | null {
  const achs = game.steamAchievements;
  if (!Array.isArray(achs)) return null;
  const visible = achs.filter((a) => !a.hidden);
  if (visible.length < 3) return null;

  let s = hashString(date + 'achievement' + game.id);

  // Pick 3 distinct real achievement displayNames
  const pickedIndices = new Set<number>();
  const realNames: string[] = [];
  for (let attempts = 0; realNames.length < 3 && attempts < 500; attempts++) {
    s = lcgNext(s);
    const idx = s % visible.length;
    if (!pickedIndices.has(idx)) {
      pickedIndices.add(idx);
      realNames.push(visible[idx].displayName);
    }
  }
  if (realNames.length < 3) return null;

  // Generate a fake name that doesn't match any existing achievement
  const existingLower = new Set(achs.map((a) => a.displayName.toLowerCase()));
  s = lcgNext(s);
  const fakeOption = generateFakeName(existingLower, s);

  // Seeded shuffle of all 4 options
  s = lcgNext(s);
  const options = seededShuffle([...realNames, fakeOption], s);

  return { gameId: game.id, gameTitle: game.title, options, fakeOption };
}

export function calculateScore(timeRemaining: number): number {
  if (timeRemaining >= 50) return 100;
  if (timeRemaining >= 40) return 80;
  if (timeRemaining >= 20) return 60;
  return 40;
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function computeWeeklyStats(sessions: QuizSession[], today: string): WeeklyQuizStats {
  const weekStart = getMondayOf(today);
  const weekSessions = sessions.filter((s) => s.result && s.date >= weekStart && s.date <= today);
  const played = weekSessions.length;
  const correctArr = weekSessions.filter((s) => s.result?.correct);
  const correct = correctArr.length;
  const totalScore = correctArr.reduce((acc, s) => acc + (s.result?.score ?? 0), 0);
  const avgScore = correct > 0 ? Math.round(totalScore / correct) : 0;

  const correctDates = new Set(sessions.filter((s) => s.result?.correct).map((s) => s.date));
  let currentStreak = 0;
  let cursor = today;
  while (correctDates.has(cursor)) {
    currentStreak++;
    const d = new Date(cursor + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }

  const bestStreak = computeBestStreak(sessions);
  return { weekStart, played, correct, totalScore, avgScore, currentStreak, bestStreak };
}

function computeBestStreak(sessions: QuizSession[]): number {
  const correctDates = sessions
    .filter((s) => s.result?.correct)
    .map((s) => s.date)
    .sort();

  if (correctDates.length === 0) return 0;
  let best = 1;
  let current = 1;

  for (let i = 1; i < correctDates.length; i++) {
    const prev = new Date(correctDates[i - 1] + 'T12:00:00');
    const curr = new Date(correctDates[i] + 'T12:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) {
      current++;
      if (current > best) best = current;
    } else if (diff > 1) {
      current = 1;
    }
  }

  return best;
}
