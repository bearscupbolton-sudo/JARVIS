import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PendingChange } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ShieldCheck, Check, X } from "lucide-react";
import { format } from "date-fns";

export default function AdminApprovals() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("pending");

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
            const payload = change.payload as Record<string, unknown>;
            const title = (payload?.title as string) || null;

            return (
              <Card key={change.id} data-testid={`card-pending-${change.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-2 min-w-0">
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
                    </div>

                    {statusFilter === "pending" && (
                      <div className="flex items-center gap-2 flex-shrink-0">
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
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
