import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, Pencil, Trash2, Package, X, Loader2,
  Search, ArrowUpDown, DollarSign, AlertTriangle, Clock, FileText
} from "lucide-react";
import type { InventoryItem } from "@shared/schema";

const CATEGORIES = ["Bakery", "Bar", "Kitchen", "FOH"] as const;

type SortField = "name" | "category" | "costPerUnit" | "lastUpdatedCost";
type SortDir = "asc" | "desc";

const itemFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  onHand: z.coerce.number().min(0).default(0),
});

export default function InventoryItems() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const isOwner = user?.role === "owner";

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [costFilter, setCostFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items"],
  });

  const form = useForm<z.infer<typeof itemFormSchema>>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { name: "", category: "", unit: "", onHand: 0 },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof itemFormSchema> & { aliases: string[] }) => {
      await apiRequest("POST", "/api/inventory-items", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Item added" });
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof itemFormSchema> & { aliases: string[] } }) => {
      await apiRequest("PUT", `/api/inventory-items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Item updated" });
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/inventory-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Item deleted" });
    },
  });

  function resetForm() {
    form.reset({ name: "", category: "", unit: "", onHand: 0 });
    setAliases([]);
    setAliasInput("");
    setEditItem(null);
    setDialogOpen(false);
  }

  function openEdit(item: InventoryItem) {
    setEditItem(item);
    form.reset({ name: item.name, category: item.category, unit: item.unit, onHand: item.onHand });
    setAliases(item.aliases || []);
    setDialogOpen(true);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function addAlias() {
    const trimmed = aliasInput.trim();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
    }
    setAliasInput("");
  }

  function removeAlias(idx: number) {
    setAliases(aliases.filter((_, i) => i !== idx));
  }

  function onSubmit(data: z.infer<typeof itemFormSchema>) {
    const payload = { ...data, aliases };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.aliases && i.aliases.some(a => a.toLowerCase().includes(q)))
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter(i => i.category === categoryFilter);
    }

    if (costFilter === "has_cost") {
      result = result.filter(i => i.costPerUnit != null);
    } else if (costFilter === "no_cost") {
      result = result.filter(i => i.costPerUnit == null);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "costPerUnit":
          cmp = (a.costPerUnit ?? -1) - (b.costPerUnit ?? -1);
          break;
        case "lastUpdatedCost":
          cmp = (a.lastUpdatedCost ? new Date(a.lastUpdatedCost).getTime() : 0) - (b.lastUpdatedCost ? new Date(b.lastUpdatedCost).getTime() : 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, searchQuery, categoryFilter, costFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = items.length;
    const withCost = items.filter(i => i.costPerUnit != null).length;
    const noCost = total - withCost;
    return { total, withCost, noCost };
  }, [items]);

  function formatCostDate(d: string | Date | null | undefined) {
    if (!d) return null;
    const date = new Date(d);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function costAge(d: string | Date | null | undefined): "fresh" | "stale" | "none" {
    if (!d) return "none";
    const diffDays = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 30) return "fresh";
    return "stale";
  }

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
      onClick={() => toggleSort(field)}
      data-testid={`sort-${field}`}
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortField === field ? "text-foreground" : "opacity-40"}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/inventory">
          <Button variant="ghost" size="icon" data-testid="button-back-inventory">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight" data-testid="text-items-title">INGREDIENT COST SHEET</h1>
          <p className="text-muted-foreground text-sm">All ingredients with current costs from vendor invoices</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="button-add-item">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editItem ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g., Bread Flour" data-testid="input-item-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit of Measure</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g., kg, lbs, each, case" data-testid="input-item-unit" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="onHand" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current On-Hand</FormLabel>
                    <FormControl><Input type="number" step="any" {...field} data-testid="input-item-onhand" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div>
                  <p className="text-sm font-medium mb-2">Invoice Aliases</p>
                  <p className="text-xs text-muted-foreground mb-2">Names this item might appear as on vendor invoices</p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={aliasInput}
                      onChange={(e) => setAliasInput(e.target.value)}
                      placeholder="Add an alias"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }}
                      data-testid="input-alias"
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addAlias} data-testid="button-add-alias">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {aliases.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {aliases.map((a, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          {a}
                          <button type="button" onClick={() => removeAlias(i)} className="ml-1">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-item">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editItem ? "Save Changes" : "Add Item"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Items</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-costed">{stats.withCost}</p>
              <p className="text-xs text-muted-foreground">With Cost</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-no-cost">{stats.noCost}</p>
              <p className="text-xs text-muted-foreground">Missing Cost</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search items or aliases..."
            data-testid="input-search-items"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={costFilter} onValueChange={setCostFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-cost">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Costs</SelectItem>
            <SelectItem value="has_cost">Has Cost</SelectItem>
            <SelectItem value="no_cost">Missing Cost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>{items.length === 0 ? 'No inventory items yet. Click "Add Item" to get started.' : "No items match your filters."}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3"><SortHeader field="name" label="Item" /></th>
                    <th className="text-left p-3"><SortHeader field="category" label="Category" /></th>
                    <th className="text-left p-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit</span>
                    </th>
                    <th className="text-right p-3"><SortHeader field="costPerUnit" label="Cost/Unit" /></th>
                    <th className="text-left p-3"><SortHeader field="lastUpdatedCost" label="Last Updated" /></th>
                    <th className="text-right p-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">On Hand</span>
                    </th>
                    <th className="text-right p-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(item => {
                    const age = costAge(item.lastUpdatedCost);
                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors" data-testid={`master-item-${item.id}`}>
                        <td className="p-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{item.name}</p>
                            {item.aliases && item.aliases.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]" title={item.aliases.join(", ")}>
                                aka: {item.aliases.join(", ")}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs font-normal">{item.category}</Badge>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground">{item.unit}</span>
                        </td>
                        <td className="p-3 text-right">
                          {item.costPerUnit != null ? (
                            <span className={`font-mono font-semibold text-sm ${age === "stale" ? "text-yellow-600" : ""}`} data-testid={`cost-${item.id}`}>
                              ${item.costPerUnit.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic" data-testid={`cost-${item.id}`}>—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {item.lastUpdatedCost ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className={`w-3 h-3 ${age === "stale" ? "text-yellow-500" : "text-muted-foreground"}`} />
                              <span className={`text-xs ${age === "stale" ? "text-yellow-600 font-medium" : "text-muted-foreground"}`} data-testid={`cost-date-${item.id}`}>
                                {formatCostDate(item.lastUpdatedCost)}
                              </span>
                              {age === "stale" && (
                                <AlertTriangle className="w-3 h-3 text-yellow-500" />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">never</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-mono text-sm">{item.onHand}</span>
                          <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)} data-testid={`button-edit-item-${item.id}`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {isOwner && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-item-${item.id}`}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Costs are automatically updated when vendor invoices are scanned. Items showing a warning icon have costs older than 30 days.
      </p>
    </div>
  );
}
