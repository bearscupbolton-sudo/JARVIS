import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Briefcase, UserPlus, CalendarOff, Star, ShieldCheck, DollarSign, FileText, BarChart3, Link2, Copy, Check, Eye, Clock, CheckCircle2, Loader2, X } from "lucide-react";
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

function ViewSubmissionDialog({ inviteId, name }: { inviteId: number; name: string }) {
  const [open, setOpen] = useState(false);

  const { data: submission, isLoading } = useQuery({
    queryKey: ["/api/hr/onboarding/submission", inviteId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/onboarding/submission/${inviteId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`button-view-submission-${inviteId}`}>
          <Eye className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submission: {name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : !submission ? (
          <p className="text-gray-500 text-center py-4">No submission data available yet.</p>
        ) : (
          <div className="space-y-4 text-sm">
            <Section title="Personal Information">
              <Row label="Legal Name" value={`${submission.legalFirstName} ${submission.middleName || ""} ${submission.legalLastName}`.trim()} />
              <Row label="SSN" value={submission.ssn || "—"} />
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
              <Row label="Routing" value={submission.routingNumber || "—"} />
              <Row label="Account" value={submission.accountNumber || "—"} />
              <Row label="Type" value={submission.accountType || "—"} />
            </Section>
            <Section title="Acknowledgments">
              <Row label="Handbook" value={submission.handbookAcknowledged ? `Acknowledged ${submission.handbookAcknowledgedAt ? new Date(submission.handbookAcknowledgedAt).toLocaleString() : ""}` : "Pending"} />
              <Row label="Non-Compete" value={submission.nonCompeteAcknowledged ? `Signed ${submission.nonCompeteAcknowledgedAt ? new Date(submission.nonCompeteAcknowledgedAt).toLocaleString() : ""}` : "Pending"} />
              {submission.digitalSignature && <Row label="Signature" value={submission.digitalSignature} />}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-gray-800 mb-1">{title}</h4>
      <div className="space-y-0.5 pl-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value}</span>
    </div>
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
                    {(invite.status === "in_progress" || invite.status === "completed") && (
                      <ViewSubmissionDialog inviteId={invite.id} name={`${invite.firstName} ${invite.lastName || ""}`} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
