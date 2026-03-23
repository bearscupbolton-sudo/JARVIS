import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, AlertCircle, CheckCircle, Edit } from "lucide-react";

type HeatmapItem = {
  id: number;
  name: string;
  category: string;
  unit: string;
  costPerUnit: number;
  lastUpdatedCost: string | null;
  regional: {
    id: number;
    matchedProduct: string;
    regionalAvgPrice: number | null;
    priceSource: string | null;
    lastUpdated: string | null;
    manualOverride: boolean;
  } | null;
  variance: number | null;
};

const DEPARTMENTS = [
  "All Departments",
  "bakery",
  "kitchen",
  "front_of_house",
  "admin",
  "marketing",
  "delivery",
  "maintenance",
];

function getHeatColor(variance: number | null): string {
  if (variance === null) return "bg-muted text-muted-foreground";
  if (variance <= -15) return "bg-green-600 text-white";
  if (variance <= -5) return "bg-green-400 text-green-950";
  if (variance <= 5) return "bg-yellow-300 text-yellow-950";
  if (variance <= 15) return "bg-orange-400 text-orange-950";
  return "bg-red-500 text-white";
}

function getVarianceIcon(variance: number | null) {
  if (variance === null) return <Minus className="h-3 w-3" />;
  if (variance < -2) return <TrendingDown className="h-3 w-3" />;
  if (variance > 2) return <TrendingUp className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

export default function PriceHeatmap() {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [selectedItem, setSelectedItem] = useState<HeatmapItem | null>(null);
  const [editProduct, setEditProduct] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<HeatmapItem[]>({
    queryKey: ["/api/price-heatmap"],
  });

  const fetchRegionalMutation = useMutation({
    mutationFn: async (itemIds: number[]) => {
      const res = await apiRequest("POST", "/api/price-heatmap/fetch-regional", { itemIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-heatmap"] });
      toast({ title: "Regional Pricing Updated", description: `Fetched pricing for ${data.fetched} items` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateRegionalMutation = useMutation({
    mutationFn: async ({ id, matchedProduct, regionalAvgPrice }: { id: number; matchedProduct: string; regionalAvgPrice?: number }) => {
      const res = await apiRequest("PATCH", `/api/price-heatmap/regional/${id}`, { matchedProduct, regionalAvgPrice });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-heatmap"] });
      setSelectedItem(null);
      toast({ title: "Updated", description: "Regional pricing corrected" });
    },
  });

  const refreshSingleMutation = useMutation({
    mutationFn: async ({ inventoryItemId, matchedProduct }: { inventoryItemId: number; matchedProduct: string }) => {
      const res = await apiRequest("POST", "/api/price-heatmap/refresh-single", { inventoryItemId, matchedProduct });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-heatmap"] });
      setSelectedItem(null);
      toast({ title: "Refreshed", description: "Regional price re-fetched with corrected product" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let result = items;
    if (deptFilter !== "All Departments") {
      result = result.filter(i => i.category.toLowerCase().includes(deptFilter.toLowerCase()));
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(s));
    }
    return result.sort((a, b) => {
      if (a.variance === null && b.variance === null) return a.name.localeCompare(b.name);
      if (a.variance === null) return 1;
      if (b.variance === null) return -1;
      return (b.variance) - (a.variance);
    });
  }, [items, search, deptFilter]);

  const missingRegional = items.filter(i => !i.regional);
  const aboveAvg = items.filter(i => i.variance !== null && i.variance > 5);
  const belowAvg = items.filter(i => i.variance !== null && i.variance < -5);
  const atAvg = items.filter(i => i.variance !== null && Math.abs(i.variance) <= 5);

  const handleFetchAll = () => {
    const ids = missingRegional.map(i => i.id);
    if (ids.length === 0) {
      toast({ title: "All items have regional pricing" });
      return;
    }
    fetchRegionalMutation.mutate(ids);
  };

  const handleRefreshAll = () => {
    const ids = items.map(i => i.id);
    fetchRegionalMutation.mutate(ids);
  };

  const openDetail = (item: HeatmapItem) => {
    setSelectedItem(item);
    setEditProduct(item.regional?.matchedProduct || item.name);
    setEditPrice(item.regional?.regionalAvgPrice?.toFixed(2) || "");
  };

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Price Heat Map</h1>
          <p className="text-sm text-muted-foreground">Compare your costs to regional wholesale averages</p>
        </div>
        <div className="flex gap-2">
          {missingRegional.length > 0 && (
            <Button
              onClick={handleFetchAll}
              disabled={fetchRegionalMutation.isPending}
              size="sm"
              data-testid="button-fetch-regional"
            >
              {fetchRegionalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Fetch Regional ({missingRegional.length})
            </Button>
          )}
          <Button
            onClick={handleRefreshAll}
            disabled={fetchRegionalMutation.isPending}
            size="sm"
            variant="outline"
            data-testid="button-refresh-all"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold" data-testid="text-total-items">{items.length}</div>
            <div className="text-xs text-muted-foreground">Total Items</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="text-below-avg">{belowAvg.length}</div>
            <div className="text-xs text-muted-foreground">Below Average</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-at-avg">{atAvg.length}</div>
            <div className="text-xs text-muted-foreground">Near Average</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-600" data-testid="text-above-avg">{aboveAvg.length}</div>
            <div className="text-xs text-muted-foreground">Above Average</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background"
          data-testid="select-department"
        >
          {DEPARTMENTS.map(d => (
            <option key={d} value={d}>
              {d === "All Departments" ? d : d.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1 text-xs">
        <span className="px-2 py-1 rounded bg-green-600 text-white">-15%+ Below</span>
        <span className="px-2 py-1 rounded bg-green-400 text-green-950">-5 to -15%</span>
        <span className="px-2 py-1 rounded bg-yellow-300 text-yellow-950">Near Avg (±5%)</span>
        <span className="px-2 py-1 rounded bg-orange-400 text-orange-950">+5 to +15%</span>
        <span className="px-2 py-1 rounded bg-red-500 text-white">+15%+ Above</span>
        <span className="px-2 py-1 rounded bg-muted text-muted-foreground">No Data</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No inventory items with costs found
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => openDetail(item)}
              className={`rounded-lg p-3 text-left transition-all hover:scale-105 hover:shadow-lg cursor-pointer ${getHeatColor(item.variance)}`}
              data-testid={`heatmap-cell-${item.id}`}
            >
              <div className="text-xs font-semibold truncate">{item.name}</div>
              <div className="text-lg font-bold mt-1">${Number(item.costPerUnit).toFixed(2)}</div>
              <div className="text-xs opacity-80">/{item.unit}</div>
              {item.variance !== null ? (
                <div className="flex items-center gap-1 mt-1 text-xs font-medium">
                  {getVarianceIcon(item.variance)}
                  {item.variance > 0 ? "+" : ""}{item.variance.toFixed(1)}%
                </div>
              ) : (
                <div className="text-xs mt-1 opacity-60 italic">No regional data</div>
              )}
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedItem?.name}</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Your Cost</div>
                  <div className="text-2xl font-bold">${Number(selectedItem.costPerUnit).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">per {selectedItem.unit}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Regional Avg</div>
                  <div className="text-2xl font-bold">
                    {selectedItem.regional?.regionalAvgPrice != null
                      ? `$${Number(selectedItem.regional.regionalAvgPrice).toFixed(2)}`
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">per {selectedItem.unit}</div>
                </div>
              </div>

              {selectedItem.variance !== null && (
                <div className={`rounded-lg p-3 text-center ${getHeatColor(selectedItem.variance)}`}>
                  <div className="text-lg font-bold flex items-center justify-center gap-1">
                    {getVarianceIcon(selectedItem.variance)}
                    {selectedItem.variance > 0 ? "+" : ""}{selectedItem.variance.toFixed(1)}% vs regional avg
                  </div>
                </div>
              )}

              {selectedItem.regional && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {selectedItem.regional.manualOverride ? "Manual Override" : "AI Estimate"}
                    </Badge>
                  </div>
                  {selectedItem.regional.priceSource && (
                    <p className="text-muted-foreground text-xs">{selectedItem.regional.priceSource}</p>
                  )}
                </div>
              )}

              <div className="border-t pt-3 space-y-3">
                <div className="text-sm font-medium flex items-center gap-1">
                  <Edit className="h-3 w-3" /> Correct Product Match
                </div>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Matched Product Description</Label>
                    <Input
                      value={editProduct}
                      onChange={(e) => setEditProduct(e.target.value)}
                      placeholder="e.g., Sysco Classic All-Purpose Flour 50lb"
                      data-testid="input-matched-product"
                    />
                  </div>
                  {selectedItem.regional && (
                    <div>
                      <Label className="text-xs">Regional Avg Price (optional override)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        placeholder="Leave blank to re-fetch"
                        data-testid="input-regional-price"
                      />
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="flex gap-2 flex-col sm:flex-row">
                {selectedItem.regional ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!selectedItem.regional) return;
                        updateRegionalMutation.mutate({
                          id: selectedItem.regional.id,
                          matchedProduct: editProduct,
                          regionalAvgPrice: editPrice ? parseFloat(editPrice) : undefined,
                        });
                      }}
                      disabled={updateRegionalMutation.isPending}
                      data-testid="button-save-override"
                    >
                      {updateRegionalMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                      Save Override
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        refreshSingleMutation.mutate({
                          inventoryItemId: selectedItem.id,
                          matchedProduct: editProduct,
                        });
                      }}
                      disabled={refreshSingleMutation.isPending}
                      data-testid="button-refetch-price"
                    >
                      {refreshSingleMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Re-fetch with Corrected Name
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      fetchRegionalMutation.mutate([selectedItem.id]);
                      setSelectedItem(null);
                    }}
                    disabled={fetchRegionalMutation.isPending}
                    data-testid="button-fetch-single"
                  >
                    {fetchRegionalMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Fetch Regional Price
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}