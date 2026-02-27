import { Truck, MapPin, PackageCheck, ArrowRightLeft, ClipboardList, BarChart3, Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sections = [
  {
    icon: MapPin,
    title: "Location Management",
    items: [
      "Central hub for all bakery locations with address, hours, and contact details",
      "Location-specific settings — production capacity, equipment, and staffing levels",
      "Location health dashboard showing operational status at a glance",
    ],
  },
  {
    icon: ArrowRightLeft,
    title: "Inter-Location Transfers",
    items: [
      "Request and track product transfers between locations",
      "Transfer approval workflow with manager sign-off",
      "Transfer history and audit trail for accountability",
      "Real-time transfer status — requested, in transit, received",
    ],
  },
  {
    icon: PackageCheck,
    title: "Inventory Coordination",
    items: [
      "Cross-location inventory visibility — see what's available everywhere",
      "Shared ingredient ordering to reduce costs and waste",
      "Par level management per location with auto-reorder suggestions",
      "Ingredient usage tracking across all locations",
    ],
  },
  {
    icon: ClipboardList,
    title: "Production Planning",
    items: [
      "Centralized production schedules across locations",
      "Location-specific recipe scaling based on demand",
      "Cross-location bake-off coordination for special orders",
      "Capacity planning — route production to the right location",
    ],
  },
  {
    icon: Truck,
    title: "Delivery & Distribution",
    items: [
      "Route planning for inter-location deliveries",
      "Delivery scheduling with estimated arrival times",
      "Driver assignment and tracking",
      "Delivery confirmation with photo verification",
    ],
  },
  {
    icon: Bell,
    title: "Alerts & Communication",
    items: [
      "Cross-location announcements and broadcasts",
      "Low stock alerts shared across locations",
      "Location-specific notification preferences",
      "Urgent request system for last-minute needs",
    ],
  },
  {
    icon: BarChart3,
    title: "Multi-Location Reporting",
    items: [
      "Side-by-side performance comparison across locations",
      "Consolidated production and waste reports",
      "Labor distribution and cost analysis per location",
      "Revenue and sales trends by location",
    ],
  },
];

export default function MLL() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6" data-testid="mll-page">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-md bg-primary/10">
          <Truck className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" data-testid="text-mll-title">Multi-Location Logistics</h1>
            <Badge variant="secondary" className="text-xs" data-testid="badge-coming-soon">Coming Soon</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Coordinate operations across all Bear's Cup Bakehouse locations</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="border-dashed" data-testid={`card-mll-${section.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2" data-testid={`text-mll-section-${section.title.toLowerCase().replace(/\s+&\s+/g, "-").replace(/\s+/g, "-")}`}>
                <section.icon className="w-4 h-4 text-muted-foreground/50" />
                <h2 className="text-sm font-semibold text-muted-foreground/60">{section.title}</h2>
              </div>
              <ul className="space-y-1.5">
                {section.items.map((item, idx) => (
                  <li key={item} className="text-xs text-muted-foreground/40 leading-relaxed pl-1" data-testid={`text-mll-feature-${idx}`}>
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
