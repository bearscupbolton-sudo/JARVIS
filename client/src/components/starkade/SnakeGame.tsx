import { useState, useEffect, useRef, useCallback } from "react";
import type { StarkadeGame } from "@shared/schema";

const CELL = 20;
const COLS = 20;
const ROWS = 20;
const W = COLS * CELL;
const H = ROWS * CELL;

type Dir = "up" | "down" | "left" | "right";
type Pos = { x: number; y: number };

export default function SnakeGame({ game, onComplete }: { game: StarkadeGame; onComplete: (score: number, points: number, meta: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const stateRef = useRef({
    snake: [{ x: 10, y: 10 }] as Pos[],
    dir: "right" as Dir,
    nextDir: "right" as Dir,
    food: { x: 15, y: 10 } as Pos,
    score: 0,
    speed: 120,
    gameOver: false,
  });
  const loopRef = useRef<number>(0);
  const lastTickRef = useRef(0);

  const spawnFood = useCallback((snake: Pos[]): Pos => {
    let pos: Pos;
    do {
      pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    return pos;
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const s = stateRef.current;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.02)";
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }

    ctx.fillStyle = "#ff6b6b";
    ctx.shadowColor = "#ff6b6b";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    s.snake.forEach((seg, i) => {
      const isHead = i === 0;
      const brightness = 1 - (i / s.snake.length) * 0.5;
      ctx.fillStyle = isHead ? "#4ecca3" : `rgba(78, 204, 163, ${brightness})`;
      if (isHead) {
        ctx.shadowColor = "#4ecca3";
        ctx.shadowBlur = 6;
      }
      const pad = isHead ? 1 : 2;
      ctx.fillRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
      if (isHead) ctx.shadowBlur = 0;
    });

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${s.score}`, 8, 18);
  }, []);

  const tick = useCallback(() => {
    const s = stateRef.current;
    if (s.gameOver) return;

    s.dir = s.nextDir;
    const head = { ...s.snake[0] };
    if (s.dir === "up") head.y--;
    if (s.dir === "down") head.y++;
    if (s.dir === "left") head.x--;
    if (s.dir === "right") head.x++;

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      s.gameOver = true;
      setGameOver(true);
      const pts = Math.round(s.score / 2);
      onComplete(s.score, pts, { length: s.snake.length });
      return;
    }
    if (s.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      s.gameOver = true;
      setGameOver(true);
      const pts = Math.round(s.score / 2);
      onComplete(s.score, pts, { length: s.snake.length });
      return;
    }

    s.snake.unshift(head);

    if (head.x === s.food.x && head.y === s.food.y) {
      s.score += 10;
      s.food = spawnFood(s.snake);
      if (s.speed > 60) s.speed -= 2;
    } else {
      s.snake.pop();
    }
  }, [spawnFood, onComplete]);

  const gameLoop = useCallback((timestamp: number) => {
    const s = stateRef.current;
    if (s.gameOver) return;

    if (timestamp - lastTickRef.current >= s.speed) {
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
    const opposites: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
    if (opposites[newDir] !== s.dir) {
      s.nextDir = newDir;
    }
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
    const s = stateRef.current;
    const opposites: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
    if (opposites[dir] !== s.dir) s.nextDir = dir;
    if (!started) setStarted(true);
  };

  return (
    <div className="flex flex-col items-center gap-4" data-testid="snake-game">
      {!started && !gameOver && (
        <div className="text-center text-muted-foreground text-sm mb-2">
          Use arrow keys or WASD to move. Tap the d-pad on mobile.
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-lg border-2 border-border shadow-xl max-w-full"
        style={{ imageRendering: "pixelated", maxWidth: W, aspectRatio: `${COLS}/${ROWS}` }}
        data-testid="canvas-snake"
      />
      <div className="grid grid-cols-3 gap-1 w-40 md:hidden">
        <div />
        <button onClick={() => handleTouchDir("up")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-up">UP</button>
        <div />
        <button onClick={() => handleTouchDir("left")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-left">LEFT</button>
        <button onClick={() => handleTouchDir("down")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-down">DOWN</button>
        <button onClick={() => handleTouchDir("right")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-right">RIGHT</button>
      </div>
    </div>
  );
}
