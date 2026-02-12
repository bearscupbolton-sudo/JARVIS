import { useState, useRef } from "react";
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
import {
  ArrowLeft, Plus, Trash2, FileText, CheckCircle2, AlertCircle,
  Loader2, Camera, Upload, X, ScanLine, Pencil, DollarSign
} from "lucide-react";
import type { Invoice, InventoryItem } from "@shared/schema";

const invoiceFormSchema = z.object({
  vendorName: z.string().min(1, "Vendor name is required"),
  invoiceDate: z.string().min(1, "Date is required"),
  invoiceNumber: z.string().optional(),
  invoiceTotal: z.string().optional(),
  notes: z.string().optional(),
});

function getToday() {
  return new Date().toISOString().split("T")[0];
}

type LineEntry = {
  itemDescription: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  lineTotal: number | null;
};

type ScanMode = "idle" | "capturing" | "scanning" | "review";

export default function InvoiceCapture() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [lineDesc, setLineDesc] = useState("");
  const [lineQty, setLineQty] = useState("");
  const [lineUnit, setLineUnit] = useState("");
  const [linePrice, setLinePrice] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>("idle");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { data: invoiceHistory = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: masterItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items"],
  });

  const form = useForm<z.infer<typeof invoiceFormSchema>>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: { vendorName: "", invoiceDate: getToday(), invoiceNumber: "", invoiceTotal: "", notes: "" },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: z.infer<typeof invoiceFormSchema> & { lines: LineEntry[] }) => {
      const res = await apiRequest("POST", "/api/invoices", {
        ...data,
        invoiceTotal: data.invoiceTotal ? Number(data.invoiceTotal) : null,
        lines: data.lines.map(l => ({
          ...l,
          unitPrice: l.unitPrice ?? null,
          lineTotal: l.lineTotal ?? null,
        })),
      });
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
      form.reset({ vendorName: "", invoiceDate: getToday(), invoiceNumber: "", invoiceTotal: "", notes: "" });
      setLines([]);
      setPreviewImage(null);
      setScanMode("idle");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const res = await apiRequest("POST", "/api/invoices/scan", { image: imageData });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.vendorName) form.setValue("vendorName", data.vendorName);
      if (data.invoiceDate) form.setValue("invoiceDate", data.invoiceDate);
      if (data.invoiceNumber) form.setValue("invoiceNumber", data.invoiceNumber);
      if (data.invoiceTotal != null) form.setValue("invoiceTotal", String(data.invoiceTotal));
      if (data.notes) form.setValue("notes", data.notes);

      if (data.lines && Array.isArray(data.lines)) {
        const parsedLines: LineEntry[] = data.lines.map((l: any) => ({
          itemDescription: l.itemDescription || "",
          quantity: Number(l.quantity) || 0,
          unit: l.unit || "",
          unitPrice: l.unitPrice != null ? Number(l.unitPrice) : null,
          lineTotal: l.lineTotal != null ? Number(l.lineTotal) : null,
        }));
        setLines(parsedLines);
      }

      setScanMode("review");
      toast({
        title: "Invoice scanned",
        description: `Found ${data.lines?.length || 0} line items. Review and edit before saving.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      setScanMode("idle");
    },
  });

  function handleImageSelected(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreviewImage(dataUrl);
      setScanMode("scanning");
      scanMutation.mutate(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImageSelected(file);
    e.target.value = "";
  }

  function addLine() {
    if (!lineDesc.trim() || !lineQty) return;
    setLines([...lines, {
      itemDescription: lineDesc.trim(),
      quantity: Number(lineQty),
      unit: lineUnit.trim(),
      unitPrice: linePrice ? Number(linePrice) : null,
      lineTotal: linePrice && lineQty ? Number(linePrice) * Number(lineQty) : null,
    }]);
    setLineDesc("");
    setLineQty("");
    setLineUnit("");
    setLinePrice("");
  }

  function removeLine(idx: number) {
    setLines(lines.filter((_, i) => i !== idx));
    if (editingLine === idx) setEditingLine(null);
  }

  function updateLine(idx: number, updates: Partial<LineEntry>) {
    setLines(lines.map((l, i) => i === idx ? { ...l, ...updates } : l));
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

  function clearScan() {
    setPreviewImage(null);
    setScanMode("idle");
    form.reset({ vendorName: "", invoiceDate: getToday(), invoiceNumber: "", invoiceTotal: "", notes: "" });
    setLines([]);
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
          <p className="text-muted-foreground text-sm">Scan or manually enter vendor invoices</p>
        </div>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-camera-capture"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-file-upload"
      />

      {scanMode === "idle" && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <ScanLine className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold mb-1">Scan an Invoice</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Take a photo or upload an image of a vendor invoice. Jarvis will read it and extract all the details automatically.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <Button
                  onClick={() => cameraInputRef.current?.click()}
                  data-testid="button-take-photo"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Take Photo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-upload-photo"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Image
                </Button>
              </div>
              <div className="flex items-center gap-3 w-full max-w-xs">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <Button
                variant="ghost"
                onClick={() => setScanMode("review")}
                data-testid="button-manual-entry"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Enter Manually
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {scanMode === "scanning" && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="text-center">
                <h2 className="text-lg font-semibold mb-1">Jarvis is reading the invoice...</h2>
                <p className="text-sm text-muted-foreground">Extracting vendor, dates, line items, and prices</p>
              </div>
              {previewImage && (
                <div className="mt-4 max-w-xs rounded-md overflow-hidden border">
                  <img src={previewImage} alt="Invoice preview" className="w-full h-auto" data-testid="img-invoice-preview" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(scanMode === "review") && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {previewImage && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-16 h-16 rounded-md overflow-hidden border shrink-0">
                      <img src={previewImage} alt="Scanned invoice" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">Invoice scanned</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Review the extracted data below and make any corrections before saving.</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearScan} data-testid="button-clear-scan">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle>{previewImage ? "Review Invoice" : "New Invoice"}</CardTitle>
                {!previewImage && (
                  <Button variant="ghost" size="sm" onClick={() => setScanMode("idle")} data-testid="button-back-scan">
                    <Camera className="w-4 h-4 mr-2" />
                    Scan Instead
                  </Button>
                )}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice # (optional)</FormLabel>
                          <FormControl><Input {...field} placeholder="INV-001234" data-testid="input-invoice-number" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="invoiceTotal" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice Total (optional)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} placeholder="0.00" data-testid="input-invoice-total" /></FormControl>
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
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <p className="font-semibold">Line Items</p>
                        {lines.length > 0 && (
                          <Badge variant="secondary">{lines.length} items</Badge>
                        )}
                      </div>

                      {lines.length > 0 && (
                        <div className="mb-4 space-y-2">
                          {lines.map((line, idx) => {
                            const match = wouldMatch(line.itemDescription);
                            const isEditing = editingLine === idx;
                            return (
                              <div key={idx} className="py-2 px-3 rounded-md bg-muted/50" data-testid={`invoice-line-${idx}`}>
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <div className="flex items-end gap-2 flex-wrap">
                                      <div className="flex-1 min-w-[120px]">
                                        <label className="text-xs text-muted-foreground">Description</label>
                                        <Input
                                          value={line.itemDescription}
                                          onChange={(e) => updateLine(idx, { itemDescription: e.target.value })}
                                          data-testid={`input-edit-desc-${idx}`}
                                        />
                                      </div>
                                      <div className="w-20">
                                        <label className="text-xs text-muted-foreground">Qty</label>
                                        <Input
                                          type="number"
                                          step="any"
                                          value={line.quantity}
                                          onChange={(e) => {
                                            const qty = Number(e.target.value);
                                            updateLine(idx, {
                                              quantity: qty,
                                              lineTotal: line.unitPrice != null ? line.unitPrice * qty : null,
                                            });
                                          }}
                                          data-testid={`input-edit-qty-${idx}`}
                                        />
                                      </div>
                                      <div className="w-20">
                                        <label className="text-xs text-muted-foreground">Unit</label>
                                        <Input
                                          value={line.unit}
                                          onChange={(e) => updateLine(idx, { unit: e.target.value })}
                                          data-testid={`input-edit-unit-${idx}`}
                                        />
                                      </div>
                                      <div className="w-24">
                                        <label className="text-xs text-muted-foreground">Unit Price</label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={line.unitPrice ?? ""}
                                          onChange={(e) => {
                                            const price = e.target.value ? Number(e.target.value) : null;
                                            updateLine(idx, {
                                              unitPrice: price,
                                              lineTotal: price != null ? price * line.quantity : null,
                                            });
                                          }}
                                          data-testid={`input-edit-price-${idx}`}
                                        />
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 justify-end">
                                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingLine(null)} data-testid={`button-done-edit-${idx}`}>
                                        Done
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                      {match ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                      ) : (
                                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                      )}
                                      <span className="truncate font-medium text-sm">{line.itemDescription}</span>
                                      <span className="text-muted-foreground text-sm shrink-0">x{line.quantity} {line.unit}</span>
                                      {line.unitPrice != null && (
                                        <span className="text-sm text-muted-foreground shrink-0">@ ${line.unitPrice.toFixed(2)}</span>
                                      )}
                                      {line.lineTotal != null && (
                                        <Badge variant="outline" className="shrink-0">
                                          <DollarSign className="w-3 h-3 mr-0.5" />
                                          {line.lineTotal.toFixed(2)}
                                        </Badge>
                                      )}
                                      {match && (
                                        <Badge variant="secondary" className="shrink-0">{match.name}</Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button type="button" variant="ghost" size="icon" onClick={() => setEditingLine(idx)} data-testid={`button-edit-line-${idx}`}>
                                        <Pencil className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(idx)} data-testid={`button-remove-line-${idx}`}>
                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-sm text-muted-foreground">Item Description</label>
                          <Input
                            value={lineDesc}
                            onChange={(e) => setLineDesc(e.target.value)}
                            placeholder="Item from invoice"
                            data-testid="input-line-desc"
                          />
                        </div>
                        <div className="w-20">
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
                        <div className="w-20">
                          <label className="text-sm text-muted-foreground">Unit</label>
                          <Input
                            value={lineUnit}
                            onChange={(e) => setLineUnit(e.target.value)}
                            placeholder="case"
                            data-testid="input-line-unit"
                          />
                        </div>
                        <div className="w-24">
                          <label className="text-sm text-muted-foreground">Price</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={linePrice}
                            onChange={(e) => setLinePrice(e.target.value)}
                            placeholder="0.00"
                            data-testid="input-line-price"
                          />
                        </div>
                        <Button type="button" variant="outline" onClick={addLine} data-testid="button-add-line">
                          <Plus className="w-4 h-4 mr-1" />
                          Add
                        </Button>
                      </div>
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

          <div className="space-y-4">
            {previewImage && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Scanned Image</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md overflow-hidden border">
                    <img src={previewImage} alt="Invoice" className="w-full h-auto" data-testid="img-invoice-full" />
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => {
                      cameraInputRef.current?.click();
                    }} data-testid="button-rescan">
                      <Camera className="w-4 h-4 mr-1" />
                      Rescan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

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
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">{inv.invoiceDate}</p>
                            {inv.invoiceNumber && (
                              <span className="text-xs text-muted-foreground">#{inv.invoiceNumber}</span>
                            )}
                          </div>
                        </div>
                        {inv.invoiceTotal != null && (
                          <span className="text-sm font-medium shrink-0">${inv.invoiceTotal.toFixed(2)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

    </div>
  );
}
