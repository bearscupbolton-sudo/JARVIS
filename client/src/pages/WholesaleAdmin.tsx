import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Store, Plus, Package, Users, ClipboardList, Loader2, Clock, CheckCircle2, AlertCircle, Edit2, Copy } from "lucide-react";

type WholesaleCustomer = {
  id: number;
  businessName: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  onboardingComplete: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  certificateOfAuthority: string | null;
  st120FilePath: string | null;
  st120IsBlanket: boolean;
  createdAt: string;
};

type CatalogItem = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  unitPrice: number;
  unit: string;
  isActive: boolean;
  sortOrder: number;
};

type OrderItem = {
  itemName: string;
  quantity: number;
  subtotal: number;
};

type Order = {
  id: number;
  customerId: number;
  orderDate: string;
  status: string;
  totalAmount: number;
  notes: string | null;
  customer?: WholesaleCustomer;
  items?: OrderItem[];
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending Payment", variant: "default" },
  confirmed: { label: "Confirmed", variant: "secondary" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

export default function WholesaleAdmin() {
  const [tab, setTab] = useState("orders");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<WholesaleCustomer | null>(null);
  const [editingCatalog, setEditingCatalog] = useState<CatalogItem | null>(null);
  const { toast } = useToast();

  const [custForm, setCustForm] = useState({ businessName: "", contactName: "", phone: "", email: "", pin: "", notes: "", address: "", city: "", state: "", zip: "" });
  const [catForm, setCatForm] = useState({ name: "", description: "", category: "", unitPrice: "", unit: "each", sortOrder: "0" });

  const customersQuery = useQuery<WholesaleCustomer[]>({ queryKey: ["/api/wholesale/admin/customers"] });
  const catalogQuery = useQuery<CatalogItem[]>({ queryKey: ["/api/wholesale/admin/catalog"] });
  const ordersQuery = useQuery<Order[]>({ queryKey: ["/api/wholesale/admin/orders"] });

  const customerMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingCustomer) {
        const res = await apiRequest("PATCH", `/api/wholesale/admin/customers/${editingCustomer.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/wholesale/admin/customers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/admin/customers"] });
      setCustomerDialogOpen(false);
      toast({ title: editingCustomer ? "Customer updated" : "Customer created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const catalogMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingCatalog) {
        const res = await apiRequest("PATCH", `/api/wholesale/admin/catalog/${editingCatalog.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/wholesale/admin/catalog", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/admin/catalog"] });
      setCatalogDialogOpen(false);
      toast({ title: editingCatalog ? "Item updated" : "Item added" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/wholesale/admin/orders/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/admin/orders"] });
      toast({ title: "Order status updated" });
    },
  });

  function openNewCustomer() {
    setEditingCustomer(null);
    setCustForm({ businessName: "", contactName: "", phone: "", email: "", pin: "", notes: "", address: "", city: "", state: "", zip: "" });
    setCustomerDialogOpen(true);
  }

  function openEditCustomer(c: WholesaleCustomer) {
    setEditingCustomer(c);
    setCustForm({
      businessName: c.businessName, contactName: c.contactName,
      phone: c.phone || "", email: c.email || "", pin: "", notes: c.notes || "",
      address: c.address || "", city: c.city || "", state: c.state || "", zip: c.zip || "",
    });
    setCustomerDialogOpen(true);
  }

  function saveCustomer() {
    if (!editingCustomer && !custForm.pin) {
      toast({ title: "PIN is required for new customers", variant: "destructive" });
      return;
    }
    const data: any = {};
    if (editingCustomer) {
      data.businessName = custForm.businessName;
      data.contactName = custForm.contactName;
      if (custForm.phone) data.phone = custForm.phone;
      if (custForm.email) data.email = custForm.email;
      if (custForm.address) data.address = custForm.address;
      if (custForm.city) data.city = custForm.city;
      if (custForm.state) data.state = custForm.state;
      if (custForm.zip) data.zip = custForm.zip;
    }
    if (custForm.notes) data.notes = custForm.notes;
    if (custForm.pin) data.pin = custForm.pin;
    customerMutation.mutate(data);
  }

  function openNewCatalog() {
    setEditingCatalog(null);
    setCatForm({ name: "", description: "", category: "", unitPrice: "", unit: "each", sortOrder: "0" });
    setCatalogDialogOpen(true);
  }

  function openEditCatalog(item: CatalogItem) {
    setEditingCatalog(item);
    setCatForm({
      name: item.name, description: item.description || "", category: item.category || "",
      unitPrice: String(item.unitPrice), unit: item.unit, sortOrder: String(item.sortOrder),
    });
    setCatalogDialogOpen(true);
  }

  function saveCatalog() {
    if (!catForm.name || !catForm.unitPrice) {
      toast({ title: "Name and price required", variant: "destructive" });
      return;
    }
    catalogMutation.mutate({
      name: catForm.name, description: catForm.description || null, category: catForm.category || null,
      unitPrice: catForm.unitPrice, unit: catForm.unit, sortOrder: parseInt(catForm.sortOrder) || 0,
    });
  }

  const pendingOrders = ordersQuery.data?.filter(o => o.status === "pending") || [];
  const confirmedOrders = ordersQuery.data?.filter(o => o.status === "confirmed") || [];
  const completedOrders = ordersQuery.data?.filter(o => o.status === "completed" || o.status === "cancelled") || [];

  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/wholesale/login` : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-title">
            <Store className="inline h-6 w-6 mr-2" />
            Wholesale Management
          </h1>
          <p className="text-sm text-muted-foreground">Manage wholesale customers, catalog, and orders</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(portalUrl); toast({ title: "Portal link copied!" }); }} data-testid="button-copy-portal-link">
          <Copy className="h-3 w-3 mr-1" /> Copy Portal Link
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="orders" className="flex items-center gap-1" data-testid="tab-orders">
            <ClipboardList className="h-4 w-4" />
            Orders {pendingOrders.length > 0 && <Badge variant="default" className="ml-1 h-5 px-1.5">{pendingOrders.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="catalog" className="flex items-center gap-1" data-testid="tab-catalog">
            <Package className="h-4 w-4" />
            Catalog
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-1" data-testid="tab-customers">
            <Users className="h-4 w-4" />
            Customers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4 mt-4">
          {ordersQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <>
              {pendingOrders.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Clock className="h-4 w-4" /> Pending Payment ({pendingOrders.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingOrders.map(order => (
                      <OrderCard key={order.id} order={order} onStatusChange={(status) => statusMutation.mutate({ id: order.id, status })} />
                    ))}
                  </div>
                </div>
              )}
              {confirmedOrders.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Package className="h-4 w-4" /> Confirmed ({confirmedOrders.length})
                  </h3>
                  <div className="space-y-3">
                    {confirmedOrders.map(order => (
                      <OrderCard key={order.id} order={order} onStatusChange={(status) => statusMutation.mutate({ id: order.id, status })} />
                    ))}
                  </div>
                </div>
              )}
              {completedOrders.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">
                    Past Orders ({completedOrders.length})
                  </h3>
                  <div className="space-y-3">
                    {completedOrders.map(order => (
                      <OrderCard key={order.id} order={order} onStatusChange={(status) => statusMutation.mutate({ id: order.id, status })} />
                    ))}
                  </div>
                </div>
              )}
              {(!ordersQuery.data || ordersQuery.data.length === 0) && (
                <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-admin-orders">No wholesale orders yet</CardContent></Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="catalog" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={openNewCatalog} data-testid="button-add-catalog-item">
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          </div>
          {catalogQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !catalogQuery.data || catalogQuery.data.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-catalog-items">No catalog items yet. Add items for your wholesale customers to order.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {catalogQuery.data.map(item => (
                <Card key={item.id} className={!item.isActive ? "opacity-50" : ""} data-testid={`card-catalog-${item.id}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.category && <Badge variant="outline" className="text-xs">{item.category}</Badge>}
                        {!item.isActive && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                      </div>
                      {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-semibold">${item.unitPrice.toFixed(2)} / {item.unit}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCatalog(item)} data-testid={`button-edit-catalog-${item.id}`}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="customers" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={openNewCustomer} data-testid="button-add-customer">
              <Plus className="h-4 w-4 mr-1" /> Add Customer
            </Button>
          </div>
          {customersQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !customersQuery.data || customersQuery.data.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-customers">No wholesale customers yet</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {customersQuery.data.map(c => (
                <Card key={c.id} className={!c.isActive ? "opacity-50" : ""} data-testid={`card-customer-${c.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{c.businessName}</p>
                        <p className="text-xs text-muted-foreground">{c.contactName}{c.phone ? ` • ${c.phone}` : ""}{c.email ? ` • ${c.email}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.onboardingComplete ? (
                          <Badge variant="secondary" className="gap-1" data-testid={`badge-onboarded-${c.id}`}>
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-400" data-testid={`badge-pending-${c.id}`}>
                            <AlertCircle className="h-3 w-3" /> Setup Pending
                          </Badge>
                        )}
                        {!c.isActive && <Badge variant="destructive">Inactive</Badge>}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCustomer(c)} data-testid={`button-edit-customer-${c.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {c.onboardingComplete && (c.certificateOfAuthority || c.address) && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-0.5">
                        {c.certificateOfAuthority && (
                          <p>Cert of Authority: <span className="font-mono">{c.certificateOfAuthority}</span>{c.st120IsBlanket ? " (Blanket)" : ""}{c.st120FilePath ? " • ST-120 on file" : ""}</p>
                        )}
                        {c.address && (
                          <p>{c.address}{c.city ? `, ${c.city}` : ""}{c.state ? `, ${c.state}` : ""}{c.zip ? ` ${c.zip}` : ""}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Wholesale Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editingCustomer && (
              <p className="text-sm text-muted-foreground">
                Create a PIN for the new customer. They'll complete their profile (business info, tax docs) when they first log in.
              </p>
            )}
            {editingCustomer && (
              <>
                <div>
                  <label className="text-sm font-medium">Business Name</label>
                  <Input value={custForm.businessName} onChange={(e) => setCustForm(p => ({ ...p, businessName: e.target.value }))} data-testid="input-cust-business" />
                </div>
                <div>
                  <label className="text-sm font-medium">Contact Name</label>
                  <Input value={custForm.contactName} onChange={(e) => setCustForm(p => ({ ...p, contactName: e.target.value }))} data-testid="input-cust-contact" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Phone</label>
                    <Input value={custForm.phone} onChange={(e) => setCustForm(p => ({ ...p, phone: e.target.value }))} data-testid="input-cust-phone" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input value={custForm.email} onChange={(e) => setCustForm(p => ({ ...p, email: e.target.value }))} data-testid="input-cust-email" />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium">{editingCustomer ? "New PIN (leave blank to keep)" : "PIN *"}</label>
              <Input type="password" value={custForm.pin} onChange={(e) => setCustForm(p => ({ ...p, pin: e.target.value }))} placeholder="4+ digit PIN" data-testid="input-cust-pin" />
            </div>
            <div>
              <label className="text-sm font-medium">Internal Notes</label>
              <Textarea value={custForm.notes} onChange={(e) => setCustForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Internal notes (not visible to customer)" data-testid="input-cust-notes" />
            </div>
            <Button onClick={saveCustomer} disabled={customerMutation.isPending || (!editingCustomer && !custForm.pin)} className="w-full" data-testid="button-save-customer">
              {customerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingCustomer ? "Update Customer" : "Create Customer")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCatalog ? "Edit Catalog Item" : "Add Catalog Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input value={catForm.name} onChange={(e) => setCatForm(p => ({ ...p, name: e.target.value }))} data-testid="input-cat-name" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input value={catForm.description} onChange={(e) => setCatForm(p => ({ ...p, description: e.target.value }))} data-testid="input-cat-description" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">Price *</label>
                <Input type="number" step="0.01" value={catForm.unitPrice} onChange={(e) => setCatForm(p => ({ ...p, unitPrice: e.target.value }))} data-testid="input-cat-price" />
              </div>
              <div>
                <label className="text-sm font-medium">Unit</label>
                <Select value={catForm.unit} onValueChange={(v) => setCatForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger data-testid="select-cat-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="each">Each</SelectItem>
                    <SelectItem value="dozen">Dozen</SelectItem>
                    <SelectItem value="half dozen">Half Dozen</SelectItem>
                    <SelectItem value="case">Case</SelectItem>
                    <SelectItem value="lb">Pound</SelectItem>
                    <SelectItem value="tray">Tray</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <Input value={catForm.category} onChange={(e) => setCatForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Pastries" data-testid="input-cat-category" />
              </div>
            </div>
            <Button onClick={saveCatalog} disabled={catalogMutation.isPending || !catForm.name || !catForm.unitPrice} className="w-full" data-testid="button-save-catalog">
              {catalogMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingCatalog ? "Update Item" : "Add Item")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderCard({ order, onStatusChange }: { order: Order; onStatusChange: (status: string) => void }) {
  const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  return (
    <Card data-testid={`card-admin-order-${order.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <p className="font-semibold">Order #{order.id} — {order.customer?.businessName || "Unknown"}</p>
            <p className="text-xs text-muted-foreground">Delivery: {formatDate(order.orderDate)}</p>
          </div>
          <Badge variant={sc.variant}>{sc.label}</Badge>
        </div>
        {order.items && order.items.length > 0 && (
          <div className="space-y-0.5 text-sm mb-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.itemName} × {item.quantity}</span>
                <span className="text-muted-foreground">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <span className="font-bold text-lg">${order.totalAmount?.toFixed(2)}</span>
          <div className="flex gap-2">
            {order.status === "pending" && (
              <>
                <Button size="sm" variant="outline" onClick={() => onStatusChange("confirmed")} data-testid={`button-confirm-${order.id}`}>Confirm</Button>
                <Button size="sm" onClick={() => onStatusChange("completed")} data-testid={`button-paid-${order.id}`}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
                </Button>
              </>
            )}
            {order.status === "confirmed" && (
              <Button size="sm" onClick={() => onStatusChange("completed")} data-testid={`button-complete-${order.id}`}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
              </Button>
            )}
            {(order.status === "pending" || order.status === "confirmed") && (
              <Button size="sm" variant="destructive" onClick={() => onStatusChange("cancelled")} data-testid={`button-cancel-${order.id}`}>Cancel</Button>
            )}
          </div>
        </div>
        {order.notes && <p className="text-xs text-muted-foreground mt-2 italic">Notes: {order.notes}</p>}
      </CardContent>
    </Card>
  );
}
