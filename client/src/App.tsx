import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { LocationProvider } from "@/hooks/use-location-context";
import { LanguageContext } from "@/lib/i18n";
import { Layout } from "@/components/Layout";
import LobbyCheckAlert from "@/components/LobbyCheckAlert";
import BakeryTimerAlert from "@/components/BakeryTimerAlert";
import TutorialOverlay from "@/components/TutorialOverlay";
import DevFeedbackOverlay from "@/components/DevFeedbackOverlay";
import GlobalAckOverlay from "@/components/GlobalAckOverlay";
import UrgentMessageOverlay from "@/components/UrgentMessageOverlay";
import JarvisIntroOverlay from "@/components/JarvisIntroOverlay";
import { PortalLayout } from "@/components/PortalLayout";
import { WholesaleLayout } from "@/components/WholesaleLayout";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from "react";
import { prefetchCoreRoutes, cancelPrefetch } from "@/lib/prefetch";

import Login from "@/pages/Login";

const Home = lazy(() => import("@/pages/Home"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Bakery = lazy(() => import("@/pages/Bakery"));
const Coffee = lazy(() => import("@/pages/Coffee"));
const Kitchen = lazy(() => import("@/pages/Kitchen"));
const Platform934 = lazy(() => import("@/pages/Platform934"));
const Recipes = lazy(() => import("@/pages/Recipes"));
const RecipeDetail = lazy(() => import("@/pages/RecipeDetail"));
const BeginRecipe = lazy(() => import("@/pages/BeginRecipe"));
const Production = lazy(() => import("@/pages/Production"));
const SOPs = lazy(() => import("@/pages/SOPs"));
const Assistant = lazy(() => import("@/pages/Assistant"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const AdminApprovals = lazy(() => import("@/pages/AdminApprovals"));
const Profile = lazy(() => import("@/pages/Profile"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const InventoryItems = lazy(() => import("@/pages/InventoryItems"));
const InvoiceCapture = lazy(() => import("@/pages/InvoiceCapture"));
const PriceHeatmap = lazy(() => import("@/pages/PriceHeatmap"));
const InventoryCount = lazy(() => import("@/pages/InventoryCount"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const PastryPassports = lazy(() => import("@/pages/PastryPassports"));
const PastryPassportDetail = lazy(() => import("@/pages/PastryPassportDetail"));
const Kiosk = lazy(() => import("@/pages/Kiosk"));
const Display = lazy(() => import("@/pages/Display"));
const MenuScreen = lazy(() => import("@/pages/MenuScreen"));
const JMT = lazy(() => import("@/pages/JMT"));
const TaskManager = lazy(() => import("@/pages/TaskManager"));
const AssignedTaskList = lazy(() => import("@/pages/AssignedTaskList"));
const LaminationStudio = lazy(() => import("@/pages/LaminationStudio"));
const PastryItems = lazy(() => import("@/pages/PastryItems"));
const KioskClock = lazy(() => import("@/pages/KioskClock"));
const TimeCards = lazy(() => import("@/pages/TimeCards"));
const TimeReview = lazy(() => import("@/pages/TimeReview"));
const SquareSettings = lazy(() => import("@/pages/SquareSettings"));
const PastryGoals = lazy(() => import("@/pages/PastryGoals"));
const LiveInventory = lazy(() => import("@/pages/LiveInventory"));
const TTIS = lazy(() => import("@/pages/TTIS"));
const AdminInsights = lazy(() => import("@/pages/AdminInsights"));
const Messages = lazy(() => import("@/pages/Messages"));
const Starkade = lazy(() => import("@/pages/Starkade"));
const CustomerFeedback = lazy(() => import("@/pages/CustomerFeedback"));
const FeedbackQRCode = lazy(() => import("@/pages/FeedbackQRCode"));
const SentimentMatrix = lazy(() => import("@/pages/SentimentMatrix"));
const TheLoop = lazy(() => import("@/pages/TheLoop"));
const HR = lazy(() => import("@/pages/HR"));
const MLL = lazy(() => import("@/pages/MLL"));
const Notes = lazy(() => import("@/pages/Notes"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const BagelBros = lazy(() => import("@/pages/BagelBros"));
const TestKitchen = lazy(() => import("@/pages/TestKitchen"));
const DevFeedback = lazy(() => import("@/pages/DevFeedback"));
const Tutorials = lazy(() => import("@/pages/Tutorials"));
const Maintenance = lazy(() => import("@/pages/Maintenance"));
const PrepEQ = lazy(() => import("@/pages/PrepEQ"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const PortalLogin = lazy(() => import("@/pages/portal/PortalLogin"));
const PortalRegister = lazy(() => import("@/pages/portal/PortalRegister"));
const PortalHome = lazy(() => import("@/pages/portal/PortalHome"));
const PortalMenu = lazy(() => import("@/pages/portal/PortalMenu"));
const PortalOrders = lazy(() => import("@/pages/portal/PortalOrders"));
const PortalProfile = lazy(() => import("@/pages/portal/PortalProfile"));
const WholesaleLogin = lazy(() => import("@/pages/wholesale/WholesaleLogin"));
const WholesaleHome = lazy(() => import("@/pages/wholesale/WholesaleHome"));
const WholesaleOrder = lazy(() => import("@/pages/wholesale/WholesaleOrder"));
const WholesaleTemplates = lazy(() => import("@/pages/wholesale/WholesaleTemplates"));
const WholesaleOrders = lazy(() => import("@/pages/wholesale/WholesaleOrders"));
const WholesaleOnboarding = lazy(() => import("@/pages/wholesale/WholesaleOnboarding"));
const WholesaleAdmin = lazy(() => import("@/pages/WholesaleAdmin"));
const TheFirm = lazy(() => import("@/pages/TheFirm"));
const QuickPayout = lazy(() => import("@/pages/QuickPayout"));
const JarvisHive = lazy(() => import("@/pages/JarvisHive"));
const PayrollReview = lazy(() => import("@/pages/PayrollReview"));
const SquareLaborSync = lazy(() => import("@/pages/SquareLaborSync"));
const AdpLaborSync = lazy(() => import("@/pages/AdpLaborSync"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}

function ContentLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; isChunkError: boolean; errorMessage: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, isChunkError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error) {
    const isChunkError =
      error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("Loading CSS chunk") ||
      error?.message?.includes("Importing a module script failed");
    return { hasError: true, isChunkError, errorMessage: error?.message || "Unknown error" };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    const isChunkError =
      error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("Importing a module script failed");
    if (isChunkError) {
      const reloadKey = "chunk_error_reload";
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload) > 30000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
      }
    }
    console.error("[AppErrorBoundary]", error, _info);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
            <p className="text-sm text-muted-foreground">A new version is available.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
              data-testid="button-reload-app"
            >
              Reload App
            </button>
          </div>
        );
      }
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
            <span className="text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold" data-testid="text-error-title">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-md">This page ran into an issue. Try going back or refreshing.</p>
          <div className="flex gap-3">
            <button
              onClick={() => { window.location.href = "/"; }}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
              data-testid="button-go-home"
            >
              Go Home
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
              data-testid="button-reload-page"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ component: Component, noLayout }: { component: React.ComponentType; noLayout?: boolean }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  if (noLayout) {
    return (
      <LocationProvider>
        <Suspense fallback={<PageLoader />}>
          <Component />
        </Suspense>
      </LocationProvider>
    );
  }

  return (
    <LocationProvider>
      <Layout>
        <Suspense fallback={<ContentLoader />}>
          <Component />
        </Suspense>
      </Layout>
    </LocationProvider>
  );
}

function PortalProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();

  const { data: customer, isLoading } = useQuery<{ id: number; firstName: string; email: string } | null>({
    queryKey: ["/api/portal/me"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch customer");
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!isLoading && !customer) {
      setLocation("/portal/login");
    }
  }, [isLoading, customer, setLocation]);

  if (isLoading) {
    return (
      <div className="theme-portal min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  return (
    <PortalLayout>
      <Suspense fallback={<ContentLoader />}>
        <Component />
      </Suspense>
    </PortalLayout>
  );
}

function PortalPublicRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <div className="theme-portal min-h-screen bg-background">
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    </div>
  );
}

function WholesaleProtectedRoute({ component: Component, skipOnboardingCheck }: { component: React.ComponentType; skipOnboardingCheck?: boolean }) {
  const [, setLocation] = useLocation();

  const { data: customer, isLoading } = useQuery<{ id: number; businessName: string; onboardingComplete: boolean } | null>({
    queryKey: ["/api/wholesale/me"],
    queryFn: async () => {
      const res = await fetch("/api/wholesale/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!isLoading && !customer) {
      setLocation("/wholesale/login");
    } else if (!isLoading && customer && !customer.onboardingComplete && !skipOnboardingCheck) {
      setLocation("/wholesale/onboarding");
    }
  }, [isLoading, customer, setLocation, skipOnboardingCheck]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!customer) return null;
  if (!customer.onboardingComplete && !skipOnboardingCheck) return null;

  return (
    <WholesaleLayout>
      <Suspense fallback={<ContentLoader />}>
        <Component />
      </Suspense>
    </WholesaleLayout>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const prefetched = useRef(false);
  const userLang = (user as any)?.language || "en";

  useEffect(() => {
    if (user && !prefetched.current) {
      prefetched.current = true;
      prefetchCoreRoutes();
      return () => cancelPrefetch();
    }
  }, [user]);

  if (isLoading) {
    return (
       <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <LanguageContext.Provider value={userLang}>
    <AppErrorBoundary>
      <Switch>
        <Route path="/login" component={Login} />
        
        {/* Protected Routes */}
        <Route path="/">
          {() => <ProtectedRoute component={Home} />}
        </Route>
        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} />}
        </Route>
        <Route path="/bakery">
          {() => <ProtectedRoute component={Bakery} />}
        </Route>
        <Route path="/coffee">
          {() => <ProtectedRoute component={Coffee} />}
        </Route>
        <Route path="/kitchen">
          {() => <ProtectedRoute component={Kitchen} />}
        </Route>
        <Route path="/platform">
          {() => <ProtectedRoute component={Platform934} noLayout />}
        </Route>
        <Route path="/recipes">
          {() => <ProtectedRoute component={Recipes} />}
        </Route>
        <Route path="/recipes/:id/begin">
          {() => <ProtectedRoute component={BeginRecipe} />}
        </Route>
        <Route path="/recipes/:id">
          {() => <ProtectedRoute component={RecipeDetail} />}
        </Route>
        <Route path="/production">
          {() => <ProtectedRoute component={Production} />}
        </Route>
        <Route path="/sops">
          {() => <ProtectedRoute component={SOPs} />}
        </Route>
        <Route path="/assistant">
          {() => <ProtectedRoute component={Assistant} />}
        </Route>
        <Route path="/test-kitchen">
          {() => <ProtectedRoute component={TestKitchen} />}
        </Route>
        <Route path="/admin/users">
          {() => <ProtectedRoute component={AdminUsers} />}
        </Route>
        <Route path="/admin/approvals">
          {() => <ProtectedRoute component={AdminApprovals} />}
        </Route>
        <Route path="/admin/pastry-items">
          {() => <ProtectedRoute component={PastryItems} />}
        </Route>
        <Route path="/profile">
          {() => <ProtectedRoute component={Profile} />}
        </Route>
        <Route path="/inventory">
          {() => <ProtectedRoute component={Inventory} />}
        </Route>
        <Route path="/inventory/items">
          {() => <ProtectedRoute component={InventoryItems} />}
        </Route>
        <Route path="/inventory/invoices">
          {() => <ProtectedRoute component={InvoiceCapture} />}
        </Route>
        <Route path="/inventory/price-heatmap">
          {() => <ProtectedRoute component={PriceHeatmap} />}
        </Route>
        <Route path="/inventory/count">
          {() => <ProtectedRoute component={InventoryCount} />}
        </Route>
        <Route path="/vendors">
          {() => <ProtectedRoute component={Vendors} />}
        </Route>
        <Route path="/schedule">
          {() => <ProtectedRoute component={Schedule} />}
        </Route>
        <Route path="/calendar">
          {() => <ProtectedRoute component={CalendarPage} />}
        </Route>
        <Route path="/pastry-passports">
          {() => <ProtectedRoute component={PastryPassports} />}
        </Route>
        <Route path="/pastry-passports/:id">
          {() => <ProtectedRoute component={PastryPassportDetail} />}
        </Route>
        <Route path="/tasks">
          {() => <ProtectedRoute component={TaskManager} />}
        </Route>
        <Route path="/tasks/assigned/:id">
          {() => <ProtectedRoute component={AssignedTaskList} />}
        </Route>
        <Route path="/lamination">
          {() => <ProtectedRoute component={LaminationStudio} />}
        </Route>
        <Route path="/hive">
          {() => <ProtectedRoute component={JarvisHive} />}
        </Route>
        <Route path="/kiosk">
          {() => <ProtectedRoute component={Kiosk} noLayout />}
        </Route>
        <Route path="/display">
          {() => <Suspense fallback={<PageLoader />}><Display /></Suspense>}
        </Route>
        <Route path="/menu/:slot">
          {() => <Suspense fallback={<PageLoader />}><MenuScreen /></Suspense>}
        </Route>
        <Route path="/jmt">
          {() => <ProtectedRoute component={JMT} />}
        </Route>
        <Route path="/clock">
          {() => <Suspense fallback={<PageLoader />}><KioskClock /></Suspense>}
        </Route>
        <Route path="/time-cards">
          {() => <ProtectedRoute component={TimeCards} />}
        </Route>
        <Route path="/time-review">
          {() => <ProtectedRoute component={TimeReview} />}
        </Route>
        <Route path="/admin/square">
          {() => <ProtectedRoute component={SquareSettings} />}
        </Route>
        <Route path="/pastry-goals">
          {() => <ProtectedRoute component={PastryGoals} />}
        </Route>
        <Route path="/live-inventory">
          {() => <ProtectedRoute component={LiveInventory} />}
        </Route>
        <Route path="/admin/ttis">
          {() => <ProtectedRoute component={TTIS} />}
        </Route>
        <Route path="/admin/insights">
          {() => <ProtectedRoute component={AdminInsights} />}
        </Route>
        <Route path="/messages">
          {() => <ProtectedRoute component={Messages} />}
        </Route>
        <Route path="/notes">
          {() => <ProtectedRoute component={Notes} />}
        </Route>
        <Route path="/starkade">
          {() => <ProtectedRoute component={Starkade} />}
        </Route>
        <Route path="/feedback">
          {() => <Suspense fallback={<PageLoader />}><CustomerFeedback /></Suspense>}
        </Route>
        <Route path="/onboarding/:token">
          {() => <Suspense fallback={<PageLoader />}><Onboarding /></Suspense>}
        </Route>
        <Route path="/admin/feedback">
          {() => <ProtectedRoute component={FeedbackQRCode} />}
        </Route>
        <Route path="/sentiment">
          {() => <ProtectedRoute component={SentimentMatrix} />}
        </Route>
        <Route path="/loop">
          {() => <ProtectedRoute component={TheLoop} />}
        </Route>
        <Route path="/hr">
          {() => <ProtectedRoute component={HR} />}
        </Route>
        <Route path="/mll">
          {() => <ProtectedRoute component={MLL} />}
        </Route>
        <Route path="/bagel-bros">
          {() => <ProtectedRoute component={BagelBros} noLayout />}
        </Route>
        <Route path="/maintenance">
          {() => <ProtectedRoute component={Maintenance} />}
        </Route>
        <Route path="/the-firm">
          {() => <ProtectedRoute component={TheFirm} />}
        </Route>
        <Route path="/quick-payout">
          {() => <ProtectedRoute component={QuickPayout} />}
        </Route>
        <Route path="/payroll">
          {() => <ProtectedRoute component={PayrollReview} />}
        </Route>
        <Route path="/square-labor">
          {() => <ProtectedRoute component={SquareLaborSync} />}
        </Route>
        <Route path="/adp-labor">
          {() => <ProtectedRoute component={AdpLaborSync} />}
        </Route>
        <Route path="/prep-eq">
          {() => <ProtectedRoute component={PrepEQ} />}
        </Route>
        <Route path="/dev-feedback">
          {() => <ProtectedRoute component={DevFeedback} />}
        </Route>
        <Route path="/admin/tutorials">
          {() => <ProtectedRoute component={Tutorials} />}
        </Route>

        {/* Portal Routes (La Carte - Customer-facing) */}
        <Route path="/portal/login">
          {() => <PortalPublicRoute component={PortalLogin} />}
        </Route>
        <Route path="/portal/register">
          {() => <PortalPublicRoute component={PortalRegister} />}
        </Route>
        <Route path="/portal">
          {() => <PortalProtectedRoute component={PortalHome} />}
        </Route>
        <Route path="/portal/menu">
          {() => <PortalProtectedRoute component={PortalMenu} />}
        </Route>
        <Route path="/portal/orders">
          {() => <PortalProtectedRoute component={PortalOrders} />}
        </Route>
        <Route path="/portal/profile">
          {() => <PortalProtectedRoute component={PortalProfile} />}
        </Route>

        {/* Wholesale Portal Routes */}
        <Route path="/wholesale/login">
          {() => <Suspense fallback={<PageLoader />}><WholesaleLogin /></Suspense>}
        </Route>
        <Route path="/wholesale/onboarding">
          {() => <Suspense fallback={<PageLoader />}><WholesaleOnboarding /></Suspense>}
        </Route>
        <Route path="/wholesale/order">
          {() => <WholesaleProtectedRoute component={WholesaleOrder} />}
        </Route>
        <Route path="/wholesale/templates">
          {() => <WholesaleProtectedRoute component={WholesaleTemplates} />}
        </Route>
        <Route path="/wholesale/orders">
          {() => <WholesaleProtectedRoute component={WholesaleOrders} />}
        </Route>
        <Route path="/wholesale">
          {() => <WholesaleProtectedRoute component={WholesaleHome} />}
        </Route>
        <Route path="/wholesale-admin">
          {() => <ProtectedRoute component={WholesaleAdmin} />}
        </Route>

        <Route>{() => <Suspense fallback={<PageLoader />}><NotFound /></Suspense>}</Route>
      </Switch>
    </AppErrorBoundary>
    {user && !(user as any).seenJarvisIntro && <JarvisIntroOverlay user={user} />}
    </LanguageContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <GlobalAckOverlay />
        <UrgentMessageOverlay />
        <LobbyCheckAlert />
        <BakeryTimerAlert />
        <TutorialOverlay />
        <DevFeedbackOverlay />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
