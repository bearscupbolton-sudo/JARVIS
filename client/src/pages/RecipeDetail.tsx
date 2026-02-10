import { useState, useRef } from "react";
import { useRecipe, useDeleteRecipe } from "@/hooks/use-recipes";
import { useRoute, Link, useLocation } from "wouter";
import { RecipeScaler } from "@/components/RecipeScaler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Trash2, Edit2, Printer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { type Ingredient, type Instruction } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

function computeBakersPercentages(ingredients: Ingredient[]): (Ingredient & { computedBP: number | null })[] {
  const flourKeywords = ["flour", "galahad", "gallahad", "lancelot", "round table", "t55", "bread flour", "whole wheat"];
  
  const flourIngredients = ingredients.filter(ing =>
    flourKeywords.some(kw => ing.name.toLowerCase().includes(kw))
  );
  
  const totalFlour = flourIngredients.reduce((sum, ing) => sum + ing.quantity, 0);

  if (totalFlour === 0) {
    return ingredients.map(ing => ({
      ...ing,
      computedBP: ing.bakersPercentage ?? null
    }));
  }

  return ingredients.map(ing => ({
    ...ing,
    computedBP: ing.bakersPercentage ?? Math.round((ing.quantity / totalFlour) * 10000) / 100
  }));
}

export default function RecipeDetail() {
  const [match, params] = useRoute("/recipes/:id");
  const id = parseInt(params?.id || "0");
  const { data: recipe, isLoading } = useRecipe(id);
  const { mutate: deleteRecipe } = useDeleteRecipe();
  const [, setLocation] = useLocation();
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const printRef = useRef<HTMLDivElement>(null);

  if (isLoading) return <RecipeDetailSkeleton />;
  if (!recipe) return <div className="p-8 text-center">Recipe not found</div>;

  const baseIngredients = (recipe.ingredients as Ingredient[]) || [];
  const instructions = (recipe.instructions as Instruction[]) || [];
  const ingredientsWithBP = computeBakersPercentages(baseIngredients);

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
                <tr>
                  <td class="check"><span class="checkbox"></span></td>
                  <td>${ing.name}</td>
                  <td class="right">${ing.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td class="right">${ing.unit}</td>
                  <td class="right">${ing.computedBP !== null ? ing.computedBP + '%' : '—'}</td>
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
        <div className="flex gap-2">
          <Button variant="default" className="gap-2" onClick={handlePrint} data-testid="button-print-recipe">
            <Printer className="w-4 h-4" /> Print / Export
          </Button>
          <Button variant="outline" size="sm" className="gap-2" disabled>
            <Edit2 className="w-4 h-4" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2" data-testid="button-delete-recipe">
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
        </div>
      </div>

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
                          className={`transition-colors hover:bg-muted/50 ${checkedIngredients.has(idx) ? "bg-muted/30 line-through text-muted-foreground" : ""}`}
                          data-testid={`row-ingredient-${idx}`}
                        >
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={checkedIngredients.has(idx)}
                              onCheckedChange={() => toggleIngredient(idx)}
                              data-testid={`checkbox-ingredient-${idx}`}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">{ing.name}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-primary tabular-nums">
                            {ing.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{ing.unit}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums">
                            {ing.computedBP !== null ? `${ing.computedBP}%` : "—"}
                          </td>
                        </tr>
                      ))}
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
    </div>
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
