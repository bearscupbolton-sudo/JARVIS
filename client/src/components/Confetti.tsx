import { useState, useEffect, useCallback } from "react";
import { Flame, Crown, Trophy, Star, CheckCircle2, ChefHat, Layers, ClipboardList, PartyPopper } from "lucide-react";

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  velocityX: number;
  velocityY: number;
  rotationSpeed: number;
  opacity: number;
};

const COLORS = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function createParticle(id: number): Particle {
  return {
    id,
    x: 50 + (Math.random() - 0.5) * 40,
    y: -5,
    size: 6 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    velocityX: (Math.random() - 0.5) * 4,
    velocityY: 2 + Math.random() * 3,
    rotationSpeed: (Math.random() - 0.5) * 10,
    opacity: 1,
  };
}

export function ConfettiExplosion({ onComplete }: { onComplete?: () => void }) {
  const [particles, setParticles] = useState<Particle[]>(() =>
    Array.from({ length: 50 }, (_, i) => createParticle(i))
  );

  useEffect(() => {
    let frame: number;
    let elapsed = 0;
    const step = () => {
      elapsed += 16;
      setParticles(prev =>
        prev.map(p => ({
          ...p,
          x: p.x + p.velocityX * 0.3,
          y: p.y + p.velocityY * 0.5,
          rotation: p.rotation + p.rotationSpeed,
          opacity: Math.max(0, 1 - elapsed / 2500),
        }))
      );
      if (elapsed < 2500) {
        frame = requestAnimationFrame(step);
      } else {
        onComplete?.();
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            transform: `rotate(${p.rotation}deg)`,
            opacity: p.opacity,
            transition: "none",
          }}
        />
      ))}
    </div>
  );
}

export function AchievementPopup({ title, description, icon, onClose }: {
  title: string;
  description: string;
  icon: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const ICON_MAP: Record<string, any> = {
    "flame": Flame,
    "crown": Crown,
    "trophy": Trophy,
    "star": Star,
    "check": CheckCircle2,
    "chef-hat": ChefHat,
    "layers": Layers,
    "clipboard": ClipboardList,
  };
  const IconComponent = ICON_MAP[icon] || PartyPopper;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] animate-in slide-in-from-top-4 fade-in duration-500"
      data-testid="achievement-popup"
    >
      <div className="flex items-center gap-3 bg-card border-2 border-primary/30 shadow-lg rounded-xl px-5 py-3.5 min-w-[280px]">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <IconComponent className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-primary uppercase tracking-wider" data-testid="text-achievement-label">Achievement Unlocked!</p>
          <p className="font-bold text-sm" data-testid="text-achievement-title">{title}</p>
          <p className="text-xs text-muted-foreground" data-testid="text-achievement-description">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function useAchievementCelebration() {
  const [showConfetti, setShowConfetti] = useState(false);
  const [pendingAchievement, setPendingAchievement] = useState<{
    title: string; description: string; icon: string;
  } | null>(null);

  const celebrate = useCallback((achievement: { title: string; description: string; icon: string }) => {
    setShowConfetti(true);
    setPendingAchievement(achievement);
  }, []);

  const elements = (
    <>
      {showConfetti && <ConfettiExplosion onComplete={() => setShowConfetti(false)} />}
      {pendingAchievement && (
        <AchievementPopup
          title={pendingAchievement.title}
          description={pendingAchievement.description}
          icon={pendingAchievement.icon}
          onClose={() => setPendingAchievement(null)}
        />
      )}
    </>
  );

  return { celebrate, elements };
}
