import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Briefcase, UserPlus, CalendarOff, Star, ShieldCheck, DollarSign, FileText, BarChart3, Link2, Copy, Check, Eye, Clock, CheckCircle2, Loader2, X, Lock, User, Hash, KeyRound, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { OnboardingInvite } from "@shared/schema";

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
    title: "Sensitive Data is Hashed",
    description: "Social Security numbers, bank routing numbers, and account numbers are encrypted using industry-standard SHA-256 hashing before they are stored. The original values are never saved in the database.",
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
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState(false);
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

  const onboardingLink = `${window.location.origin}/onboarding/${invite.token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(onboardingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setActiveStep(0); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`button-manage-onboarding-${invite.id}`}>
          <Eye className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline text-xs">Manage</span>
        </Button>
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
                {invite.createdAt && <>Created {new Date(invite.createdAt).toLocaleDateString()}</>}
              </p>
            </div>
            {invite.status !== "completed" && (
              <Button variant="outline" size="sm" onClick={handleCopyLink} data-testid={`button-copy-onboarding-link-${invite.id}`}>
                {copied ? <Check className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                <span className="text-xs">{copied ? "Copied" : "Copy Link"}</span>
              </Button>
            )}
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
        <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Not yet submitted</p>
        <p className="text-sm mt-1">The applicant has not filled out their personal information yet.</p>
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
      <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-md">
        The Employee Handbook covers workplace policies, attendance, safety, dress code, compensation, and more. Applicants must scroll to the bottom before they can acknowledge.
      </div>
    </div>
  );
}

function StepNonCompete({ submission }: { submission: any }) {
  const signed = submission?.nonCompeteAcknowledged;

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

export default function HR() {
  const { data: invites = [], isLoading } = useQuery<OnboardingInvite[]>({
    queryKey: ["/api/hr/onboarding/invites"],
  });

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
        <CreateInviteDialog />
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
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  data-testid={`row-invite-${invite.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm">
                      {(invite.firstName || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm" data-testid={`text-invite-name-${invite.id}`}>
                        {invite.firstName} {invite.lastName || ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {invite.position || invite.department || "New Hire"}
                        {invite.createdAt && <> · {new Date(invite.createdAt).toLocaleDateString()}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={invite.status} />
                    <OnboardingDetailDialog invite={invite} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
