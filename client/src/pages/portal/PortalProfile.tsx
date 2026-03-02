import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Mail, Phone, Star } from "lucide-react";

interface Customer {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  membershipTier: string;
  preferences: { dietaryRestrictions?: string[]; favorites?: string[]; allergies?: string[] } | null;
  createdAt: string;
}

const TIER_LABELS: Record<string, { label: string; desc: string }> = {
  free: { label: "Guest", desc: "Order ahead and browse our menu" },
  member: { label: "Member", desc: "Early access to specials and events" },
  vip: { label: "VIP", desc: "Exclusive tastings and priority ordering" },
};

export default function PortalProfile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/portal/me"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me", { credentials: "include" });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/logout", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Logout failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/portal/me"], null);
      setLocation("/portal/login");
    },
    onError: () => {
      toast({ title: "Logout failed", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  if (!customer) return null;

  const tier = TIER_LABELS[customer.membershipTier] || TIER_LABELS.free;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-foreground tracking-tight" data-testid="text-profile-title">
          Profile
        </h1>
      </div>

      <Card className="border-border" data-testid="card-profile-info">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="font-serif text-xl font-semibold text-primary">
                {customer.firstName[0]}{customer.lastName?.[0] || ""}
              </span>
            </div>
            <div className="flex-1">
              <h2 className="font-serif text-xl font-semibold text-foreground" data-testid="text-profile-name">
                {customer.firstName}{customer.lastName ? ` ${customer.lastName}` : ""}
              </h2>
              <div className="flex items-center gap-1.5 mt-1">
                <Star className="w-3.5 h-3.5 text-accent" />
                <span className="text-sm text-accent font-medium" data-testid="text-profile-tier">{tier.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{tier.desc}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground" data-testid="text-profile-email">{customer.email}</span>
            </div>
            {customer.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground" data-testid="text-profile-phone">{customer.phone}</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Member since {new Date(customer.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
          </div>
        </CardContent>
      </Card>

      {customer.preferences && (
        <Card className="border-border" data-testid="card-profile-preferences">
          <CardContent className="p-6">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Preferences</h3>
            <div className="space-y-3">
              {customer.preferences.allergies && customer.preferences.allergies.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Allergies</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customer.preferences.allergies.map((a, i) => (
                      <span key={i} className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-md">{a}</span>
                    ))}
                  </div>
                </div>
              )}
              {customer.preferences.dietaryRestrictions && customer.preferences.dietaryRestrictions.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Dietary</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customer.preferences.dietaryRestrictions.map((d, i) => (
                      <span key={i} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="pt-4">
        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          data-testid="button-portal-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
