import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Package, FileText, ClipboardCheck, Settings, Loader2 } from "lucide-react";
import type { InventoryItem } from "@shared/schema";

const CATEGORIES = ["Bakery", "Bar", "Kitchen", "FOH"] as const;

export default function Inventory() {
  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items"],
  });

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight" data-testid="text-inventory-title">INVENTORY</h1>
          <p className="text-muted-foreground mt-1">Track what you have on hand across all stations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/inventory/items">
          <Card className="hover-elevate cursor-pointer" data-testid="link-manage-items">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Master Item List</p>
                <p className="text-sm text-muted-foreground">Manage items and aliases</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/inventory/invoices">
          <Card className="hover-elevate cursor-pointer" data-testid="link-invoices">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Invoice Capture</p>
                <p className="text-sm text-muted-foreground">Log vendor deliveries</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/inventory/count">
          <Card className="hover-elevate cursor-pointer" data-testid="link-eod-count">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">End-of-Day Count</p>
                <p className="text-sm text-muted-foreground">Physical inventory count</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Current On-Hand
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No inventory items yet.</p>
              <p className="text-sm mt-1">Go to Master Item List to add your items.</p>
            </div>
          ) : (
            <Tabs defaultValue={CATEGORIES[0]}>
              <TabsList data-testid="tabs-inventory-categories">
                {CATEGORIES.map(cat => (
                  <TabsTrigger key={cat} value={cat} data-testid={`tab-${cat.toLowerCase()}`}>
                    {cat}
                    <Badge variant="secondary" className="ml-2">{grouped[cat]?.length || 0}</Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
              {CATEGORIES.map(cat => (
                <TabsContent key={cat} value={cat}>
                  {(!grouped[cat] || grouped[cat].length === 0) ? (
                    <p className="text-muted-foreground text-sm py-6 text-center">No items in {cat}</p>
                  ) : (
                    <div className="divide-y">
                      {grouped[cat].map(item => (
                        <div key={item.id} className="flex items-center justify-between py-3 px-2" data-testid={`inventory-item-${item.id}`}>
                          <div>
                            <p className="font-medium" data-testid={`text-item-name-${item.id}`}>{item.name}</p>
                            {item.aliases && item.aliases.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Aliases: {item.aliases.join(", ")}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-mono font-semibold" data-testid={`text-on-hand-${item.id}`}>
                              {item.onHand}
                            </span>
                            <span className="text-sm text-muted-foreground">{item.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
