import { useState, useEffect, useRef, useCallback } from "react";
import type { StarkadeGame } from "@shared/schema";

const W = 600;
const H = 600;

type Vec = { x: number; y: number };

interface Ship {
  pos: Vec;
  vel: Vec;
  angle: number;
  thrust: boolean;
}

interface Bullet {
  pos: Vec;
  vel: Vec;
  life: number;
}

interface Asteroid {
  pos: Vec;
  vel: Vec;
  radius: number;
  vertices: number[];
  tier: number;
}

function wrap(pos: Vec): Vec {
  let x = pos.x;
  let y = pos.y;
  if (x < 0) x += W;
  if (x > W) x -= W;
  if (y < 0) y += H;
  if (y > H) y -= H;
  return { x, y };
}

function dist(a: Vec, b: Vec): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function createAsteroid(x: number, y: number, tier: number): Asteroid {
  const radii = [0, 15, 25, 40];
  const speeds = [0, 2.5, 1.8, 1.2];
  const angle = Math.random() * Math.PI * 2;
  const speed = speeds[tier] * (0.7 + Math.random() * 0.6);
  const verts: number[] = [];
  const numVerts = 8 + Math.floor(Math.random() * 5);
  for (let i = 0; i < numVerts; i++) {
    verts.push(0.7 + Math.random() * 0.6);
  }
  return {
    pos: { x, y },
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    radius: radii[tier],
    vertices: verts,
    tier,
  };
}

function spawnWave(wave: number): Asteroid[] {
  const count = 3 + wave;
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    const edge = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (edge === 0) { x = Math.random() * W; y = 0; }
    if (edge === 1) { x = W; y = Math.random() * H; }
    if (edge === 2) { x = Math.random() * W; y = H; }
    if (edge === 3) { x = 0; y = Math.random() * H; }
    asteroids.push(createAsteroid(x, y, 3));
  }
  return asteroids;
}

export default function AsteroidsGame({ game, onComplete }: { game: StarkadeGame; onComplete: (score: number, points: number, meta: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [gameOverState, setGameOverState] = useState(false);
  const keysRef = useRef(new Set<string>());
  const stateRef = useRef({
    ship: { pos: { x: W / 2, y: H / 2 }, vel: { x: 0, y: 0 }, angle: -Math.PI / 2, thrust: false } as Ship,
    bullets: [] as Bullet[],
    asteroids: spawnWave(1),
    score: 0,
    lives: 3,
    wave: 1,
    gameOver: false,
    shootCooldown: 0,
    invulnerable: 120,
    particles: [] as { pos: Vec; vel: Vec; life: number }[],
  });
  const loopRef = useRef<number>(0);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const s = stateRef.current;
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.4})`;
      const sx = (i * 137.5) % W;
      const sy = (i * 89.3) % H;
      ctx.fillRect(sx, sy, 1, 1);
    }

    if (s.invulnerable <= 0 || Math.floor(s.invulnerable / 4) % 2 === 0) {
      ctx.save();
      ctx.translate(s.ship.pos.x, s.ship.pos.y);
      ctx.rotate(s.ship.angle);
      ctx.strokeStyle = "#4ecca3";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#4ecca3";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.stroke();

      if (s.ship.thrust) {
        ctx.strokeStyle = "#ff6b00";
        ctx.shadowColor = "#ff6b00";
        ctx.beginPath();
        ctx.moveTo(-6, -4);
        ctx.lineTo(-14 - Math.random() * 6, 0);
        ctx.lineTo(-6, 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 4;
    s.bullets.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#aaaacc";
    ctx.lineWidth = 1.5;
    s.asteroids.forEach(a => {
      ctx.beginPath();
      const n = a.vertices.length;
      for (let i = 0; i <= n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const r = a.radius * a.vertices[i % n];
        const px = a.pos.x + Math.cos(angle) * r;
        const py = a.pos.y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });

    ctx.fillStyle = "rgba(255,180,100,0.8)";
    s.particles.forEach(p => {
      ctx.globalAlpha = p.life / 20;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${s.score}`, 10, 24);
    ctx.textAlign = "right";
    ctx.fillText(`Lives: ${s.lives}`, W - 10, 24);
    ctx.textAlign = "center";
    ctx.fillText(`Wave ${s.wave}`, W / 2, 24);
  }, []);

  const tick = useCallback(() => {
    const s = stateRef.current;
    if (s.gameOver) return;

    const keys = keysRef.current;
    if (s.invulnerable > 0) s.invulnerable--;

    if (keys.has("ArrowLeft") || keys.has("a")) s.ship.angle -= 0.06;
    if (keys.has("ArrowRight") || keys.has("d")) s.ship.angle += 0.06;

    s.ship.thrust = keys.has("ArrowUp") || keys.has("w");
    if (s.ship.thrust) {
      s.ship.vel.x += Math.cos(s.ship.angle) * 0.12;
      s.ship.vel.y += Math.sin(s.ship.angle) * 0.12;
    }

    s.ship.vel.x *= 0.99;
    s.ship.vel.y *= 0.99;
    const maxSpeed = 5;
    const speed = Math.sqrt(s.ship.vel.x ** 2 + s.ship.vel.y ** 2);
    if (speed > maxSpeed) {
      s.ship.vel.x = (s.ship.vel.x / speed) * maxSpeed;
      s.ship.vel.y = (s.ship.vel.y / speed) * maxSpeed;
    }

    s.ship.pos.x += s.ship.vel.x;
    s.ship.pos.y += s.ship.vel.y;
    s.ship.pos = wrap(s.ship.pos);

    if (s.shootCooldown > 0) s.shootCooldown--;
    if ((keys.has(" ") || keys.has("Enter")) && s.shootCooldown <= 0 && s.bullets.length < 6) {
      s.bullets.push({
        pos: {
          x: s.ship.pos.x + Math.cos(s.ship.angle) * 14,
          y: s.ship.pos.y + Math.sin(s.ship.angle) * 14,
        },
        vel: {
          x: Math.cos(s.ship.angle) * 7 + s.ship.vel.x * 0.3,
          y: Math.sin(s.ship.angle) * 7 + s.ship.vel.y * 0.3,
        },
        life: 50,
      });
      s.shootCooldown = 8;
    }

    s.bullets = s.bullets.filter(b => {
      b.pos.x += b.vel.x;
      b.pos.y += b.vel.y;
      b.pos = wrap(b.pos);
      b.life--;
      return b.life > 0;
    });

    s.asteroids.forEach(a => {
      a.pos.x += a.vel.x;
      a.pos.y += a.vel.y;
      a.pos = wrap(a.pos);
    });

    const newAsteroids: Asteroid[] = [];
    const hitBullets = new Set<number>();
    s.asteroids = s.asteroids.filter(a => {
      for (let bi = 0; bi < s.bullets.length; bi++) {
        if (hitBullets.has(bi)) continue;
        if (dist(a.pos, s.bullets[bi].pos) < a.radius) {
          hitBullets.add(bi);
          const tierPoints = [0, 100, 50, 20];
          s.score += tierPoints[a.tier];

          for (let p = 0; p < 6; p++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 2;
            s.particles.push({
              pos: { ...a.pos },
              vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
              life: 15 + Math.floor(Math.random() * 10),
            });
          }

          if (a.tier > 1) {
            newAsteroids.push(createAsteroid(a.pos.x, a.pos.y, a.tier - 1));
            newAsteroids.push(createAsteroid(a.pos.x, a.pos.y, a.tier - 1));
          }
          return false;
        }
      }
      return true;
    });
    s.bullets = s.bullets.filter((_, i) => !hitBullets.has(i));
    s.asteroids.push(...newAsteroids);

    s.particles = s.particles.filter(p => {
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.life--;
      return p.life > 0;
    });

    if (s.invulnerable <= 0) {
      for (const a of s.asteroids) {
        if (dist(a.pos, s.ship.pos) < a.radius + 8) {
          s.lives--;
          if (s.lives <= 0) {
            s.gameOver = true;
            setGameOverState(true);
            const pts = Math.round(s.score / 5);
            onComplete(s.score, pts, { wave: s.wave });
            return;
          }
          s.ship.pos = { x: W / 2, y: H / 2 };
          s.ship.vel = { x: 0, y: 0 };
          s.invulnerable = 120;
          break;
        }
      }
    }

    if (s.asteroids.length === 0) {
      s.wave++;
      s.asteroids = spawnWave(s.wave);
    }
  }, [onComplete]);

  const gameLoop = useCallback((timestamp: number) => {
    if (stateRef.current.gameOver) return;
    tick();
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx);
    loopRef.current = requestAnimationFrame(gameLoop);
  }, [tick, draw]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d", "Enter"].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
        if (!started) setStarted(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [started]);

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

  const handleMobileAction = (action: string) => {
    if (!started) setStarted(true);
    if (action === "left") {
      stateRef.current.ship.angle -= 0.3;
    } else if (action === "right") {
      stateRef.current.ship.angle += 0.3;
    } else if (action === "thrust") {
      stateRef.current.ship.vel.x += Math.cos(stateRef.current.ship.angle) * 0.8;
      stateRef.current.ship.vel.y += Math.sin(stateRef.current.ship.angle) * 0.8;
    } else if (action === "fire") {
      const s = stateRef.current;
      if (s.bullets.length < 6) {
        s.bullets.push({
          pos: {
            x: s.ship.pos.x + Math.cos(s.ship.angle) * 14,
            y: s.ship.pos.y + Math.sin(s.ship.angle) * 14,
          },
          vel: {
            x: Math.cos(s.ship.angle) * 7,
            y: Math.sin(s.ship.angle) * 7,
          },
          life: 50,
        });
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4" data-testid="asteroids-game">
      {!started && !gameOverState && (
        <div className="text-center text-muted-foreground text-sm mb-2">
          Arrow keys to steer, Up to thrust, Space to shoot.
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-lg border-2 border-border shadow-xl max-w-full"
        style={{ maxWidth: W, aspectRatio: "1" }}
        data-testid="canvas-asteroids"
      />
      <div className="flex items-center gap-2 md:hidden">
        <button onClick={() => handleMobileAction("left")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-ast-left">LEFT</button>
        <button onClick={() => handleMobileAction("thrust")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-ast-thrust">THRUST</button>
        <button onClick={() => handleMobileAction("fire")} className="bg-muted rounded px-5 p-3 text-sm active:bg-red-500/20 font-bold" data-testid="btn-ast-fire">FIRE</button>
        <button onClick={() => handleMobileAction("right")} className="bg-muted rounded p-3 text-sm font-bold active:bg-primary/20" data-testid="btn-ast-right">RIGHT</button>
      </div>
    </div>
  );
}
