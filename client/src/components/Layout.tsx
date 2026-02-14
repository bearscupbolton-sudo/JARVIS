import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ChefHat, 
  ClipboardList, 
  BookOpen, 
  Bot, 
  LogOut, 
  Menu,
  Users,
  ShieldCheck,
  UserCircle,
  Croissant,
  Coffee,
  UtensilsCrossed,
  Package,
  CalendarDays,
  Calendar,
  Stamp,
} from "lucide-react";
import bearLogoPath from "@assets/IMG_0207_1770933242469.jpeg";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bakery", label: "Bakery", icon: Croissant },
  { href: "/coffee", label: "Coffee", icon: Coffee },
  { href: "/kitchen", label: "Kitchen", icon: UtensilsCrossed },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/pastry-passports", label: "Pastry Passports", icon: Stamp },
  { href: "/production", label: "Production Logs", icon: ClipboardList },
  { href: "/sops", label: "SOPs", icon: BookOpen },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/assistant", label: "Jarvis", icon: Bot },
];

const MANAGER_NAV_ITEMS = [
  { href: "/admin/users", label: "Team", icon: Users },
];

const OWNER_NAV_ITEMS = [
  { href: "/admin/approvals", label: "Approvals", icon: ShieldCheck },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isOwner = user?.role === "owner";

  const { data: pendingCount } = useQuery<{ count: number }>({
    queryKey: ["/api/pending-changes/count"],
    enabled: isOwner,
    refetchInterval: 30000,
  });


  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-border">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-foreground flex items-center justify-center shadow-lg overflow-hidden">
            <img src={bearLogoPath} alt="Bear's Cup" className="w-8 h-8 object-contain invert dark:invert-0" data-testid="img-sidebar-logo" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground" data-testid="text-sidebar-brand">Jarvis</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">by Bear's Cup Bakehouse</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 cursor-pointer group",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-accent" : "group-hover:text-primary")} />
                <span className="font-medium">{item.label}</span>
              </div>
            </Link>
          );
        })}

        {(isOwner || user?.role === "manager") && (
          <>
            <div className="pt-4 pb-1 px-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Admin</p>
            </div>
            {MANAGER_NAV_ITEMS.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 cursor-pointer group",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-md" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => setMobileOpen(false)}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon className={cn("w-5 h-5", isActive ? "text-accent" : "group-hover:text-primary")} />
                    <span className="font-medium">{item.label}</span>
                  </div>
                </Link>
              );
            })}
            {isOwner && OWNER_NAV_ITEMS.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 cursor-pointer group",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-md" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => setMobileOpen(false)}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon className={cn("w-5 h-5", isActive ? "text-accent" : "group-hover:text-primary")} />
                    <span className="font-medium">{item.label}</span>
                    {item.label === "Approvals" && pendingCount && pendingCount.count > 0 && (
                      <Badge variant="destructive" className="ml-auto text-[10px]" data-testid="badge-pending-count">
                        {pendingCount.count}
                      </Badge>
                    )}
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <Link href="/profile">
          <div className="bg-muted/50 rounded-lg p-4 mb-4 cursor-pointer hover-elevate" onClick={() => setMobileOpen(false)} data-testid="link-profile">
            <div className="flex items-center gap-2">
              <UserCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-semibold truncate" data-testid="text-sidebar-username">{user?.username || user?.firstName || user?.email}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1 pl-6">
              <p className="text-xs text-muted-foreground" data-testid="text-sidebar-role">
                {user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : "Team Member"}
              </p>
              {user?.locked && (
                <Badge variant="outline" className="text-[10px]">Read Only</Badge>
              )}
            </div>
          </div>
        </Link>
        <Button 
          variant="destructive" 
          className="w-full justify-start gap-2"
          onClick={() => logout()}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 fixed inset-y-0 z-50">
        <NavContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r border-border">
          <NavContent />
        </SheetContent>

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 min-h-screen flex flex-col">
          {/* Mobile Header */}
          <header className="lg:hidden h-16 border-b border-border bg-card flex items-center px-4 justify-between gap-2 sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <img src={bearLogoPath} alt="Bear's Cup" className="w-8 h-8 object-contain dark:invert" />
              <div className="flex flex-col">
                <span className="font-display font-bold text-lg leading-tight">Jarvis</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">by Bear's Cup Bakehouse</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} data-testid="button-mobile-menu">
              <Menu className="w-6 h-6" />
            </Button>
          </header>

          <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1">
            {children}
          </div>
        </main>
      </Sheet>
    </div>
  );
}
