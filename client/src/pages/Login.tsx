import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Loader2, KeyRound, UserPlus } from "lucide-react";
import bearLogoPath from "@assets/IMG_0207_1770933242469.jpeg";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading: checkingSetup } = useQuery<{ hasUsers: boolean }>({
    queryKey: ["/api/auth/has-users"],
    queryFn: async () => {
      const res = await fetch("/api/auth/has-users");
      return res.json();
    },
  });

  const needsSetup = status && !status.hasUsers;

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (needsSetup) {
    return <SetupOwner />;
  }

  return <LoginForm />;
}

function LoginForm() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", { username, pin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center opacity-15" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/80 via-primary/60 to-primary/90" />

        <div className="relative z-10 flex items-center gap-3">
          <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-10 h-10 object-contain invert" />
          <span className="font-display text-2xl font-bold tracking-tight">JARVIS</span>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-40 h-40 object-contain invert mb-8 opacity-90" />
          <h1 className="font-display text-5xl font-bold leading-tight mb-4">
            Bear's Cup<br />Bakehouse
          </h1>
          <p className="text-lg text-primary-foreground/70 font-light leading-relaxed max-w-md">
            Professional bakery operations, managed with precision.
          </p>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/40">
          Powered by Jarvis Bakery OS
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left space-y-4">
            <div className="lg:hidden flex justify-center mb-6">
              <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-24 h-24 object-contain dark:invert" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-login-title">Welcome back</h2>
            <p className="text-muted-foreground">Sign in with your username and PIN.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                data-testid="input-login-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter your PIN"
                autoComplete="current-password"
                data-testid="input-login-pin"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
              disabled={loginMutation.isPending || !username || !pin}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-5 h-5 mr-2" />
                  Sign In
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground mt-8">
              Authorized personnel only. Contact your manager if you need access.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function SetupOwner() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/setup-owner", {
        firstName,
        lastName: lastName || undefined,
        username,
        pin,
        phone: phone || undefined,
        contactEmail: contactEmail || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/has-users"] });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ title: "Setup failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== confirmPin) {
      toast({ title: "PINs don't match", variant: "destructive" });
      return;
    }
    if (pin.length < 4) {
      toast({ title: "PIN must be at least 4 digits", variant: "destructive" });
      return;
    }
    setupMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-4">
          <img src={bearLogoPath} alt="Bear's Cup Bakehouse" className="w-20 h-20 object-contain mx-auto dark:invert" />
          <h2 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-setup-title">Set Up Your Bakery</h2>
          <p className="text-muted-foreground">Create the owner account to get started with Jarvis.</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="setup-first">First Name *</Label>
                  <Input
                    id="setup-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    required
                    data-testid="input-setup-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-last">Last Name</Label>
                  <Input
                    id="setup-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    data-testid="input-setup-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-username">Username *</Label>
                <Input
                  id="setup-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  required
                  data-testid="input-setup-username"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="setup-pin">PIN * (4-8 digits)</Label>
                  <Input
                    id="setup-pin"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Create PIN"
                    required
                    data-testid="input-setup-pin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-confirm">Confirm PIN *</Label>
                  <Input
                    id="setup-confirm"
                    type="password"
                    inputMode="numeric"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    placeholder="Confirm PIN"
                    required
                    data-testid="input-setup-confirm-pin"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-phone">Phone</Label>
                <Input
                  id="setup-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  data-testid="input-setup-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-email">Email</Label>
                <Input
                  id="setup-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Email address"
                  data-testid="input-setup-email"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-12 text-base font-semibold"
                disabled={setupMutation.isPending || !firstName || !username || !pin || !confirmPin}
                data-testid="button-setup-submit"
              >
                {setupMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-5 h-5 mr-2" />
                    Create Owner Account
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
