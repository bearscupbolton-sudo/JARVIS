import { useState, useEffect, useRef, useCallback } from "react";
import type { StarkadeGame } from "@shared/schema";

const CELL = 20;
const COLS = 21;
const ROWS = 21;
const W = COLS * CELL;
const H = ROWS * CELL;

type Dir = "up" | "down" | "left" | "right";
type Pos = { x: number; y: number };

const MAZE: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,0,1,0,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,1,1,0,0,0,0,0,1,1,1,0,1,1,1,1],
  [1,1,1,1,0,1,0,0,0,1,1,1,0,0,0,1,0,1,1,1,1],
  [1,1,1,1,0,0,0,1,0,1,1,1,0,1,0,0,0,1,1,1,1],
  [1,1,1,1,0,1,0,1,0,0,0,0,0,1,0,1,0,1,1,1,1],
  [1,1,1,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,1],
  [1,1,1,1,0,1,0,0,0,0,0,0,0,0,0,1,0,1,1,1,1],
  [1,1,1,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,0,1,0,0,1,1,1,0,1,1,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
  [1,1,0,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,0,1,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,0,1,0,0,1,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const GHOST_COLORS = ["#ff0000", "#ffb8ff", "#00ffff", "#ffb852"];

function getInitialDots(): Set<string> {
  const dots = new Set<string>();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (MAZE[y][x] === 0) dots.add(`${x},${y}`);
    }
  }
  dots.delete("10,10");
  return dots;
}

const POWER_PELLETS = new Set(["1,1", "19,1", "1,19", "19,19"]);

export default function PacManGame({ game, onComplete }: { game: StarkadeGame; onComplete: (score: number, points: number, meta: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const stateRef = useRef({
    pac: { x: 10, y: 15 } as Pos,
    dir: "left" as Dir,
    nextDir: "left" as Dir,
    mouthOpen: true,
    mouthTimer: 0,
    ghosts: [
      { x: 9, y: 9, dir: "up" as Dir, scared: false, scaredTimer: 0 },
      { x: 10, y: 9, dir: "up" as Dir, scared: false, scaredTimer: 0 },
      { x: 11, y: 9, dir: "down" as Dir, scared: false, scaredTimer: 0 },
      { x: 10, y: 10, dir: "left" as Dir, scared: false, scaredTimer: 0 },
    ],
    dots: getInitialDots(),
    score: 0,
    lives: 3,
    level: 1,
    gameOver: false,
    ghostSpeed: 0,
  });
  const loopRef = useRef<number>(0);
  const lastTickRef = useRef(0);
  const tickIntervalRef = useRef(150);

  const canMove = (x: number, y: number): boolean => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return MAZE[y][x] === 0;
  };

  const getNextPos = (pos: Pos, dir: Dir): Pos => {
    const next = { ...pos };
    if (dir === "up") next.y--;
    if (dir === "down") next.y++;
    if (dir === "left") next.x--;
    if (dir === "right") next.x++;
    return next;
  };

  const getRandomDir = (pos: Pos, currentDir: Dir): Dir => {
    const opposite: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
    const dirs: Dir[] = ["up", "down", "left", "right"];
    const valid = dirs.filter(d => {
      if (d === opposite[currentDir]) return false;
      const next = getNextPos(pos, d);
      return canMove(next.x, next.y);
    });
    if (valid.length === 0) return opposite[currentDir];
    return valid[Math.floor(Math.random() * valid.length)];
  };

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const s = stateRef.current;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (MAZE[y][x] === 1) {
          ctx.fillStyle = "#1a1aff";
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }

    s.dots.forEach(key => {
      const [dx, dy] = key.split(",").map(Number);
      const isPower = POWER_PELLETS.has(key);
      ctx.fillStyle = isPower ? "#ffb852" : "#ffb8ae";
      ctx.beginPath();
      const r = isPower ? 5 : 2;
      ctx.arc(dx * CELL + CELL / 2, dy * CELL + CELL / 2, r, 0, Math.PI * 2);
      ctx.fill();
    });

    const px = s.pac.x * CELL + CELL / 2;
    const py = s.pac.y * CELL + CELL / 2;
    ctx.fillStyle = "#ffff00";
    ctx.beginPath();
    if (s.mouthOpen) {
      const angles: Record<Dir, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
      const a = angles[s.dir];
      ctx.arc(px, py, CELL / 2 - 1, a + 0.3, a + Math.PI * 2 - 0.3);
      ctx.lineTo(px, py);
    } else {
      ctx.arc(px, py, CELL / 2 - 1, 0, Math.PI * 2);
    }
    ctx.fill();

    s.ghosts.forEach((ghost, i) => {
      const gx = ghost.x * CELL + CELL / 2;
      const gy = ghost.y * CELL + CELL / 2;
      ctx.fillStyle = ghost.scared ? "#2121de" : GHOST_COLORS[i];
      ctx.beginPath();
      ctx.arc(gx, gy - 2, CELL / 2 - 2, Math.PI, 0);
      ctx.lineTo(gx + CELL / 2 - 2, gy + CELL / 2 - 2);
      for (let w = 0; w < 3; w++) {
        const wx = gx - CELL / 2 + 2 + w * ((CELL - 4) / 3);
        ctx.lineTo(wx + (CELL - 4) / 6, gy + CELL / 2 - 6);
        ctx.lineTo(wx + (CELL - 4) / 3, gy + CELL / 2 - 2);
      }
      ctx.lineTo(gx - CELL / 2 + 2, gy + CELL / 2 - 2);
      ctx.fill();

      ctx.fillStyle = ghost.scared ? "#ffffff" : "#ffffff";
      ctx.beginPath();
      ctx.arc(gx - 3, gy - 3, 2.5, 0, Math.PI * 2);
      ctx.arc(gx + 3, gy - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (!ghost.scared) {
        ctx.fillStyle = "#000088";
        ctx.beginPath();
        ctx.arc(gx - 3, gy - 3, 1.2, 0, Math.PI * 2);
        ctx.arc(gx + 3, gy - 3, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${s.score}`, 4, 14);
    ctx.textAlign = "right";
    ctx.fillText(`Lives: ${s.lives}`, W - 4, 14);
  }, []);

  const tick = useCallback(() => {
    const s = stateRef.current;
    if (s.gameOver) return;

    s.mouthTimer++;
    if (s.mouthTimer % 2 === 0) s.mouthOpen = !s.mouthOpen;

    const nextPac = getNextPos(s.pac, s.nextDir);
    if (canMove(nextPac.x, nextPac.y)) {
      s.dir = s.nextDir;
      s.pac = nextPac;
    } else {
      const cont = getNextPos(s.pac, s.dir);
      if (canMove(cont.x, cont.y)) s.pac = cont;
    }

    const dotKey = `${s.pac.x},${s.pac.y}`;
    if (s.dots.has(dotKey)) {
      s.dots.delete(dotKey);
      if (POWER_PELLETS.has(dotKey)) {
        s.score += 50;
        s.ghosts.forEach(g => { g.scared = true; g.scaredTimer = 30; });
      } else {
        s.score += 10;
      }
    }

    if (s.dots.size === 0) {
      s.level++;
      s.dots = getInitialDots();
      s.pac = { x: 10, y: 15 };
      s.ghosts = [
        { x: 9, y: 9, dir: "up", scared: false, scaredTimer: 0 },
        { x: 10, y: 9, dir: "up", scared: false, scaredTimer: 0 },
        { x: 11, y: 9, dir: "down", scared: false, scaredTimer: 0 },
        { x: 10, y: 10, dir: "left", scared: false, scaredTimer: 0 },
      ];
      tickIntervalRef.current = Math.max(80, tickIntervalRef.current - 10);
    }

    s.ghostSpeed++;
    if (s.ghostSpeed % 2 === 0) {
      s.ghosts.forEach(ghost => {
        if (ghost.scared) {
          ghost.scaredTimer--;
          if (ghost.scaredTimer <= 0) ghost.scared = false;
        }

        const next = getNextPos(ghost, ghost.dir);
        if (canMove(next.x, next.y) && Math.random() > 0.3) {
          ghost.x = next.x;
          ghost.y = next.y;
        } else {
          ghost.dir = getRandomDir(ghost, ghost.dir);
        }
      });
    }

    for (const ghost of s.ghosts) {
      if (ghost.x === s.pac.x && ghost.y === s.pac.y) {
        if (ghost.scared) {
          ghost.x = 10;
          ghost.y = 9;
          ghost.scared = false;
          s.score += 200;
        } else {
          s.lives--;
          if (s.lives <= 0) {
            s.gameOver = true;
            setGameOver(true);
            const pts = Math.round(s.score / 5);
            onComplete(s.score, pts, { level: s.level, dotsRemaining: s.dots.size });
            return;
          }
          s.pac = { x: 10, y: 15 };
          s.dir = "left";
          s.nextDir = "left";
        }
      }
    }
  }, [onComplete]);

  const gameLoop = useCallback((timestamp: number) => {
    const s = stateRef.current;
    if (s.gameOver) return;
    if (timestamp - lastTickRef.current >= tickIntervalRef.current) {
      tick();
      lastTickRef.current = timestamp;
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx);
    loopRef.current = requestAnimationFrame(gameLoop);
  }, [tick, draw]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    const s = stateRef.current;
    const map: Record<string, Dir> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right",
    };
    const newDir = map[e.key];
    if (!newDir) return;
    e.preventDefault();
    s.nextDir = newDir;
    if (!started) setStarted(true);
  }, [started]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  useEffect(() => {
    if (started) {
      loopRef.current = requestAnimationFrame(gameLoop);
      return () => cancelAnimationFrame(loopRef.current);
    }
  }, [started, gameLoop]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && !started) draw(ctx);
  }, [draw, started]);

  const handleTouchDir = (dir: Dir) => {
    stateRef.current.nextDir = dir;
    if (!started) setStarted(true);
  };

  return (
    <div className="flex flex-col items-center gap-4" data-testid="pacman-game">
      {!started && !gameOver && (
        <div className="text-center text-muted-foreground text-sm mb-2">
          Use arrow keys or WASD to move. Eat all the dots!
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-lg border-2 border-border shadow-xl max-w-full"
        style={{ imageRendering: "pixelated", maxWidth: W, aspectRatio: `${COLS}/${ROWS}` }}
        data-testid="canvas-pacman"
      />
      <div className="grid grid-cols-3 gap-1 w-40 md:hidden">
        <div />
        <button onClick={() => handleTouchDir("up")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-pac-up">UP</button>
        <div />
        <button onClick={() => handleTouchDir("left")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-pac-left">LEFT</button>
        <button onClick={() => handleTouchDir("down")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-pac-down">DOWN</button>
        <button onClick={() => handleTouchDir("right")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-pac-right">RIGHT</button>
      </div>
    </div>
  );
}
