import React, { useState, useEffect } from "react";
import { type Recipe, type Ingredient } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecipeScalerProps {
  recipe: Recipe;
}

export function RecipeScaler({ recipe }: RecipeScalerProps) {
  const [targetYield, setTargetYield] = useState<string>(recipe.yieldAmount.toString());
  const [scaledIngredients, setScaledIngredients] = useState<Ingredient[]>([]);

  // Parse JSON ingredients safely
  const baseIngredients = (recipe.ingredients as Ingredient[]) || [];

  useEffect(() => {
    const yieldNum = parseFloat(targetYield);
    if (isNaN(yieldNum) || yieldNum <= 0) {
      setScaledIngredients(baseIngredients);
      return;
    }

    const scaleFactor = yieldNum / recipe.yieldAmount;
    
    const newIngredients = baseIngredients.map(ing => ({
      ...ing,
      quantity: ing.quantity * scaleFactor
    }));
    
    setScaledIngredients(newIngredients);
  }, [targetYield, recipe.yieldAmount, baseIngredients]);

  return (
    <Card className="industrial-card h-full">
      <CardHeader className="pb-3 border-b border-border bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="w-5 h-5 text-accent" />
            Production Scaler
          </CardTitle>
          <div className="text-sm font-mono text-muted-foreground">
            Base: {recipe.yieldAmount} {recipe.yieldUnit}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-end gap-4 bg-primary/5 p-4 rounded-lg border border-primary/10">
          <div className="flex-1 space-y-2">
            <Label htmlFor="yield-input" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Target Yield</Label>
            <div className="relative">
              <Input
                id="yield-input"
                type="number"
                value={targetYield}
                onChange={(e) => setTargetYield(e.target.value)}
                className="font-mono text-2xl h-12 pl-4 border-primary/20 focus:border-accent focus:ring-accent/20"
                placeholder="0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                {recipe.yieldUnit}
              </span>
            </div>
          </div>
          <ArrowRight className="w-6 h-6 text-muted-foreground mb-3 hidden sm:block" />
          <div className="hidden sm:block flex-1 pb-3">
             <div className="text-sm text-muted-foreground">
                Scale Factor: <span className="font-mono font-bold text-foreground">{(parseFloat(targetYield) / recipe.yieldAmount || 0).toFixed(2)}x</span>
             </div>
          </div>
        </div>

        <div className="space-y-0">
          <div className="grid grid-cols-12 text-xs uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2 border-b border-border">
            <div className="col-span-6">Ingredient</div>
            <div className="col-span-3 text-right">Qty</div>
            <div className="col-span-3 text-right">Unit</div>
          </div>
          <div className="divide-y divide-border/50">
            {scaledIngredients.map((ing, idx) => (
              <div key={idx} className={cn(
                "grid grid-cols-12 items-center px-4 py-3 hover:bg-muted/50 transition-colors font-mono text-sm",
                idx % 2 === 0 ? "bg-white" : "bg-muted/10"
              )}>
                <div className="col-span-6 font-medium text-foreground">{ing.name}</div>
                <div className="col-span-3 text-right font-bold text-primary">
                  {ing.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="col-span-3 text-right text-muted-foreground">{ing.unit}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
