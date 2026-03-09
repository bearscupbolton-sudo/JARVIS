import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Store } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import bearLogoPath from "@assets/bear_logo_clean.png";

export default function WholesaleLogin() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setError("");
    setLoading(true);
    try {
      await apiRequest("POST", "/api/wholesale/login", { pin: pin.trim() });
      setLocation("/wholesale");
    } catch (err: any) {
      setError("Invalid PIN. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50 to-orange-50 dark:from-neutral-950 dark:to-neutral-900 p-4">
      <Card className="w-full max-w-sm shadow-xl" data-testid="card-wholesale-login">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-xl overflow-hidden bg-amber-800 flex items-center justify-center mb-3">
            <img src={bearLogoPath} alt="Bear's Cup" className="w-12 h-12 object-contain invert" data-testid="img-wholesale-logo" />
          </div>
          <CardTitle className="text-xl font-serif" data-testid="text-wholesale-title">
            BC Wholesale Portal
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Bear's Cup Bakehouse
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="Enter your PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="text-center text-2xl tracking-[0.5em] h-14"
                autoFocus
                data-testid="input-wholesale-pin"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive text-center" data-testid="text-login-error">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full h-12" disabled={loading || !pin.trim()} data-testid="button-wholesale-login">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <Store className="h-5 w-5 mr-2" />
                  Sign In
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
