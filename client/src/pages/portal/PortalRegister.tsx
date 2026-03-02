import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import bearLogoPath from "@assets/bear_logo_clean.png";

export default function PortalRegister() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (form.password !== form.confirmPassword) {
        throw new Error("Passwords do not match");
      }
      const res = await fetch("/api/portal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName || undefined,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/portal/me"], data);
      setLocation("/portal");
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const updateField = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-primary mx-auto mb-4 flex items-center justify-center">
            <img src={bearLogoPath} alt="Bear's Cup" className="w-10 h-10 object-contain invert" data-testid="img-portal-register-logo" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground tracking-tight" data-testid="text-portal-register-title">
            Join La Carte
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your personal bakehouse experience</p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); registerMutation.mutate(); }}
          className="space-y-4"
          data-testid="form-portal-register"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-sm">First Name</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                required
                autoFocus
                className="h-10"
                data-testid="input-portal-first-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-sm">Last Name</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
                className="h-10"
                data-testid="input-portal-last-name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              required
              className="h-10"
              data-testid="input-portal-reg-email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-sm">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="h-10"
              data-testid="input-portal-phone"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              required
              minLength={8}
              className="h-10"
              data-testid="input-portal-reg-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-sm">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={form.confirmPassword}
              onChange={(e) => updateField("confirmPassword", e.target.value)}
              required
              minLength={8}
              className="h-10"
              data-testid="input-portal-confirm-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 text-sm font-medium mt-2"
            disabled={registerMutation.isPending}
            data-testid="button-portal-register"
          >
            {registerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Create Account
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/portal/login">
              <span className="text-primary font-medium cursor-pointer hover:underline" data-testid="link-portal-to-login">
                Sign in
              </span>
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
