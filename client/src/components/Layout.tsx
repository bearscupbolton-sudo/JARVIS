import React from "react";
import { Link, useLocation } from "wouter";
import { PrefetchLink } from "@/components/PrefetchLink";
import { 
  ChefHat, 
  ClipboardList, 
  BookOpen, 
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
  Mic,
  ListChecks,
  Home,
  Layers,
  Cookie,
  Clock,
  Timer,
  Briefcase,
  TrendingUp,
  BarChart3,
  Settings2,
  DollarSign,
  MapPin,
  Eye,
  MessageSquare,
  Gamepad2,
  Hexagon,
  Star,
  Pencil,
  Plus,
  X,
  Check,
  Truck,
  StickyNote,
  Zap,
  CircleDot,
  Code2,
  FlaskConical,
  HeartHandshake,
  RefreshCw,
  Wrench,
  Landmark,
  Tv,
  Store,
  GraduationCap,
  Link2,
  ChevronDown,
  ChevronRight,
  Factory,
  Cog,
  LayoutGrid,
  Shield,
  Brain,
} from "lucide-react";
import bearLogoPath from "@assets/bear_logo_clean.png";
import { useAuth } from "@/hooks/use-auth";
import { useLocationContext } from "@/hooks/use-location-context";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";

const BearLogoIcon = ({ className }: { className?: string }) => (
  <img src="/bear-logo.png" alt="Jarvis" className={cn("rounded-sm object-contain", className)} />
);

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const ALL_SHORTCUT_OPTIONS: NavItem[] = [
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/bakery", label: "Bakery", icon: Croissant },
  { href: "/coffee", label: "Coffee", icon: Coffee },
  { href: "/kitchen", label: "Kitchen", icon: UtensilsCrossed },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/pastry-passports", label: "Pastry Passports", icon: Stamp },
  { href: "/lamination", label: "Lamination Studio", icon: Layers },
  { href: "/production", label: "Production Logs", icon: ClipboardList },
  { href: "/sops", label: "SOPs", icon: BookOpen },
  { href: "/test-kitchen", label: "Test Kitchen", icon: FlaskConical },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/vendors", label: "Vendors", icon: Truck },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/calendar", label: "Event Calendar", icon: Calendar },
  { href: "/time-cards", label: "Time Cards", icon: Clock },
  { href: "/tasks", label: "Task Manager", icon: ListChecks },
  { href: "/assistant", label: "Jarvis", icon: BearLogoIcon },
  { href: "/starkade", label: "Starkade", icon: Gamepad2 },
  { href: "/hive", label: "Jarvis Hive", icon: Hexagon },
  { href: "/kiosk", label: "Kiosk Mode", icon: Mic },
  { href: "/bagel-bros", label: "Bagel Bros", icon: CircleDot },
  { href: "/profile", label: "My Profile", icon: UserCircle },
];

const DEFAULT_SHORTCUTS = ["/calendar", "/recipes", "/schedule", "/tasks"];

const SHORTCUTS_STORAGE_KEY = "jarvis-sidebar-shortcuts";

function loadShortcuts(): string[] {
  try {
    const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_SHORTCUTS;
}

function saveShortcuts(shortcuts: string[]) {
  localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
}

const COLLAPSED_KEY = "jarvis-sidebar-collapsed";

function loadCollapsed(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function saveCollapsed(collapsed: Record<string, boolean>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
}

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  collapsible?: boolean;
  roleRestriction?: "owner_manager" | "owner_gm" | "owner";
};

function SidebarGroup({
  group,
  collapsed,
  onToggle,
  location,
  onNavigate,
  canSeeSidebarItem,
  t,
  pendingCount,
  isOwner,
  isGeneralManager,
}: {
  group: NavGroup;
  collapsed: boolean;
  onToggle: () => void;
  location: string;
  onNavigate: () => void;
  canSeeSidebarItem: (href: string) => boolean;
  t: (s: string) => string;
  pendingCount?: number;
  isOwner: boolean;
  isGeneralManager: boolean;
}) {
  const visibleItems = group.items.filter(item => canSeeSidebarItem(item.href));
  if (visibleItems.length === 0) return null;

  const hasActiveChild = visibleItems.some(item =>
    item.href === "/" ? location === "/" : location.startsWith(item.href)
  );

  return (
    <div className="space-y-0.5">
      {group.collapsible ? (
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors",
            hasActiveChild && collapsed
              ? "text-primary bg-primary/5"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          data-testid={`sidebar-group-${group.id}`}
        >
          <group.icon className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">{group.label}</span>
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      ) : (
        <div className="px-3 pt-3 pb-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <group.icon className="w-3 h-3" />
            {group.label}
          </p>
        </div>
      )}

      {!collapsed && visibleItems.map((item) => {
        const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
        return (
          <PrefetchLink key={item.href} href={item.href}>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 cursor-pointer group ml-1",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={onNavigate}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <item.icon className={cn("w-4 h-4", isActive ? "text-accent" : "group-hover:text-primary")} />
              <span className="text-sm font-medium">{t(item.label)}</span>
              {item.label === "Approvals" && pendingCount && pendingCount > 0 && (
                <Badge variant="destructive" className="ml-auto text-[10px]" data-testid="badge-pending-count">
                  {pendingCount}
                </Badge>
              )}
            </div>
          </PrefetchLink>
        );
      })}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [shortcuts, setShortcuts] = React.useState<string[]>(loadShortcuts);
  const [editingShortcuts, setEditingShortcuts] = React.useState(false);
  const [editDraft, setEditDraft] = React.useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>(loadCollapsed);
  const { t } = useTranslation();
  const isOwner = user?.role === "owner";
  const isManager = user?.role === "manager";
  const isGeneralManager = !!(user as any)?.isGeneralManager;
  const sidebarPerms: string[] | null = (user as any)?.sidebarPermissions ?? null;
  const canSeeSidebarItem = (href: string) => isOwner || sidebarPerms === null || sidebarPerms.includes(href);
  const permLevelName: string | null = (user as any)?.permissionLevelName ?? null;

  React.useEffect(() => {
    if (user && location) {
      const basePath = "/" + (location.split("/").filter(Boolean).slice(0, 2).join("/"));
      apiRequest("POST", "/api/activity", { action: "page_view", metadata: { path: basePath } }).catch(() => {});
    }
  }, [location, user]);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") {
        queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/sent"] });
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const { data: pendingCount } = useQuery<{ count: number }>({
    queryKey: ["/api/pending-changes/count"],
    enabled: isOwner || isGeneralManager,
    refetchInterval: 30000,
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    refetchInterval: 30000,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  const { data: urgentData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/urgent-unread"],
    refetchInterval: 60000,
    staleTime: 30_000,
  });


  const { locations: allLocations, selectedLocationId, setSelectedLocationId } = useLocationContext();

  const shortcutItems = React.useMemo(() => 
    shortcuts
      .filter(href => canSeeSidebarItem(href))
      .map(href => ALL_SHORTCUT_OPTIONS.find(o => o.href === href))
      .filter(Boolean) as NavItem[],
    [shortcuts, sidebarPerms]
  );

  const startEditingShortcuts = () => {
    setEditDraft([...shortcuts]);
    setEditingShortcuts(true);
  };

  const toggleShortcutDraft = (href: string) => {
    setEditDraft(prev => 
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    );
  };

  const saveShortcutEdits = () => {
    setShortcuts(editDraft);
    saveShortcuts(editDraft);
    setEditingShortcuts(false);
  };

  const cancelShortcutEdits = () => {
    setEditDraft([]);
    setEditingShortcuts(false);
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      saveCollapsed(next);
      return next;
    });
  };

  const PRODUCTION_HUB: NavGroup = {
    id: "production",
    label: "Production Hub",
    icon: Factory,
    collapsible: true,
    items: [
      { href: "/bakery", label: "Bakery", icon: Croissant },
      { href: "/pastry-passports", label: "Pastry Passports", icon: Stamp },
      { href: "/production", label: "Production Logs", icon: ClipboardList },
      { href: "/kitchen", label: "Kitchen", icon: UtensilsCrossed },
      { href: "/coffee", label: "Coffee", icon: Coffee },
      { href: "/recipes", label: "Formula Library", icon: ChefHat },
      { href: "/sops", label: "SOPs", icon: BookOpen },
      { href: "/bagel-bros", label: "Bagel Bros", icon: CircleDot },
    ],
  };

  const OPS_SUPPORT: NavGroup = {
    id: "ops",
    label: "Operations & Support",
    icon: Cog,
    collapsible: true,
    items: [
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/tasks", label: "Task Manager", icon: ListChecks },
      { href: "/time-cards", label: "Time Cards", icon: Clock },
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/vendors", label: "Vendors", icon: Truck },
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/notes", label: "Notes", icon: StickyNote },
      { href: "/admin/tutorials", label: "Tutorials", icon: GraduationCap },
      { href: "/test-kitchen", label: "Test Kitchen", icon: FlaskConical },
      { href: "/admin/users", label: "Team", icon: Users },
      { href: "/hr", label: "HR", icon: Briefcase },
      { href: "/mll", label: "MLL", icon: Truck },
      { href: "/time-review", label: "Time Review", icon: Timer },
      { href: "/admin/pastry-items", label: "Master Pastry List", icon: Cookie },
      { href: "/pastry-goals", label: "Pastry Goals", icon: TrendingUp },
      { href: "/starkade", label: "Starkade", icon: Gamepad2 },
      { href: "/hive", label: "Jarvis Hive", icon: Hexagon },
      { href: "/kiosk", label: "Kiosk Mode", icon: Mic },
    ],
  };

  const INTELLIGENCE: NavGroup = {
    id: "intelligence",
    label: "Intelligence & Data",
    icon: Brain,
    collapsible: true,
    items: [
      { href: "/the-firm", label: "The Firm", icon: Landmark },
      { href: "/admin/insights", label: "Insights", icon: Eye },
      { href: "/loop", label: "The Loop", icon: RefreshCw },
      { href: "/payroll", label: "Payroll Review", icon: DollarSign },
      { href: "/sentiment", label: "Sentiment Matrix", icon: HeartHandshake },
      { href: "/admin/ttis", label: "TTIS", icon: DollarSign },
      { href: "/admin/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/wholesale-admin", label: "Wholesale", icon: Store },
      { href: "/jmt", label: "Menu Theater", icon: Tv },
      { href: "/live-inventory", label: "Live Inventory", icon: BarChart3 },
      { href: "/dev-feedback", label: "Dev Feedback", icon: Code2 },
    ],
  };

  const INTEGRATIONS: NavGroup = {
    id: "integrations",
    label: "Integrations",
    icon: Link2,
    collapsible: true,
    items: [
      { href: "/admin/square", label: "Square Settings", icon: Settings2 },
      { href: "/square-labor", label: "Square Labor", icon: Zap },
      { href: "/adp-labor", label: "ADP Labor", icon: Link2 },
    ],
  };

  const navGroups: NavGroup[] = [PRODUCTION_HUB, OPS_SUPPORT];

  if (isOwner || isManager || isGeneralManager) {
    navGroups.push(INTELLIGENCE);
  }
  if (isOwner) {
    navGroups.push(INTEGRATIONS);
  }

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-border">
      <div className="p-6">
        <Link href="/">
          <div
            className="flex items-center gap-3 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 -my-1.5 hover:bg-muted/50 transition-colors"
            onClick={() => setMobileOpen(false)}
            data-testid="link-home-banner"
          >
            <div className="w-10 h-10 rounded-lg bg-foreground flex items-center justify-center shadow-lg overflow-hidden shrink-0">
              <img src={bearLogoPath} alt="Bear's Cup" className="w-8 h-8 object-contain invert dark:invert-0" data-testid="img-sidebar-logo" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground" data-testid="text-sidebar-brand">Jarvis</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">by Bear's Cup Bakehouse</p>
            </div>
          </div>
        </Link>
      </div>

      {allLocations.length > 1 && (
        <div className="px-4 pb-2">
          <Select
            value={selectedLocationId ? String(selectedLocationId) : ""}
            onValueChange={(v) => setSelectedLocationId(Number(v))}
          >
            <SelectTrigger className="w-full h-9 text-sm" data-testid="select-location">
              <MapPin className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {allLocations.map(loc => (
                <SelectItem key={loc.id} value={String(loc.id)}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto">
        {/* Global Pulse — always visible top-level items */}
        {([
          { href: "/", label: "Home", icon: Home },
          { href: "/lamination", label: "Lamination Studio", icon: Layers },
          { href: "/messages", label: "Messages", icon: MessageSquare },
          { href: "/assistant", label: "Jarvis", icon: BearLogoIcon },
        ] as NavItem[]).filter(item => item.href === "/" || canSeeSidebarItem(item.href)).map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <PrefetchLink key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 cursor-pointer group",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setMobileOpen(false)}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-accent" : "group-hover:text-primary")} />
                <span className="font-medium">{t(item.label)}</span>
                {item.label === "Messages" && (
                  <div className="ml-auto flex items-center gap-1.5">
                    {urgentData && urgentData.count > 0 && (
                      <span className="relative flex h-3 w-3" data-testid="indicator-urgent-messages">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                      </span>
                    )}
                    {unreadCount && unreadCount.count > 0 && (
                      <Badge variant="destructive" className="text-[10px] min-w-[20px] justify-center" data-testid="badge-unread-messages">
                        {unreadCount.count}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </PrefetchLink>
          );
        })}

        {/* Shortcuts Section */}
        {!editingShortcuts && shortcutItems.length > 0 && (
          <>
            <div className="pt-3 pb-1 px-2 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1">
                <Star className="w-3 h-3" />
                Shortcuts
              </p>
              <button
                onClick={startEditingShortcuts}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-edit-shortcuts"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            {shortcutItems.map((item) => {
              const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
              return (
                <PrefetchLink key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 cursor-pointer group",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => setMobileOpen(false)}
                    data-testid={`shortcut-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon className={cn("w-4 h-4", isActive ? "text-accent" : "group-hover:text-primary")} />
                    <span className="text-sm font-medium">{t(item.label)}</span>
                  </div>
                </PrefetchLink>
              );
            })}
          </>
        )}

        {editingShortcuts && (
          <>
            <div className="pt-3 pb-1 px-2 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1">
                <Star className="w-3 h-3" />
                Edit Shortcuts
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={saveShortcutEdits}
                  className="text-green-500 hover:text-green-400 transition-colors"
                  data-testid="button-save-shortcuts"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={cancelShortcutEdits}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-cancel-shortcuts"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {ALL_SHORTCUT_OPTIONS.map((item) => {
                const selected = editDraft.includes(item.href);
                return (
                  <div
                    key={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 rounded-md cursor-pointer transition-all duration-200",
                      selected
                        ? "bg-primary/10 text-foreground border border-primary/30"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => toggleShortcutDraft(item.href)}
                    data-testid={`shortcut-option-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon className={cn("w-4 h-4", selected ? "text-primary" : "")} />
                    <span className="text-sm font-medium flex-1">{t(item.label)}</span>
                    {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Collapsible Nav Groups */}
        <div className="pt-2 space-y-1">
          {navGroups.map(group => (
            <SidebarGroup
              key={group.id}
              group={group}
              collapsed={!!collapsedGroups[group.id]}
              onToggle={() => toggleGroup(group.id)}
              location={location}
              onNavigate={() => setMobileOpen(false)}
              canSeeSidebarItem={canSeeSidebarItem}
              t={t}
              pendingCount={pendingCount?.count}
              isOwner={isOwner}
              isGeneralManager={isGeneralManager}
            />
          ))}
        </div>
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
                {permLevelName || (user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : "Team Member")}
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
          {t("Sign Out")}
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
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer" data-testid="link-mobile-home-banner">
                <img src={bearLogoPath} alt="Bear's Cup" className="w-8 h-8 object-contain dark:invert" />
                <div className="flex flex-col">
                  <span className="font-display font-bold text-lg leading-tight">Jarvis</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">by Bear's Cup Bakehouse</span>
                </div>
              </div>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} data-testid="button-mobile-menu">
              <Menu className="w-6 h-6" />
            </Button>
          </header>

          {!!(user as any)?.demoMode && (
            <div className="bg-amber-500/90 text-white text-center py-1.5 px-4 text-sm font-medium" data-testid="banner-demo-mode">
              {t("Demo Mode — Showing sample data")}
            </div>
          )}
          <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1">
            {children}
          </div>
        </main>
      </Sheet>
    </div>
  );
}
