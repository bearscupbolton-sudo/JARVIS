import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocationContext } from "@/hooks/use-location-context";
import { useToast } from "@/hooks/use-toast";
import type { ProductionComponent, ComponentBom, ComponentTransaction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Plus, Minus, Settings, CheckCircle2, Package, Beaker, Cookie,
  Droplets, Layers, ChevronDown, ChevronUp, History, ClipboardCheck,
  AlertTriangle, TrendingUp, ArrowLeft
} from "lucide-react";
import { useLocation } from "wouter";

const CATEGORIES = [
  { value: "dough", label: "Dough", icon: Layers },
  { value: "batter", label: "Batter", icon: Beaker },
  { value: "filling", label: "Filling", icon: Droplets },
  { value: "topping", label: "Topping", icon: Package },
  { value: "cookie-dough", label: "Cookie Dough", icon: Cookie },
  { value: "other", label: "Other", icon: Package },
];

const UNITS = ["g", "kg", "oz", "lb", "each", "batch", "L", "mL", "qt"];

function categoryIcon(cat: string) {
  const c = CATEGORIES.find(c => c.value === cat);
  const Icon = c?.icon || Package;
  return <Icon className="h-4 w-4" />;
}

function levelColor(current: number, par: number | null, demand: number): string {
  if (demand > 0 && current < demand) return "text-red-600";
  if (par != null && current < par) return "text-yellow-600";
  return "text-green-600";
}

function levelBg(current: number, par: number | null, demand: number): string {
  if (demand > 0 && current < demand) return "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800";
  if (par != null && current < par) return "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800";
  return "";
}

type DashboardItem = ProductionComponent & { demandToday: number; shortfall: number; belowPar: boolean };

// =========== MAIN PAGE ===========
export default function PrepEQPage() {
  const [activeTab, setActiveTab] = useState("levels");
  const [, navigate] = useLocation();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button data-testid="button-back" variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Prep EQ</h1>
          <p className="text-sm text-muted-foreground">In-house component levels & production tracking</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger data-testid="tab-levels" value="levels">
            <Package className="h-4 w-4 mr-1" /> Levels
          </TabsTrigger>
          <TabsTrigger data-testid="tab-manage" value="manage">
            <Settings className="h-4 w-4 mr-1" /> Manage
          </TabsTrigger>
          <TabsTrigger data-testid="tab-closeout" value="closeout">
            <ClipboardCheck className="h-4 w-4 mr-1" /> Closeout
          </TabsTrigger>
        </TabsList>

        <TabsContent value="levels"><LevelsTab /></TabsContent>
        <TabsContent value="manage"><ManageTab /></TabsContent>
        <TabsContent value="closeout"><CloseoutTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// =========== LEVELS TAB ===========
function LevelsTab() {
  const { selectedLocationId } = useLocationContext();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: dashboard = [], isLoading } = useQuery<DashboardItem[]>({
    queryKey: ["/api/prep-eq/dashboard", selectedLocationId],
    queryFn: async () => {
      const params = selectedLocationId ? `?locationId=${selectedLocationId}` : "";
      const r = await fetch(`/api/prep-eq/dashboard${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const shortfalls = dashboard.filter(d => d.shortfall > 0);
  const belowPar = dashboard.filter(d => d.belowPar && d.shortfall === 0);
  const doughItems = dashboard.filter(d => d.category === "dough");

  return (
    <div className="space-y-4">
      {shortfalls.length > 0 && (
        <div data-testid="alert-shortfalls" className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="font-medium text-red-800 dark:text-red-200">
              {shortfalls.length} component{shortfalls.length > 1 ? "s" : ""} below today's demand
            </span>
          </div>
          <div className="text-sm text-red-700 dark:text-red-300">
            {shortfalls.map(s => s.name).join(", ")}
          </div>
        </div>
      )}

      {doughItems.length > 0 && <DoughRecommendations doughItems={doughItems} />}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : dashboard.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No components set up yet</p>
          <p className="text-sm">Go to Manage tab to add production components</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dashboard.map(item => (
            <ComponentLevelCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DoughRecommendations({ doughItems }: { doughItems: DashboardItem[] }) {
  const leadTimeItems = doughItems.filter(d => d.leadTimeDays > 0);
  if (leadTimeItems.length === 0) return null;

  return (
    <div data-testid="dough-recommendations" className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-5 w-5 text-blue-600" />
        <span className="font-medium text-blue-800 dark:text-blue-200">Dough Prep (for tomorrow)</span>
      </div>
      <div className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
        {leadTimeItems.map(d => {
          const piecesPerDough = d.piecesPerDough || 24;
          const needed = d.demandToday > 0 ? Math.ceil(d.demandToday / piecesPerDough) : 0;
          return (
            <div key={d.id} className="flex justify-between">
              <span>{d.name}</span>
              <span className="font-medium">
                {needed > 0 ? `${needed} dough${needed > 1 ? "s" : ""} needed` : "No demand set"}
                {d.piecesPerDough && <span className="text-xs ml-1">({d.piecesPerDough} pcs/dough)</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComponentLevelCard({ item, expanded, onToggle }: { item: DashboardItem; expanded: boolean; onToggle: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [adjustQty, setAdjustQty] = useState("");

  const adjustMut = useMutation({
    mutationFn: async (quantity: number) => {
      await apiRequest("POST", `/api/prep-eq/components/${item.id}/adjust`, { quantity, notes: "Quick adjustment" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq/dashboard"] });
      setAdjustQty("");
      toast({ title: "Level adjusted" });
    },
  });

  const parPct = item.parLevel ? Math.min(100, (item.currentLevel / item.parLevel) * 100) : null;

  return (
    <Card data-testid={`card-component-${item.id}`} className={`overflow-hidden border ${levelBg(item.currentLevel, item.parLevel, item.demandToday)}`}>
      <div className="p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={onToggle} data-testid={`button-toggle-component-${item.id}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              {categoryIcon(item.category)}
            </div>
            <div className="min-w-0">
              <span className="font-medium truncate block">{item.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{item.category}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-lg font-bold ${levelColor(item.currentLevel, item.parLevel, item.demandToday)}`}>
              {Math.round(item.currentLevel * 10) / 10}
            </div>
            <span className="text-xs text-muted-foreground">{item.unitOfMeasure}</span>
          </div>
        </div>

        {parPct !== null && (
          <div className="flex items-center gap-2">
            <Progress value={parPct} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Par: {item.parLevel}
            </span>
          </div>
        )}

        {item.demandToday > 0 && (
          <div className="flex justify-between text-xs mt-1">
            <span className="text-muted-foreground">Demand today:</span>
            <span className={item.shortfall > 0 ? "text-red-600 font-medium" : "text-green-600"}>
              {Math.round(item.demandToday * 10) / 10} {item.unitOfMeasure}
              {item.shortfall > 0 && ` (short ${Math.round(item.shortfall * 10) / 10})`}
            </span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t p-3 space-y-3">
          <div className="flex gap-2 items-center">
            <Button data-testid={`button-minus-${item.id}`} variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); adjustMut.mutate(-1); }}>
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              data-testid={`input-adjust-${item.id}`}
              type="number"
              placeholder="±"
              value={adjustQty}
              onChange={e => setAdjustQty(e.target.value)}
              className="w-20 h-8 text-center"
              onClick={e => e.stopPropagation()}
            />
            <Button data-testid={`button-plus-${item.id}`} variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); adjustMut.mutate(1); }}>
              <Plus className="h-3 w-3" />
            </Button>
            {adjustQty && (
              <Button data-testid={`button-apply-adjust-${item.id}`} size="sm" onClick={(e) => { e.stopPropagation(); adjustMut.mutate(Number(adjustQty)); }}>
                Apply
              </Button>
            )}
          </div>

          <TransactionHistory componentId={item.id} />
        </div>
      )}
    </Card>
  );
}

function TransactionHistory({ componentId }: { componentId: number }) {
  const { data: txns = [] } = useQuery<ComponentTransaction[]>({
    queryKey: ["/api/prep-eq/components", componentId, "transactions"],
    queryFn: async () => {
      const r = await fetch(`/api/prep-eq/components/${componentId}/transactions?limit=10`, { credentials: "include" });
      return r.json();
    },
  });

  if (txns.length === 0) return <p className="text-xs text-muted-foreground">No transactions yet</p>;

  return (
    <div>
      <h4 className="text-xs font-medium flex items-center gap-1 mb-1"><History className="h-3 w-3" /> Recent</h4>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {txns.map(t => (
          <div key={t.id} className="flex justify-between text-xs bg-muted/50 rounded px-2 py-1">
            <span className="truncate flex-1">
              <Badge variant="outline" className="text-[10px] mr-1">{t.type}</Badge>
              {t.notes || "—"}
            </span>
            <span className={`font-mono ml-2 ${t.quantity >= 0 ? "text-green-600" : "text-red-600"}`}>
              {t.quantity >= 0 ? "+" : ""}{Math.round(t.quantity * 10) / 10}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========== MANAGE TAB ===========
function ManageTab() {
  const { selectedLocationId } = useLocationContext();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editComponent, setEditComponent] = useState<ProductionComponent | null>(null);

  const { data: components = [], isLoading } = useQuery<ProductionComponent[]>({
    queryKey: ["/api/prep-eq/components", selectedLocationId],
    queryFn: async () => {
      const params = selectedLocationId ? `?locationId=${selectedLocationId}` : "";
      const r = await fetch(`/api/prep-eq/components${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const { user } = useAuth();
  const { toast } = useToast();
  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/prep-eq/components/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq/components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq/dashboard"] });
      toast({ title: "Component deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Add and configure production components</p>
        <Button data-testid="button-new-component" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Component
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : components.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No components yet</div>
      ) : (
        <div className="space-y-2">
          {components.map(c => (
            <Card key={c.id} data-testid={`manage-component-${c.id}`}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                    {categoryIcon(c.category)}
                  </div>
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="capitalize">{c.category}</span>
                      <span>{c.unitOfMeasure}</span>
                      {c.parLevel != null && <span>Par: {c.parLevel}</span>}
                      {c.yieldPerBatch && <span>Yield: {c.yieldPerBatch}/{c.unitOfMeasure}</span>}
                      {c.leadTimeDays > 0 && <Badge variant="secondary" className="text-[10px]">{c.leadTimeDays}d lead</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button data-testid={`button-edit-component-${c.id}`} variant="outline" size="sm" onClick={() => setEditComponent(c)}>Edit</Button>
                  {user?.role === "owner" && (
                    <Button data-testid={`button-delete-component-${c.id}`} variant="destructive" size="sm" onClick={() => deleteMut.mutate(c.id)}>Delete</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(showNewDialog || editComponent) && (
        <ComponentDialog
          component={editComponent}
          onClose={() => { setShowNewDialog(false); setEditComponent(null); }}
        />
      )}
    </div>
  );
}

function ComponentDialog({ component, onClose }: { component: ProductionComponent | null; onClose: () => void }) {
  const { toast } = useToast();
  const { selectedLocationId } = useLocationContext();
  const [form, setForm] = useState({
    name: component?.name || "",
    category: component?.category || "other",
    unitOfMeasure: component?.unitOfMeasure || "each",
    parLevel: component?.parLevel?.toString() || "",
    linkedRecipeId: component?.linkedRecipeId?.toString() || "",
    yieldPerBatch: component?.yieldPerBatch?.toString() || "",
    piecesPerDough: component?.piecesPerDough?.toString() || "",
    leadTimeDays: component?.leadTimeDays?.toString() || "0",
    shelfLifeDays: component?.shelfLifeDays?.toString() || "",
    locationId: component?.locationId?.toString() || selectedLocationId?.toString() || "",
    notes: component?.notes || "",
  });

  const { data: recipes = [] } = useQuery<any[]>({ queryKey: ["/api/recipes"] });
  const { data: locations } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name,
        category: form.category,
        unitOfMeasure: form.unitOfMeasure,
        parLevel: form.parLevel ? Number(form.parLevel) : undefined,
        linkedRecipeId: form.linkedRecipeId ? Number(form.linkedRecipeId) : undefined,
        yieldPerBatch: form.yieldPerBatch ? Number(form.yieldPerBatch) : undefined,
        piecesPerDough: form.piecesPerDough ? Number(form.piecesPerDough) : undefined,
        leadTimeDays: Number(form.leadTimeDays) || 0,
        shelfLifeDays: form.shelfLifeDays ? Number(form.shelfLifeDays) : undefined,
        locationId: form.locationId ? Number(form.locationId) : undefined,
        notes: form.notes || undefined,
      };
      if (component) await apiRequest("PATCH", `/api/prep-eq/components/${component.id}`, payload);
      else await apiRequest("POST", "/api/prep-eq/components", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq/components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq/dashboard"] });
      toast({ title: component ? "Component updated" : "Component added" });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{component ? "Edit Component" : "Add Component"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input data-testid="input-component-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger data-testid="select-component-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unitOfMeasure} onValueChange={v => setForm(f => ({ ...f, unitOfMeasure: v }))}>
                <SelectTrigger data-testid="select-component-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Par Level</Label>
              <Input data-testid="input-component-par" type="number" value={form.parLevel} onChange={e => setForm(f => ({ ...f, parLevel: e.target.value }))} />
            </div>
            <div>
              <Label>Lead Time (days)</Label>
              <Input data-testid="input-component-lead" type="number" value={form.leadTimeDays} onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Linked Recipe</Label>
            <Select value={form.linkedRecipeId} onValueChange={v => setForm(f => ({ ...f, linkedRecipeId: v === "none" ? "" : v }))}>
              <SelectTrigger data-testid="select-component-recipe"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {recipes.map((r: any) => <SelectItem key={r.id} value={r.id.toString()}>{r.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Yield per Batch</Label>
              <Input data-testid="input-component-yield" type="number" placeholder="Amount produced per recipe" value={form.yieldPerBatch} onChange={e => setForm(f => ({ ...f, yieldPerBatch: e.target.value }))} />
            </div>
            <div>
              <Label>Shelf Life (days)</Label>
              <Input data-testid="input-component-shelf" type="number" value={form.shelfLifeDays} onChange={e => setForm(f => ({ ...f, shelfLifeDays: e.target.value }))} />
            </div>
          </div>
          {form.category === "dough" && (
            <div>
              <Label>Pieces per Dough (manual override)</Label>
              <Input data-testid="input-component-pieces" type="number" placeholder="e.g. 24" value={form.piecesPerDough} onChange={e => setForm(f => ({ ...f, piecesPerDough: e.target.value }))} />
            </div>
          )}
          <div>
            <Label>Location</Label>
            <Select value={form.locationId} onValueChange={v => setForm(f => ({ ...f, locationId: v === "none" ? "" : v }))}>
              <SelectTrigger data-testid="select-component-location"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All Locations</SelectItem>
                {locations?.map((l: any) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea data-testid="input-component-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="button-save-component" onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}>
            {saveMut.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== CLOSEOUT TAB ===========
function CloseoutTab() {
  const { selectedLocationId } = useLocationContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const [closeoutMode, setCloseoutMode] = useState(false);
  const [closeoutItems, setCloseoutItems] = useState<{ componentId: number; name: string; previousLevel: number; reportedLevel: number; notes: string }[]>([]);
  const [closeoutNotes, setCloseoutNotes] = useState("");

  const { data: components = [] } = useQuery<ProductionComponent[]>({
    queryKey: ["/api/prep-eq/components", selectedLocationId],
    queryFn: async () => {
      const params = selectedLocationId ? `?locationId=${selectedLocationId}` : "";
      const r = await fetch(`/api/prep-eq/components${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const { data: closeouts = [] } = useQuery<any[]>({
    queryKey: ["/api/prep-eq/closeouts", selectedLocationId],
    queryFn: async () => {
      const params = selectedLocationId ? `?locationId=${selectedLocationId}` : "";
      const r = await fetch(`/api/prep-eq/closeouts${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/prep-eq/closeout", {
        notes: closeoutNotes || undefined,
        locationId: selectedLocationId || undefined,
        items: closeoutItems.map(i => ({
          componentId: i.componentId,
          reportedLevel: i.reportedLevel,
          previousLevel: i.previousLevel,
          notes: i.notes || undefined,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq/components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prep-eq/closeouts"] });
      toast({ title: "Closeout submitted" });
      setCloseoutMode(false);
    },
  });

  function startCloseout() {
    setCloseoutItems(components.map(c => ({
      componentId: c.id,
      name: c.name,
      previousLevel: c.currentLevel,
      reportedLevel: c.currentLevel,
      notes: "",
    })));
    setCloseoutMode(true);
  }

  if (closeoutMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" data-testid="text-closeout-title">End-of-Shift Closeout</h2>
          <Button variant="outline" onClick={() => setCloseoutMode(false)}>Cancel</Button>
        </div>
        <p className="text-sm text-muted-foreground">Confirm or adjust the current level for each component.</p>

        <div className="space-y-2">
          {closeoutItems.map((item, idx) => (
            <Card key={item.componentId} data-testid={`closeout-item-${item.componentId}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">Was: {Math.round(item.previousLevel * 10) / 10}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    data-testid={`input-closeout-level-${item.componentId}`}
                    type="number"
                    value={item.reportedLevel}
                    onChange={e => {
                      const updated = [...closeoutItems];
                      updated[idx] = { ...item, reportedLevel: Number(e.target.value) };
                      setCloseoutItems(updated);
                    }}
                    className="w-24"
                  />
                  {item.reportedLevel !== item.previousLevel && (
                    <Badge className={item.reportedLevel > item.previousLevel ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {item.reportedLevel > item.previousLevel ? "+" : ""}{Math.round((item.reportedLevel - item.previousLevel) * 10) / 10}
                    </Badge>
                  )}
                  <Input
                    placeholder="Note (optional)"
                    value={item.notes}
                    onChange={e => {
                      const updated = [...closeoutItems];
                      updated[idx] = { ...item, notes: e.target.value };
                      setCloseoutItems(updated);
                    }}
                    className="flex-1 text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <Label>Overall Notes</Label>
          <Textarea data-testid="input-closeout-notes" value={closeoutNotes} onChange={e => setCloseoutNotes(e.target.value)} rows={2} placeholder="Any notes about today's prep..." />
        </div>

        <Button data-testid="button-submit-closeout" className="w-full" size="lg" onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
          <CheckCircle2 className="h-5 w-5 mr-2" />
          {submitMut.isPending ? "Submitting..." : "Submit Closeout"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">End-of-shift level confirmation</p>
        <Button data-testid="button-start-closeout" onClick={startCloseout} disabled={components.length === 0}>
          <ClipboardCheck className="h-4 w-4 mr-1" /> Close Out Prep EQ
        </Button>
      </div>

      {closeouts.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recent Closeouts</h3>
          {closeouts.map((co: any) => (
            <Card key={co.id} data-testid={`closeout-${co.id}`}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">
                    {new Date(co.createdAt).toLocaleDateString()} at {new Date(co.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {co.notes && <p className="text-xs text-muted-foreground">{co.notes}</p>}
                </div>
                <Badge variant="outline">
                  <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" /> Closed
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">No closeouts yet</div>
      )}
    </div>
  );
}
