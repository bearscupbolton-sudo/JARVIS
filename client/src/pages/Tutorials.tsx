import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { GraduationCap, Plus, Pencil, Trash2, RotateCcw, Video, FileText, Eye } from "lucide-react";
import type { Tutorial } from "@shared/schema";

const PAGE_OPTIONS = [
  { value: "/", label: "Home" },
  { value: "/dashboard", label: "Dashboard" },
  { value: "/bakery", label: "Bakery" },
  { value: "/coffee", label: "Coffee Command" },
  { value: "/kitchen", label: "Kitchen" },
  { value: "/recipes", label: "Recipes" },
  { value: "/production", label: "Production" },
  { value: "/sops", label: "SOPs" },
  { value: "/assistant", label: "Jarvis Assistant" },
  { value: "/test-kitchen", label: "Test Kitchen" },
  { value: "/inventory", label: "Inventory" },
  { value: "/inventory/invoices", label: "Invoice Capture" },
  { value: "/inventory/count", label: "Inventory Count" },
  { value: "/vendors", label: "Vendors" },
  { value: "/schedule", label: "Schedule" },
  { value: "/calendar", label: "Calendar" },
  { value: "/time-cards", label: "Time Cards" },
  { value: "/time-review", label: "Time Review" },
  { value: "/tasks", label: "Task Manager" },
  { value: "/lamination", label: "Lamination Studio" },
  { value: "/pastry-passports", label: "Pastry Passports" },
  { value: "/pastry-goals", label: "Pastry Goals" },
  { value: "/live-inventory", label: "Live Inventory" },
  { value: "/messages", label: "Messages" },
  { value: "/notes", label: "Notes" },
  { value: "/maintenance", label: "Maintenance Hub" },
  { value: "/prep-eq", label: "Prep EQ" },
  { value: "/jmt", label: "Menu Theater" },
  { value: "/the-firm", label: "The Firm" },
  { value: "/admin/users", label: "Admin Users" },
  { value: "/admin/ttis", label: "TTIS" },
  { value: "/admin/insights", label: "Admin Insights" },
  { value: "/payroll", label: "Payroll Review" },
  { value: "/hr", label: "HR" },
  { value: "/sentiment", label: "Sentiment Matrix" },
  { value: "/loop", label: "The Loop" },
  { value: "/profile", label: "Profile" },
  { value: "/starkade", label: "Starkade" },
];

const DEPT_OPTIONS = [
  { value: "all", label: "All Departments" },
  { value: "foh", label: "FOH" },
  { value: "bakery", label: "Bakery" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bar", label: "Bar" },
];

const ROLE_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
];

const emptyForm = {
  pagePath: "/",
  pageLabel: "Home",
  title: "",
  description: "",
  videoUrl: "",
  textContent: "",
  targetDepartment: "all",
  targetRole: "all",
  isActive: true,
  sortOrder: 0,
};

export default function Tutorials() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [previewTutorial, setPreviewTutorial] = useState<Tutorial | null>(null);

  const { data: allTutorials = [], isLoading } = useQuery<Tutorial[]>({
    queryKey: ["/api/tutorials"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tutorials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutorials"] });
      toast({ title: "Tutorial created" });
      setShowForm(false);
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/tutorials/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutorials"] });
      toast({ title: "Tutorial updated" });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tutorials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutorials"] });
      toast({ title: "Tutorial deleted" });
    },
  });

  const resetViewsMutation = useMutation({
    mutationFn: (tutorialId?: number) => apiRequest("POST", "/api/tutorials/reset-views", { tutorialId }),
    onSuccess: () => {
      toast({ title: "Views reset — tutorial will show again for everyone" });
    },
  });

  function handleSubmit() {
    const data = {
      ...form,
      targetDepartment: form.targetDepartment === "all" ? null : form.targetDepartment || null,
      targetRole: form.targetRole === "all" ? null : form.targetRole || null,
      videoUrl: form.videoUrl || null,
      textContent: form.textContent || null,
      description: form.description || null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  }

  function startEdit(t: Tutorial) {
    setForm({
      pagePath: t.pagePath,
      pageLabel: t.pageLabel,
      title: t.title,
      description: t.description || "",
      videoUrl: t.videoUrl || "",
      textContent: t.textContent || "",
      targetDepartment: t.targetDepartment || "all",
      targetRole: t.targetRole || "all",
      isActive: t.isActive ?? true,
      sortOrder: t.sortOrder ?? 0,
    });
    setEditingId(t.id);
    setShowForm(true);
  }

  function handlePageChange(val: string) {
    const page = PAGE_OPTIONS.find(p => p.value === val);
    setForm(f => ({ ...f, pagePath: val, pageLabel: page?.label || val }));
  }

  const grouped = allTutorials.reduce<Record<string, Tutorial[]>>((acc, t) => {
    const key = t.pageLabel || t.pagePath;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <GraduationCap className="w-6 h-6 text-primary" />
            Tutorials
          </h1>
          <p className="text-sm text-muted-foreground">Manage first-visit tutorial videos and guides for each page</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => resetViewsMutation.mutate(undefined)} disabled={resetViewsMutation.isPending} data-testid="button-reset-all-views">
            <RotateCcw className="w-4 h-4 mr-1.5" />Reset All
          </Button>
          <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingId(null); setForm(emptyForm); } else setShowForm(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-tutorial">
                <Plus className="w-4 h-4 mr-1.5" />Add Tutorial
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Tutorial" : "New Tutorial"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Page</label>
                  <Select value={form.pagePath} onValueChange={handlePageChange}>
                    <SelectTrigger data-testid="select-tutorial-page"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {PAGE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Title</label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Welcome to the Schedule" data-testid="input-tutorial-title" />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief intro text shown above the video" data-testid="input-tutorial-description" />
                </div>
                <div>
                  <label className="text-sm font-medium">Video URL</label>
                  <Input value={form.videoUrl} onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))} placeholder="https://... or /uploads/tutorial.mp4" data-testid="input-tutorial-video" />
                  <p className="text-[10px] text-muted-foreground mt-1">YouTube, Vimeo, or direct video link</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Text Content (optional, shows if no video)</label>
                  <Textarea value={form.textContent} onChange={e => setForm(f => ({ ...f, textContent: e.target.value }))} rows={4} placeholder="Step-by-step instructions..." data-testid="input-tutorial-text" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Department</label>
                    <Select value={form.targetDepartment} onValueChange={v => setForm(f => ({ ...f, targetDepartment: v }))}>
                      <SelectTrigger data-testid="select-tutorial-dept"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEPT_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Role</label>
                    <Select value={form.targetRole} onValueChange={v => setForm(f => ({ ...f, targetRole: v }))}>
                      <SelectTrigger data-testid="select-tutorial-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Active</label>
                  <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} data-testid="switch-tutorial-active" />
                </div>
                <div>
                  <label className="text-sm font-medium">Sort Order</label>
                  <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} data-testid="input-tutorial-sort" />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending || !form.title} data-testid="button-submit-tutorial">
                  {editingId ? "Update Tutorial" : "Create Tutorial"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading tutorials...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No tutorials yet. Click "Add Tutorial" to create your first one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([pageLabel, items]) => (
            <Card key={pageLabel} data-testid={`card-tutorial-group-${pageLabel}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display">{pageLabel}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {items.map(t => (
                  <div key={t.id} className="flex items-start gap-3 p-3 rounded-md border border-border" data-testid={`card-tutorial-${t.id}`}>
                    <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 bg-primary/10">
                      {t.videoUrl ? <Video className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{t.title}</span>
                        {!t.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        {t.targetDepartment && <Badge variant="outline" className="text-[10px] capitalize">{t.targetDepartment}</Badge>}
                        {t.targetRole && <Badge variant="outline" className="text-[10px] capitalize">{t.targetRole}</Badge>}
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPreviewTutorial(t)} data-testid={`button-preview-tutorial-${t.id}`}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => resetViewsMutation.mutate(t.id)} title="Reset views for this tutorial" data-testid={`button-reset-tutorial-${t.id}`}>
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)} data-testid={`button-edit-tutorial-${t.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(t.id)} data-testid={`button-delete-tutorial-${t.id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewTutorial} onOpenChange={(open) => { if (!open) setPreviewTutorial(null); }}>
        <DialogContent className="max-w-lg">
          {previewTutorial && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-primary" />
                  {previewTutorial.title}
                </DialogTitle>
              </DialogHeader>
              {previewTutorial.description && <p className="text-sm text-muted-foreground">{previewTutorial.description}</p>}
              {previewTutorial.videoUrl && (
                <div className="rounded-lg overflow-hidden bg-black aspect-video">
                  <video src={previewTutorial.videoUrl} controls className="w-full h-full object-contain" />
                </div>
              )}
              {previewTutorial.textContent && (
                <div className="rounded-lg bg-muted/50 border border-border p-4 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {previewTutorial.textContent}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}