import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Delete, ChefHat } from "lucide-react";

type KioskResponse = {
  action: "clock-in" | "clock-out";
  entry: any;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  };
};

type KioskState = "idle" | "loading" | "welcome" | "error";

export default function KioskClock() {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<KioskState>("idle");
  const [response, setResponse] = useState<KioskResponse | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async (submittedPin: string) => {
    if (submittedPin.length < 4) return;
    setState("loading");
    try {
      const res = await fetch("/api/kiosk/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: submittedPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Invalid PIN");
        setState("error");
        setTimeout(() => {
          setState("idle");
          setPin("");
          setError("");
        }, 3000);
        return;
      }
      setResponse(data);
      setState("welcome");
      setTimeout(() => {
        setState("idle");
        setPin("");
        setResponse(null);
      }, 4000);
    } catch {
      setError("Connection error. Please try again.");
      setState("error");
      setTimeout(() => {
        setState("idle");
        setPin("");
        setError("");
      }, 3000);
    }
  }, []);

  const handleKeyPress = useCallback((digit: string) => {
    if (state !== "idle") return;
    setPin(prev => {
      const next = prev + digit;
      if (next.length >= 4) {
        setTimeout(() => handleSubmit(next), 100);
      }
      return next.slice(0, 8);
    });
  }, [state, handleSubmit]);

  const handleDelete = useCallback(() => {
    if (state !== "idle") return;
    setPin(prev => prev.slice(0, -1));
  }, [state]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleKeyPress(e.key);
      else if (e.key === "Backspace") handleDelete();
      else if (e.key === "Enter" && pin.length >= 4) handleSubmit(pin);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleKeyPress, handleDelete, handleSubmit, pin]);

  const userName = response?.user
    ? response.user.firstName
      ? `${response.user.firstName}${response.user.lastName ? ` ${response.user.lastName}` : ""}`
      : response.user.username || "Team Member"
    : "";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 select-none" data-testid="container-kiosk-clock">
      {state === "welcome" && response ? (
        <div className="animate-in fade-in zoom-in duration-500 flex flex-col items-center gap-6 text-center" data-testid="container-kiosk-welcome">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
            response.action === "clock-in" ? "bg-emerald-500/10" : "bg-primary/10"
          }`}>
            {response.action === "clock-in" ? (
              <LogIn className="w-12 h-12 text-emerald-500" />
            ) : (
              <LogOut className="w-12 h-12 text-primary" />
            )}
          </div>
          <div>
            <p className="text-lg text-muted-foreground mb-2" data-testid="text-kiosk-action">
              {response.action === "clock-in" ? "Clocked In" : "Clocked Out"}
            </p>
            <h1 className="text-4xl md:text-5xl font-display font-bold italic" data-testid="text-kiosk-welcome-name">
              Welcome back, {userName}!
            </h1>
            <p className="text-xl text-muted-foreground mt-3 font-display italic">
              {response.action === "clock-in" ? "Have a great shift!" : "Great work today!"}
            </p>
          </div>
        </div>
      ) : state === "error" ? (
        <div className="animate-in fade-in duration-300 flex flex-col items-center gap-6 text-center" data-testid="container-kiosk-error">
          <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-4xl text-destructive font-bold">!</span>
          </div>
          <p className="text-xl text-destructive font-medium" data-testid="text-kiosk-error">{error}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-8 w-full max-w-sm" data-testid="container-kiosk-pin-entry">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <ChefHat className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-center">Bear's Cup Bakehouse</h1>
            <p className="text-muted-foreground text-sm">Enter your PIN to clock in or out</p>
          </div>

          <div className="flex items-center gap-3 h-12" data-testid="container-kiosk-pin-dots">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  i < pin.length ? "bg-primary scale-110" : i < 4 ? "bg-border" : "bg-transparent"
                } ${i >= 4 && i >= pin.length ? "invisible" : ""}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => (
              <Button
                key={digit}
                variant="outline"
                className="h-16 text-2xl font-mono"
                onClick={() => handleKeyPress(digit)}
                disabled={state === "loading"}
                data-testid={`button-kiosk-digit-${digit}`}
              >
                {digit}
              </Button>
            ))}
            <div />
            <Button
              variant="outline"
              className="h-16 text-2xl font-mono"
              onClick={() => handleKeyPress("0")}
              disabled={state === "loading"}
              data-testid="button-kiosk-digit-0"
            >
              0
            </Button>
            <Button
              variant="outline"
              className="h-16"
              onClick={handleDelete}
              disabled={state === "loading" || pin.length === 0}
              data-testid="button-kiosk-delete"
            >
              <Delete className="w-5 h-5" />
            </Button>
          </div>

          {pin.length >= 4 && (
            <Button
              className="w-full max-w-[280px]"
              onClick={() => handleSubmit(pin)}
              disabled={state === "loading"}
              data-testid="button-kiosk-submit"
            >
              {state === "loading" ? "Checking..." : "Submit"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
