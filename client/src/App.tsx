import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { LocationProvider } from "@/hooks/use-location-context";
import { Layout } from "@/components/Layout";
import LobbyCheckAlert from "@/components/LobbyCheckAlert";
import BakeryTimerAlert from "@/components/BakeryTimerAlert";
import DevFeedbackOverlay from "@/components/DevFeedbackOverlay";
import GlobalAckOverlay from "@/components/GlobalAckOverlay";
import { PortalLayout } from "@/components/PortalLayout";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, useRef } from "react";
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
const InventoryCount = lazy(() => import("@/pages/InventoryCount"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const PastryPassports = lazy(() => import("@/pages/PastryPassports"));
const PastryPassportDetail = lazy(() => import("@/pages/PastryPassportDetail"));
const Kiosk = lazy(() => import("@/pages/Kiosk"));
const Display = lazy(() => import("@/pages/Display"));
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
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const PortalLogin = lazy(() => import("@/pages/portal/PortalLogin"));
const PortalRegister = lazy(() => import("@/pages/portal/PortalRegister"));
const PortalHome = lazy(() => import("@/pages/portal/PortalHome"));
const PortalMenu = lazy(() => import("@/pages/portal/PortalMenu"));
const PortalOrders = lazy(() => import("@/pages/portal/PortalOrders"));
const PortalProfile = lazy(() => import("@/pages/portal/PortalProfile"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
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
        <Component />
      </LocationProvider>
    );
  }

  return (
    <LocationProvider>
      <Layout>
        <Component />
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
      <Component />
    </PortalLayout>
  );
}

function PortalPublicRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <div className="theme-portal min-h-screen bg-background">
      <Component />
    </div>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const prefetched = useRef(false);

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
    <Suspense fallback={<PageLoader />}>
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
        <Route path="/kiosk">
          {() => <ProtectedRoute component={Kiosk} noLayout />}
        </Route>
        <Route path="/display">
          {() => <Display />}
        </Route>
        <Route path="/clock">
          {() => <KioskClock />}
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
          {() => <CustomerFeedback />}
        </Route>
        <Route path="/onboarding/:token">
          {() => <Onboarding />}
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
        <Route path="/dev-feedback">
          {() => <ProtectedRoute component={DevFeedback} />}
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

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <GlobalAckOverlay />
        <LobbyCheckAlert />
        <BakeryTimerAlert />
        <DevFeedbackOverlay />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
