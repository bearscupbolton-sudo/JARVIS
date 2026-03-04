import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPastryPassportSchema, type PastryPassport, type PastryItem, type Recipe, type InsertPastryPassport } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Stamp, Plus, Search, ArrowRight, ChefHat, Image, AlertTriangle, Zap } from "lucide-react";
import { LazyImage } from "@/components/ui/lazy-image";

const PASSPORT_CATEGORIES = [
  "Bread",
  "Viennoiserie",
  "Component",
  "Gluten Free",
  "Cookies",
  "Muffin/Cake",
  "Mother",
] as const;

const DOUGH_TYPE_TO_CATEGORY: Record<string, string> = {
  "Croissant": "Viennoiserie",
  "Danish": "Viennoiserie",
  "Cookies": "Cookies",
  "Cake": "Muffin/Cake",
  "Bread": "Bread",
};

function BulkCreateDialog({ unlinkedItems }: { unlinkedItems: PastryItem[] }) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(unlinkedItems.map(i => i.id)));
  const { toast } = useToast();

  const { data: recipes } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
    enabled: open,
  });

  const motherRecipes = recipes?.filter(r => r.category === "Mother") || [];

  const toggleItem = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === unlinkedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unlinkedItems.map(i => i.id)));
    }
  };

  const getInferredCategory = (doughType: string) => {
    return DOUGH_TYPE_TO_CATEGORY[doughType] || "Bread";
  };

  const getMotherRecipeMatch = (doughType: string) => {
    const doughTypeLower = doughType.toLowerCase();
    return motherRecipes.find(r =>
      r.title.toLowerCase().includes(doughTypeLower) ||
      doughTypeLower.includes(r.title.toLowerCase().replace(" dough", "").replace(" mother", ""))
    );
  };

  const mutation = useMutation({
    mutationFn: async (pastryItemIds: number[]) => {
      const res = await apiRequest("POST", "/api/pastry-passports/bulk-create", { pastryItemIds });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-passports"] });
      setOpen(false);
      const createdCount = data.created?.length || 0;
      const skippedCount = data.skipped?.length || 0;
      toast({
        title: `${createdCount} passport${createdCount !== 1 ? "s" : ""} created`,
        description: skippedCount > 0 ? `${skippedCount} skipped (already linked)` : "You can now add components and details to each passport.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk create failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-bulk-create-passports">
          <Zap className="w-4 h-4 mr-2" /> Create Missing Passports
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Missing Passports</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select which pastry items should get auto-generated passports. Category and mother dough will be inferred automatically.
        </p>
        <div className="space-y-1 mt-4">
          <div className="flex items-center gap-3 pb-2 border-b border-border">
            <Checkbox
              checked={selectedIds.size === unlinkedItems.length}
              onCheckedChange={toggleAll}
              data-testid="checkbox-select-all"
            />
            <span className="text-sm font-medium">Select All ({unlinkedItems.length})</span>
          </div>
          {unlinkedItems.map((item) => {
            const category = getInferredCategory(item.doughType);
            const motherMatch = getMotherRecipeMatch(item.doughType);
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 py-2 border-b border-border last:border-0"
                data-testid={`bulk-item-${item.id}`}
              >
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggleItem(item.id)}
                  className="mt-0.5"
                  data-testid={`checkbox-item-${item.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" data-testid={`text-item-name-${item.id}`}>{item.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{item.doughType}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">Category: {category}</span>
                    {motherMatch && (
                      <span className="text-xs text-muted-foreground">
                        | Mother: {motherMatch.title}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-bulk">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate(Array.from(selectedIds))}
            disabled={selectedIds.size === 0 || mutation.isPending}
            data-testid="button-confirm-bulk-create"
          >
            {mutation.isPending ? "Creating..." : `Create ${selectedIds.size} Passport${selectedIds.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreatePassportDialog({ preselectedItemId }: { preselectedItemId?: number }) {
  const [open, setOpen] = useState(!!preselectedItemId);
  const { toast } = useToast();

  const { data: recipes } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
  });

  const { data: pastryItems } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items"],
  });

  const { data: existingPassports } = useQuery<PastryPassport[]>({
    queryKey: ["/api/pastry-passports"],
  });

  const linkedItemIds = new Set(existingPassports?.filter(p => p.pastryItemId).map(p => p.pastryItemId) || []);

  const preselectedItem = preselectedItemId ? pastryItems?.find(i => i.id === preselectedItemId) : undefined;

  const form = useForm<InsertPastryPassport>({
    resolver: zodResolver(insertPastryPassportSchema),
    defaultValues: {
      name: preselectedItem?.name || "",
      category: preselectedItem ? (DOUGH_TYPE_TO_CATEGORY[preselectedItem.doughType] || "") : "",
      descriptionText: "",
      photoUrl: "",
      primaryRecipeId: undefined,
      motherRecipeId: undefined,
      pastryItemId: preselectedItemId || undefined,
      assemblyText: "",
      bakingText: "",
      finishText: "",
    },
  });

  const watchCategory = form.watch("category");

  const motherRecipes = recipes?.filter((r) => r.category === "Mother") || [];

  const handlePastryItemSelect = (val: string) => {
    if (val === "none") {
      form.setValue("pastryItemId", undefined as any);
      return;
    }
    const itemId = Number(val);
    const item = pastryItems?.find(i => i.id === itemId);
    if (item) {
      form.setValue("pastryItemId", item.id);
      form.setValue("name", item.name);
      const mappedCategory = DOUGH_TYPE_TO_CATEGORY[item.doughType];
      if (mappedCategory) {
        form.setValue("category", mappedCategory);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: InsertPastryPassport) => {
      const res = await apiRequest("POST", "/api/pastry-passports", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-passports"] });
      setOpen(false);
      form.reset();
      toast({ title: "Passport created", description: "Your pastry passport has been added." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create passport", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: InsertPastryPassport) => {
    const cleaned = {
      ...data,
      primaryRecipeId: data.primaryRecipeId || null,
      motherRecipeId: data.motherRecipeId || null,
      pastryItemId: data.pastryItemId || null,
      photoUrl: data.photoUrl || null,
      assemblyText: data.assemblyText || null,
      bakingText: data.bakingText || null,
      finishText: data.finishText || null,
      descriptionText: data.descriptionText || null,
    };
    mutation.mutate(cleaned);
  };

  const availableItems = pastryItems?.filter(i => i.isActive && !linkedItemIds.has(i.id)) || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/20" data-testid="button-new-passport">
          <Plus className="w-4 h-4 mr-2" /> New Passport
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Pastry Passport</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="pastryItemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link to Master Pastry List (optional)</FormLabel>
                  <Select
                    onValueChange={handlePastryItemSelect}
                    value={field.value ? String(field.value) : ""}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-passport-pastry-item">
                        <SelectValue placeholder="Select from master list..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None (manual entry)</SelectItem>
                      {availableItems.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)} data-testid={`select-pastry-item-${item.id}`}>
                          {item.name} ({item.doughType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Pain au Chocolat" data-testid="input-passport-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-passport-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PASSPORT_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat} data-testid={`select-passport-category-${cat.toLowerCase().replace(/\//g, "-")}`}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchCategory === "Viennoiserie" && motherRecipes.length > 0 && (
              <FormField
                control={form.control}
                name="motherRecipeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mother Dough</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val ? Number(val) : undefined)}
                      value={field.value ? String(field.value) : ""}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-passport-mother-recipe">
                          <SelectValue placeholder="Select mother dough" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {motherRecipes.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)} data-testid={`select-mother-recipe-${r.id}`}>
                            {r.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="primaryRecipeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Recipe (optional)</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(val ? Number(val) : undefined)}
                    value={field.value ? String(field.value) : ""}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-passport-primary-recipe">
                        <SelectValue placeholder="Link a recipe" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {recipes?.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)} data-testid={`select-primary-recipe-${r.id}`}>
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descriptionText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ""}
                      placeholder="Brief description of this pastry..."
                      data-testid="input-passport-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-passport">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-passport">
                {mutation.isPending ? "Creating..." : "Create Passport"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function PastryPassports() {
  const { data: passports, isLoading } = useQuery<PastryPassport[]>({
    queryKey: ["/api/pastry-passports"],
  });

  const { data: pastryItems } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items"],
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const urlParams = new URLSearchParams(window.location.search);
  const createForItemId = urlParams.get("createFor") ? Number(urlParams.get("createFor")) : undefined;

  const categories = ["All", ...PASSPORT_CATEGORIES];

  const linkedItemIds = new Set(passports?.filter(p => p.pastryItemId).map(p => p.pastryItemId) || []);
  const unlinkedItems = pastryItems?.filter(i => i.isActive && !linkedItemIds.has(i.id)) || [];

  const filteredPassports = passports?.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "All" || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-page-title">Pastry Passports</h1>
          <p className="text-muted-foreground" data-testid="text-page-subtitle">Every pastry tells a story. Here are their travel documents.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {unlinkedItems.length > 0 && <BulkCreateDialog unlinkedItems={unlinkedItems} />}
          <CreatePassportDialog preselectedItemId={createForItemId} />
        </div>
      </div>

      {unlinkedItems.length > 0 && (
        <Alert data-testid="alert-missing-passports">
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>{unlinkedItems.length} pastry item{unlinkedItems.length !== 1 ? "s have" : " has"} no passport</AlertTitle>
          <AlertDescription>
            COGS can't be calculated for items without passports. Use "Create Missing Passports" to auto-generate them.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-md border border-border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search passports..."
            className="pl-9 bg-background"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-passports"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 flex-wrap justify-start">
          <Stamp className="w-4 h-4 text-muted-foreground shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`filter-category-${cat.toLowerCase().replace(/\//g, "-")}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array(6)
            .fill(0)
            .map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-md" />)
        ) : filteredPassports?.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground" data-testid="text-no-passports">
            No pastry passports found matching your criteria.
          </div>
        ) : (
          filteredPassports?.map((passport) => (
            <Link key={passport.id} href={`/pastry-passports/${passport.id}`}>
              <Card
                className="h-full cursor-pointer group border-t-2 border-t-primary border-dashed overflow-visible hover-elevate"
                data-testid={`card-passport-${passport.id}`}
              >
                <CardContent className="p-0 flex flex-col h-full">
                  <div className="flex gap-4 p-4">
                    <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {passport.photoUrl ? (
                        <LazyImage
                          src={passport.thumbnailUrl || passport.photoUrl}
                          alt={passport.name}
                          className="w-full h-full"
                          data-testid={`img-passport-${passport.id}`}
                        />
                      ) : (
                        <Image className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <h3 className="text-lg font-bold truncate" data-testid={`text-passport-name-${passport.id}`}>
                          {passport.name}
                        </h3>
                        <Badge variant="secondary" className="shrink-0 font-mono text-[10px] uppercase tracking-wider" data-testid={`badge-passport-category-${passport.id}`}>
                          <Stamp className="w-3 h-3 mr-1" />
                          {passport.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1" data-testid={`text-passport-desc-${passport.id}`}>
                        {passport.descriptionText || "No description yet."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border mt-auto">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                      <ChefHat className="w-3 h-3" />
                      PP-{String(passport.id).padStart(4, "0")}
                    </div>
                    <div className="flex items-center text-primary font-medium text-sm invisible group-hover:visible transition-opacity">
                      View Details <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
