import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Croissant,
  Cookie,
  ToggleLeft,
  ToggleRight,
  Stamp,
  ExternalLink,
  CakeSlice,
  Coffee,
  UtensilsCrossed,
  Settings2,
} from "lucide-react";
import type { PastryItem, PastryPassport, InventoryItem, DoughTypeConfig } from "@shared/schema";

const CATEGORY_OPTIONS = ["Croissant", "Danish", "Cookies", "Cake", "Bread", "Other"];
const DEPARTMENT_OPTIONS = ["bakery", "kitchen", "bar"];

const CATEGORY_ICONS: Record<string, any> = {
  "Croissant": Croissant,
  "Danish": Cookie,
  "Cookies": Cookie,
  "Cake": CakeSlice,
  "Bread": UtensilsCrossed,
  "Coffee": Coffee,
};

export default function PastryItems() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<PastryItem | null>(null);
  const [name, setName] = useState("");
  const [doughType, setDoughType] = useState("");
  const [department, setDepartment] = useState("bakery");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [fatConfigType, setFatConfigType] = useState<string | null>(null);
  const [fatRatio, setFatRatio] = useState("");
  const [fatItemId, setFatItemId] = useState<string>("");
  const [fatDescription, setFatDescription] = useState("");
  const [baseDoughWeightG, setBaseDoughWeightG] = useState("");

  const { data: items, isLoading } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items"],
  });

  const { data: passports } = useQuery<PastryPassport[]>({
    queryKey: ["/api/pastry-passports"],
  });

  const { data: costs } = useQuery<Record<number, { totalCost: number | null; dataCompleteness: "full" | "partial" | "none" }>>({
    queryKey: ["/api/pastry-items/costs"],
  });

  const { data: doughTypeConfigsList } = useQuery<DoughTypeConfig[]>({
    queryKey: ["/api/dough-type-configs"],
  });

  const { data: inventoryItemsList } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const doughTypeConfigMap = new Map<string, DoughTypeConfig>();
  doughTypeConfigsList?.forEach(c => doughTypeConfigMap.set(c.doughType, c));

  const passportByItemId = new Map<number, PastryPassport>();
  passports?.forEach(p => {
    if (p.pastryItemId) passportByItemId.set(p.pastryItemId, p);
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; doughType: string; department: string }) =>
      apiRequest("POST", "/api/pastry-items", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-items"] });
      toast({ title: "Pastry added" });
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<PastryItem> }) =>
      apiRequest("PATCH", `/api/pastry-items/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-items"] });
      toast({ title: "Pastry updated" });
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/pastry-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-items"] });
      toast({ title: "Pastry removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const fatConfigMutation = useMutation({
    mutationFn: (data: { doughType: string; fatRatio: number | null; fatInventoryItemId: number | null; fatDescription: string | null; baseDoughWeightG: number | null }) =>
      apiRequest("PUT", "/api/dough-type-configs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dough-type-configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-items/costs"] });
      toast({ title: "Butter/fat config saved" });
      setFatConfigType(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openFatConfig(dt: string) {
    const existing = doughTypeConfigMap.get(dt);
    setFatConfigType(dt);
    setFatRatio(existing?.fatRatio != null ? String(Math.round(existing.fatRatio * 100)) : "");
    setFatItemId(existing?.fatInventoryItemId != null ? String(existing.fatInventoryItemId) : "");
    setFatDescription(existing?.fatDescription || "");
    setBaseDoughWeightG(existing?.baseDoughWeightG != null ? String(existing.baseDoughWeightG) : "");
  }

  function saveFatConfig() {
    if (!fatConfigType) return;
    const ratio = fatRatio ? parseFloat(fatRatio) / 100 : null;
    fatConfigMutation.mutate({
      doughType: fatConfigType,
      fatRatio: ratio,
      fatInventoryItemId: fatItemId ? parseInt(fatItemId) : null,
      fatDescription: fatDescription.trim() || null,
      baseDoughWeightG: baseDoughWeightG ? parseFloat(baseDoughWeightG) : null,
    });
  }

  function resetForm() {
    setShowAdd(false);
    setEditItem(null);
    setName("");
    setDoughType("");
    setDepartment("bakery");
  }

  function openEdit(item: PastryItem) {
    setEditItem(item);
    setName(item.name);
    setDoughType(item.doughType);
    setDepartment(item.department || "bakery");
    setShowAdd(true);
  }

  function handleSubmit() {
    if (!name.trim() || !doughType) return;
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, updates: { name: name.trim(), doughType, department } });
    } else {
      createMutation.mutate({ name: name.trim(), doughType, department });
    }
  }

  function toggleActive(item: PastryItem) {
    updateMutation.mutate({ id: item.id, updates: { isActive: !item.isActive } });
  }

  const deptFiltered = items?.filter(i => filterDept === "all" || (i.department || "bakery") === filterDept) || [];
  const filtered = deptFiltered.filter(i => filterType === "all" || i.doughType === filterType);

  const allCategories = Array.from(new Set(deptFiltered.map(i => i.doughType))).sort();
  const filterCategories = allCategories.length > 0 ? allCategories : CATEGORY_OPTIONS;

  const groupedItems = (filterType === "all" ? allCategories : [filterType])
    .map(cat => ({
      label: cat,
      items: filtered.filter(i => i.doughType === cat),
      icon: CATEGORY_ICONS[cat] || UtensilsCrossed,
    }))
    .filter(g => g.items.length > 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" data-testid="container-pastry-items">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="text-pastry-items-title">
            Master Pastry List
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage all your pastries. This list is used across the entire system.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowAdd(true); }} data-testid="button-add-pastry">
          <Plus className="w-4 h-4 mr-2" />
          Add Pastry
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", ...DEPARTMENT_OPTIONS].map((dept) => (
          <Button
            key={dept}
            variant={filterDept === dept ? "default" : "outline"}
            size="sm"
            onClick={() => { setFilterDept(dept); setFilterType("all"); }}
            data-testid={`filter-dept-${dept}`}
          >
            {dept === "all" ? "All Departments" : dept.charAt(0).toUpperCase() + dept.slice(1)}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", ...filterCategories].map((type) => (
          <Button
            key={type}
            variant={filterType === type ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilterType(type)}
            data-testid={`filter-${type.toLowerCase()}`}
          >
            {type === "all" ? "All Categories" : type}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No pastries configured yet. Click "Add Pastry" to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {groupedItems.map(({ label, items: groupItems, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
                <Icon className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="text-lg">{label}</CardTitle>
                {doughTypeConfigMap.get(label)?.fatRatio && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round((doughTypeConfigMap.get(label)!.fatRatio || 0) * 100)}% butter
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openFatConfig(label)}
                    data-testid={`button-fat-config-${label}`}
                    title="Configure lamination fat/butter"
                  >
                    <Settings2 className="w-4 h-4" />
                  </Button>
                  <Badge variant="secondary">{groupItems.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {groupItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No pastries yet</p>
                ) : (
                  <div className="space-y-2">
                    {groupItems.map((item) => {
                      const linkedPassport = passportByItemId.get(item.id);
                      const costData = costs?.[item.id];
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 p-2 rounded-md border ${
                            item.isActive ? "" : "opacity-50"
                          }`}
                          data-testid={`pastry-item-${item.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium" data-testid={`pastry-name-${item.id}`}>
                              {item.name}
                            </span>
                            {costData && costData.totalCost != null ? (
                              <span className="ml-2 text-xs text-muted-foreground" data-testid={`cost-estimate-${item.id}`}>
                                est. ${costData.totalCost.toFixed(2)}
                              </span>
                            ) : (
                              <span className="ml-2 text-xs text-muted-foreground" data-testid={`cost-estimate-${item.id}`}>
                                —
                              </span>
                            )}
                          </div>
                          {linkedPassport ? (
                            <Link href={`/pastry-passports/${linkedPassport.id}`}>
                              <Badge variant="secondary" className="gap-1 cursor-pointer text-xs" data-testid={`badge-passport-${item.id}`}>
                                <Stamp className="w-3 h-3" /> Passport
                                <ExternalLink className="w-3 h-3" />
                              </Badge>
                            </Link>
                          ) : (
                            <Link href={`/pastry-passports?createFor=${item.id}`}>
                              <Badge variant="outline" className="gap-1 cursor-pointer text-xs text-muted-foreground" data-testid={`badge-no-passport-${item.id}`}>
                                <Plus className="w-3 h-3" /> Add Passport
                              </Badge>
                            </Link>
                          )}
                          {!item.isActive && (
                            <Badge variant="outline" className="text-xs">Inactive</Badge>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleActive(item)}
                            data-testid={`toggle-active-${item.id}`}
                          >
                            {item.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(item)}
                            data-testid={`edit-pastry-${item.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(item.id)}
                            data-testid={`delete-pastry-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!fatConfigType} onOpenChange={(open) => { if (!open) setFatConfigType(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Butter/Fat Config — {fatConfigType}</DialogTitle>
            <DialogDescription>
              Configure the lamination fat (butter sheet) that gets rolled into this dough type after the recipe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-2 block">Fat Ratio (% of dough weight)</label>
              <Input
                type="number"
                placeholder="e.g. 27"
                value={fatRatio}
                onChange={(e) => setFatRatio(e.target.value)}
                min={0}
                max={100}
                data-testid="input-fat-ratio"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Typically 27% for croissant/danish (butter sheet weight as % of total dough)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Butter/Fat Inventory Item</label>
              <Select value={fatItemId} onValueChange={setFatItemId}>
                <SelectTrigger data-testid="select-fat-inventory-item">
                  <SelectValue placeholder="Select inventory item..." />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItemsList?.map((inv) => (
                    <SelectItem key={inv.id} value={String(inv.id)}>
                      {inv.name} {inv.costPerUnit != null ? `($${inv.costPerUnit.toFixed(2)}/${inv.unit})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description (optional)</label>
              <Input
                placeholder="e.g. French Butter Sheets"
                value={fatDescription}
                onChange={(e) => setFatDescription(e.target.value)}
                data-testid="input-fat-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Base Dough Weight (g)</label>
              <Input
                type="number"
                placeholder="e.g. 4700"
                value={baseDoughWeightG}
                onChange={(e) => setBaseDoughWeightG(e.target.value)}
                min={0}
                data-testid="input-base-dough-weight"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Starting dough weight before butter (auto-fills total weight in shaping)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFatConfigType(null)}>Cancel</Button>
            <Button
              onClick={saveFatConfig}
              disabled={fatConfigMutation.isPending}
              data-testid="button-save-fat-config"
            >
              {fatConfigMutation.isPending ? "Saving..." : "Save Config"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Pastry" : "Add Pastry"}</DialogTitle>
            <DialogDescription>
              {editItem ? "Update the pastry details." : "Add a new pastry to the master list."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-2 block">Pastry Name</label>
              <Input
                placeholder="e.g. Pain au Chocolat"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-pastry-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Department</label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger data-testid="select-department">
                  <SelectValue placeholder="Select department..." />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <Select value={doughType} onValueChange={(val) => { if (val !== "__custom__") setDoughType(val); else setDoughType(""); }}>
                <SelectTrigger data-testid="select-dough-type">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...CATEGORY_OPTIONS, ...allCategories])].map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {!CATEGORY_OPTIONS.includes(doughType) && !allCategories.includes(doughType) && (
                <Input
                  className="mt-2"
                  placeholder="Type a custom category..."
                  value={doughType}
                  onChange={(e) => setDoughType(e.target.value)}
                  data-testid="input-custom-dough-type"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || !doughType || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-pastry"
            >
              {editItem ? "Save Changes" : "Add Pastry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
