import { Card, CardContent } from "@/components/ui/card";
import { UtensilsCrossed } from "lucide-react";

export default function Kitchen() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold">Kitchen</h1>
        <p className="text-muted-foreground">Kitchen operations coming soon.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <UtensilsCrossed className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-display font-semibold mb-2">Coming Soon</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Manage food prep, kitchen inventory, and daily kitchen tasks. This section is under development.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
