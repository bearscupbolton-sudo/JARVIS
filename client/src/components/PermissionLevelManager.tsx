import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PermissionLevel } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Shield, ChevronDown, ChevronRight, Users, RefreshCw } from "lucide-react";
import { PAGE_SECTIONS } from "@/hooks/use-section-visibility";

const LEVEL_COLORS = [
  { value: "blue", label: "Blue", class: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "green", label: "Green", class: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  { value: "purple", label: "Purple", class: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { value: "amber", label: "Amber", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "red", label: "Red", class: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  { value: "teal", label: "Teal", class: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  { value: "pink", label: "Pink", class: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  { value: "indigo", label: "Indigo", class: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
];

export function getColorClass(color: string | null): string {
  return LEVEL_COLORS.find(c => c.value === color)?.class || "bg-muted text-muted-foreground";
}

const ALL_SIDEBAR_ITEMS = [
  { group: "Navigation", items: [
    { href: "/", label: "Home" },
    { href: "/messages", label: "Messages" },
    { href: "/notes", label: "Notes" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/bakery", label: "Bakery" },
    { href: "/coffee", label: "Coffee" },
    { href: "/kitchen", label: "Kitchen" },
    { href: "/recipes", label: "Recipes" },
    { href: "/pastry-passports", label: "Pastry Passports" },
    { href: "/lamination", label: "Lamination Studio" },
    { href: "/production", label: "Production Logs" },
    { href: "/sops", label: "SOPs" },
    { href: "/test-kitchen", label: "Test Kitchen" },
    { href: "/inventory", label: "Inventory" },
    { href: "/vendors", label: "Vendors" },
    { href: "/schedule", label: "Schedule" },
    { href: "/calendar", label: "Calendar" },
    { href: "/time-cards", label: "Time Cards" },
    { href: "/tasks", label: "Task Manager" },
    { href: "/assistant", label: "Jarvis" },
    { href: "/starkade", label: "Starkade" },
    { href: "/kiosk", label: "Kiosk Mode" },
    { href: "/bagel-bros", label: "Bagel Bros" },
  ]},
  { group: "Admin", items: [
    { href: "/admin/users", label: "Team" },
    { href: "/hr", label: "HR" },
    { href: "/mll", label: "MLL" },
    { href: "/time-review", label: "Time Review" },
    { href: "/admin/pastry-items", label: "Master Pastry List" },
    { href: "/pastry-goals", label: "Pastry Goals" },
    { href: "/loop", label: "The Loop" },
    { href: "/admin/approvals", label: "Approvals" },
    { href: "/admin/ttis", label: "TTIS" },
    { href: "/sentiment", label: "Sentiment Matrix" },
    { href: "/admin/square", label: "Square Settings" },
    { href: "/admin/insights", label: "Insights" },
    { href: "/live-inventory", label: "Live Inventory" },
    { href: "/dev-feedback", label: "Dev Feedback" },
  ]},
];

const ALL_HREFS = ALL_SIDEBAR_ITEMS.flatMap(g => g.items.map(i => i.href));

interface User {
  id: string;
  permissionLevelId?: number | null;
  [key: string]: any;
}

export default function PermissionLevelManager({ users }: { users?: User[] }) {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<PermissionLevel | null>(null);

  const { data: levels, isLoading } = useQuery<PermissionLevel[]>({
    queryKey: ["/api/admin/permission-levels"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/permission-levels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permission-levels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Permission level deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/permission-levels/${id}/sync`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: `Synced ${data.synced} team member${data.synced !== 1 ? "s" : ""}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to sync", description: err.message, variant: "destructive" });
    },
  });

  const getUserCount = (levelId: number) => users?.filter(u => u.permissionLevelId === levelId).length || 0;

  const handleEdit = (level: PermissionLevel) => {
    setEditingLevel(level);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingLevel(null);
    setEditorOpen(true);
  };

  const handleDelete = (level: PermissionLevel) => {
    const count = getUserCount(level.id);
    const msg = count > 0
      ? `This will remove "${level.name}" from ${count} team member${count !== 1 ? "s" : ""}. Continue?`
      : `Delete "${level.name}"?`;
    if (window.confirm(msg)) {
      deleteMutation.mutate(level.id);
    }
  };

  return (
    <div className="space-y-4" data-testid="container-permission-levels">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold" data-testid="text-permission-levels-title">Permission Levels</h2>
            <p className="text-sm text-muted-foreground">Create reusable access templates for your team</p>
          </div>
        </div>
        <Button onClick={handleCreate} data-testid="button-create-permission-level">
          <Plus className="w-4 h-4 mr-2" />
          Create Level
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : levels && levels.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {levels.map((level) => {
            const memberCount = getUserCount(level.id);
            const sidebarCount = level.sidebarPermissions ? level.sidebarPermissions.length : ALL_HREFS.length;
            const sectionCount = level.sectionPermissions
              ? Object.values(level.sectionPermissions).reduce((sum, arr) => sum + arr.length, 0)
              : Object.values(PAGE_SECTIONS).reduce((sum, arr) => sum + arr.length, 0);
            const totalSections = Object.values(PAGE_SECTIONS).reduce((sum, arr) => sum + arr.length, 0);

            return (
              <Card key={level.id} className="hover-elevate" data-testid={`card-permission-level-${level.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={getColorClass(level.color)} data-testid={`badge-level-${level.id}`}>
                          {level.name}
                        </Badge>
                      </div>
                      {level.description && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{level.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-lg font-semibold" data-testid={`text-level-members-${level.id}`}>{memberCount}</p>
                      <p className="text-[10px] text-muted-foreground">Members</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-lg font-semibold">{sidebarCount}</p>
                      <p className="text-[10px] text-muted-foreground">Pages</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-lg font-semibold">{sectionCount}/{totalSections}</p>
                      <p className="text-[10px] text-muted-foreground">Sections</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => handleEdit(level)} data-testid={`button-edit-level-${level.id}`}>
                      <Pencil className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    {memberCount > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => syncMutation.mutate(level.id)}
                        disabled={syncMutation.isPending}
                        title="Re-apply this level's permissions to all assigned members"
                        data-testid={`button-sync-level-${level.id}`}
                      >
                        <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      onClick={() => handleDelete(level)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-level-${level.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No permission levels created yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Create levels like "Lead Baker" or "Shift Lead" to standardize team access.</p>
            <Button variant="outline" className="mt-4" onClick={handleCreate} data-testid="button-create-first-level">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Level
            </Button>
          </CardContent>
        </Card>
      )}

      <PermissionLevelEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        existingLevel={editingLevel}
      />
    </div>
  );
}

function PermissionLevelEditor({
  open,
  onOpenChange,
  existingLevel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingLevel: PermissionLevel | null;
}) {
  const { toast } = useToast();
  const isEditing = !!existingLevel;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("blue");
  const [rank, setRank] = useState(0);
  const [sidebarPerms, setSidebarPerms] = useState<string[]>(ALL_HREFS);
  const [sectionPerms, setSectionPerms] = useState<Record<string, string[]>>(() => {
    const full: Record<string, string[]> = {};
    Object.entries(PAGE_SECTIONS).forEach(([p, sections]) => {
      full[p] = sections.map(s => s.key);
    });
    return full;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);

  const loadLevel = (level: PermissionLevel | null) => {
    if (level) {
      setName(level.name);
      setDescription(level.description || "");
      setColor(level.color || "blue");
      setRank(level.rank);
      setSidebarPerms(level.sidebarPermissions || ALL_HREFS);
      if (level.sectionPermissions) {
        const full: Record<string, string[]> = {};
        Object.entries(PAGE_SECTIONS).forEach(([p, sections]) => {
          full[p] = level.sectionPermissions && p in level.sectionPermissions
            ? [...level.sectionPermissions[p]]
            : sections.map(s => s.key);
        });
        setSectionPerms(full);
      } else {
        const full: Record<string, string[]> = {};
        Object.entries(PAGE_SECTIONS).forEach(([p, sections]) => {
          full[p] = sections.map(s => s.key);
        });
        setSectionPerms(full);
      }
    } else {
      setName("");
      setDescription("");
      setColor("blue");
      setRank(0);
      setSidebarPerms(ALL_HREFS);
      const full: Record<string, string[]> = {};
      Object.entries(PAGE_SECTIONS).forEach(([p, sections]) => {
        full[p] = sections.map(s => s.key);
      });
      setSectionPerms(full);
    }
    setSidebarOpen(false);
    setSectionsOpen(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (v) {
      loadLevel(existingLevel);
    }
    onOpenChange(v);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const isAllSidebar = sidebarPerms.length === ALL_HREFS.length;
      const isAllSections = Object.keys(PAGE_SECTIONS).every(p => {
        const allKeys = PAGE_SECTIONS[p].map(s => s.key);
        return sectionPerms[p] && sectionPerms[p].length >= allKeys.length;
      });

      const body = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        rank,
        sidebarPermissions: isAllSidebar ? null : sidebarPerms,
        sectionPermissions: isAllSections ? null : sectionPerms,
      };

      if (isEditing) {
        await apiRequest("PATCH", `/api/admin/permission-levels/${existingLevel!.id}`, body);
      } else {
        await apiRequest("POST", "/api/admin/permission-levels", body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permission-levels"] });
      toast({ title: isEditing ? "Permission level updated" : "Permission level created" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const toggleSidebarItem = (href: string) => {
    setSidebarPerms(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    );
  };

  const toggleSection = (page: string, key: string) => {
    setSectionPerms(prev => {
      const pageArr = prev[page] || [];
      return {
        ...prev,
        [page]: pageArr.includes(key) ? pageArr.filter(k => k !== key) : [...pageArr, key],
      };
    });
  };

  const selectAllSidebar = () => setSidebarPerms(ALL_HREFS);
  const deselectAllSidebar = () => setSidebarPerms([]);

  const selectAllSections = () => {
    const full: Record<string, string[]> = {};
    Object.entries(PAGE_SECTIONS).forEach(([p, sections]) => {
      full[p] = sections.map(s => s.key);
    });
    setSectionPerms(full);
  };
  const deselectAllSections = () => {
    const empty: Record<string, string[]> = {};
    Object.keys(PAGE_SECTIONS).forEach(p => { empty[p] = []; });
    setSectionPerms(empty);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-permission-level-editor">
        <DialogHeader>
          <DialogTitle data-testid="text-level-editor-title">{isEditing ? "Edit Permission Level" : "Create Permission Level"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this permission level's name, access settings, and appearance."
              : "Define a new access template you can assign to team members."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Level Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Lead Baker", "Shift Lead", "FOH Lead"'
              data-testid="input-level-name"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief explanation of this level's purpose..."
              rows={2}
              data-testid="input-level-description"
            />
          </div>

          <div className="space-y-2">
            <Label>Badge Color</Label>
            <div className="flex flex-wrap gap-2">
              {LEVEL_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${c.class} ${
                    color === c.value ? "ring-2 ring-offset-2 ring-primary" : "opacity-70 hover:opacity-100"
                  }`}
                  data-testid={`button-color-${c.value}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Priority Rank</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={rank}
              onChange={(e) => setRank(parseInt(e.target.value) || 0)}
              className="w-24"
              data-testid="input-level-rank"
            />
            <p className="text-[11px] text-muted-foreground">Lower numbers appear first. Used for ordering the list.</p>
          </div>

          <div className="border-t pt-4">
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              data-testid="button-toggle-sidebar-access"
            >
              Sidebar Access
              <Badge variant="secondary" className="text-[10px] ml-auto mr-2">
                {sidebarPerms.length}/{ALL_HREFS.length}
              </Badge>
              {sidebarOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {sidebarOpen && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={selectAllSidebar} data-testid="button-sidebar-select-all">
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={deselectAllSidebar} data-testid="button-sidebar-deselect-all">
                    Deselect All
                  </Button>
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
                  {ALL_SIDEBAR_ITEMS.map((group) => (
                    <div key={group.group}>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 px-2">
                        {group.group}
                      </div>
                      {group.items.map((item) => (
                        <label
                          key={item.href}
                          className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                          data-testid={`level-sidebar-${item.href.replace(/\//g, "-")}`}
                        >
                          <Checkbox
                            checked={sidebarPerms.includes(item.href)}
                            onCheckedChange={() => toggleSidebarItem(item.href)}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
              onClick={() => setSectionsOpen(!sectionsOpen)}
              data-testid="button-toggle-page-sections"
            >
              Page Sections
              <Badge variant="secondary" className="text-[10px] ml-auto mr-2">
                {Object.values(sectionPerms).reduce((sum, arr) => sum + arr.length, 0)}/
                {Object.values(PAGE_SECTIONS).reduce((sum, arr) => sum + arr.length, 0)}
              </Badge>
              {sectionsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {sectionsOpen && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={selectAllSections} data-testid="button-sections-select-all">
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={deselectAllSections} data-testid="button-sections-deselect-all">
                    Deselect All
                  </Button>
                </div>
                <div className="max-h-[350px] overflow-y-auto space-y-3 pr-1">
                  {Object.entries(PAGE_SECTIONS).map(([page, sections]) => (
                    <div key={page}>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 px-2">
                        {page === "/" ? "Home" : page.replace(/^\//, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </div>
                      {sections.map((section) => (
                        <label
                          key={`${page}-${section.key}`}
                          className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                          data-testid={`level-section-${page.replace(/\//g, "-")}-${section.key}`}
                        >
                          <Checkbox
                            checked={(sectionPerms[page] || []).includes(section.key)}
                            onCheckedChange={() => toggleSection(page, section.key)}
                          />
                          <span>{section.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name.trim()}
            data-testid="button-save-permission-level"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Update Permission Level" : "Create Permission Level"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
