import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import {
  DollarSign,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Search,
  ArrowUpDown,
  ExternalLink,
  TrendingUp,
  Package,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  XCircle,
} from "lucide-react";
import type { PastryItem } from "@shared/schema";

type CostSummary = {
  totalCost: number | null;
  dataCompleteness: "full" | "partial" | "none";
};

type CostGap = {
  type: string;
  severity: "blocking" | "warning";
  message: string;
  fixPath?: string;
};

type GapDiagnosis = {
  pastryItemId: number;
  pastryName: string;
  hasPassport: boolean;
  passportId: number | null;
  gaps: CostGap[];
  blockingCount: number;
  warningCount: number;
  currentCost: number | null;
  dataCompleteness: "full" | "partial" | "none";
};

type SortKey = "name" | "cost_asc" | "cost_desc" | "completeness";
type FilterKey = "all" | "full" | "partial" | "none";

function CompletenessIcon({ status }: { status: "full" | "partial" | "none" }) {
  if (status === "full") return <CheckCircle2 className="w-4 h-4 text-green-600" />;
  if (status === "partial") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function CompletenessBadge({ status }: { status: "full" | "partial" | "none" }) {
  if (status === "full")
    return <Badge className="bg-green-100 text-green-800 border-0 text-xs">Complete</Badge>;
  if (status === "partial")
    return <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">Partial</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-0 text-xs">No data</Badge>;
}

function GapPanel({ item, onClose }: { item: PastryItem; onClose: () => void }) {
  const { data, isLoading } = useQuery<GapDiagnosis>({
    queryKey: [`/api/pastry-items/${item.id}/cost-gaps`],
    staleTime: 30_000,
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-muted-foreground" />
          Cost gaps — {item.name}
        </DialogTitle>
      </DialogHeader>

      {isLoading ? (
        <div className="space-y-3 py-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground py-4">Failed to load diagnosis.</p>
      ) : data.gaps.length === 0 ? (
        <div className="flex items-center gap-3 py-4 text-green-700">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium text-sm">No gaps found</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              All data is in place. Cost: ${data.currentCost?.toFixed(2) ?? "—"}/pc
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 py-2 max-h-96 overflow-y-auto pr-1">
          {data.gaps.map((gap, i) => (
            <div
              key={i}
              className={`flex gap-3 rounded-lg p-3 text-sm ${
                gap.severity === "blocking"
                  ? "bg-red-50 border border-red-100"
                  : "bg-yellow-50 border border-yellow-100"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {gap.severity === "blocking" ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`leading-snug ${gap.severity === "blocking" ? "text-red-800" : "text-yellow-800"}`}>
                  {gap.message}
                </p>
                {gap.fixPath && (
                  <Link href={gap.fixPath}>
                    <a
                      className="inline-flex items-center gap-1 text-xs mt-1.5 font-medium underline-offset-2 hover:underline text-primary"
                      onClick={onClose}
                    >
                      Fix this <ExternalLink className="w-3 h-3" />
                    </a>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.passportId && (
        <div className="border-t pt-3 mt-1">
          <Link href={`/pastry-passports/${data.passportId}`}>
            <a onClick={onClose}>
              <Button variant="outline" size="sm" className="w-full gap-2">
                Open Passport <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          </Link>
        </div>
      )}
    </DialogContent>
  );
}

type EnrichedItem = PastryItem & {
  costData?: CostSummary;
};

export default function PastryCostCenter() {
  const { user } = useAuth();
  const isOwnerOrManager = user?.role === "owner" || user?.role === "manager";

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cost_desc");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [diagItem, setDiagItem] = useState<PastryItem | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: items, isLoading: itemsLoading } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items"],
  });

  const { data: costs, isLoading: costsLoading } = useQuery<Record<number, CostSummary>>({
    queryKey: ["/api/pastry-items/costs"],
    enabled: isOwnerOrManager,
  });

  const { data: detailCost, isLoading: detailLoading } = useQuery<any>({
    queryKey: [`/api/pastry-items/${expandedId}/cost`],
    enabled: expandedId !== null,
    staleTime: 60_000,
  });

  const isLoading = itemsLoading || costsLoading;

  const enriched: EnrichedItem[] = (items || []).map(item => ({
    ...item,
    costData: costs?.[item.id],
  }));

  const fullCount = enriched.filter(i => i.costData?.dataCompleteness === "full").length;
  const partialCount = enriched.filter(i => i.costData?.dataCompleteness === "partial").length;
  const noneCount = enriched.filter(i => !i.costData || i.costData.dataCompleteness === "none").length;
  const costed = enriched.filter(i => i.costData?.totalCost != null);
  const avgCost = costed.length > 0
    ? costed.reduce((s, i) => s + (i.costData!.totalCost!), 0) / costed.length
    : null;

  const filtered = enriched
    .filter(item => {
      if (!item.isActive) return false;
      const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === "all" ||
        (filter === "full" && item.costData?.dataCompleteness === "full") ||
        (filter === "partial" && item.costData?.dataCompleteness === "partial") ||
        (filter === "none" && (!item.costData || item.costData.dataCompleteness === "none"));
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "cost_desc") {
        const ac = a.costData?.totalCost ?? -1;
        const bc = b.costData?.totalCost ?? -1;
        return bc - ac;
      }
      if (sortKey === "cost_asc") {
        const ac = a.costData?.totalCost ?? Infinity;
        const bc = b.costData?.totalCost ?? Infinity;
        return ac - bc;
      }
      if (sortKey === "completeness") {
        const rank = { full: 0, partial: 1, none: 2 };
        const ar = rank[a.costData?.dataCompleteness ?? "none"];
        const br = rank[b.costData?.dataCompleteness ?? "none"];
        return ar - br;
      }
      return 0;
    });

  if (!isOwnerOrManager) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Cost data is visible to managers and owners only.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/pastry-items">
          <a>
            <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" /> Master Pastry List
            </Button>
          </a>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="w-6 h-6" />
          Pastry Cost Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          COGS per piece for every active pastry. Fix gaps to unlock full costing.
        </p>
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Fully costed</p>
            <p className="text-2xl font-bold text-green-600">{fullCount}</p>
            <p className="text-xs text-muted-foreground">{enriched.length} total active</p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Partial data</p>
            <p className="text-2xl font-bold text-yellow-600">{partialCount}</p>
            <p className="text-xs text-muted-foreground">some ingredients missing</p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">No cost data</p>
            <p className="text-2xl font-bold text-red-500">{noneCount}</p>
            <p className="text-xs text-muted-foreground">needs passport or recipe</p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg COGS/pc</p>
            <p className="text-2xl font-bold">
              {avgCost != null ? `$${avgCost.toFixed(2)}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">across {costed.length} costed items</p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search pastries…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={filter} onValueChange={v => setFilter(v as FilterKey)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All items</SelectItem>
            <SelectItem value="full">Complete only</SelectItem>
            <SelectItem value="partial">Partial only</SelectItem>
            <SelectItem value="none">No data only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-44">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cost_desc">Cost: high → low</SelectItem>
            <SelectItem value="cost_asc">Cost: low → high</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="completeness">By completeness</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Item list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          No pastries match your filters.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const completeness = item.costData?.dataCompleteness ?? "none";
            const cost = item.costData?.totalCost;
            const isExpanded = expandedId === item.id;

            return (
              <Card
                key={item.id}
                className={`overflow-hidden transition-all ${
                  completeness === "full"
                    ? "border-green-100"
                    : completeness === "partial"
                    ? "border-yellow-100"
                    : "border-red-100"
                }`}
              >
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <CompletenessIcon status={completeness} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{item.name}</span>
                      <CompletenessBadge status={completeness} />
                      <span className="text-xs text-muted-foreground capitalize hidden sm:inline">
                        {item.doughType} · {item.department}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {cost != null ? (
                      <div>
                        <span className="font-mono font-semibold text-sm">${cost.toFixed(2)}</span>
                        <span className="text-xs text-muted-foreground ml-1">/pc</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {completeness !== "full" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => setDiagItem(item)}
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Fix gaps</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded breakdown */}
                {isExpanded && (
                  <div className="border-t bg-muted/30 px-4 py-4 space-y-3">
                    {detailLoading && expandedId === item.id ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-1/3" />
                      </div>
                    ) : !detailCost ? (
                      <p className="text-sm text-muted-foreground italic">No cost breakdown available.</p>
                    ) : (
                      <>
                        {/* Dough */}
                        {detailCost.doughCost?.costPerPiece != null && (
                          <CostLine
                            label={detailCost.doughCost.recipeName ?? "Mother dough"}
                            sub={detailCost.doughCost.doughGramsPerPiece ? `${detailCost.doughCost.doughGramsPerPiece}g/pc` : undefined}
                            cost={detailCost.doughCost.costPerPiece}
                          />
                        )}

                        {/* Lamination fat */}
                        {detailCost.laminationFatCost?.fatCostPerPiece != null && (
                          <CostLine
                            label={detailCost.laminationFatCost.fatDescription ?? "Lamination fat"}
                            sub={`${Math.round((detailCost.laminationFatCost.fatRatio ?? 0) * 100)}% fat ratio`}
                            cost={detailCost.laminationFatCost.fatCostPerPiece}
                          />
                        )}

                        {/* Add-ins */}
                        {detailCost.addinsCost?.items?.map((a: any, i: number) => (
                          a.totalCost != null && (
                            <CostLine
                              key={i}
                              label={a.name}
                              sub={a.weightPerPieceG ? `${a.weightPerPieceG}g/pc` : undefined}
                              cost={a.totalCost}
                            />
                          )
                        ))}

                        {/* Components */}
                        {detailCost.componentsCost?.items?.map((c: any, i: number) => (
                          c.totalCost != null && (
                            <CostLine
                              key={i}
                              label={c.recipeName}
                              sub={c.weightPerPieceG ? `${c.weightPerPieceG}g/pc` : undefined}
                              cost={c.totalCost}
                            />
                          )
                        ))}

                        {/* Total */}
                        {detailCost.totalCost != null && (
                          <div className="flex items-center justify-between pt-2 border-t font-semibold text-sm">
                            <span>Total COGS</span>
                            <span className="font-mono">${detailCost.totalCost.toFixed(2)}/pc</span>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          {detailCost.doughCost?.recipeId && (
                            <Link href={`/recipes/${detailCost.doughCost.recipeId}`}>
                              <a>
                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                  <Package className="w-3 h-3" /> Recipe
                                </Button>
                              </a>
                            </Link>
                          )}
                          <Link href={`/pastry-passports`}>
                            <a>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                <TrendingUp className="w-3 h-3" /> Passport
                              </Button>
                            </a>
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Gap diagnosis dialog */}
      <Dialog open={!!diagItem} onOpenChange={open => !open && setDiagItem(null)}>
        {diagItem && <GapPanel item={diagItem} onClose={() => setDiagItem(null)} />}
      </Dialog>
    </div>
  );
}

function CostLine({ label, sub, cost }: { label: string; sub?: string; cost: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-foreground truncate">{label}</span>
        {sub && <span className="text-xs text-muted-foreground flex-shrink-0">{sub}</span>}
      </div>
      <span className="font-mono text-muted-foreground flex-shrink-0">${cost.toFixed(2)}</span>
    </div>
  );
}
