import { useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import bearLogoPath from "@assets/bear_logo_clean.png";

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/portal/me"], data);
      setLocation("/portal");
    },
    onError: (error: Error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-primary mx-auto mb-4 flex items-center justify-center">
            <img src={bearLogoPath} alt="Bear's Cup" className="w-12 h-12 object-contain invert" data-testid="img-portal-login-logo" />
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground tracking-tight" data-testid="text-portal-login-title">
            La Carte
          </h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-widest uppercase">by Bear's Cup Bakehouse</p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); loginMutation.mutate(); }}
          className="space-y-5"
          data-testid="form-portal-login"
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="h-11"
              data-testid="input-portal-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11"
              data-testid="input-portal-password"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 text-sm font-medium"
            disabled={loginMutation.isPending}
            data-testid="button-portal-login"
          >
            {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Sign In
          </Button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            New to La Carte?{" "}
            <Link href="/portal/register">
              <span className="text-primary font-medium cursor-pointer hover:underline" data-testid="link-portal-register">
                Create an account
              </span>
            </Link>
          </p>
        </div>

        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground/60 italic">
            "Every great morning begins with great pastry."
          </p>
        </div>
      </div>
    </div>
  );
}
