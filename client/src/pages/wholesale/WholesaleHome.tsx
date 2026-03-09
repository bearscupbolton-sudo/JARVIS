import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ShoppingCart, CalendarClock, ClipboardList, Loader2, Package, Clock, CheckCircle2, AlertCircle } from "lucide-react";

type WholesaleCustomer = {
  id: number;
  businessName: string;
  contactName: string;
};

type OrderItem = {
  itemName: string;
  quantity: number;
  subtotal: number;
};

type Order = {
  id: number;
  orderDate: string;
  status: string;
  totalAmount: number;
  items?: OrderItem[];
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending", variant: "default", icon: Clock },
  confirmed: { label: "Confirmed", variant: "secondary", icon: Package },
  completed: { label: "Completed", variant: "outline", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: AlertCircle },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function WholesaleHome() {
  const meQuery = useQuery<WholesaleCustomer>({
    queryKey: ["/api/wholesale/me"],
  });

  const ordersQuery = useQuery<Order[]>({
    queryKey: ["/api/wholesale/orders"],
  });

  const pendingOrders = ordersQuery.data?.filter(o => o.status === "pending" || o.status === "confirmed") || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif tracking-tight" data-testid="text-wholesale-welcome">
          {meQuery.data ? `Welcome, ${meQuery.data.businessName}` : "Welcome"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bear's Cup Bakehouse Wholesale Portal
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/wholesale/order">
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-primary/20" data-testid="card-new-order">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingCart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">New Order</p>
                <p className="text-xs text-muted-foreground">Place a new wholesale order</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/wholesale/templates">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" data-testid="card-recurring">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <CalendarClock className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="font-semibold">Recurring Orders</p>
                <p className="text-xs text-muted-foreground">Set up weekly schedules</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/wholesale/orders">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" data-testid="card-history">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <ClipboardList className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="font-semibold">Order History</p>
                <p className="text-xs text-muted-foreground">View past orders & status</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Active Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-active-orders">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No active orders</p>
              <Link href="/wholesale/order">
                <Button variant="outline" size="sm" className="mt-3" data-testid="button-place-first-order">
                  Place Your First Order
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingOrders.map((order) => {
                const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                const StatusIcon = sc.icon;
                return (
                  <div key={order.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border" data-testid={`card-active-order-${order.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm">Order #{order.id}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(order.orderDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={sc.variant}>{sc.label}</Badge>
                      <span className="font-semibold text-sm">${order.totalAmount?.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
