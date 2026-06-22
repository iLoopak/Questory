export type DailyQuestResult = {
  date: string;           // YYYY-MM-DD
  gameId: string;
  solved: boolean;
  score: number;
  remainingTime: number;  // seconds left when solved/failed
  hintsUsed: number;      // 0–3
  wrongGuesses: string[]; // game IDs
};

export type DailyQuestSession = {
  date: string;      // YYYY-MM-DD
  gameId: string;
  startedAt: number; // ms timestamp (Date.now())
  completed: boolean;
  result: DailyQuestResult | null;
};

// 0 = first reveal, 4 = fully revealed (solved/failed)
export type RevealStage = 0 | 1 | 2 | 3 | 4;

export type WeeklyStats = {
  weekStart: string;        // YYYY-MM-DD Monday
  played: number;
  solved: number;
  totalScore: number;
  avgScore: number;
  avgRemainingTime: number;
  currentStreak: number;    // consecutive solved days ending today
};
