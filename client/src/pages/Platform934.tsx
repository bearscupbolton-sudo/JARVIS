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
  CheckCircle2, Clock, ChevronRight, Zap, XCircle,
  Plus, Send, Settings2, ShieldCheck, Megaphone,
} from "lucide-react";
import type { TaskList, TaskListItem, SoldoutLog, LobbyCheckSettings, LobbyCheckLog, PastryItem } from "@shared/schema";

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

  const { data: soldoutLogs = [], isLoading: loadingSoldout } = useQuery<SoldoutLog[]>({
    queryKey: ["/api/soldout-logs"],
  });

  const { data: lobbySettings } = useQuery<LobbyCheckSettings>({
    queryKey: ["/api/lobby-check/settings"],
  });

  const { data: lobbyLogs = [] } = useQuery<LobbyCheckLog[]>({
    queryKey: ["/api/lobby-check/logs"],
  });

  const { data: pastryItems = [] } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items"],
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

  const todayAssigned = useMemo(() =>
    taskLists.filter(tl => tl.date === today && tl.department === "foh" && (tl.assignedTo || tl.department)).length,
    [taskLists, today]
  );

  const todayCompleted = useMemo(() =>
    taskLists.filter(tl => tl.date === today && tl.department === "foh" && tl.status === "completed").length,
    [taskLists, today]
  );

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

  const isLoading = loadingTasks || loadingSoldout;

  return (
    <div className="min-h-screen flex flex-col bg-background" data-testid="page-platform934">
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-900 via-amber-800 to-amber-900 dark:from-amber-950 dark:via-amber-900 dark:to-amber-950 text-white">
        <div className="absolute top-2 right-4 text-amber-400/10 text-[80px] font-bold font-display leading-none select-none pointer-events-none">
          9¾
        </div>
        <div className="relative px-5 py-4 md:px-8 md:py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-400/30">
                <Zap className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-display font-bold tracking-tight" data-testid="text-platform-title">
                  Platform 9¾
                </h1>
                <p className="text-amber-200/60 text-xs tracking-wide">FOH Command Center</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-400/20">
                <p className="text-lg font-bold font-mono" data-testid="stat-assigned-completed">{todayAssigned}/{todayCompleted}</p>
                <p className="text-[9px] text-amber-200/50 uppercase tracking-wider">Assigned / Done</p>
              </div>
              <div className="text-center px-3 py-1 rounded-lg bg-red-500/10 border border-red-400/20">
                <p className="text-lg font-bold font-mono text-red-300" data-testid="stat-soldout">{todaySoldouts.length}</p>
                <p className="text-[9px] text-red-200/50 uppercase tracking-wider">86'd</p>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-amber-200/50 uppercase tracking-wider">Task Progress</span>
              <span className="text-xs font-mono font-bold text-amber-200">{completedFohItems}/{totalFohItems}</span>
            </div>
            <div className="h-1.5 bg-amber-950/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 max-w-4xl mx-auto w-full">
        {myFohTasks.length > 0 && (
          <Card className="border-amber-200/20 dark:border-amber-800/30" data-testid="container-my-foh-tasks">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                My Assigned Tasks
                <Badge variant="outline" className="ml-auto text-[10px] font-mono">{myFohTasks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-0 pb-3 space-y-1.5">
              {myFohTasks.map(list => (
                <Link key={list.id} href={`/tasks/assigned/${list.id}`}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`my-foh-task-${list.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{list.title}</p>
                      {list.date && <p className="text-[11px] text-muted-foreground">{list.date}</p>}
                    </div>
                    {list.items && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {list.items.filter(i => i.completed).length}/{list.items.length}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <Card data-testid="container-foh-tasks">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
              FOH Task Lists
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-0 pb-3">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : fohTaskLists.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">No active FOH task lists.</p>
            ) : (
              <div className="space-y-1.5">
                {fohTaskLists.map(list => {
                  const items = list.items || [];
                  const done = items.filter(i => i.completed).length;
                  const total = items.length;
                  return (
                    <div key={list.id} className="border border-border rounded-lg overflow-hidden" data-testid={`foh-task-list-${list.id}`}>
                      <div className="flex items-center gap-3 p-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{list.title}</p>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">{done}/{total}</span>
                        {done === total && total > 0 && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                      </div>
                      {items.filter(i => !i.completed).slice(0, 3).map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-1.5 border-t border-border/50 bg-muted/5"
                          data-testid={`foh-task-item-${item.id}`}
                        >
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={() => completeItemMutation.mutate({ listId: list.id, itemId: item.id })}
                            data-testid={`checkbox-task-${item.id}`}
                          />
                          <span className="text-sm flex-1">{item.manualTitle || `Job #${item.jobId}`}</span>
                          {item.startTime && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card data-testid="container-lobby-check">
            <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                Lobby Checks
                {todayLobbyLogs.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-mono">{todayLobbyLogs.length}</Badge>
                )}
              </CardTitle>
              {isManager && (
                <Dialog open={showLobbySettings} onOpenChange={setShowLobbySettings}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" data-testid="button-lobby-settings">
                      <Settings2 className="w-3.5 h-3.5" />
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
                            <SelectItem value="15">Every 15 min</SelectItem>
                            <SelectItem value="30">Every 30 min</SelectItem>
                            <SelectItem value="45">Every 45 min</SelectItem>
                            <SelectItem value="60">Every 60 min</SelectItem>
                            <SelectItem value="90">Every 90 min</SelectItem>
                            <SelectItem value="120">Every 2 hours</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Start</Label>
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
                          <Label>End</Label>
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
            <CardContent className="px-4 pt-0 pb-3">
              {!lobbySettings?.enabled ? (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  Not enabled.{isManager ? " Tap settings to configure." : ""}
                </p>
              ) : todayLobbyLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No checks cleared yet.</p>
              ) : (
                <div className="space-y-1">
                  {todayLobbyLogs.slice(0, 4).map(log => (
                    <div key={log.id} className="flex items-center gap-2 py-1.5 text-sm" data-testid={`lobby-log-${log.id}`}>
                      <ShieldCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="flex-1 truncate"><span className="font-medium">{log.clearedByName}</span></span>
                      {log.clearedAt && (
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {format(new Date(log.clearedAt), "h:mm a")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="container-soldout">
            <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-destructive" />
                86'd Today
                {todaySoldouts.length > 0 && (
                  <Badge variant="destructive" className="text-[10px] font-mono">{todaySoldouts.length}</Badge>
                )}
              </CardTitle>
              <Dialog open={showSoldoutDialog} onOpenChange={setShowSoldoutDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" data-testid="button-add-soldout">
                    <Plus className="w-3 h-3" />86
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Mark Item as 86'd</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 pt-2">
                    <Select value={soldoutItem} onValueChange={setSoldoutItem}>
                      <SelectTrigger data-testid="select-soldout-item">
                        <SelectValue placeholder="Select pastry item" />
                      </SelectTrigger>
                      <SelectContent>
                        {pastryItems.filter(p => p.isActive).map(p => (
                          <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      Mark 86'd
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="px-4 pt-0 pb-3">
              {todaySoldouts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">Nothing 86'd yet</p>
              ) : (
                <div className="space-y-1">
                  {todaySoldouts.map(log => (
                    <div key={log.id} className="flex items-center gap-2 py-1.5 text-sm" data-testid={`soldout-${log.id}`}>
                      <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <span className="font-medium flex-1 truncate">{log.itemName}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">{log.soldOutAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="shrink-0 p-4 md:p-5" data-testid="container-foh-backup">
        <button
          className="relative w-full rounded-2xl border-2 border-red-500/80 bg-gradient-to-b from-red-600 via-red-700 to-red-900 shadow-[0_0_20px_rgba(239,68,68,0.3),0_0_40px_rgba(239,68,68,0.15)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5),0_0_60px_rgba(239,68,68,0.25)] active:scale-[0.98] transition-all duration-200 cursor-pointer group"
          style={{ minHeight: "28vh" }}
          onClick={() => {
            apiRequest("POST", "/api/bagel-bros/send-alert").then(() => {
              toast({ title: "ALERT SENT!", description: "Bagel Bros crew has been notified" });
            });
          }}
          data-testid="button-foh-backup-alert"
        >
          <div className="flex flex-col items-center justify-center gap-3 py-6">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500/25 border-2 border-red-400/40 flex items-center justify-center group-hover:bg-red-500/40 transition-colors animate-[pulse_2s_ease-in-out_infinite]">
              <Megaphone className="w-8 h-8 md:w-10 md:h-10 text-white drop-shadow-lg" />
            </div>
            <div className="text-center">
              <p className="text-xl md:text-2xl font-black text-white tracking-wide drop-shadow-lg uppercase">
                FOH Needs Backup
              </p>
              <p className="text-lg md:text-xl font-bold text-red-200/80 mt-0.5 tracking-wide">
                Refuerzo al Frente
              </p>
            </div>
            <p className="text-red-200/40 text-xs tracking-wider uppercase">Tap to alert crew</p>
          </div>
        </button>
      </div>
    </div>
  );
}
