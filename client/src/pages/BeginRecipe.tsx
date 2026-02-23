import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useRecipe } from "@/hooks/use-recipes";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle2, ChefHat, Eye, EyeOff, Camera, AlertTriangle } from "lucide-react";
import { type Ingredient, type Instruction } from "@shared/schema";
import { useAchievementCelebration } from "@/components/Confetti";

const FLOUR_KEYWORDS = [
  "flour", "galahad", "gallahad", "sir galahad", "lancelot", "sir lancelot",
  "round table", "t55", "t65", "t80", "t110", "t150",
  "bread flour", "whole wheat", "all purpose", "all-purpose", "ap flour",
  "pastry flour", "cake flour", "patent flour", "special patent",
  "king arthur", "ka bread", "ka ap", "semolina", "durum",
  "rye flour", "spelt flour", "einkorn",
];

function isFlourIngredient(name: string): boolean {
  return FLOUR_KEYWORDS.some(kw => name.toLowerCase().includes(kw));
}

type ScaledIngredient = Ingredient & { checked: boolean; originalIdx: number };

export default function BeginRecipe() {
  const [, params] = useRoute("/recipes/:id/begin");
  const id = parseInt(params?.id || "0");
  const { data: recipe, isLoading } = useRecipe(id);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const urlParams = new URLSearchParams(window.location.search);
  const scaleFromUrl = parseFloat(urlParams.get("scale") || "1");
  const unitWeightFromUrl = parseFloat(urlParams.get("unitWeight") || "0");
  const unitQtyFromUrl = parseInt(urlParams.get("unitQty") || "0");

  const [scaleFactor] = useState(scaleFromUrl || 1);
  const [startedAt] = useState(new Date().toISOString());
  const [ingredients, setIngredients] = useState<ScaledIngredient[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const assistMode = user?.recipeAssistMode || "off";
  const isAssistMandatory = assistMode === "mandatory" || assistMode === "photo_required";
  const [assistActive, setAssistActive] = useState(isAssistMandatory);
  const [assistStep, setAssistStep] = useState(0);
  const [assistPhotoTaken, setAssistPhotoTaken] = useState(false);
  const { celebrate, elements: celebrationElements } = useAchievementCelebration();

  useEffect(() => {
    if (recipe) {
      const base = (recipe.ingredients as Ingredient[]) || [];
      setIngredients(base.map((ing, idx) => ({
        ...ing,
        quantity: ing.quantity * scaleFactor,
        checked: false,
        originalIdx: idx,
      })));
    }
  }, [recipe, scaleFactor]);

  const sessionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/recipe-sessions", data);
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Recipe completed!", description: "Session logged successfully." });
      try {
        const checkRes = await apiRequest("POST", "/api/achievements/check");
        const checkData = await checkRes.json();
        if (checkData.newAchievements?.length > 0) {
          celebrate(checkData.newAchievements[0]);
          queryClient.invalidateQueries({ queryKey: ["/api/achievements/me"] });
          queryClient.invalidateQueries({ queryKey: ["/api/home/personalized"] });
          setTimeout(() => setLocation(`/recipes/${id}`), 3000);
          return;
        }
      } catch {}
      setLocation(`/recipes/${id}`);
    },
    onError: (err: any) => {
      toast({ title: "Failed to log session", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!recipe) {
    return <div className="p-8 text-center">Recipe not found</div>;
  }

  if (assistMode === "locked") {
    return (
      <div className="max-w-lg mx-auto p-8 text-center space-y-4">
        <AlertTriangle className="w-16 h-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-display font-bold">Recipe Access Restricted</h1>
        <p className="text-muted-foreground">Your recipe access has been restricted by management. Please speak with your manager.</p>
        <Button variant="outline" onClick={() => setLocation("/recipes")} data-testid="button-back-locked">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Recipes
        </Button>
      </div>
    );
  }

  const instructions = (recipe.instructions as Instruction[]) || [];
  const allChecked = ingredients.length > 0 && ingredients.every(i => i.checked);
  const checkedCount = ingredients.filter(i => i.checked).length;

  const toggleIngredient = (idx: number) => {
    if (assistActive && idx !== assistStep) return;
    if (assistActive && assistMode === "photo_required" && !assistPhotoTaken) return;
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, checked: !ing.checked } : ing
    ));
    if (assistActive && idx === assistStep) {
      setAssistStep(prev => prev + 1);
      setAssistPhotoTaken(false);
    }
  };

  const handleComplete = () => {
    setShowNotes(true);
  };

  const handleSubmit = (skipNotes: boolean) => {
    sessionMutation.mutate({
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      scaleFactor,
      unitWeight: unitWeightFromUrl || null,
      unitQty: unitQtyFromUrl || null,
      scaledIngredients: ingredients.map(i => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        group: i.group,
      })),
      notes: skipNotes ? null : (notes.trim() || null),
      assistMode: assistActive ? assistMode : "off",
      startedAt,
      completedAt: new Date().toISOString(),
    });
  };

  const groupedIngredients = (() => {
    const hasGroups = ingredients.some(i => i.group);
    if (!hasGroups) return [{ group: "", items: ingredients }];
    const groups: { group: string; items: ScaledIngredient[] }[] = [];
    const seen = new Set<string>();
    ingredients.forEach(ing => {
      const g = ing.group || "";
      if (!seen.has(g)) { seen.add(g); groups.push({ group: g, items: [] }); }
      groups.find(gr => gr.group === g)!.items.push(ing);
    });
    return groups;
  })();

  const currentAssistIngredient = assistActive && assistStep < ingredients.length ? ingredients[assistStep] : null;

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
      {celebrationElements}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/recipes/${id}`)}
            data-testid="button-begin-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Exit
          </Button>
          <div className="text-center">
            <h1 className="font-display font-bold text-lg leading-tight" data-testid="text-begin-title">{recipe.title}</h1>
            <p className="text-xs text-muted-foreground">
              {scaleFactor !== 1 && `Scaled ${scaleFactor.toFixed(2)}x · `}
              {checkedCount}/{ingredients.length} weighed
            </p>
          </div>
          <Button
            size="sm"
            disabled={!allChecked || sessionMutation.isPending}
            onClick={handleComplete}
            data-testid="button-begin-complete"
          >
            <CheckCircle2 className="w-4 h-4 mr-1" /> Done
          </Button>
        </div>
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(checkedCount / Math.max(ingredients.length, 1)) * 100}%` }}
            data-testid="progress-bar"
          />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {!isAssistMandatory && (
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInstructions(!showInstructions)}
              data-testid="button-toggle-instructions"
            >
              {showInstructions ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
              {showInstructions ? "Hide Method" : "Show Method"}
            </Button>
            {assistMode === "optional" && (
              <Button
                variant={assistActive ? "default" : "outline"}
                size="sm"
                onClick={() => { setAssistActive(!assistActive); setAssistStep(checkedCount); }}
                data-testid="button-toggle-assist"
              >
                <ChefHat className="w-4 h-4 mr-1" />
                {assistActive ? "Assist On" : "Recipe Assist"}
              </Button>
            )}
          </div>
        )}

        {showInstructions && instructions.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider">Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {instructions.sort((a, b) => a.step - b.step).map(inst => (
                <div key={inst.step} className="flex gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {inst.step}
                  </div>
                  <p className="text-muted-foreground pt-0.5">{inst.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {assistActive && currentAssistIngredient ? (
          <Card className="border-2 border-primary" data-testid="assist-current-ingredient">
            <CardContent className="p-6 text-center space-y-4">
              <Badge variant="secondary" className="text-xs">
                Step {assistStep + 1} of {ingredients.length}
              </Badge>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Weigh and add:</p>
                <p className="text-3xl font-mono font-bold text-primary" data-testid="assist-qty">
                  {currentAssistIngredient.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currentAssistIngredient.unit}
                </p>
                <p className="text-xl font-display font-semibold mt-1" data-testid="assist-name">
                  {currentAssistIngredient.name}
                </p>
                {currentAssistIngredient.group && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Add to: <span className="font-semibold">{currentAssistIngredient.group}</span>
                  </p>
                )}
              </div>

              {assistMode === "photo_required" && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Camera className="w-4 h-4" />
                    Photo verification required
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Take a photo of the ingredient on the scale before confirming.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="w-full text-sm"
                    onChange={(e) => setAssistPhotoTaken(!!(e.target.files && e.target.files.length > 0))}
                    data-testid="input-assist-photo"
                  />
                </div>
              )}

              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => toggleIngredient(assistStep)}
                disabled={assistMode === "photo_required" && !assistPhotoTaken}
                data-testid="button-assist-confirm"
              >
                <CheckCircle2 className="w-5 h-5" />
                Weighed & Added
              </Button>
            </CardContent>
          </Card>
        ) : assistActive && assistStep >= ingredients.length ? (
          <Card className="border-2 border-green-500">
            <CardContent className="p-6 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-display font-bold">All Ingredients Weighed!</h2>
              <p className="text-muted-foreground">Tap "Done" above to complete this recipe.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1">
            {groupedIngredients.map((grp, gIdx) => (
              <div key={gIdx}>
                {grp.group && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md mt-3 mb-1" data-testid={`begin-group-${gIdx}`}>
                    <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{grp.group}</span>
                  </div>
                )}
                {grp.items.map((ing, idx) => {
                  const globalIdx = ingredients.indexOf(ing);
                  return (
                    <div
                      key={globalIdx}
                      className={`flex items-center gap-3 px-3 py-3 rounded-md cursor-pointer transition-all ${
                        ing.checked
                          ? "bg-muted/30 opacity-60"
                          : isFlourIngredient(ing.name)
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => toggleIngredient(globalIdx)}
                      data-testid={`begin-ingredient-${globalIdx}`}
                    >
                      <Checkbox
                        checked={ing.checked}
                        onCheckedChange={() => toggleIngredient(globalIdx)}
                        data-testid={`begin-check-${globalIdx}`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium ${ing.checked ? "line-through text-muted-foreground" : ""}`}>
                          {ing.name}
                        </span>
                      </div>
                      <div className={`text-right font-mono ${ing.checked ? "line-through text-muted-foreground" : "font-bold text-primary"}`}>
                        {ing.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-right text-sm text-muted-foreground w-8">
                        {ing.unit}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showNotes} onOpenChange={setShowNotes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Any Notes for This Recipe?</DialogTitle>
            <DialogDescription>
              Anything worth noting? Adjustments, observations, issues?
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Dough was a bit dry, added 20g extra water..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="resize-none"
            data-testid="input-session-notes"
          />
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => handleSubmit(true)}
              disabled={sessionMutation.isPending}
              data-testid="button-skip-notes"
            >
              Not Today
            </Button>
            <Button
              onClick={() => handleSubmit(false)}
              disabled={sessionMutation.isPending}
              data-testid="button-submit-notes"
            >
              {sessionMutation.isPending ? "Saving..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
