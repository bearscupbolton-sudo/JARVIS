import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Menu, X, ShoppingBag, User, Home, UtensilsCrossed, ClipboardList } from "lucide-react";
import bearLogoPath from "@assets/bear_logo_clean.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PORTAL_NAV = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/portal/orders", label: "My Orders", icon: ClipboardList },
  { href: "/portal/profile", label: "Profile", icon: User },
];

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/portal") return location === "/portal";
    return location.startsWith(href);
  };

  return (
    <div className="theme-portal min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between gap-4 h-16">
          <Link href="/portal">
            <div className="flex items-center gap-3 cursor-pointer" data-testid="link-portal-home">
              <div className="w-9 h-9 rounded-md overflow-hidden bg-primary flex items-center justify-center shrink-0">
                <img src={bearLogoPath} alt="Bear's Cup" className="w-7 h-7 object-contain invert" data-testid="img-portal-logo" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-serif text-lg font-semibold tracking-wide text-foreground" data-testid="text-portal-brand">La Carte</span>
                <span className="text-[10px] text-muted-foreground tracking-widest uppercase">by Bear's Cup</span>
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1" data-testid="nav-portal-desktop">
            {PORTAL_NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive(item.href)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover-elevate"
                  )}
                  data-testid={`link-portal-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
              </Link>
            ))}
          </nav>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="button-portal-mobile-menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-3 space-y-1" data-testid="nav-portal-mobile">
            {PORTAL_NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive(item.href)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover-elevate"
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid={`link-portal-mobile-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
          {children}
        </div>
      </main>

      <footer className="border-t border-border bg-card/50 mt-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground mb-3" data-testid="text-footer-brand">Bear's Cup Bakehouse</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Handcrafted pastries and artisan coffee, made with care every morning.
              </p>
            </div>
            <div>
              <h4 className="font-serif text-sm font-semibold text-foreground mb-3 uppercase tracking-wider" data-testid="text-footer-hours-heading">Hours</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Monday &ndash; Friday: 6:00 AM &ndash; 4:00 PM</p>
                <p>Saturday &ndash; Sunday: 7:00 AM &ndash; 3:00 PM</p>
              </div>
            </div>
            <div>
              <h4 className="font-serif text-sm font-semibold text-foreground mb-3 uppercase tracking-wider" data-testid="text-footer-contact-heading">Contact</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p data-testid="text-footer-location">Bear's Cup Bakehouse</p>
                <p>hello@bearscup.com</p>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground" data-testid="text-footer-copyright">
              &copy; {new Date().getFullYear()} Bear's Cup Bakehouse. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
