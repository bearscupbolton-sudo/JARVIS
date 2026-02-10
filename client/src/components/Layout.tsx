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
  X
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/production", label: "Production Logs", icon: ClipboardList },
  { href: "/sops", label: "SOPs", icon: BookOpen },
  { href: "/assistant", label: "Jarvis", icon: Bot },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-border">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <ChefHat className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">JARVIS</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Bakery OS</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {NAV_ITEMS.map((item) => {
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
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-accent" : "group-hover:text-primary")} />
                <span className="font-medium">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <div className="bg-muted/50 rounded-lg p-4 mb-4">
          <p className="text-sm font-semibold truncate">{user?.firstName || user?.email}</p>
          <p className="text-xs text-muted-foreground">Baker</p>
        </div>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 border-destructive/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
          onClick={() => logout()}
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
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col">
        {/* Mobile Header */}
        <header className="lg:hidden h-16 border-b border-border bg-card flex items-center px-4 justify-between sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg">JARVIS</span>
          </div>
          <SheetTrigger asChild onClick={() => setMobileOpen(true)}>
            <Button variant="ghost" size="icon">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
        </header>

        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
