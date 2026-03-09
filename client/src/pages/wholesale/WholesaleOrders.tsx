import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { Loader2, ClipboardList, Clock, Package, CheckCircle2, AlertCircle, ArrowLeft, CreditCard, ExternalLink } from "lucide-react";

type OrderItem = {
  itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

type Order = {
  id: number;
  orderDate: string;
  status: string;
  totalAmount: number;
  notes: string | null;
  isRecurring: boolean;
  paymentLinkUrl: string | null;
  items?: OrderItem[];
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending Payment", variant: "default", icon: Clock },
  confirmed: { label: "Confirmed", variant: "secondary", icon: Package },
  completed: { label: "Completed", variant: "outline", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: AlertCircle },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatShortDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

export default function WholesaleOrders() {
  const { toast } = useToast();
  const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);

  const ordersQuery = useQuery<Order[]>({
    queryKey: ["/api/wholesale/orders"],
  });

  const paymentLinkMutation = useMutation({
    mutationFn: async (orderId: number) => {
      setLoadingOrderId(orderId);
      const res = await apiRequest("POST", `/api/wholesale/orders/${orderId}/payment-link`);
      return res.json();
    },
    onSuccess: (data: { paymentLinkUrl: string }) => {
      setLoadingOrderId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/orders"] });
      window.open(data.paymentLinkUrl, "_blank");
    },
    onError: (err: any) => {
      setLoadingOrderId(null);
      toast({ title: "Payment link error", description: err.message || "Could not generate payment link. Please contact Bear's Cup.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/wholesale">
          <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight" data-testid="text-orders-title">Order History</h1>
          <p className="text-sm text-muted-foreground">View all your wholesale orders and their status</p>
        </div>
      </div>

      {ordersQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !ordersQuery.data || ordersQuery.data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground" data-testid="text-no-orders">No orders yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {ordersQuery.data.map(order => {
            const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const StatusIcon = sc.icon;
            const isPending = order.status === "pending";
            return (
              <Card key={order.id} data-testid={`card-order-${order.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">Order #{order.id}</CardTitle>
                      {order.isRecurring && <Badge variant="outline" className="text-xs">Recurring</Badge>}
                    </div>
                    <Badge variant={sc.variant} className="flex items-center gap-1">
                      <StatusIcon className="h-3 w-3" />
                      {sc.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>Delivery: {formatDate(order.orderDate)}</span>
                    <span>•</span>
                    <span>Placed: {formatShortDate(order.createdAt)}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {order.items && order.items.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm" data-testid={`text-order-item-${order.id}-${i}`}>
                          <span>{item.itemName} × {item.quantity}</span>
                          <span className="text-muted-foreground">${item.subtotal.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between items-center">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-lg font-bold" data-testid={`text-order-total-${order.id}`}>${order.totalAmount?.toFixed(2)}</span>
                  </div>
                  {order.notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic">Notes: {order.notes}</p>
                  )}

                  {isPending && (
                    <div className="mt-4 pt-3 border-t">
                      {order.paymentLinkUrl ? (
                        <a href={order.paymentLinkUrl} target="_blank" rel="noopener noreferrer">
                          <Button className="w-full" variant="default" data-testid={`button-pay-${order.id}`}>
                            <CreditCard className="h-4 w-4 mr-2" />
                            Pay Now — ${order.totalAmount?.toFixed(2)}
                            <ExternalLink className="h-3 w-3 ml-2" />
                          </Button>
                        </a>
                      ) : (
                        <Button
                          className="w-full"
                          variant="default"
                          onClick={() => paymentLinkMutation.mutate(order.id)}
                          disabled={loadingOrderId === order.id}
                          data-testid={`button-pay-${order.id}`}
                        >
                          {loadingOrderId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CreditCard className="h-4 w-4 mr-2" />
                          )}
                          Pay with Square — ${order.totalAmount?.toFixed(2)}
                        </Button>
                      )}
                    </div>
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
