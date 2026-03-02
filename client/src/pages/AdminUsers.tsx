import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/models/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock, Unlock, Trash2, Users, UserPlus, Phone, Mail, AlertTriangle, KeyRound, Cake, Save, CalendarDays, DollarSign, PanelLeft, ChevronDown, ChevronRight, X, Shield, Code2, Star, LogOut, LayoutGrid } from "lucide-react";
import { PAGE_SECTIONS } from "@/hooks/use-section-visibility";
import { format } from "date-fns";
import PermissionLevelManager, { getColorClass } from "@/components/PermissionLevelManager";
import type { PermissionLevel } from "@shared/schema";

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [resetPinUser, setResetPinUser] = useState<User | null>(null);
  const [forceLogoutOpen, setForceLogoutOpen] = useState(false);
  const [forceLogoutMessage, setForceLogoutMessage] = useState("");

  const isManagerOrOwner = currentUser?.role === "owner" || currentUser?.role === "manager";
  const isOwner = currentUser?.role === "owner";

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isManagerOrOwner,
  });

  const { data: permissionLevels } = useQuery<PermissionLevel[]>({
    queryKey: ["/api/admin/permission-levels"],
    enabled: isOwner,
  });

  const { data: devModeData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/app-settings/dev-mode"],
    enabled: isOwner,
  });

  const devModeMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("POST", "/api/app-settings/dev-mode", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-settings/dev-mode"] });
      toast({ title: devModeData?.enabled ? "Developer mode disabled" : "Developer mode enabled" });
    },
  });

  const forceLogoutMutation = useMutation({
    mutationFn: async (message?: string) => {
      const res = await apiRequest("POST", "/api/admin/force-logout", message ? { message } : {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.version) {
        localStorage.setItem("jarvis_session_version", data.version);
      }
      setForceLogoutOpen(false);
      setForceLogoutMessage("");
      toast({ title: "Force logout triggered", description: "All team members will be logged out on their next interaction." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, locked }: { id: string; locked: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/lock`, { locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update user", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Team member removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  function handleDelete(id: string, name: string) {
    if (window.confirm(`Are you sure you want to remove ${name} from the team?`)) {
      deleteMutation.mutate(id);
    }
  }

  if (!isManagerOrOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="container-admin-users">
        <AlertTriangle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold" data-testid="text-team-title">Team Management</h1>
            <p className="text-sm text-muted-foreground">{users?.length || 0} team members</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30" data-testid="container-dev-mode-toggle">
              <Code2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Dev Mode</span>
              <Switch
                checked={devModeData?.enabled ?? false}
                onCheckedChange={(checked) => devModeMutation.mutate(checked)}
                disabled={devModeMutation.isPending}
                data-testid="switch-dev-mode"
              />
            </div>
          )}
          {isOwner && (
            <Button variant="outline" onClick={() => setForceLogoutOpen(true)} className="border-red-300 text-red-600 dark:border-red-700 dark:text-red-400" data-testid="button-force-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Force Logout All
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)} data-testid="button-add-team-member">
            <UserPlus className="w-4 h-4 mr-2" />
            Add Team Member
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users?.map((u) => {
          const displayName = u.username || u.firstName || "Unknown";
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || displayName;
          const isCurrentUser = u.id === currentUser?.id;

          return (
            <Card key={u.id} className="hover-elevate cursor-pointer" onClick={() => setDetailUser(u)} data-testid={`card-user-${u.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate" data-testid={`text-username-${u.id}`}>{displayName}</p>
                    <p className="text-sm text-muted-foreground truncate">{fullName}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                    <Badge
                      variant={u.role === "owner" ? "default" : u.role === "manager" ? "secondary" : "outline"}
                      data-testid={`badge-role-${u.id}`}
                    >
                      {u.role === "owner" ? "Owner" : u.role === "manager" ? "Manager" : "Member"}
                    </Badge>
                    {(u as any).permissionLevelId && permissionLevels && (() => {
                      const lvl = permissionLevels.find(l => l.id === (u as any).permissionLevelId);
                      return lvl ? (
                        <Badge className={`text-[10px] ${getColorClass(lvl.color)}`} data-testid={`badge-permission-level-${u.id}`}>
                          {lvl.name}
                        </Badge>
                      ) : null;
                    })()}
                    {(u as any).isShiftManager && (
                      <Badge variant="outline" className="text-[10px] border-blue-500/60 text-blue-700 dark:text-blue-400" data-testid={`badge-shift-manager-${u.id}`}>
                        Shift Mgr
                      </Badge>
                    )}
                    {u.locked && (
                      <Badge variant="destructive" data-testid={`badge-locked-${u.id}`}>
                        Locked
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  {u.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3" />
                      <span data-testid={`text-phone-${u.id}`}>{u.phone}</span>
                    </div>
                  )}
                  {u.contactEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3 h-3" />
                      <span data-testid={`text-email-${u.id}`}>{u.contactEmail}</span>
                    </div>
                  )}
                  {u.birthday && (
                    <div className="flex items-center gap-2">
                      <Cake className="w-3 h-3" />
                      <span data-testid={`text-birthday-${u.id}`}>{format(new Date(u.birthday + "T00:00:00"), "MMM d")}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isOwner && (
        <PermissionLevelManager users={users} />
      )}

      <AddTeamMemberDialog open={addOpen} onOpenChange={setAddOpen} />

      {detailUser && (
        <UserDetailDialog
          user={users?.find(u => u.id === detailUser.id) || detailUser}
          open={!!detailUser}
          onOpenChange={(open) => { if (!open) setDetailUser(null); }}
          currentUser={currentUser}
          onRoleChange={(id, role) => roleMutation.mutate({ id, role })}
          onLockToggle={(id, locked) => lockMutation.mutate({ id, locked })}
          onDelete={(id, name) => { handleDelete(id, name); setDetailUser(null); }}
          onResetPin={(u) => { setDetailUser(null); setResetPinUser(u); }}
          permissionLevels={permissionLevels}
        />
      )}

      {resetPinUser && (
        <ResetPinDialog
          user={resetPinUser}
          open={!!resetPinUser}
          onOpenChange={(open) => { if (!open) setResetPinUser(null); }}
        />
      )}

      <Dialog open={forceLogoutOpen} onOpenChange={setForceLogoutOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-force-logout">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Force Logout All Users
            </DialogTitle>
            <DialogDescription>
              This will log out every team member on their next interaction — including anyone who saved the app to their home screen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Message (optional)</Label>
              <Textarea
                placeholder="Show a Jarvis message after they log back in..."
                value={forceLogoutMessage}
                onChange={(e) => setForceLogoutMessage(e.target.value)}
                rows={3}
                data-testid="input-force-logout-message"
              />
              <p className="text-xs text-muted-foreground">If provided, everyone will see this as a Jarvis overlay after logging back in.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setForceLogoutOpen(false)} data-testid="button-cancel-force-logout">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => forceLogoutMutation.mutate(forceLogoutMessage.trim() || undefined)}
                disabled={forceLogoutMutation.isPending}
                data-testid="button-confirm-force-logout"
              >
                {forceLogoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
                Force Logout Everyone
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddTeamMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("member");
  const [department, setDepartment] = useState("bakery");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [birthday, setBirthday] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/users", {
        firstName,
        lastName: lastName || undefined,
        username,
        pin,
        role,
        department,
        phone: phone || undefined,
        contactEmail: contactEmail || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
        birthday: birthday || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Team member added" });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setFirstName("");
    setLastName("");
    setUsername("");
    setPin("");
    setRole("member");
    setDepartment("bakery");
    setPhone("");
    setContactEmail("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setBirthday("");
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-add-member-title">Add Team Member</DialogTitle>
          <DialogDescription>Create a new team member account with a login PIN.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required data-testid="input-member-first-name" />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" data-testid="input-member-last-name" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Username *</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Login username" required data-testid="input-member-username" />
          </div>
          <div className="space-y-2">
            <Label>Login PIN * (4-8 digits)</Label>
            <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Create PIN" required data-testid="input-member-pin" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger data-testid="select-member-department">
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

          <div className="space-y-2">
            <Label>Birthday</Label>
            <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} data-testid="input-member-birthday" />
          </div>

          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Contact Information</p>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" data-testid="input-member-phone" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email address" data-testid="input-member-email" />
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Emergency contact" data-testid="input-member-emergency-name" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="Emergency phone" data-testid="input-member-emergency-phone" />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={createMutation.isPending || !firstName || !username || !pin} data-testid="button-submit-member">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Team Member"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserDetailDialog({
  user: u,
  open,
  onOpenChange,
  currentUser,
  onRoleChange,
  onLockToggle,
  onDelete,
  onResetPin,
  permissionLevels,
}: {
  user: User;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUser: User | null | undefined;
  onRoleChange: (id: string, role: string) => void;
  onLockToggle: (id: string, locked: boolean) => void;
  onDelete: (id: string, name: string) => void;
  onResetPin: (u: User) => void;
  permissionLevels?: PermissionLevel[];
}) {
  const { toast } = useToast();
  const displayName = u.username || u.firstName || "Unknown";
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || displayName;
  const isCurrentUser = u.id === currentUser?.id;
  const isOwner = currentUser?.role === "owner";
  const isManagerOrAbove = currentUser?.role === "owner" || currentUser?.role === "manager";
  const [welcomeMsg, setWelcomeMsg] = useState((u as any).jarvisWelcomeMessage || "");
  const [briefingFocus, setBriefingFocus] = useState((u as any).jarvisBriefingFocus || "all");
  const [hourlyRate, setHourlyRate] = useState((u as any).hourlyRate?.toString() || "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const currentPerms: string[] | null = (u as any).sidebarPermissions ?? null;
  const currentSectionPerms: Record<string, string[]> | null = (u as any).sectionPermissions ?? null;

  const ALL_SIDEBAR_ITEMS = [
    { href: "/", label: "Home" },
    { href: "/messages", label: "Messages" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/bakery", label: "Bakery" },
    { href: "/coffee", label: "Coffee" },
    { href: "/kitchen", label: "Kitchen" },
    { href: "/recipes", label: "Recipes" },
    { href: "/pastry-passports", label: "Pastry Passports" },
    { href: "/lamination", label: "Lamination Studio" },
    { href: "/production", label: "Production Logs" },
    { href: "/sops", label: "SOPs" },
    { href: "/inventory", label: "Inventory" },
    { href: "/schedule", label: "Schedule" },
    { href: "/calendar", label: "Calendar" },
    { href: "/time-cards", label: "Time Cards" },
    { href: "/tasks", label: "Task Manager" },
    { href: "/assistant", label: "Jarvis" },
    { href: "/starkade", label: "Starkade" },
    { href: "/kiosk", label: "Kiosk Mode" },
    ...(u.role === "manager" || u.role === "owner" ? [
      { href: "/admin/users", label: "Team" },
      { href: "/time-review", label: "Time Review" },
      { href: "/admin/pastry-items", label: "Master Pastry List" },
      { href: "/pastry-goals", label: "Pastry Goals" },
      { href: "/live-inventory", label: "Live Inventory" },
    ] : []),
    ...(u.role === "owner" ? [
      { href: "/admin/approvals", label: "Approvals" },
      { href: "/admin/ttis", label: "TTIS" },
      { href: "/admin/square", label: "Square Settings" },
      { href: "/admin/insights", label: "Insights" },
    ] : []),
  ];

  const hourlyRateMutation = useMutation({
    mutationFn: async (rate: string) => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/hourly-rate`, {
        hourlyRate: rate === "" ? null : parseFloat(rate),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Hourly rate updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const shiftManagerMutation = useMutation({
    mutationFn: async (isShiftManager: boolean) => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/shift-manager`, { isShiftManager });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Shift manager status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const generalManagerMutation = useMutation({
    mutationFn: async (isGeneralManager: boolean) => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/general-manager`, { isGeneralManager });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "General manager status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const welcomeMutation = useMutation({
    mutationFn: async (message: string) => {
      await apiRequest("PUT", `/api/users/${u.id}/welcome-message`, { message: message || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Welcome message saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const focusMutation = useMutation({
    mutationFn: async (focus: string) => {
      await apiRequest("PUT", `/api/users/${u.id}/briefing-focus`, { focus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Briefing focus updated", description: "Next briefing will reflect this change." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const sidebarPermMutation = useMutation({
    mutationFn: async (perms: string[] | null) => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/sidebar-permissions`, { sidebarPermissions: perms });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Sidebar permissions updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const sectionPermMutation = useMutation({
    mutationFn: async (perms: Record<string, string[]> | null) => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/section-permissions`, { sectionPermissions: perms });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Section permissions updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const toggleSection = (page: string, sectionKey: string) => {
    const buildFullPerms = (): Record<string, string[]> => {
      const full: Record<string, string[]> = {};
      Object.entries(PAGE_SECTIONS).forEach(([p, sections]) => {
        full[p] = currentSectionPerms && p in currentSectionPerms
          ? [...currentSectionPerms[p]]
          : sections.map(s => s.key);
      });
      return full;
    };

    const newPerms = buildFullPerms();
    const pageSections = newPerms[page];

    if (pageSections.includes(sectionKey)) {
      newPerms[page] = pageSections.filter(k => k !== sectionKey);
    } else {
      newPerms[page] = [...pageSections, sectionKey];
    }

    const isAllEnabled = Object.keys(PAGE_SECTIONS).every(p => {
      const allKeys = PAGE_SECTIONS[p].map(s => s.key);
      return newPerms[p] && newPerms[p].length >= allKeys.length;
    });
    sectionPermMutation.mutate(isAllEnabled ? null : newPerms);
  };

  const isSectionEnabled = (page: string, sectionKey: string): boolean => {
    if (currentSectionPerms === null) return true;
    if (!(page in currentSectionPerms)) return true;
    return currentSectionPerms[page].includes(sectionKey);
  };

  const selectAllSections = () => sectionPermMutation.mutate(null);
  const deselectAllSections = () => {
    const emptyPerms: Record<string, string[]> = {};
    Object.keys(PAGE_SECTIONS).forEach(p => { emptyPerms[p] = []; });
    sectionPermMutation.mutate(emptyPerms);
  };

  const defaultPageMutation = useMutation({
    mutationFn: async (page: string | null) => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/default-page`, { defaultPage: page });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Default page updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const departmentMutation = useMutation({
    mutationFn: async (department: string) => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/department`, { department });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Department updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const permissionLevelMutation = useMutation({
    mutationFn: async (levelId: number | null) => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/permission-level`, { permissionLevelId: levelId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Permission level updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const toggleSidebarItem = (href: string) => {
    const allHrefs = ALL_SIDEBAR_ITEMS.map(i => i.href);
    if (currentPerms === null) {
      const newPerms = allHrefs.filter(h => h !== href);
      sidebarPermMutation.mutate(newPerms);
    } else {
      const newPerms = currentPerms.includes(href)
        ? currentPerms.filter(h => h !== href)
        : [...currentPerms, href];
      if (newPerms.length === allHrefs.length) {
        sidebarPermMutation.mutate(null);
      } else {
        sidebarPermMutation.mutate(newPerms);
      }
    }
  };

  const isItemEnabled = (href: string) => currentPerms === null || currentPerms.includes(href);

  const selectAllSidebar = () => sidebarPermMutation.mutate(null);
  const deselectAllSidebar = () => sidebarPermMutation.mutate([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-detail-name">{fullName}</DialogTitle>
          <DialogDescription>@{u.username}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={u.role === "owner" ? "default" : u.role === "manager" ? "secondary" : "outline"}>
              {u.role === "owner" ? "Owner" : u.role === "manager" ? "Manager" : "Member"}
            </Badge>
            {u.locked && <Badge variant="destructive">Locked</Badge>}
          </div>

          <div className="space-y-2 text-sm">
            {u.birthday && (
              <div className="flex items-center gap-2">
                <Cake className="w-4 h-4 text-muted-foreground" />
                <span data-testid="text-detail-birthday">{format(new Date(u.birthday + "T00:00:00"), "MMMM d, yyyy")}</span>
              </div>
            )}
            {u.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span data-testid="text-detail-phone">{u.phone}</span>
              </div>
            )}
            {u.contactEmail && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span data-testid="text-detail-email">{u.contactEmail}</span>
              </div>
            )}
            {u.emergencyContactName && (
              <div className="border-t pt-2 mt-2 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Emergency Contact</p>
                <p data-testid="text-detail-emergency-name">{u.emergencyContactName}</p>
                {u.emergencyContactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <span data-testid="text-detail-emergency-phone">{u.emergencyContactPhone}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {!isCurrentUser && isOwner && (
            <div className="border-t pt-4 space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <img src="/bear-logo.png" alt="Jarvis" className="w-3.5 h-3.5 rounded-full" />
                  Welcome Message
                </Label>
                <Textarea
                  placeholder={`Write a personalized welcome for ${u.firstName || displayName}...`}
                  value={welcomeMsg}
                  onChange={(e) => setWelcomeMsg(e.target.value)}
                  className="min-h-[80px] text-sm"
                  data-testid={`textarea-welcome-${u.id}`}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => welcomeMutation.mutate(welcomeMsg)}
                    disabled={welcomeMutation.isPending}
                    data-testid={`button-save-welcome-${u.id}`}
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {welcomeMutation.isPending ? "Saving..." : "Save Welcome"}
                  </Button>
                  {welcomeMsg && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => { setWelcomeMsg(""); welcomeMutation.mutate(""); }}
                      disabled={welcomeMutation.isPending}
                      data-testid={`button-clear-welcome-${u.id}`}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">This message appears the first time they see their daily briefing.</p>
              </div>
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <img src="/bear-logo.png" alt="Jarvis" className="w-3.5 h-3.5 rounded-full" />
                  Briefing Focus
                </Label>
                <Select
                  value={briefingFocus}
                  onValueChange={(val) => {
                    setBriefingFocus(val);
                    focusMutation.mutate(val);
                  }}
                  data-testid={`select-briefing-focus-${u.id}`}
                >
                  <SelectTrigger data-testid={`select-briefing-focus-trigger-${u.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All (Everything)</SelectItem>
                    <SelectItem value="foh">FOH (Front of House)</SelectItem>
                    <SelectItem value="boh">BOH (Back of House)</SelectItem>
                    <SelectItem value="management">Management</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Controls what the briefing highlights. FOH sees pastry availability and customer-facing info. BOH sees dough status, production, and recipes.</p>
              </div>
            </div>
          )}

          {!isCurrentUser && isOwner && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
                <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">Hourly Rate</Label>
                  <p className="text-[11px] text-muted-foreground">Used for labor cost KPI calculations</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    className="w-20 h-8 text-sm"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="0.00"
                    data-testid={`input-hourly-rate-${u.id}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => hourlyRateMutation.mutate(hourlyRate)}
                    disabled={hourlyRateMutation.isPending}
                    data-testid={`button-save-rate-${u.id}`}
                  >
                    <Save className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Select value={u.role} onValueChange={(role) => onRoleChange(u.id, role)}>
                  <SelectTrigger data-testid={`select-detail-role-${u.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Department</Label>
                <Select
                  value={(u as any).department || "bakery"}
                  onValueChange={(val) => departmentMutation.mutate(val)}
                >
                  <SelectTrigger data-testid={`select-detail-department-${u.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bakery">Bakery</SelectItem>
                    <SelectItem value="kitchen">Kitchen</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="foh">FOH</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Sets default filters across the app for this team member</p>
              </div>
              {permissionLevels && permissionLevels.length > 0 && u.role !== "owner" && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Permission Level
                  </Label>
                  <Select
                    value={(u as any).permissionLevelId?.toString() || "none"}
                    onValueChange={(val) => {
                      permissionLevelMutation.mutate(val === "none" ? null : parseInt(val));
                    }}
                  >
                    <SelectTrigger data-testid={`select-permission-level-${u.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Level (Default)</SelectItem>
                      {permissionLevels.map((level) => (
                        <SelectItem key={level.id} value={level.id.toString()}>
                          <span className="flex items-center gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${getColorClass(level.color).split(" ")[0]}`} />
                            {level.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Assigns a pre-configured set of sidebar and section permissions.</p>
                  {permissionLevelMutation.isPending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Applying level...
                    </div>
                  )}
                </div>
              )}
              {(u.role === "manager" || u.role === "owner") && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <Label className="text-sm font-medium">Shift Manager</Label>
                      <p className="text-[11px] text-muted-foreground">Can approve shift pickups and import schedules</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!(u as any).isShiftManager}
                    onCheckedChange={(checked) => shiftManagerMutation.mutate(checked)}
                    disabled={shiftManagerMutation.isPending}
                    data-testid={`switch-shift-manager-${u.id}`}
                  />
                </div>
              )}
              {u.role === "manager" && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <Label className="text-sm font-medium">General Manager</Label>
                      <p className="text-[11px] text-muted-foreground">Full approval access and TTIS visibility</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!(u as any).isGeneralManager}
                    onCheckedChange={(checked) => generalManagerMutation.mutate(checked)}
                    disabled={generalManagerMutation.isPending}
                    data-testid={`switch-general-manager-${u.id}`}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Default Landing Page</Label>
                <Select
                  value={(u as any).defaultPage || "home"}
                  onValueChange={(val) => defaultPageMutation.mutate(val === "home" ? null : val)}
                >
                  <SelectTrigger data-testid={`select-default-page-${u.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="/bagel-bros">Bagel Bros</SelectItem>
                    <SelectItem value="/platform">Platform 9¾</SelectItem>
                    <SelectItem value="/bakery">Bakery</SelectItem>
                    <SelectItem value="/clock">Kiosk Clock</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Where this person lands after signing in.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => onLockToggle(u.id, !u.locked)}
                  data-testid={`button-lock-user-${u.id}`}
                >
                  {u.locked ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                  {u.locked ? "Unlock" : "Lock"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onResetPin(u)}
                  data-testid={`button-reset-pin-${u.id}`}
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  Reset PIN
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => onDelete(u.id, displayName)}
                  data-testid={`button-delete-user-${u.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </Button>
              </div>
            </div>
          )}

          {!isCurrentUser && isOwner && (
            <div className="border-t pt-4">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
                onClick={() => setSectionsOpen(!sectionsOpen)}
                data-testid={`button-section-perms-toggle-${u.id}`}
              >
                <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                Page Sections
                {sectionsOpen ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
                {currentSectionPerms !== null && (
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    Custom
                  </Badge>
                )}
              </button>
              {sectionsOpen && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">Control which sections are visible on each page. Unchecked sections will be hidden from this person's view.</p>
                  <div className="flex items-center gap-2 mb-2">
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={selectAllSections} data-testid={`button-sections-select-all-${u.id}`}>
                      Select All
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={deselectAllSections} data-testid={`button-sections-deselect-all-${u.id}`}>
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
                            data-testid={`section-perm-${page.replace(/\//g, "-")}-${section.key}-${u.id}`}
                          >
                            <Checkbox
                              checked={isSectionEnabled(page, section.key)}
                              onCheckedChange={() => toggleSection(page, section.key)}
                              disabled={sectionPermMutation.isPending}
                            />
                            <span>{section.label}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                  {sectionPermMutation.isPending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Saving...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isCurrentUser && isManagerOrAbove && (
            <EmployeeSkillsSection userId={u.id} userName={u.firstName || displayName} />
          )}

          {!isCurrentUser && isOwner && (
            <div className="border-t pt-4">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                data-testid={`button-sidebar-perms-toggle-${u.id}`}
              >
                <PanelLeft className="w-4 h-4 text-muted-foreground" />
                Sidebar Visibility
                {sidebarOpen ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
                {currentPerms !== null && (
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    {currentPerms.length}/{ALL_SIDEBAR_ITEMS.length}
                  </Badge>
                )}
              </button>
              {sidebarOpen && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">Choose which sidebar items this person can see. Unchecked items will be hidden from their navigation.</p>
                  <div className="flex items-center gap-2 mb-2">
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={selectAllSidebar} data-testid={`button-sidebar-select-all-${u.id}`}>
                      Select All
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={deselectAllSidebar} data-testid={`button-sidebar-deselect-all-${u.id}`}>
                      Deselect All
                    </Button>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto space-y-1 pr-1">
                    {ALL_SIDEBAR_ITEMS.map((item) => (
                      <label
                        key={item.href}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                        data-testid={`sidebar-perm-${item.href.replace(/\//g, "-")}-${u.id}`}
                      >
                        <Checkbox
                          checked={isItemEnabled(item.href)}
                          onCheckedChange={() => toggleSidebarItem(item.href)}
                          disabled={sidebarPermMutation.isPending}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                  {sidebarPermMutation.isPending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Saving...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SKILL_AREAS = [
  { value: "bread", label: "Bread" },
  { value: "pastry", label: "Pastry" },
  { value: "lamination", label: "Lamination" },
  { value: "espresso", label: "Espresso" },
  { value: "cold_drinks", label: "Cold Drinks" },
  { value: "prep", label: "Prep" },
  { value: "plating", label: "Plating" },
  { value: "opening", label: "Opening" },
  { value: "closing", label: "Closing" },
];

const PROFICIENCY_LABELS: Record<number, string> = {
  1: "Learning",
  2: "Developing",
  3: "Competent",
  4: "Proficient",
  5: "Expert",
};

function EmployeeSkillsSection({ userId, userName }: { userId: string; userName: string }) {
  const { toast } = useToast();
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [editingSkills, setEditingSkills] = useState<Record<string, { proficiency: number; notes: string }>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data: skills, isLoading: skillsLoading } = useQuery<any[]>({
    queryKey: ["/api/users", userId, "skills"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/skills`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load skills");
      return res.json();
    },
    enabled: skillsOpen,
  });

  const skillsMutation = useMutation({
    mutationFn: async (skillsData: { skillArea: string; proficiency: number; notes: string | null }[]) => {
      await apiRequest("PUT", `/api/users/${userId}/skills`, { skills: skillsData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "skills"] });
      toast({ title: "Skills updated" });
      setHasChanges(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save skills", description: err.message, variant: "destructive" });
    },
  });

  const initEditing = () => {
    if (skills) {
      const map: Record<string, { proficiency: number; notes: string }> = {};
      for (const s of skills) {
        map[s.skillArea] = { proficiency: s.proficiency, notes: s.notes || "" };
      }
      setEditingSkills(map);
    }
  };

  const handleToggleOpen = () => {
    const next = !skillsOpen;
    setSkillsOpen(next);
    if (next && skills) {
      initEditing();
    }
  };

  const getSkillValue = (area: string) => {
    if (editingSkills[area]) return editingSkills[area];
    const found = skills?.find((s: any) => s.skillArea === area);
    if (found) return { proficiency: found.proficiency, notes: found.notes || "" };
    return null;
  };

  const setSkillProficiency = (area: string, proficiency: number) => {
    setEditingSkills(prev => ({
      ...prev,
      [area]: { proficiency, notes: prev[area]?.notes || "" },
    }));
    setHasChanges(true);
  };

  const setSkillNotes = (area: string, notes: string) => {
    const current = getSkillValue(area);
    setEditingSkills(prev => ({
      ...prev,
      [area]: { proficiency: current?.proficiency || 3, notes },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const skillsData = Object.entries(editingSkills)
      .filter(([_, v]) => v.proficiency > 0)
      .map(([area, v]) => ({
        skillArea: area,
        proficiency: v.proficiency,
        notes: v.notes || null,
      }));
    skillsMutation.mutate(skillsData);
  };

  const ratedCount = skills?.length || Object.keys(editingSkills).filter(k => editingSkills[k]?.proficiency > 0).length;

  return (
    <div className="border-t pt-4">
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
        onClick={handleToggleOpen}
        data-testid={`button-skills-toggle-${userId}`}
      >
        <Star className="w-4 h-4 text-muted-foreground" />
        Skills & Strengths
        {skillsOpen ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
        {ratedCount > 0 && (
          <Badge variant="secondary" className="text-[10px] ml-1">
            {ratedCount}/{SKILL_AREAS.length}
          </Badge>
        )}
      </button>
      {skillsOpen && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Rate {userName}&apos;s proficiency in each area (1-5 scale).
          </p>
          {skillsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading skills...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {SKILL_AREAS.map((area) => {
                  const val = getSkillValue(area.value);
                  const proficiency = val?.proficiency || 0;
                  return (
                    <div key={area.value} className="space-y-1" data-testid={`skill-area-${area.value}-${userId}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{area.label}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {proficiency > 0 ? PROFICIENCY_LABELS[proficiency] : "Not rated"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            key={level}
                            type="button"
                            className="p-0.5"
                            onClick={() => setSkillProficiency(area.value, level)}
                            data-testid={`button-skill-${area.value}-${level}-${userId}`}
                          >
                            <Star
                              className={`w-4 h-4 transition-colors ${
                                level <= proficiency
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          </button>
                        ))}
                        {proficiency > 0 && (
                          <button
                            type="button"
                            className="ml-1 p-0.5"
                            onClick={() => {
                              setEditingSkills(prev => {
                                const copy = { ...prev };
                                delete copy[area.value];
                                return copy;
                              });
                              setHasChanges(true);
                            }}
                            data-testid={`button-skill-clear-${area.value}-${userId}`}
                          >
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasChanges && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={skillsMutation.isPending}
                  data-testid={`button-save-skills-${userId}`}
                >
                  {skillsMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Save Skills
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResetPinDialog({ user: u, open, onOpenChange }: { user: User; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [newPin, setNewPin] = useState("");
  const { toast } = useToast();

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/users/${u.id}/pin`, { pin: newPin });
    },
    onSuccess: () => {
      toast({ title: "PIN reset successfully" });
      setNewPin("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset PIN", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset PIN for {u.username || u.firstName}</DialogTitle>
          <DialogDescription>Enter a new 4-8 digit PIN for this team member.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); resetMutation.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>New PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="Enter new PIN"
              data-testid="input-reset-pin"
            />
          </div>
          <Button type="submit" className="w-full" disabled={resetMutation.isPending || newPin.length < 4} data-testid="button-submit-reset-pin">
            {resetMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reset PIN"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
