import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocationContext } from "@/hooks/use-location-context";
import { useToast } from "@/hooks/use-toast";
import type { Problem, ServiceContact, Equipment, EquipmentMaintenance, ProblemNote, ProblemContact } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Wrench, Plus, Search, Phone, Mail, Tag, AlertTriangle, CheckCircle2,
  Clock, Circle, ChevronDown, ChevronUp, MessageSquare, Link2, Trash2,
  Calendar, Settings, X, User, Building2, Zap, Filter
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "in-progress", label: "In Progress", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "needs-attention", label: "Needs Attention", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { value: "resolved", label: "Resolved", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
];

const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical", color: "bg-red-600 text-white" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "low", label: "Low", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
];

const EQUIPMENT_CATEGORIES = ["Oven", "Mixer", "HVAC", "Refrigeration", "Plumbing", "Electrical", "Display", "POS", "Other"];

function statusBadge(status: string) {
  const s = STATUS_OPTIONS.find(o => o.value === status);
  return <Badge data-testid={`badge-status-${status}`} className={s?.color || ""}>{s?.label || status}</Badge>;
}

function priorityBadge(priority: string) {
  const p = PRIORITY_OPTIONS.find(o => o.value === priority);
  return <Badge data-testid={`badge-priority-${priority}`} className={p?.color || ""}>{p?.label || priority}</Badge>;
}

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// =========== CONTACT DIALOG (shared between tabs) ===========
function ContactDialog({
  open, onClose, contact, onSaved, problemIdToLink,
}: {
  open: boolean;
  onClose: () => void;
  contact?: ServiceContact | null;
  onSaved?: (c: ServiceContact) => void;
  problemIdToLink?: number;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: contact?.name || "",
    company: contact?.company || "",
    phone: contact?.phone || "",
    email: contact?.email || "",
    specialty: contact?.specialty || "",
    notes: contact?.notes || "",
    tagsInput: (contact?.tags || []).join(", "),
    locationId: contact?.locationId?.toString() || "",
  });

  const { data: locations } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/service-contacts", data);
      return res.json();
    },
    onSuccess: (created: ServiceContact) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-contacts"] });
      if (problemIdToLink) {
        apiRequest("POST", `/api/problems/${problemIdToLink}/contacts`, { serviceContactId: created.id, role: "Linked" })
          .then(() => queryClient.invalidateQueries({ queryKey: ["/api/problems", problemIdToLink, "contacts"] }));
      }
      toast({ title: "Contact created" });
      onSaved?.(created);
      onClose();
    },
  });

  const updateMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/service-contacts/${contact!.id}`, data);
      return res.json();
    },
    onSuccess: (updated: ServiceContact) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-contacts"] });
      toast({ title: "Contact updated" });
      onSaved?.(updated);
      onClose();
    },
  });

  function submit() {
    const tags = form.tagsInput.split(",").map(t => t.trim()).filter(Boolean);
    const payload = {
      name: form.name,
      company: form.company || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      specialty: form.specialty || undefined,
      notes: form.notes || undefined,
      tags: tags.length > 0 ? tags : undefined,
      locationId: form.locationId ? Number(form.locationId) : undefined,
    };
    if (contact) updateMut.mutate(payload);
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Contact" : "New Service Contact"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input data-testid="input-contact-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Company</Label>
            <Input data-testid="input-contact-company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Phone</Label>
              <Input data-testid="input-contact-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input data-testid="input-contact-email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Specialty</Label>
            <Input data-testid="input-contact-specialty" placeholder="e.g. HVAC, Plumbing" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} />
          </div>
          <div>
            <Label>Tags (comma-separated)</Label>
            <Input data-testid="input-contact-tags" placeholder="emergency, refrigeration, 24hr" value={form.tagsInput} onChange={e => setForm(f => ({ ...f, tagsInput: e.target.value }))} />
          </div>
          <div>
            <Label>Location</Label>
            <Select value={form.locationId} onValueChange={v => setForm(f => ({ ...f, locationId: v === "all" ? "" : v }))}>
              <SelectTrigger data-testid="select-contact-location"><SelectValue placeholder="All Locations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations?.map((l: any) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea data-testid="input-contact-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button data-testid="button-cancel-contact" variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="button-save-contact" onClick={submit} disabled={!form.name || createMut.isPending || updateMut.isPending}>
            {createMut.isPending || updateMut.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== PROBLEMS TAB ===========
function ProblemsTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedLocationId } = useLocationContext();
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [contactForProblemId, setContactForProblemId] = useState<number | null>(null);
  const [linkContactMode, setLinkContactMode] = useState<number | null>(null);

  const qp = new URLSearchParams();
  if (statusFilter !== "all") qp.set("status", statusFilter);
  if (priorityFilter !== "all") qp.set("priority", priorityFilter);
  if (selectedLocationId) qp.set("locationId", selectedLocationId.toString());

  const { data: problems = [], isLoading } = useQuery<Problem[]>({
    queryKey: ["/api/problems", statusFilter, priorityFilter, selectedLocationId],
    queryFn: async () => {
      const res = await fetch(`/api/problems?${qp.toString()}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: teamMembers = [] } = useQuery<any[]>({ queryKey: ["/api/admin/users"] });
  const { data: equipmentList = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: allContacts = [] } = useQuery<ServiceContact[]>({ queryKey: ["/api/service-contacts"] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            {[{ value: "all", label: "All" }, ...STATUS_OPTIONS].map(s => (
              <Button
                key={s.value}
                data-testid={`filter-status-${s.value}`}
                size="sm"
                variant={statusFilter === s.value ? "default" : "outline"}
                onClick={() => setStatusFilter(s.value)}
              >
                {s.label}
              </Button>
            ))}
          </div>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger data-testid="filter-priority" className="w-32">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              {PRIORITY_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button data-testid="button-new-problem" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Problem
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : problems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No problems found</div>
      ) : (
        <div className="space-y-2">
          {problems.map(p => (
            <ProblemCard
              key={p.id}
              problem={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              teamMembers={teamMembers}
              equipmentList={equipmentList}
              allContacts={allContacts}
              onNewContact={(pid) => { setContactForProblemId(pid); setShowContactDialog(true); }}
              onLinkContact={(pid) => setLinkContactMode(linkContactMode === pid ? null : pid)}
              linkContactMode={linkContactMode === p.id}
            />
          ))}
        </div>
      )}

      {showNewDialog && (
        <NewProblemDialog
          onClose={() => setShowNewDialog(false)}
          equipmentList={equipmentList}
          teamMembers={teamMembers}
        />
      )}

      {showContactDialog && (
        <ContactDialog
          open
          onClose={() => { setShowContactDialog(false); setContactForProblemId(null); }}
          problemIdToLink={contactForProblemId || undefined}
        />
      )}
    </div>
  );
}

function ProblemCard({
  problem, expanded, onToggle, teamMembers, equipmentList, allContacts,
  onNewContact, onLinkContact, linkContactMode,
}: {
  problem: Problem;
  expanded: boolean;
  onToggle: () => void;
  teamMembers: any[];
  equipmentList: Equipment[];
  allContacts: ServiceContact[];
  onNewContact: (pid: number) => void;
  onLinkContact: (pid: number) => void;
  linkContactMode: boolean;
}) {
  const { toast } = useToast();
  const equip = equipmentList.find(e => e.id === problem.equipmentId);
  const assignedUser = teamMembers.find(u => u.id === problem.assignedTo);

  const updateMut = useMutation({
    mutationFn: async (data: Partial<Problem>) => {
      const res = await apiRequest("PATCH", `/api/problems/${problem.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/problems"] });
      toast({ title: "Problem updated" });
    },
  });

  return (
    <Card data-testid={`card-problem-${problem.id}`} className="overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
        data-testid={`button-toggle-problem-${problem.id}`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-medium truncate">{problem.title}</span>
            <div className="flex flex-wrap gap-1 items-center text-xs text-muted-foreground">
              {statusBadge(problem.status)}
              {priorityBadge(problem.priority)}
              {equip && <Badge variant="outline" className="text-xs"><Settings className="h-3 w-3 mr-1" />{equip.name}</Badge>}
              {assignedUser && <Badge variant="outline" className="text-xs"><User className="h-3 w-3 mr-1" />{assignedUser.firstName || assignedUser.username}</Badge>}
              {problem.createdAt && <span>{timeAgo(problem.createdAt)}</span>}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {expanded && (
        <ProblemDetail
          problem={problem}
          teamMembers={teamMembers}
          equipmentList={equipmentList}
          allContacts={allContacts}
          updateMut={updateMut}
          onNewContact={onNewContact}
          onLinkContact={onLinkContact}
          linkContactMode={linkContactMode}
        />
      )}
    </Card>
  );
}

function ProblemDetail({
  problem, teamMembers, equipmentList, allContacts, updateMut,
  onNewContact, onLinkContact, linkContactMode,
}: {
  problem: Problem;
  teamMembers: any[];
  equipmentList: Equipment[];
  allContacts: ServiceContact[];
  updateMut: any;
  onNewContact: (pid: number) => void;
  onLinkContact: (pid: number) => void;
  linkContactMode: boolean;
}) {
  const { toast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [linkRole, setLinkRole] = useState("Called");

  const { data: notes = [] } = useQuery<ProblemNote[]>({
    queryKey: ["/api/problems", problem.id, "notes"],
    queryFn: async () => { const r = await fetch(`/api/problems/${problem.id}/notes`, { credentials: "include" }); return r.json(); },
  });

  const { data: linkedContacts = [] } = useQuery<(ProblemContact & { contact?: ServiceContact })[]>({
    queryKey: ["/api/problems", problem.id, "contacts"],
    queryFn: async () => { const r = await fetch(`/api/problems/${problem.id}/contacts`, { credentials: "include" }); return r.json(); },
  });

  const addNoteMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/problems/${problem.id}/notes`, { content: noteText });
    },
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["/api/problems", problem.id, "notes"] });
      toast({ title: "Note added" });
    },
  });

  const linkMut = useMutation({
    mutationFn: async (contactId: number) => {
      await apiRequest("POST", `/api/problems/${problem.id}/contacts`, { serviceContactId: contactId, role: linkRole });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/problems", problem.id, "contacts"] });
      toast({ title: "Contact linked" });
    },
  });

  const unlinkMut = useMutation({
    mutationFn: async (linkId: number) => {
      await apiRequest("DELETE", `/api/problems/${problem.id}/contacts/${linkId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/problems", problem.id, "contacts"] });
    },
  });

  return (
    <div className="border-t px-4 pb-4 space-y-4">
      {problem.description && <p className="text-sm text-muted-foreground mt-3">{problem.description}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <Label className="text-xs">Status</Label>
          <Select
            value={problem.status}
            onValueChange={v => updateMut.mutate({ status: v })}
          >
            <SelectTrigger data-testid={`select-status-${problem.id}`} className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Priority</Label>
          <Select
            value={problem.priority}
            onValueChange={v => updateMut.mutate({ priority: v })}
          >
            <SelectTrigger data-testid={`select-priority-${problem.id}`} className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Assigned To</Label>
          <Select
            value={problem.assignedTo?.toString() || "none"}
            onValueChange={v => updateMut.mutate({ assignedTo: v === "none" ? null : v })}
          >
            <SelectTrigger data-testid={`select-assigned-${problem.id}`} className="h-8">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {teamMembers.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.firstName || u.username}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Equipment</Label>
          <Select
            value={problem.equipmentId?.toString() || "none"}
            onValueChange={v => updateMut.mutate({ equipmentId: v === "none" ? null : Number(v) })}
          >
            <SelectTrigger data-testid={`select-equipment-${problem.id}`} className="h-8">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {equipmentList.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notes Section */}
      <div>
        <h4 className="text-sm font-medium flex items-center gap-1 mb-2"><MessageSquare className="h-4 w-4" /> Notes</h4>
        {notes.length > 0 && (
          <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
            {notes.map(n => (
              <div key={n.id} data-testid={`note-${n.id}`} className="text-sm bg-muted/50 rounded p-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span className="font-medium">{n.authorName}</span>
                  <span>{n.createdAt ? timeAgo(n.createdAt) : ""}</span>
                </div>
                <p>{n.content}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            data-testid={`input-note-${problem.id}`}
            placeholder="Add a note..."
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && noteText.trim() && addNoteMut.mutate()}
          />
          <Button data-testid={`button-add-note-${problem.id}`} size="sm" disabled={!noteText.trim() || addNoteMut.isPending} onClick={() => addNoteMut.mutate()}>
            Add
          </Button>
        </div>
      </div>

      {/* Linked Contacts Section */}
      <div>
        <h4 className="text-sm font-medium flex items-center gap-1 mb-2"><Link2 className="h-4 w-4" /> Contacts</h4>
        {linkedContacts.length > 0 && (
          <div className="space-y-1 mb-2">
            {linkedContacts.map((lc: any) => (
              <div key={lc.id} data-testid={`linked-contact-${lc.id}`} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                <span>{lc.contact?.name || `Contact #${lc.serviceContactId}`} {lc.role && <Badge variant="outline" className="ml-1 text-xs">{lc.role}</Badge>}</span>
                <Button data-testid={`button-unlink-contact-${lc.id}`} variant="ghost" size="sm" onClick={() => unlinkMut.mutate(lc.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button data-testid={`button-link-contact-${problem.id}`} variant="outline" size="sm" onClick={() => onLinkContact(problem.id)}>
            <Link2 className="h-3 w-3 mr-1" /> Link Contact
          </Button>
          <Button data-testid={`button-new-contact-${problem.id}`} variant="outline" size="sm" onClick={() => onNewContact(problem.id)}>
            <Plus className="h-3 w-3 mr-1" /> New Contact
          </Button>
        </div>
        {linkContactMode && (
          <div className="mt-2 p-2 border rounded space-y-2">
            <div className="flex gap-2">
              <Select value={linkRole} onValueChange={setLinkRole}>
                <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Called", "Dispatched", "Quoted", "Scheduled", "Completed"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {allContacts.map(c => (
                <Button
                  key={c.id}
                  data-testid={`button-pick-contact-${c.id}`}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => { linkMut.mutate(c.id); onLinkContact(problem.id); }}
                >
                  {c.name} {c.company && <span className="text-muted-foreground ml-1">({c.company})</span>}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewProblemDialog({ onClose, equipmentList, teamMembers }: { onClose: () => void; equipmentList: Equipment[]; teamMembers: any[] }) {
  const { toast } = useToast();
  const { selectedLocationId } = useLocationContext();
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium", severity: "medium",
    locationId: selectedLocationId?.toString() || "", equipmentId: "", assignedTo: "",
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        severity: form.severity,
        status: "open",
        locationId: form.locationId ? Number(form.locationId) : undefined,
        equipmentId: form.equipmentId ? Number(form.equipmentId) : undefined,
        assignedTo: form.assignedTo || undefined,
      };
      await apiRequest("POST", "/api/problems", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/problems"] });
      toast({ title: "Problem created" });
      onClose();
    },
  });

  const { data: locations } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Problem</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input data-testid="input-problem-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea data-testid="input-problem-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger data-testid="select-problem-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={form.locationId} onValueChange={v => setForm(f => ({ ...f, locationId: v === "none" ? "" : v }))}>
                <SelectTrigger data-testid="select-problem-location"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {locations?.map((l: any) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Equipment</Label>
              <Select value={form.equipmentId} onValueChange={v => setForm(f => ({ ...f, equipmentId: v === "none" ? "" : v }))}>
                <SelectTrigger data-testid="select-problem-equipment"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {equipmentList.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign To</Label>
              <Select value={form.assignedTo} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "none" ? "" : v }))}>
                <SelectTrigger data-testid="select-problem-assigned"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {teamMembers.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.firstName || u.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button data-testid="button-cancel-problem" variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="button-save-problem" onClick={() => createMut.mutate()} disabled={!form.title || createMut.isPending}>
            {createMut.isPending ? "Creating..." : "Create Problem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== EQUIPMENT TAB ===========
function EquipmentTab() {
  const { toast } = useToast();
  const { selectedLocationId } = useLocationContext();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editEquipment, setEditEquipment] = useState<Equipment | null>(null);

  const { data: items = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment", selectedLocationId, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      else if (selectedLocationId) params.set("locationId", selectedLocationId.toString());
      const r = await fetch(`/api/equipment?${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const { data: overdue = [] } = useQuery<any[]>({
    queryKey: ["/api/equipment/maintenance/overdue", selectedLocationId],
    queryFn: async () => {
      const params = selectedLocationId ? `?locationId=${selectedLocationId}` : "";
      const r = await fetch(`/api/equipment/maintenance/overdue${params}`, { credentials: "include" });
      return r.json();
    },
  });

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <div data-testid="alert-overdue-maintenance" className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <span className="text-sm font-medium text-red-800 dark:text-red-200">
            {overdue.length} overdue maintenance item{overdue.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="flex gap-2 items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-equipment-search"
            placeholder="Search equipment..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button data-testid="button-new-equipment" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Equipment
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No equipment found</div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <EquipmentCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onEdit={() => setEditEquipment(item)}
              overdue={overdue}
            />
          ))}
        </div>
      )}

      {(showNewDialog || editEquipment) && (
        <EquipmentDialog
          equipment={editEquipment}
          onClose={() => { setShowNewDialog(false); setEditEquipment(null); }}
        />
      )}
    </div>
  );
}

function EquipmentCard({ item, expanded, onToggle, onEdit, overdue }: {
  item: Equipment; expanded: boolean; onToggle: () => void; onEdit: () => void; overdue: any[];
}) {
  const itemOverdue = overdue.filter((o: any) => o.equipmentId === item.id);

  return (
    <Card data-testid={`card-equipment-${item.id}`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
        data-testid={`button-toggle-equipment-${item.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{item.name}</span>
              <Badge variant="outline" className="text-xs">{item.category}</Badge>
              {itemOverdue.length > 0 && (
                <Badge className="bg-red-600 text-white text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                </Badge>
              )}
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              {item.make && <span>{item.make}</span>}
              {item.model && <span>{item.model}</span>}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>
      {expanded && <EquipmentDetail item={item} onEdit={onEdit} />}
    </Card>
  );
}

function EquipmentDetail({ item, onEdit }: { item: Equipment; onEdit: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);

  const { data: schedules = [] } = useQuery<EquipmentMaintenance[]>({
    queryKey: ["/api/equipment", item.id, "maintenance"],
    queryFn: async () => { const r = await fetch(`/api/equipment/${item.id}/maintenance`, { credentials: "include" }); return r.json(); },
  });

  const completeMut = useMutation({
    mutationFn: async (schedule: EquipmentMaintenance) => {
      const today = new Date().toISOString().split("T")[0];
      const updates: any = { lastCompletedDate: today };
      if (schedule.frequencyDays) {
        const next = new Date();
        next.setDate(next.getDate() + schedule.frequencyDays);
        updates.nextDueDate = next.toISOString().split("T")[0];
      }
      await apiRequest("PATCH", `/api/equipment/maintenance/${schedule.id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", item.id, "maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/maintenance/overdue"] });
      toast({ title: "Maintenance completed" });
    },
  });

  const deleteMaintMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/equipment/maintenance/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", item.id, "maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/maintenance/overdue"] });
    },
  });

  const deleteEquipMut = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/equipment/${item.id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Equipment deleted" });
    },
  });

  const isOverdue = (s: EquipmentMaintenance) => s.nextDueDate && new Date(s.nextDueDate) < new Date();

  return (
    <div className="border-t px-4 pb-4 space-y-4">
      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        {item.serialNumber && <div><span className="text-muted-foreground">Serial:</span> {item.serialNumber}</div>}
        {item.installDate && <div><span className="text-muted-foreground">Installed:</span> {item.installDate}</div>}
        {item.tags && item.tags.length > 0 && (
          <div className="col-span-2 flex gap-1 flex-wrap">
            {item.tags.map((t, i) => <Badge key={i} variant="secondary" className="text-xs"><Tag className="h-3 w-3 mr-1" />{t}</Badge>)}
          </div>
        )}
        {item.notes && <div className="col-span-2 text-muted-foreground">{item.notes}</div>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium flex items-center gap-1"><Calendar className="h-4 w-4" /> Maintenance Schedule</h4>
          <Button data-testid={`button-add-maintenance-${item.id}`} variant="outline" size="sm" onClick={() => setShowMaintenanceDialog(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {schedules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No maintenance scheduled</p>
        ) : (
          <div className="space-y-1">
            {schedules.map(s => (
              <div key={s.id} data-testid={`maintenance-${s.id}`} className={`flex items-center justify-between text-sm rounded px-2 py-1.5 ${isOverdue(s) ? "bg-red-50 dark:bg-red-950" : "bg-muted/50"}`}>
                <div>
                  <span className="font-medium">{s.title}</span>
                  {s.frequencyDays && <span className="text-xs text-muted-foreground ml-2">Every {s.frequencyDays}d</span>}
                  {s.nextDueDate && (
                    <span className={`text-xs ml-2 ${isOverdue(s) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      Due: {s.nextDueDate}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button data-testid={`button-complete-maintenance-${s.id}`} variant="ghost" size="sm" onClick={() => completeMut.mutate(s)} title="Mark Complete">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button data-testid={`button-delete-maintenance-${s.id}`} variant="ghost" size="sm" onClick={() => deleteMaintMut.mutate(s.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <Button data-testid={`button-edit-equipment-${item.id}`} variant="outline" size="sm" onClick={onEdit}>Edit</Button>
        {user?.role === "owner" && (
          <Button data-testid={`button-delete-equipment-${item.id}`} variant="destructive" size="sm" onClick={() => deleteEquipMut.mutate()}>Delete</Button>
        )}
      </div>

      {showMaintenanceDialog && (
        <MaintenanceDialog equipmentId={item.id} onClose={() => setShowMaintenanceDialog(false)} />
      )}
    </div>
  );
}

function EquipmentDialog({ equipment, onClose }: { equipment: Equipment | null; onClose: () => void }) {
  const { toast } = useToast();
  const { selectedLocationId } = useLocationContext();
  const [form, setForm] = useState({
    name: equipment?.name || "",
    category: equipment?.category || "Other",
    make: equipment?.make || "",
    model: equipment?.model || "",
    serialNumber: equipment?.serialNumber || "",
    locationId: equipment?.locationId?.toString() || selectedLocationId?.toString() || "",
    installDate: equipment?.installDate || "",
    notes: equipment?.notes || "",
    tagsInput: (equipment?.tags || []).join(", "),
  });

  const { data: locations } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const saveMut = useMutation({
    mutationFn: async () => {
      const tags = form.tagsInput.split(",").map(t => t.trim()).filter(Boolean);
      const payload: any = {
        name: form.name,
        category: form.category,
        make: form.make || undefined,
        model: form.model || undefined,
        serialNumber: form.serialNumber || undefined,
        locationId: form.locationId ? Number(form.locationId) : undefined,
        installDate: form.installDate || undefined,
        notes: form.notes || undefined,
        tags: tags.length > 0 ? tags : undefined,
      };
      if (equipment) await apiRequest("PATCH", `/api/equipment/${equipment.id}`, payload);
      else await apiRequest("POST", "/api/equipment", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: equipment ? "Equipment updated" : "Equipment added" });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{equipment ? "Edit Equipment" : "Add Equipment"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input data-testid="input-equipment-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger data-testid="select-equipment-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Make</Label><Input data-testid="input-equipment-make" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} /></div>
            <div><Label>Model</Label><Input data-testid="input-equipment-model" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
          </div>
          <div><Label>Serial Number</Label><Input data-testid="input-equipment-serial" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Location</Label>
              <Select value={form.locationId} onValueChange={v => setForm(f => ({ ...f, locationId: v === "none" ? "" : v }))}>
                <SelectTrigger data-testid="select-equipment-location"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {locations?.map((l: any) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Install Date</Label><Input data-testid="input-equipment-install-date" type="date" value={form.installDate} onChange={e => setForm(f => ({ ...f, installDate: e.target.value }))} /></div>
          </div>
          <div><Label>Tags (comma-separated)</Label><Input data-testid="input-equipment-tags" value={form.tagsInput} onChange={e => setForm(f => ({ ...f, tagsInput: e.target.value }))} /></div>
          <div><Label>Notes</Label><Textarea data-testid="input-equipment-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="button-save-equipment" onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}>
            {saveMut.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceDialog({ equipmentId, onClose }: { equipmentId: number; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", description: "", frequencyDays: "", nextDueDate: "", serviceContactId: "" });
  const { data: contacts = [] } = useQuery<ServiceContact[]>({ queryKey: ["/api/service-contacts"] });

  const saveMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/equipment/${equipmentId}/maintenance`, {
        equipmentId,
        title: form.title,
        description: form.description || undefined,
        frequencyDays: form.frequencyDays ? Number(form.frequencyDays) : undefined,
        nextDueDate: form.nextDueDate || undefined,
        serviceContactId: form.serviceContactId ? Number(form.serviceContactId) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", equipmentId, "maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/maintenance/overdue"] });
      toast({ title: "Maintenance scheduled" });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Maintenance Schedule</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title *</Label><Input data-testid="input-maintenance-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Description</Label><Textarea data-testid="input-maintenance-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Frequency (days)</Label><Input data-testid="input-maintenance-frequency" type="number" placeholder="e.g. 30" value={form.frequencyDays} onChange={e => setForm(f => ({ ...f, frequencyDays: e.target.value }))} /></div>
            <div><Label>Next Due Date</Label><Input data-testid="input-maintenance-due-date" type="date" value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Service Contact</Label>
            <Select value={form.serviceContactId} onValueChange={v => setForm(f => ({ ...f, serviceContactId: v === "none" ? "" : v }))}>
              <SelectTrigger data-testid="select-maintenance-contact"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {contacts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name} {c.company ? `(${c.company})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="button-save-maintenance" onClick={() => saveMut.mutate()} disabled={!form.title || saveMut.isPending}>
            {saveMut.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== CONTACTS TAB ===========
function ContactsTab() {
  const { selectedLocationId } = useLocationContext();
  const [search, setSearch] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editContact, setEditContact] = useState<ServiceContact | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "company" | "recent">("name");

  const { data: contacts = [], isLoading } = useQuery<ServiceContact[]>({
    queryKey: ["/api/service-contacts", search, selectedLocationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      else if (selectedLocationId) params.set("locationId", selectedLocationId.toString());
      const r = await fetch(`/api/service-contacts?${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const sorted = [...contacts].sort((a, b) => {
    if (sortBy === "company") return (a.company || "").localeCompare(b.company || "");
    if (sortBy === "recent") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    return a.name.localeCompare(b.name);
  });

  const { user } = useAuth();
  const { toast } = useToast();
  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/service-contacts/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-contacts"] });
      toast({ title: "Contact deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-contact-search"
            placeholder="Search contacts (name, company, specialty, tags, notes)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
          <SelectTrigger data-testid="select-contact-sort" className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="recent">Recent</SelectItem>
          </SelectContent>
        </Select>
        <Button data-testid="button-new-contact" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Contact
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {search ? "No contacts match your search" : "No service contacts yet"}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(c => (
            <Card key={c.id} data-testid={`card-contact-${c.id}`} className="overflow-hidden">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{c.name}</h3>
                    {c.company && <p className="text-sm text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{c.company}</p>}
                    {c.specialty && <Badge variant="secondary" className="text-xs mt-1"><Zap className="h-3 w-3 mr-1" />{c.specialty}</Badge>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  {c.phone && (
                    <a data-testid={`link-phone-${c.id}`} href={`tel:${c.phone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a data-testid={`link-email-${c.id}`} href={`mailto:${c.email}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  )}
                </div>
                {c.tags && c.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {c.tags.map((t, i) => <Badge key={i} variant="outline" className="text-xs">{t}</Badge>)}
                  </div>
                )}
                {c.notes && <p className="text-xs text-muted-foreground line-clamp-2">{c.notes}</p>}
                <div className="flex gap-1 pt-1">
                  <Button data-testid={`button-edit-contact-${c.id}`} variant="outline" size="sm" onClick={() => setEditContact(c)}>Edit</Button>
                  {user?.role === "owner" && (
                    <Button data-testid={`button-delete-contact-${c.id}`} variant="destructive" size="sm" onClick={() => deleteMut.mutate(c.id)}>Delete</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(showNewDialog || editContact) && (
        <ContactDialog
          open
          onClose={() => { setShowNewDialog(false); setEditContact(null); }}
          contact={editContact}
        />
      )}
    </div>
  );
}

// =========== MAIN PAGE ===========
export default function MaintenancePage() {
  const [activeTab, setActiveTab] = useState("problems");

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Wrench className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Maintenance & Solutions Hub</h1>
          <p className="text-sm text-muted-foreground">Manage problems, equipment, and service contacts</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger data-testid="tab-problems" value="problems">
            <AlertTriangle className="h-4 w-4 mr-1" /> Problems
          </TabsTrigger>
          <TabsTrigger data-testid="tab-equipment" value="equipment">
            <Settings className="h-4 w-4 mr-1" /> Equipment
          </TabsTrigger>
          <TabsTrigger data-testid="tab-contacts" value="contacts">
            <Phone className="h-4 w-4 mr-1" /> Contacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="problems"><ProblemsTab /></TabsContent>
        <TabsContent value="equipment"><EquipmentTab /></TabsContent>
        <TabsContent value="contacts"><ContactsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
