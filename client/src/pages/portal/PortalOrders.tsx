import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Clock, Check, Loader2 } from "lucide-react";

interface CustomerOrder {
  id: number;
  squareOrderId: string | null;
  locationId: number;
  items: { name: string; variationName?: string; quantity: number; priceAmount?: number }[];
  total: number | null;
  status: string;
  pickupName: string | null;
  customerNote: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "text-yellow-600" },
  sent: { label: "Preparing", icon: Loader2, color: "text-blue-600" },
  ready: { label: "Ready for Pickup", icon: Check, color: "text-green-600" },
  picked_up: { label: "Picked Up", icon: Package, color: "text-muted-foreground" },
};

export default function PortalOrders() {
  const { data: orders, isLoading } = useQuery<CustomerOrder[]>({
    queryKey: ["/api/portal/orders"],
    queryFn: async () => {
      const res = await fetch("/api/portal/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load orders");
      return res.json();
    },
  });

  const formatPrice = (amount: number) => `$${(amount / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-foreground tracking-tight" data-testid="text-orders-title">
          My Orders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your recent orders
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : !orders || orders.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-12 text-center">
            <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground italic" data-testid="text-orders-empty">
              No orders yet. Browse our menu to place your first order.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const StatusIcon = status.icon;
            const items = Array.isArray(order.items) ? order.items : [];

            return (
              <Card key={order.id} className="border-border" data-testid={`card-order-${order.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      {order.squareOrderId && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ref: {order.squareOrderId.slice(0, 8).toUpperCase()}
                        </p>
                      )}
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${status.color}`}>
                      <StatusIcon className={`w-3.5 h-3.5 ${order.status === 'sent' ? 'animate-spin' : ''}`} />
                      {status.label}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">
                          {item.quantity}x {item.name}
                          {item.variationName && item.variationName !== "Regular" && item.variationName !== "Default" ? ` (${item.variationName})` : ""}
                        </span>
                        {item.priceAmount !== undefined && (
                          <span className="text-muted-foreground text-xs">
                            {formatPrice(item.priceAmount * item.quantity)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {order.total != null && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="font-serif font-semibold text-foreground">
                        {formatPrice(order.total)}
                      </span>
                    </div>
                  )}

                  {order.customerNote && (
                    <p className="text-xs text-muted-foreground italic mt-2 border-l-2 border-border pl-2">
                      {order.customerNote}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
