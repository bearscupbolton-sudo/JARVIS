import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Zap, Brain, Timer, Type, Trophy, Crown,
  Gamepad2, Lock, Loader2, Play, ArrowLeft,
  Sparkles, Plus, Star, Medal, Clock,
  RotateCcw, Check, X, Send,
} from "lucide-react";
import type { StarkadeGame } from "@shared/schema";

const GAME_ICONS: Record<string, any> = {
  reaction: Zap,
  memory: Brain,
  quiz: Timer,
  word: Type,
};

const GAME_COLORS: Record<string, string> = {
  reaction: "text-yellow-500",
  memory: "text-purple-500",
  quiz: "text-blue-500",
  word: "text-green-500",
};

// === REACTION TIME GAME ===
function ReactionGame({ game, onComplete }: { game: StarkadeGame; onComplete: (score: number, points: number, meta: any) => void }) {
  const config = game.config as any;
  const totalRounds = config?.rounds || 10;
  const [phase, setPhase] = useState<"waiting" | "ready" | "go" | "tooEarly" | "done">("waiting");
  const [round, setRound] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [goTime, setGoTime] = useState(0);
  const timerRef = useRef<any>(null);
  const targetEmoji = config?.targetEmoji || "🥐";
  const decoys = config?.decoyEmojis || ["🍕", "🌮", "🍔"];

  const startRound = useCallback(() => {
    setPhase("ready");
    const delay = (config?.minDelay || 1000) + Math.random() * ((config?.maxDelay || 4000) - (config?.minDelay || 1000));
    timerRef.current = setTimeout(() => {
      setGoTime(Date.now());
      setPhase("go");
    }, delay);
  }, [config]);

  useEffect(() => {
    if (phase === "waiting" && round < totalRounds) {
      const t = setTimeout(() => startRound(), 800);
      return () => clearTimeout(t);
    }
  }, [phase, round, totalRounds, startRound]);

  const handleTap = () => {
    if (phase === "ready") {
      clearTimeout(timerRef.current);
      setPhase("tooEarly");
      setTimeout(() => { setPhase("waiting"); }, 1200);
    } else if (phase === "go") {
      const rt = Date.now() - goTime;
      const newTimes = [...times, rt];
      setTimes(newTimes);
      const nextRound = round + 1;
      setRound(nextRound);
      if (nextRound >= totalRounds) {
        setPhase("done");
        const avg = Math.round(newTimes.reduce((a, b) => a + b, 0) / newTimes.length);
        const best = Math.min(...newTimes);
        const score = Math.max(0, 1000 - avg);
        const points = Math.max(1, Math.round(score / 10));
        onComplete(score, points, { avgReaction: avg, bestReaction: best, rounds: totalRounds, times: newTimes });
      } else {
        setPhase("waiting");
      }
    }
  };

  if (phase === "done") {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const best = Math.min(...times);
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4" data-testid="game-results">
        <div className="text-6xl mb-2">{targetEmoji}</div>
        <h3 className="text-2xl font-display font-bold">Results</h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div><p className="text-3xl font-mono font-bold text-primary">{avg}ms</p><p className="text-xs text-muted-foreground">Average</p></div>
          <div><p className="text-3xl font-mono font-bold text-green-500">{best}ms</p><p className="text-xs text-muted-foreground">Best</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-4">
      <div className="text-sm text-muted-foreground">Round {round + 1} of {totalRounds}</div>
      <button
        onClick={handleTap}
        data-testid="reaction-tap-area"
        className={cn(
          "w-64 h-64 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all duration-200 cursor-pointer select-none text-center",
          phase === "ready" && "bg-destructive/20 border-2 border-destructive/50",
          phase === "go" && "bg-green-500/20 border-2 border-green-500 scale-105",
          phase === "tooEarly" && "bg-yellow-500/20 border-2 border-yellow-500",
          phase === "waiting" && "bg-muted border-2 border-border",
        )}
      >
        {phase === "waiting" && <><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Get ready...</span></>}
        {phase === "ready" && <><div className="text-5xl">{decoys[Math.floor(Math.random() * decoys.length)]}</div><span className="text-lg font-bold text-destructive">Wait for it...</span></>}
        {phase === "go" && <><div className="text-7xl animate-bounce">{targetEmoji}</div><span className="text-lg font-bold text-green-600">TAP NOW!</span></>}
        {phase === "tooEarly" && <><X className="w-12 h-12 text-yellow-600" /><span className="text-lg font-bold text-yellow-600">Too early!</span></>}
      </button>
      {times.length > 0 && (
        <p className="text-sm text-muted-foreground">Last: <span className="font-mono font-bold">{times[times.length - 1]}ms</span></p>
      )}
    </div>
  );
}

// === MEMORY MATCH GAME ===
function MemoryGame({ game, onComplete }: { game: StarkadeGame; onComplete: (score: number, points: number, meta: any) => void }) {
  const config = game.config as any;
  const pairs = config?.pairs || [];
  const [cards, setCards] = useState<{ id: string; content: string; matchId: string; flipped: boolean; matched: boolean }[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [startTime] = useState(Date.now());
  const lockRef = useRef(false);

  useEffect(() => {
    const deck: typeof cards = [];
    pairs.forEach((p: any, i: number) => {
      deck.push({ id: `a-${i}`, content: p.content, matchId: String(i), flipped: false, matched: false });
      deck.push({ id: `b-${i}`, content: p.match, matchId: String(i), flipped: false, matched: false });
    });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    setCards(deck);
  }, []);

  const handleFlip = (index: number) => {
    if (lockRef.current || cards[index].flipped || cards[index].matched || selected.length >= 2) return;

    const newCards = [...cards];
    newCards[index].flipped = true;
    setCards(newCards);
    const newSelected = [...selected, index];
    setSelected(newSelected);

    if (newSelected.length === 2) {
      setMoves(m => m + 1);
      lockRef.current = true;
      const [a, b] = newSelected;
      if (newCards[a].matchId === newCards[b].matchId) {
        newCards[a].matched = true;
        newCards[b].matched = true;
        setCards([...newCards]);
        setSelected([]);
        lockRef.current = false;
        const newMatched = matchedCount + 1;
        setMatchedCount(newMatched);
        if (newMatched === pairs.length) {
          const duration = Math.round((Date.now() - startTime) / 1000);
          const score = Math.max(0, 1000 - (moves + 1) * 20 - duration * 2);
          const points = Math.max(1, Math.round(score / 10));
          onComplete(score, points, { moves: moves + 1, duration, pairs: pairs.length });
        }
      } else {
        setTimeout(() => {
          newCards[a].flipped = false;
          newCards[b].flipped = false;
          setCards([...newCards]);
          setSelected([]);
          lockRef.current = false;
        }, 800);
      }
    }
  };

  const allMatched = matchedCount === pairs.length && pairs.length > 0;

  if (allMatched) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4" data-testid="game-results">
        <div className="text-6xl mb-2">🧠</div>
        <h3 className="text-2xl font-display font-bold">All Matched!</h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div><p className="text-3xl font-mono font-bold text-primary">{moves}</p><p className="text-xs text-muted-foreground">Moves</p></div>
          <div><p className="text-3xl font-mono font-bold text-green-500">{duration}s</p><p className="text-xs text-muted-foreground">Time</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Moves: <span className="font-mono font-bold">{moves}</span></span>
        <span className="text-muted-foreground">Matched: <span className="font-mono font-bold">{matchedCount}/{pairs.length}</span></span>
      </div>
      <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto">
        {cards.map((card, i) => (
          <button
            key={card.id}
            onClick={() => handleFlip(i)}
            data-testid={`memory-card-${i}`}
            className={cn(
              "aspect-square rounded-lg flex items-center justify-center text-lg font-bold transition-all duration-300 cursor-pointer select-none",
              card.matched ? "bg-green-500/20 border-2 border-green-500/50" :
              card.flipped ? "bg-primary/10 border-2 border-primary/50 scale-105" :
              "bg-muted border-2 border-border hover:border-primary/30"
            )}
          >
            {card.flipped || card.matched ? (
              <span className="text-xl">{card.content}</span>
            ) : (
              <span className="text-2xl opacity-30">?</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// === QUIZ GAME ===
function QuizGame({ game, onComplete }: { game: StarkadeGame; onComplete: (score: number, points: number, meta: any) => void }) {
  const config = game.config as any;
  const questions = config?.questions || [];
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(questions[0]?.timeLimit || 15);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (answered !== null || current >= questions.length) return;
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(t);
          handleAnswer(-1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [current, answered]);

  const handleAnswer = (index: number) => {
    if (answered !== null) return;
    setAnswered(index);
    const correct = index === questions[current]?.correctIndex;
    let newStreak = streak;
    if (correct) {
      newStreak = streak + 1;
      setStreak(newStreak);
      setScore(s => s + 100 + (newStreak > 1 ? newStreak * 10 : 0) + timeLeft * 5);
    } else {
      setStreak(0);
      newStreak = 0;
    }
    setTimeout(() => {
      const next = current + 1;
      if (next >= questions.length) {
        const finalScore = score + (correct ? 100 + (newStreak > 1 ? newStreak * 10 : 0) + timeLeft * 5 : 0);
        const points = Math.max(1, Math.round(finalScore / 10));
        const correctCount = (correct ? 1 : 0) + (score > 0 ? Math.round(score / 100) : 0);
        onComplete(finalScore, points, { correctAnswers: correctCount, totalQuestions: questions.length, bestStreak: Math.max(streak, newStreak) });
      } else {
        setCurrent(next);
        setAnswered(null);
        setTimeLeft(questions[next]?.timeLimit || 15);
      }
    }, 1200);
  };

  if (current >= questions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4" data-testid="game-results">
        <div className="text-6xl mb-2">🧁</div>
        <h3 className="text-2xl font-display font-bold">Quiz Complete!</h3>
        <p className="text-3xl font-mono font-bold text-primary">{score} pts</p>
      </div>
    );
  }

  const q = questions[current];
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{current + 1} / {questions.length}</Badge>
        <div className={cn("flex items-center gap-1 font-mono font-bold", timeLeft <= 5 ? "text-destructive animate-pulse" : "text-muted-foreground")}>
          <Clock className="w-4 h-4" />
          {timeLeft}s
        </div>
        {streak > 1 && <Badge className="bg-orange-500 text-white">🔥 {streak} streak</Badge>}
      </div>
      <h3 className="text-lg font-semibold text-center" data-testid="quiz-question">{q.question}</h3>
      <div className="grid grid-cols-1 gap-3">
        {q.options?.map((opt: string, i: number) => (
          <button
            key={i}
            onClick={() => handleAnswer(i)}
            data-testid={`quiz-option-${i}`}
            disabled={answered !== null}
            className={cn(
              "w-full p-4 rounded-lg text-left font-medium transition-all duration-200 border-2",
              answered === null && "hover:border-primary/50 hover:bg-primary/5 cursor-pointer border-border",
              answered !== null && i === q.correctIndex && "border-green-500 bg-green-500/10",
              answered === i && i !== q.correctIndex && "border-destructive bg-destructive/10",
              answered !== null && i !== q.correctIndex && answered !== i && "opacity-50 border-border",
            )}
          >
            {opt}
            {answered !== null && i === q.correctIndex && <Check className="w-4 h-4 inline ml-2 text-green-500" />}
            {answered === i && i !== q.correctIndex && <X className="w-4 h-4 inline ml-2 text-destructive" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// === WORD SCRAMBLE GAME ===
function WordGame({ game, onComplete }: { game: StarkadeGame; onComplete: (score: number, points: number, meta: any) => void }) {
  const config = game.config as any;
  const wordList = config?.words || [];
  const [current, setCurrent] = useState(0);
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [scrambled, setScrambled] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const scramble = (word: string) => {
    const arr = word.split("");
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const result = arr.join("");
    return result === word ? scramble(word) : result;
  };

  useEffect(() => {
    if (wordList[current]) {
      setScrambled(scramble(wordList[current].word));
    }
  }, [current]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [current]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    const correct = input.trim().toUpperCase() === wordList[current]?.word?.toUpperCase();
    if (correct) {
      setFeedback("correct");
      const wordScore = 100 + (showHint ? 0 : 50);
      setScore(s => s + wordScore);
      setSolved(s => s + 1);
    } else {
      setFeedback("wrong");
    }
    setTimeout(() => {
      setFeedback(null);
      setInput("");
      setShowHint(false);
      const next = current + 1;
      if (next >= wordList.length) {
        const finalScore = score + (correct ? 100 + (showHint ? 0 : 50) : 0);
        const points = Math.max(1, Math.round(finalScore / 10));
        onComplete(finalScore, points, { solved: solved + (correct ? 1 : 0), total: wordList.length });
      } else {
        setCurrent(next);
      }
    }, 800);
  };

  if (current >= wordList.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4" data-testid="game-results">
        <div className="text-6xl mb-2">📝</div>
        <h3 className="text-2xl font-display font-bold">Word Scramble Complete!</h3>
        <p className="text-xl text-muted-foreground">{solved}/{wordList.length} solved</p>
        <p className="text-3xl font-mono font-bold text-primary">{score} pts</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6 max-w-md mx-auto">
      <div className="flex items-center justify-between w-full">
        <Badge variant="outline">{current + 1} / {wordList.length}</Badge>
        <span className="text-sm text-muted-foreground">Solved: <span className="font-bold">{solved}</span></span>
      </div>
      <div className="text-4xl font-mono font-bold tracking-[0.3em] text-primary select-none" data-testid="scrambled-word">
        {scrambled}
      </div>
      {showHint && (
        <p className="text-sm text-muted-foreground italic" data-testid="word-hint">Hint: {wordList[current]?.hint}</p>
      )}
      <div className="flex gap-2 w-full">
        <Input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="Type your answer..."
          data-testid="word-input"
          className={cn(
            "font-mono text-lg tracking-wider uppercase text-center",
            feedback === "correct" && "border-green-500 bg-green-500/10",
            feedback === "wrong" && "border-destructive bg-destructive/10",
          )}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSubmit} data-testid="button-word-submit"><Check className="w-4 h-4 mr-1" />Submit</Button>
        {!showHint && (
          <Button variant="outline" onClick={() => setShowHint(true)} data-testid="button-word-hint">
            <Sparkles className="w-4 h-4 mr-1" />Hint
          </Button>
        )}
        <Button variant="ghost" onClick={() => { setInput(""); setCurrent(c => c + 1 < wordList.length ? c + 1 : c); }} data-testid="button-word-skip">
          Skip
        </Button>
      </div>
    </div>
  );
}

// === GAME RENDERER ===
function GameRenderer({ game, onComplete, onBack }: { game: StarkadeGame; onComplete: (score: number, points: number, meta: any) => void; onBack: () => void }) {
  const GameComponent = {
    reaction: ReactionGame,
    memory: MemoryGame,
    quiz: QuizGame,
    word: WordGame,
  }[game.type];

  if (!GameComponent) {
    return <div className="text-center py-12 text-muted-foreground">Unknown game type</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-games">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-xl font-display font-bold">{game.name}</h2>
          {game.description && <p className="text-sm text-muted-foreground">{game.description}</p>}
        </div>
        {game.source === "ai" && <Badge variant="secondary"><Sparkles className="w-3 h-3 mr-1" />AI Generated</Badge>}
      </div>
      <GameComponent game={game} onComplete={onComplete} />
    </div>
  );
}

// === MAIN STARKADE PAGE ===
export default function Starkade() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeGame, setActiveGame] = useState<StarkadeGame | null>(null);
  const [gameFinished, setGameFinished] = useState<{ score: number; points: number; meta: any } | null>(null);
  const [genPrompt, setGenPrompt] = useState("");
  const [previewGame, setPreviewGame] = useState<any>(null);
  const [leaderboardGameId, setLeaderboardGameId] = useState<number | null>(null);

  const { data: access, isLoading: accessLoading } = useQuery<{ locked: boolean; message: string | null }>({
    queryKey: ["/api/starkade/access"],
    refetchInterval: 30000,
  });

  const { data: games, isLoading: gamesLoading } = useQuery<StarkadeGame[]>({
    queryKey: ["/api/starkade/games"],
    enabled: !access?.locked,
  });

  const { data: globalLeaderboard } = useQuery<{ userId: string; firstName: string | null; lastName: string | null; username: string | null; totalPoints: number; gamesPlayed: number }[]>({
    queryKey: ["/api/starkade/leaderboard/global"],
    enabled: !access?.locked,
  });

  const { data: gameLeaderboard } = useQuery<{ userId: string; firstName: string | null; lastName: string | null; username: string | null; totalPoints: number; gamesPlayed: number; bestScore: number }[]>({
    queryKey: ["/api/starkade/leaderboard/game", leaderboardGameId],
    enabled: !!leaderboardGameId,
  });

  const { data: recentSessions } = useQuery<any[]>({
    queryKey: ["/api/starkade/recent"],
    enabled: !access?.locked,
  });

  const playMutation = useMutation({
    mutationFn: async ({ gameId, score, points, metadata }: { gameId: number; score: number; points: number; metadata: any }) => {
      const res = await apiRequest("POST", `/api/starkade/games/${gameId}/play`, { score, points, metadata });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/starkade/leaderboard/global"] });
      queryClient.invalidateQueries({ queryKey: ["/api/starkade/leaderboard/game"] });
      queryClient.invalidateQueries({ queryKey: ["/api/starkade/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/starkade/games"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await apiRequest("POST", "/api/starkade/games/generate", { prompt });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewGame(data);
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (gameConfig: any) => {
      const res = await apiRequest("POST", "/api/starkade/games/save", {
        name: gameConfig.name,
        type: gameConfig.type,
        description: gameConfig.description,
        config: gameConfig,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/starkade/games"] });
      setPreviewGame(null);
      setGenPrompt("");
      toast({ title: "Game saved!", description: "Your game has been added to the Starkade." });
    },
  });

  const handleGameComplete = (score: number, points: number, meta: any) => {
    setGameFinished({ score, points, meta });
    if (activeGame) {
      playMutation.mutate({ gameId: activeGame.id, score, points, metadata: meta });
    }
  };

  const handlePlayAgain = () => {
    const game = activeGame;
    setGameFinished(null);
    setActiveGame(null);
    setTimeout(() => setActiveGame(game), 50);
  };

  const getName = (entry: { firstName: string | null; lastName: string | null; username: string | null }) => {
    if (entry.firstName) return `${entry.firstName}${entry.lastName ? ` ${entry.lastName.charAt(0)}.` : ""}`;
    return entry.username || "Unknown";
  };

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // === LOCKED STATE ===
  if (access?.locked) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-6 px-4" data-testid="starkade-locked">
        <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Lock className="w-12 h-12 text-primary" />
        </div>
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-display font-bold mb-3">Starkade's Closed</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {access.message || "Clock out first to access the arcade!"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gamepad2 className="w-4 h-4" />
          <span>The arcade opens when you're off the clock</span>
        </div>
      </div>
    );
  }

  // === ACTIVE GAME ===
  if (activeGame) {
    return (
      <div className="max-w-2xl mx-auto py-6 px-4">
        {gameFinished ? (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🏆</div>
              <h2 className="text-3xl font-display font-bold mb-2">Game Over!</h2>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="text-center">
                  <p className="text-4xl font-mono font-bold text-primary">{gameFinished.score}</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-mono font-bold text-yellow-500">+{gameFinished.points}</p>
                  <p className="text-xs text-muted-foreground">Points</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={handlePlayAgain} className="gap-2" data-testid="button-play-again">
                <RotateCcw className="w-4 h-4" />
                Play Again
              </Button>
              <Button variant="outline" onClick={() => { setActiveGame(null); setGameFinished(null); }} data-testid="button-back-arcade">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Starkade
              </Button>
            </div>
          </div>
        ) : (
          <GameRenderer
            game={activeGame}
            onComplete={handleGameComplete}
            onBack={() => { setActiveGame(null); setGameFinished(null); }}
          />
        )}
      </div>
    );
  }

  // === MAIN STARKADE VIEW ===
  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight" data-testid="text-starkade-title">
            <Gamepad2 className="w-7 h-7 inline mr-2 text-primary" />
            Starkade
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Compete, play, and climb the leaderboard</p>
        </div>
      </div>

      <Tabs defaultValue="games" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="games" data-testid="tab-games"><Gamepad2 className="w-4 h-4 mr-1.5" />Games</TabsTrigger>
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard"><Trophy className="w-4 h-4 mr-1.5" />Leaderboard</TabsTrigger>
          <TabsTrigger value="create" data-testid="tab-create"><Sparkles className="w-4 h-4 mr-1.5" />Jarvis Gen</TabsTrigger>
        </TabsList>

        {/* === GAMES TAB === */}
        <TabsContent value="games" className="space-y-4 mt-4">
          {gamesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : !games?.length ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Gamepad2 className="w-12 h-12 opacity-30 mb-3" />
                <p className="font-medium">No games yet</p>
                <p className="text-sm">Create one with the Jarvis Game Generator!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {games.map(game => {
                const Icon = GAME_ICONS[game.type] || Gamepad2;
                const color = GAME_COLORS[game.type] || "text-primary";
                return (
                  <Card key={game.id} className="hover:shadow-lg transition-shadow cursor-pointer group" data-testid={`game-card-${game.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center bg-muted", color)}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-display">{game.name}</CardTitle>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[10px]">{game.type}</Badge>
                              {game.source === "ai" && <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-0.5" />AI</Badge>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {game.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{game.description}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Play className="w-3 h-3" />{game.playCount} plays
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLeaderboardGameId(game.id)}
                            data-testid={`button-game-leaderboard-${game.id}`}
                          >
                            <Trophy className="w-3.5 h-3.5 mr-1" />Scores
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => { setActiveGame(game); setGameFinished(null); }}
                            data-testid={`button-play-${game.id}`}
                          >
                            <Play className="w-3.5 h-3.5" />Play
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Recent Activity */}
          {recentSessions && recentSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" />Recent Plays</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentSessions.slice(0, 5).map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                      <span className="text-muted-foreground">{s.gameName}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold">{s.score}</span>
                        <Badge variant="secondary" className="text-[10px]">+{s.points} pts</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === LEADERBOARD TAB === */}
        <TabsContent value="leaderboard" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                Global Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!globalLeaderboard?.length ? (
                <p className="text-muted-foreground text-center py-8">No scores yet. Be the first to play!</p>
              ) : (
                <div className="space-y-2">
                  {globalLeaderboard.map((entry, i) => (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg",
                        i === 0 && "bg-yellow-500/10 border border-yellow-500/30",
                        i === 1 && "bg-gray-300/10 border border-gray-400/30",
                        i === 2 && "bg-orange-500/10 border border-orange-500/30",
                        i > 2 && "border border-border",
                      )}
                      data-testid={`leaderboard-entry-${i}`}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                        {i === 0 ? <Crown className="w-5 h-5 text-yellow-500" /> :
                         i === 1 ? <Medal className="w-5 h-5 text-gray-400" /> :
                         i === 2 ? <Medal className="w-5 h-5 text-orange-500" /> :
                         <span className="text-muted-foreground">{i + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium truncate", entry.userId === user?.id && "text-primary")}>{getName(entry)}</p>
                        <p className="text-xs text-muted-foreground">{entry.gamesPlayed} games</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-lg">{entry.totalPoints.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">points</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-game leaderboards */}
          {games && games.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Game Leaderboards</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  {games.map(g => (
                    <Button
                      key={g.id}
                      variant={leaderboardGameId === g.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLeaderboardGameId(leaderboardGameId === g.id ? null : g.id)}
                      data-testid={`button-game-lb-${g.id}`}
                    >
                      {g.name}
                    </Button>
                  ))}
                </div>
                {leaderboardGameId && gameLeaderboard ? (
                  gameLeaderboard.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No scores for this game yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {gameLeaderboard.map((entry, i) => (
                        <div key={entry.userId} className="flex items-center gap-3 p-2 rounded border border-border" data-testid={`game-lb-entry-${i}`}>
                          <span className="w-6 text-center font-bold text-muted-foreground text-sm">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-sm">{getName(entry)}</p>
                          </div>
                          <div className="text-right text-sm">
                            <span className="font-mono font-bold">{entry.totalPoints}</span>
                            <span className="text-muted-foreground ml-1">pts</span>
                            <span className="text-xs text-muted-foreground ml-2">Best: {entry.bestScore}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <p className="text-muted-foreground text-center py-4 text-sm">Select a game to see its leaderboard</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === JARVIS GAME GEN TAB === */}
        <TabsContent value="create" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <img src="/bear-logo.png" alt="Jarvis" className="w-6 h-6 rounded-sm object-contain" />
                Jarvis Game Generator
              </CardTitle>
              <p className="text-sm text-muted-foreground">Describe a game idea and Jarvis will build it for you</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={genPrompt}
                  onChange={e => setGenPrompt(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !generateMutation.isPending && genPrompt.trim() && generateMutation.mutate(genPrompt)}
                  placeholder='Try: "A quiz about French pastry history" or "Memory game with bakery tools"'
                  data-testid="input-game-prompt"
                  className="flex-1"
                />
                <Button
                  onClick={() => generateMutation.mutate(genPrompt)}
                  disabled={!genPrompt.trim() || generateMutation.isPending}
                  data-testid="button-generate-game"
                >
                  {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {["Bakery trivia challenge", "Memory game with pastry emojis", "Scramble coffee drink names", "Speed reaction: catch the croissant"].map(idea => (
                  <Button
                    key={idea}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setGenPrompt(idea)}
                    data-testid={`suggestion-${idea.slice(0, 10)}`}
                  >
                    {idea}
                  </Button>
                ))}
              </div>

              {previewGame && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      {previewGame.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{previewGame.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge>{previewGame.type}</Badge>
                      {previewGame.questions && <span className="text-sm text-muted-foreground">{previewGame.questions.length} questions</span>}
                      {previewGame.words && <span className="text-sm text-muted-foreground">{previewGame.words.length} words</span>}
                      {previewGame.pairs && <span className="text-sm text-muted-foreground">{previewGame.pairs.length} pairs</span>}
                      {previewGame.rounds && <span className="text-sm text-muted-foreground">{previewGame.rounds} rounds</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => saveMutation.mutate(previewGame)} disabled={saveMutation.isPending} data-testid="button-save-game" className="gap-1.5">
                        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Save to Starkade
                      </Button>
                      <Button variant="outline" onClick={() => setPreviewGame(null)} data-testid="button-discard-game">
                        Discard
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}