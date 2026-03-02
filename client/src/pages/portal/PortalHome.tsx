import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Sparkles, CalendarDays, ChefHat, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalHome() {
  const { data: customer } = useQuery<{ id: number; firstName: string; email: string }>({
    queryKey: ["/api/portal/me"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me", { credentials: "include" });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
  });

  const { data: freshToday, isLoading: loadingFresh } = useQuery<any[]>({
    queryKey: ["/api/portal/fresh-today"],
    queryFn: async () => {
      const res = await fetch("/api/portal/fresh-today", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: comingSoon, isLoading: loadingSpecials } = useQuery<any[]>({
    queryKey: ["/api/portal/coming-soon"],
    queryFn: async () => {
      const res = await fetch("/api/portal/coming-soon", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-10">
      <section className="text-center pt-4 md:pt-8">
        <p className="text-sm text-muted-foreground tracking-widest uppercase mb-2" data-testid="text-portal-greeting-label">
          {greeting()}
        </p>
        <h1 className="font-serif text-4xl md:text-5xl font-semibold text-foreground tracking-tight" data-testid="text-portal-greeting">
          Welcome{customer ? `, ${customer.firstName}` : ""}
        </h1>
        <p className="text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed" data-testid="text-portal-subtitle">
          Your personal window into Bear's Cup Bakehouse. Browse our menu, order ahead, and skip the line.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/portal/menu">
          <Card className="group cursor-pointer border-border hover:shadow-lg transition-all duration-300 overflow-hidden" data-testid="card-skip-the-line">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <ChefHat className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-lg font-semibold text-foreground">Skip the Line</h3>
                <p className="text-sm text-muted-foreground">Order ahead and pick up when ready</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/menu">
          <Card className="group cursor-pointer border-border hover:shadow-lg transition-all duration-300 overflow-hidden" data-testid="card-browse-menu">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-lg font-semibold text-foreground">Browse Our Menu</h3>
                <p className="text-sm text-muted-foreground">Discover today's pastries and drinks</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-accent" />
          <h2 className="font-serif text-xl font-semibold text-foreground" data-testid="text-fresh-today-heading">
            What's Fresh Today
          </h2>
        </div>
        {loadingFresh ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : freshToday && freshToday.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {freshToday.map((item: any, idx: number) => (
              <Card key={idx} className="border-border" data-testid={`card-fresh-item-${idx}`}>
                <CardContent className="p-4 text-center">
                  <p className="font-serif text-sm font-medium text-foreground">{item.itemName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.quantity} baked today</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground italic" data-testid="text-fresh-empty">
                The ovens are warming up. Check back soon for today's fresh bakes.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays className="w-5 h-5 text-accent" />
          <h2 className="font-serif text-xl font-semibold text-foreground" data-testid="text-coming-soon-heading">
            Coming Soon
          </h2>
        </div>
        {loadingSpecials ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : comingSoon && comingSoon.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {comingSoon.map((item: any, idx: number) => (
              <Card key={idx} className="border-border overflow-hidden" data-testid={`card-special-${idx}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-base font-semibold text-foreground">{item.title}</h3>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                      )}
                    </div>
                    <span className="text-xs bg-accent/15 text-accent-foreground px-2 py-1 rounded-md font-medium shrink-0 whitespace-nowrap">
                      {item.department === "bar" ? "Drink" : "Pastry"}
                    </span>
                  </div>
                  {item.startDate && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Available starting {new Date(item.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground italic" data-testid="text-specials-empty">
                Something wonderful is always in the works. Stay tuned.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="text-center pb-8">
        <div className="border-t border-border pt-8">
          <p className="text-sm text-muted-foreground italic">
            Handmade with care, every single morning.
          </p>
        </div>
      </section>
    </div>
  );
}
