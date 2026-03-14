import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

const JARVIS_INTRO_EN = `I'm Jarvis, your bakery's integrated operating system. I'm here to bridge the gap between your craft and your commerce.

From automating your vendor orders and precisely allocating tips via API, to protecting your inventory with recipe-level tracking, I handle the heavy lifting. Whether I'm managing your wholesale catalog, integrating with your POS, or identifying customer trends through feedback loops, my goal is to ensure your operation is as seamless as your recipes.

I have a lifetime of functionality to show you, but I know you're ready to get started. Shall we?`;

export default function JarvisIntroOverlay({ user }: { user: any }) {
  const { t, lang } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  const { data: introNote } = useQuery<{ value: string | null }>({
    queryKey: ["/api/settings/jarvis-intro-note"],
    enabled: !user.seenJarvisIntro,
  });

  useEffect(() => {
    if (!user.seenJarvisIntro) {
      setVisible(true);
      requestAnimationFrame(() => setFadeIn(true));
    }
  }, [user.seenJarvisIntro]);

  const dismissMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/user/dismiss-jarvis-intro");
    },
    onSuccess: () => {
      setFadeIn(false);
      setTimeout(() => {
        setVisible(false);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }, 300);
    },
  });

  if (!visible) return null;

  const introText = lang === "fr" ? t("jarvis_intro") : JARVIS_INTRO_EN;
  const ownerNote = introNote?.value || null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${fadeIn ? "opacity-100" : "opacity-0"}`}
      data-testid="jarvis-intro-overlay"
    >
      <div className={`w-full max-w-lg mx-4 transition-all duration-500 ${fadeIn ? "translate-y-0 scale-100" : "translate-y-4 scale-95"}`}>
        {ownerNote && (
          <div className="bg-amber-500/90 text-white text-center px-6 py-3 rounded-t-2xl text-sm font-medium" data-testid="text-intro-owner-note">
            {ownerNote}
          </div>
        )}

        <div className={`bg-neutral-900 ${ownerNote ? "rounded-b-2xl" : "rounded-2xl"} shadow-2xl border border-neutral-700/50 overflow-hidden`}>
          <div className="px-6 pt-6 pb-4 flex items-center gap-3 border-b border-neutral-800">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-white" data-testid="text-intro-title">
              {t("A message from Jarvis")}
            </h2>
          </div>

          <div className="px-6 py-5">
            <p className="text-neutral-300 text-[15px] leading-relaxed whitespace-pre-line" data-testid="text-intro-message">
              {introText}
            </p>
          </div>

          <div className="px-6 pb-6">
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              size="lg"
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending}
              data-testid="button-intro-dismiss"
            >
              {t("Let's go")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
