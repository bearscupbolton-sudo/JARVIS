import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

export default function GlobalAckOverlay() {
  const { user } = useAuth();
  const [dismissing, setDismissing] = useState(false);

  if (!user || !user.globalAckRequired) return null;

  const message = user.globalAckMessage || "";

  const handleAcknowledge = async () => {
    setDismissing(true);
    try {
      await apiRequest("POST", "/api/auth/acknowledge");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch {
      setDismissing(false);
    }
  };

  const renderMessage = () => {
    const parts = message.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      data-testid="global-ack-overlay"
    >
      <div className="mx-4 max-w-lg w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg" data-testid="text-ack-title">A Message from Jarvis</h2>
            <p className="text-white/80 text-xs">Bear's Cup Bakehouse</p>
          </div>
        </div>

        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-line" data-testid="text-ack-message">
            {renderMessage()}
          </div>
        </div>

        <div className="px-6 pb-5">
          <Button
            onClick={handleAcknowledge}
            disabled={dismissing}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3"
            data-testid="button-acknowledge"
          >
            {dismissing ? "One moment..." : "Got it — let's go!"}
          </Button>
        </div>
      </div>
    </div>
  );
}
