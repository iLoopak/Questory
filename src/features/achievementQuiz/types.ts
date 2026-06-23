export type QuizResult = {
  date: string;
  gameId: string;
  correct: boolean;
  score: number;
  timeRemaining: number;
  selectedAnswer: string;
  correctAnswer: string;
};

export type QuizSession = {
  date: string;
  gameId: string;
  startedAt: number;
  completed: boolean;
  result: QuizResult | null;
};

export type QuizQuestion = {
  gameId: string;
  gameTitle: string;
  options: string[];
  fakeOption: string;
};

export type WeeklyQuizStats = {
  weekStart: string;
  played: number;
  correct: number;
  totalScore: number;
  avgScore: number;
  currentStreak: number;
  bestStreak: number;
};
