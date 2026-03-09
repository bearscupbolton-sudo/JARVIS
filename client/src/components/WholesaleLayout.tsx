import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Menu, X, Home, ShoppingCart, CalendarClock, ClipboardList, LogOut } from "lucide-react";
import bearLogoPath from "@assets/bear_logo_clean.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

const WHOLESALE_NAV = [
  { href: "/wholesale", label: "Dashboard", icon: Home },
  { href: "/wholesale/order", label: "New Order", icon: ShoppingCart },
  { href: "/wholesale/templates", label: "Recurring Orders", icon: CalendarClock },
  { href: "/wholesale/orders", label: "Order History", icon: ClipboardList },
];

export function WholesaleLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/wholesale") return location === "/wholesale";
    return location.startsWith(href);
  };

  async function handleLogout() {
    await apiRequest("POST", "/api/wholesale/logout");
    setLocation("/wholesale/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-background dark:from-neutral-950 flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between gap-4 h-16">
          <Link href="/wholesale">
            <div className="flex items-center gap-3 cursor-pointer" data-testid="link-wholesale-home">
              <div className="w-9 h-9 rounded-md overflow-hidden bg-amber-800 flex items-center justify-center shrink-0">
                <img src={bearLogoPath} alt="Bear's Cup" className="w-7 h-7 object-contain invert" data-testid="img-wholesale-logo" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-serif text-lg font-semibold tracking-wide text-foreground" data-testid="text-wholesale-brand">BC Wholesale</span>
                <span className="text-[10px] text-muted-foreground tracking-widest uppercase">Bear's Cup Bakehouse</span>
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1" data-testid="nav-wholesale-desktop">
            {WHOLESALE_NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive(item.href)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  data-testid={`link-wholesale-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            ))}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-2 text-muted-foreground" data-testid="button-wholesale-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>

          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} data-testid="button-wholesale-mobile-menu">
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-3 space-y-1" data-testid="nav-wholesale-mobile">
            {WHOLESALE_NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive(item.href)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                  data-testid={`link-wholesale-mobile-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            ))}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-muted-foreground mt-2" data-testid="button-wholesale-mobile-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Bear's Cup Bakehouse — Wholesale Portal
      </footer>
    </div>
  );
}
