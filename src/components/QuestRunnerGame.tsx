import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 600;
const CANVAS_H = 180;
const GROUND_Y = 148;
const PLAYER_X = 60;
const PLAYER_W = 24;
const PLAYER_H = 28;
const GRAVITY = 0.55;
const JUMP_V = 11.5;
const BASE_SPEED = 4.5;
const MAX_SPEED = 12;
const SPEED_INC = 0.0014;
const STAR_COUNT = 38;
const HIGH_SCORE_KEY = 'questshelf.questRunner.hs.v1';

const OBS_LABELS = ['Backlog', 'Bad Port', 'Day-1 DLC', 'Dead Save', 'Low Batt', 'Frame Drop', 'Crunch', 'Jank', 'Grind'];

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'running' | 'dead';

type Obstacle = { x: number; w: number; h: number; label: string };

type Star = { x: number; y: number; sz: number; sp: number };

type Colors = {
  bg: string;
  ground: string;
  accent: string;
  accentFade: string;
  obs: string;
  obsLine: string;
  obsLabel: string;
};

interface RunnerState {
  phase: Phase;
  playerY: number;    // height above ground (0 = on ground, positive = airborne)
  playerVY: number;   // velocity: positive = moving up, negative = falling
  grounded: boolean;
  obstacles: Obstacle[];
  stars: Star[];
  speed: number;
  score: number;
  highScore: number;
  obsTimer: number;   // counts down in "px of travel"; spawn obstacle at 0
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadHighScore(): number {
  try { return parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10) || 0; } catch { return 0; }
}

function saveHighScore(n: number) {
  try { localStorage.setItem(HIGH_SCORE_KEY, String(n)); } catch { /* ignore */ }
}

function makeStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * CANVAS_W,
    y: 4 + Math.random() * (GROUND_Y - 22),
    sz: Math.random() < 0.22 ? 2 : 1,
    sp: 0.3 + Math.random() * 1.6,
  }));
}

function makeInitialState(hs: number): RunnerState {
  return {
    phase: 'idle',
    playerY: 0,
    playerVY: 0,
    grounded: true,
    obstacles: [],
    stars: makeStars(),
    speed: BASE_SPEED,
    score: 0,
    highScore: hs,
    obsTimer: 280 + Math.random() * 200,
  };
}

function readColors(): Colors {
  const s = getComputedStyle(document.documentElement);
  const a = s.getPropertyValue('--accent-rgb').trim().replace(/\s+/g, ',') || '255,90,44';
  const b = s.getPropertyValue('--ink-950-rgb').trim().replace(/\s+/g, ',') || '13,12,12';
  return {
    bg: `rgb(${b})`,
    ground: '#262222',
    accent: `rgb(${a})`,
    accentFade: `rgba(${a},0.18)`,
    obs: '#353030',
    obsLine: 'rgba(255,255,255,0.04)',
    obsLabel: '#545050',
  };
}

function fillRounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QuestRunnerGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const stateRef = useRef<RunnerState>(makeInitialState(loadHighScore()));
  const colorsRef = useRef<Colors>(readColors());

  const [highScore, setHighScore] = useState(() => stateRef.current.highScore);

  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // Refresh CSS-variable colours after mount (resolved values available then)
  useEffect(() => {
    colorsRef.current = readColors();
  }, []);

  const startGame = useCallback(() => {
    const prevHs = stateRef.current.highScore;
    const next = makeInitialState(prevHs);
    next.phase = 'running';
    // Keep the existing stars so the screen doesn't flash
    next.stars = stateRef.current.stars;
    stateRef.current = next;
  }, []);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'running') {
      startGame();
      return;
    }
    if (s.grounded) {
      s.playerVY = JUMP_V;
      s.grounded = false;
    }
  }, [startGame]);

  // Keyboard: Space / Enter
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        jump();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump]);

  // Auto-focus so controller A-button (activatePrimaryButton → click) works immediately
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    function tick() {
      const s = stateRef.current;
      const c = colorsRef.current;

      // ── Update ────────────────────────────────────────────────────────────
      if (s.phase === 'running') {
        // Speed ramp
        s.speed = Math.min(s.speed + SPEED_INC, MAX_SPEED);

        // Parallax stars
        for (const star of s.stars) {
          star.x -= star.sp * (s.speed / BASE_SPEED);
          if (star.x < -2) {
            star.x = CANVAS_W + Math.random() * 80;
            star.y = 4 + Math.random() * (GROUND_Y - 22);
          }
        }

        // Player physics: playerY = height above ground
        s.playerY += s.playerVY;
        s.playerVY -= GRAVITY;
        if (s.playerY <= 0) {
          s.playerY = 0;
          s.playerVY = 0;
          s.grounded = true;
        }

        // Obstacle spawning
        s.obsTimer -= s.speed;
        if (s.obsTimer <= 0) {
          const h = 28 + Math.floor(Math.random() * 55);
          const w = 18 + Math.floor(Math.random() * 22);
          s.obstacles.push({
            x: CANVAS_W + 8,
            w,
            h,
            label: OBS_LABELS[Math.floor(Math.random() * OBS_LABELS.length)],
          });
          s.obsTimer = 300 + Math.random() * 340;
        }

        // Move + cull obstacles
        for (const ob of s.obstacles) ob.x -= s.speed;
        s.obstacles = s.obstacles.filter(ob => ob.x + ob.w > -20);

        // Score (distance-based)
        s.score += s.speed * 0.028;

        // Collision detection (AABB, 4 px forgiveness on each edge)
        const m = 4;
        const pLeft = PLAYER_X + m;
        const pRight = PLAYER_X + PLAYER_W - m;
        const pBottom = GROUND_Y - s.playerY;      // canvas-Y of player bottom
        const pTop = pBottom - PLAYER_H + m;

        for (const ob of s.obstacles) {
          const oLeft = ob.x + m;
          const oRight = ob.x + ob.w - m;
          const oTop = GROUND_Y - ob.h + m;

          if (pRight > oLeft && pLeft < oRight && pBottom > oTop + m && pTop < GROUND_Y) {
            s.phase = 'dead';
            const finalScore = Math.floor(s.score);
            if (finalScore > s.highScore) {
              s.highScore = finalScore;
              saveHighScore(finalScore);
              setHighScore(finalScore);
            }
            break;
          }
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────

      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      for (const star of s.stars) {
        ctx.fillRect(Math.round(star.x), Math.round(star.y), star.sz, star.sz);
      }

      // Ground line
      ctx.fillStyle = c.ground;
      ctx.fillRect(0, GROUND_Y, CANVAS_W, 2);

      // Obstacles
      ctx.textAlign = 'center';
      for (const ob of s.obstacles) {
        const ox = ob.x;
        const oy = GROUND_Y - ob.h;

        // Main body
        ctx.fillStyle = c.obs;
        fillRounded(ctx, ox, oy, ob.w, ob.h, 3);
        ctx.fill();

        // Horizontal stripe lines (stacked-books look)
        ctx.fillStyle = c.obsLine;
        for (let row = 10; row < ob.h; row += 10) {
          ctx.fillRect(ox + 2, oy + row, ob.w - 4, 1);
        }

        // Label above obstacle
        ctx.fillStyle = c.obsLabel;
        ctx.font = '8px monospace';
        ctx.fillText(ob.label.slice(0, 9), ox + ob.w / 2, oy - 3);
      }

      // Player shadow (shrinks as player rises)
      const shadowScale = Math.max(0.15, 1 - s.playerY / 75);
      ctx.fillStyle = c.accentFade;
      ctx.beginPath();
      ctx.ellipse(
        PLAYER_X + PLAYER_W / 2,
        GROUND_Y + 4,
        (PLAYER_W / 2 + 3) * shadowScale,
        3 * shadowScale,
        0, 0, Math.PI * 2,
      );
      ctx.fill();

      // Player badge (Q)
      const py = GROUND_Y - PLAYER_H - s.playerY;
      ctx.fillStyle = c.accent;
      fillRounded(ctx, PLAYER_X, py, PLAYER_W, PLAYER_H, 5);
      ctx.fill();
      // Slight highlight on top edge
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(PLAYER_X + 4, py + 2, PLAYER_W - 8, 2);
      // Q letter
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Q', PLAYER_X + PLAYER_W / 2, py + PLAYER_H / 2 + 1);
      ctx.textBaseline = 'alphabetic';

      // Score — top right
      ctx.textAlign = 'right';
      ctx.fillStyle = c.accent;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(String(Math.floor(s.score)).padStart(5, '0'), CANVAS_W - 8, 16);
      ctx.fillStyle = c.obsLabel;
      ctx.font = '9px monospace';
      ctx.fillText(`HI ${String(s.highScore).padStart(5, '0')}`, CANVAS_W - 8, 27);

      // ── Overlay ───────────────────────────────────────────────────────────
      if (s.phase !== 'running') {
        ctx.fillStyle = 'rgba(13,12,12,0.85)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.textAlign = 'center';

        if (s.phase === 'idle') {
          ctx.fillStyle = c.accent;
          ctx.font = 'bold 18px monospace';
          ctx.fillText('QUEST RUNNER', CANVAS_W / 2, CANVAS_H / 2 - 22);
          ctx.fillStyle = '#888';
          ctx.font = '11px monospace';
          ctx.fillText('Space · Enter · A  /  tap to start', CANVAS_W / 2, CANVAS_H / 2 + 4);
          if (s.highScore > 0) {
            ctx.fillStyle = '#555';
            ctx.font = '10px monospace';
            ctx.fillText(`Best: ${s.highScore}`, CANVAS_W / 2, CANVAS_H / 2 + 22);
          }
        } else {
          // Dead
          const finalScore = Math.floor(s.score);
          const isNewBest = finalScore > 0 && finalScore >= s.highScore;

          ctx.fillStyle = c.accent;
          ctx.font = 'bold 18px monospace';
          ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 22);
          ctx.fillStyle = '#bbb';
          ctx.font = '13px monospace';
          ctx.fillText(`Score: ${finalScore}`, CANVAS_W / 2, CANVAS_H / 2 + 2);

          if (isNewBest) {
            ctx.fillStyle = c.accent;
            ctx.font = 'bold 10px monospace';
            ctx.fillText('✦ NEW BEST ✦', CANVAS_W / 2, CANVAS_H / 2 + 17);
          } else if (s.highScore > 0) {
            ctx.fillStyle = '#555';
            ctx.font = '10px monospace';
            ctx.fillText(`Best: ${s.highScore}`, CANVAS_W / 2, CANVAS_H / 2 + 17);
          }

          ctx.fillStyle = '#777';
          ctx.font = '11px monospace';
          ctx.fillText('Space · Enter · A  /  tap to restart', CANVAS_W / 2, CANVAS_H / 2 + 36);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (reducedMotion.current) {
    return (
      <section className="overflow-hidden rounded-lg border border-white/10 bg-ink-900/70">
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-semibold text-white">Quest Runner</p>
          <p className="mt-2 text-sm text-slate-400">
            Animation is disabled by your system's reduced motion setting.
          </p>
          {highScore > 0 && (
            <p className="mt-4 text-xs text-slate-500">High score: {highScore}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-ink-900/70">
      <div className="flex items-center justify-between border-b border-white/10 bg-ink-950/70 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Quest Runner</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Jump over backlog stacks, broken controllers, and crunch
          </p>
        </div>
        {highScore > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Best</p>
            <p className="text-base font-bold tabular-nums text-mint">{highScore}</p>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        aria-label="Quest Runner — press Space, Enter, A or tap to jump"
        className="relative cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mint/50"
        role="application"
        tabIndex={0}
        onClick={jump}
      >
        <canvas
          ref={canvasRef}
          className="block h-auto w-full"
          height={CANVAS_H}
          style={{ imageRendering: 'pixelated' }}
          width={CANVAS_W}
        />
      </div>
    </section>
  );
}
