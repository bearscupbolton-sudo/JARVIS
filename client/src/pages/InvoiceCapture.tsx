import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { Invoice, InventoryItem } from "@shared/schema";

const invoiceFormSchema = z.object({
  vendorName: z.string().min(1, "Vendor name is required"),
  invoiceDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

function getToday() {
  return new Date().toISOString().split("T")[0];
}

type LineEntry = { itemDescription: string; quantity: number; unit: string };

export default function InvoiceCapture() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [lineDesc, setLineDesc] = useState("");
  const [lineQty, setLineQty] = useState("");
  const [lineUnit, setLineUnit] = useState("");

  const { data: invoiceHistory = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: masterItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items"],
  });

  const form = useForm<z.infer<typeof invoiceFormSchema>>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: { vendorName: "", invoiceDate: getToday(), notes: "" },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: z.infer<typeof invoiceFormSchema> & { lines: LineEntry[] }) => {
      const res = await apiRequest("POST", "/api/invoices", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      const matchedCount = data.lines?.filter((l: any) => l.inventoryItemId).length || 0;
      const totalCount = data.lines?.length || 0;
      toast({
        title: "Invoice saved",
        description: `${matchedCount}/${totalCount} items matched to inventory`,
      });
      form.reset({ vendorName: "", invoiceDate: getToday(), notes: "" });
      setLines([]);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function addLine() {
    if (!lineDesc.trim() || !lineQty) return;
    setLines([...lines, {
      itemDescription: lineDesc.trim(),
      quantity: Number(lineQty),
      unit: lineUnit.trim(),
    }]);
    setLineDesc("");
    setLineQty("");
    setLineUnit("");
  }

  function removeLine(idx: number) {
    setLines(lines.filter((_, i) => i !== idx));
  }

  function wouldMatch(desc: string): InventoryItem | undefined {
    const lower = desc.toLowerCase().trim();
    return masterItems.find(item => {
      if (item.name.toLowerCase().trim() === lower) return true;
      if (item.aliases?.some(a => a.toLowerCase().trim() === lower)) return true;
      return false;
    });
  }

  function onSubmit(data: z.infer<typeof invoiceFormSchema>) {
    if (lines.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    submitMutation.mutate({ ...data, lines });
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
          <h1 className="font-display text-2xl font-bold tracking-tight" data-testid="text-invoice-title">INVOICE CAPTURE</h1>
          <p className="text-muted-foreground text-sm">Log vendor deliveries to update inventory</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>New Invoice</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="vendorName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor Name</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g., US Foods" data-testid="input-vendor" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Date</FormLabel>
                        <FormControl><Input type="date" {...field} data-testid="input-invoice-date" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl><Textarea {...field} placeholder="Any notes about this delivery" className="resize-none" data-testid="input-invoice-notes" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="border-t pt-4">
                    <p className="font-semibold mb-3">Line Items</p>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="flex-1 min-w-[150px]">
                        <label className="text-sm text-muted-foreground">Item Description</label>
                        <Input
                          value={lineDesc}
                          onChange={(e) => setLineDesc(e.target.value)}
                          placeholder="Item from invoice"
                          data-testid="input-line-desc"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-sm text-muted-foreground">Qty</label>
                        <Input
                          type="number"
                          step="any"
                          value={lineQty}
                          onChange={(e) => setLineQty(e.target.value)}
                          placeholder="0"
                          data-testid="input-line-qty"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-sm text-muted-foreground">Unit</label>
                        <Input
                          value={lineUnit}
                          onChange={(e) => setLineUnit(e.target.value)}
                          placeholder="case"
                          data-testid="input-line-unit"
                        />
                      </div>
                      <Button type="button" variant="outline" onClick={addLine} data-testid="button-add-line">
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    </div>

                    {lines.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {lines.map((line, idx) => {
                          const match = wouldMatch(line.itemDescription);
                          return (
                            <div key={idx} className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-muted/50" data-testid={`invoice-line-${idx}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                {match ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                )}
                                <span className="truncate">{line.itemDescription}</span>
                                <span className="text-muted-foreground shrink-0">x{line.quantity} {line.unit}</span>
                                {match && (
                                  <Badge variant="outline" className="shrink-0">{match.name}</Badge>
                                )}
                              </div>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={submitMutation.isPending || lines.length === 0} data-testid="button-submit-invoice">
                    {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Invoice ({lines.length} items)
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {invoiceHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No invoices recorded yet</p>
              ) : (
                <div className="space-y-3">
                  {invoiceHistory.slice(0, 10).map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 py-2" data-testid={`invoice-history-${inv.id}`}>
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{inv.vendorName}</p>
                        <p className="text-xs text-muted-foreground">{inv.invoiceDate}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
