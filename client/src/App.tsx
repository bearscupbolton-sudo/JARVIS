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
import { useEffect } from "react";

import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Bakery from "@/pages/Bakery";
import Coffee from "@/pages/Coffee";
import Kitchen from "@/pages/Kitchen";
import Platform934 from "@/pages/Platform934";
import Recipes from "@/pages/Recipes";
import RecipeDetail from "@/pages/RecipeDetail";
import BeginRecipe from "@/pages/BeginRecipe";
import Production from "@/pages/Production";
import SOPs from "@/pages/SOPs";
import Assistant from "@/pages/Assistant";
import AdminUsers from "@/pages/AdminUsers";
import AdminApprovals from "@/pages/AdminApprovals";
import Profile from "@/pages/Profile";
import Inventory from "@/pages/Inventory";
import InventoryItems from "@/pages/InventoryItems";
import InvoiceCapture from "@/pages/InvoiceCapture";
import InventoryCount from "@/pages/InventoryCount";
import Schedule from "@/pages/Schedule";
import CalendarPage from "@/pages/CalendarPage";
import PastryPassports from "@/pages/PastryPassports";
import PastryPassportDetail from "@/pages/PastryPassportDetail";
import Kiosk from "@/pages/Kiosk";
import Display from "@/pages/Display";
import TaskManager from "@/pages/TaskManager";
import AssignedTaskList from "@/pages/AssignedTaskList";
import LaminationStudio from "@/pages/LaminationStudio";
import PastryItems from "@/pages/PastryItems";
import KioskClock from "@/pages/KioskClock";
import TimeCards from "@/pages/TimeCards";
import TimeReview from "@/pages/TimeReview";
import SquareSettings from "@/pages/SquareSettings";
import PastryGoals from "@/pages/PastryGoals";
import LiveInventory from "@/pages/LiveInventory";
import TTIS from "@/pages/TTIS";
import AdminInsights from "@/pages/AdminInsights";
import Messages from "@/pages/Messages";
import Starkade from "@/pages/Starkade";
import CustomerFeedback from "@/pages/CustomerFeedback";
import FeedbackQRCode from "@/pages/FeedbackQRCode";
import SentimentMatrix from "@/pages/SentimentMatrix";
import TheLoop from "@/pages/TheLoop";
import HR from "@/pages/HR";
import MLL from "@/pages/MLL";
import Notes from "@/pages/Notes";
import Vendors from "@/pages/Vendors";
import BagelBros from "@/pages/BagelBros";
import TestKitchen from "@/pages/TestKitchen";
import DevFeedback from "@/pages/DevFeedback";
import PortalLogin from "@/pages/portal/PortalLogin";
import PortalRegister from "@/pages/portal/PortalRegister";
import PortalHome from "@/pages/portal/PortalHome";
import PortalMenu from "@/pages/portal/PortalMenu";
import PortalOrders from "@/pages/portal/PortalOrders";
import PortalProfile from "@/pages/portal/PortalProfile";
import NotFound from "@/pages/not-found";

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

  if (isLoading) {
    return (
       <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
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
