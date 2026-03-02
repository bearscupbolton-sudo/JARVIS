import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Plus,
  Minus,
  ShoppingBag,
  Loader2,
  Check,
  Trash2,
  MapPin,
} from "lucide-react";

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  story?: string;
  category?: string;
  variations: {
    id: string;
    name: string;
    priceMoney?: { amount: string; currency: string };
  }[];
}

interface CartItem {
  catalogObjectId: string;
  variationId: string;
  name: string;
  variationName: string;
  quantity: number;
  priceAmount: number;
  priceCurrency: string;
}

interface LocationOption {
  id: number;
  name: string;
  squareLocationId: string | null;
}

export default function PortalMenu() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [pickupName, setPickupName] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string>("");

  const { data: menuItems, isLoading } = useQuery<MenuItem[]>({
    queryKey: ["/api/portal/menu"],
    queryFn: async () => {
      const res = await fetch("/api/portal/menu", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load menu");
      return res.json();
    },
  });

  const { data: locations } = useQuery<LocationOption[]>({
    queryKey: ["/api/portal/locations"],
    queryFn: async () => {
      const res = await fetch("/api/portal/locations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: customer } = useQuery<{ id: number; firstName: string }>({
    queryKey: ["/api/portal/me"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me", { credentials: "include" });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
  });

  const categories = useMemo(() => {
    if (!menuItems) return [];
    const cats = new Set<string>();
    menuItems.forEach((item) => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    if (!menuItems) return [];
    return menuItems.filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = !activeCategory || item.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, search, activeCategory]);

  const addToCart = useCallback((item: MenuItem, variation: MenuItem["variations"][0]) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.variationId === variation.id);
      if (existing) {
        return prev.map((c) =>
          c.variationId === variation.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      const priceAmount = variation.priceMoney
        ? parseInt(variation.priceMoney.amount || "0")
        : 0;
      return [
        ...prev,
        {
          catalogObjectId: item.id,
          variationId: variation.id,
          name: item.name,
          variationName: variation.name,
          quantity: 1,
          priceAmount,
          priceCurrency: variation.priceMoney?.currency || "USD",
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((variationId: string, delta: number) => {
    setCart((prev) => {
      const updated = prev.map((c) =>
        c.variationId === variationId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c
      );
      return updated.filter((c) => c.quantity > 0);
    });
  }, []);

  const removeFromCart = useCallback((variationId: string) => {
    setCart((prev) => prev.filter((c) => c.variationId !== variationId));
  }, []);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.priceAmount * item.quantity, 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const formatPrice = (amount: number) => {
    return `$${(amount / 100).toFixed(2)}`;
  };

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      const locationId = selectedLocation || locations?.[0]?.id;
      if (!locationId) throw new Error("No location selected");
      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          locationId,
          items: cart.map((c) => ({
            catalogObjectId: c.catalogObjectId,
            variationId: c.variationId,
            quantity: c.quantity,
          })),
          pickupName: pickupName || customer?.firstName || "Guest",
          customerNote: customerNote || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to place order");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setLastOrderId(data.squareOrderId || data.id?.toString() || "");
      setShowConfirmation(true);
      setCart([]);
      setCartOpen(false);
      setCustomerNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
    },
    onError: (error: Error) => {
      toast({ title: "Order failed", description: error.message, variant: "destructive" });
    },
  });

  const getCartQuantity = (variationId: string) => {
    return cart.find((c) => c.variationId === variationId)?.quantity || 0;
  };

  if (!pickupName && customer?.firstName) {
    setPickupName(customer.firstName);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-foreground tracking-tight" data-testid="text-menu-title">
            Our Menu
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tap any item to add it to your order
          </p>
        </div>

        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="relative" data-testid="button-open-cart">
              <ShoppingBag className="w-4 h-4 mr-2" />
              Cart
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-accent text-accent-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium" data-testid="text-cart-count">
                  {cartCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="theme-portal w-full sm:max-w-md flex flex-col">
            <SheetHeader>
              <SheetTitle className="font-serif text-xl">Your Order</SheetTitle>
            </SheetHeader>
            {cart.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground italic" data-testid="text-cart-empty">Your cart is empty</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto space-y-3 py-4">
                  {cart.map((item) => (
                    <div key={item.variationId} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg" data-testid={`cart-item-${item.variationId}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        {item.variationName !== "Regular" && item.variationName !== "Default" && (
                          <p className="text-xs text-muted-foreground">{item.variationName}</p>
                        )}
                        <p className="text-xs text-accent font-medium mt-0.5">{formatPrice(item.priceAmount)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => updateQuantity(item.variationId, -1)} data-testid={`button-cart-minus-${item.variationId}`}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-medium w-5 text-center" data-testid={`text-cart-qty-${item.variationId}`}>{item.quantity}</span>
                        <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => updateQuantity(item.variationId, 1)} data-testid={`button-cart-plus-${item.variationId}`}>
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" onClick={() => removeFromCart(item.variationId)} data-testid={`button-cart-remove-${item.variationId}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  {locations && locations.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Pickup Location
                      </label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={selectedLocation || ""}
                        onChange={(e) => setSelectedLocation(Number(e.target.value))}
                        data-testid="select-cart-location"
                      >
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Pickup Name</label>
                    <Input
                      value={pickupName}
                      onChange={(e) => setPickupName(e.target.value)}
                      placeholder="Your name"
                      className="h-9"
                      data-testid="input-cart-pickup-name"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Special Instructions (optional)</label>
                    <Textarea
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder="Allergies, preferences, special requests..."
                      className="text-sm min-h-[60px] resize-none"
                      data-testid="input-cart-note"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="font-serif text-lg font-semibold text-foreground" data-testid="text-cart-total">
                      Total: {formatPrice(cartTotal)}
                    </span>
                    <Button
                      onClick={() => placeOrderMutation.mutate()}
                      disabled={placeOrderMutation.isPending || cart.length === 0}
                      className="min-w-[140px]"
                      data-testid="button-place-order"
                    >
                      {placeOrderMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Place Order
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search our menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11"
          data-testid="input-menu-search"
        />
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="menu-categories">
          <Button
            variant={activeCategory === null ? "default" : "outline"}
            size="sm"
            className="text-xs"
            onClick={() => setActiveCategory(null)}
            data-testid="button-category-all"
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              data-testid={`button-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {cat}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-10 text-center">
            <p className="text-muted-foreground italic" data-testid="text-menu-empty">
              {search ? "No items match your search." : "Our menu is being updated. Check back soon."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((item) => (
            <Card key={item.id} className="border-border overflow-hidden hover:shadow-md transition-shadow duration-300" data-testid={`card-menu-item-${item.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-serif text-base font-semibold text-foreground">{item.name}</h3>
                    {item.category && (
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">{item.category}</span>
                    )}
                  </div>
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{item.description}</p>
                )}

                {item.story && (
                  <p className="text-xs text-muted-foreground/80 italic mb-3 line-clamp-2 border-l-2 border-accent/30 pl-3">
                    {item.story}
                  </p>
                )}

                <div className="space-y-2 mt-3">
                  {item.variations.map((v) => {
                    const qty = getCartQuantity(v.id);
                    const price = v.priceMoney ? parseInt(v.priceMoney.amount || "0") : 0;
                    return (
                      <div key={v.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {item.variations.length > 1 && (
                            <span className="text-xs text-muted-foreground">{v.name}</span>
                          )}
                          <span className="text-sm font-medium text-accent">{formatPrice(price)}</span>
                        </div>
                        {qty > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => updateQuantity(v.id, -1)} data-testid={`button-menu-minus-${v.id}`}>
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="text-sm font-medium w-5 text-center" data-testid={`text-menu-qty-${v.id}`}>{qty}</span>
                            <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => updateQuantity(v.id, 1)} data-testid={`button-menu-plus-${v.id}`}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => addToCart(item, v)}
                            data-testid={`button-add-${v.id}`}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Button
            className="shadow-lg px-6 h-12 text-sm font-medium rounded-full"
            onClick={() => setCartOpen(true)}
            data-testid="button-floating-cart"
          >
            <ShoppingBag className="w-4 h-4 mr-2" />
            View Cart ({cartCount}) · {formatPrice(cartTotal)}
          </Button>
        </div>
      )}

      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="theme-portal sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-center">Order Placed!</DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-accent" />
            </div>
            <p className="text-muted-foreground" data-testid="text-order-confirmation">
              Thank you, {pickupName || "friend"}! Your order has been sent to the kitchen.
            </p>
            {lastOrderId && (
              <p className="text-xs text-muted-foreground">
                Order reference: {lastOrderId.slice(0, 8).toUpperCase()}
              </p>
            )}
            <p className="text-sm text-foreground font-medium">
              We'll have it ready for you soon.
            </p>
            <Button
              className="mt-4"
              onClick={() => setShowConfirmation(false)}
              data-testid="button-order-done"
            >
              Continue Browsing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
