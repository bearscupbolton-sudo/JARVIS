import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { ShoppingCart, Minus, Trash2, Loader2, CheckCircle2, Send, ArrowLeft } from "lucide-react";

type CatalogItem = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  unitPrice: number;
  unit: string;
};

type CartItem = {
  catalogItemId: number;
  name: string;
  unitPrice: number;
  unit: string;
  quantity: number;
};

type Template = {
  id: number;
  dayOfWeek: number;
  templateName: string | null;
  isActive: boolean;
  items: { catalogItemId: number; quantity: number; catalogItem?: CatalogItem }[];
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function WholesaleOrder() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderDate, setOrderDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<number | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const catalogQuery = useQuery<CatalogItem[]>({
    queryKey: ["/api/wholesale/catalog"],
  });

  const templatesQuery = useQuery<Template[]>({
    queryKey: ["/api/wholesale/templates"],
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { orderDate: string; notes: string; items: { catalogItemId: number; quantity: number }[] }) => {
      const res = await apiRequest("POST", "/api/wholesale/orders", data);
      return res.json();
    },
    onSuccess: (order: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/orders"] });
      setSubmitted(true);
      setSubmittedOrderId(order.id);
    },
    onError: (err: any) => {
      toast({ title: "Failed to submit order", description: err.message, variant: "destructive" });
    },
  });

  const categories = catalogQuery.data
    ? [...new Set(catalogQuery.data.map(i => i.category || "Other"))]
    : [];

  function setItemQuantity(item: CatalogItem, qty: number) {
    setCart(prev => {
      if (qty <= 0) {
        return prev.filter(c => c.catalogItemId !== item.id);
      }
      const existing = prev.find(c => c.catalogItemId === item.id);
      if (existing) {
        return prev.map(c => c.catalogItemId === item.id ? { ...c, quantity: qty } : c);
      }
      return [...prev, { catalogItemId: item.id, name: item.name, unitPrice: item.unitPrice, unit: item.unit, quantity: qty }];
    });
  }

  function updateQuantity(catalogItemId: number, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.catalogItemId !== catalogItemId));
    } else {
      setCart(prev => prev.map(c => c.catalogItemId === catalogItemId ? { ...c, quantity: qty } : c));
    }
  }

  function loadTemplate(template: Template) {
    const catalog = catalogQuery.data || [];
    const newCart: CartItem[] = [];
    for (const ti of template.items) {
      const ci = catalog.find(c => c.id === ti.catalogItemId) || ti.catalogItem;
      if (ci) {
        newCart.push({
          catalogItemId: ti.catalogItemId,
          name: ci.name,
          unitPrice: ci.unitPrice,
          unit: ci.unit,
          quantity: ti.quantity,
        });
      }
    }
    setCart(newCart);
    toast({ title: "Template loaded", description: `Loaded ${template.templateName || DAY_NAMES[template.dayOfWeek] + " order"}` });
  }

  function handleSubmit() {
    if (cart.length === 0) return;
    submitMutation.mutate({
      orderDate,
      notes,
      items: cart.map(c => ({ catalogItemId: c.catalogItemId, quantity: c.quantity })),
    });
  }

  const total = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-bold" data-testid="text-order-confirmed">Order Submitted!</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Order #{submittedOrderId} has been submitted and is now pending. You'll be notified when it's confirmed.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setSubmitted(false); setCart([]); setNotes(""); }} data-testid="button-new-order">
            New Order
          </Button>
          <Button onClick={() => setLocation("/wholesale/orders")} data-testid="button-view-orders">
            View Orders
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/wholesale">
          <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight" data-testid="text-order-title">New Order</h1>
          <p className="text-sm text-muted-foreground">Build your wholesale order below</p>
        </div>
      </div>

      {templatesQuery.data && templatesQuery.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Load from Template</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {templatesQuery.data.filter(t => t.isActive).map(t => (
                <Button key={t.id} variant="outline" size="sm" onClick={() => loadTemplate(t)} data-testid={`button-load-template-${t.id}`}>
                  {t.templateName || DAY_NAMES[t.dayOfWeek]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Catalog</CardTitle>
            </CardHeader>
            <CardContent>
              {catalogQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !catalogQuery.data || catalogQuery.data.length === 0 ? (
                <p className="text-center text-muted-foreground py-6" data-testid="text-no-catalog">
                  No items available yet. Contact Bear's Cup to set up your catalog.
                </p>
              ) : (
                <div className="space-y-6">
                  {categories.map(cat => (
                    <div key={cat}>
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{cat}</h3>
                      <div className="space-y-2">
                        {catalogQuery.data!.filter(i => (i.category || "Other") === cat).map(item => {
                          const inCart = cart.find(c => c.catalogItemId === item.id);
                          const currentQty = inCart?.quantity || 0;
                          return (
                            <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border" data-testid={`catalog-item-${item.id}`}>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm">{item.name}</p>
                                {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                                <p className="text-xs text-muted-foreground mt-0.5">${item.unitPrice.toFixed(2)} / {item.unit}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  value={currentQty === 0 ? "" : currentQty}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || val === "0") {
                                      setItemQuantity(item, 0);
                                    } else {
                                      setItemQuantity(item, parseInt(val) || 0);
                                    }
                                  }}
                                  placeholder="QTY"
                                  className="w-20 h-9 text-center text-sm"
                                  min={0}
                                  data-testid={`input-qty-${item.id}`}
                                />
                                {currentQty > 0 && (
                                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                                    {item.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Your Order
                {cart.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">{cart.length} items</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Delivery Date</label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  data-testid="input-order-date"
                />
              </div>

              {cart.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-sm" data-testid="text-empty-cart">
                  Type a quantity next to any item to add it
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div key={item.catalogItemId} className="flex items-center justify-between gap-2 text-sm" data-testid={`cart-item-${item.catalogItemId}`}>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.quantity} × ${item.unitPrice.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold">${(item.unitPrice * item.quantity).toFixed(2)}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.catalogItemId, 0)} data-testid={`button-remove-${item.catalogItemId}`}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between font-bold text-lg" data-testid="text-order-total">
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions, delivery notes..."
                  rows={3}
                  data-testid="input-order-notes"
                />
              </div>

              <Button
                className="w-full h-12"
                onClick={handleSubmit}
                disabled={cart.length === 0 || submitMutation.isPending}
                data-testid="button-submit-order"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Submit Order — ${total.toFixed(2)}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
