import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import type { Tutorial } from "@shared/schema";

function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
    }
  } catch {}
  return null;
}

function VideoPlayer({ url }: { url: string }) {
  const embedUrl = getEmbedUrl(url);
  if (embedUrl) {
    return (
      <iframe
        src={embedUrl}
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        data-testid="iframe-tutorial-video"
      />
    );
  }
  return (
    <video
      src={url}
      controls
      autoPlay
      className="w-full h-full object-contain"
      data-testid="video-tutorial"
    />
  );
}

const SKIP_PATHS = ["/login", "/kiosk", "/clock", "/platform", "/bagel-bros", "/display", "/menu/", "/feedback", "/onboarding/", "/portal/", "/wholesale/"];

export default function TutorialOverlay() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const shouldSkip = !user || SKIP_PATHS.some(p => location.startsWith(p));

  const normalizedPath = location === "/" ? "/" : location.replace(/\/$/, "");

  const { data: pageTutorials = [] } = useQuery<Tutorial[]>({
    queryKey: ["/api/tutorials/for-page", normalizedPath],
    queryFn: async () => {
      const res = await fetch(`/api/tutorials/for-page?pagePath=${encodeURIComponent(normalizedPath)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !shouldSkip,
    staleTime: 60000,
  });

  const markViewedMutation = useMutation({
    mutationFn: (tutorialId: number) => apiRequest("POST", "/api/tutorials/viewed", { tutorialId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutorials/for-page", normalizedPath] });
    },
  });

  useEffect(() => {
    setCurrentIndex(0);
    setDismissed(false);
  }, [location]);

  if (shouldSkip || dismissed || pageTutorials.length === 0) return null;

  const tutorial = pageTutorials[currentIndex];
  if (!tutorial) return null;

  const isLast = currentIndex >= pageTutorials.length - 1;

  function handleDismiss() {
    markViewedMutation.mutate(tutorial.id);
    if (isLast) {
      setDismissed(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  }

  function handleDismissAll() {
    for (const t of pageTutorials) {
      markViewedMutation.mutate(t.id);
    }
    setDismissed(true);
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      data-testid="tutorial-overlay"
    >
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden" data-testid="tutorial-card">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight" data-testid="text-tutorial-title">{tutorial.title}</h2>
              {pageTutorials.length > 1 && (
                <p className="text-[10px] text-muted-foreground">{currentIndex + 1} of {pageTutorials.length}</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-2" onClick={handleDismissAll} data-testid="button-tutorial-close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {tutorial.description && (
          <p className="px-5 text-sm text-muted-foreground leading-relaxed" data-testid="text-tutorial-description">
            {tutorial.description}
          </p>
        )}

        {tutorial.videoUrl && (
          <div className="px-5 pt-3">
            <div className="relative w-full rounded-lg overflow-hidden bg-black aspect-video" data-testid="container-tutorial-video">
              <VideoPlayer url={tutorial.videoUrl} />
            </div>
          </div>
        )}

        {tutorial.textContent && (
          <div className="px-5 pt-3">
            <div className="rounded-lg bg-muted/50 border border-border p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto" data-testid="text-tutorial-content">
              {tutorial.textContent}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-4 mt-2">
          <div className="flex items-center gap-1">
            {pageTutorials.length > 1 && currentIndex > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCurrentIndex(i => i - 1)} data-testid="button-tutorial-prev">
                <ChevronLeft className="w-4 h-4 mr-1" />Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pageTutorials.length > 1 && !isLast && (
              <Button variant="ghost" size="sm" onClick={handleDismissAll} data-testid="button-tutorial-skip-all">
                Skip all
              </Button>
            )}
            <Button size="sm" onClick={handleDismiss} data-testid="button-tutorial-next">
              {isLast ? "Got it" : "Next"}
              {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}