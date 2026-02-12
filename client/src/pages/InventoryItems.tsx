import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Package, X, Loader2 } from "lucide-react";
import type { InventoryItem } from "@shared/schema";

const CATEGORIES = ["Bakery", "Bar", "Kitchen", "FOH"] as const;

const itemFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  onHand: z.coerce.number().min(0).default(0),
});

export default function InventoryItems() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const isOwner = user?.role === "owner";

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items"],
  });

  const form = useForm<z.infer<typeof itemFormSchema>>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { name: "", category: "", unit: "", onHand: 0 },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof itemFormSchema> & { aliases: string[] }) => {
      await apiRequest("POST", "/api/inventory-items", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Item added" });
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof itemFormSchema> & { aliases: string[] } }) => {
      await apiRequest("PUT", `/api/inventory-items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Item updated" });
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/inventory-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Item deleted" });
    },
  });

  function resetForm() {
    form.reset({ name: "", category: "", unit: "", onHand: 0 });
    setAliases([]);
    setAliasInput("");
    setEditItem(null);
    setDialogOpen(false);
  }

  function openEdit(item: InventoryItem) {
    setEditItem(item);
    form.reset({ name: item.name, category: item.category, unit: item.unit, onHand: item.onHand });
    setAliases(item.aliases || []);
    setDialogOpen(true);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function addAlias() {
    const trimmed = aliasInput.trim();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
    }
    setAliasInput("");
  }

  function removeAlias(idx: number) {
    setAliases(aliases.filter((_, i) => i !== idx));
  }

  function onSubmit(data: z.infer<typeof itemFormSchema>) {
    const payload = { ...data, aliases };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/inventory">
          <Button variant="ghost" size="icon" data-testid="button-back-inventory">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight" data-testid="text-items-title">MASTER ITEM LIST</h1>
          <p className="text-muted-foreground text-sm">Manage inventory items and their invoice aliases</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="button-add-item">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editItem ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g., Bread Flour" data-testid="input-item-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit of Measure</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g., kg, lbs, each, case" data-testid="input-item-unit" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="onHand" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current On-Hand</FormLabel>
                    <FormControl><Input type="number" step="any" {...field} data-testid="input-item-onhand" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div>
                  <p className="text-sm font-medium mb-2">Invoice Aliases</p>
                  <p className="text-xs text-muted-foreground mb-2">Names this item might appear as on vendor invoices</p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={aliasInput}
                      onChange={(e) => setAliasInput(e.target.value)}
                      placeholder="Add an alias"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }}
                      data-testid="input-alias"
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addAlias} data-testid="button-add-alias">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {aliases.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {aliases.map((a, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          {a}
                          <button type="button" onClick={() => removeAlias(i)} className="ml-1">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-item">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editItem ? "Save Changes" : "Add Item"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No inventory items yet. Click "Add Item" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        CATEGORIES.map(cat => {
          const catItems = grouped[cat] || [];
          if (catItems.length === 0) return null;
          return (
            <Card key={cat}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  {cat}
                  <Badge variant="secondary">{catItems.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-3 gap-4" data-testid={`master-item-${item.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.name}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className="text-xs text-muted-foreground">{item.unit}</span>
                          {item.aliases && item.aliases.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              Aliases: {item.aliases.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-semibold">{item.onHand} {item.unit}</span>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} data-testid={`button-edit-item-${item.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {isOwner && (
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-item-${item.id}`}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
