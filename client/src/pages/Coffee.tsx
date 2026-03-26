import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Coffee as CoffeeIcon, Plus, Minus, Trash2, RefreshCw, Loader2,
  Bean, Milk, Droplets, Package, BarChart3, Sparkles, X, GlassWater,
  AlertTriangle, TrendingUp, ChevronDown, ChevronUp, Edit2, Save,
  StickyNote, PenLine, ExternalLink, FlaskConical, Search, Link2, Unlink2,
  Send, Upload, Bot, User, Check, Layers, DollarSign, Cherry, IceCream, Leaf, CircleDot
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { CoffeeInventoryItem, CoffeeComponent, CoffeeDrinkRecipe, CoffeeDrinkIngredient, InventoryItem } from "@shared/schema";

type SquareCatalogItem = {
  id: string;
  name: string;
  description?: string;
  variations: { id: string; name: string; priceMoney?: { amount: number; currency: string } }[];
};

type EnrichedIngredient = CoffeeDrinkIngredient & {
  inventoryItemName: string;
  costPerUnit?: number | null;
  componentName?: string | null;
  inherited?: boolean;
};

type DrinkWithIngredients = CoffeeDrinkRecipe & {
  ingredients: EnrichedIngredient[];
  effectiveIngredients?: EnrichedIngredient[];
};

type EnrichedComponent = CoffeeComponent & {
  inventoryItemName: string | null;
  costPerUnit: number | null;
};

const CATEGORIES = [
  { value: "beans", label: "Beans", icon: Bean },
  { value: "milk", label: "Milk & Cream", icon: Milk },
  { value: "syrup", label: "Syrups & Sauces", icon: Droplets },
  { value: "other", label: "Other", icon: Package },
];

const COMPONENT_CATEGORIES = [
  { value: "espresso", label: "Espresso", icon: CoffeeIcon },
  { value: "milks", label: "Milks", icon: Milk },
  { value: "syrups", label: "Syrups", icon: Droplets },
  { value: "teas", label: "Teas / Bases", icon: Leaf },
  { value: "toppings", label: "Toppings", icon: Cherry },
  { value: "cold_foam", label: "Cold Foam", icon: IceCream },
  { value: "other", label: "Other", icon: Package },
];

function getCategoryIcon(cat: string) {
  const found = CATEGORIES.find(c => c.value === cat);
  return found ? found.icon : Package;
}

function getStockLevel(onHand: number, parLevel: number | null) {
  if (!parLevel) return { color: "bg-gray-300", pct: 50, label: "No par set" };
  const pct = Math.min(100, (onHand / parLevel) * 100);
  if (pct > 60) return { color: "bg-green-500", pct, label: "Good" };
  if (pct > 25) return { color: "bg-yellow-500", pct, label: "Low" };
  return { color: "bg-red-500", pct, label: "Critical" };
}

export default function Coffee() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="animate-in fade-in duration-500" data-testid="coffee-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2" data-testid="text-coffee-title">
            <CoffeeIcon className="w-8 h-8 text-amber-700" /> Coffee Command Center
          </h1>
          <p className="text-muted-foreground">Everything bean-to-cup, in one place</p>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5" data-testid="coffee-tabs">
              <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="inventory" data-testid="tab-inventory">Inventory</TabsTrigger>
              <TabsTrigger value="components" data-testid="tab-components">Components</TabsTrigger>
              <TabsTrigger value="drinks" data-testid="tab-drinks">Drink Setup</TabsTrigger>
              <TabsTrigger value="usage" data-testid="tab-usage">Usage & Sales</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6 mt-4">
              <CoffeeBriefing />
              <QuickStats />
              <InventoryOverview />
            </TabsContent>

            <TabsContent value="inventory" className="space-y-4 mt-4">
              <InventoryManager />
            </TabsContent>

            <TabsContent value="components" className="space-y-4 mt-4">
              <ComponentsLibrary />
            </TabsContent>

            <TabsContent value="drinks" className="space-y-4 mt-4">
              <DrinkSetup />
            </TabsContent>

            <TabsContent value="usage" className="space-y-4 mt-4">
              <UsageTracker />
            </TabsContent>
          </Tabs>
        </div>

        <div className="hidden lg:block w-56 shrink-0">
          <CoffeeRightSidebar />
        </div>
      </div>
    </div>
  );
}

function CoffeeBriefing() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBriefing = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/coffee/briefing", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <Card className="bg-gradient-to-br from-amber-950 to-stone-900 text-amber-50 border-amber-800" data-testid="card-coffee-briefing">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 text-amber-100">
            <Sparkles className="w-5 h-5 text-amber-400" /> Jarvis Coffee Brief
          </CardTitle>
          <div className="flex items-center gap-1">
            {briefing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBriefing(null)}
                className="text-amber-300/70 hover:text-amber-100 hover:bg-amber-900/50"
                data-testid="button-clear-briefing"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchBriefing}
              disabled={loading}
              className="text-amber-300 hover:text-amber-100 hover:bg-amber-900/50"
              data-testid="button-refresh-briefing"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {briefing ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-amber-100/90" data-testid="text-briefing-content">
            {briefing}
          </div>
        ) : (
          <div className="text-center py-4">
            <CoffeeIcon className="w-10 h-10 mx-auto mb-3 text-amber-700/60" />
            <p className="text-amber-300/70 text-sm mb-3">Click refresh to get your personalized coffee briefing from Jarvis</p>
            <Button
              onClick={fetchBriefing}
              disabled={loading}
              className="bg-amber-700 hover:bg-amber-600 text-white"
              data-testid="button-generate-briefing"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Generate Briefing
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CoffeeRightSidebar() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [creatingNote, setCreatingNote] = useState(false);

  const createQuickNote = async () => {
    setCreatingNote(true);
    try {
      const res = await apiRequest("POST", "/api/notes", {
        title: `Coffee Note — ${new Date().toLocaleDateString()}`,
        content: "",
      });
      const note = await res.json();
      toast({ title: "Note created" });
      navigate("/notes");
    } catch {
      toast({ title: "Couldn't create note", variant: "destructive" });
    }
    setCreatingNote(false);
  };

  return (
    <div className="sticky top-4 space-y-3 z-10" data-testid="coffee-right-sidebar">
      <Card className="bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-stone-900/50 border-amber-200 dark:border-amber-800/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <StickyNote className="w-4 h-4" /> Quick Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <p className="text-xs text-muted-foreground">Jot down coffee ideas, tasting notes, or order reminders</p>
          <Link href="/notes" data-testid="link-open-notes">
            <Button variant="outline" className="w-full justify-start text-sm border-amber-300 dark:border-amber-700" data-testid="button-open-notes">
              <ExternalLink className="w-3.5 h-3.5 mr-2" /> Open Notes
            </Button>
          </Link>
          <Button
            variant="outline"
            className="w-full justify-start text-sm border-amber-300 dark:border-amber-700"
            onClick={createQuickNote}
            disabled={creatingNote}
            data-testid="button-new-coffee-note"
          >
            {creatingNote ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <PenLine className="w-3.5 h-3.5 mr-2" />}
            New Note
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-stone-900/50 border-amber-200 dark:border-amber-800/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <FlaskConical className="w-4 h-4" /> Test Kitchen
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <p className="text-xs text-muted-foreground">Develop new drink specials, test recipes, and track costs</p>
          <Link href="/test-kitchen" data-testid="link-open-test-kitchen">
            <Button variant="outline" className="w-full justify-start text-sm border-amber-300 dark:border-amber-700" data-testid="button-open-test-kitchen">
              <ExternalLink className="w-3.5 h-3.5 mr-2" /> Open Test Kitchen
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function QuickStats() {
  const { data: inventory = [] } = useQuery<CoffeeInventoryItem[]>({ queryKey: ["/api/coffee/inventory"] });
  const today = new Date().toISOString().split("T")[0];
  const { data: todayLogs = [] } = useQuery<any[]>({ queryKey: [`/api/coffee/usage?date=${today}`] });

  const lowStock = inventory.filter(i => i.parLevel && i.onHand < i.parLevel);
  const totalDrinks = todayLogs.reduce((sum: number, l: any) => sum + l.quantitySold, 0);
  const topDrink = todayLogs.length > 0
    ? todayLogs.reduce((top: any, l: any) => (l.quantitySold > (top?.quantitySold || 0) ? l : top), null)
    : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="coffee-quick-stats">
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold" data-testid="stat-total-items">{inventory.length}</p>
          <p className="text-xs text-muted-foreground">Inventory Items</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold" data-testid="stat-drinks-today">{totalDrinks}</p>
          <p className="text-xs text-muted-foreground">Drinks Today</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-600" data-testid="stat-top-drink">
            {topDrink ? topDrink.drinkName.split(" ").slice(0, 2).join(" ") : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Top Drink Today</p>
        </CardContent>
      </Card>
      <Card className={lowStock.length > 0 ? "border-red-300" : ""}>
        <CardContent className="p-4 text-center">
          <p className={`text-2xl font-bold ${lowStock.length > 0 ? "text-red-500" : ""}`} data-testid="stat-low-stock">
            {lowStock.length}
          </p>
          <p className="text-xs text-muted-foreground">Below Par Level</p>
        </CardContent>
      </Card>
    </div>
  );
}

function InventoryOverview() {
  const { data: inventory = [] } = useQuery<CoffeeInventoryItem[]>({ queryKey: ["/api/coffee/inventory"] });

  if (inventory.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No coffee inventory yet</p>
          <p className="text-sm mt-1">Head to the Inventory tab to add your beans, milks, syrups, and more</p>
        </CardContent>
      </Card>
    );
  }

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: inventory.filter(i => i.category === cat.value),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-4" data-testid="inventory-overview">
      {grouped.map(group => (
        <Card key={group.value}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <group.icon className="w-4 h-4" /> {group.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.items.map(item => {
              const stock = getStockLevel(item.onHand, item.parLevel);
              return (
                <div key={item.id} className="flex items-center gap-3" data-testid={`inventory-item-${item.id}`}>
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">{item.name}</span>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {item.onHand} {item.unit}
                  </span>
                  <div className="w-24">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${stock.color}`} style={{ width: `${stock.pct}%` }} />
                    </div>
                  </div>
                  {stock.label === "Critical" && <AlertTriangle className="w-4 h-4 text-red-500" />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type RecipeListItem = { id: number; title: string; category: string; yieldAmount: number; yieldUnit: string };

function InventoryManager() {
  const { data: inventory = [], isLoading } = useQuery<(CoffeeInventoryItem & { costSource?: string })[]>({ queryKey: ["/api/coffee/inventory"] });
  const { data: mainInventory = [] } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"] });
  const { data: allRecipes = [] } = useQuery<RecipeListItem[]>({ queryKey: ["/api/recipes"] });
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "beans", unit: "oz", onHand: 0, parLevel: 0, costSource: "inventory" as "inventory" | "recipe", inventoryItemId: 0, recipeId: 0 });
  const [invSearch, setInvSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");

  const filteredInvItems = useMemo(() => {
    if (!invSearch.trim()) return mainInventory;
    const q = invSearch.toLowerCase();
    return mainInventory.filter(i => i.name.toLowerCase().includes(q));
  }, [mainInventory, invSearch]);

  const filteredRecipes = useMemo(() => {
    if (!recipeSearch.trim()) return allRecipes;
    const q = recipeSearch.toLowerCase();
    return allRecipes.filter(r => r.title.toLowerCase().includes(q));
  }, [allRecipes, recipeSearch]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coffee/inventory", {
        name: form.name,
        category: form.category,
        unit: form.unit,
        onHand: form.onHand,
        parLevel: form.parLevel || null,
        inventoryItemId: form.costSource === "inventory" && form.inventoryItemId ? form.inventoryItemId : null,
        recipeId: form.costSource === "recipe" && form.recipeId ? form.recipeId : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/inventory"] });
      setForm({ name: "", category: "beans", unit: "oz", onHand: 0, parLevel: 0, costSource: "inventory", inventoryItemId: 0, recipeId: 0 });
      setInvSearch("");
      setRecipeSearch("");
      setAddOpen(false);
      toast({ title: "Item added to coffee inventory" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const res = await apiRequest("PATCH", `/api/coffee/inventory/${id}`, updates);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/coffee/inventory"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/coffee/inventory/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/inventory"] });
      toast({ title: "Item removed" });
    },
  });

  const adjustQuantity = (item: CoffeeInventoryItem, delta: number) => {
    const newOnHand = Math.max(0, item.onHand + delta);
    updateMutation.mutate({ id: item.id, updates: { onHand: newOnHand } });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Coffee Inventory</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-700 hover:bg-amber-600 text-white" data-testid="button-add-inventory">
              <Plus className="w-4 h-4 mr-2" /> Add Item
            </Button>
          </DialogTrigger>
          <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Item Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Espresso Beans - Dark Roast" data-testid="input-inv-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category *</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger data-testid="select-inv-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unit *</Label>
                  <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                    <SelectTrigger data-testid="select-inv-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oz">oz</SelectItem>
                      <SelectItem value="lbs">lbs</SelectItem>
                      <SelectItem value="bags">bags</SelectItem>
                      <SelectItem value="gallons">gallons</SelectItem>
                      <SelectItem value="liters">liters</SelectItem>
                      <SelectItem value="pumps">pumps</SelectItem>
                      <SelectItem value="bottles">bottles</SelectItem>
                      <SelectItem value="units">units</SelectItem>
                      <SelectItem value="cups">cups</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>On Hand</Label>
                  <Input type="number" value={form.onHand} onChange={e => setForm(f => ({ ...f, onHand: parseFloat(e.target.value) || 0 }))} data-testid="input-inv-onhand" />
                </div>
                <div>
                  <Label>Par Level</Label>
                  <Input type="number" value={form.parLevel} onChange={e => setForm(f => ({ ...f, parLevel: parseFloat(e.target.value) || 0 }))} data-testid="input-inv-par" />
                </div>
              </div>
              <div>
                <Label>Cost Source</Label>
                <div className="flex gap-2 mt-1 mb-2">
                  <Button type="button" size="sm" variant={form.costSource === "inventory" ? "default" : "outline"} onClick={() => setForm(f => ({ ...f, costSource: "inventory", recipeId: 0 }))} data-testid="button-cost-inventory">
                    <Package className="w-3 h-3 mr-1" /> Vendor Item
                  </Button>
                  <Button type="button" size="sm" variant={form.costSource === "recipe" ? "default" : "outline"} onClick={() => setForm(f => ({ ...f, costSource: "recipe", inventoryItemId: 0 }))} data-testid="button-cost-recipe">
                    <FlaskConical className="w-3 h-3 mr-1" /> Recipe
                  </Button>
                </div>
                {form.costSource === "inventory" ? (
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-8" value={invSearch} onChange={e => setInvSearch(e.target.value)} placeholder="Search inventory items..." data-testid="input-search-inventory" />
                    </div>
                    {form.inventoryItemId ? (
                      <div className="flex items-center gap-2 p-2 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                        <Link2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">{mainInventory.find(i => i.id === form.inventoryItemId)?.name}</span>
                        <span className="text-xs text-muted-foreground">{mainInventory.find(i => i.id === form.inventoryItemId)?.costPerUnit != null ? `$${mainInventory.find(i => i.id === form.inventoryItemId)!.costPerUnit!.toFixed(2)}/${mainInventory.find(i => i.id === form.inventoryItemId)?.unit}` : "No cost yet"}</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setForm(f => ({ ...f, inventoryItemId: 0 }))}><X className="w-3 h-3" /></Button>
                      </div>
                    ) : invSearch.trim() && filteredInvItems.length > 0 ? (
                      <div className="max-h-32 overflow-y-auto border rounded-md bg-popover shadow-md">
                        {filteredInvItems.slice(0, 15).map(item => (
                          <button key={item.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors border-b last:border-b-0" onClick={() => { setForm(f => ({ ...f, inventoryItemId: item.id })); setInvSearch(""); }} data-testid={`inv-item-${item.id}`}>
                            <span className="font-medium">{item.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{item.costPerUnit != null ? `$${item.costPerUnit.toFixed(2)}/${item.unit}` : item.unit}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">Cost auto-updates from vendor invoices</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-8" value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)} placeholder="Search recipes..." data-testid="input-search-recipe" />
                    </div>
                    {form.recipeId ? (
                      <div className="flex items-center gap-2 p-2 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                        <FlaskConical className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">{allRecipes.find(r => r.id === form.recipeId)?.title}</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setForm(f => ({ ...f, recipeId: 0 }))}><X className="w-3 h-3" /></Button>
                      </div>
                    ) : recipeSearch.trim() && filteredRecipes.length > 0 ? (
                      <div className="max-h-32 overflow-y-auto border rounded-md bg-popover shadow-md">
                        {filteredRecipes.slice(0, 15).map(r => (
                          <button key={r.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors border-b last:border-b-0" onClick={() => { setForm(f => ({ ...f, recipeId: r.id })); setRecipeSearch(""); }} data-testid={`recipe-item-${r.id}`}>
                            <span className="font-medium">{r.title}</span>
                            <span className="text-xs text-muted-foreground ml-2">{r.category} · yields {r.yieldAmount} {r.yieldUnit}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">Cost calculated from recipe ingredients (vendor costs)</p>
                  </div>
                )}
              </div>
              <Button className="w-full bg-amber-700 hover:bg-amber-600 text-white" disabled={!form.name.trim() || createMutation.isPending || (form.costSource === "inventory" && !form.inventoryItemId) || (form.costSource === "recipe" && !form.recipeId)} onClick={() => createMutation.mutate()} data-testid="button-save-inventory">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Add Item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {inventory.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Bean className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No inventory items yet</p>
            <p className="text-sm mt-1">Add your beans, milks, syrups, and everything else Jarvis needs to track</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {inventory.map(item => {
            const stock = getStockLevel(item.onHand, item.parLevel);
            const CatIcon = getCategoryIcon(item.category);
            return (
              <Card key={item.id} data-testid={`card-inv-${item.id}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <CatIcon className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{item.onHand} {item.unit}</span>
                      {item.parLevel && (
                        <span className="text-xs text-muted-foreground">/ par: {item.parLevel}</span>
                      )}
                      {(item as any).costSource && (
                        <Badge variant="outline" className={`text-xs ${(item as any).costResolved ? "" : "border-yellow-400 text-yellow-600"}`}>
                          {(item as any).costSource === "inventory" ? "vendor" : "recipe"}
                          {!(item as any).costResolved && " ⚠"}
                        </Badge>
                      )}
                      {item.costPerUnit != null && (item as any).costResolved && (
                        <span className="text-xs text-muted-foreground">${Number(item.costPerUnit).toFixed(2)}/{item.unit}</span>
                      )}
                      {(item as any).costSource && !(item as any).costResolved && (
                        <span className="text-xs text-yellow-600">cost pending</span>
                      )}
                      <Badge variant="outline" className={`text-xs ${stock.label === "Critical" ? "border-red-400 text-red-600" : stock.label === "Low" ? "border-yellow-400 text-yellow-600" : ""}`}>
                        {stock.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="w-20">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${stock.color}`} style={{ width: `${stock.pct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => adjustQuantity(item, -1)} data-testid={`button-minus-${item.id}`}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => adjustQuantity(item, 1)} data-testid={`button-plus-${item.id}`}>
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-inv-${item.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function ComponentsLibrary() {
  const { data: components = [], isLoading } = useQuery<EnrichedComponent[]>({ queryKey: ["/api/coffee/components"] });
  const { data: inventory = [] } = useQuery<CoffeeInventoryItem[]>({ queryKey: ["/api/coffee/inventory"] });
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [coffeeInventoryId, setCoffeeInventoryId] = useState("");
  const [defaultQuantity, setDefaultQuantity] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("oz");

  const resetForm = () => {
    setName(""); setCategory(""); setCoffeeInventoryId(""); setDefaultQuantity(""); setDefaultUnit("oz"); setEditingId(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const invId = coffeeInventoryId && coffeeInventoryId !== "none" ? parseInt(coffeeInventoryId) : null;
      const res = await apiRequest("POST", "/api/coffee/components", {
        name: name.trim(), category,
        coffeeInventoryId: invId && !isNaN(invId) ? invId : null,
        defaultQuantity: defaultQuantity ? parseFloat(defaultQuantity) : null,
        defaultUnit: defaultUnit || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/components"] });
      resetForm(); setAddOpen(false);
      toast({ title: "Component added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const invId = coffeeInventoryId && coffeeInventoryId !== "none" ? parseInt(coffeeInventoryId) : null;
      const res = await apiRequest("PATCH", `/api/coffee/components/${editingId}`, {
        name: name.trim(), category,
        coffeeInventoryId: invId && !isNaN(invId) ? invId : null,
        defaultQuantity: defaultQuantity ? parseFloat(defaultQuantity) : null,
        defaultUnit: defaultUnit || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/components"] });
      resetForm(); setAddOpen(false);
      toast({ title: "Component updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/coffee/components/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/components"] });
      toast({ title: "Component removed" });
    },
  });

  const startEdit = (c: EnrichedComponent) => {
    setEditingId(c.id); setName(c.name); setCategory(c.category);
    setCoffeeInventoryId(c.coffeeInventoryId ? String(c.coffeeInventoryId) : "");
    setDefaultQuantity(c.defaultQuantity ? String(c.defaultQuantity) : "");
    setDefaultUnit(c.defaultUnit || "oz");
    setAddOpen(true);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedComponent[]>();
    for (const c of components) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return map;
  }, [components]);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-components-title">Components Library</h2>
          <p className="text-sm text-muted-foreground">Coffee ingredients organized by category — costs flow from inventory</p>
        </div>
        <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-amber-700 hover:bg-amber-600 text-white" data-testid="button-add-component">
              <Plus className="w-4 h-4 mr-2" /> Add Component
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editingId ? "Edit Component" : "New Component"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Espresso Shot" data-testid="input-component-name" />
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-component-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {COMPONENT_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Linked Inventory Item <span className="text-xs text-muted-foreground">(for cost tracking)</span></Label>
                <Select value={coffeeInventoryId} onValueChange={setCoffeeInventoryId}>
                  <SelectTrigger data-testid="select-component-inventory"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {inventory.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>{item.name} ({item.unit})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Default Qty</Label>
                  <Input type="number" step="0.1" value={defaultQuantity} onChange={e => setDefaultQuantity(e.target.value)} placeholder="1" data-testid="input-component-qty" />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Select value={defaultUnit} onValueChange={setDefaultUnit}>
                    <SelectTrigger data-testid="select-component-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["oz", "shots", "pumps", "cups", "ml", "g", "units"].map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full bg-amber-700 hover:bg-amber-600 text-white"
                disabled={!name.trim() || !category || (editingId ? updateMutation.isPending : createMutation.isPending)}
                onClick={() => editingId ? updateMutation.mutate() : createMutation.mutate()}
                data-testid="button-save-component"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {editingId ? "Update" : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {components.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No components yet</p>
            <p className="text-sm mt-1">Add your coffee ingredients (espresso, milks, syrups, etc.) to build drink recipes</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {COMPONENT_CATEGORIES.map(cat => {
            const items = grouped.get(cat.value);
            if (!items || items.length === 0) return null;
            const CatIcon = cat.icon;
            return (
              <Card key={cat.value} data-testid={`card-component-category-${cat.value}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CatIcon className="w-4 h-4 text-amber-700" /> {cat.label}
                    <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {items.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 group" data-testid={`component-${c.id}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.defaultQuantity && c.defaultUnit ? `${c.defaultQuantity} ${c.defaultUnit}` : "No default"}
                            {c.inventoryItemName && <span> · <Link2 className="w-3 h-3 inline text-green-600" /> {c.inventoryItemName}</span>}
                            {c.costPerUnit != null && <span> · ${c.costPerUnit.toFixed(2)}/{c.defaultUnit || "unit"}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(c)} data-testid={`button-edit-component-${c.id}`}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => deleteMutation.mutate(c.id)} data-testid={`button-delete-component-${c.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

type ParsedIngredient = {
  componentId: number | null;
  componentName: string;
  coffeeInventoryId: number | null;
  quantityUsed: number;
  unit: string;
  matched: boolean;
  suggestedCategory: string | null;
  estimatedCost?: number;
};

type ParsedDrink = {
  drinkName: string;
  description: string;
  parentDrinkId: number | null;
  ingredients: ParsedIngredient[];
  notes: string | null;
  estimatedTotalCost?: number | null;
};

function DrinkSetup() {
  const { data: drinks = [], isLoading } = useQuery<DrinkWithIngredients[]>({ queryKey: ["/api/coffee/drinks"] });
  const { data: inventory = [] } = useQuery<CoffeeInventoryItem[]>({ queryKey: ["/api/coffee/inventory"] });
  const { data: components = [] } = useQuery<EnrichedComponent[]>({ queryKey: ["/api/coffee/components"] });
  const { data: squareCatalog = [] } = useQuery<SquareCatalogItem[]>({ queryKey: ["/api/square/catalog"] });
  const { toast } = useToast();
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [jarvisInput, setJarvisInput] = useState("");
  const [parsedDrinks, setParsedDrinks] = useState<ParsedDrink[]>([]);
  const [jarvisQuestions, setJarvisQuestions] = useState<string[]>([]);
  const [jarvisHistory, setJarvisHistory] = useState<{ role: string; content: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drinkName, setDrinkName] = useState("");
  const [description, setDescription] = useState("");
  const [parentDrinkId, setParentDrinkId] = useState("");
  const [squareItemId, setSquareItemId] = useState("");
  const [squareVariationId, setSquareVariationId] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [ingredients, setIngredients] = useState<{ coffeeInventoryId: number; quantityUsed: number; unit: string }[]>([]);

  const selectedSquareItem = useMemo(() => squareCatalog.find(i => i.id === squareItemId), [squareCatalog, squareItemId]);

  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return squareCatalog;
    const q = catalogSearch.toLowerCase();
    return squareCatalog.filter(i => i.name.toLowerCase().includes(q));
  }, [squareCatalog, catalogSearch]);

  const baseDrinks = useMemo(() => drinks.filter(d => !d.parentDrinkId), [drinks]);
  const variationsByParent = useMemo(() => {
    const map = new Map<number, DrinkWithIngredients[]>();
    for (const d of drinks) {
      if (d.parentDrinkId) {
        if (!map.has(d.parentDrinkId)) map.set(d.parentDrinkId, []);
        map.get(d.parentDrinkId)!.push(d);
      }
    }
    return map;
  }, [drinks]);

  const getDrinkCost = useCallback((drink: DrinkWithIngredients) => {
    const ings = drink.effectiveIngredients || drink.ingredients;
    let total = 0;
    let hasAny = false;
    for (const ing of ings) {
      if (ing.costPerUnit != null) {
        total += ing.quantityUsed * ing.costPerUnit;
        hasAny = true;
      }
    }
    return hasAny ? total : null;
  }, []);

  const jarvisParseMutation = useMutation({
    mutationFn: async (payload: { text?: string; imageBase64?: string }) => {
      const res = await apiRequest("POST", "/api/coffee/jarvis-parse-drinks", payload);
      return res.json();
    },
    onSuccess: (data) => {
      setParsedDrinks(data.drinks || []);
      setJarvisQuestions(data.questions || []);
      if (data.drinks?.length > 0) {
        setJarvisHistory(prev => [...prev, { role: "assistant", content: `I found ${data.drinks.length} drink${data.drinks.length > 1 ? "s" : ""}. Review below and confirm to save.` }]);
      }
      if (data.questions?.length > 0) {
        setJarvisHistory(prev => [...prev, { role: "assistant", content: data.questions.join("\n") }]);
      }
    },
    onError: (err: any) => {
      toast({ title: "Jarvis parsing failed", description: err.message, variant: "destructive" });
    },
  });

  const saveDrinkMutation = useMutation({
    mutationFn: async (drink: ParsedDrink) => {
      const validParent = drink.parentDrinkId && drinks.some(d => d.id === drink.parentDrinkId) ? drink.parentDrinkId : null;
      const ingredientsPayload = drink.ingredients
        .map(i => ({
          coffeeInventoryId: i.coffeeInventoryId || 0,
          coffeeComponentId: i.componentId || null,
          quantityUsed: i.quantityUsed,
          unit: i.unit,
          isOverride: validParent ? true : false,
        }));
      const res = await apiRequest("POST", "/api/coffee/drinks", {
        drinkName: drink.drinkName,
        description: drink.description || null,
        parentDrinkId: validParent,
        ingredients: ingredientsPayload,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/drinks"] });
    },
  });

  const handleJarvisSubmit = () => {
    if (!jarvisInput.trim()) return;
    setJarvisHistory(prev => [...prev, { role: "user", content: jarvisInput }]);
    jarvisParseMutation.mutate({ text: jarvisInput });
    setJarvisInput("");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      setJarvisHistory(prev => [...prev, { role: "user", content: `[Uploaded image: ${file.name}]` }]);
      jarvisParseMutation.mutate({ text: "Parse all drinks from this image", imageBase64: base64 });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveAllParsed = async () => {
    const unmatchedCount = parsedDrinks.reduce((sum, d) => sum + d.ingredients.filter(i => !i.coffeeInventoryId).length, 0);
    if (unmatchedCount > 0) {
      const confirmed = window.confirm(`${unmatchedCount} ingredient(s) are unmatched and won't be saved. Create components for them first, or continue saving without them?`);
      if (!confirmed) return;
    }
    for (const drink of parsedDrinks) {
      await saveDrinkMutation.mutateAsync(drink);
    }
    setParsedDrinks([]);
    setJarvisHistory(prev => [...prev, { role: "assistant", content: `Saved ${parsedDrinks.length} drink${parsedDrinks.length > 1 ? "s" : ""} successfully!` }]);
    toast({ title: `${parsedDrinks.length} drink(s) saved` });
    queryClient.invalidateQueries({ queryKey: ["/api/coffee/drinks"] });
  };

  const handleCreateComponent = async (drinkIdx: number, ingIdx: number) => {
    const ing = parsedDrinks[drinkIdx]?.ingredients[ingIdx];
    if (!ing) return;
    try {
      const res = await apiRequest("POST", "/api/coffee/components", {
        name: ing.componentName,
        category: ing.suggestedCategory || "other",
        defaultQuantity: ing.quantityUsed,
        defaultUnit: ing.unit,
      });
      const newComp = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/components"] });
      setParsedDrinks(prev => prev.map((d, di) => di !== drinkIdx ? d : {
        ...d,
        ingredients: d.ingredients.map((i, ii) => ii !== ingIdx ? i : {
          ...i,
          componentId: newComp.id,
          coffeeInventoryId: newComp.coffeeInventoryId || i.coffeeInventoryId,
          matched: true,
        }),
      }));
      toast({ title: `Component "${ing.componentName}" created and linked` });
    } catch (err: any) {
      toast({ title: "Failed to create component", description: err.message, variant: "destructive" });
    }
  };

  const handleLinkComponent = (drinkIdx: number, ingIdx: number, comp: EnrichedComponent) => {
    setParsedDrinks(prev => prev.map((d, di) => di !== drinkIdx ? d : {
      ...d,
      ingredients: d.ingredients.map((i, ii) => ii !== ingIdx ? i : {
        ...i,
        componentId: comp.id,
        componentName: comp.name,
        coffeeInventoryId: comp.coffeeInventoryId || i.coffeeInventoryId,
        matched: true,
      }),
    }));
    toast({ title: `Linked to "${comp.name}"` });
  };

  const updateParsedDrink = (drinkIdx: number, field: string, value: any) => {
    setParsedDrinks(prev => prev.map((d, di) => di !== drinkIdx ? d : { ...d, [field]: value }));
  };

  const updateParsedIngredient = (drinkIdx: number, ingIdx: number, field: string, value: any) => {
    setParsedDrinks(prev => prev.map((d, di) => di !== drinkIdx ? d : {
      ...d,
      ingredients: d.ingredients.map((i, ii) => ii !== ingIdx ? i : { ...i, [field]: value }),
    }));
  };

  const removeParsedIngredient = (drinkIdx: number, ingIdx: number) => {
    setParsedDrinks(prev => prev.map((d, di) => di !== drinkIdx ? d : {
      ...d,
      ingredients: d.ingredients.filter((_, ii) => ii !== ingIdx),
    }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coffee/drinks", {
        drinkName: drinkName.trim(),
        description: description.trim() || null,
        parentDrinkId: parentDrinkId ? parseInt(parentDrinkId) : null,
        squareItemId: squareItemId || null,
        squareItemName: selectedSquareItem?.name || null,
        squareVariationId: squareVariationId || null,
        ingredients: ingredients.filter(i => i.coffeeInventoryId && i.quantityUsed > 0),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/drinks"] });
      resetManualForm();
      setManualOpen(false);
      toast({ title: "Drink recipe saved" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const res = await apiRequest("PATCH", `/api/coffee/drinks/${editingId}`, {
        drinkName: drinkName.trim(),
        description: description.trim() || null,
        parentDrinkId: parentDrinkId ? parseInt(parentDrinkId) : null,
        squareItemId: squareItemId || null,
        squareItemName: selectedSquareItem?.name || null,
        squareVariationId: squareVariationId || null,
        ingredients: ingredients.filter(i => i.coffeeInventoryId && i.quantityUsed > 0),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/drinks"] });
      resetManualForm();
      setManualOpen(false);
      setEditingId(null);
      toast({ title: "Drink recipe updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/coffee/drinks/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/drinks"] });
      toast({ title: "Drink recipe removed" });
    },
  });

  const resetManualForm = () => {
    setDrinkName(""); setDescription(""); setParentDrinkId("");
    setSquareItemId(""); setSquareVariationId(""); setCatalogSearch(""); setIngredients([]);
  };

  const startEdit = (drink: DrinkWithIngredients) => {
    setEditingId(drink.id);
    setDrinkName(drink.drinkName);
    setDescription(drink.description || "");
    setParentDrinkId(drink.parentDrinkId ? String(drink.parentDrinkId) : "");
    setSquareItemId(drink.squareItemId || "");
    setSquareVariationId(drink.squareVariationId || "");
    setCatalogSearch("");
    setIngredients(drink.ingredients.map(i => ({
      coffeeInventoryId: i.coffeeInventoryId,
      quantityUsed: i.quantityUsed,
      unit: i.unit,
    })));
    setManualOpen(true);
  };

  const addIngredientRow = () => {
    setIngredients(prev => [...prev, { coffeeInventoryId: 0, quantityUsed: 0, unit: "oz" }]);
  };

  const removeIngredientRow = (idx: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: string, value: any) => {
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing));
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-drinks-title">Drink Recipes</h2>
          <p className="text-sm text-muted-foreground">Teach Jarvis what goes into each drink so he can track usage</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { resetManualForm(); setEditingId(null); setManualOpen(true); }} data-testid="button-add-drink-manual">
            <Plus className="w-4 h-4 mr-2" /> Manual
          </Button>
          <Button className="bg-amber-700 hover:bg-amber-600 text-white" onClick={() => { setJarvisOpen(true); setJarvisHistory([]); setParsedDrinks([]); setJarvisQuestions([]); }} data-testid="button-add-drink">
            <Sparkles className="w-4 h-4 mr-2" /> Jarvis Builder
          </Button>
        </div>
      </div>

      <Dialog open={jarvisOpen} onOpenChange={setJarvisOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-amber-700" /> Jarvis Drink Builder
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[400px] p-2 border rounded-lg bg-muted/20" data-testid="jarvis-chat-area">
            {jarvisHistory.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Tell me what drinks to build</p>
                <p className="text-sm mt-1">Type something like "iced oat latte with vanilla" or upload a photo of your menu</p>
              </div>
            )}
            {jarvisHistory.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && <Bot className="w-5 h-5 text-amber-700 mt-1 shrink-0" />}
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${msg.role === "user" ? "bg-amber-100 dark:bg-amber-900/30 text-right" : "bg-muted"}`} data-testid={`jarvis-msg-${idx}`}>
                  {msg.content}
                </div>
                {msg.role === "user" && <User className="w-5 h-5 text-muted-foreground mt-1 shrink-0" />}
              </div>
            ))}
            {jarvisParseMutation.isPending && (
              <div className="flex gap-2 items-center">
                <Bot className="w-5 h-5 text-amber-700" />
                <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Parsing drinks...
                </div>
              </div>
            )}
          </div>

          {parsedDrinks.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3 bg-green-50 dark:bg-green-950/20" data-testid="jarvis-parsed-results">
              <p className="text-sm font-semibold text-green-800 dark:text-green-300 flex items-center gap-1">
                <Check className="w-4 h-4" /> Parsed {parsedDrinks.length} drink{parsedDrinks.length > 1 ? "s" : ""} — edit before saving
              </p>
              {parsedDrinks.map((drink, dIdx) => (
                <Card key={dIdx} className="border-green-200 dark:border-green-800" data-testid={`parsed-drink-${dIdx}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="space-y-1">
                      <Input
                        value={drink.drinkName}
                        onChange={e => updateParsedDrink(dIdx, "drinkName", e.target.value)}
                        className="h-7 text-sm font-medium"
                        data-testid={`input-parsed-drink-name-${dIdx}`}
                      />
                      <Input
                        value={drink.description || ""}
                        onChange={e => updateParsedDrink(dIdx, "description", e.target.value)}
                        placeholder="Description (optional)"
                        className="h-7 text-xs"
                        data-testid={`input-parsed-drink-desc-${dIdx}`}
                      />
                      <Select
                        value={drink.parentDrinkId ? String(drink.parentDrinkId) : "none"}
                        onValueChange={v => updateParsedDrink(dIdx, "parentDrinkId", v === "none" ? null : Number(v))}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid={`select-parsed-parent-${dIdx}`}>
                          <SelectValue placeholder="Base drink (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No base drink</SelectItem>
                          {drinks.filter(d => !d.parentDrinkId).map(d => (
                            <SelectItem key={d.id} value={String(d.id)}>{d.drinkName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Ingredients</p>
                      {drink.ingredients.map((ing, iIdx) => (
                        <div key={iIdx} className="flex items-center gap-1 text-xs" data-testid={`parsed-ingredient-${dIdx}-${iIdx}`}>
                          {ing.matched ? <Check className="w-3 h-3 text-green-600 shrink-0" /> : <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />}
                          <Input
                            value={ing.componentName}
                            onChange={e => updateParsedIngredient(dIdx, iIdx, "componentName", e.target.value)}
                            className="h-6 text-xs flex-1 min-w-0"
                            data-testid={`input-parsed-ing-name-${dIdx}-${iIdx}`}
                          />
                          <Input
                            type="number"
                            value={ing.quantityUsed}
                            onChange={e => updateParsedIngredient(dIdx, iIdx, "quantityUsed", Number(e.target.value))}
                            className="h-6 text-xs w-16"
                            data-testid={`input-parsed-ing-qty-${dIdx}-${iIdx}`}
                          />
                          <Input
                            value={ing.unit}
                            onChange={e => updateParsedIngredient(dIdx, iIdx, "unit", e.target.value)}
                            className="h-6 text-xs w-14"
                            data-testid={`input-parsed-ing-unit-${dIdx}-${iIdx}`}
                          />
                          {!ing.matched && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-1.5 shrink-0"
                                onClick={() => handleCreateComponent(dIdx, iIdx)}
                                data-testid={`button-create-component-${dIdx}-${iIdx}`}
                              >
                                <Plus className="w-2.5 h-2.5 mr-0.5" /> Create
                              </Button>
                              <Select
                                value=""
                                onValueChange={v => {
                                  const comp = components.find(c => c.id === Number(v));
                                  if (comp) handleLinkComponent(dIdx, iIdx, comp);
                                }}
                              >
                                <SelectTrigger className="h-6 text-[10px] w-[90px] shrink-0" data-testid={`select-link-component-${dIdx}-${iIdx}`}>
                                  <SelectValue placeholder="Link..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {components.map(c => (
                                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground shrink-0"
                            onClick={() => removeParsedIngredient(dIdx, iIdx)}
                            data-testid={`button-remove-parsed-ing-${dIdx}-${iIdx}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    {drink.notes && <p className="text-xs text-muted-foreground italic">{drink.notes}</p>}
                  </CardContent>
                </Card>
              ))}
              <Button
                className="w-full bg-green-700 hover:bg-green-600 text-white"
                onClick={handleSaveAllParsed}
                disabled={saveDrinkMutation.isPending}
                data-testid="button-save-all-parsed"
              >
                {saveDrinkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save {parsedDrinks.length} Drink{parsedDrinks.length > 1 ? "s" : ""}
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-image">
              <Upload className="w-4 h-4" />
            </Button>
            <Input
              value={jarvisInput}
              onChange={e => setJarvisInput(e.target.value)}
              placeholder="e.g. iced oat latte with vanilla and cold foam"
              onKeyDown={e => e.key === "Enter" && handleJarvisSubmit()}
              data-testid="input-jarvis-drink"
            />
            <Button
              className="bg-amber-700 hover:bg-amber-600 text-white shrink-0"
              onClick={handleJarvisSubmit}
              disabled={!jarvisInput.trim() || jarvisParseMutation.isPending}
              data-testid="button-jarvis-send"
            >
              {jarvisParseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={(v) => { setManualOpen(v); if (!v) { resetManualForm(); setEditingId(null); } }} modal={false}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>{editingId ? "Edit Drink Recipe" : "New Drink Recipe"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Drink Name *</Label>
              <Input value={drinkName} onChange={e => setDrinkName(e.target.value)} placeholder="e.g. Caramel Latte" data-testid="input-drink-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" data-testid="input-drink-description" />
            </div>
            <div>
              <Label>Base Drink <span className="text-xs text-muted-foreground">(if this is a variation)</span></Label>
              <Select value={parentDrinkId || "none"} onValueChange={v => setParentDrinkId(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-parent-drink"><SelectValue placeholder="None (base drink)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (base drink)</SelectItem>
                  {baseDrinks.filter(d => d.id !== editingId).map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.drinkName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Square Catalog Item <span className="text-muted-foreground text-xs">(links to real-time sales)</span></Label>
              {selectedSquareItem ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                  <Link2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid="text-square-linked">{selectedSquareItem.name}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSquareItemId(""); setSquareVariationId(""); }} data-testid="button-unlink-square">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} placeholder="Search Square catalog..." data-testid="input-square-search" />
                  </div>
                  {catalogSearch.trim() && filteredCatalog.length > 0 && (
                    <div className="max-h-40 overflow-y-auto border rounded-md bg-popover shadow-md">
                      {filteredCatalog.slice(0, 20).map(item => (
                        <button key={item.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0"
                          onClick={() => { setSquareItemId(item.id); setSquareVariationId(item.variations.length === 1 ? item.variations[0].id : ""); setCatalogSearch(""); }}
                          data-testid={`square-catalog-item-${item.id}`}>
                          <span className="font-medium">{item.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedSquareItem && selectedSquareItem.variations.length > 1 && (
                <div className="mt-2">
                  <Label className="text-xs">Variation</Label>
                  <Select value={squareVariationId || "all"} onValueChange={v => setSquareVariationId(v === "all" ? "" : v)}>
                    <SelectTrigger className="mt-1" data-testid="select-square-variation"><SelectValue placeholder="All variations" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All variations</SelectItem>
                      {selectedSquareItem.variations.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}{v.priceMoney ? ` — $${(v.priceMoney.amount / 100).toFixed(2)}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-semibold">Ingredients per Drink</Label>
                <Button variant="outline" size="sm" onClick={addIngredientRow} data-testid="button-add-ingredient-row">
                  <Plus className="w-3 h-3 mr-1" /> Add Ingredient
                </Button>
              </div>
              {ingredients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No ingredients added yet.</p>
              ) : (
                <div className="space-y-2">
                  {ingredients.map((ing, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg" data-testid={`ingredient-row-${idx}`}>
                      <Select value={String(ing.coffeeInventoryId || "")} onValueChange={v => updateIngredient(idx, "coffeeInventoryId", parseInt(v))}>
                        <SelectTrigger className="flex-1" data-testid={`select-ingredient-${idx}`}><SelectValue placeholder="Select item" /></SelectTrigger>
                        <SelectContent>
                          {inventory.map(item => (
                            <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" step="0.1" value={ing.quantityUsed || ""} onChange={e => updateIngredient(idx, "quantityUsed", parseFloat(e.target.value) || 0)} className="w-20" placeholder="Qty" data-testid={`input-ingredient-qty-${idx}`} />
                      <Select value={ing.unit} onValueChange={v => updateIngredient(idx, "unit", v)}>
                        <SelectTrigger className="w-20" data-testid={`select-ingredient-unit-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["oz", "shots", "pumps", "cups", "ml", "g", "units"].map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => removeIngredientRow(idx)} data-testid={`button-remove-ingredient-${idx}`}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              className="w-full bg-amber-700 hover:bg-amber-600 text-white"
              disabled={!drinkName.trim() || (editingId ? updateMutation.isPending : createMutation.isPending)}
              onClick={() => editingId ? updateMutation.mutate() : createMutation.mutate()}
              data-testid="button-save-drink"
            >
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {editingId ? "Update Drink" : "Save Drink"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {drinks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <GlassWater className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No drink recipes yet</p>
            <p className="text-sm mt-1">Use Jarvis Builder to describe drinks in natural language, or add them manually</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {baseDrinks.map(drink => {
            const variations = variationsByParent.get(drink.id) || [];
            return (
              <div key={drink.id}>
                <DrinkCard drink={drink} onEdit={() => startEdit(drink)} onDelete={() => deleteMutation.mutate(drink.id)} getDrinkCost={getDrinkCost} isBase={true} />
                {variations.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1 border-l-2 border-amber-200 dark:border-amber-800 pl-3">
                    {variations.map(v => (
                      <DrinkCard key={v.id} drink={v} onEdit={() => startEdit(v)} onDelete={() => deleteMutation.mutate(v.id)} getDrinkCost={getDrinkCost} isBase={false} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {drinks.filter(d => d.parentDrinkId && !baseDrinks.some(b => b.id === d.parentDrinkId)).map(drink => (
            <DrinkCard key={drink.id} drink={drink} onEdit={() => startEdit(drink)} onDelete={() => deleteMutation.mutate(drink.id)} getDrinkCost={getDrinkCost} isBase={false} />
          ))}
        </div>
      )}
    </>
  );
}

function DrinkCard({ drink, onEdit, onDelete, getDrinkCost, isBase }: { drink: DrinkWithIngredients; onEdit: () => void; onDelete: () => void; getDrinkCost: (d: DrinkWithIngredients) => number | null; isBase: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const cost = getDrinkCost(drink);

  return (
    <Card data-testid={`card-drink-${drink.id}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => setExpanded(!expanded)}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isBase ? "bg-amber-100 dark:bg-amber-900/30" : "bg-blue-50 dark:bg-blue-900/20"}`}>
              {isBase ? <CoffeeIcon className="w-4 h-4 text-amber-700" /> : <Layers className="w-4 h-4 text-blue-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{drink.drinkName}</p>
                {!isBase && <Badge variant="outline" className="text-[10px] h-4 px-1">variation</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {drink.ingredients.length} ingredient{drink.ingredients.length !== 1 ? "s" : ""}
                {cost != null && <span> · <DollarSign className="w-3 h-3 inline" />{cost.toFixed(2)}</span>}
                {(drink.squareItemId || drink.squareItemName) && (
                  <span className="inline-flex items-center gap-1">
                    {" · "}
                    <Link2 className="w-3 h-3 text-green-600" />
                    {drink.squareItemName || "Square linked"}
                  </span>
                )}
              </p>
              {drink.description && <p className="text-xs text-muted-foreground truncate">{drink.description}</p>}
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-2" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-2" />}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} data-testid={`button-edit-drink-${drink.id}`}>
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={onDelete} data-testid={`button-delete-drink-${drink.id}`}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        {expanded && (drink.effectiveIngredients || drink.ingredients).length > 0 && (
          <div className="mt-3 ml-11 space-y-1 border-t pt-2">
            {(drink.effectiveIngredients || drink.ingredients).map((ing, idx) => {
              const ingCost = ing.costPerUnit != null ? ing.quantityUsed * ing.costPerUnit : null;
              return (
                <div key={ing.id || idx} className="flex items-center justify-between text-sm">
                  <span className={`flex items-center gap-1 ${ing.inherited ? "text-muted-foreground/60 italic" : "text-muted-foreground"}`}>
                    {ing.componentName ? (ing.coffeeInventoryId ? `${ing.componentName} (${ing.inventoryItemName})` : ing.componentName) : ing.inventoryItemName}
                    {ing.inherited && <Badge variant="outline" className="text-[9px] h-4 px-1">inherited</Badge>}
                    {!ing.coffeeInventoryId && ing.coffeeComponentId && <Badge variant="outline" className="text-[9px] h-4 px-1 text-amber-600 border-amber-300">no cost</Badge>}
                  </span>
                  <span className="font-medium">
                    {ing.quantityUsed} {ing.unit}
                    {ingCost != null && <span className="text-xs text-muted-foreground ml-2">(${ingCost.toFixed(2)})</span>}
                  </span>
                </div>
              );
            })}
            {cost != null && (
              <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t mt-1">
                <span>Total Cost</span>
                <span className="text-amber-700">${cost.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsageTracker() {
  const today = new Date().toISOString().split("T")[0];
  const { data: drinks = [] } = useQuery<DrinkWithIngredients[]>({ queryKey: ["/api/coffee/drinks"] });
  const { data: todayLogs = [], isLoading } = useQuery<any[]>({ queryKey: [`/api/coffee/usage?date=${today}`] });
  const { data: summary } = useQuery<any>({ queryKey: ["/api/coffee/usage/summary?days=7"] });
  const { data: inventory = [] } = useQuery<CoffeeInventoryItem[]>({ queryKey: ["/api/coffee/inventory"] });
  const inventoryMap = new Map(inventory.map(i => [i.id, i]));
  const { toast } = useToast();
  const [logOpen, setLogOpen] = useState(false);
  const [selectedDrink, setSelectedDrink] = useState("");
  const [quantity, setQuantity] = useState(1);

  const logMutation = useMutation({
    mutationFn: async () => {
      const drink = drinks.find(d => String(d.id) === selectedDrink);
      const res = await apiRequest("POST", "/api/coffee/usage/log", {
        drinkRecipeId: drink?.id || null,
        drinkName: drink?.drinkName || selectedDrink,
        quantitySold: quantity,
        date: today,
        source: "manual",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coffee/usage?date=${today}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/usage/summary?days=7"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/inventory"] });
      setLogOpen(false);
      setSelectedDrink("");
      setQuantity(1);
      toast({ title: "Sales logged & inventory updated" });
    },
  });

  const syncSquareMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coffee/sync-square-sales", { date: today });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/coffee/usage?date=${today}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/usage/summary?days=7"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coffee/inventory"] });
      toast({ title: data.message || "Square sales synced" });
    },
    onError: () => toast({ title: "Failed to sync Square sales", variant: "destructive" }),
  });

  const allIngredients = drinks.flatMap(d => d.ingredients);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Usage & Sales Tracker</h2>
          <p className="text-sm text-muted-foreground">Log drinks sold — Jarvis automatically deducts from inventory</p>
        </div>
        <div className="flex items-center gap-2">
          {drinks.some(d => d.squareItemId || d.squareItemName) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncSquareMut.mutate()}
              disabled={syncSquareMut.isPending}
              data-testid="button-sync-square-sales"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${syncSquareMut.isPending ? "animate-spin" : ""}`} />
              Sync Square
            </Button>
          )}
          <Dialog open={logOpen} onOpenChange={setLogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-700 hover:bg-amber-600 text-white" data-testid="button-log-sales">
                <Plus className="w-4 h-4 mr-2" /> Log Sales
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log Drink Sales</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Drink</Label>
                <Select value={selectedDrink} onValueChange={setSelectedDrink}>
                  <SelectTrigger data-testid="select-log-drink"><SelectValue placeholder="Select a drink" /></SelectTrigger>
                  <SelectContent>
                    {drinks.map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.drinkName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity Sold</Label>
                <Input type="number" min={1} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} data-testid="input-log-quantity" />
              </div>
              {selectedDrink && (() => {
                const drink = drinks.find(d => String(d.id) === selectedDrink);
                if (!drink || drink.ingredients.length === 0) return null;
                return (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Inventory Impact Preview</p>
                    {drink.ingredients.map(ing => (
                      <div key={ing.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{ing.inventoryItemName}</span>
                        <span className="font-medium text-amber-700">-{(ing.quantityUsed * quantity).toFixed(1)} {ing.unit}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <Button
                className="w-full bg-amber-700 hover:bg-amber-600 text-white"
                disabled={!selectedDrink || logMutation.isPending}
                onClick={() => logMutation.mutate()}
                data-testid="button-submit-log"
              >
                {logMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BarChart3 className="w-4 h-4 mr-2" />}
                Log Sales & Deduct Inventory
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card data-testid="card-today-sales">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Today's Sales</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : todayLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No sales logged today yet</p>
          ) : (
            <div className="space-y-2">
              {todayLogs.map((log: any) => {
                const drink = drinks.find(d => d.id === log.drinkRecipeId);
                return (
                  <div key={log.id} className="flex items-center justify-between p-2 bg-muted/30 rounded" data-testid={`log-${log.id}`}>
                    <div>
                      <p className="font-medium text-sm">{log.drinkName}</p>
                      <p className="text-xs text-muted-foreground">
                        {drink?.ingredients.map(ing => `${(ing.quantityUsed * log.quantitySold).toFixed(1)} ${ing.unit} ${ing.inventoryItemName}`).join(" · ") || "No recipe linked"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="font-bold">x{log.quantitySold}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {summary && summary.summary && summary.summary.length > 0 && (
        <Card data-testid="card-weekly-summary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Last {summary.days} Days Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.summary.map((s: any, idx: number) => (
                <div key={idx} className="p-3 border rounded-lg" data-testid={`summary-drink-${idx}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{s.drinkName}</span>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{s.totalSold} sold</Badge>
                  </div>
                  {s.ingredientImpact.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {s.ingredientImpact.map((imp: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs text-muted-foreground">
                          <span>{imp.inventoryItemName}</span>
                          <span className="font-medium">{imp.totalUsed.toFixed(1)} {imp.unit} used</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
