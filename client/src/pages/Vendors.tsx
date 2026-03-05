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
