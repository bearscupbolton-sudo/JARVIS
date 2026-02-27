import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  ChevronRight, Zap, ArrowRight, XCircle,
  Plus, Send, Settings2, ShieldCheck, Megaphone,
} from "lucide-react";
import type { TaskList, TaskListItem, DepartmentTodo, SoldoutLog, LobbyCheckSettings, LobbyCheckLog } from "@shared/schema";

type TaskListWithItems = TaskList & { items?: TaskListItem[] };

export default function Platform934() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const [soldoutItem, setSoldoutItem] = useState("");
  const [soldoutTime, setSoldoutTime] = useState(format(new Date(), "HH:mm"));
  const [showSoldoutDialog, setShowSoldoutDialog] = useState(false);
  const [showLobbySettings, setShowLobbySettings] = useState(false);
  const isManager = user?.role === "owner" || user?.role === "manager";

  const { data: taskLists = [], isLoading: loadingTasks } = useQuery<TaskListWithItems[]>({
    queryKey: ["/api/task-lists"],
  });

  const { data: assignedTasks = [] } = useQuery<TaskListWithItems[]>({
    queryKey: ["/api/task-lists/assigned"],
  });

  const { data: fohTodos = [], isLoading: loadingTodos } = useQuery<DepartmentTodo[]>({
    queryKey: ["/api/department-todos", "foh"],
  });

  const { data: soldoutLogs = [], isLoading: loadingSoldout } = useQuery<SoldoutLog[]>({
    queryKey: ["/api/soldout-logs"],
  });

  const { data: lobbySettings } = useQuery<LobbyCheckSettings>({
    queryKey: ["/api/lobby-check/settings"],
  });

  const { data: lobbyLogs = [] } = useQuery<LobbyCheckLog[]>({
    queryKey: ["/api/lobby-check/logs"],
  });

  const todayLobbyLogs = useMemo(() =>
    lobbyLogs.filter(l => l.date === today),
    [lobbyLogs, today]
  );

  const lobbySettingsMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/lobby-check/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lobby-check/settings"] });
      toast({ title: "Settings Updated", description: "Lobby check settings saved." });
    },
  });

  const fohTaskLists = useMemo(() =>
    taskLists.filter(tl => tl.department === "foh" && tl.status === "active"),
    [taskLists]
  );

  const myFohTasks = useMemo(() =>
    assignedTasks.filter(tl => tl.department === "foh" && tl.status === "active"),
    [assignedTasks]
  );

  const todaySoldouts = useMemo(() =>
    soldoutLogs.filter(s => s.date === today),
    [soldoutLogs, today]
  );

  const pendingTodos = useMemo(() =>
    fohTodos.filter(t => t.status === "pending"),
    [fohTodos]
  );

  const completeTodoMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/department-todos/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/department-todos", "foh"] });
      toast({ title: "Done!", description: "Task completed." });
    },
  });

  const completeItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: number; itemId: number }) =>
      apiRequest("PATCH", `/api/task-lists/${listId}/items/${itemId}`, { completed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists/assigned"] });
    },
  });

  const soldoutMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/soldout-logs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/soldout-logs"] });
      setShowSoldoutDialog(false);
      setSoldoutItem("");
      toast({ title: "86'd!", description: "Item marked as sold out." });
    },
  });

  const totalFohItems = fohTaskLists.reduce((acc, tl) => acc + (tl.items?.length || 0), 0);
  const completedFohItems = fohTaskLists.reduce((acc, tl) =>
    acc + (tl.items?.filter(i => i.completed).length || 0), 0
  );
  const progressPercent = totalFohItems > 0 ? Math.round((completedFohItems / totalFohItems) * 100) : 0;

  const isLoading = loadingTasks || loadingTodos || loadingSoldout;

  return (
    <div className="min-h-screen" data-testid="page-platform934">
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-900 via-amber-800 to-yellow-900 dark:from-amber-950 dark:via-amber-900 dark:to-yellow-950 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.03) 20px, rgba(255,255,255,0.03) 40px)`,
            }}
          />
        </div>
        <div className="absolute top-4 right-6 text-amber-400/20 text-[120px] font-bold font-display leading-none select-none pointer-events-none">
          9¾
        </div>
        <div className="relative p-6 md:p-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-400/30">
              <Zap className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight" data-testid="text-platform-title">
                Platform 9¾
              </h1>
              <p className="text-amber-200/70 text-sm">FOH Command Center</p>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-5">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-amber-200/60 uppercase tracking-wider">Today's Progress</span>
                <span className="text-sm font-mono font-bold text-amber-200">{progressPercent}%</span>
              </div>
              <div className="h-2 bg-amber-950/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono">{completedFohItems}/{totalFohItems}</p>
              <p className="text-[10px] text-amber-200/50 uppercase">Tasks Done</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-amber-200/20 dark:border-amber-800/30">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold font-mono" data-testid="stat-foh-lists">{fohTaskLists.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Task Lists</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200/20 dark:border-amber-800/30">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold font-mono" data-testid="stat-foh-todos">{pendingTodos.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Dept Todos</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200/20 dark:border-amber-800/30">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold font-mono text-destructive" data-testid="stat-soldout">{todaySoldouts.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">86'd Today</p>
            </CardContent>
          </Card>
        </div>

        {myFohTasks.length > 0 && (
          <Card data-testid="container-my-foh-tasks">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                My Assigned Tasks
                <Badge variant="outline" className="ml-auto text-[10px]">{myFohTasks.length} lists</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {myFohTasks.map(list => (
                <Link key={list.id} href={`/tasks/assigned/${list.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`my-foh-task-${list.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{list.title}</p>
                      {list.date && <p className="text-xs text-muted-foreground">{list.date}</p>}
                    </div>
                    {list.items && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {list.items.filter(i => i.completed).length}/{list.items.length}
                      </Badge>
                    )}
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <Card data-testid="container-foh-tasks">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-500" />
              FOH Task Lists
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : fohTaskLists.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active FOH task lists today.</p>
            ) : (
              <div className="space-y-2">
                {fohTaskLists.map(list => {
                  const items = list.items || [];
                  const done = items.filter(i => i.completed).length;
                  const total = items.length;
                  return (
                    <div key={list.id} className="border border-border rounded-md overflow-hidden" data-testid={`foh-task-list-${list.id}`}>
                      <Link href={`/tasks`}>
                        <div className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors cursor-pointer">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{list.title}</p>
                            <p className="text-xs text-muted-foreground">{list.date || "No date"}</p>
                          </div>
                          <Badge variant={done === total && total > 0 ? "default" : "secondary"} className="text-[10px]">
                            {done}/{total}
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </Link>
                      {items.filter(i => !i.completed).slice(0, 3).map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-4 py-2 border-t border-border/50 bg-muted/10"
                          data-testid={`foh-task-item-${item.id}`}
                        >
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={() => completeItemMutation.mutate({ listId: list.id, itemId: item.id })}
                            data-testid={`checkbox-task-${item.id}`}
                          />
                          <span className="text-sm flex-1">{item.manualTitle || `Job #${item.jobId}`}</span>
                          {item.startTime && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />{item.startTime}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {pendingTodos.length > 0 && (
          <Card data-testid="container-foh-todos">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Department Carryover
                <Badge variant="outline" className="ml-auto text-[10px]">{pendingTodos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {pendingTodos.map(todo => (
                <div key={todo.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/30" data-testid={`foh-todo-${todo.id}`}>
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => completeTodoMutation.mutate(todo.id)}
                    data-testid={`checkbox-todo-${todo.id}`}
                  />
                  <span className="text-sm flex-1">{todo.itemTitle}</span>
                  {todo.originalDate && (
                    <span className="text-[10px] text-muted-foreground">from {todo.originalDate}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card data-testid="container-lobby-check">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              Lobby Checks
              {todayLobbyLogs.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{todayLobbyLogs.length} cleared</Badge>
              )}
            </CardTitle>
            {isManager && (
              <Dialog open={showLobbySettings} onOpenChange={setShowLobbySettings}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-lobby-settings">
                    <Settings2 className="w-3 h-3 mr-1" />Settings
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Lobby Check Settings</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <Label>Enabled</Label>
                      <Switch
                        checked={lobbySettings?.enabled ?? false}
                        onCheckedChange={(checked) =>
                          lobbySettingsMutation.mutate({
                            ...lobbySettings,
                            enabled: checked,
                          })
                        }
                        data-testid="switch-lobby-enabled"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Frequency</Label>
                      <Select
                        value={String(lobbySettings?.frequencyMinutes ?? 30)}
                        onValueChange={(v) =>
                          lobbySettingsMutation.mutate({
                            ...lobbySettings,
                            frequencyMinutes: Number(v),
                          })
                        }
                      >
                        <SelectTrigger data-testid="select-lobby-frequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">Every 15 minutes</SelectItem>
                          <SelectItem value="30">Every 30 minutes</SelectItem>
                          <SelectItem value="45">Every 45 minutes</SelectItem>
                          <SelectItem value="60">Every 60 minutes</SelectItem>
                          <SelectItem value="90">Every 90 minutes</SelectItem>
                          <SelectItem value="120">Every 2 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Business Hours Start</Label>
                        <Input
                          type="time"
                          value={lobbySettings?.businessHoursStart ?? "06:00"}
                          onChange={(e) =>
                            lobbySettingsMutation.mutate({
                              ...lobbySettings,
                              businessHoursStart: e.target.value,
                            })
                          }
                          data-testid="input-lobby-start"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Business Hours End</Label>
                        <Input
                          type="time"
                          value={lobbySettings?.businessHoursEnd ?? "18:00"}
                          onChange={(e) =>
                            lobbySettingsMutation.mutate({
                              ...lobbySettings,
                              businessHoursEnd: e.target.value,
                            })
                          }
                          data-testid="input-lobby-end"
                        />
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {!lobbySettings?.enabled ? (
              <p className="text-sm text-muted-foreground py-3 text-center">
                Lobby checks are not enabled.{isManager ? " Click Settings to configure." : ""}
              </p>
            ) : todayLobbyLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">No lobby checks cleared yet today.</p>
            ) : (
              <div className="space-y-1">
                {todayLobbyLogs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 p-2 rounded-md bg-green-500/5 border border-green-500/10" data-testid={`lobby-log-${log.id}`}>
                    <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                    <span className="text-sm flex-1">
                      <span className="font-medium">{log.clearedByName}</span>
                      <span className="text-muted-foreground"> cleared {log.scheduledAt} check</span>
                    </span>
                    {log.clearedAt && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.clearedAt), "h:mm a")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-red-500/30 bg-red-950/10" data-testid="container-foh-backup">
          <CardContent className="pt-5 pb-4">
            <Button
              className="w-full h-14 text-lg font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl gap-3"
              onClick={() => {
                apiRequest("POST", "/api/bagel-bros/send-alert").then(() => {
                  toast({ title: "Alert Sent!", description: "Bagel Bros crew has been notified" });
                });
              }}
              data-testid="button-foh-backup-alert"
            >
              <Megaphone className="w-6 h-6" />
              FOH Needs Backup / Refuerzo al Frente
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="container-soldout">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              86'd Today
              {todaySoldouts.length > 0 && (
                <Badge variant="destructive" className="text-[10px]">{todaySoldouts.length}</Badge>
              )}
            </CardTitle>
            <Dialog open={showSoldoutDialog} onOpenChange={setShowSoldoutDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-add-soldout">
                  <Plus className="w-3 h-3 mr-1" />86 Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mark Item as 86'd</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <Input
                    placeholder="Item name"
                    value={soldoutItem}
                    onChange={e => setSoldoutItem(e.target.value)}
                    data-testid="input-soldout-item"
                  />
                  <Input
                    type="time"
                    value={soldoutTime}
                    onChange={e => setSoldoutTime(e.target.value)}
                    data-testid="input-soldout-time"
                  />
                  <Button
                    className="w-full"
                    disabled={!soldoutItem.trim() || soldoutMutation.isPending}
                    onClick={() => soldoutMutation.mutate({
                      itemName: soldoutItem.trim(),
                      date: today,
                      soldOutAt: soldoutTime,
                      reportedBy: user?.id,
                    })}
                    data-testid="button-submit-soldout"
                  >
                    <Send className="w-4 h-4 mr-2" />Mark 86'd
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="pt-0">
            {todaySoldouts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Nothing 86'd yet today</p>
            ) : (
              <div className="space-y-1">
                {todaySoldouts.map(log => (
                  <div key={log.id} className="flex items-center gap-3 p-2 rounded-md bg-destructive/5 border border-destructive/10" data-testid={`soldout-${log.id}`}>
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    <span className="text-sm font-medium flex-1">{log.itemName}</span>
                    <span className="text-xs text-muted-foreground">{log.soldOutAt}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
