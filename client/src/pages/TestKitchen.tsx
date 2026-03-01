import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  FlaskConical, Plus, Trash2, GripVertical, DollarSign, Calendar,
  ChevronRight, Sparkles, MessageSquare, Eye, Beaker, CheckCircle2,
  ArrowRight, TrendingUp, Package, X, Bot, Zap, Lightbulb, Target,
  BarChart3, ShoppingCart, Loader2,
} from "lucide-react";
import type { TestKitchenItem, TestKitchenNote, InventoryItem } from "@shared/schema";

type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  inventoryItemId?: number | null;
  costPerUnit?: number | null;
};

type MethodStep = string;

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  draft: { label: "Draft", color: "bg-gray-500", next: "testing", nextLabel: "Start Testing" },
  testing: { label: "Testing", color: "bg-blue-500", next: "review", nextLabel: "Send for Review" },
  review: { label: "In Review", color: "bg-amber-500", next: "finalized", nextLabel: "Finalize" },
  finalized: { label: "Finalized", color: "bg-green-600" },
  archived: { label: "Archived", color: "bg-gray-400" },
};

const NOTE_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare },
  { value: "tasting", label: "Tasting", icon: Beaker },
  { value: "revision", label: "Revision", icon: Sparkles },
  { value: "approval", label: "Approval", icon: CheckCircle2 },
];

export default function TestKitchen() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [deptInitialized, setDeptInitialized] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!deptInitialized && (user as any)?.department) {
      setDepartmentFilter((user as any).department);
      setDeptInitialized(true);
    }
  }, [user, deptInitialized]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<number | null>(null);

  const { data: items = [], isLoading } = useQuery<TestKitchenItem[]>({
    queryKey: ["/api/test-kitchen"],
  });

  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items"],
  });

  const filtered = items.filter((item) => {
    if (departmentFilter !== "all" && item.department !== departmentFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen" data-testid="page-test-kitchen">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-test-kitchen-title">Test Kitchen</h1>
              <p className="text-sm text-muted-foreground">Create, test & perfect your next specials</p>
            </div>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500"
            data-testid="button-new-special"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Special
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Tabs value={departmentFilter} onValueChange={setDepartmentFilter}>
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-dept-all">All</TabsTrigger>
              <TabsTrigger value="bar" data-testid="tab-dept-bar">Bar</TabsTrigger>
              <TabsTrigger value="bakery" data-testid="tab-dept-bakery">Bakery</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
              <SelectItem value="review">In Review</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 h-48" />
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-0 bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-purple-950/40 dark:via-background dark:to-pink-950/40 shadow-lg">
            <CardContent className="p-8 md:p-12">
              <div className="max-w-2xl mx-auto space-y-8">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20">
                    <Bot className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Jarvis</p>
                    <p className="text-xs text-muted-foreground">Test Kitchen Assistant</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h2 className="text-2xl font-bold tracking-tight" data-testid="text-welcome-title">
                    Welcome to the Test Kitchen
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    This is your real-time development lab for building, costing, and perfecting new specials before they hit the menu. Every ingredient you add is costed against live inventory prices, so you always know exactly what a recipe costs to produce.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 dark:bg-white/5 border border-purple-100 dark:border-purple-900/30">
                    <DollarSign className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Live Costing</p>
                      <p className="text-xs text-muted-foreground">Ingredients link to real inventory prices. Cost/unit and margins update as you build.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 dark:bg-white/5 border border-purple-100 dark:border-purple-900/30">
                    <Target className="h-5 w-5 text-pink-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Full Lifecycle</p>
                      <p className="text-xs text-muted-foreground">Draft, test, review, and finalize. Each stage keeps your team aligned on what's next.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 dark:bg-white/5 border border-purple-100 dark:border-purple-900/30">
                    <ShoppingCart className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Auto Vendor Orders</p>
                      <p className="text-xs text-muted-foreground">Once finalized with a start date, ingredients auto-flow to your vendor purchase orders.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 dark:bg-white/5 border border-purple-100 dark:border-purple-900/30">
                    <Sparkles className="h-5 w-5 text-pink-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Jarvis Optimize</p>
                      <p className="text-xs text-muted-foreground">AI-powered recipe analysis finds cost savings while preserving flavor and quality.</p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => setCreateOpen(true)}
                  size="lg"
                  className="bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/20"
                  data-testid="button-new-special-empty"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create Your First Special
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <SpecialCard
                key={item.id}
                item={item}
                onClick={() => setDetailItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateSpecialDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        inventoryItems={inventoryItems}
      />

      {detailItem && (
        <SpecialDetailSheet
          itemId={detailItem}
          open={!!detailItem}
          onOpenChange={(open) => { if (!open) setDetailItem(null); }}
          inventoryItems={inventoryItems}
        />
      )}
    </div>
  );
}

function SpecialCard({ item, onClick }: { item: TestKitchenItem; onClick: () => void }) {
  const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft;
  const ingredients = (item.ingredients as Ingredient[]) || [];
  const margin = item.targetPrice && item.costPerUnit
    ? ((item.targetPrice - item.costPerUnit) / item.targetPrice * 100)
    : null;

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all hover:border-purple-300 dark:hover:border-purple-700 group"
      onClick={onClick}
      data-testid={`card-special-${item.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{item.title}</CardTitle>
            {item.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0 mt-1" />
        </div>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline" className="capitalize">{item.department}</Badge>
          <Badge className={`${statusConf.color} text-white`}>{statusConf.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Cost/Unit</p>
            <p className="text-sm font-semibold">
              {item.costPerUnit != null ? `$${item.costPerUnit.toFixed(2)}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="text-sm font-semibold">
              {item.targetPrice != null ? `$${item.targetPrice.toFixed(2)}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Margin</p>
            <p className={`text-sm font-semibold ${margin != null && margin > 0 ? "text-green-600" : margin != null ? "text-red-500" : ""}`}>
              {margin != null ? `${margin.toFixed(0)}%` : "—"}
            </p>
          </div>
        </div>
        {(item.startDate || item.endDate) && (
          <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {item.startDate && new Date(item.startDate).toLocaleDateString()}
            {item.startDate && item.endDate && " → "}
            {item.endDate && new Date(item.endDate).toLocaleDateString()}
          </div>
        )}
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Package className="h-3 w-3" />
          {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateSpecialDialog({
  open,
  onOpenChange,
  inventoryItems,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inventoryItems: InventoryItem[];
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("bar");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [method, setMethod] = useState<MethodStep[]>([]);
  const [yieldAmount, setYieldAmount] = useState<string>("");
  const [yieldUnit, setYieldUnit] = useState("servings");
  const [targetPrice, setTargetPrice] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/test-kitchen", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-kitchen"] });
      toast({ title: "Special created!", description: "Start adding details and testing." });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTitle("");
    setDepartment("bar");
    setDescription("");
    setIngredients([]);
    setMethod([]);
    setYieldAmount("");
    setYieldUnit("servings");
    setTargetPrice("");
  };

  const totalCost = ingredients.reduce((sum, ing) => {
    if (ing.inventoryItemId) {
      const inv = inventoryItems.find((i) => i.id === ing.inventoryItemId);
      if (inv?.costPerUnit) return sum + ing.quantity * inv.costPerUnit;
    }
    if (ing.costPerUnit) return sum + ing.quantity * ing.costPerUnit;
    return sum;
  }, 0);

  const ya = parseFloat(yieldAmount) || 0;
  const costPerUnit = ya > 0 ? totalCost / ya : 0;
  const tp = parseFloat(targetPrice) || 0;
  const margin = tp > 0 ? ((tp - costPerUnit) / tp) * 100 : 0;

  const addIngredient = () => {
    setIngredients([...ingredients, { name: "", quantity: 0, unit: "g", inventoryItemId: null, costPerUnit: null }]);
  };

  const updateIngredient = (index: number, updates: Partial<Ingredient>) => {
    const next = [...ingredients];
    next[index] = { ...next[index], ...updates };
    setIngredients(next);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const addMethodStep = () => setMethod([...method, ""]);
  const updateMethodStep = (i: number, val: string) => {
    const next = [...method];
    next[i] = val;
    setMethod(next);
  };
  const removeMethodStep = (i: number) => setMethod(method.filter((_, idx) => idx !== i));

  const handleSubmit = () => {
    if (!title.trim()) return toast({ title: "Title required", variant: "destructive" });
    createMutation.mutate({
      title: title.trim(),
      department,
      description: description.trim() || null,
      ingredients,
      method,
      yieldAmount: ya || null,
      yieldUnit,
      targetPrice: tp || null,
      totalCost: totalCost || null,
      costPerUnit: costPerUnit || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Create a New Special
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Lavender Honey Latte"
                data-testid="input-special-title"
              />
            </div>
            <div>
              <Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger data-testid="select-special-dept">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="bakery">Bakery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="6.50"
                data-testid="input-special-price"
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes this special... special?"
              rows={2}
              data-testid="input-special-description"
            />
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">Ingredients</Label>
              <Button size="sm" variant="outline" onClick={addIngredient} data-testid="button-add-ingredient">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, i) => (
                <IngredientRow
                  key={i}
                  ingredient={ing}
                  index={i}
                  inventoryItems={inventoryItems}
                  onChange={(updates) => updateIngredient(i, updates)}
                  onRemove={() => removeIngredient(i)}
                />
              ))}
              {ingredients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-lg">
                  No ingredients yet — click Add to start building
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">Method</Label>
              <Button size="sm" variant="outline" onClick={addMethodStep} data-testid="button-add-step">
                <Plus className="h-3 w-3 mr-1" /> Add Step
              </Button>
            </div>
            <div className="space-y-2">
              {method.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-6 text-center">{i + 1}</span>
                  <Input
                    value={step}
                    onChange={(e) => updateMethodStep(i, e.target.value)}
                    placeholder={`Step ${i + 1}...`}
                    data-testid={`input-method-step-${i}`}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeMethodStep(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Yield Amount</Label>
              <Input
                type="number"
                value={yieldAmount}
                onChange={(e) => setYieldAmount(e.target.value)}
                placeholder="e.g. 12"
                data-testid="input-special-yield"
              />
            </div>
            <div>
              <Label>Yield Unit</Label>
              <Select value={yieldUnit} onValueChange={setYieldUnit}>
                <SelectTrigger data-testid="select-special-yield-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="servings">Servings</SelectItem>
                  <SelectItem value="drinks">Drinks</SelectItem>
                  <SelectItem value="pieces">Pieces</SelectItem>
                  <SelectItem value="portions">Portions</SelectItem>
                  <SelectItem value="cups">Cups</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(totalCost > 0 || tp > 0) && (
            <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-purple-200 dark:border-purple-800">
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="text-lg font-bold" data-testid="text-total-cost">${totalCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cost/Unit</p>
                    <p className="text-lg font-bold" data-testid="text-cost-per-unit">
                      {costPerUnit > 0 ? `$${costPerUnit.toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className={`text-lg font-bold ${margin > 0 ? "text-green-600" : margin < 0 ? "text-red-500" : ""}`} data-testid="text-margin">
                      {tp > 0 && costPerUnit > 0 ? `${margin.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="bg-gradient-to-r from-purple-500 to-pink-500"
            data-testid="button-create-special"
          >
            {createMutation.isPending ? "Creating..." : "Create Special"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IngredientRow({
  ingredient,
  index,
  inventoryItems,
  onChange,
  onRemove,
}: {
  ingredient: Ingredient;
  index: number;
  inventoryItems: InventoryItem[];
  onChange: (updates: Partial<Ingredient>) => void;
  onRemove: () => void;
}) {
  const linkedItem = ingredient.inventoryItemId
    ? inventoryItems.find((i) => i.id === ingredient.inventoryItemId)
    : null;
  const lineCost = linkedItem?.costPerUnit
    ? ingredient.quantity * linkedItem.costPerUnit
    : ingredient.costPerUnit
    ? ingredient.quantity * ingredient.costPerUnit
    : null;

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border bg-card" data-testid={`ingredient-row-${index}`}>
      <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
      <Input
        value={ingredient.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Ingredient name"
        className="flex-1 min-w-0"
        data-testid={`input-ingredient-name-${index}`}
      />
      <Input
        type="number"
        step="0.01"
        value={ingredient.quantity || ""}
        onChange={(e) => onChange({ quantity: parseFloat(e.target.value) || 0 })}
        placeholder="Qty"
        className="w-20"
        data-testid={`input-ingredient-qty-${index}`}
      />
      <Select value={ingredient.unit} onValueChange={(v) => onChange({ unit: v })}>
        <SelectTrigger className="w-20" data-testid={`select-ingredient-unit-${index}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["g", "kg", "oz", "lb", "ml", "L", "fl oz", "each", "tsp", "tbsp", "cup"].map((u) => (
            <SelectItem key={u} value={u}>{u}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={ingredient.inventoryItemId?.toString() || "none"}
        onValueChange={(v) => {
          const id = v === "none" ? null : parseInt(v);
          const inv = id ? inventoryItems.find((i) => i.id === id) : null;
          onChange({ inventoryItemId: id, costPerUnit: inv?.costPerUnit || null });
        }}
      >
        <SelectTrigger className="w-36" data-testid={`select-ingredient-inventory-${index}`}>
          <SelectValue placeholder="Link item" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No link</SelectItem>
          {inventoryItems.map((inv) => (
            <SelectItem key={inv.id} value={inv.id.toString()}>
              {inv.name} {inv.costPerUnit != null ? `($${inv.costPerUnit.toFixed(2)}/${inv.unit})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm font-mono w-16 text-right flex-shrink-0" data-testid={`text-ingredient-cost-${index}`}>
        {lineCost != null ? `$${lineCost.toFixed(2)}` : "—"}
      </span>
      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onRemove}>
        <Trash2 className="h-3 w-3 text-red-400" />
      </Button>
    </div>
  );
}

function SpecialDetailSheet({
  itemId,
  open,
  onOpenChange,
  inventoryItems,
}: {
  itemId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inventoryItems: InventoryItem[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editIngredients, setEditIngredients] = useState<Ingredient[]>([]);
  const [editMethod, setEditMethod] = useState<MethodStep[]>([]);
  const [editDescription, setEditDescription] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [optimizeResults, setOptimizeResults] = useState<any>(null);

  useEffect(() => {
    setOptimizeResults(null);
  }, [itemId, open]);

  const { data: item, isLoading } = useQuery<TestKitchenItem & { notes: TestKitchenNote[] }>({
    queryKey: ["/api/test-kitchen", itemId],
    enabled: open,
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/test-kitchen/${itemId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-kitchen"] });
      toast({ title: "Updated!" });
      setEditing(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      if (newStatus === "finalized") {
        const res = await apiRequest("PATCH", `/api/test-kitchen/${itemId}/finalize`);
        return res.json();
      }
      const res = await apiRequest("PATCH", `/api/test-kitchen/${itemId}`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-kitchen"] });
      toast({ title: "Status updated!" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/test-kitchen/${itemId}/notes`, {
        content: noteContent.trim(),
        noteType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-kitchen", itemId] });
      setNoteContent("");
      toast({ title: "Note added!" });
    },
  });

  const costMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/test-kitchen/${itemId}/calculate-cost`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-kitchen"] });
      toast({ title: "Cost calculated", description: `Total: $${data.totalCost?.toFixed(2) || "0.00"}` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/test-kitchen/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-kitchen"] });
      onOpenChange(false);
      toast({ title: "Special deleted" });
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/test-kitchen/${itemId}/optimize`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setOptimizeResults(data);
    },
    onError: (err: any) => {
      toast({ title: "Optimization failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !item) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <div className="animate-pulse space-y-4 p-6">
            <div className="h-8 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-32 bg-muted rounded w-full" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft;
  const ingredients = (item.ingredients as Ingredient[]) || [];
  const methodSteps = (item.method as MethodStep[]) || [];
  const margin = item.targetPrice && item.costPerUnit
    ? ((item.targetPrice - item.costPerUnit) / item.targetPrice * 100)
    : null;

  const getUserName = (userId: string) => {
    const u = allUsers.find((usr: any) => usr.id === userId);
    return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username : "Unknown";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        <div className="p-6 space-y-6">
          <SheetHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <SheetTitle className="text-xl" data-testid="text-detail-title">{item.title}</SheetTitle>
                <div className="flex gap-2">
                  <Badge variant="outline" className="capitalize">{item.department}</Badge>
                  <Badge className={`${statusConf.color} text-white`}>{statusConf.label}</Badge>
                </div>
              </div>
            </div>
            {item.description && (
              <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
            )}
          </SheetHeader>

          {/* Cost Summary */}
          <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-purple-200 dark:border-purple-800">
            <CardContent className="p-4">
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="text-base font-bold">{item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost/Unit</p>
                  <p className="text-base font-bold">{item.costPerUnit != null ? `$${item.costPerUnit.toFixed(2)}` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="text-base font-bold">{item.targetPrice != null ? `$${item.targetPrice.toFixed(2)}` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Margin</p>
                  <p className={`text-base font-bold ${margin != null && margin > 0 ? "text-green-600" : margin != null ? "text-red-500" : ""}`}>
                    {margin != null ? `${margin.toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => costMutation.mutate()}
                  disabled={costMutation.isPending}
                  data-testid="button-recalculate-cost"
                >
                  <DollarSign className="h-3 w-3 mr-1" />
                  {costMutation.isPending ? "Calculating..." : "Recalculate Cost"}
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  onClick={() => optimizeMutation.mutate()}
                  disabled={optimizeMutation.isPending}
                  data-testid="button-jarvis-optimize"
                >
                  {optimizeMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Bot className="h-3 w-3 mr-1" />
                  )}
                  {optimizeMutation.isPending ? "Analyzing..." : "Jarvis Optimize"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {optimizeResults && (
            <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-950/20 dark:to-pink-950/20">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Jarvis Optimization</p>
                      <p className="text-xs text-muted-foreground">AI-powered recipe analysis</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOptimizeResults(null)}
                    data-testid="button-close-optimize"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {optimizeResults.summary && (
                  <p className="text-sm text-muted-foreground italic">{optimizeResults.summary}</p>
                )}

                <div className="space-y-3">
                  {(optimizeResults.recommendations || []).map((rec: any, i: number) => {
                    const typeIcons: Record<string, any> = {
                      substitution: Zap,
                      quantity: BarChart3,
                      technique: Beaker,
                      sourcing: ShoppingCart,
                      general: Lightbulb,
                    };
                    const TypeIcon = typeIcons[rec.type] || Lightbulb;
                    const qualityColors: Record<string, string> = {
                      none: "text-green-600",
                      minimal: "text-yellow-600",
                      improved: "text-emerald-600",
                    };

                    return (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-white/70 dark:bg-white/5 border border-purple-100 dark:border-purple-900/30 space-y-2"
                        data-testid={`optimize-recommendation-${i}`}
                      >
                        <div className="flex items-start gap-2">
                          <TypeIcon className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold">{rec.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{rec.explanation}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-6">
                          {rec.estimatedSavings && (
                            <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 dark:border-green-900">
                              <DollarSign className="h-3 w-3 mr-0.5" />
                              {rec.estimatedSavings}
                            </Badge>
                          )}
                          {rec.impactOnQuality && (
                            <span className={`text-[10px] font-medium ${qualityColors[rec.impactOnQuality] || "text-muted-foreground"}`}>
                              Quality: {rec.impactOnQuality}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ingredients & Method - Edit Toggle */}
          {!editing ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4" /> Ingredients
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditIngredients([...ingredients]);
                      setEditMethod([...methodSteps]);
                      setEditDescription(item.description || "");
                      setEditing(true);
                    }}
                    data-testid="button-edit-recipe"
                  >
                    Edit Recipe
                  </Button>
                </div>
                {ingredients.length > 0 ? (
                  <div className="space-y-1">
                    {ingredients.map((ing, i) => {
                      const linked = ing.inventoryItemId ? inventoryItems.find((inv) => inv.id === ing.inventoryItemId) : null;
                      const cost = linked?.costPerUnit ? ing.quantity * linked.costPerUnit : ing.costPerUnit ? ing.quantity * ing.costPerUnit : null;
                      return (
                        <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-muted/50" data-testid={`detail-ingredient-${i}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{ing.name}</span>
                            {linked && <Badge variant="outline" className="text-[10px] py-0 px-1">{linked.name}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span>{ing.quantity} {ing.unit}</span>
                            {cost != null && <span className="font-mono text-foreground">${cost.toFixed(2)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No ingredients added yet</p>
                )}
              </div>

              {methodSteps.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Method</h3>
                  <ol className="space-y-2">
                    {methodSteps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm" data-testid={`detail-method-step-${i}`}>
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4 p-4 rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  data-testid="input-edit-description"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">Ingredients</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditIngredients([...editIngredients, { name: "", quantity: 0, unit: "g", inventoryItemId: null, costPerUnit: null }])}
                    data-testid="button-edit-add-ingredient"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {editIngredients.map((ing, i) => (
                    <IngredientRow
                      key={i}
                      ingredient={ing}
                      index={i}
                      inventoryItems={inventoryItems}
                      onChange={(updates) => {
                        const next = [...editIngredients];
                        next[i] = { ...next[i], ...updates };
                        setEditIngredients(next);
                      }}
                      onRemove={() => setEditIngredients(editIngredients.filter((_, idx) => idx !== i))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">Method</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditMethod([...editMethod, ""])}
                    data-testid="button-edit-add-step"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Step
                  </Button>
                </div>
                <div className="space-y-2">
                  {editMethod.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-6 text-center">{i + 1}</span>
                      <Input
                        value={step}
                        onChange={(e) => {
                          const next = [...editMethod];
                          next[i] = e.target.value;
                          setEditMethod(next);
                        }}
                        placeholder={`Step ${i + 1}...`}
                        data-testid={`input-edit-method-step-${i}`}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditMethod(editMethod.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
                  onClick={() => updateMutation.mutate({ ingredients: editIngredients, method: editMethod, description: editDescription.trim() || null })}
                  disabled={updateMutation.isPending}
                  data-testid="button-save-recipe"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Recipe"}
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Schedule & Settings */}
          <DetailEditSection item={item} onSave={(data) => updateMutation.mutate(data)} saving={updateMutation.isPending} />

          <Separator />

          {/* Status Progression */}
          {statusConf.next && (
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
                onClick={() => statusMutation.mutate(statusConf.next!)}
                disabled={statusMutation.isPending}
                data-testid="button-advance-status"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                {statusConf.nextLabel}
              </Button>
            </div>
          )}

          {item.status !== "archived" && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => statusMutation.mutate("archived")}
              disabled={statusMutation.isPending}
              data-testid="button-archive"
            >
              Archive
            </Button>
          )}

          <Separator />

          {/* Collaboration Notes */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Lab Notes
            </h3>
            <div className="space-y-3 mb-4">
              {item.notes?.length > 0 ? (
                item.notes.map((note) => {
                  const ntConfig = NOTE_TYPES.find((t) => t.value === note.noteType);
                  const NtIcon = ntConfig?.icon || MessageSquare;
                  return (
                    <div key={note.id} className="p-3 rounded-lg border bg-card" data-testid={`note-${note.id}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <NtIcon className="h-3 w-3" />
                        <Badge variant="outline" className="text-[10px] py-0 capitalize">{note.noteType}</Badge>
                        <span className="text-xs text-muted-foreground">{getUserName(note.userId || "")}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {note.createdAt ? new Date(note.createdAt).toLocaleString() : ""}
                        </span>
                      </div>
                      <p className="text-sm">{note.content}</p>
                      {note.imageUrl && (
                        <img src={note.imageUrl} alt="" className="mt-2 rounded-lg max-h-48 object-cover" />
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No notes yet — be the first to share thoughts</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="w-32" data-testid="select-note-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Add a note..."
                  className="flex-1"
                  data-testid="input-note-content"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && noteContent.trim()) addNoteMutation.mutate();
                  }}
                />
                <Button
                  size="icon"
                  onClick={() => addNoteMutation.mutate()}
                  disabled={!noteContent.trim() || addNoteMutation.isPending}
                  data-testid="button-add-note"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {(user?.role === "owner" || user?.role === "manager") && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                if (confirm("Delete this special permanently?")) deleteMutation.mutate();
              }}
              data-testid="button-delete-special"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete Special
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailEditSection({
  item,
  onSave,
  saving,
}: {
  item: TestKitchenItem;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [startDate, setStartDate] = useState(
    item.startDate ? new Date(item.startDate).toISOString().split("T")[0] : ""
  );
  const [endDate, setEndDate] = useState(
    item.endDate ? new Date(item.endDate).toISOString().split("T")[0] : ""
  );
  const [leadDays, setLeadDays] = useState(String(item.orderLeadDays ?? 5));
  const [dailySales, setDailySales] = useState(String(item.anticipatedDailySales ?? ""));
  const [targetPrice, setTargetPrice] = useState(String(item.targetPrice ?? ""));
  const [yieldAmount, setYieldAmount] = useState(String(item.yieldAmount ?? ""));
  const [yieldUnit, setYieldUnit] = useState(item.yieldUnit || "servings");

  const hasChanges =
    startDate !== (item.startDate ? new Date(item.startDate).toISOString().split("T")[0] : "") ||
    endDate !== (item.endDate ? new Date(item.endDate).toISOString().split("T")[0] : "") ||
    leadDays !== String(item.orderLeadDays ?? 5) ||
    dailySales !== String(item.anticipatedDailySales ?? "") ||
    targetPrice !== String(item.targetPrice ?? "") ||
    yieldAmount !== String(item.yieldAmount ?? "") ||
    yieldUnit !== (item.yieldUnit || "servings");

  return (
    <div className="space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Calendar className="h-4 w-4" /> Schedule & Settings
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Start Date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-start-date" />
        </div>
        <div>
          <Label className="text-xs">End Date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-end-date" />
        </div>
        <div>
          <Label className="text-xs">Order Lead Days</Label>
          <Input type="number" value={leadDays} onChange={(e) => setLeadDays(e.target.value)} data-testid="input-lead-days" />
        </div>
        <div>
          <Label className="text-xs">Est. Daily Sales</Label>
          <Input type="number" value={dailySales} onChange={(e) => setDailySales(e.target.value)} data-testid="input-daily-sales" />
        </div>
        <div>
          <Label className="text-xs">Target Price ($)</Label>
          <Input type="number" step="0.01" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} data-testid="input-detail-price" />
        </div>
        <div>
          <Label className="text-xs">Yield Amount</Label>
          <Input type="number" value={yieldAmount} onChange={(e) => setYieldAmount(e.target.value)} data-testid="input-detail-yield" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Yield Unit</Label>
          <Select value={yieldUnit} onValueChange={setYieldUnit}>
            <SelectTrigger data-testid="select-detail-yield-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="servings">Servings</SelectItem>
              <SelectItem value="drinks">Drinks</SelectItem>
              <SelectItem value="pieces">Pieces</SelectItem>
              <SelectItem value="portions">Portions</SelectItem>
              <SelectItem value="cups">Cups</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {hasChanges && (
        <Button
          className="w-full"
          onClick={() =>
            onSave({
              startDate: startDate ? new Date(startDate).toISOString() : null,
              endDate: endDate ? new Date(endDate).toISOString() : null,
              orderLeadDays: parseInt(leadDays) || 5,
              anticipatedDailySales: parseInt(dailySales) || null,
              targetPrice: parseFloat(targetPrice) || null,
              yieldAmount: parseFloat(yieldAmount) || null,
              yieldUnit,
            })
          }
          disabled={saving}
          data-testid="button-save-settings"
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      )}
    </div>
  );
}
