import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, ClipboardCheck, ArrowRight, Check, Loader2, Package } from "lucide-react";
import type { InventoryItem, InventoryCount as InventoryCountType } from "@shared/schema";

const CATEGORIES = ["Bakery", "Bar", "Kitchen", "FOH"] as const;
const DEPT_TO_CATEGORY: Record<string, string> = { bakery: "Bakery", bar: "Bar", kitchen: "Kitchen", foh: "FOH" };

function getToday() {
  return new Date().toISOString().split("T")[0];
}

export default function InventoryCount() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeCountId, setActiveCountId] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQty, setCurrentQty] = useState("");
  const [countedItems, setCountedItems] = useState<Record<number, number>>({});

  const userCategory = user?.department ? (DEPT_TO_CATEGORY[user.department] || "") : "";
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(
    userCategory ? [userCategory] : []
  );

  const { data: allItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items"],
  });

  const { data: countHistory = [] } = useQuery<(InventoryCountType & { departments?: string[] })[]>({
    queryKey: ["/api/inventory-counts"],
  });

  const knownCategories = CATEGORIES as readonly string[];
  const uncategorizedCount = allItems.filter(i => !knownCategories.includes(i.category)).length;

  const filteredItems = selectedDepartments.length > 0
    ? allItems.filter(item => {
        if (selectedDepartments.includes("Other")) {
          return selectedDepartments.includes(item.category) || !knownCategories.includes(item.category);
        }
        return selectedDepartments.includes(item.category);
      })
    : allItems;

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/inventory-counts", {
        countDate: getToday(),
        status: "in_progress",
        departments: selectedDepartments,
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

  const currentItem = filteredItems[currentIndex];
  const totalItems = filteredItems.length;
  const isLastItem = currentIndex >= totalItems - 1;
  const isCountActive = activeCountId !== null;

  function toggleDepartment(dept: string) {
    setSelectedDepartments(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  }

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

  if (allItems.length === 0) {
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
            <CardContent className="py-8">
              <div className="text-center mb-6">
                <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-primary opacity-60" />
                <h2 className="text-xl font-semibold mb-1">Select Departments to Count</h2>
                <p className="text-muted-foreground text-sm">
                  Choose which department(s) you're counting today
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 mb-4">
                {CATEGORIES.map(cat => {
                  const catCount = allItems.filter(i => i.category === cat).length;
                  const isSelected = selectedDepartments.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleDepartment(cat)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                      }`}
                      data-testid={`toggle-dept-${cat.toLowerCase()}`}
                    >
                      <span className="font-medium">{cat}</span>
                      <Badge variant={isSelected ? "default" : "secondary"} className="text-xs">
                        {catCount}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-center mb-6">
                <button
                  type="button"
                  onClick={() => setSelectedDepartments(
                    selectedDepartments.length === CATEGORIES.length + (uncategorizedCount > 0 ? 1 : 0)
                      ? []
                      : [...CATEGORIES, ...(uncategorizedCount > 0 ? ["Other"] : [])]
                  )}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline"
                  data-testid="toggle-dept-all"
                >
                  {selectedDepartments.length === CATEGORIES.length + (uncategorizedCount > 0 ? 1 : 0) ? "Deselect All" : "Select All Departments"}
                </button>
                {uncategorizedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleDepartment("Other")}
                    className={`ml-4 flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-all text-sm ${
                      selectedDepartments.includes("Other")
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    }`}
                    data-testid="toggle-dept-other"
                  >
                    <span>Other</span>
                    <Badge variant={selectedDepartments.includes("Other") ? "default" : "secondary"} className="text-xs">
                      {uncategorizedCount}
                    </Badge>
                  </button>
                )}
              </div>

              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  {selectedDepartments.length === 0
                    ? "Select at least one department to begin counting"
                    : totalItems === 0
                      ? "No items found in selected departments"
                      : `${totalItems} items to count across ${selectedDepartments.join(", ")}`
                  }
                </p>
                <Button
                  size="lg"
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending || selectedDepartments.length === 0 || totalItems === 0}
                  data-testid="button-start-count"
                >
                  {startMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Start Inventory Count
                </Button>
              </div>
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
                    <div key={count.id} className="flex items-center justify-between py-2 gap-2" data-testid={`count-history-${count.id}`}>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{count.countDate}</p>
                        <p className="text-xs text-muted-foreground">by {count.countedBy}</p>
                        {count.departments && count.departments.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {count.departments.map(d => (
                              <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0">
                                {d}
                              </Badge>
                            ))}
                          </div>
                        )}
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
            {selectedDepartments.length > 0 && (
              <div className="flex gap-1 mt-1">
                {selectedDepartments.map(d => (
                  <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                ))}
              </div>
            )}
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
