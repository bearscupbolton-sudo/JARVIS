import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Settings2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Link2,
  Unlink,
  Loader2,
  ArrowRight,
  Sparkles,
  Database,
  Activity,
  AlertTriangle,
} from "lucide-react";
import type { PastryItem } from "@shared/schema";
import { useLocationContext } from "@/hooks/use-location-context";
import { Link } from "wouter";

type PipelineStep = { name: string; status: "complete" | "partial" | "missing"; current: number; total: number };
type PipelineHealth = { steps: PipelineStep[]; overallPct: number };

type SquareLocation = { id: string; name: string; address?: string; status: string };
type SquareCatalogItem = { id: string; name: string; description?: string; variations: { id: string; name: string }[] };
type CatalogMapping = { id: number; squareItemId: string; squareItemName: string; squareVariationId?: string; squareVariationName?: string; pastryItemName?: string; isActive: boolean };
type AutoMatchSuggestion = {
  squareItemId: string;
  squareItemName: string;
  squareVariationId: string | null;
  squareVariationName: string | null;
  pastryItemId: number;
  pastryItemName: string;
  confidence: "exact" | "likely" | "possible";
};

export default function SquareSettings() {
  const { toast } = useToast();
  const { selectedLocationId } = useLocationContext();
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [selectedSquareItem, setSelectedSquareItem] = useState<SquareCatalogItem | null>(null);
  const [selectedVariation, setSelectedVariation] = useState("");
  const [selectedPastry, setSelectedPastry] = useState("");
  const [showSmartMatchDialog, setShowSmartMatchDialog] = useState(false);
  const [smartMatchSuggestions, setSmartMatchSuggestions] = useState<AutoMatchSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  const { data: connectionTest, isLoading: testingConnection, refetch: retestConnection } = useQuery<{ success: boolean; locations: SquareLocation[]; error?: string }>({
    queryKey: ["/api/square/test"],
    retry: false,
    staleTime: 60000,
  });

  const { data: catalog, isLoading: loadingCatalog, isFetching: fetchingCatalog, refetch: refreshCatalog } = useQuery<SquareCatalogItem[]>({
    queryKey: ["/api/square/catalog"],
    enabled: !!connectionTest?.success,
    retry: false,
  });

  const { data: mappings, isLoading: loadingMappings } = useQuery<CatalogMapping[]>({
    queryKey: ["/api/square/catalog-map"],
  });

  const { data: pastryItems } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items"],
  });

  const createMappingMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/square/catalog-map", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/square/catalog-map"] });
      toast({ title: "Mapping created" });
      setShowMapDialog(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMappingMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PUT", `/api/square/catalog-map/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/square/catalog-map"] });
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/square/catalog-map/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/square/catalog-map"] });
      toast({ title: "Mapping removed" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (date: string) => apiRequest("POST", "/api/square/sync", { date, locationId: selectedLocationId }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/square/sales"] });
      toast({ title: "Sales synced", description: `${data.ordersProcessed} orders, ${data.itemsSynced} items` });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const { data: pipelineHealth, isLoading: loadingPipeline } = useQuery<PipelineHealth>({
    queryKey: ["/api/admin/pipeline-health"],
    staleTime: 30000,
  });

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/backfill-pastry-ids", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      const parts: string[] = [];
      for (const [table, info] of Object.entries(data as Record<string, { total: number; updated: number }>)) {
        if (info.updated > 0) parts.push(`${info.updated} ${table}`);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-health"] });
      toast({ title: "Backfill complete", description: parts.length > 0 ? `Updated: ${parts.join(", ")}` : "No records needed updating" });
    },
    onError: (err: Error) => toast({ title: "Backfill failed", description: err.message, variant: "destructive" }),
  });

  const autoMatchMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/square/catalog-map/auto-match", {}),
    onSuccess: async (res) => {
      const suggestions: AutoMatchSuggestion[] = await res.json();
      setSmartMatchSuggestions(suggestions);
      const initialSelected = new Set<string>();
      suggestions.forEach(s => {
        if (s.confidence === "exact" || s.confidence === "likely") {
          initialSelected.add(s.squareItemId);
        }
      });
      setSelectedSuggestions(initialSelected);
      setShowSmartMatchDialog(true);
    },
    onError: (err: Error) => toast({ title: "Smart Match failed", description: err.message, variant: "destructive" }),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (mappingsData: any) => apiRequest("POST", "/api/square/catalog-map/bulk", { mappings: mappingsData }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/square/catalog-map"] });
      toast({ title: "Mappings created", description: `${data.created} mappings added` });
      setShowSmartMatchDialog(false);
      setSmartMatchSuggestions([]);
      setSelectedSuggestions(new Set());
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openMapDialog(item: SquareCatalogItem) {
    setSelectedSquareItem(item);
    setSelectedVariation(item.variations[0]?.id || "");
    setSelectedPastry("");
    setShowMapDialog(true);
  }

  function handleCreateMapping() {
    if (!selectedSquareItem || !selectedPastry) return;
    const variation = selectedSquareItem.variations.find(v => v.id === selectedVariation);
    createMappingMutation.mutate({
      squareItemId: selectedSquareItem.id,
      squareItemName: selectedSquareItem.name,
      squareVariationId: variation?.id || null,
      squareVariationName: variation?.name || null,
      pastryItemName: selectedPastry,
    });
  }

  function toggleSuggestion(squareItemId: string) {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(squareItemId)) {
        next.delete(squareItemId);
      } else {
        next.add(squareItemId);
      }
      return next;
    });
  }

  function handleBulkConfirm() {
    const toCreate = smartMatchSuggestions
      .filter(s => selectedSuggestions.has(s.squareItemId))
      .map(s => ({
        squareItemId: s.squareItemId,
        squareItemName: s.squareItemName,
        squareVariationId: s.squareVariationId,
        squareVariationName: s.squareVariationName,
        pastryItemId: s.pastryItemId,
        pastryItemName: s.pastryItemName,
      }));
    if (toCreate.length === 0) return;
    bulkCreateMutation.mutate(toCreate);
  }

  function getConfidenceBadge(confidence: "exact" | "likely" | "possible") {
    switch (confidence) {
      case "exact":
        return <Badge variant="default" data-testid="badge-confidence-exact">Exact</Badge>;
      case "likely":
        return <Badge variant="secondary" data-testid="badge-confidence-likely">Likely</Badge>;
      case "possible":
        return <Badge variant="outline" data-testid="badge-confidence-possible">Possible</Badge>;
    }
  }

  const mappedSquareIds = new Set((mappings || []).map(m => m.squareItemId));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <Settings2 className="w-6 h-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Square POS Settings</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">Connection Status</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => retestConnection()}
            disabled={testingConnection}
            data-testid="button-test-connection"
          >
            {testingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1">Test</span>
          </Button>
        </CardHeader>
        <CardContent>
          {testingConnection ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Testing connection...
            </div>
          ) : connectionTest?.success ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium" data-testid="text-connection-status">Connected</span>
              </div>
              {connectionTest.locations.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Locations:</p>
                  {connectionTest.locations.map(loc => (
                    <div key={loc.id} className="text-sm flex items-center gap-2">
                      <Badge variant="secondary">{loc.status}</Badge>
                      <span>{loc.name}</span>
                      {loc.address && <span className="text-muted-foreground">- {loc.address}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              <span data-testid="text-connection-error">{connectionTest?.error || "Not connected"}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-pipeline-health">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Data Pipeline Health
          </CardTitle>
          {pipelineHealth && (
            <Badge variant={pipelineHealth.overallPct === 100 ? "default" : pipelineHealth.overallPct > 50 ? "secondary" : "destructive"} data-testid="badge-pipeline-pct">
              {pipelineHealth.overallPct}% Complete
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tracks every link in the chain from purchase to profit. All steps must be green for accurate KPI reporting and live inventory.
          </p>
          {loadingPipeline ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking pipeline...
            </div>
          ) : pipelineHealth ? (
            <div className="space-y-2">
              {pipelineHealth.steps.map(step => (
                <div key={step.name} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0" data-testid={`row-pipeline-${step.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="flex items-center gap-2">
                    {step.status === "complete" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : step.status === "partial" ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium">{step.name}</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs" data-testid={`text-pipeline-count-${step.name.toLowerCase().replace(/\s+/g, "-")}`}>
                    {step.current}/{step.total}
                  </Badge>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
              data-testid="button-backfill-pastry-ids"
            >
              {backfillMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Database className="w-4 h-4 mr-1" />}
              Backfill Data Links
            </Button>
            <Link href="/pastry-passports">
              <Button variant="outline" size="sm" data-testid="link-pastry-passports">
                Pastry Passports
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">Quick Sync</CardTitle>
          <Button
            variant="default"
            size="sm"
            onClick={() => syncMutation.mutate(new Date().toISOString().split("T")[0])}
            disabled={syncMutation.isPending || !connectionTest?.success}
            data-testid="button-sync-today"
          >
            {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1">Sync Today</span>
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Pull today's completed orders from Square and aggregate sales data per item.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">Catalog Mapping</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="default"
              size="sm"
              onClick={() => autoMatchMutation.mutate()}
              disabled={autoMatchMutation.isPending || !connectionTest?.success}
              data-testid="button-smart-match"
            >
              {autoMatchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="ml-1">Smart Match</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refreshCatalog();
                toast({ title: "Refreshing catalog from Square..." });
              }}
              disabled={fetchingCatalog || !connectionTest?.success}
              data-testid="button-refresh-catalog"
            >
              {fetchingCatalog ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1">Refresh Catalog</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Link Square POS items to your master pastry list for accurate sales tracking and forecasting.
          </p>

          {loadingMappings ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading mappings...
            </div>
          ) : (mappings || []).length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Mappings</p>
              {(mappings || []).map(m => (
                <div key={m.id} className="flex items-center gap-2 p-2 rounded-md border flex-wrap" data-testid={`row-mapping-${m.id}`}>
                  <Badge variant={m.isActive ? "default" : "secondary"}>
                    {m.squareItemName}
                    {m.squareVariationName ? ` (${m.squareVariationName})` : ""}
                  </Badge>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm">{m.pastryItemName || "Unmapped"}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleMappingMutation.mutate({ id: m.id, isActive: !m.isActive })}
                      data-testid={`button-toggle-mapping-${m.id}`}
                    >
                      {m.isActive ? <Link2 className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMappingMutation.mutate(m.id)}
                      data-testid={`button-delete-mapping-${m.id}`}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {fetchingCatalog && (
            <div className="flex items-center gap-2 text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading Square catalog items...
            </div>
          )}

          {catalog && catalog.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unmapped Square Items</p>
              {catalog.filter(item => !mappedSquareIds.has(item.id)).map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded-md border flex-wrap" data-testid={`row-square-item-${item.id}`}>
                  <span className="text-sm font-medium">{item.name}</span>
                  {item.variations.length > 1 && (
                    <Badge variant="secondary">{item.variations.length} variants</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => openMapDialog(item)}
                    data-testid={`button-map-item-${item.id}`}
                  >
                    <Link2 className="w-4 h-4 mr-1" /> Map
                  </Button>
                </div>
              ))}
              {catalog.filter(item => !mappedSquareIds.has(item.id)).length === 0 && (
                <p className="text-sm text-muted-foreground">All Square items are mapped.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showMapDialog} onOpenChange={setShowMapDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Map Square Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Square Item</Label>
              <p className="text-sm font-medium">{selectedSquareItem?.name}</p>
            </div>
            {selectedSquareItem && selectedSquareItem.variations.length > 1 && (
              <div>
                <Label>Variation</Label>
                <Select value={selectedVariation} onValueChange={setSelectedVariation}>
                  <SelectTrigger data-testid="select-variation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSquareItem.variations.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Pastry Item</Label>
              <Select value={selectedPastry} onValueChange={setSelectedPastry}>
                <SelectTrigger data-testid="select-pastry-item">
                  <SelectValue placeholder="Select pastry item..." />
                </SelectTrigger>
                <SelectContent>
                  {(pastryItems || []).map(p => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMapDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateMapping}
              disabled={!selectedPastry || createMappingMutation.isPending}
              data-testid="button-confirm-mapping"
            >
              {createMappingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Create Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSmartMatchDialog} onOpenChange={setShowSmartMatchDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Smart Match Results</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {smartMatchSuggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-matches">
                No matches found. All Square items may already be mapped, or no pastry items match.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Found {smartMatchSuggestions.length} potential match{smartMatchSuggestions.length !== 1 ? "es" : ""}.
                  Review and confirm the mappings below.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSuggestions(new Set(smartMatchSuggestions.map(s => s.squareItemId)))}
                    data-testid="button-select-all"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSuggestions(new Set())}
                    data-testid="button-deselect-all"
                  >
                    Deselect All
                  </Button>
                </div>
                {smartMatchSuggestions.map(s => (
                  <div
                    key={s.squareItemId}
                    className="flex items-center gap-3 p-3 rounded-md border"
                    data-testid={`row-suggestion-${s.squareItemId}`}
                  >
                    <Checkbox
                      checked={selectedSuggestions.has(s.squareItemId)}
                      onCheckedChange={() => toggleSuggestion(s.squareItemId)}
                      data-testid={`checkbox-suggestion-${s.squareItemId}`}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{s.squareItemName}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{s.pastryItemName}</span>
                      </div>
                      {s.squareVariationName && (
                        <p className="text-xs text-muted-foreground">Variation: {s.squareVariationName}</p>
                      )}
                    </div>
                    {getConfidenceBadge(s.confidence)}
                  </div>
                ))}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmartMatchDialog(false)}>Cancel</Button>
            {smartMatchSuggestions.length > 0 && (
              <Button
                onClick={handleBulkConfirm}
                disabled={selectedSuggestions.size === 0 || bulkCreateMutation.isPending}
                data-testid="button-confirm-bulk-mapping"
              >
                {bulkCreateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Create {selectedSuggestions.size} Mapping{selectedSuggestions.size !== 1 ? "s" : ""}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}