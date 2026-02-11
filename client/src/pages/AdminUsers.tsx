import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/models/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Unlock, Trash2, Users } from "lucide-react";

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, locked }: { id: string; locked: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/lock`, { locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update user", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  function handleDelete(id: string, name: string) {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      deleteMutation.mutate(id);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="container-admin-users">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-admin-users">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Team Management</h1>
          <p className="text-sm text-muted-foreground">{users?.length || 0} team members</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users?.map((u) => {
          const displayName = u.username || u.firstName || u.email || "Unknown";
          const isCurrentUser = u.id === currentUser?.id;

          return (
            <Card key={u.id} data-testid={`card-user-${u.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{displayName}</p>
                    {u.email && (
                      <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                    <Badge
                      variant={u.role === "owner" ? "default" : "secondary"}
                      data-testid={`badge-role-${u.id}`}
                    >
                      {u.role === "owner" ? "Owner" : "Member"}
                    </Badge>
                    {u.locked && (
                      <Badge variant="destructive" data-testid={`badge-locked-${u.id}`}>
                        Locked
                      </Badge>
                    )}
                  </div>
                </div>

                {!isCurrentUser && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => lockMutation.mutate({ id: u.id, locked: !u.locked })}
                      disabled={lockMutation.isPending}
                      data-testid={`button-lock-user-${u.id}`}
                    >
                      {u.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => handleDelete(u.id, displayName)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-user-${u.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
