import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PendingChange } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ShieldCheck, Check, X, ChevronDown, ChevronRight, MessageSquare, ArrowRight } from "lucide-react";
import { format } from "date-fns";

type Ingredient = { name: string; quantity: number; unit: string; bakersPercentage?: number };
type Instruction = { step: number; text: string };

function ChangeDiff({ original, proposed, entityType }: {
  original: Record<string, any> | null;
  proposed: Record<string, any>;
  entityType: string;
}) {
  if (!original) {
    if (entityType === "recipe") {
      return (
        <div className="space-y-3">
          <DiffField label="Title" newVal={proposed.title as string} />
          {proposed.description && <DiffField label="Description" newVal={proposed.description as string} />}
          {proposed.category && <DiffField label="Category" newVal={proposed.category as string} />}
          {proposed.yieldAmount && (
            <DiffField label="Yield" newVal={`${proposed.yieldAmount} ${proposed.yieldUnit || ""}`} />
          )}
          {proposed.ingredients && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ingredients</span>
              <div className="space-y-1">
                {(proposed.ingredients as Ingredient[]).map((ing, i) => (
                  <div key={i} className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1">
                    + {ing.quantity} {ing.unit} {ing.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    if (entityType === "sop") {
      return (
        <div className="space-y-3">
          <DiffField label="Title" newVal={proposed.title as string} />
          {proposed.category && <DiffField label="Category" newVal={proposed.category as string} />}
          {proposed.content && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content</span>
              <div className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {(proposed.content as string).slice(0, 500)}{(proposed.content as string).length > 500 ? "..." : ""}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  if (entityType === "recipe") {
    return (
      <div className="space-y-3">
        {original.title !== proposed.title && (
          <DiffField label="Title" oldVal={original.title as string} newVal={proposed.title as string} />
        )}
        {original.description !== proposed.description && (
          <DiffField label="Description" oldVal={original.description as string} newVal={proposed.description as string} />
        )}
        {original.category !== proposed.category && (
          <DiffField label="Category" oldVal={original.category as string} newVal={proposed.category as string} />
        )}
        {(original.yieldAmount !== proposed.yieldAmount || original.yieldUnit !== proposed.yieldUnit) && (
          <DiffField
            label="Yield"
            oldVal={`${original.yieldAmount} ${original.yieldUnit || ""}`}
            newVal={`${proposed.yieldAmount} ${proposed.yieldUnit || ""}`}
          />
        )}
        <IngredientsDiff
          original={(original.ingredients as Ingredient[]) || []}
          proposed={(proposed.ingredients as Ingredient[]) || []}
        />
        <InstructionsDiff
          original={(original.instructions as Instruction[]) || []}
          proposed={(proposed.instructions as Instruction[]) || []}
        />
      </div>
    );
  }

  if (entityType === "sop") {
    return (
      <div className="space-y-3">
        {original.title !== proposed.title && (
          <DiffField label="Title" oldVal={original.title as string} newVal={proposed.title as string} />
        )}
        {original.category !== proposed.category && (
          <DiffField label="Category" oldVal={original.category as string} newVal={proposed.category as string} />
        )}
        {original.content !== proposed.content && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content Changed</span>
            <div className="text-sm bg-red-500/10 text-red-700 dark:text-red-400 rounded-md px-2 py-1 whitespace-pre-wrap max-h-24 overflow-y-auto line-through">
              {((original.content as string) || "").slice(0, 300)}{((original.content as string) || "").length > 300 ? "..." : ""}
            </div>
            <div className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1 whitespace-pre-wrap max-h-24 overflow-y-auto">
              {((proposed.content as string) || "").slice(0, 300)}{((proposed.content as string) || "").length > 300 ? "..." : ""}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function DiffField({ label, oldVal, newVal }: { label: string; oldVal?: string | null; newVal?: string | null }) {
  if (!oldVal && !newVal) return null;
  if (!oldVal) {
    return (
      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1">{newVal}</div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm bg-red-500/10 text-red-700 dark:text-red-400 rounded-md px-2 py-1 line-through">{oldVal}</span>
        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1">{newVal}</span>
      </div>
    </div>
  );
}

function IngredientsDiff({ original, proposed }: { original: Ingredient[]; proposed: Ingredient[] }) {
  const origMap = new Map(original.map(i => [i.name.toLowerCase(), i]));
  const propMap = new Map(proposed.map(i => [i.name.toLowerCase(), i]));

  const added = proposed.filter(i => !origMap.has(i.name.toLowerCase()));
  const removed = original.filter(i => !propMap.has(i.name.toLowerCase()));
  const changed = proposed.filter(i => {
    const orig = origMap.get(i.name.toLowerCase());
    return orig && (orig.quantity !== i.quantity || orig.unit !== i.unit);
  });

  if (added.length === 0 && removed.length === 0 && changed.length === 0) return null;

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ingredients</span>
      <div className="space-y-1">
        {removed.map((ing, i) => (
          <div key={`r-${i}`} className="text-sm bg-red-500/10 text-red-700 dark:text-red-400 rounded-md px-2 py-1 line-through">
            - {ing.quantity} {ing.unit} {ing.name}
          </div>
        ))}
        {changed.map((ing, i) => {
          const orig = origMap.get(ing.name.toLowerCase())!;
          return (
            <div key={`c-${i}`} className="text-sm flex items-center gap-2 flex-wrap">
              <span className="bg-red-500/10 text-red-700 dark:text-red-400 rounded-md px-2 py-1 line-through">
                {orig.quantity} {orig.unit} {orig.name}
              </span>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1">
                {ing.quantity} {ing.unit} {ing.name}
              </span>
            </div>
          );
        })}
        {added.map((ing, i) => (
          <div key={`a-${i}`} className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1">
            + {ing.quantity} {ing.unit} {ing.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function InstructionsDiff({ original, proposed }: { original: Instruction[]; proposed: Instruction[] }) {
  const maxLen = Math.max(original.length, proposed.length);
  const changes: { step: number; oldText?: string; newText?: string }[] = [];

  for (let i = 0; i < maxLen; i++) {
    const origText = original[i]?.text;
    const propText = proposed[i]?.text;
    if (origText !== propText) {
      changes.push({ step: i + 1, oldText: origText, newText: propText });
    }
  }

  if (changes.length === 0) return null;

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Instructions</span>
      <div className="space-y-1">
        {changes.map((c, i) => (
          <div key={i} className="text-sm space-y-1">
            <span className="text-xs text-muted-foreground">Step {c.step}:</span>
            {c.oldText && (
              <div className="bg-red-500/10 text-red-700 dark:text-red-400 rounded-md px-2 py-1 line-through">
                {c.oldText}
              </div>
            )}
            {c.newText && (
              <div className="bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1">
                {c.newText}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminApprovals() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: changes, isLoading } = useQuery<PendingChange[]>({
    queryKey: ["/api/pending-changes", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/pending-changes?status=${statusFilter}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/pending-changes/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-changes/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: "Change approved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to approve", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/pending-changes/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-changes/count"] });
      toast({ title: "Change rejected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reject", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="container-approvals">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-approvals">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground">Review and manage submitted changes</p>
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {(!changes || changes.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-approvals">
          No {statusFilter} approvals
        </div>
      ) : (
        <div className="grid gap-4">
          {changes.map((change) => {
            const payload = change.payload as Record<string, any>;
            const originalPayload = change.originalPayload as Record<string, any> | null;
            const title = (payload?.title as string) || null;
            const isExpanded = expandedId === change.id;

            return (
              <Card key={change.id} data-testid={`card-pending-${change.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{change.entityType}</Badge>
                        <Badge variant="secondary">{change.action}</Badge>
                        {change.status !== "pending" && (
                          <Badge variant={change.status === "approved" ? "default" : "destructive"}>
                            {change.status}
                          </Badge>
                        )}
                      </div>
                      {title && (
                        <p className="font-medium truncate">{title}</p>
                      )}
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        {change.submittedByUsername && (
                          <span>by {change.submittedByUsername}</span>
                        )}
                        {change.createdAt && (
                          <span>{format(new Date(change.createdAt), "MMM d, yyyy h:mm a")}</span>
                        )}
                      </div>

                      {change.changeReason && (
                        <div className="flex items-start gap-2 bg-muted/50 rounded-md p-2" data-testid={`text-change-reason-${change.id}`}>
                          <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-sm italic">"{change.changeReason}"</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedId(isExpanded ? null : change.id)}
                        data-testid={`button-expand-${change.id}`}
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </Button>

                      {statusFilter === "pending" && (
                        <>
                          <Button
                            variant="outline"
                            className="border-green-500/30 text-green-600 dark:text-green-400"
                            onClick={() => approveMutation.mutate(change.id)}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                            data-testid={`button-approve-${change.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            className="border-red-500/30 text-red-600 dark:text-red-400"
                            onClick={() => rejectMutation.mutate(change.id)}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                            data-testid={`button-reject-${change.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t pt-3 mt-2" data-testid={`diff-view-${change.id}`}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        {change.action === "create" ? "Proposed New Content" : "Changes"}
                      </p>
                      <ChangeDiff
                        original={originalPayload}
                        proposed={payload}
                        entityType={change.entityType}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
