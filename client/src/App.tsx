import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/Layout";
import { Loader2 } from "lucide-react";

import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Bakery from "@/pages/Bakery";
import Coffee from "@/pages/Coffee";
import Kitchen from "@/pages/Kitchen";
import Recipes from "@/pages/Recipes";
import RecipeDetail from "@/pages/RecipeDetail";
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
    return <Component />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
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
      <Route path="/recipes">
        {() => <ProtectedRoute component={Recipes} />}
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
      <Route path="/admin/users">
        {() => <ProtectedRoute component={AdminUsers} />}
      </Route>
      <Route path="/admin/approvals">
        {() => <ProtectedRoute component={AdminApprovals} />}
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
      <Route path="/kiosk">
        {() => <ProtectedRoute component={Kiosk} noLayout />}
      </Route>
      <Route path="/display">
        {() => <Display />}
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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
