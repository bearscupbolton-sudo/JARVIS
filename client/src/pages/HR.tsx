import { Briefcase, UserPlus, CalendarOff, Star, ShieldCheck, DollarSign, FileText, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sections = [
  {
    icon: UserPlus,
    title: "Employee Records & Onboarding",
    items: [
      "Employee profiles with emergency contacts, hire date, and employment type",
      "Onboarding checklists for new hires — food safety training, uniform pickup, POS training",
      "Document storage for certifications like food handler's cards and ServSafe with expiration alerts",
    ],
  },
  {
    icon: CalendarOff,
    title: "Time Off & Availability",
    items: [
      "PTO and time-off requests with manager approval workflow",
      "Availability preferences — days and times each person can or can't work",
      "Time-off calendar showing who's out on any given day",
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
      "Praise and recognition log tied to the team system",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Compliance & Certifications",
    items: [
      "Track required certifications per role — food handler, allergen training, and more",
      "Expiration alerts when someone's certification is about to expire",
      "Training completion tracking linked to SOPs",
    ],
  },
  {
    icon: DollarSign,
    title: "Pay & Compensation",
    items: [
      "Pay rate history — raises, role changes, and effective dates",
      "Role and position tracking over time",
      "Integration with time cards for hours worked summaries",
    ],
  },
  {
    icon: FileText,
    title: "Policies & Handbook",
    items: [
      "Digital employee handbook and policy documents",
      "Policy acknowledgment tracking — who's read and signed what",
      "Linked to SOPs for operational policies",
    ],
  },
  {
    icon: BarChart3,
    title: "Reporting",
    items: [
      "Headcount and turnover metrics",
      "Hours worked summaries per employee",
      "Certification compliance dashboard",
      "Time-off usage reports",
    ],
  },
];

export default function HR() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6" data-testid="hr-page">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-md bg-primary/10">
          <Briefcase className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" data-testid="text-hr-title">HR Department</h1>
            <Badge variant="secondary" className="text-xs" data-testid="badge-coming-soon">Coming Soon</Badge>
          </div>
          <p className="text-sm text-muted-foreground">People management tools for Bear's Cup Bakehouse</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="border-dashed" data-testid={`card-hr-${section.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2" data-testid={`text-hr-section-${section.title.toLowerCase().replace(/\s+&\s+/g, "-").replace(/\s+/g, "-")}`}>
                <section.icon className="w-4 h-4 text-muted-foreground/50" />
                <h2 className="text-sm font-semibold text-muted-foreground/60">{section.title}</h2>
              </div>
              <ul className="space-y-1.5">
                {section.items.map((item, idx) => (
                  <li key={item} className="text-xs text-muted-foreground/40 leading-relaxed pl-1" data-testid={`text-hr-feature-${idx}`}>
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
