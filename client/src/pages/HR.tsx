import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Briefcase, UserPlus, CalendarOff, Star, ShieldCheck, DollarSign, FileText, BarChart3, Link2, Copy, Check, Eye, Clock, CheckCircle2, Loader2, X, Lock, User, Hash, KeyRound, ChevronRight, Upload, Pencil, Camera, Sparkles, Save, Trash2, Download, AlertTriangle, Wifi, WifiOff, RefreshCw, Unlink, ListChecks, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { compressForUpload } from "@/lib/image-utils";
import { useAuth } from "@/hooks/use-auth";
import type { OnboardingInvite, OnboardingDocument, User } from "@shared/schema";

const futureSections = [
  {
    icon: CalendarOff,
    title: "Time Off & Availability",
    items: [
      "PTO and time-off requests with manager approval workflow",
      "Availability preferences — days and times each person can or can't work",
      "PTO balance tracking — accrued hours, used, and remaining",
    ],
  },
  {
    icon: Star,
    title: "Performance & Reviews",
    items: [
      "Performance review templates with scheduling — 30-day, 90-day, annual",
      "Goal setting and tracking per employee",
      "Write-ups and incident documentation with acknowledgment",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Compliance & Certifications",
    items: [
      "Track required certifications per role — food handler, allergen training, and more",
      "Expiration alerts when someone's certification is about to expire",
    ],
  },
  {
    icon: DollarSign,
    title: "Pay & Compensation",
    items: [
      "Pay rate history — raises, role changes, and effective dates",
      "Integration with time cards for hours worked summaries",
    ],
  },
  {
    icon: BarChart3,
    title: "Reporting",
    items: [
      "Headcount and turnover metrics",
      "Hours worked summaries per employee",
      "Certification compliance dashboard",
    ],
  },
];

const SECURITY_ITEMS = [
  {
    icon: Hash,
    title: "Sensitive Data is Encrypted",
    description: "Social Security numbers, bank routing numbers, and account numbers are encrypted using AES-256 encryption before they are stored. They are never saved in plain text in the database.",
  },
  {
    icon: Eye,
    title: "Masked Display",
    description: "When managers review submissions, sensitive fields are automatically masked (e.g. ***-**-1234). Full values cannot be retrieved once submitted.",
  },
  {
    icon: Lock,
    title: "Access Controlled",
    description: "Only managers and owners can view onboarding submissions. All data access is authenticated and role-checked on every request.",
  },
  {
    icon: KeyRound,
    title: "Secure Onboarding Links",
    description: "Each onboarding invite uses a unique, randomly generated token that cannot be guessed. Links are automatically locked once the onboarding process is completed.",
  },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge className="bg-green-100 text-green-700 hover:bg-green-100" data-testid={`badge-status-${status}`}><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 mr-1" />In Progress</Badge>;
  return <Badge variant="secondary" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

function CreateInviteDialog() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("bakery");
  const [hourlyWage, setHourlyWage] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/hr/onboarding/invite", {
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        position: position.trim() || null,
        department,
        hourlyWage: hourlyWage.trim() || null,
      });
      return res.json();
    },
    onSuccess: (data: OnboardingInvite) => {
      const link = `${window.location.origin}/onboarding/${data.token}`;
      setGeneratedLink(link);
      queryClient.invalidateQueries({ queryKey: ["/api/hr/onboarding/invites"] });
      toast({ title: "Onboarding link created", description: `Link ready for ${firstName}` });
    },
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleReset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPosition("");
    setDepartment("bakery");
    setHourlyWage("");
    setGeneratedLink("");
    setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleReset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="button-create-invite">
          <UserPlus className="w-4 h-4 mr-2" /> Send Onboarding Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Onboarding Invite</DialogTitle>
        </DialogHeader>

        {generatedLink ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="font-medium text-green-800">Link Created!</p>
              <p className="text-sm text-green-600 mt-1">Share this link with {firstName} to start their onboarding</p>
            </div>
            <div className="flex items-center gap-2">
              <Input value={generatedLink} readOnly className="text-xs" data-testid="input-generated-link" />
              <Button variant="outline" size="sm" onClick={handleCopy} data-testid="button-copy-link">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => { handleReset(); }} data-testid="button-create-another">
              Create Another
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">First Name *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" data-testid="input-invite-first" />
              </div>
              <div>
                <Label className="text-sm">Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" data-testid="input-invite-last" />
              </div>
            </div>
            <div>
              <Label className="text-sm">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="personal@email.com" data-testid="input-invite-email" />
            </div>
            <div>
              <Label className="text-sm">Position</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Baker, Barista, FOH" data-testid="input-invite-position" />
            </div>
            <div>
              <Label className="text-sm">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger data-testid="select-invite-dept">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bakery">Bakery</SelectItem>
                  <SelectItem value="kitchen">Kitchen</SelectItem>
                  <SelectItem value="foh">Front of House</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Hourly Wage</Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyWage}
                  onChange={(e) => setHourlyWage(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                  data-testid="input-invite-wage"
                />
              </div>
            </div>
            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!firstName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-generate-link"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
              Generate Onboarding Link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const ONBOARDING_STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Employee Handbook", icon: FileText },
  { label: "Non-Compete", icon: ShieldCheck },
  { label: "Complete", icon: CheckCircle2 },
];

function getStepStatus(step: number, submission: any, inviteStatus: string): "completed" | "current" | "pending" {
  if (!submission && inviteStatus === "pending") return step === 0 ? "current" : "pending";
  if (!submission) return "pending";

  if (step === 0) {
    return submission.legalFirstName ? "completed" : "current";
  }
  if (step === 1) {
    if (submission.handbookAcknowledged) return "completed";
    return submission.legalFirstName ? "current" : "pending";
  }
  if (step === 2) {
    if (submission.nonCompeteAcknowledged) return "completed";
    return submission.handbookAcknowledged ? "current" : "pending";
  }
  if (step === 3) {
    return inviteStatus === "completed" ? "completed" : "pending";
  }
  return "pending";
}

function OnboardingDetailDialog({ invite }: { invite: OnboardingInvite }) {
  const [open, setOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(invite.status === "completed" ? 3 : 0);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();

  const { data: submission, isLoading } = useQuery({
    queryKey: ["/api/hr/onboarding/submission", invite.id],
    queryFn: async () => {
      const res = await fetch(`/api/hr/onboarding/submission/${invite.id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/hr/onboarding/invite/${invite.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/onboarding/invites"] });
      toast({ title: "Invite deleted" });
      setOpen(false);
      setConfirmDelete(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const onboardingLink = `${window.location.origin}/onboarding/${invite.token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(onboardingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setActiveStep(invite.status === "completed" ? 3 : 0); setConfirmDelete(false); } }}>
      <DialogTrigger asChild>
        <button className="flex items-center justify-between w-full p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer text-left" data-testid={`row-invite-${invite.id}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
              {(invite.firstName || "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-sm" data-testid={`text-invite-name-${invite.id}`}>
                {invite.firstName} {invite.lastName || ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {invite.position || invite.department || "New Hire"}
                {invite.hourlyWage && <> · ${invite.hourlyWage}/hr</>}
                {invite.createdAt && <> · {new Date(invite.createdAt).toLocaleDateString()}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={invite.status} />
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Onboarding: {invite.firstName} {invite.lastName || ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{invite.firstName} {invite.lastName || ""}</span>
                <StatusBadge status={invite.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {invite.position && <>{invite.position} · </>}
                {invite.department && <>{invite.department} · </>}
                {invite.hourlyWage && <>${invite.hourlyWage}/hr · </>}
                {invite.createdAt && <>Created {new Date(invite.createdAt).toLocaleDateString()}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {invite.status === "pending" && (
                confirmDelete ? (
                  <div className="flex items-center gap-1">
                    <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid={`button-confirm-delete-invite-${invite.id}`}>
                      {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, Delete"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} data-testid="button-cancel-delete">Cancel</Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)} data-testid={`button-delete-invite-${invite.id}`}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    <span className="text-xs">Delete</span>
                  </Button>
                )
              )}
              {invite.status !== "completed" && !confirmDelete && (
                <Button variant="outline" size="sm" onClick={handleCopyLink} data-testid={`button-copy-onboarding-link-${invite.id}`}>
                  {copied ? <Check className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  <span className="text-xs">{copied ? "Copied" : "Copy Link"}</span>
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1" data-testid="onboarding-step-nav">
            {ONBOARDING_STEPS.map((step, i) => {
              const status = getStepStatus(i, submission, invite.status);
              const Icon = step.icon;
              const isActive = i === activeStep;
              return (
                <button
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all flex-1 justify-center ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : status === "completed"
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : status === "current"
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  data-testid={`button-step-${i}`}
                >
                  {status === "completed" && !isActive ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="min-h-[200px]" data-testid="step-content">
              {activeStep === 0 && <StepPersonalInfo submission={submission} />}
              {activeStep === 1 && <StepHandbook submission={submission} />}
              {activeStep === 2 && <StepNonCompete submission={submission} />}
              {activeStep === 3 && <StepCompletion submission={submission} invite={invite} />}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepPersonalInfo({ submission }: { submission: any }) {
  if (!submission) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Waiting for Employee</p>
        <p className="text-sm mt-1">This person hasn't started their onboarding yet. Share the invite link so they can begin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <Section title="Personal Information">
        <Row label="Legal Name" value={`${submission.legalFirstName} ${submission.middleName || ""} ${submission.legalLastName}`.trim()} />
        <SecureRow label="SSN" value={submission.ssn || "—"} />
        <Row label="Date of Birth" value={submission.dateOfBirth || "—"} />
      </Section>
      <Section title="Address">
        <Row label="Street" value={submission.address || "—"} />
        <Row label="City/State/ZIP" value={`${submission.city || ""}, ${submission.state || ""} ${submission.zipCode || ""}`.trim()} />
      </Section>
      <Section title="Contact">
        <Row label="Phone" value={submission.phone || "—"} />
        <Row label="Email" value={submission.personalEmail || "—"} />
      </Section>
      <Section title="Emergency Contact">
        <Row label="Name" value={submission.emergencyContactName || "—"} />
        <Row label="Phone" value={submission.emergencyContactPhone || "—"} />
        <Row label="Relation" value={submission.emergencyContactRelation || "—"} />
      </Section>
      <Section title="Tax Information">
        <Row label="Federal Filing" value={submission.federalFilingStatus || "—"} />
        <Row label="State Filing" value={submission.stateFilingStatus || "Same as Federal"} />
        <Row label="Allowances" value={String(submission.allowances ?? 0)} />
      </Section>
      <Section title="W-4 Federal Tax Withholding">
        <Row label="Multiple Jobs" value={submission.multipleJobs ? "Yes" : "No"} />
        <Row label="Dependents (Children)" value={`$${submission.dependentsChildAmount ?? 0}`} />
        <Row label="Dependents (Other)" value={`$${submission.dependentsOtherAmount ?? 0}`} />
        <Row label="Other Income" value={`$${submission.otherIncome ?? 0}`} />
        <Row label="Deductions" value={`$${submission.deductions ?? 0}`} />
        <Row label="Extra Withholding" value={`$${submission.extraWithholding ?? 0}`} />
      </Section>
      <Section title="Direct Deposit">
        <Row label="Bank" value={submission.bankName || "Not provided"} />
        <SecureRow label="Routing" value={submission.routingNumber || "—"} />
        <SecureRow label="Account" value={submission.accountNumber || "—"} />
        <Row label="Type" value={submission.accountType || "—"} />
      </Section>
    </div>
  );
}

function StepHandbook({ submission }: { submission: any }) {
  const acknowledged = submission?.handbookAcknowledged;
  const { data: customDoc } = useQuery<OnboardingDocument>({
    queryKey: ["/api/hr/onboarding/documents", "handbook"],
    queryFn: async () => {
      const res = await fetch("/api/hr/onboarding/documents/handbook", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-lg border ${acknowledged ? "bg-green-50 border-green-200" : "bg-muted/50"}`}>
        <div className="flex items-center gap-3">
          {acknowledged ? (
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
          ) : (
            <Clock className="w-6 h-6 text-muted-foreground shrink-0" />
          )}
          <div>
            <p className={`font-medium ${acknowledged ? "text-green-800" : "text-muted-foreground"}`}>
              {acknowledged ? "Handbook Acknowledged" : "Pending Acknowledgment"}
            </p>
            {acknowledged && submission.handbookAcknowledgedAt && (
              <p className="text-xs text-green-600 mt-0.5">
                Acknowledged on {new Date(submission.handbookAcknowledgedAt).toLocaleString()}
              </p>
            )}
            {!acknowledged && (
              <p className="text-xs text-muted-foreground mt-0.5">
                The applicant has not yet read and acknowledged the Employee Handbook.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-md space-y-1">
        <p>The Employee Handbook covers workplace policies, attendance, safety, dress code, compensation, and more. Applicants must scroll to the bottom before they can acknowledge.</p>
        <p className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          <span className="font-medium">Version:</span>
          {customDoc ? (
            <span className="text-green-700">Custom document (updated {customDoc.updatedAt ? new Date(customDoc.updatedAt).toLocaleDateString() : "—"})</span>
          ) : (
            <span>Default template</span>
          )}
        </p>
      </div>
    </div>
  );
}

function StepNonCompete({ submission }: { submission: any }) {
  const signed = submission?.nonCompeteAcknowledged;
  const { data: customDoc } = useQuery<OnboardingDocument>({
    queryKey: ["/api/hr/onboarding/documents", "noncompete"],
    queryFn: async () => {
      const res = await fetch("/api/hr/onboarding/documents/noncompete", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-lg border ${signed ? "bg-green-50 border-green-200" : "bg-muted/50"}`}>
        <div className="flex items-center gap-3">
          {signed ? (
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
          ) : (
            <Clock className="w-6 h-6 text-muted-foreground shrink-0" />
          )}
          <div>
            <p className={`font-medium ${signed ? "text-green-800" : "text-muted-foreground"}`}>
              {signed ? "Non-Compete Agreement Signed" : "Pending Signature"}
            </p>
            {signed && submission.nonCompeteAcknowledgedAt && (
              <p className="text-xs text-green-600 mt-0.5">
                Signed on {new Date(submission.nonCompeteAcknowledgedAt).toLocaleString()}
              </p>
            )}
            {!signed && (
              <p className="text-xs text-muted-foreground mt-0.5">
                The applicant has not yet signed the Non-Compete and Confidentiality Agreement.
              </p>
            )}
          </div>
        </div>
      </div>
      {signed && submission.digitalSignature && (
        <div className="p-3 bg-muted/30 rounded-md">
          <p className="text-xs text-muted-foreground mb-1">Digital Signature</p>
          <p className="font-serif italic text-lg text-foreground">{submission.digitalSignature}</p>
        </div>
      )}
      <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-md">
        <p className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          <span className="font-medium">Version:</span>
          {customDoc ? (
            <span className="text-green-700">Custom document (updated {customDoc.updatedAt ? new Date(customDoc.updatedAt).toLocaleDateString() : "—"})</span>
          ) : (
            <span>Default template</span>
          )}
        </p>
      </div>
    </div>
  );
}

function StepCompletion({ submission, invite }: { submission: any; invite: OnboardingInvite }) {
  const isComplete = invite.status === "completed";

  return (
    <div className="space-y-4">
      <div className={`p-6 rounded-lg border text-center ${isComplete ? "bg-green-50 border-green-200" : "bg-muted/50"}`}>
        {isComplete ? (
          <>
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-green-800">Onboarding Complete</p>
            {invite.completedAt && (
              <p className="text-sm text-green-600 mt-1">
                Completed on {new Date(invite.completedAt).toLocaleString()}
              </p>
            )}
          </>
        ) : (
          <>
            <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="font-semibold text-muted-foreground">Not Yet Complete</p>
            <p className="text-sm text-muted-foreground mt-1">
              The applicant still has steps to finish before onboarding is complete.
            </p>
          </>
        )}
      </div>
      {isComplete && (
        <div className="text-sm space-y-1 p-3 bg-muted/30 rounded-md">
          <p className="text-xs font-medium text-muted-foreground mb-2">Summary</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Personal Info</span>
            <span className="text-green-600 font-medium">{submission?.legalFirstName ? "Submitted" : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Handbook</span>
            <span className={submission?.handbookAcknowledged ? "text-green-600 font-medium" : "text-muted-foreground"}>{submission?.handbookAcknowledged ? "Acknowledged" : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Non-Compete</span>
            <span className={submission?.nonCompeteAcknowledged ? "text-green-600 font-medium" : "text-muted-foreground"}>{submission?.nonCompeteAcknowledged ? "Signed" : "—"}</span>
          </div>
          {invite.hourlyWage && (
            <div className="flex justify-between pt-1 mt-1 border-t">
              <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />Hourly Wage</span>
              <span className="text-foreground font-medium">${invite.hourlyWage}/hr</span>
            </div>
          )}
        </div>
      )}
      {isComplete && submission && (
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/hr/onboarding/w4/${invite.id}`, "_blank")}
            data-testid="button-download-w4"
          >
            <FileText className="w-4 h-4 mr-1" />
            Download W-4
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-foreground mb-1">{title}</h4>
      <div className="space-y-0.5 pl-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}

function SecureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground flex items-center gap-1">
        <Lock className="w-3 h-3 text-green-600" />
        {label}
      </span>
      <span className="text-foreground font-medium text-right font-mono text-xs">{value}</span>
    </div>
  );
}

const DOC_TYPES = [
  { type: "handbook", title: "Employee Handbook", description: "Workplace policies, attendance, safety, dress code, compensation, and more" },
  { type: "noncompete", title: "Non-Compete & Confidentiality Agreement", description: "Confidentiality, non-compete covenants, non-solicitation, and IP" },
];

function DocumentManagement() {
  const { toast } = useToast();
  const { data: documents = [] } = useQuery<OnboardingDocument[]>({
    queryKey: ["/api/hr/onboarding/documents"],
  });

  return (
    <Card data-testid="card-onboarding-documents">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5" /> Onboarding Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your actual handbook and agreements. Jarvis will extract and format the content for your onboarding flow.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOC_TYPES.map((docType) => {
            const existing = documents.find((d) => d.type === docType.type);
            return (
              <DocumentCard
                key={docType.type}
                docType={docType}
                existing={existing}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentCard({ docType, existing }: { docType: typeof DOC_TYPES[number]; existing?: OnboardingDocument }) {
  const [mode, setMode] = useState<"idle" | "uploading" | "scanning" | "editing" | "preview">("idle");
  const [editContent, setEditContent] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const scanMutation = useMutation({
    mutationFn: async (images: string[]) => {
      const res = await apiRequest("POST", "/api/hr/onboarding/documents/scan", {
        images,
        documentType: docType.type,
      });
      return res.json();
    },
    onSuccess: (data: { content: string; pages: number }) => {
      setRawContent(data.content);
      setEditContent(data.content);
      setMode("editing");
      toast({ title: "Document processed", description: `Jarvis extracted content from ${data.pages} page(s)` });
    },
    onError: (err: Error) => {
      setMode("idle");
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/hr/onboarding/documents/${docType.type}`, {
        title: docType.title,
        content: editContent,
        rawContent: rawContent || null,
      });
      return res.json();
    },
    onSuccess: () => {
      setMode("idle");
      queryClient.invalidateQueries({ queryKey: ["/api/hr/onboarding/documents"] });
      toast({ title: "Document saved", description: `${docType.title} updated successfully` });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setMode("uploading");
    try {
      const compressed: string[] = [];
      for (const file of files) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const result = await compressForUpload(dataUrl);
        compressed.push(result);
      }
      setUploadedImages(compressed);
      setMode("scanning");
      scanMutation.mutate(compressed);
    } catch {
      setMode("idle");
      toast({ title: "Upload failed", description: "Could not process the images", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEditExisting = () => {
    if (existing) {
      setEditContent(existing.content);
      setRawContent(existing.rawContent || "");
      setMode("editing");
    }
  };

  const handlePreview = () => {
    if (existing) {
      setEditContent(existing.content);
      setMode("preview");
    }
  };

  return (
    <div className="p-4 rounded-lg border bg-card space-y-3" data-testid={`doc-card-${docType.type}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md ${existing ? "bg-green-100" : "bg-muted"}`}>
            <FileText className={`w-4 h-4 ${existing ? "text-green-700" : "text-muted-foreground"}`} />
          </div>
          <div>
            <h4 className="text-sm font-semibold">{docType.title}</h4>
            <p className="text-xs text-muted-foreground">{docType.description}</p>
          </div>
        </div>
        {existing && (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs shrink-0" data-testid={`badge-doc-active-${docType.type}`}>
            <CheckCircle2 className="w-3 h-3 mr-1" /> Custom
          </Badge>
        )}
      </div>

      {existing && (
        <p className="text-xs text-muted-foreground">
          Last updated {existing.updatedAt ? new Date(existing.updatedAt).toLocaleDateString() : "—"}
        </p>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            data-testid={`input-upload-${docType.type}`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            data-testid={`button-upload-${docType.type}`}
          >
            <Upload className="w-3.5 h-3.5 mr-1" />
            {existing ? "Re-upload" : "Upload"}
          </Button>
          {existing && (
            <>
              <Button variant="outline" size="sm" onClick={handleEditExisting} data-testid={`button-edit-${docType.type}`}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={handlePreview} data-testid={`button-preview-${docType.type}`}>
                <Eye className="w-3.5 h-3.5 mr-1" /> Preview
              </Button>
            </>
          )}
        </div>
      )}

      {(mode === "uploading" || mode === "scanning") && (
        <div className="flex items-center gap-2 py-4 justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {mode === "uploading" ? "Processing images..." : "Jarvis is reading your document..."}
        </div>
      )}

      {mode === "editing" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded-md">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            Review and edit the extracted content below, then save.
          </div>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[300px] text-xs font-mono leading-relaxed"
            data-testid={`textarea-edit-${docType.type}`}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!editContent.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              data-testid={`button-save-${docType.type}`}
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Save Document
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMode("idle")} data-testid={`button-cancel-edit-${docType.type}`}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "preview" && (
        <div className="space-y-3">
          <div className="max-h-[400px] overflow-y-auto p-3 bg-muted/30 rounded-md border">
            <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{editContent}</pre>
          </div>
          <Button variant="outline" size="sm" onClick={() => setMode("idle")} data-testid={`button-close-preview-${docType.type}`}>
            Close Preview
          </Button>
        </div>
      )}

      {!existing && mode === "idle" && (
        <p className="text-xs text-muted-foreground/60 italic">
          Using default template. Upload your document to customize.
        </p>
      )}
    </div>
  );
}

function SecurityInfoCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/20" data-testid="card-security-info">
      <CardContent className="p-4">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded(!expanded)}
          data-testid="button-toggle-security-info"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-green-100">
              <ShieldCheck className="w-4 h-4 text-green-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-green-800 dark:text-green-300">Data Security & Privacy</h3>
              <p className="text-xs text-green-600 dark:text-green-400">How we protect personal information</p>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-green-600 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        {expanded && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SECURITY_ITEMS.map((item) => (
              <div key={item.title} className="p-3 bg-white/60 dark:bg-white/5 rounded-lg border border-green-100 dark:border-green-900" data-testid={`security-item-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <item.icon className="w-3.5 h-3.5 text-green-700 dark:text-green-400" />
                  <h4 className="text-xs font-semibold text-green-800 dark:text-green-300">{item.title}</h4>
                </div>
                <p className="text-xs text-green-700/80 dark:text-green-400/80 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ADP_SETUP_STEPS = [
  "Create employees in ADP RUN's New Hire Wizard (enter name, SSN, direct deposit, W-4 there)",
  "Enable Marketplace Connector for PayData Input in RUN Settings > General Settings > Features and services",
  "Set ADP_CLIENT_ID, ADP_CLIENT_SECRET, ADP_SSL_CERT, and ADP_SSL_KEY in Jarvis environment",
  "Link Jarvis employees to ADP workers using the section below",
  "Use Payroll Review to compile and push payroll each period",
];

const CODE_LIST_TYPES = [
  { key: "earning-codes", label: "Earning Codes" },
  { key: "pay-cycles", label: "Pay Cycles" },
  { key: "pay-rates", label: "Pay Rates" },
  { key: "department-codes", label: "Departments" },
];

function ADPIntegrationSection() {
  const { toast } = useToast();
  const [selectedCodeList, setSelectedCodeList] = useState<string | null>(null);
  const [linkingUserId, setLinkingUserId] = useState<string | null>(null);
  const [selectedADPWorker, setSelectedADPWorker] = useState<string>("");

  const { data: adpStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<{
    configured: boolean;
    connected?: boolean;
    apiUrl?: string;
  }>({
    queryKey: ["/api/hr/adp/status"],
  });

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<User[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: adpWorkers, isLoading: workersLoading, refetch: refetchWorkers } = useQuery<{
    configured: boolean;
    data?: { workers: any[]; total?: number };
  }>({
    queryKey: ["/api/hr/adp/workers"],
    enabled: adpStatus?.configured === true && adpStatus?.connected === true,
  });

  const { data: codeListData, isLoading: codeListLoading } = useQuery<{
    configured: boolean;
    data?: { codeListTitle?: string; listItems: any[] };
  }>({
    queryKey: ["/api/hr/adp/codelists", selectedCodeList],
    queryFn: async () => {
      if (!selectedCodeList) return null;
      const res = await fetch(`/api/hr/adp/codelists/${selectedCodeList}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch code list");
      return res.json();
    },
    enabled: !!selectedCodeList && adpStatus?.configured === true,
  });

  const linkMutation = useMutation({
    mutationFn: async ({ userId, adpAssociateOID }: { userId: string; adpAssociateOID: string }) => {
      await apiRequest("POST", `/api/hr/adp/link/${userId}`, { adpAssociateOID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setLinkingUserId(null);
      setSelectedADPWorker("");
      toast({ title: "Employee linked to ADP worker" });
    },
    onError: (err: any) => {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/hr/adp/unlink/${userId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      toast({ title: "ADP link removed" });
    },
    onError: (err: any) => {
      toast({ title: "Unlink failed", description: err.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/hr/adp/sync-worker/${userId}`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Sync complete", description: data.message || "Worker data pushed to ADP" });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  if (!adpStatus?.configured && !statusLoading) return null;

  const adpWorkerList = adpWorkers?.data?.workers || [];

  return (
    <Card data-testid="card-adp-integration">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <ExternalLink className="w-5 h-5" /> ADP Integration
          </CardTitle>
          <div className="flex items-center gap-2">
            {statusLoading ? (
              <Badge variant="secondary" data-testid="badge-adp-status-loading">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Checking
              </Badge>
            ) : adpStatus?.connected ? (
              <Badge className="bg-green-100 text-green-700" data-testid="badge-adp-status-connected">
                <Wifi className="w-3 h-3 mr-1" /> Connected
              </Badge>
            ) : adpStatus?.configured ? (
              <Badge className="bg-red-100 text-red-700" data-testid="badge-adp-status-disconnected">
                <WifiOff className="w-3 h-3 mr-1" /> Disconnected
              </Badge>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchStatus()}
              data-testid="button-refresh-adp-status"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {adpStatus?.apiUrl && (
          <p className="text-xs text-muted-foreground">
            API Endpoint: <span className="font-mono">{adpStatus.apiUrl}</span>
          </p>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" data-testid="heading-worker-linking">
            <Link2 className="w-4 h-4" /> Worker Linking
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Link Jarvis employees to their ADP worker profiles. Linked employees can have payroll data pushed to ADP.
          </p>
          {teamLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card gap-2"
                  data-testid={`row-adp-employee-${member.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                      {(member.firstName || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" data-testid={`text-adp-employee-name-${member.id}`}>
                        {member.firstName} {member.lastName || ""}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.department || "—"}
                        {member.hourlyRate ? ` · $${member.hourlyRate}/hr` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {member.adpAssociateOID ? (
                      <>
                        <Badge className="bg-green-100 text-green-700 text-xs" data-testid={`badge-adp-linked-${member.id}`}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Linked
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => syncMutation.mutate(member.id)}
                          disabled={syncMutation.isPending}
                          data-testid={`button-adp-sync-${member.id}`}
                        >
                          {syncMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => unlinkMutation.mutate(member.id)}
                          disabled={unlinkMutation.isPending}
                          data-testid={`button-adp-unlink-${member.id}`}
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : linkingUserId === member.id ? (
                      <div className="flex items-center gap-2">
                        {workersLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Select value={selectedADPWorker} onValueChange={setSelectedADPWorker}>
                            <SelectTrigger className="w-48" data-testid={`select-adp-worker-${member.id}`}>
                              <SelectValue placeholder="Select ADP worker" />
                            </SelectTrigger>
                            <SelectContent>
                              {adpWorkerList.map((w: any) => (
                                <SelectItem key={w.associateOID} value={w.associateOID}>
                                  {w.person?.legalName?.formattedName ||
                                    `${w.person?.legalName?.givenName || ""} ${w.person?.legalName?.familyName1 || ""}`.trim() ||
                                    w.associateOID}
                                </SelectItem>
                              ))}
                              {adpWorkerList.length === 0 && (
                                <SelectItem value="_none" disabled>No ADP workers found</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          size="sm"
                          disabled={!selectedADPWorker || linkMutation.isPending}
                          onClick={() => linkMutation.mutate({ userId: member.id, adpAssociateOID: selectedADPWorker })}
                          data-testid={`button-confirm-link-${member.id}`}
                        >
                          {linkMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Link"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setLinkingUserId(null); setSelectedADPWorker(""); }}
                          data-testid={`button-cancel-link-${member.id}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setLinkingUserId(member.id);
                          setSelectedADPWorker("");
                          if (adpStatus?.connected) refetchWorkers();
                        }}
                        data-testid={`button-adp-link-${member.id}`}
                      >
                        <Link2 className="w-3.5 h-3.5 mr-1" /> Link
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {teamMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No team members found</p>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" data-testid="heading-code-lists">
            <ListChecks className="w-4 h-4" /> ADP Code Lists
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            View cached ADP code lists for earning codes, pay frequencies, and departments.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {CODE_LIST_TYPES.map((cl) => (
              <Button
                key={cl.key}
                variant={selectedCodeList === cl.key ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCodeList(selectedCodeList === cl.key ? null : cl.key)}
                data-testid={`button-codelist-${cl.key}`}
              >
                {cl.label}
              </Button>
            ))}
          </div>
          {selectedCodeList && (
            <div className="rounded-lg border bg-muted/30 p-3">
              {codeListLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : codeListData?.data?.listItems && codeListData.data.listItems.length > 0 ? (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {codeListData.data.codeListTitle && (
                    <p className="text-xs font-semibold text-muted-foreground mb-2">{codeListData.data.codeListTitle}</p>
                  )}
                  {codeListData.data.listItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-muted last:border-0" data-testid={`row-codelist-item-${idx}`}>
                      <span className="font-mono font-medium">{item.codeValue}</span>
                      <span className="text-muted-foreground">{item.shortName || item.longName || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {!adpStatus?.connected ? "ADP is not connected. Configure credentials to view code lists." : "No items found for this code list."}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" data-testid="heading-setup-guide">
            <FileText className="w-4 h-4" /> Setup Guide
          </h3>
          <div className="space-y-2">
            {ADP_SETUP_STEPS.map((step, i) => (
              <div key={i} className="flex items-start gap-3 text-sm" data-testid={`text-setup-step-${i}`}>
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-muted-foreground leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteInviteButton({ invite }: { invite: OnboardingInvite }) {
  const { toast } = useToast();
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/hr/onboarding/invite/${invite.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/onboarding/invites"] });
      toast({ title: "Invite deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (invite.status !== "pending") return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-red-600 hover:bg-red-50 h-7 w-7 p-0"
      onClick={() => { if (confirm(`Delete the pending invite for ${invite.firstName}?`)) deleteMutation.mutate(); }}
      disabled={deleteMutation.isPending}
      data-testid={`button-quick-delete-${invite.id}`}
    >
      {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </Button>
  );
}

export default function HR() {
  const { data: invites = [], isLoading } = useQuery<OnboardingInvite[]>({
    queryKey: ["/api/hr/onboarding/invites"],
  });
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const completedCount = invites.filter(i => i.status === "completed").length;

  const handleExportADP = () => {
    window.open("/api/hr/onboarding/export/adp", "_blank");
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6" data-testid="hr-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-primary/10">
            <Briefcase className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-hr-title">HR Department</h1>
            <p className="text-sm text-muted-foreground">People management tools for Bear's Cup Bakehouse</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && completedCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportADP} data-testid="button-export-adp">
              <Download className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Export for ADP</span>
              <span className="sm:hidden">ADP</span>
            </Button>
          )}
          <CreateInviteDialog />
        </div>
      </div>

      <Card data-testid="card-onboarding-section">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Onboarding
            </CardTitle>
            <Badge variant="outline" className="text-xs" data-testid="badge-invite-count">{invites.length} invite{invites.length !== 1 ? "s" : ""}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No onboarding invites yet</p>
              <p className="text-sm mt-1">Click "Send Onboarding Link" to create the first one</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invites.map((invite) => (
                <OnboardingDetailDialog key={invite.id} invite={invite} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentManagement />

      {isOwner && <ADPIntegrationSection />}

      <SecurityInfoCard />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Coming Soon</h2>
          <Badge variant="secondary" className="text-xs" data-testid="badge-coming-soon">Planned</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {futureSections.map((section) => (
            <Card key={section.title} className="border-dashed" data-testid={`card-hr-${section.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <section.icon className="w-4 h-4 text-muted-foreground/50" />
                  <h3 className="text-sm font-semibold text-muted-foreground/60">{section.title}</h3>
                </div>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item} className="text-xs text-muted-foreground/40 leading-relaxed pl-1">{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
