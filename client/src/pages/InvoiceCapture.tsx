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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Plus, Trash2, FileText, CheckCircle2, AlertCircle,
  Loader2, Camera, Upload, X, ScanLine, Pencil, DollarSign, Link2, PackagePlus
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
  manualMatchId?: number | null;
  saveAsAlias?: boolean;
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
  const [createItemForLine, setCreateItemForLine] = useState<number | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemOnHand, setNewItemOnHand] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addMoreFileRef = useRef<HTMLInputElement>(null);
  const addMoreCameraRef = useRef<HTMLInputElement>(null);
  const [stagedImages, setStagedImages] = useState<string[]>([]);

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
          itemDescription: l.itemDescription,
          quantity: l.quantity,
          unit: l.unit || null,
          unitPrice: l.unitPrice ?? null,
          lineTotal: l.lineTotal ?? null,
          manualMatchId: l.manualMatchId || null,
          saveAsAlias: l.saveAsAlias || false,
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
      setStagedImages([]);
      setScanMode("idle");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (images: string[]) => {
      const res = await apiRequest("POST", "/api/invoices/scan", { images });
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
        description: `Found ${data.lines?.length || 0} line items from ${stagedImages.length} photo${stagedImages.length > 1 ? "s" : ""}. Review and edit before saving.`,
      });
    },
    onError: (err: Error) => {
      const msg = err.message || "";
      let description = msg;
      let title = "Scan failed";
      if (msg.includes("too large") || msg.includes("payload")) {
        title = "Image too large";
        description = "Try taking the photo from further away or scanning fewer pages at once.";
      } else if (msg.includes("timeout") || msg.includes("timed out")) {
        title = "Scan timed out";
        description = "The invoice may be too complex. Try scanning one page at a time.";
      } else if (msg.includes("blurry") || msg.includes("dark") || msg.includes("No line items")) {
        title = "Could not read invoice";
        description = msg;
      } else if (!description) {
        description = "Please try again with a clearer, well-lit photo.";
      }
      toast({ title, description, variant: "destructive" });
      setScanMode("capturing");
    },
  });

  async function stageImage(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        const { compressImage } = await import("@/lib/image-utils");
        const compressed = await compressImage(dataUrl, 1600, 0.85);
        setStagedImages(prev => [...prev, compressed]);
        if (scanMode === "idle") setScanMode("capturing");
      } catch {
        toast({ title: "Could not process image", description: "Try a different photo.", variant: "destructive" });
      }
    };
    reader.onerror = () => {
      toast({ title: "Could not read image", description: "The file may be corrupted. Try a different photo.", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  }

  function removeStagedImage(idx: number) {
    setStagedImages(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setScanMode("idle");
      return next;
    });
  }

  function scanAllImages() {
    if (stagedImages.length === 0) return;
    setPreviewImage(stagedImages[0]);
    setScanMode("scanning");
    scanMutation.mutate(stagedImages);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(f => stageImage(f));
    }
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

  function openCreateDialog(lineIdx: number) {
    const line = lines[lineIdx];
    setCreateItemForLine(lineIdx);
    setNewItemName(line.itemDescription);
    setNewItemCategory("");
    setNewItemUnit(line.unit || "");
    setNewItemCost(line.unitPrice != null ? String(line.unitPrice) : "");
    setNewItemOnHand(line.quantity > 0 ? String(line.quantity) : "");
  }

  async function handleCreateItem() {
    if (!newItemName.trim() || !newItemCategory.trim() || !newItemUnit.trim()) {
      toast({ title: "Name, category, and unit are required", variant: "destructive" });
      return;
    }
    setCreatingItem(true);
    try {
      const lineIdx = createItemForLine!;
      const originalDesc = lines[lineIdx].itemDescription;
      const aliases = [originalDesc.trim()];
      if (newItemName.trim().toLowerCase() !== originalDesc.trim().toLowerCase()) {
        aliases.unshift(newItemName.trim());
      } else {
        // no duplicate needed
      }
      const uniqueAliases = [...new Set(aliases.map(a => a.toLowerCase()))].length === aliases.length
        ? aliases
        : [originalDesc.trim()];

      const res = await apiRequest("POST", "/api/inventory-items", {
        name: newItemName.trim(),
        category: newItemCategory.trim(),
        unit: newItemUnit.trim(),
        aliases: uniqueAliases,
        onHand: newItemOnHand ? Number(newItemOnHand) : 0,
        costPerUnit: newItemCost ? Number(newItemCost) : null,
      });
      const created = await res.json();

      updateLine(lineIdx, { manualMatchId: created.id, saveAsAlias: false });

      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });

      toast({ title: `"${created.name}" created and linked` });
      setCreateItemForLine(null);
    } catch (err: any) {
      toast({ title: "Failed to create item", description: err.message, variant: "destructive" });
    } finally {
      setCreatingItem(false);
    }
  }

  const existingCategories = [...new Set(masterItems.map(i => i.category).filter(Boolean))].sort();

  function onSubmit(data: z.infer<typeof invoiceFormSchema>) {
    if (lines.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    submitMutation.mutate({ ...data, lines });
  }

  function clearScan() {
    setPreviewImage(null);
    setStagedImages([]);
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
        multiple
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-file-upload"
      />
      <input
        ref={addMoreFileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-add-more-file"
      />
      <input
        ref={addMoreCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-add-more-camera"
      />

      {(scanMode === "idle" || scanMode === "capturing") && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <ScanLine className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold mb-1">
                  {stagedImages.length > 0 ? `${stagedImages.length} Photo${stagedImages.length > 1 ? "s" : ""} Ready` : "Scan an Invoice"}
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  {stagedImages.length > 0
                    ? "Add more photos if the invoice has multiple pages, or scan now."
                    : "Take a photo or upload images of a vendor invoice. They will be read and all the details extracted automatically."}
                </p>
              </div>

              {stagedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center max-w-lg" data-testid="staged-images-grid">
                  {stagedImages.map((img, idx) => (
                    <div key={idx} className="relative group w-20 h-20 rounded-md overflow-hidden border" data-testid={`staged-image-${idx}`}>
                      <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeStagedImage(idx)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-staged-${idx}`}
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white px-1 rounded">{idx + 1}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap justify-center">
                <Button
                  onClick={() => cameraInputRef.current?.click()}
                  variant={stagedImages.length > 0 ? "outline" : "default"}
                  data-testid="button-take-photo"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {stagedImages.length > 0 ? "Add Photo" : "Take Photo"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-upload-photo"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {stagedImages.length > 0 ? "Add Images" : "Upload Images"}
                </Button>
              </div>

              {stagedImages.length > 0 && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 max-w-sm" data-testid="scan-tips">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>For best results: fill the frame with the invoice, avoid shadows and glare, and keep the paper flat.</span>
                  </div>
                  <Button
                    onClick={scanAllImages}
                    size="lg"
                    className="px-8"
                    data-testid="button-scan-all"
                  >
                    <ScanLine className="w-4 h-4 mr-2" />
                    Scan {stagedImages.length} Photo{stagedImages.length > 1 ? "s" : ""}
                  </Button>
                </div>
              )}

              {stagedImages.length === 0 && (
                <>
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
                </>
              )}
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
                <h2 className="text-lg font-semibold mb-1">Reading {stagedImages.length > 1 ? `${stagedImages.length} photos` : "the invoice"}...</h2>
                <p className="text-sm text-muted-foreground">Extracting vendor, dates, line items, and prices</p>
              </div>
              {stagedImages.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {stagedImages.map((img, idx) => (
                    <div key={idx} className="w-20 h-20 rounded-md overflow-hidden border">
                      <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" data-testid={`img-scanning-preview-${idx}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(scanMode === "review") && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {stagedImages.length > 0 && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex gap-1.5 shrink-0">
                      {stagedImages.map((img, idx) => (
                        <div key={idx} className="w-12 h-12 rounded-md overflow-hidden border">
                          <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">Invoice scanned ({stagedImages.length} photo{stagedImages.length > 1 ? "s" : ""})</span>
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
                <CardTitle>{stagedImages.length > 0 ? "Review Invoice" : "New Invoice"}</CardTitle>
                {stagedImages.length === 0 && (
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
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                        {match || line.manualMatchId ? (
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
                                        {!match && line.manualMatchId && (
                                          <Badge variant="secondary" className="shrink-0">
                                            <Link2 className="w-3 h-3 mr-1" />
                                            {masterItems.find(i => i.id === line.manualMatchId)?.name || "Matched"}
                                          </Badge>
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
                                    {!match && !line.manualMatchId && (
                                      <div className="flex items-center gap-2 ml-6 flex-wrap">
                                        <Select
                                          value=""
                                          onValueChange={(val) => {
                                            const id = parseInt(val, 10);
                                            updateLine(idx, { manualMatchId: id, saveAsAlias: true });
                                          }}
                                        >
                                          <SelectTrigger className="h-8 text-xs w-48" data-testid={`select-match-${idx}`}>
                                            <SelectValue placeholder="Match to inventory..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {masterItems.map(item => (
                                              <SelectItem key={item.id} value={String(item.id)}>{item.name} ({item.category})</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-8 text-xs gap-1"
                                          onClick={() => openCreateDialog(idx)}
                                          data-testid={`button-create-item-${idx}`}
                                        >
                                          <PackagePlus className="w-3.5 h-3.5" />
                                          Create New Item
                                        </Button>
                                        <span className="text-xs text-muted-foreground">No auto-match found</span>
                                      </div>
                                    )}
                                    {!match && line.manualMatchId && (
                                      <div className="flex items-center gap-3 ml-6">
                                        <div className="flex items-center gap-2">
                                          <Checkbox
                                            id={`alias-${idx}`}
                                            checked={line.saveAsAlias !== false}
                                            onCheckedChange={(checked) => updateLine(idx, { saveAsAlias: !!checked })}
                                            data-testid={`checkbox-alias-${idx}`}
                                          />
                                          <label htmlFor={`alias-${idx}`} className="text-xs text-muted-foreground cursor-pointer">
                                            Remember this match for next time
                                          </label>
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-xs px-2"
                                          onClick={() => updateLine(idx, { manualMatchId: null, saveAsAlias: false })}
                                          data-testid={`button-unmatch-${idx}`}
                                        >
                                          <X className="w-3 h-3 mr-1" />
                                          Unmatch
                                        </Button>
                                      </div>
                                    )}
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

      <Dialog open={createItemForLine !== null} onOpenChange={(open) => { if (!open) setCreateItemForLine(null); }}>
        <DialogContent className="max-w-md" data-testid="dialog-create-item">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5" />
              Create New Inventory Item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-item-name">Item Name</Label>
              <Input
                id="new-item-name"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Clean up the vendor description"
                data-testid="input-new-item-name"
              />
              {createItemForLine !== null && lines[createItemForLine] && newItemName.trim().toLowerCase() !== lines[createItemForLine].itemDescription.trim().toLowerCase() && (
                <p className="text-xs text-muted-foreground mt-1">
                  Vendor alias "{lines[createItemForLine].itemDescription}" will be saved automatically
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="new-item-category">Category</Label>
              {existingCategories.length > 0 ? (
                <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                  <SelectTrigger data-testid="select-new-item-category">
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="new-item-category"
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  placeholder="e.g. Dairy, Dry Goods, Produce"
                  data-testid="input-new-item-category"
                />
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="new-item-unit">Unit</Label>
                <Input
                  id="new-item-unit"
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  placeholder="case"
                  data-testid="input-new-item-unit"
                />
              </div>
              <div>
                <Label htmlFor="new-item-cost">Cost/Unit</Label>
                <Input
                  id="new-item-cost"
                  type="number"
                  step="0.01"
                  value={newItemCost}
                  onChange={(e) => setNewItemCost(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-new-item-cost"
                />
              </div>
              <div>
                <Label htmlFor="new-item-onhand">On Hand</Label>
                <Input
                  id="new-item-onhand"
                  type="number"
                  step="any"
                  value={newItemOnHand}
                  onChange={(e) => setNewItemOnHand(e.target.value)}
                  placeholder="0"
                  data-testid="input-new-item-onhand"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateItemForLine(null)}
                disabled={creatingItem}
                data-testid="button-cancel-create-item"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateItem}
                disabled={creatingItem || !newItemName.trim() || !newItemCategory.trim() || !newItemUnit.trim()}
                data-testid="button-save-create-item"
              >
                {creatingItem ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Create & Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
