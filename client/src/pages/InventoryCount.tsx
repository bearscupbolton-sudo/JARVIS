import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, ClipboardCheck, ArrowRight, Check, Loader2, Package } from "lucide-react";
import type { InventoryItem, InventoryCount as InventoryCountType } from "@shared/schema";

function getToday() {
  return new Date().toISOString().split("T")[0];
}

export default function InventoryCount() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeCountId, setActiveCountId] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQty, setCurrentQty] = useState("");
  const [countedItems, setCountedItems] = useState<Record<number, number>>({});

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items"],
  });

  const { data: countHistory = [] } = useQuery<InventoryCountType[]>({
    queryKey: ["/api/inventory-counts"],
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/inventory-counts", {
        countDate: getToday(),
        status: "in_progress",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveCountId(data.id);
      setCurrentIndex(0);
      setCountedItems({});
      setCurrentQty("");
      toast({ title: "Inventory count started" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addLineMutation = useMutation({
    mutationFn: async ({ countId, inventoryItemId, quantity }: { countId: number; inventoryItemId: number; quantity: number }) => {
      await apiRequest("POST", `/api/inventory-counts/${countId}/lines`, {
        inventoryItemId,
        quantity,
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (countId: number) => {
      await apiRequest("POST", `/api/inventory-counts/${countId}/complete`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-counts"] });
      toast({ title: "Inventory count completed", description: "On-hand quantities have been updated" });
      setActiveCountId(null);
      setCurrentIndex(0);
      setCountedItems({});
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const currentItem = items[currentIndex];
  const totalItems = items.length;
  const isLastItem = currentIndex >= totalItems - 1;
  const isCountActive = activeCountId !== null;

  async function submitCurrentAndNext() {
    if (!activeCountId || !currentItem) return;
    const qty = Number(currentQty) || 0;

    await addLineMutation.mutateAsync({
      countId: activeCountId,
      inventoryItemId: currentItem.id,
      quantity: qty,
    });

    setCountedItems(prev => ({ ...prev, [currentItem.id]: qty }));

    if (isLastItem) {
      await completeMutation.mutateAsync(activeCountId);
    } else {
      setCurrentIndex(prev => prev + 1);
      setCurrentQty("");
    }
  }

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/inventory">
            <Button variant="ghost" size="icon" data-testid="button-back-inventory">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight">END-OF-DAY COUNT</h1>
        </div>
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No inventory items to count.</p>
            <p className="text-sm mt-1">Add items in the Master Item List first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/inventory">
          <Button variant="ghost" size="icon" data-testid="button-back-inventory">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight" data-testid="text-count-title">END-OF-DAY COUNT</h1>
          <p className="text-muted-foreground text-sm">Count each item one at a time</p>
        </div>
      </div>

      {!isCountActive ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="text-center py-12">
              <ClipboardCheck className="w-16 h-16 mx-auto mb-4 text-primary opacity-60" />
              <h2 className="text-xl font-semibold mb-2">Ready to Count?</h2>
              <p className="text-muted-foreground mb-6">
                You'll be shown {totalItems} items one at a time. Enter the current count for each.
              </p>
              <Button size="lg" onClick={() => startMutation.mutate()} disabled={startMutation.isPending} data-testid="button-start-count">
                {startMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Start Inventory Count
              </Button>
            </CardContent>
          </Card>

          {countHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Previous Counts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {countHistory.slice(0, 10).map(count => (
                    <div key={count.id} className="flex items-center justify-between py-2" data-testid={`count-history-${count.id}`}>
                      <div>
                        <p className="font-medium text-sm">{count.countDate}</p>
                        <p className="text-xs text-muted-foreground">by {count.countedBy}</p>
                      </div>
                      <Badge variant={count.status === "completed" ? "default" : "secondary"}>
                        {count.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>
                Item {currentIndex + 1} of {totalItems}
              </CardTitle>
              <Badge variant="secondary">{Math.round(((currentIndex) / totalItems) * 100)}% done</Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${(currentIndex / totalItems) * 100}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentItem && (
              <div className="text-center py-6">
                <Badge variant="outline" className="mb-4">{currentItem.category}</Badge>
                <h2 className="text-3xl font-bold mb-2" data-testid="text-current-item-name">{currentItem.name}</h2>
                <p className="text-muted-foreground">Unit: {currentItem.unit}</p>
                <p className="text-sm text-muted-foreground mt-1">Currently on hand: {currentItem.onHand} {currentItem.unit}</p>

                <div className="max-w-xs mx-auto mt-8">
                  <label className="text-sm font-medium mb-2 block">Enter current count</label>
                  <Input
                    type="number"
                    step="any"
                    value={currentQty}
                    onChange={(e) => setCurrentQty(e.target.value)}
                    placeholder="0"
                    className="text-center text-2xl h-14"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitCurrentAndNext();
                      }
                    }}
                    data-testid="input-count-qty"
                  />
                </div>

                <Button
                  className="mt-6"
                  size="lg"
                  onClick={submitCurrentAndNext}
                  disabled={addLineMutation.isPending || completeMutation.isPending}
                  data-testid="button-next-item"
                >
                  {(addLineMutation.isPending || completeMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {isLastItem ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Finish Count
                    </>
                  ) : (
                    <>
                      Next Item
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
