import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, ClipboardList, Briefcase, Clock, Printer, ArrowLeft,
  Link2, ChevronRight, UserPlus, Users, BookOpen, ChefHat,
  CheckCircle2, AlertCircle, RotateCcw
} from "lucide-react";
import type { TaskJob, TaskList, TaskListItem, SOP, Recipe, DepartmentTodo } from "@shared/schema";

type TaskListWithItems = TaskList & {
  items: (TaskListItem & { job?: TaskJob | null })[];
};

type TeamMember = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
};

export default function TaskManager() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"lists" | "jobs" | "department">("lists");
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  if (selectedListId) {
    return <TaskListDetail listId={selectedListId} onBack={() => setSelectedListId(null)} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500" data-testid="container-task-manager">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-task-manager-title">Jarvis Task Manager</h1>
          <p className="text-muted-foreground">Create task lists, manage jobs, and track department to-dos.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={activeTab === "lists" ? "default" : "outline"}
          onClick={() => setActiveTab("lists")}
          data-testid="button-tab-lists"
        >
          <ClipboardList className="w-4 h-4 mr-2" /> Task Lists
        </Button>
        <Button
          variant={activeTab === "jobs" ? "default" : "outline"}
          onClick={() => setActiveTab("jobs")}
          data-testid="button-tab-jobs"
        >
          <Briefcase className="w-4 h-4 mr-2" /> Jobs Library
        </Button>
        <Button
          variant={activeTab === "department" ? "default" : "outline"}
          onClick={() => setActiveTab("department")}
          data-testid="button-tab-department"
        >
          <Users className="w-4 h-4 mr-2" /> Department To-Do
        </Button>
      </div>

      {activeTab === "lists" ? (
        <TaskListsPanel onSelectList={setSelectedListId} />
      ) : activeTab === "jobs" ? (
        <JobsPanel />
      ) : (
        <DepartmentTodosPanel />
      )}
    </div>
  );
}

function TaskListsPanel({ onSelectList }: { onSelectList: (id: number) => void }) {
  const { data: lists, isLoading } = useQuery<TaskList[]>({
    queryKey: ["/api/task-lists"],
  });
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Your Task Lists</h2>
        <CreateTaskListDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => { setCreateOpen(false); onSelectList(id); }} />
      </div>

      {isLoading ? (
        Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
      ) : lists?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-lists">
          No task lists yet. Create your first one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {lists?.map((list) => (
            <Card
              key={list.id}
              className="hover-elevate cursor-pointer"
              onClick={() => onSelectList(list.id)}
              data-testid={`card-task-list-${list.id}`}
            >
              <CardContent className="flex items-center justify-between p-4 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{list.title}</h3>
                    {list.description && (
                      <p className="text-sm text-muted-foreground truncate">{list.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {list.assignedTo && (
                        <Badge variant="secondary" className="text-xs">
                          <UserPlus className="w-3 h-3 mr-1" /> Assigned
                        </Badge>
                      )}
                      {!list.assignedTo && list.department && list.date && (
                        <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                          <Users className="w-3 h-3 mr-1" /> Dept
                        </Badge>
                      )}
                      {list.department && (
                        <Badge variant="outline" className="text-xs capitalize">{list.department}</Badge>
                      )}
                      {list.date && (
                        <span className="text-xs text-muted-foreground">{list.date}</span>
                      )}
                      {list.status === "rolled_over" && (
                        <Badge variant="destructive" className="text-xs">Rolled Over</Badge>
                      )}
                      {list.status === "completed" && (
                        <Badge className="text-xs bg-green-600">Completed</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTaskListDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const createMut = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      const res = await apiRequest("POST", "/api/task-lists", data);
      return res.json();
    },
    onSuccess: (list: TaskList) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
      setTitle("");
      setDescription("");
      toast({ title: "List created" });
      onCreated(list.id);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-list">
          <Plus className="w-4 h-4 mr-2" /> New List
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task List</DialogTitle>
          <DialogDescription>Give your new task list a name and optional description.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) createMut.mutate({ title: title.trim(), description: description.trim() }); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning Opening Checklist" data-testid="input-list-title" />
          </div>
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..." data-testid="input-list-description" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMut.isPending} data-testid="button-submit-list">
              {createMut.isPending ? "Creating..." : "Create List"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskListDetail({ listId, onBack }: { listId: number; onBack: () => void }) {
  const { user } = useAuth();
  const { data: list, isLoading } = useQuery<TaskListWithItems>({
    queryKey: ["/api/task-lists", listId],
  });
  const { data: jobs } = useQuery<TaskJob[]>({ queryKey: ["/api/task-jobs"] });
  const { data: allSOPs } = useQuery<SOP[]>({ queryKey: ["/api/sops"] });
  const { data: recipes } = useQuery<Recipe[]>({ queryKey: ["/api/recipes"] });
  const { data: team } = useQuery<TeamMember[]>({ queryKey: ["/api/team"] });
  const { toast } = useToast();
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const isManager = user?.role === "owner" || user?.role === "manager";

  const deleteMut = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/task-lists/${listId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
      toast({ title: "List deleted" });
      onBack();
    },
  });

  const toggleItemMut = useMutation({
    mutationFn: async ({ id, completed }: { id: number; completed: boolean }) => {
      await apiRequest("PUT", `/api/task-list-items/${id}`, { completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists", listId] });
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/task-list-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists", listId] });
      toast({ title: "Item removed" });
    },
  });

  const rolloverMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/task-lists/${listId}/rollover`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["/api/department-todos"] });
      toast({ title: "Items rolled over", description: `${data.rolledOver} items moved to department to-do` });
    },
  });

  const handleExport = () => {
    if (!list) return;
    window.open(`/api/task-lists/${list.id}/print`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        List not found.
        <Button variant="ghost" onClick={onBack}>Go back</Button>
      </div>
    );
  }

  const completedCount = list.items.filter((i) => i.completed).length;
  const uncompletedCount = list.items.length - completedCount;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-task-list-detail">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-lists">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-bold truncate" data-testid="text-list-title">{list.title}</h1>
          {list.description && <p className="text-sm text-muted-foreground">{list.description}</p>}
          {(list.assignedTo || (list.department && list.date)) && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {list.assignedTo ? (
                <Badge variant="secondary" className="text-xs">
                  <UserPlus className="w-3 h-3 mr-1" />
                  Assigned to {team?.find(t => t.id === list.assignedTo)?.firstName || "team member"}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  <Users className="w-3 h-3 mr-1" />
                  Department task
                </Badge>
              )}
              {list.department && <Badge variant="outline" className="text-xs capitalize">{list.department}</Badge>}
              {list.date && <span className="text-xs text-muted-foreground">{list.date}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {isManager && !list.assignedTo && (
            <Button variant="default" onClick={() => setAssignOpen(true)} data-testid="button-assign-list">
              <UserPlus className="w-4 h-4 mr-2" /> {list.department ? "Reassign" : "Assign"}
            </Button>
          )}
          {isManager && (list.assignedTo || list.department) && uncompletedCount > 0 && list.status === "active" && (
            <Button variant="outline" onClick={() => { if (confirm(`Roll over ${uncompletedCount} uncompleted items to department to-do?`)) rolloverMut.mutate(); }} data-testid="button-rollover">
              <RotateCcw className="w-4 h-4 mr-2" /> Roll Over ({uncompletedCount})
            </Button>
          )}
          <Button variant="default" onClick={handleExport} data-testid="button-print-list">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => { if (confirm("Delete this list?")) deleteMut.mutate(); }}
            data-testid="button-delete-list"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {list.items.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <CheckCircle2 className="w-4 h-4" />
          <span>{completedCount} of {list.items.length} completed</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${list.items.length > 0 ? (completedCount / list.items.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {list.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-items">
              No items yet. Add tasks to this list.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {list.items.map((item) => {
                const title = item.job?.name || item.manualTitle || "Untitled";
                const timeStr = item.startTime
                  ? item.endTime
                    ? `${item.startTime} - ${item.endTime}`
                    : item.startTime
                  : null;
                const recipeId = item.recipeId || item.job?.recipeId;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      item.completed && "opacity-60"
                    )}
                    data-testid={`item-task-${item.id}`}
                  >
                    <Checkbox
                      checked={item.completed}
                      onCheckedChange={(v) => toggleItemMut.mutate({ id: item.id, completed: !!v })}
                      data-testid={`checkbox-item-${item.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className={cn("font-medium", item.completed && "line-through")}>
                        {title}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {timeStr && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {timeStr}
                          </span>
                        )}
                        {(item.sopId || item.job?.sopId) && (
                          <Badge variant="secondary" className="text-xs">
                            <BookOpen className="w-3 h-3 mr-1" /> SOP
                          </Badge>
                        )}
                        {recipeId && (
                          <Badge variant="secondary" className="text-xs">
                            <ChefHat className="w-3 h-3 mr-1" /> Recipe
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive flex-shrink-0"
                      onClick={() => deleteItemMut.mutate(item.id)}
                      data-testid={`button-delete-item-${item.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AddItemDialog
        listId={listId}
        jobs={jobs || []}
        recipes={recipes || []}
        sops={allSOPs || []}
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        nextOrder={list.items.length}
      />

      {isManager && (
        <AssignDialog
          listId={listId}
          listTitle={list.title}
          team={team || []}
          open={assignOpen}
          onOpenChange={setAssignOpen}
          currentDepartment={list.department || ""}
        />
      )}
    </div>
  );
}

function AssignDialog({ listId, listTitle, team, open, onOpenChange, currentDepartment = "" }: {
  listId: number;
  listTitle: string;
  team: TeamMember[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentDepartment?: string;
}) {
  const { toast } = useToast();
  const [assignedTo, setAssignedTo] = useState("");
  const [department, setDepartment] = useState(currentDepartment);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const assignMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/task-lists/${listId}/assign`, {
        assignedTo: assignedTo && assignedTo !== "__dept__" ? assignedTo : null, department, date,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists/assigned"] });
      const desc = assignedTo && assignedTo !== "__dept__"
        ? "A message has been sent to the team member."
        : `Assigned to the ${department} department. Anyone can pick it up.`;
      toast({ title: "Task list assigned", description: desc });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Task List</DialogTitle>
          <DialogDescription>Assign "{listTitle}" to a team member or a whole department.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Department</label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger data-testid="select-department">
                <SelectValue placeholder="Select department..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bakery">Bakery</SelectItem>
                <SelectItem value="kitchen">Kitchen</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
                <SelectItem value="foh">FOH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Assign To (optional)</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger data-testid="select-assign-to">
                <SelectValue placeholder="Entire department (anyone can pick up)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__dept__">Entire department</SelectItem>
                {team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.firstName || m.username || "Unknown"} {m.lastName || ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Leave as "Entire department" for daily lists like opening/closing.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-assign-date" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => assignMut.mutate()}
            disabled={!department || !date || assignMut.isPending}
            data-testid="button-confirm-assign"
          >
            {assignMut.isPending ? "Assigning..." : assignedTo && assignedTo !== "__dept__" ? "Assign & Notify" : "Assign to Dept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddItemDialog({ listId, jobs, recipes, sops, open, onOpenChange, nextOrder }: {
  listId: number;
  jobs: TaskJob[];
  recipes: Recipe[];
  sops: SOP[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nextOrder: number;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"job" | "manual" | "recipe" | "sop">("manual");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  const [selectedSopId, setSelectedSopId] = useState<string>("");
  const [manualTitle, setManualTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/task-lists/${listId}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists", listId] });
      toast({ title: "Item added" });
      resetForm();
      onOpenChange(false);
    },
  });

  const addSopMut = useMutation({
    mutationFn: async (data: { sopId: number; startOrder: number }) => {
      const res = await apiRequest("POST", `/api/task-lists/${listId}/add-sop`, data);
      return res.json();
    },
    onSuccess: (data: { sopTitle: string; stepCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists", listId] });
      toast({ title: `SOP added: ${data.sopTitle}`, description: `${data.stepCount} steps created` });
      resetForm();
      onOpenChange(false);
    },
  });

  const resetForm = () => {
    setMode("manual");
    setSelectedJobId("");
    setSelectedRecipeId("");
    setSelectedSopId("");
    setManualTitle("");
    setStartTime("");
    setEndTime("");
  };

  const handleSubmit = () => {
    const payload: any = {
      listId,
      sortOrder: nextOrder,
      completed: false,
      startTime: startTime || null,
      endTime: endTime || null,
    };
    if (mode === "job" && selectedJobId) {
      payload.jobId = parseInt(selectedJobId);
    } else if (mode === "recipe" && selectedRecipeId) {
      const recipe = recipes.find(r => r.id === parseInt(selectedRecipeId));
      payload.recipeId = parseInt(selectedRecipeId);
      payload.manualTitle = recipe ? recipe.title : "Recipe";
    } else if (mode === "sop" && selectedSopId) {
      addSopMut.mutate({ sopId: parseInt(selectedSopId), startOrder: nextOrder });
      return;
    } else if (mode === "manual" && manualTitle.trim()) {
      payload.manualTitle = manualTitle.trim();
    } else {
      toast({ title: "Please enter a task, select a job, choose a recipe, or select an SOP", variant: "destructive" });
      return;
    }
    createMut.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-item">
          <Plus className="w-4 h-4 mr-2" /> Add Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task to List</DialogTitle>
          <DialogDescription>Choose a saved job, link a recipe, link an SOP, or type a custom task.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={mode === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("manual")}
              data-testid="button-mode-manual"
            >
              Manual Entry
            </Button>
            <Button
              variant={mode === "job" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("job")}
              data-testid="button-mode-job"
            >
              From Saved Job
            </Button>
            <Button
              variant={mode === "recipe" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("recipe")}
              data-testid="button-mode-recipe"
            >
              <ChefHat className="w-4 h-4 mr-1" /> Link Recipe
            </Button>
            <Button
              variant={mode === "sop" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("sop")}
              data-testid="button-mode-sop"
            >
              <BookOpen className="w-4 h-4 mr-1" /> Link SOP
            </Button>
          </div>

          {mode === "manual" ? (
            <div>
              <label className="text-sm font-medium">Task Name</label>
              <Input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. Turn on ovens"
                data-testid="input-manual-title"
              />
            </div>
          ) : mode === "job" ? (
            <div>
              <label className="text-sm font-medium">Select Job</label>
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">No saved jobs yet. Create some in the Jobs Library tab first.</p>
              ) : (
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger data-testid="select-job">
                    <SelectValue placeholder="Choose a job..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={String(j.id)}>
                        {j.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : mode === "sop" ? (
            <div>
              <label className="text-sm font-medium">Select SOP</label>
              {sops.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">No SOPs available.</p>
              ) : (
                <Select value={selectedSopId} onValueChange={setSelectedSopId}>
                  <SelectTrigger data-testid="select-sop">
                    <SelectValue placeholder="Choose an SOP..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sops.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium">Select Recipe</label>
              {recipes.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">No recipes available.</p>
              ) : (
                <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
                  <SelectTrigger data-testid="select-recipe">
                    <SelectValue placeholder="Choose a recipe..." />
                  </SelectTrigger>
                  <SelectContent>
                    {recipes.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Start Time (optional)</label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                data-testid="input-start-time"
              />
            </div>
            <div>
              <label className="text-sm font-medium">End Time (optional)</label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                data-testid="input-end-time"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || addSopMut.isPending} data-testid="button-submit-item">
              {createMut.isPending || addSopMut.isPending ? "Adding..." : mode === "sop" ? "Add SOP Steps" : "Add Task"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentTodosPanel() {
  const [department, setDepartment] = useState("bakery");
  const { toast } = useToast();

  const { data: todos, isLoading } = useQuery<DepartmentTodo[]>({
    queryKey: ["/api/department-todos", department],
    queryFn: () => fetch(`/api/department-todos/${department}`).then(r => r.json()),
  });

  const completeMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/department-todos/${id}/complete`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/department-todos", department] });
      toast({ title: "Task completed" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Department To-Do</h2>
          <p className="text-sm text-muted-foreground">Uncompleted tasks rolled over from assigned task lists.</p>
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[160px]" data-testid="select-dept-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bakery">Bakery</SelectItem>
            <SelectItem value="kitchen">Kitchen</SelectItem>
            <SelectItem value="bar">Bar</SelectItem>
            <SelectItem value="foh">FOH</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
      ) : !todos || todos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-dept-todos">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
          No pending tasks for the {department} department. All caught up!
        </div>
      ) : (
        <div className="space-y-3">
          {todos.map((todo) => (
            <Card key={todo.id} data-testid={`card-dept-todo-${todo.id}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <Checkbox
                  checked={false}
                  onCheckedChange={() => completeMut.mutate(todo.id)}
                  data-testid={`checkbox-dept-todo-${todo.id}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{todo.itemTitle}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {todo.originalDate && (
                      <span className="text-xs text-muted-foreground">From: {todo.originalDate}</span>
                    )}
                    {todo.recipeId && (
                      <Badge variant="secondary" className="text-xs">
                        <ChefHat className="w-3 h-3 mr-1" /> Recipe
                      </Badge>
                    )}
                    {todo.sopId && (
                      <Badge variant="secondary" className="text-xs">
                        <BookOpen className="w-3 h-3 mr-1" /> SOP
                      </Badge>
                    )}
                  </div>
                </div>
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function JobsPanel() {
  const { data: jobs, isLoading } = useQuery<TaskJob[]>({
    queryKey: ["/api/task-jobs"],
  });
  const { data: allSOPs } = useQuery<SOP[]>({ queryKey: ["/api/sops"] });
  const { data: recipes } = useQuery<Recipe[]>({ queryKey: ["/api/recipes"] });
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/task-jobs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-jobs"] });
      toast({ title: "Job deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Saved Jobs</h2>
          <p className="text-sm text-muted-foreground">Reusable activities you can add to any task list. Link to SOPs or recipes.</p>
        </div>
        <CreateJobDialog open={createOpen} onOpenChange={setCreateOpen} sops={allSOPs || []} recipes={recipes || []} />
      </div>

      {isLoading ? (
        Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
      ) : jobs?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-jobs">
          No saved jobs yet. Create one to reuse across task lists.
        </div>
      ) : (
        <div className="grid gap-3">
          {jobs?.map((job) => {
            const linkedSop = allSOPs?.find((s) => s.id === job.sopId);
            const linkedRecipe = recipes?.find((r) => r.id === job.recipeId);
            return (
              <Card key={job.id} data-testid={`card-job-${job.id}`}>
                <CardContent className="flex items-center justify-between p-4 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-md bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{job.name}</h3>
                      {job.description && (
                        <p className="text-sm text-muted-foreground truncate">{job.description}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {linkedSop && (
                          <Badge variant="secondary" className="text-xs">
                            <Link2 className="w-3 h-3 mr-1" /> {linkedSop.title}
                          </Badge>
                        )}
                        {linkedRecipe && (
                          <Badge variant="secondary" className="text-xs">
                            <ChefHat className="w-3 h-3 mr-1" /> {linkedRecipe.title}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive flex-shrink-0"
                    onClick={() => deleteMut.mutate(job.id)}
                    data-testid={`button-delete-job-${job.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateJobDialog({ open, onOpenChange, sops, recipes }: { open: boolean; onOpenChange: (v: boolean) => void; sops: SOP[]; recipes: Recipe[] }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sopId, setSopId] = useState<string>("");
  const [recipeId, setRecipeId] = useState<string>("");

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/task-jobs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-jobs"] });
      toast({ title: "Job created" });
      resetForm();
      onOpenChange(false);
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setSopId("");
    setRecipeId("");
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Job name is required", variant: "destructive" });
      return;
    }
    createMut.mutate({
      name: name.trim(),
      description: description.trim() || null,
      sopId: sopId && sopId !== "none" ? parseInt(sopId) : null,
      recipeId: recipeId && recipeId !== "none" ? parseInt(recipeId) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-job">
          <Plus className="w-4 h-4 mr-2" /> New Job
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Saved Job</DialogTitle>
          <DialogDescription>Create a reusable job that can be added to any task list.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Job Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sanitize mixer"
              data-testid="input-job-name"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief notes about this job..."
              className="min-h-[80px]"
              data-testid="input-job-description"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Link to SOP (optional)</label>
            <Select value={sopId} onValueChange={setSopId}>
              <SelectTrigger data-testid="select-sop">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {sops.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Link to Recipe (optional)</label>
            <Select value={recipeId} onValueChange={setRecipeId}>
              <SelectTrigger data-testid="select-recipe-job">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {recipes.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending} data-testid="button-submit-job">
              {createMut.isPending ? "Creating..." : "Create Job"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
