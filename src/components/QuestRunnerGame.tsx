import { useCallback, useEffect, useRef, useState } from 'react';
import type { Game } from '../types/game';
import { loadAchievementCounters, saveAchievementCounters } from '../lib/achievementCounters';

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
const BG_CASE_COUNT = 16;
const COLLECTIBLE_INTERVAL = 360;
const COVER_OBS_CHANCE = 0.14;
const HIGH_SCORE_KEY = 'questshelf.questRunner.hs.v1';

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'running' | 'dead';
type ObstacleVariant = 'backlog' | 'controller' | 'battery' | 'saveslot' | 'corrupt' | 'crate' | 'cover';

type Obstacle = {
  x: number; w: number; h: number;
  variant: ObstacleVariant; coverSrc?: string;
  id: number; dodged: boolean;
};

type Collectible = { x: number; y: number; id: number; collected: boolean };
type BgCase    = { x: number; y: number; w: number; h: number; sp: number };
type Star      = { x: number; y: number; sz: number; sp: number };
type CoverEntry = { img: HTMLImageElement; ready: boolean };

type Colors = {
  bg: string;
  ground: string;
  accent: string;
  accentFade: string;
  accentRgb: string;
};

interface RunnerState {
  phase: Phase;
  playerY: number;
  playerVY: number;
  grounded: boolean;
  frameCount: number;
  obstacles: Obstacle[];
  stars: Star[];
  bgCases: BgCase[];
  collectibles: Collectible[];
  collectTimer: number;
  collectIdCounter: number;
  shards: number;
  speed: number;
  score: number;
  highScore: number;
  obsTimer: number;
  obsIdCounter: number;
  pendingDodges: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadHighScore(): number {
  try { return parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10) || 0; } catch { return 0; }
}

function saveHighScore(n: number) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(n));
    const ac = loadAchievementCounters();
    if (n > ac.questRunnerBestScore) {
      saveAchievementCounters({ ...ac, questRunnerBestScore: n });
    }
  } catch { /* ignore */ }
}

function makeStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * CANVAS_W,
    y: 4 + Math.random() * (GROUND_Y - 22),
    sz: Math.random() < 0.22 ? 2 : 1,
    sp: 0.3 + Math.random() * 1.6,
  }));
}

function makeBgCases(): BgCase[] {
  return Array.from({ length: BG_CASE_COUNT }, (_, i) => ({
    x: (i / BG_CASE_COUNT) * CANVAS_W + Math.random() * 20,
    y: 6 + Math.floor(Math.random() * 30),
    w: 4 + Math.floor(Math.random() * 5),
    h: 8 + Math.floor(Math.random() * 12),
    sp: 0.08 + Math.random() * 0.14,
  }));
}

function makeInitialState(hs: number): RunnerState {
  return {
    phase: 'idle',
    playerY: 0, playerVY: 0, grounded: true,
    frameCount: 0,
    obstacles: [],
    stars: makeStars(),
    bgCases: makeBgCases(),
    collectibles: [],
    collectTimer: COLLECTIBLE_INTERVAL + Math.random() * 150,
    collectIdCounter: 0,
    shards: 0,
    speed: BASE_SPEED,
    score: 0, highScore: hs,
    obsTimer: 280 + Math.random() * 200,
    obsIdCounter: 0,
    pendingDodges: 0,
  };
}

function readColors(): Colors {
  const s = getComputedStyle(document.documentElement);
  const a = s.getPropertyValue('--accent-rgb').trim().replace(/\s+/g, ',') || '255,90,44';
  const b = s.getPropertyValue('--ink-950-rgb').trim().replace(/\s+/g, ',') || '13,12,12';
  return {
    bg: `rgb(${b})`,
    ground: '#201c1c',
    accent: `rgb(${a})`,
    accentFade: `rgba(${a},0.18)`,
    accentRgb: a,
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

// ─── Obstacle drawing ─────────────────────────────────────────────────────────

function drawBacklog(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) {
  ctx.save();
  const caseH = 11;
  let cy = oy;
  let i = 0;
  while (cy < oy + h) {
    const ch = Math.min(caseH - 1, oy + h - cy);
    if (ch <= 0) break;
    ctx.fillStyle = i % 2 === 0 ? '#21193a' : '#1c1630';
    ctx.fillRect(ox, cy, w, ch);
    ctx.fillStyle = '#0d0c14';
    ctx.fillRect(ox, cy + ch, w, 1);
    cy += caseH;
    i++;
  }
  // Purple spine binding
  ctx.fillStyle = '#5b21b6';
  ctx.fillRect(ox, oy, 3, h);
  // Shine on top case
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(ox + 3, oy + 1, w - 3, 1);
  ctx.restore();
}

function drawController(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) {
  ctx.save();
  // Body
  ctx.fillStyle = '#1a1a1a';
  fillRounded(ctx, ox, oy, w, h - 5, 5);
  ctx.fill();
  // Grips
  ctx.fillStyle = '#141414';
  fillRounded(ctx, ox, oy + h - 9, 11, 9, 4);
  ctx.fill();
  fillRounded(ctx, ox + w - 11, oy + h - 9, 11, 9, 4);
  ctx.fill();
  // Shoulder highlight
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(ox + 4, oy + 2, w - 8, 2);
  // Broken X marker
  const cx = ox + w / 2;
  const cy = oy + (h - 5) / 2;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 4); ctx.lineTo(cx + 5, cy + 4);
  ctx.moveTo(cx + 5, cy - 4); ctx.lineTo(cx - 5, cy + 4);
  ctx.stroke();
  ctx.restore();
}

function drawBattery(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) {
  ctx.save();
  const nubW = 8;
  const nubH = 4;
  // Terminal nub
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(ox + (w - nubW) / 2, oy, nubW, nubH);
  // Body
  ctx.fillStyle = '#111';
  fillRounded(ctx, ox, oy + nubH, w, h - nubH, 3);
  ctx.fill();
  // Warning border
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  fillRounded(ctx, ox, oy + nubH, w, h - nubH, 3);
  ctx.stroke();
  // Critical charge fill (bottom 15%)
  const fillH = Math.max(3, Math.floor((h - nubH) * 0.15));
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(ox + 2, oy + h - fillH - 1, w - 4, fillH);
  // Dead/flat dash
  const midX = ox + w / 2;
  const midY = oy + nubH + (h - nubH) / 2;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(midX - 5, midY); ctx.lineTo(midX + 5, midY);
  ctx.stroke();
  ctx.restore();
}

function drawSaveslot(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) {
  ctx.save();
  // Floppy body
  ctx.fillStyle = '#1e2032';
  fillRounded(ctx, ox, oy, w, h, 3);
  ctx.fill();
  // Write-protect corner notch (top-right)
  ctx.fillStyle = '#12141f';
  ctx.fillRect(ox + w - 7, oy, 8, 8);
  // Label area
  const labelH = Math.floor(h * 0.62);
  ctx.fillStyle = '#272a3e';
  ctx.fillRect(ox + 2, oy + 3, w - 4, labelH);
  ctx.fillStyle = 'rgba(148,163,184,0.14)';
  for (let i = 10; i < labelH; i += 7) {
    ctx.fillRect(ox + 4, oy + 3 + i, w - 8, 1);
  }
  // Metal shutter
  const shutterY = oy + labelH + 3;
  ctx.fillStyle = '#31354e';
  ctx.fillRect(ox + 2, shutterY, w - 4, h - (shutterY - oy) - 2);
  // Shutter slot
  ctx.fillStyle = '#0f1117';
  ctx.fillRect(ox + (w - 10) / 2, shutterY + 2, 10, 5);
  // Top shine
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(ox, oy, w, 2);
  ctx.restore();
}

function drawCorrupt(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#0c191c';
  fillRounded(ctx, ox, oy, w, h, 2);
  ctx.fill();
  // Glitch bands
  const bandDefs = [
    { frac: 0.12, th: 2, alpha: 0.75, wf: 0.82 },
    { frac: 0.30, th: 1, alpha: 0.40, wf: 0.50 },
    { frac: 0.46, th: 2, alpha: 0.65, wf: 0.70 },
    { frac: 0.63, th: 1, alpha: 0.32, wf: 0.42 },
    { frac: 0.79, th: 2, alpha: 0.55, wf: 0.88 },
  ];
  bandDefs.forEach(({ frac, th, alpha, wf }, i) => {
    const by = oy + Math.floor(h * frac);
    const bw = Math.floor(w * wf);
    const bx = ox + (i % 2 === 0 ? 0 : w - bw);
    ctx.fillStyle = `rgba(20,184,166,${alpha})`;
    ctx.fillRect(bx, by, bw, th);
  });
  // Scan lines
  for (let i = 4; i < h; i += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.fillRect(ox, oy + i, w, 1);
  }
  // Teal outline
  ctx.strokeStyle = 'rgba(20,184,166,0.36)';
  ctx.lineWidth = 1;
  fillRounded(ctx, ox, oy, w, h, 2);
  ctx.stroke();
  ctx.restore();
}

function drawCrate(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#1c1209';
  fillRounded(ctx, ox, oy, w, h, 2);
  ctx.fill();
  // Wood grain planks
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.fillRect(ox, oy + Math.floor(h * 0.33), w, 1);
  ctx.fillRect(ox, oy + Math.floor(h * 0.67), w, 1);
  ctx.fillRect(ox + Math.floor(w * 0.33), oy, 1, h);
  ctx.fillRect(ox + Math.floor(w * 0.67), oy, 1, h);
  // Corner brackets
  const cs = 4;
  ctx.fillStyle = '#92400e';
  ctx.fillRect(ox, oy, cs, cs);
  ctx.fillRect(ox + w - cs, oy, cs, cs);
  ctx.fillRect(ox, oy + h - cs, cs, cs);
  ctx.fillRect(ox + w - cs, oy + h - cs, cs, cs);
  // Star loot marker
  ctx.fillStyle = '#fbbf24';
  ctx.font = `bold ${Math.round(Math.min(w, h) * 0.52)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', ox + w / 2, oy + h / 2 + 1);
  ctx.restore();
}

function drawCoverObstacle(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number, w: number, h: number,
  coverImages: Map<string, CoverEntry>,
  src?: string,
) {
  if (src) {
    const entry = coverImages.get(src);
    if (entry?.ready) {
      ctx.save();
      ctx.fillStyle = '#14131f';
      fillRounded(ctx, ox, oy, w, h, 3);
      ctx.fill();
      // Clip and draw artwork
      fillRounded(ctx, ox + 2, oy + 2, w - 4, h - 4, 2);
      ctx.clip();
      ctx.drawImage(entry.img, ox + 2, oy + 2, w - 4, h - 4);
      ctx.restore();
      // Frame overlay (after restore so it's not clipped)
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      fillRounded(ctx, ox, oy, w, h, 3);
      ctx.stroke();
      ctx.restore();
      return;
    }
  }
  drawCrate(ctx, ox, oy, w, h);
}

function drawObstacle(ctx: CanvasRenderingContext2D, ob: Obstacle, coverImages: Map<string, CoverEntry>) {
  const ox = ob.x;
  const oy = GROUND_Y - ob.h;
  switch (ob.variant) {
    case 'backlog':    drawBacklog(ctx, ox, oy, ob.w, ob.h); break;
    case 'controller': drawController(ctx, ox, oy, ob.w, ob.h); break;
    case 'battery':    drawBattery(ctx, ox, oy, ob.w, ob.h); break;
    case 'saveslot':   drawSaveslot(ctx, ox, oy, ob.w, ob.h); break;
    case 'corrupt':    drawCorrupt(ctx, ox, oy, ob.w, ob.h); break;
    case 'crate':      drawCrate(ctx, ox, oy, ob.w, ob.h); break;
    case 'cover':      drawCoverObstacle(ctx, ox, oy, ob.w, ob.h, coverImages, ob.coverSrc); break;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

const VARIANTS: ObstacleVariant[] = ['backlog', 'controller', 'battery', 'saveslot', 'corrupt', 'crate'];

export function QuestRunnerGame({ games }: { games?: Game[] }) {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef       = useRef(0);
  const stateRef     = useRef<RunnerState>(makeInitialState(loadHighScore()));
  const colorsRef    = useRef<Colors>(readColors());
  const coverImagesRef = useRef<Map<string, CoverEntry>>(new Map());
  // Tracks the combined (display scale × DPR) factor for the draw context transform
  const dprScaleRef = useRef(1);

  const [highScore, setHighScore] = useState(() => stateRef.current.highScore);

  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // Refresh CSS-variable colours after mount (resolved values available then)
  useEffect(() => { colorsRef.current = readColors(); }, []);

  // Resize canvas buffer to match container × DPR so no CSS scaling occurs
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function resize() {
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      if (w === 0) return;
      const h = Math.round(w * (CANVAS_H / CANVAS_W));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      // Single scale factor works because we preserve the aspect ratio
      dprScaleRef.current = canvas.width / CANVAS_W;
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Preload cover images from game library (at most 8; skip generated SVGs)
  useEffect(() => {
    if (!games?.length) return;
    const realCovers = games
      .map(g => g.coverImage?.trim())
      .filter((url): url is string => !!url && !url.startsWith('data:'));
    const urls = [...new Set(realCovers)].slice(0, 8);
    for (const url of urls) {
      if (coverImagesRef.current.has(url)) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const entry: CoverEntry = { img, ready: false };
      coverImagesRef.current.set(url, entry);
      img.onload = () => { entry.ready = true; };
      img.onerror = () => { coverImagesRef.current.delete(url); };
      img.src = url;
    }
  }, [games]);

  const startGame = useCallback(() => {
    const prev = stateRef.current;
    if (prev.pendingDodges > 0) {
      const ac = loadAchievementCounters();
      saveAchievementCounters({ ...ac, questRunnerObstaclesDodged: ac.questRunnerObstaclesDodged + prev.pendingDodges });
    }
    const next = makeInitialState(prev.highScore);
    next.phase = 'running';
    // Preserve bg layers so the screen doesn't flash on restart
    next.stars = prev.stars;
    next.bgCases = prev.bgCases;
    stateRef.current = next;
    const ac = loadAchievementCounters();
    saveAchievementCounters({ ...ac, questRunnerRuns: ac.questRunnerRuns + 1 });
  }, []);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'running') { startGame(); return; }
    if (s.grounded) { s.playerVY = JUMP_V; s.grounded = false; }
  }, [startGame]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); jump(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump]);

  useEffect(() => { containerRef.current?.focus({ preventScroll: true }); }, []);

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
        s.frameCount += 1;
        s.speed = Math.min(s.speed + SPEED_INC, MAX_SPEED);

        // Parallax: stars
        for (const star of s.stars) {
          star.x -= star.sp * (s.speed / BASE_SPEED);
          if (star.x < -2) {
            star.x = CANVAS_W + Math.random() * 80;
            star.y = 4 + Math.random() * (GROUND_Y - 22);
          }
        }

        // Parallax: background cases (very slow — library shelf)
        for (const bc of s.bgCases) {
          bc.x -= bc.sp * (s.speed / BASE_SPEED);
          if (bc.x + bc.w < 0) {
            bc.x = CANVAS_W + Math.random() * 30;
            bc.y = 6 + Math.floor(Math.random() * 30);
          }
        }

        // Player physics (playerY = height above ground)
        s.playerY += s.playerVY;
        s.playerVY -= GRAVITY;
        if (s.playerY <= 0) { s.playerY = 0; s.playerVY = 0; s.grounded = true; }

        // Collectible spawning
        s.collectTimer -= s.speed;
        if (s.collectTimer <= 0) {
          s.collectIdCounter += 1;
          s.collectibles.push({
            x: CANVAS_W + 10,
            y: 24 + Math.floor(Math.random() * 54),
            id: s.collectIdCounter,
            collected: false,
          });
          s.collectTimer = COLLECTIBLE_INTERVAL + Math.random() * 180;
        }

        // Move collectibles
        for (const col of s.collectibles) col.x -= s.speed;

        // Collectible collision (center-based, generous radius)
        const pCX = PLAYER_X + PLAYER_W / 2;
        const pCY = GROUND_Y - s.playerY - PLAYER_H / 2;
        for (const col of s.collectibles) {
          if (!col.collected) {
            const dx = pCX - col.x;
            const dy = pCY - (GROUND_Y - col.y);
            if (Math.abs(dx) < PLAYER_W / 2 + 7 && Math.abs(dy) < PLAYER_H / 2 + 7) {
              col.collected = true;
              s.shards += 1;
            }
          }
        }
        s.collectibles = s.collectibles.filter(col => !col.collected && col.x > -20);

        // Obstacle spawning
        s.obsTimer -= s.speed;
        if (s.obsTimer <= 0) {
          s.obsIdCounter += 1;
          const coverSrcs = Array.from(coverImagesRef.current.keys());
          let variant: ObstacleVariant;
          let coverSrc: string | undefined;
          if (coverSrcs.length > 0 && Math.random() < COVER_OBS_CHANCE) {
            variant = 'cover';
            coverSrc = coverSrcs[Math.floor(Math.random() * coverSrcs.length)];
          } else {
            variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
          }
          let w: number, h: number;
          switch (variant) {
            case 'backlog':    w = 22 + Math.floor(Math.random() * 6);  h = 44 + Math.floor(Math.random() * 24); break;
            case 'controller': w = 30;                                   h = 22; break;
            case 'battery':    w = 16 + Math.floor(Math.random() * 4);  h = 34 + Math.floor(Math.random() * 12); break;
            case 'saveslot':   w = 26;                                   h = 28; break;
            case 'corrupt':    w = 20 + Math.floor(Math.random() * 6);  h = 28 + Math.floor(Math.random() * 20); break;
            case 'crate':      w = 26;                                   h = 26; break;
            default:           w = 24;                                   h = 38;
          }
          s.obstacles.push({ x: CANVAS_W + 8, w, h, variant, coverSrc, id: s.obsIdCounter, dodged: false });
          s.obsTimer = 300 + Math.random() * 340;
        }

        // Move obstacles; count dodges
        for (const ob of s.obstacles) ob.x -= s.speed;
        for (const ob of s.obstacles) {
          if (!ob.dodged && ob.x + ob.w < PLAYER_X) {
            ob.dodged = true;
            s.pendingDodges += 1;
          }
        }
        s.obstacles = s.obstacles.filter(ob => ob.x + ob.w > -20);

        // Score (distance-based)
        s.score += s.speed * 0.028;

        // Collision detection (AABB, 4 px forgiveness on each edge)
        const m = 4;
        const pLeft   = PLAYER_X + m;
        const pRight  = PLAYER_X + PLAYER_W - m;
        const pBottom = GROUND_Y - s.playerY;
        const pTop    = pBottom - PLAYER_H + m;
        for (const ob of s.obstacles) {
          const oLeft = ob.x + m;
          const oRight = ob.x + ob.w - m;
          const oTop = GROUND_Y - ob.h + m;
          if (pRight > oLeft && pLeft < oRight && pBottom > oTop + m && pTop < GROUND_Y) {
            s.phase = 'dead';
            const fs = Math.floor(s.score);
            if (fs > s.highScore) { s.highScore = fs; saveHighScore(fs); setHighScore(fs); }
            if (s.shards > 0) {
              const ac = loadAchievementCounters();
              saveAchievementCounters({ ...ac, questRunnerShardsCollected: ac.questRunnerShardsCollected + s.shards });
            }
            break;
          }
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────

      // Map 600×180 logical coordinates → physical canvas pixels at any DPR/display size
      ctx.setTransform(dprScaleRef.current, 0, 0, dprScaleRef.current, 0, 0);

      // Background
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Faint background cases (library shelf parallax)
      ctx.fillStyle = 'rgba(255,255,255,0.032)';
      for (const bc of s.bgCases) {
        ctx.fillRect(Math.round(bc.x), Math.round(bc.y), bc.w, bc.h);
      }

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      for (const star of s.stars) {
        ctx.fillRect(Math.round(star.x), Math.round(star.y), star.sz, star.sz);
      }

      // Ground accent glow
      const grd = ctx.createLinearGradient(0, GROUND_Y - 14, 0, GROUND_Y);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, `rgba(${c.accentRgb},0.07)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, GROUND_Y - 14, CANVAS_W, 14);

      // Ground line
      ctx.fillStyle = c.ground;
      ctx.fillRect(0, GROUND_Y, CANVAS_W, 2);

      // Obstacles
      for (const ob of s.obstacles) {
        drawObstacle(ctx, ob, coverImagesRef.current);
      }

      // Collectibles (animated diamonds)
      for (const col of s.collectibles) {
        const pulse = 1 + Math.sin(s.frameCount * 0.13 + col.x * 0.04) * 0.11;
        const r = 5 * pulse;
        ctx.save();
        ctx.translate(Math.round(col.x), Math.round(GROUND_Y - col.y));
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = 'rgba(251,191,36,0.7)';
        ctx.shadowBlur = 5;
        ctx.fillRect(-r / 2, -r / 2, r, r);
        ctx.restore();
      }
      ctx.shadowBlur = 0;

      // Player shadow (flattens as player rises)
      const shadowScale = Math.max(0.15, 1 - s.playerY / 75);
      ctx.fillStyle = c.accentFade;
      ctx.beginPath();
      ctx.ellipse(
        PLAYER_X + PLAYER_W / 2, GROUND_Y + 4,
        (PLAYER_W / 2 + 3) * shadowScale, 3 * shadowScale,
        0, 0, Math.PI * 2,
      );
      ctx.fill();

      // Player badge with squash/stretch + idle bob + glow
      {
        const px  = PLAYER_X + PLAYER_W / 2;
        const py  = GROUND_Y - s.playerY - PLAYER_H / 2;
        const bob = (s.grounded && s.phase === 'running') ? Math.sin(s.frameCount * 0.10) * 1.5 : 0;
        let scaleX = 1, scaleY = 1;
        if (!s.grounded && s.phase === 'running') {
          if (s.playerVY > 3)       { scaleY = 1.12; scaleX = 1 / scaleY; }
          else if (s.playerVY < -4) { scaleY = 0.88; scaleX = 1 / scaleY; }
        }
        ctx.save();
        ctx.translate(px, py + bob);
        ctx.scale(scaleX, scaleY);
        ctx.shadowColor = c.accent;
        ctx.shadowBlur = s.grounded ? 5 : 10;
        ctx.fillStyle = c.accent;
        fillRounded(ctx, -PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(-PLAYER_W / 2 + 4, -PLAYER_H / 2 + 2, PLAYER_W - 8, 2);
        ctx.fillStyle = s.phase === 'dead' ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.7)';
        ctx.font = `bold ${s.phase === 'dead' ? '12' : '16'}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.phase === 'dead' ? '×' : 'Q', 0, 1);
        ctx.restore();
      }

      // HUD (score + shards — only while running; overlay covers it otherwise)
      if (s.phase === 'running') {
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'right';
        ctx.fillStyle = c.accent;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(String(Math.floor(s.score)).padStart(5, '0'), CANVAS_W - 8, 16);
        ctx.fillStyle = 'rgba(90,90,110,0.9)';
        ctx.font = '8px monospace';
        ctx.fillText(`BEST ${String(s.highScore).padStart(5, '0')}`, CANVAS_W - 8, 27);

        ctx.textAlign = 'left';
        ctx.fillStyle = s.shards > 0 ? '#fbbf24' : 'rgba(110,110,130,0.50)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`◆ ${s.shards}`, 8, 16);
      }

      // ── Overlay ───────────────────────────────────────────────────────────
      if (s.phase !== 'running') {
        ctx.fillStyle = 'rgba(13,12,12,0.85)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.textBaseline = 'alphabetic';
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
          // Dead panel
          const finalScore = Math.floor(s.score);
          const isNewBest  = finalScore > 0 && finalScore >= s.highScore;
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
          } else if (s.shards > 0) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = '10px monospace';
            ctx.fillText(`◆ ${s.shards} shard${s.shards !== 1 ? 's' : ''}`, CANVAS_W / 2, CANVAS_H / 2 + 17);
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
            <p className="text-2xs font-semibold uppercase tracking-widest text-slate-500">Best</p>
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
          width={CANVAS_W}
        />
      </div>
    </section>
  );
}
