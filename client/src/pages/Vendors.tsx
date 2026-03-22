import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Truck,
  Phone,
  Mail,
  Calendar,
  PackageCheck,
  Send,
  ArrowLeft,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Server,
  Download,
  Loader2,
  FileText,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import type { Vendor, VendorItem, InventoryItem, PurchaseOrder, PurchaseOrderLine } from "@shared/schema";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

type VendorItemWithInventory = VendorItem & { inventoryItem: InventoryItem };
type PurchaseOrderWithVendor = PurchaseOrder & { vendor: Vendor };
type PurchaseOrderFull = PurchaseOrder & { vendor: Vendor; lines: PurchaseOrderLine[] };

function PfgIntegrationCard() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "order-guide" | "push-order" | "acks">("overview");
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string; outFiles?: any[]; inFiles?: any[] } | null>(null);
  const [pfgFiles, setPfgFiles] = useState<any[]>([]);
  const [orderGuide, setOrderGuide] = useState<any[]>([]);
  const [ogSearch, setOgSearch] = useState("");
  const [orderLines, setOrderLines] = useState<{ pfgItemNumber: string; description: string; caseQuantity: number; specialMessage: string }[]>([]);
  const [poNumber, setPoNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [acks, setAcks] = useState<any[]>([]);

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/pfg/test");
      return res.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success && data.outFiles) setPfgFiles(data.outFiles);
      toast({ title: data.success ? "PFG Connected" : "Connection Failed", description: data.message });
    },
    onError: (err: Error) => {
      setTestResult({ success: false, message: err.message });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pfg/import");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "PFG Import Complete", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      } else {
        toast({ title: "Import Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Import Error", description: err.message, variant: "destructive" }),
  });

  const ogMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/pfg/order-guide");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setOrderGuide(data.items);
        toast({ title: "Order Guide Loaded", description: data.message });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const ackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/pfg/acknowledgements");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setAcks(data.acknowledgements);
        toast({ title: "Acknowledgements Loaded", description: data.message });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pfg/push-order", {
        customerNumber: "",
        poNumber,
        deliveryDate: deliveryDate ? deliveryDate.replace(/-/g, "") : undefined,
        specialInstructions: specialInstructions || undefined,
        lines: orderLines.filter(l => l.caseQuantity > 0).map(l => ({
          pfgItemNumber: l.pfgItemNumber,
          caseQuantity: l.caseQuantity,
          specialMessage: l.specialMessage || undefined,
        })),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Order Pushed to PFG", description: `File: ${data.fileName}` });
        setOrderLines([]);
        setPoNumber("");
        setDeliveryDate("");
        setSpecialInstructions("");
      } else {
        toast({ title: "Push Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function addFromOrderGuide(item: any) {
    if (orderLines.some(l => l.pfgItemNumber === item.itemNumber)) return;
    setOrderLines(prev => [...prev, {
      pfgItemNumber: item.itemNumber,
      description: item.description,
      caseQuantity: 1,
      specialMessage: "",
    }]);
    toast({ title: `Added ${item.description}` });
  }

  function updateOrderLine(idx: number, field: string, value: any) {
    setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  function removeOrderLine(idx: number) {
    setOrderLines(prev => prev.filter((_, i) => i !== idx));
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const filteredOg = ogSearch.trim()
    ? orderGuide.filter((i: any) => i.description?.toLowerCase().includes(ogSearch.toLowerCase()) || i.itemNumber?.includes(ogSearch) || i.brandName?.toLowerCase().includes(ogSearch.toLowerCase()))
    : orderGuide;

  const connected = testResult?.success === true;

  return (
    <Card data-testid="card-pfg-integration">
      <CardContent className="p-4">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setExpanded(!expanded)}
          data-testid="button-pfg-toggle"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Server className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">Performance Food Group (PFG)</p>
              <p className="text-xs text-muted-foreground">SFTP · invoices, order guides, orders & acknowledgements</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {testResult && (
              connected
                ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs"><Wifi className="w-3 h-3 mr-1" /> Connected</Badge>
                : <Badge variant="destructive" className="text-xs"><WifiOff className="w-3 h-3 mr-1" /> Failed</Badge>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 space-y-4 border-t pt-4">
            {!connected && (
              <Button size="sm" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} data-testid="button-pfg-test">
                {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wifi className="w-3 h-3 mr-1" />}
                Test Connection
              </Button>
            )}

            {testResult && !connected && (
              <div className="text-sm p-3 rounded-md bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300">
                {testResult.message}
              </div>
            )}

            {connected && (
              <>
                <div className="flex gap-1 flex-wrap">
                  {(["overview", "order-guide", "push-order", "acks"] as const).map(tab => (
                    <Button key={tab} size="sm" variant={activeTab === tab ? "default" : "outline"} onClick={() => setActiveTab(tab)} data-testid={`pfg-tab-${tab}`}>
                      {tab === "overview" ? "Overview" : tab === "order-guide" ? "Order Guide" : tab === "push-order" ? "Place Order" : "Acknowledgements"}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} data-testid="button-pfg-refresh">
                    {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                  </Button>
                </div>

                {activeTab === "overview" && (
                  <div className="space-y-3">
                    <div className="text-sm p-3 rounded-md bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-300">
                      {testResult.message}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={() => importMutation.mutate()} disabled={importMutation.isPending} data-testid="button-pfg-import">
                        {importMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                        Pull Invoices
                      </Button>
                    </div>

                    {pfgFiles.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Files in /OUT ({pfgFiles.length})</p>
                        <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                          {pfgFiles.map((f: any, i: number) => (
                            <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm" data-testid={`pfg-file-${i}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate text-xs">{f.name}</span>
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatFileSize(f.size)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {importMutation.data?.success && importMutation.data.imported?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Import Results</p>
                        {importMutation.data.imported.map((r: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 text-sm bg-muted/50 rounded-md p-2 flex-wrap">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-xs">{r.fileName}</span>
                            <Badge variant="outline" className="text-xs">{r.invoiceCount} inv</Badge>
                            <Badge className="bg-green-100 text-green-700 text-xs">{r.matchedLines} matched</Badge>
                            {r.unmatchedLines > 0 && <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-600">{r.unmatchedLines} unmatched</Badge>}
                            {r.skippedDupes > 0 && <Badge variant="outline" className="text-xs text-muted-foreground">{r.skippedDupes} already imported</Badge>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "order-guide" && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => ogMutation.mutate()} disabled={ogMutation.isPending} data-testid="button-pfg-og-load">
                        {ogMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                        Load Order Guide
                      </Button>
                      {orderGuide.length > 0 && (
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                          <Input className="pl-8 h-8 text-sm" value={ogSearch} onChange={e => setOgSearch(e.target.value)} placeholder="Search items..." data-testid="input-og-search" />
                        </div>
                      )}
                    </div>
                    {orderGuide.length > 0 && (
                      <div className="border rounded-md overflow-hidden">
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="text-left p-2">Item #</th>
                                <th className="text-left p-2">Description</th>
                                <th className="text-left p-2">Brand</th>
                                <th className="text-left p-2">Pack/Size</th>
                                <th className="text-right p-2">Case $</th>
                                <th className="p-2 w-8"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {filteredOg.slice(0, 100).map((item: any, i: number) => (
                                <tr key={i} className="hover:bg-muted/30" data-testid={`og-row-${i}`}>
                                  <td className="p-2 font-mono">{item.itemNumber}</td>
                                  <td className="p-2">{item.description}</td>
                                  <td className="p-2 text-muted-foreground">{item.brandName}</td>
                                  <td className="p-2 text-muted-foreground">{item.packCount}/{item.size}</td>
                                  <td className="p-2 text-right font-mono">${item.casePrice?.toFixed(2)}</td>
                                  <td className="p-2">
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => addFromOrderGuide(item)} data-testid={`og-add-${i}`}>
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {filteredOg.length > 100 && <p className="text-xs text-muted-foreground text-center py-1">Showing first 100 of {filteredOg.length}</p>}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "push-order" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium">PO Number *</label>
                        <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="e.g., BCB-20260322" className="h-8 text-sm" data-testid="input-pfg-po" />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Delivery Date</label>
                        <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-8 text-sm" data-testid="input-pfg-delivery" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Special Instructions</label>
                      <Input value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} placeholder="Optional shipping notes" className="h-8 text-sm" data-testid="input-pfg-instructions" />
                    </div>

                    {orderLines.length > 0 && (
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2">PFG Item #</th>
                              <th className="text-left p-2">Description</th>
                              <th className="text-right p-2 w-20">Cases</th>
                              <th className="text-left p-2">Note</th>
                              <th className="p-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {orderLines.map((line, i) => (
                              <tr key={i} data-testid={`order-line-${i}`}>
                                <td className="p-2 font-mono">{line.pfgItemNumber}</td>
                                <td className="p-2">{line.description}</td>
                                <td className="p-2">
                                  <Input type="number" min={1} value={line.caseQuantity} onChange={e => updateOrderLine(i, "caseQuantity", parseInt(e.target.value) || 0)} className="h-6 w-16 text-xs text-right ml-auto" data-testid={`input-qty-${i}`} />
                                </td>
                                <td className="p-2">
                                  <Input value={line.specialMessage} onChange={e => updateOrderLine(i, "specialMessage", e.target.value)} className="h-6 text-xs" placeholder="Optional" data-testid={`input-note-${i}`} />
                                </td>
                                <td className="p-2">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeOrderLine(i)}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => pushMutation.mutate()}
                        disabled={pushMutation.isPending || !poNumber.trim() || orderLines.filter(l => l.caseQuantity > 0).length === 0}
                        data-testid="button-pfg-push"
                      >
                        {pushMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                        Push Order to PFG
                      </Button>
                      <span className="text-xs text-muted-foreground">{orderLines.filter(l => l.caseQuantity > 0).length} line(s)</span>
                      {orderGuide.length === 0 && (
                        <Button size="sm" variant="outline" onClick={() => { ogMutation.mutate(); setActiveTab("order-guide"); }} data-testid="button-pfg-load-og-first">
                          Load Order Guide first
                        </Button>
                      )}
                    </div>

                    {pushMutation.data?.success && (
                      <div className="text-sm p-3 rounded-md bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-300">
                        Order pushed: {pushMutation.data.fileName}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Orders pushed as PFSOR170_*.TXT to /IN · Use the Order Guide tab to browse and add items
                    </p>
                  </div>
                )}

                {activeTab === "acks" && (
                  <div className="space-y-3">
                    <Button size="sm" onClick={() => ackMutation.mutate()} disabled={ackMutation.isPending} data-testid="button-pfg-acks">
                      {ackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                      Pull Acknowledgements
                    </Button>
                    {acks.length > 0 && (
                      <div className="space-y-2">
                        {acks.map((ack: any, i: number) => (
                          <Card key={i} data-testid={`ack-card-${i}`}>
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <span className="font-medium text-sm">PO: {ack.header.poNumber}</span>
                                  <span className="text-xs text-muted-foreground ml-2">ACK #{ack.header.ackNumber}</span>
                                </div>
                                <Badge variant="outline" className="text-xs">{ack.header.ackDate}</Badge>
                              </div>
                              <div className="space-y-1">
                                {ack.details.map((d: any, j: number) => (
                                  <div key={j} className="flex items-center gap-2 text-xs">
                                    <Badge variant={d.lineStatusCode === "IA" ? "default" : d.lineStatusCode === "ID" ? "destructive" : "outline"} className="text-xs w-8 justify-center">
                                      {d.lineStatusCode}
                                    </Badge>
                                    <span className="font-mono text-muted-foreground">{d.itemNumber}</span>
                                    <span className="flex-1 truncate">{d.description}</span>
                                    <span className="font-mono">{d.quantityToShip} {d.uom}</span>
                                    <span className="font-mono text-muted-foreground">${d.unitPrice?.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                    {acks.length === 0 && !ackMutation.isPending && (
                      <p className="text-xs text-muted-foreground">No acknowledgements loaded yet. Click above to pull from PFG.</p>
                    )}
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-muted-foreground border-t pt-2">
              ecomm.pfgc.com · OPCO 170 (PFS-Springfield) · /OUT: invoices, order guides, acks · /IN: orders
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Vendors() {
  const { toast } = useToast();
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [generatedOrder, setGeneratedOrder] = useState<PurchaseOrderFull | null>(null);

  const [vendorName, setVendorName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [orderDays, setOrderDays] = useState<string[]>([]);
  const [vendorNotes, setVendorNotes] = useState("");

  const [itemInventoryId, setItemInventoryId] = useState("");
  const [itemParLevel, setItemParLevel] = useState("");
  const [itemOrderUpTo, setItemOrderUpTo] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemUnit, setItemUnit] = useState("");

  const { data: allVendors, isLoading } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });
  const { data: todayVendors } = useQuery<Vendor[]>({ queryKey: ["/api/vendors/today-orders"] });
  const { data: inventoryItemsList } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory-items"] });

  const selectedVendor = allVendors?.find(v => v.id === selectedVendorId);

  const { data: vendorItemsData } = useQuery<VendorItemWithInventory[]>({
    queryKey: ["/api/vendors", selectedVendorId, "items"],
    enabled: !!selectedVendorId,
  });

  const { data: vendorOrders } = useQuery<PurchaseOrderWithVendor[]>({
    queryKey: ["/api/purchase-orders"],
    enabled: !!selectedVendorId,
  });

  const filteredOrders = vendorOrders?.filter(o => o.vendorId === selectedVendorId) || [];

  const createVendorMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vendors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({ title: "Vendor added" });
      resetVendorForm();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateVendorMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: any }) => apiRequest("PATCH", `/api/vendors/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({ title: "Vendor updated" });
      resetVendorForm();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteVendorMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vendors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setSelectedVendorId(null);
      toast({ title: "Vendor removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createItemMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/vendors/${selectedVendorId}/items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", selectedVendorId, "items"] });
      toast({ title: "Item linked" });
      resetItemForm();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: any }) => apiRequest("PATCH", `/api/vendor-items/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", selectedVendorId, "items"] });
      toast({ title: "Item updated" });
      resetItemForm();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vendor-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", selectedVendorId, "items"] });
      toast({ title: "Item removed" });
    },
  });

  const generateOrderMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/purchase-orders/generate", { vendorId: selectedVendorId }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      if (data.order === null) {
        toast({ title: "All stocked up", description: "All items are above par level." });
      } else {
        setGeneratedOrder(data);
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
        toast({ title: "Order generated" });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const sendSmsMutation = useMutation({
    mutationFn: (orderId: number) => apiRequest("POST", `/api/purchase-orders/${orderId}/send-sms`),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      if (data.success) {
        toast({ title: "Order sent via SMS" });
        setGeneratedOrder(null);
      } else {
        toast({ title: "SMS not sent", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function resetVendorForm() {
    setShowAddVendor(false);
    setEditVendor(null);
    setVendorName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setOrderDays([]);
    setVendorNotes("");
  }

  function resetItemForm() {
    setShowAddItem(false);
    setEditItemId(null);
    setItemInventoryId("");
    setItemParLevel("");
    setItemOrderUpTo("");
    setItemDescription("");
    setItemUnit("");
  }

  function openEditVendor(v: Vendor) {
    setEditVendor(v);
    setVendorName(v.name);
    setContactName(v.contactName || "");
    setPhone(v.phone || "");
    setEmail(v.email || "");
    setOrderDays(v.orderDays || []);
    setVendorNotes(v.notes || "");
    setShowAddVendor(true);
  }

  function openEditItem(vi: VendorItemWithInventory) {
    setEditItemId(vi.id);
    setItemInventoryId(String(vi.inventoryItemId));
    setItemParLevel(vi.parLevel != null ? String(vi.parLevel) : "");
    setItemOrderUpTo(vi.orderUpToLevel != null ? String(vi.orderUpToLevel) : "");
    setItemDescription(vi.vendorDescription || "");
    setItemUnit(vi.preferredUnit || "");
    setShowAddItem(true);
  }

  function handleSaveVendor() {
    if (!vendorName.trim()) return;
    const data = {
      name: vendorName.trim(),
      contactName: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      orderDays,
      notes: vendorNotes.trim() || null,
    };
    if (editVendor) {
      updateVendorMutation.mutate({ id: editVendor.id, updates: data });
    } else {
      createVendorMutation.mutate(data);
    }
  }

  function handleSaveItem() {
    if (!itemInventoryId) return;
    const data = {
      inventoryItemId: parseInt(itemInventoryId),
      parLevel: itemParLevel ? parseFloat(itemParLevel) : null,
      orderUpToLevel: itemOrderUpTo ? parseFloat(itemOrderUpTo) : null,
      vendorDescription: itemDescription.trim() || null,
      preferredUnit: itemUnit.trim() || null,
    };
    if (editItemId) {
      updateItemMutation.mutate({ id: editItemId, updates: data });
    } else {
      createItemMutation.mutate(data);
    }
  }

  function toggleDay(day: string) {
    setOrderDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  const todayDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  if (selectedVendor) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" data-testid="container-vendor-detail">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedVendorId(null); setGeneratedOrder(null); }} data-testid="button-back-vendors">
            <ArrowLeft className="w-4 h-4 mr-1" /> Vendors
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="text-vendor-name">{selectedVendor.name}</h1>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
              {selectedVendor.contactName && (
                <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> {selectedVendor.contactName}</span>
              )}
              {selectedVendor.phone && (
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {selectedVendor.phone}</span>
              )}
              {selectedVendor.email && (
                <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {selectedVendor.email}</span>
              )}
            </div>
            {selectedVendor.orderDays.length > 0 && (
              <div className="flex gap-1 mt-2">
                {DAYS.map(d => (
                  <Badge
                    key={d}
                    variant={selectedVendor.orderDays.includes(d) ? "default" : "outline"}
                    className={`text-xs ${selectedVendor.orderDays.includes(d) ? "" : "opacity-30"}`}
                  >
                    {DAY_LABELS[d]}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openEditVendor(selectedVendor)} data-testid="button-edit-vendor">
              <Pencil className="w-4 h-4 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              onClick={() => generateOrderMutation.mutate()}
              disabled={generateOrderMutation.isPending || !vendorItemsData?.length}
              data-testid="button-generate-order"
            >
              <ShoppingCart className="w-4 h-4 mr-1" />
              {generateOrderMutation.isPending ? "Generating..." : "Generate Order"}
            </Button>
          </div>
        </div>

        {generatedOrder && (
          <Card className="border-primary/30" data-testid="card-generated-order">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <PackageCheck className="w-5 h-5" /> Generated Order — {generatedOrder.orderDate}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Item</th>
                      <th className="text-right p-2 font-medium">On Hand</th>
                      <th className="text-right p-2 font-medium">Par</th>
                      <th className="text-right p-2 font-medium">Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedOrder.lines.map((line: PurchaseOrderLine) => (
                      <tr key={line.id} className="border-t">
                        <td className="p-2">{line.itemName}</td>
                        <td className="p-2 text-right text-muted-foreground">{line.currentOnHand ?? "—"}</td>
                        <td className="p-2 text-right text-muted-foreground">{line.parLevel ?? "—"}</td>
                        <td className="p-2 text-right font-bold">{line.quantity} {line.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setGeneratedOrder(null)}>Dismiss</Button>
                {selectedVendor.phone && (
                  <Button
                    size="sm"
                    onClick={() => sendSmsMutation.mutate(generatedOrder.id)}
                    disabled={sendSmsMutation.isPending}
                    data-testid="button-send-sms"
                  >
                    <Send className="w-4 h-4 mr-1" />
                    {sendSmsMutation.isPending ? "Sending..." : "Text to Rep"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-vendor-items">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Linked Items & Par Levels</CardTitle>
            <Button size="sm" onClick={() => { resetItemForm(); setShowAddItem(true); }} data-testid="button-add-vendor-item">
              <Plus className="w-4 h-4 mr-1" /> Link Item
            </Button>
          </CardHeader>
          <CardContent>
            {!vendorItemsData?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No items linked yet. Add inventory items and set par levels.</p>
            ) : (
              <div className="space-y-2">
                {vendorItemsData.map(vi => {
                  const belowPar = vi.parLevel != null && vi.inventoryItem.onHand < vi.parLevel;
                  return (
                    <div key={vi.id} className={`flex items-center gap-3 p-3 rounded-md border ${belowPar ? "border-destructive/30 bg-destructive/5" : ""}`} data-testid={`vendor-item-${vi.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{vi.inventoryItem.name}</span>
                          {belowPar && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>On hand: {vi.inventoryItem.onHand} {vi.inventoryItem.unit}</span>
                          {vi.parLevel != null && <span>Par: {vi.parLevel}</span>}
                          {vi.orderUpToLevel != null && <span>Order to: {vi.orderUpToLevel}</span>}
                          {vi.vendorDescription && <span>({vi.vendorDescription})</span>}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => openEditItem(vi)} data-testid={`edit-vendor-item-${vi.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteItemMutation.mutate(vi.id)} data-testid={`delete-vendor-item-${vi.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {filteredOrders.length > 0 && (
          <Card data-testid="card-order-history">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Order History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredOrders.slice(0, 10).map(order => (
                  <div key={order.id} className="flex items-center gap-3 p-2 rounded-md border text-sm" data-testid={`order-${order.id}`}>
                    <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1">{order.orderDate}</span>
                    <Badge variant={order.status === "sent" ? "default" : order.status === "received" ? "secondary" : "outline"}>
                      {order.status === "sent" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {order.status === "draft" && <Clock className="w-3 h-3 mr-1" />}
                      {order.status}
                    </Badge>
                    {order.sentVia && <span className="text-xs text-muted-foreground">via {order.sentVia}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={showAddItem} onOpenChange={(open) => { if (!open) resetItemForm(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editItemId ? "Edit Vendor Item" : "Link Inventory Item"}</DialogTitle>
              <DialogDescription>Set par levels to auto-generate orders when stock runs low.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Inventory Item</label>
                <Select value={itemInventoryId} onValueChange={setItemInventoryId} disabled={!!editItemId}>
                  <SelectTrigger data-testid="select-inventory-item">
                    <SelectValue placeholder="Select item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryItemsList?.map(inv => (
                      <SelectItem key={inv.id} value={String(inv.id)}>
                        {inv.name} ({inv.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">Par Level</label>
                  <Input
                    type="number"
                    placeholder="e.g. 10"
                    value={itemParLevel}
                    onChange={e => setItemParLevel(e.target.value)}
                    data-testid="input-par-level"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Reorder when below this</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Order Up To</label>
                  <Input
                    type="number"
                    placeholder="e.g. 20"
                    value={itemOrderUpTo}
                    onChange={e => setItemOrderUpTo(e.target.value)}
                    data-testid="input-order-up-to"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Target stock level</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Vendor Description</label>
                <Input
                  placeholder="How vendor lists this item"
                  value={itemDescription}
                  onChange={e => setItemDescription(e.target.value)}
                  data-testid="input-vendor-description"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Preferred Unit</label>
                <Input
                  placeholder="e.g. case, bag, lb"
                  value={itemUnit}
                  onChange={e => setItemUnit(e.target.value)}
                  data-testid="input-preferred-unit"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={resetItemForm}>Cancel</Button>
              <Button onClick={handleSaveItem} disabled={!itemInventoryId || createItemMutation.isPending || updateItemMutation.isPending} data-testid="button-save-vendor-item">
                {editItemId ? "Save Changes" : "Link Item"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddVendor} onOpenChange={(open) => { if (!open) resetVendorForm(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Vendor</DialogTitle>
              <DialogDescription>Update vendor details and order schedule.</DialogDescription>
            </DialogHeader>
            {renderVendorForm()}
            <DialogFooter>
              <Button variant="ghost" onClick={resetVendorForm}>Cancel</Button>
              <Button onClick={handleSaveVendor} disabled={!vendorName.trim() || updateVendorMutation.isPending} data-testid="button-save-vendor">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  function renderVendorForm() {
    return (
      <div className="space-y-4 py-2">
        <div>
          <label className="text-sm font-medium mb-2 block">Vendor Name</label>
          <Input placeholder="e.g. Chef's Warehouse" value={vendorName} onChange={e => setVendorName(e.target.value)} data-testid="input-vendor-name" />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Sales Rep Name</label>
          <Input placeholder="Contact name" value={contactName} onChange={e => setContactName(e.target.value)} data-testid="input-contact-name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-2 block">Phone</label>
            <Input placeholder="+1 555-1234" value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-vendor-phone" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Email</label>
            <Input placeholder="rep@vendor.com" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-vendor-email" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Order Days</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => (
              <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox checked={orderDays.includes(day)} onCheckedChange={() => toggleDay(day)} data-testid={`checkbox-day-${day}`} />
                {DAY_LABELS[day]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Notes</label>
          <Textarea placeholder="Special instructions, account numbers, etc." value={vendorNotes} onChange={e => setVendorNotes(e.target.value)} data-testid="input-vendor-notes" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" data-testid="container-vendors">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="text-vendors-title">Vendors</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage suppliers, set par levels, and generate orders.</p>
        </div>
        <Button onClick={() => { resetVendorForm(); setShowAddVendor(true); }} data-testid="button-add-vendor">
          <Plus className="w-4 h-4 mr-2" /> Add Vendor
        </Button>
      </div>

      {todayVendors && todayVendors.length > 0 && (
        <Card className="border-primary/30 bg-primary/5" data-testid="card-today-orders">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <span className="font-medium">Today's Orders</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {todayVendors.map(v => (
                <Button key={v.id} variant="outline" size="sm" onClick={() => setSelectedVendorId(v.id)} data-testid={`today-vendor-${v.id}`}>
                  <Truck className="w-3.5 h-3.5 mr-1" /> {v.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <PfgIntegrationCard />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading vendors...</div>
      ) : !allVendors?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No vendors yet. Click "Add Vendor" to add your first supplier.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {allVendors.map(vendor => (
            <Card
              key={vendor.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setSelectedVendorId(vendor.id)}
              data-testid={`vendor-card-${vendor.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-base">{vendor.name}</h3>
                    {vendor.contactName && (
                      <p className="text-sm text-muted-foreground mt-0.5">{vendor.contactName}</p>
                    )}
                  </div>
                  {!vendor.isActive && <Badge variant="outline">Inactive</Badge>}
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                  {vendor.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {vendor.phone}</span>}
                  {vendor.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {vendor.email}</span>}
                </div>
                {vendor.orderDays.length > 0 && (
                  <div className="flex gap-1 mt-3">
                    {DAYS.map(d => (
                      <Badge
                        key={d}
                        variant={vendor.orderDays.includes(d) ? "default" : "outline"}
                        className={`text-[10px] px-1.5 ${vendor.orderDays.includes(d) ? "" : "opacity-20"}`}
                      >
                        {DAY_LABELS[d]}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAddVendor && !editVendor} onOpenChange={(open) => { if (!open) resetVendorForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Vendor</DialogTitle>
            <DialogDescription>Add a new supplier with contact info and order schedule.</DialogDescription>
          </DialogHeader>
          {renderVendorForm()}
          <DialogFooter>
            <Button variant="ghost" onClick={resetVendorForm}>Cancel</Button>
            <Button onClick={handleSaveVendor} disabled={!vendorName.trim() || createVendorMutation.isPending} data-testid="button-save-vendor">
              {createVendorMutation.isPending ? "Adding..." : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
