import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, ClipboardList, Briefcase, Clock, Printer, ArrowLeft,
  FileText, Link2, ChevronRight, GripVertical, Edit2, CheckCircle2
} from "lucide-react";
import type { TaskJob, TaskList, TaskListItem, SOP } from "@shared/schema";
import ReactMarkdown from "react-markdown";

type TaskListWithItems = TaskList & {
  items: (TaskListItem & { job?: TaskJob | null })[];
};

export default function TaskManager() {
  const [activeTab, setActiveTab] = useState<"lists" | "jobs">("lists");
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  if (selectedListId) {
    return <TaskListDetail listId={selectedListId} onBack={() => setSelectedListId(null)} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500" data-testid="container-task-manager">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-task-manager-title">Jarvis Task Manager</h1>
          <p className="text-muted-foreground">Create task lists and manage reusable jobs.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
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
      </div>

      {activeTab === "lists" ? (
        <TaskListsPanel onSelectList={setSelectedListId} />
      ) : (
        <JobsPanel />
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
  const form = useForm({
    defaultValues: { title: "", description: "" },
  });

  const createMut = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      const res = await apiRequest("POST", "/api/task-lists", data);
      return res.json();
    },
    onSuccess: (list: TaskList) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
      form.reset();
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
        <form onSubmit={form.handleSubmit((d) => createMut.mutate(d))} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input {...form.register("title", { required: true })} placeholder="e.g. Morning Opening Checklist" data-testid="input-list-title" />
          </div>
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Input {...form.register("description")} placeholder="Brief description..." data-testid="input-list-description" />
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
  const { data: list, isLoading } = useQuery<TaskListWithItems>({
    queryKey: ["/api/task-lists", listId],
  });
  const { data: jobs } = useQuery<TaskJob[]>({ queryKey: ["/api/task-jobs"] });
  const { data: allSOPs } = useQuery<SOP[]>({ queryKey: ["/api/sops"] });
  const { toast } = useToast();
  const [addItemOpen, setAddItemOpen] = useState(false);

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-task-list-detail">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-lists">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-bold truncate" data-testid="text-list-title">{list.title}</h1>
          {list.description && <p className="text-sm text-muted-foreground">{list.description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
                        {item.job?.sopId && (
                          <Badge variant="secondary" className="text-xs">
                            <Link2 className="w-3 h-3 mr-1" /> SOP linked
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
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        nextOrder={list.items.length}
      />
    </div>
  );
}

function AddItemDialog({ listId, jobs, open, onOpenChange, nextOrder }: {
  listId: number;
  jobs: TaskJob[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nextOrder: number;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"job" | "manual">("manual");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
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

  const resetForm = () => {
    setMode("manual");
    setSelectedJobId("");
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
    } else if (mode === "manual" && manualTitle.trim()) {
      payload.manualTitle = manualTitle.trim();
    } else {
      toast({ title: "Please enter a task or select a job", variant: "destructive" });
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
          <DialogDescription>Choose a saved job or type a custom task.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
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
          ) : (
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
            <Button onClick={handleSubmit} disabled={createMut.isPending} data-testid="button-submit-item">
              {createMut.isPending ? "Adding..." : "Add Task"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JobsPanel() {
  const { data: jobs, isLoading } = useQuery<TaskJob[]>({
    queryKey: ["/api/task-jobs"],
  });
  const { data: allSOPs } = useQuery<SOP[]>({ queryKey: ["/api/sops"] });
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
          <p className="text-sm text-muted-foreground">Reusable activities you can add to any task list. Link to SOPs for printed reference.</p>
        </div>
        <CreateJobDialog open={createOpen} onOpenChange={setCreateOpen} sops={allSOPs || []} />
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
                      {linkedSop && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          <Link2 className="w-3 h-3 mr-1" /> {linkedSop.title}
                        </Badge>
                      )}
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

function CreateJobDialog({ open, onOpenChange, sops }: { open: boolean; onOpenChange: (v: boolean) => void; sops: SOP[] }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sopId, setSopId] = useState<string>("");

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
