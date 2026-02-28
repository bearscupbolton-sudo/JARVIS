import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bug, Lightbulb, Sparkles, Trash2, ChevronDown, ChevronRight,
  Loader2, Code2, Filter,
} from "lucide-react";

type FeedbackItem = {
  id: number;
  type: string;
  title: string;
  description: string;
  category: string | null;
  priority: string | null;
  status: string;
  pagePath: string | null;
  userId: string | null;
  aiSummary: string | null;
  metadata: any;
  createdAt: string | null;
  submitter: { firstName: string | null; lastName: string | null; username: string | null } | null;
};

const TYPE_CONFIG: Record<string, { icon: typeof Bug; color: string; bg: string }> = {
  bug: { icon: Bug, color: "text-red-500", bg: "bg-red-500/10 text-red-700 dark:text-red-400" },
  suggestion: { icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  idea: { icon: Sparkles, color: "text-blue-500", bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "reviewed", label: "Reviewed" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

function formatDate(date: string | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function DevFeedback() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  const queryString = queryParams.toString();

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/dev-feedback", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/dev-feedback${queryString ? "?" + queryString : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/dev-feedback/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dev-feedback"] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dev-feedback/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dev-feedback"] });
      toast({ title: "Feedback deleted" });
    },
  });

  const openCount = items.filter(i => i.status === "open").length;
  const totalCount = items.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-dev-feedback">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold" data-testid="text-dev-feedback-title">Dev Feedback</h1>
            <p className="text-sm text-muted-foreground">
              {openCount} open · {totalCount} total
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-sm" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] h-8 text-sm" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="bug">Bugs</SelectItem>
            <SelectItem value="suggestion">Suggestions</SelectItem>
            <SelectItem value="idea">Ideas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Code2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No feedback yet</p>
            <p className="text-sm mt-1">When team members report bugs or share ideas, they'll appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const typeConf = TYPE_CONFIG[item.type] || TYPE_CONFIG.bug;
            const TypeIcon = typeConf.icon;
            const isExpanded = expandedId === item.id;
            const submitterName = item.submitter
              ? [item.submitter.firstName, item.submitter.lastName].filter(Boolean).join(" ") || item.submitter.username || "Unknown"
              : "Unknown";

            return (
              <Card key={item.id} className="overflow-hidden" data-testid={`card-feedback-${item.id}`}>
                <CardContent className="p-4">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    data-testid={`button-expand-${item.id}`}
                  >
                    <div className="mt-0.5">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <TypeIcon className={`w-5 h-5 mt-0.5 shrink-0 ${typeConf.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" data-testid={`text-feedback-title-${item.id}`}>{item.title}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeConf.bg}`}>
                          {item.type}
                        </Badge>
                        {item.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {item.category}
                          </Badge>
                        )}
                        {item.priority && (
                          <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[item.priority] || ""}`}>
                            {item.priority}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{submitterName}</span>
                        <span>·</span>
                        <span>{formatDate(item.createdAt)}</span>
                        {item.pagePath && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-[10px]">{item.pagePath}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={item.status}
                        onValueChange={(value) => statusMutation.mutate({ id: item.id, status: value })}
                      >
                        <SelectTrigger className="w-[120px] h-7 text-xs" data-testid={`select-status-${item.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(item.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 ml-9 space-y-3 border-t pt-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                        <p className="text-sm whitespace-pre-wrap" data-testid={`text-description-${item.id}`}>{item.description}</p>
                      </div>
                      {item.aiSummary && (
                        <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
                          <p className="text-xs font-medium text-primary mb-1">Jarvis Analysis</p>
                          <p className="text-sm" data-testid={`text-ai-summary-${item.id}`}>{item.aiSummary}</p>
                        </div>
                      )}
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
