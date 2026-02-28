import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Bug, Lightbulb, Sparkles, Loader2, Send } from "lucide-react";

const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug Report", icon: Bug, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", description: "Something isn't working right" },
  { value: "suggestion", label: "Suggestion", icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", description: "An improvement idea" },
  { value: "idea", label: "Idea", icon: Sparkles, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", description: "A new feature or concept" },
] as const;

export default function DevFeedbackOverlay() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("bug");
  const [description, setDescription] = useState("");
  const tapTimesRef = useRef<number[]>([]);

  const { data: devModeData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/app-settings/dev-mode"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const isActive = devModeData?.enabled ?? false;

  const submitMutation = useMutation({
    mutationFn: (data: { type: string; description: string; pagePath: string }) =>
      apiRequest("POST", "/api/dev-feedback", data),
    onSuccess: () => {
      toast({ title: "Feedback submitted — thanks!" });
      setOpen(false);
      setDescription("");
      setType("bug");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to submit feedback", description: error.message, variant: "destructive" });
    },
  });

  const handleTripleTap = useCallback(() => {
    if (!isActive) return;
    const now = Date.now();
    tapTimesRef.current.push(now);
    tapTimesRef.current = tapTimesRef.current.filter(t => now - t < 600);
    if (tapTimesRef.current.length >= 3) {
      tapTimesRef.current = [];
      setOpen(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, button, a, [role='button'], [role='dialog']")) return;
      handleTripleTap();
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [isActive, handleTripleTap]);

  const handleSubmit = () => {
    if (!description.trim()) return;
    submitMutation.mutate({
      type,
      description: description.trim(),
      pagePath: window.location.pathname,
    });
  };

  if (!isActive || !user) return null;

  const selectedType = FEEDBACK_TYPES.find(t => t.value === type)!;

  return (
    <>
      <div
        className="fixed bottom-4 left-4 z-40 w-3 h-3 rounded-full bg-green-500 animate-pulse opacity-60 cursor-pointer"
        title="Dev Mode active — triple-tap anywhere to report"
        onClick={() => setOpen(true)}
        data-testid="indicator-dev-mode"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-dev-feedback">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-primary" />
              Dev Feedback
            </DialogTitle>
            <DialogDescription>
              Report a bug, suggest an improvement, or share an idea.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What kind of feedback?</Label>
              <div className="grid grid-cols-3 gap-2">
                {FEEDBACK_TYPES.map((ft) => {
                  const Icon = ft.icon;
                  const isSelected = type === ft.value;
                  return (
                    <button
                      key={ft.value}
                      onClick={() => setType(ft.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${
                        isSelected ? ft.bg + " border-current" : "border-transparent bg-muted/30 hover:bg-muted/50"
                      }`}
                      data-testid={`button-type-${ft.value}`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? ft.color : "text-muted-foreground"}`} />
                      <span className={`text-xs font-medium ${isSelected ? ft.color : ""}`}>{ft.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{selectedType.description}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  type === "bug"
                    ? "What happened? What did you expect to happen?"
                    : type === "suggestion"
                    ? "What would you improve and how?"
                    : "Describe your idea..."
                }
                rows={4}
                data-testid="input-feedback-description"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Page: {window.location.pathname}</span>
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full"
              disabled={!description.trim() || submitMutation.isPending}
              data-testid="button-submit-feedback"
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Submit Feedback
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
