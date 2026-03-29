import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Crown, Hexagon, RotateCcw, Delete, Sparkles } from "lucide-react";

interface HiveData {
  puzzleId: number;
  date: string;
  centerLetter: string;
  outerLetters: string[];
  totalWords: number;
  maxScore: number;
  teamScore: number;
  teamWordsFound: number;
  teamRank: string;
  leaderboard: { userId: string; userName: string; totalPoints: number; wordCount: number; pangramCount: number }[];
}

interface FoundWord {
  id: number;
  word: string;
  points: number;
  isPangram: boolean;
  userName: string;
  foundAt: string;
}

interface SubmitResult {
  success: boolean;
  points: number;
  isPangram: boolean;
  message: string;
  alreadyFound?: boolean;
}

function HiveHexagon({ letter, isCenter, onClick }: { letter: string; isCenter?: boolean; onClick: (l: string) => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      onClick={() => onClick(letter)}
      className={`
        relative cursor-pointer flex items-center justify-center select-none
        w-[72px] h-[82px] sm:w-[84px] sm:h-[96px] md:w-[96px] md:h-[110px]
        transition-colors duration-200 border-0 outline-none
        ${isCenter
          ? "bg-amber-500 text-black hover:bg-amber-400"
          : "bg-zinc-800 text-white hover:bg-zinc-700"
        }
      `}
      style={{
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
      data-testid={`hex-${letter}`}
    >
      <span className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tighter uppercase font-mono">
        {letter}
      </span>
    </motion.button>
  );
}

function ProgressBar({ current, max, rank }: { current: number; max: number; rank: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const thresholds = [0, 2, 8, 15, 25, 40, 50, 70, 100];
  const labels = ["New Bee", "Beginner", "Good", "Solid", "Nice", "Great", "Amazing", "Genius", "Queen Bee 👑"];

  return (
    <div className="w-full" data-testid="progress-bar">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-amber-500 font-semibold uppercase tracking-widest">{rank}</span>
        <span className="text-xs text-zinc-500">{current}/{max} pts</span>
      </div>
      <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        {thresholds.slice(1, -1).map((t, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-px bg-zinc-700"
            style={{ left: `${t}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {labels.filter((_, i) => i % 2 === 0).map((l, i) => (
          <span key={i} className="text-[9px] text-zinc-600">{l}</span>
        ))}
      </div>
    </div>
  );
}

export default function JarvisHive() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" | "pangram" } | null>(null);
  const [shake, setShake] = useState(false);
  const feedbackTimeout = useRef<NodeJS.Timeout | null>(null);

  const { data: hive, isLoading } = useQuery<HiveData>({
    queryKey: ["/api/hive/today"],
  });

  const { data: allWords } = useQuery<FoundWord[]>({
    queryKey: ["/api/hive", hive?.puzzleId, "all-words"],
    queryFn: () => fetch(`/api/hive/${hive?.puzzleId}/all-words`, { credentials: "include" }).then(r => r.json()),
    enabled: !!hive?.puzzleId,
  });

  const submitMutation = useMutation({
    mutationFn: (word: string) =>
      apiRequest("POST", "/api/hive/submit", { puzzleId: hive?.puzzleId, word }),
    onSuccess: async (res) => {
      const result: SubmitResult = await res.json();
      if (result.success) {
        setFeedback({
          msg: result.message,
          type: result.isPangram ? "pangram" : "success",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/hive/today"] });
        queryClient.invalidateQueries({ queryKey: ["/api/hive", hive?.puzzleId, "all-words"] });
      } else {
        setFeedback({ msg: result.message, type: "error" });
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
      setInput("");
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
      feedbackTimeout.current = setTimeout(() => setFeedback(null), 3000);
    },
    onError: () => {
      setFeedback({ msg: "Something went wrong", type: "error" });
      setInput("");
    },
  });

  const handleLetterClick = useCallback((l: string) => {
    setInput(prev => prev + l);
  }, []);

  const handleSubmit = useCallback(() => {
    if (input.length < 4 || !hive) return;
    submitMutation.mutate(input);
  }, [input, hive, submitMutation]);

  const handleShuffle = useCallback(() => {
    if (!hive) return;
    queryClient.setQueryData(["/api/hive/today"], (old: HiveData | undefined) => {
      if (!old) return old;
      const shuffled = [...old.outerLetters].sort(() => Math.random() - 0.5);
      return { ...old, outerLetters: shuffled };
    });
  }, [hive]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      } else if (e.key === "Backspace") {
        setInput(prev => prev.slice(0, -1));
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        setInput(prev => prev + e.key.toLowerCase());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-amber-500">
          <Hexagon className="w-16 h-16" />
        </div>
      </div>
    );
  }

  if (!hive) {
    return <div className="p-8 text-center text-zinc-400">Could not load today's puzzle</div>;
  }

  const outer = hive.outerLetters;

  return (
    <div className="min-h-screen bg-black text-white" data-testid="jarvis-hive-page">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-amber-500 font-bold text-sm uppercase tracking-[0.2em]" data-testid="hive-title">
              Jarvis Hive
            </h1>
            <p className="text-zinc-500 text-xs mt-0.5">{hive.date}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-zinc-500">Team Progress</p>
              <p className="text-sm font-bold text-amber-400" data-testid="team-progress">
                {hive.teamWordsFound}/{hive.totalWords} Words
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-zinc-900 border border-amber-500/30 flex items-center justify-center">
              <Crown className="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </div>

        <ProgressBar current={hive.teamScore} max={hive.maxScore} rank={hive.teamRank} />

        <div className="mt-6 mb-2">
          <AnimatePresence mode="wait">
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`text-center text-sm font-semibold py-2 rounded-lg mb-2 ${
                  feedback.type === "pangram"
                    ? "bg-amber-500/20 text-amber-400"
                    : feedback.type === "success"
                    ? "bg-green-900/30 text-green-400"
                    : "bg-red-900/30 text-red-400"
                }`}
                data-testid="feedback-message"
              >
                {feedback.type === "pangram" && <Sparkles className="inline h-4 w-4 mr-1" />}
                {feedback.msg}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="h-14 flex items-center justify-center mb-4"
        >
          <span className="text-3xl font-light tracking-[0.15em] uppercase font-mono" data-testid="input-display">
            {input ? (
              input.split("").map((ch, i) => (
                <span
                  key={i}
                  className={ch === hive.centerLetter ? "text-amber-500" : "text-white"}
                >
                  {ch}
                </span>
              ))
            ) : (
              <span className="text-zinc-700">Type or tap...</span>
            )}
          </span>
        </motion.div>

        <div className="relative mx-auto" style={{ height: 280, width: 260 }}>
          <div className="absolute" style={{ top: 0, left: "50%", transform: "translateX(-102%)" }}>
            <HiveHexagon letter={outer[0]} onClick={handleLetterClick} />
          </div>
          <div className="absolute" style={{ top: 0, left: "50%", transform: "translateX(2%)" }}>
            <HiveHexagon letter={outer[1]} onClick={handleLetterClick} />
          </div>

          <div className="absolute" style={{ top: "50%", left: 0, transform: "translateY(-50%)" }}>
            <HiveHexagon letter={outer[2]} onClick={handleLetterClick} />
          </div>
          <div className="absolute" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
            <HiveHexagon letter={hive.centerLetter} isCenter onClick={handleLetterClick} />
          </div>
          <div className="absolute" style={{ top: "50%", right: 0, transform: "translateY(-50%)" }}>
            <HiveHexagon letter={outer[3]} onClick={handleLetterClick} />
          </div>

          <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-102%)" }}>
            <HiveHexagon letter={outer[4]} onClick={handleLetterClick} />
          </div>
          <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(2%)" }}>
            <HiveHexagon letter={outer[5]} onClick={handleLetterClick} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setInput(prev => prev.slice(0, -1))}
            className="px-5 py-2.5 rounded-full border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-900 transition-colors"
            data-testid="btn-delete"
          >
            <Delete className="h-4 w-4 inline mr-1" />
            Delete
          </button>
          <button
            onClick={handleShuffle}
            className="p-2.5 rounded-full border border-zinc-700 text-zinc-400 hover:bg-zinc-900 transition-colors"
            data-testid="btn-shuffle"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={handleSubmit}
            disabled={input.length < 4 || submitMutation.isPending}
            className="px-8 py-2.5 rounded-full bg-white text-black font-bold text-sm hover:bg-amber-500 transition-colors disabled:opacity-40 disabled:hover:bg-white"
            data-testid="btn-enter"
          >
            Enter
          </button>
        </div>

        {allWords && allWords.length > 0 && (
          <div className="mt-8">
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-3">
              Found Words ({allWords.length})
            </p>
            <div className="flex flex-wrap gap-2" data-testid="found-words-list">
              {allWords.map(w => (
                <motion.div
                  key={w.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    w.isPangram
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-zinc-800 text-zinc-300 border border-zinc-700"
                  }`}
                  data-testid={`word-${w.word}`}
                >
                  <span className="uppercase">{w.word}</span>
                  <span className="ml-1.5 text-zinc-500">+{w.points}</span>
                  <span className="ml-1 text-zinc-600 text-[10px]">{w.userName.split(" ")[0]}</span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {hive.leaderboard.length > 0 && (
          <div className="mt-8 mb-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-3">
              <Trophy className="h-3.5 w-3.5 inline mr-1" />
              Leaderboard
            </p>
            <div className="space-y-2" data-testid="leaderboard">
              {hive.leaderboard.map((entry, i) => (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    entry.userId === user?.id
                      ? "bg-amber-500/10 border border-amber-500/20"
                      : "bg-zinc-900 border border-zinc-800"
                  }`}
                  data-testid={`leader-${i}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? "bg-amber-500 text-black" : i === 1 ? "bg-zinc-600 text-white" : i === 2 ? "bg-amber-800 text-amber-200" : "bg-zinc-800 text-zinc-400"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{entry.userName}</p>
                    <p className="text-xs text-zinc-500">{entry.wordCount} words{entry.pangramCount > 0 ? ` · ${entry.pangramCount} pangram${entry.pangramCount > 1 ? "s" : ""}` : ""}</p>
                  </div>
                  <p className="text-lg font-bold text-amber-400">{entry.totalPoints}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
