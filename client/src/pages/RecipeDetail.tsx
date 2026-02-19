import { useState, useRef, useEffect } from "react";
import { useRecipe, useDeleteRecipe, useUpdateRecipe } from "@/hooks/use-recipes";
import { useAuth } from "@/hooks/use-auth";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RecipeScaler } from "@/components/RecipeScaler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2, Edit2, Printer, Wheat, Plus, History, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { type Ingredient, type Instruction, type RecipeVersion } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";

const FLOUR_KEYWORDS = [
  "flour", "galahad", "gallahad", "sir galahad", "lancelot", "sir lancelot",
  "round table", "t55", "t65", "t80", "t110", "t150",
  "bread flour", "whole wheat", "all purpose", "all-purpose", "ap flour",
  "pastry flour", "cake flour", "patent flour", "special patent",
  "king arthur", "ka bread", "ka ap", "semolina", "durum",
  "rye flour", "spelt flour", "einkorn",
];

const RECIPE_CATEGORIES = [
  "Bread", "Viennoiserie", "Component", "Gluten Free",
  "Cookies", "Muffin/Cake", "Mother",
];

function isFlourIngredient(name: string): boolean {
  const lower = name.toLowerCase();
  return FLOUR_KEYWORDS.some(kw => lower.includes(kw));
}

function computeBakersPercentages(ingredients: Ingredient[]): (Ingredient & { computedBP: number | null; isFlour: boolean })[] {
  const flourIngredients = ingredients.filter(ing => isFlourIngredient(ing.name));
  const totalFlour = flourIngredients.reduce((sum, ing) => sum + ing.quantity, 0);

  if (totalFlour === 0) {
    return ingredients.map(ing => ({
      ...ing,
      computedBP: ing.bakersPercentage ?? null,
      isFlour: false,
    }));
  }

  return ingredients.map(ing => {
    const flour = isFlourIngredient(ing.name);
    return {
      ...ing,
      computedBP: ing.bakersPercentage ?? Math.round((ing.quantity / totalFlour) * 10000) / 100,
      isFlour: flour,
    };
  });
}

export default function RecipeDetail() {
  const [match, params] = useRoute("/recipes/:id");
  const id = parseInt(params?.id || "0");
  const { data: recipe, isLoading } = useRecipe(id);
  const { mutate: deleteRecipe } = useDeleteRecipe();
  const { mutate: updateRecipe, isPending: isUpdating } = useUpdateRecipe();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const printRef = useRef<HTMLDivElement>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);

  const { data: versions = [] } = useQuery<RecipeVersion[]>({
    queryKey: ["/api/recipes", id, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/recipes/${id}/versions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch versions");
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) return <RecipeDetailSkeleton />;
  if (!recipe) return <div className="p-8 text-center">Recipe not found</div>;

  const baseIngredients = (recipe.ingredients as Ingredient[]) || [];
  const instructions = (recipe.instructions as Instruction[]) || [];
  const ingredientsWithBP = computeBakersPercentages(baseIngredients);
  const isOwner = user?.role === "owner";
  const canEdit = !user?.locked;

  const handleDelete = () => {
    deleteRecipe(id, {
      onSuccess: () => setLocation("/recipes")
    });
  };

  const toggleIngredient = (idx: number) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${recipe.title} - Bear's Cup Bakehouse</title>
        <style>
          @page { margin: 0.75in; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; line-height: 1.5; padding: 0; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 16px; margin-bottom: 24px; }
          .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
          .header .subtitle { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 2px; }
          .header .meta { font-size: 14px; color: #555; margin-top: 8px; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 14px; }
          th { text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; padding: 6px 8px; border-bottom: 2px solid #999; }
          th.right { text-align: right; }
          td { padding: 7px 8px; border-bottom: 1px solid #e5e5e5; }
          td.right { text-align: right; font-variant-numeric: tabular-nums; }
          td.check { width: 28px; text-align: center; }
          .checkbox { width: 14px; height: 14px; border: 1.5px solid #555; border-radius: 2px; display: inline-block; }
          tr:nth-child(even) { background: #f8f8f8; }
          .flour-row { background: #f0f4ff !important; }
          .flour-label { font-size: 10px; color: #666; font-style: italic; }
          .step { display: flex; gap: 12px; margin-bottom: 14px; }
          .step-num { min-width: 28px; height: 28px; background: #333; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
          .step-text { font-size: 14px; padding-top: 4px; }
          .notes-box { border: 1px solid #ccc; border-radius: 4px; padding: 12px; min-height: 80px; }
          .notes-label { font-size: 12px; color: #888; margin-bottom: 4px; }
          .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; text-align: center; font-size: 11px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="subtitle">Bear's Cup Bakehouse</div>
          <h1>${recipe.title}</h1>
          <div class="meta">${recipe.category} &bull; Yield: ${recipe.yieldAmount} ${recipe.yieldUnit}</div>
        </div>

        <div class="section">
          <div class="section-title">Ingredients</div>
          <table>
            <thead>
              <tr>
                <th style="width:28px"></th>
                <th>Ingredient</th>
                <th class="right">Quantity</th>
                <th class="right">Unit</th>
                <th class="right">Baker's %</th>
              </tr>
            </thead>
            <tbody>
              ${ingredientsWithBP.map(ing => `
                <tr class="${ing.isFlour ? 'flour-row' : ''}">
                  <td class="check"><span class="checkbox"></span></td>
                  <td>${ing.name}${ing.isFlour ? ' <span class="flour-label">(flour)</span>' : ''}</td>
                  <td class="right">${ing.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td class="right">${ing.unit}</td>
                  <td class="right">${ing.computedBP !== null ? ing.computedBP + '%' : '\u2014'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${instructions.length > 0 ? `
        <div class="section">
          <div class="section-title">Method</div>
          ${instructions.sort((a, b) => a.step - b.step).map(inst => `
            <div class="step">
              <div class="step-num">${inst.step}</div>
              <div class="step-text">${inst.text}</div>
            </div>
          `).join('')}
        </div>
        ` : ''}

        <div class="section">
          <div class="section-title">Production Notes</div>
          <div class="notes-box">
            <div class="notes-label">Date: ____________&nbsp;&nbsp;&nbsp;&nbsp;Baker: ____________&nbsp;&nbsp;&nbsp;&nbsp;Yield: ____________</div>
          </div>
        </div>

        <div class="footer">Jarvis by Bear's Cup Bakehouse</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/recipes">
          <Button variant="ghost" className="gap-2 pl-0 hover:pl-2 transition-all" data-testid="button-back-recipes">
            <ArrowLeft className="w-4 h-4" /> Back to Recipes
          </Button>
        </Link>
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" className="gap-2" onClick={handlePrint} data-testid="button-print-recipe">
            <Printer className="w-4 h-4" /> Print / Export
          </Button>
          {canEdit && (
            <Button variant="outline" className="gap-2" onClick={() => setShowEdit(true)} data-testid="button-edit-recipe">
              <Edit2 className="w-4 h-4" /> Edit
            </Button>
          )}
          {versions.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => setShowVersions(!showVersions)} data-testid="button-toggle-versions">
              <History className="w-4 h-4" /> History ({versions.length})
            </Button>
          )}
          {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" data-testid="button-delete-recipe">
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the recipe "{recipe.title}".
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Version History Panel */}
      {showVersions && versions.length > 0 && (
        <Card data-testid="container-version-history">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-lg uppercase tracking-wider flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Version History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {versions.map(v => {
                const vIngredients = (v.ingredients as Ingredient[]) || [];
                const isExpanded = expandedVersion === v.id;
                return (
                  <div key={v.id} data-testid={`version-${v.versionNumber}`}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover-elevate"
                      onClick={() => setExpandedVersion(isExpanded ? null : v.id)}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary">v{v.versionNumber}</Badge>
                          <span className="font-medium text-sm">{v.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {v.category} | Yield: {v.yieldAmount} {v.yieldUnit}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                          <Clock className="w-3 h-3" />
                          {v.createdAt && format(new Date(v.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          {v.changeNote && <span>| {v.changeNote}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{vIngredients.length} ingredients</span>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 bg-muted/30">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-2">Ingredient</th>
                              <th className="text-right py-2 px-2">Qty</th>
                              <th className="text-right py-2 px-2">Unit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {vIngredients.map((ing, idx) => (
                              <tr key={idx}>
                                <td className="py-1.5 px-2">{ing.name}</td>
                                <td className="py-1.5 px-2 text-right font-mono">{ing.quantity}</td>
                                <td className="py-1.5 px-2 text-right text-muted-foreground">{ing.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div ref={printRef}>
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono bg-accent/20 text-accent-foreground px-2 py-0.5 rounded">
              {recipe.category}
            </span>
          </div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2" data-testid="text-recipe-title">{recipe.title}</h1>
          <p className="text-lg text-muted-foreground">{recipe.description}</p>
          <div className="mt-2 text-sm font-mono text-muted-foreground">
            Yield: <span className="font-bold text-foreground">{recipe.yieldAmount}</span> {recipe.yieldUnit}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card>
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-lg uppercase tracking-wider">Ingredients</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-ingredients">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="w-10 px-4 py-3"></th>
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Ingredient</th>
                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Quantity</th>
                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Unit</th>
                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Baker's %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {ingredientsWithBP.map((ing, idx) => (
                        <tr
                          key={idx}
                          className={`transition-colors hover:bg-muted/50 ${checkedIngredients.has(idx) ? "bg-muted/30 line-through text-muted-foreground" : ""} ${ing.isFlour ? "bg-primary/5" : ""}`}
                          data-testid={`row-ingredient-${idx}`}
                        >
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={checkedIngredients.has(idx)}
                              onCheckedChange={() => toggleIngredient(idx)}
                              data-testid={`checkbox-ingredient-${idx}`}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            <div className="flex items-center gap-2 flex-wrap">
                              {ing.name}
                              {ing.isFlour && (
                                <Badge variant="secondary" className="text-[10px]">
                                  <Wheat className="w-3 h-3 mr-0.5" /> Flour
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-primary tabular-nums">
                            {ing.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{ing.unit}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums">
                            {ing.computedBP !== null ? `${ing.computedBP}%` : "\u2014"}
                          </td>
                        </tr>
                      ))}
                      {(() => {
                        const flourItems = ingredientsWithBP.filter(i => i.isFlour);
                        if (flourItems.length > 1) {
                          const totalFlour = flourItems.reduce((sum, i) => sum + i.quantity, 0);
                          return (
                            <tr className="border-t-2 border-border bg-primary/5 font-semibold" data-testid="row-total-flour">
                              <td className="px-4 py-2"></td>
                              <td className="px-4 py-2 text-sm text-muted-foreground">Total Flour</td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-primary tabular-nums">
                                {totalFlour.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2 text-right text-muted-foreground">{flourItems[0]?.unit}</td>
                              <td className="px-4 py-2 text-right font-mono text-muted-foreground">100%</td>
                            </tr>
                          );
                        }
                        return null;
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-lg uppercase tracking-wider">Method</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {instructions.length === 0 ? (
                  <p className="text-muted-foreground italic">No instructions provided.</p>
                ) : (
                  <div className="space-y-6">
                    {instructions.sort((a, b) => a.step - b.step).map((inst) => (
                      <div key={inst.step} className="flex gap-4 group">
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-mono font-bold text-sm shadow-md ring-4 ring-background">
                            {inst.step}
                          </div>
                          <div className="w-px h-full bg-border group-last:hidden mt-2" />
                        </div>
                        <div className="pb-8 pt-1">
                          <p className="text-foreground leading-relaxed">{inst.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <RecipeScaler recipe={recipe} />
            </div>
          </div>
        </div>
      </div>

      {/* Edit Recipe Dialog */}
      <EditRecipeDialog
        recipe={recipe}
        open={showEdit}
        onOpenChange={setShowEdit}
        isOwner={!!isOwner}
      />
    </div>
  );
}

function EditRecipeDialog({
  recipe,
  open,
  onOpenChange,
  isOwner,
}: {
  recipe: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
}) {
  const { mutate: updateRecipe, isPending } = useUpdateRecipe();
  const { toast } = useToast();

  const baseIngredients = (recipe.ingredients as Ingredient[]) || [];
  const baseInstructions = (recipe.instructions as Instruction[]) || [];

  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description || "");
  const [category, setCategory] = useState(recipe.category);
  const [yieldAmount, setYieldAmount] = useState(recipe.yieldAmount);
  const [yieldUnit, setYieldUnit] = useState(recipe.yieldUnit);
  const [ingredients, setIngredients] = useState<Ingredient[]>(baseIngredients.map(i => ({ ...i })));
  const [instructions, setInstructions] = useState<Instruction[]>(baseInstructions.map(i => ({ ...i })));
  const [changeReason, setChangeReason] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(recipe.title);
      setDescription(recipe.description || "");
      setCategory(recipe.category);
      setYieldAmount(recipe.yieldAmount);
      setYieldUnit(recipe.yieldUnit);
      setIngredients((recipe.ingredients as Ingredient[])?.map(i => ({ ...i })) || []);
      setInstructions((recipe.instructions as Instruction[])?.map(i => ({ ...i })) || []);
      setChangeReason("");
    }
  }, [open, recipe]);

  const addIngredient = () => {
    setIngredients(prev => [...prev, { name: "", quantity: 0, unit: "g" }]);
  };

  const removeIngredient = (idx: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: string, value: string | number) => {
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing));
  };

  const addInstruction = () => {
    setInstructions(prev => [...prev, { step: prev.length + 1, text: "" }]);
  };

  const removeInstruction = (idx: number) => {
    setInstructions(prev => prev.filter((_, i) => i !== idx).map((inst, i) => ({ ...inst, step: i + 1 })));
  };

  const updateInstruction = (idx: number, text: string) => {
    setInstructions(prev => prev.map((inst, i) => i === idx ? { ...inst, text } : inst));
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    const validIngredients = ingredients.filter(i => i.name.trim());
    const validInstructions = instructions.filter(i => i.text.trim());

    updateRecipe({
      id: recipe.id,
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      yieldAmount,
      yieldUnit,
      ingredients: validIngredients,
      instructions: validInstructions,
      changeReason: changeReason.trim() || undefined,
    }, {
      onSuccess: (result) => {
        onOpenChange(false);
        if (result.pending) {
          toast({ title: "Submitted for approval", description: "Your changes will be reviewed by the owner before going live." });
        } else {
          toast({ title: "Recipe updated", description: "Changes saved successfully." });
        }
      },
      onError: (err: any) => {
        toast({ title: "Failed to update", description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Recipe</DialogTitle>
        </DialogHeader>

        {!isOwner && (
          <div className="bg-muted border border-border rounded-md p-3 text-sm text-muted-foreground" data-testid="notice-approval-required">
            Changes will be submitted for owner approval before going live.
          </div>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Recipe Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sourdough Loaf"
                data-testid="input-edit-recipe-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-edit-recipe-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECIPE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              data-testid="input-edit-recipe-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Yield Amount</Label>
              <Input
                type="number"
                value={yieldAmount}
                onChange={(e) => setYieldAmount(parseFloat(e.target.value) || 0)}
                data-testid="input-edit-yield-amount"
              />
            </div>
            <div className="space-y-2">
              <Label>Yield Unit</Label>
              <Input
                value={yieldUnit}
                onChange={(e) => setYieldUnit(e.target.value)}
                placeholder="e.g. kg, loaves"
                data-testid="input-edit-yield-unit"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Ingredients</h3>
              <Button type="button" variant="outline" size="sm" onClick={addIngredient} data-testid="button-edit-add-ingredient">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
            {ingredients.map((ing, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center" data-testid={`edit-ingredient-row-${idx}`}>
                <div className="col-span-5">
                  <Input
                    placeholder="Name"
                    value={ing.name}
                    onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    placeholder="Qty"
                    step="0.01"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, "quantity", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    placeholder="Unit"
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                  />
                </div>
                <div className="col-span-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeIngredient(idx)} className="text-destructive">
                    <Plus className="w-4 h-4 rotate-45" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Instructions</h3>
              <Button type="button" variant="outline" size="sm" onClick={addInstruction} data-testid="button-edit-add-instruction">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
            {instructions.map((inst, idx) => (
              <div key={idx} className="flex gap-2 items-start" data-testid={`edit-instruction-row-${idx}`}>
                <div className="w-8 h-10 flex items-center justify-center font-mono text-muted-foreground font-bold shrink-0">
                  {idx + 1}.
                </div>
                <Input
                  placeholder="Step description..."
                  value={inst.text}
                  onChange={(e) => updateInstruction(idx, e.target.value)}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeInstruction(idx)} className="text-destructive shrink-0">
                  <Plus className="w-4 h-4 rotate-45" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {!isOwner && (
          <div className="space-y-2">
            <Label>Reason for Change (optional)</Label>
            <Textarea
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Briefly explain what you changed and why..."
              className="resize-none"
              rows={2}
              data-testid="input-change-reason"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !title.trim()}
            data-testid="button-save-recipe-edit"
          >
            {isPending ? "Saving..." : isOwner ? "Save Changes" : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecipeDetailSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="w-32 h-10" />
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <div className="lg:col-span-1">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </div>
  );
}
