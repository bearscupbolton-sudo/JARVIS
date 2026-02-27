import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, CheckCircle2, Clock, ChefHat, BookOpen,
  Link2, Play, Timer, ClipboardList
} from "lucide-react";
import type { TaskJob, TaskList, TaskListItem, Recipe, SOP } from "@shared/schema";

type TaskListWithItems = TaskList & {
  items: (TaskListItem & { job?: TaskJob | null })[];
};

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function AssignedTaskList() {
  const [, params] = useRoute("/tasks/assigned/:id");
  const listId = params?.id ? parseInt(params.id) : null;
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: list, isLoading } = useQuery<TaskListWithItems>({
    queryKey: ["/api/task-lists", listId],
    enabled: !!listId,
  });

  const { data: recipes } = useQuery<Recipe[]>({ queryKey: ["/api/recipes"] });
  const { data: allSOPs } = useQuery<SOP[]>({ queryKey: ["/api/sops"] });

  const recipeMap = useMemo(() => {
    const map = new Map<number, Recipe>();
    recipes?.forEach(r => map.set(r.id, r));
    return map;
  }, [recipes]);

  const sopMap = useMemo(() => {
    const map = new Map<number, SOP>();
    allSOPs?.forEach(s => map.set(s.id, s));
    return map;
  }, [allSOPs]);

  const startItemMut = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await apiRequest("POST", `/api/task-list-items/${itemId}/start`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists", listId] });
    },
  });

  const completeItemMut = useMutation({
    mutationFn: async ({ itemId, recipeSessionId }: { itemId: number; recipeSessionId?: number }) => {
      const res = await apiRequest("POST", `/api/task-list-items/${itemId}/complete`, {
        recipeSessionId: recipeSessionId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists", listId] });
      toast({ title: "Task completed" });
    },
  });

  const handleItemCheck = (item: TaskListItem & { job?: TaskJob | null }) => {
    if (item.completed) return;
    if (!item.startedAt) {
      startItemMut.mutate(item.id);
      toast({ title: "Task started", description: "Timer is running." });
    } else {
      completeItemMut.mutate({ itemId: item.id });
    }
  };

  const handleBeginRecipe = (item: TaskListItem & { job?: TaskJob | null }) => {
    const recipeId = item.recipeId || item.job?.recipeId;
    if (!recipeId) return;
    if (!item.startedAt) {
      startItemMut.mutate(item.id);
    }
    setLocation(`/recipes/${recipeId}/begin`);
  };

  if (isLoading || !listId) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto text-center py-12 text-muted-foreground">
        <p>Task list not found.</p>
        <Link href="/tasks">
          <Button variant="ghost" className="mt-4">Back to Task Manager</Button>
        </Link>
      </div>
    );
  }

  const completedCount = list.items.filter(i => i.completed).length;
  const totalCount = list.items.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allDone = completedCount === totalCount && totalCount > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/tasks">
          <Button variant="ghost" size="icon" data-testid="button-back-tasks">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-bold truncate" data-testid="text-assigned-title">{list.title}</h1>
          {list.description && <p className="text-sm text-muted-foreground">{list.description}</p>}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {list.department && <Badge variant="outline" className="text-xs capitalize">{list.department}</Badge>}
            {list.date && <span className="text-xs text-muted-foreground">{list.date}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            {completedCount} of {totalCount} completed
          </span>
          <span className="font-mono font-medium">{Math.round(progressPct)}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allDone ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${progressPct}%` }}
            data-testid="progress-assigned"
          />
        </div>
        {allDone && (
          <p className="text-center text-sm text-green-600 font-medium" data-testid="text-all-done">
            All tasks completed!
          </p>
        )}
      </div>

      <div className="space-y-3">
        {list.items.map((item, idx) => {
          const title = item.job?.name || item.manualTitle || "Untitled";
          const recipeId = item.recipeId || item.job?.recipeId;
          const recipe = recipeId ? recipeMap.get(recipeId) : null;
          const sopId = item.sopId || item.job?.sopId;
          const sop = sopId ? sopMap.get(sopId) : null;
          const timeStr = item.startTime
            ? item.endTime ? `${item.startTime} - ${item.endTime}` : item.startTime
            : null;
          const isStarted = !!item.startedAt && !item.completed;
          const elapsed = isStarted && item.startedAt
            ? now - new Date(item.startedAt).getTime()
            : null;

          return (
            <Card
              key={item.id}
              className={cn(
                "transition-all",
                item.completed && "opacity-60",
                isStarted && "border-primary/40 bg-primary/5"
              )}
              data-testid={`card-assigned-item-${item.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={item.completed}
                      onCheckedChange={() => handleItemCheck(item)}
                      disabled={item.completed}
                      data-testid={`checkbox-assigned-${item.id}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className={cn("font-medium", item.completed && "line-through")}>
                      {idx + 1}. {title}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {timeStr && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {timeStr}
                        </span>
                      )}
                      {recipeId && recipe && (
                        <Badge variant="secondary" className="text-xs">
                          <ChefHat className="w-3 h-3 mr-1" /> {recipe.title}
                        </Badge>
                      )}
                      {sopId && sop && (
                        <Badge variant="secondary" className="text-xs">
                          <BookOpen className="w-3 h-3 mr-1" /> {sop.title}
                        </Badge>
                      )}
                      {isStarted && elapsed !== null && (
                        <Badge variant="outline" className="text-xs font-mono border-primary/40 text-primary">
                          <Timer className="w-3 h-3 mr-1" /> {formatElapsed(elapsed)}
                        </Badge>
                      )}
                      {item.completed && item.completedAt && item.startedAt && (
                        <span className="text-xs text-muted-foreground">
                          Completed in {formatElapsed(new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime())}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {recipeId && !item.completed && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleBeginRecipe(item)}
                        data-testid={`button-begin-recipe-${item.id}`}
                      >
                        <Play className="w-3 h-3 mr-1" /> Begin Recipe
                      </Button>
                    )}
                    {sopId && !item.completed && (
                      <Link href="/sops">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (!item.startedAt) startItemMut.mutate(item.id);
                          }}
                          data-testid={`button-view-sop-${item.id}`}
                        >
                          <BookOpen className="w-3 h-3 mr-1" /> View SOP
                        </Button>
                      </Link>
                    )}
                    {!recipeId && !sopId && !item.completed && !item.startedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleItemCheck(item)}
                        data-testid={`button-start-item-${item.id}`}
                      >
                        <Play className="w-3 h-3 mr-1" /> Start
                      </Button>
                    )}
                    {!recipeId && !sopId && isStarted && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleItemCheck(item)}
                        data-testid={`button-complete-item-${item.id}`}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Done
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
