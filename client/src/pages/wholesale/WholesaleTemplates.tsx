import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CalendarClock, Plus, Minus, Loader2, Trash2, Save, Edit2 } from "lucide-react";

type CatalogItem = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  unitPrice: number;
  unit: string;
};

type TemplateItem = {
  catalogItemId: number;
  quantity: number;
  catalogItem?: CatalogItem;
};

type Template = {
  id: number;
  dayOfWeek: number;
  templateName: string | null;
  isActive: boolean;
  items: TemplateItem[];
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function WholesaleTemplates() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [selectedDay, setSelectedDay] = useState("1");
  const [templateName, setTemplateName] = useState("");
  const [templateItems, setTemplateItems] = useState<{ catalogItemId: number; quantity: number }[]>([]);
  const { toast } = useToast();

  const catalogQuery = useQuery<CatalogItem[]>({
    queryKey: ["/api/wholesale/catalog"],
  });

  const templatesQuery = useQuery<Template[]>({
    queryKey: ["/api/wholesale/templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/wholesale/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/templates"] });
      closeDialog();
      toast({ title: "Template created" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create template", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/wholesale/templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/templates"] });
      closeDialog();
      toast({ title: "Template updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update template", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/wholesale/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/templates"] });
      toast({ title: "Template deleted" });
    },
  });

  function openNewDialog() {
    setEditingTemplate(null);
    setSelectedDay("1");
    setTemplateName("");
    setTemplateItems([]);
    setDialogOpen(true);
  }

  function openEditDialog(template: Template) {
    setEditingTemplate(template);
    setSelectedDay(String(template.dayOfWeek));
    setTemplateName(template.templateName || "");
    setTemplateItems(template.items.map(i => ({ catalogItemId: i.catalogItemId, quantity: i.quantity })));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingTemplate(null);
  }

  function addItem(catalogItemId: number) {
    if (templateItems.find(i => i.catalogItemId === catalogItemId)) return;
    setTemplateItems(prev => [...prev, { catalogItemId, quantity: 1 }]);
  }

  function updateItemQty(catalogItemId: number, qty: number) {
    if (qty <= 0) {
      setTemplateItems(prev => prev.filter(i => i.catalogItemId !== catalogItemId));
    } else {
      setTemplateItems(prev => prev.map(i => i.catalogItemId === catalogItemId ? { ...i, quantity: qty } : i));
    }
  }

  function handleSave() {
    if (templateItems.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }
    const data = {
      dayOfWeek: parseInt(selectedDay),
      templateName: templateName || null,
      items: templateItems,
    };
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight" data-testid="text-templates-title">Recurring Orders</h1>
          <p className="text-sm text-muted-foreground">Set up different orders for different days of the week</p>
        </div>
        <Button onClick={openNewDialog} data-testid="button-new-template">
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {templatesQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !templatesQuery.data || templatesQuery.data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarClock className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground mb-3" data-testid="text-no-templates">No recurring order templates yet</p>
            <Button onClick={openNewDialog} data-testid="button-create-first-template">
              <Plus className="h-4 w-4 mr-1" /> Create Your First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templatesQuery.data.map(template => {
            const itemTotal = template.items.reduce((sum, i) => {
              const ci = i.catalogItem;
              return sum + (ci ? ci.unitPrice * i.quantity : 0);
            }, 0);
            return (
              <Card key={template.id} data-testid={`card-template-${template.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {template.templateName || DAY_NAMES[template.dayOfWeek] + " Order"}
                    </CardTitle>
                    <Badge variant="secondary">{DAY_NAMES[template.dayOfWeek]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    {template.items.map(item => (
                      <div key={item.catalogItemId} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{item.catalogItem?.name || `Item #${item.catalogItemId}`}</span>
                        <span>x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  {itemTotal > 0 && (
                    <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                      <span>Estimated Total</span>
                      <span>${itemTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(template)} data-testid={`button-edit-template-${template.id}`}>
                      <Edit2 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(template.id)} data-testid={`button-delete-template-${template.id}`}>
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Recurring Order Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Day of Week</label>
                <Select value={selectedDay} onValueChange={setSelectedDay}>
                  <SelectTrigger data-testid="select-template-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((day, i) => (
                      <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Template Name</label>
                <Input
                  placeholder="e.g. Weekly Pastries"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  data-testid="input-template-name"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Items</label>
              {templateItems.length > 0 && (
                <div className="space-y-2 mb-3">
                  {templateItems.map(ti => {
                    const ci = catalogQuery.data?.find(c => c.id === ti.catalogItemId);
                    return (
                      <div key={ti.catalogItemId} className="flex items-center justify-between gap-2 p-2 rounded border">
                        <span className="text-sm font-medium">{ci?.name || `#${ti.catalogItemId}`}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItemQty(ti.catalogItemId, ti.quantity - 1)} data-testid={`button-template-decrease-${ti.catalogItemId}`}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            value={ti.quantity}
                            onChange={(e) => updateItemQty(ti.catalogItemId, parseInt(e.target.value) || 0)}
                            className="w-14 h-7 text-center text-sm"
                            min={1}
                          />
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItemQty(ti.catalogItemId, ti.quantity + 1)} data-testid={`button-template-increase-${ti.catalogItemId}`}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-1 border rounded p-2 max-h-48 overflow-y-auto">
                {catalogQuery.data?.filter(c => !templateItems.find(ti => ti.catalogItemId === c.id)).map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-accent cursor-pointer" onClick={() => addItem(item.id)} data-testid={`button-template-add-${item.id}`}>
                    <span className="text-sm">{item.name}</span>
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={isSaving || templateItems.length === 0} className="w-full" data-testid="button-save-template">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  {editingTemplate ? "Update Template" : "Create Template"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
