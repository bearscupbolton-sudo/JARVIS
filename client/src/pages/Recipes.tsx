import { useState, useRef, useCallback } from "react";
import { useRecipes, useCreateRecipe } from "@/hooks/use-recipes";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Plus, 
  Search, 
  Filter, 
  ChefHat,
  ArrowRight,
  Camera,
  Bot,
  Loader2,
  ImageIcon,
  X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRecipeSchema, type InsertRecipe } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

const RECIPE_CATEGORIES = [
  "Bread",
  "Viennoiserie",
  "Component",
  "Gluten Free",
  "Cookies",
  "Muffin/Cake",
  "Mother",
] as const;

export default function Recipes() {
  const { data: recipes, isLoading } = useRecipes();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const existingCategories = Array.from(new Set(recipes?.map(r => r.category) || []));
  const allCategories = Array.from(new Set([...RECIPE_CATEGORIES, ...existingCategories]));
  const categories = ["All", ...allCategories];

  const filteredRecipes = recipes?.filter(recipe => {
    const matchesSearch = recipe.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "All" || recipe.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Recipes</h1>
          <p className="text-muted-foreground">Standardized formulas and production methods.</p>
        </div>
        <CreateRecipeDialog />
      </div>

      {user?.locked && (
        <div className="bg-muted border border-border rounded-lg p-3 text-sm text-muted-foreground">
          Your account is read-only. You can view recipes but cannot make changes.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search recipes..." 
            className="pl-9 bg-background"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                categoryFilter === cat 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))
        ) : filteredRecipes?.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No recipes found matching your criteria.
          </div>
        ) : (
          filteredRecipes?.map((recipe) => (
            <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
              <Card className="industrial-card h-full cursor-pointer group hover:border-accent">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded bg-primary/5 flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                      <ChefHat className="w-6 h-6 text-primary group-hover:text-accent transition-colors" />
                    </div>
                    <span className="text-xs font-mono font-medium px-2 py-1 bg-muted rounded text-muted-foreground">
                      {recipe.category}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{recipe.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-6 flex-1">
                    {recipe.description || "No description provided."}
                  </p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                    <div className="text-sm font-mono text-muted-foreground">
                      <span className="font-bold text-foreground">{recipe.yieldAmount}</span> {recipe.yieldUnit}
                    </div>
                    <div className="flex items-center text-primary font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      View Formula <ArrowRight className="w-4 h-4 ml-1" />
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

function CreateRecipeDialog() {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useCreateRecipe();
  const { user } = useAuth();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<InsertRecipe>({
    resolver: zodResolver(insertRecipeSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      yieldAmount: 1,
      yieldUnit: "kg",
      ingredients: [],
      instructions: []
    }
  });

  const { fields: ingredientFields, append: appendIngredient, remove: removeIngredient, replace: replaceIngredients } = useFieldArray({
    control: form.control,
    name: "ingredients" as any
  });

  const { fields: instructionFields, append: appendInstruction, remove: removeInstruction, replace: replaceInstructions } = useFieldArray({
    control: form.control,
    name: "instructions" as any
  });

  if (user?.locked) return null;

  const handlePhotoUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image under 10MB.", variant: "destructive" });
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setScanning(true);

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await apiRequest("POST", "/api/recipes/scan", { image: dataUrl });
      const parsed = await res.json();

      if (parsed.title) form.setValue("title", parsed.title);
      if (parsed.description) form.setValue("description", parsed.description);
      if (parsed.category && RECIPE_CATEGORIES.includes(parsed.category)) {
        form.setValue("category", parsed.category);
      }
      if (parsed.yieldAmount) form.setValue("yieldAmount", Number(parsed.yieldAmount) || 1);
      if (parsed.yieldUnit) form.setValue("yieldUnit", String(parsed.yieldUnit));
      if (parsed.ingredients?.length) {
        replaceIngredients(parsed.ingredients.map((i: any) => ({
          name: String(i.name || ""),
          quantity: Number(i.quantity) || 0,
          unit: String(i.unit || "g"),
        })));
      }
      if (parsed.instructions?.length) {
        replaceInstructions(parsed.instructions.map((i: any, idx: number) => ({
          step: Number(i.step) || idx + 1,
          text: String(i.text || ""),
        })));
      }

      toast({ title: "Jarvis parsed your recipe", description: "Review and edit the details below before saving." });
    } catch (error: any) {
      toast({ title: "Could not parse recipe", description: error.message || "Please try a clearer photo.", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [form, replaceIngredients, replaceInstructions, toast, previewUrl]);

  const onSubmit = (data: InsertRecipe) => {
    mutate(data, {
      onSuccess: (result) => {
        setOpen(false);
        form.reset();
        setPreviewUrl(null);
        if (result.pending) {
          toast({ title: "Submitted for approval", description: "Your recipe will be reviewed by the owner before it goes live." });
        } else {
          toast({ title: "Recipe created" });
        }
      }
    });
  };

  const clearPhoto = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4 mr-2" /> New Recipe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Recipe</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <div className="flex items-center gap-3 mb-3">
            <Bot className="w-5 h-5 text-primary" />
            <div>
              <p className="font-semibold text-sm">Scan with Jarvis</p>
              <p className="text-xs text-muted-foreground">Upload a photo of a recipe and Jarvis will parse it for you</p>
            </div>
          </div>

          {previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="Recipe preview" className="w-full max-h-48 object-contain rounded-md bg-background" />
              {scanning ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-md">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    Jarvis is reading your recipe...
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={clearPhoto}
                  data-testid="button-clear-recipe-photo"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 py-6 cursor-pointer rounded-md border border-border bg-background hover-elevate transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload-recipe-photo"
            >
              <Camera className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Tap to upload a recipe photo</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="input-recipe-photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoUpload(file);
            }}
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipe Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Sourdough Loaf" data-testid="input-recipe-title" />
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
                        <SelectTrigger data-testid="select-recipe-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RECIPE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat} data-testid={`select-category-${cat.toLowerCase().replace(/\//g, "-")}`}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Brief description..." data-testid="input-recipe-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="yieldAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Yield Amount</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={e => field.onChange(parseFloat(e.target.value))} 
                        data-testid="input-recipe-yield-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="yieldUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yield Unit</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. kg, loaves" data-testid="input-recipe-yield-unit" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 border-t border-border pt-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Ingredients</h3>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => appendIngredient({ name: "", quantity: 0, unit: "g" })}
                  data-testid="button-add-ingredient"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
              {ingredientFields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input 
                      placeholder="Name" 
                      {...form.register(`ingredients.${index}.name` as any)} 
                      data-testid={`input-ingredient-name-${index}`}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input 
                      type="number" 
                      placeholder="Qty" 
                      step="0.01"
                      {...form.register(`ingredients.${index}.quantity` as any, { valueAsNumber: true })} 
                      data-testid={`input-ingredient-qty-${index}`}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input 
                      placeholder="Unit" 
                      {...form.register(`ingredients.${index}.unit` as any)} 
                      data-testid={`input-ingredient-unit-${index}`}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeIngredient(index)}
                      className="text-destructive"
                    >
                      <Plus className="w-4 h-4 rotate-45" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4 border-t border-border pt-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Instructions</h3>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => appendInstruction({ step: instructionFields.length + 1, text: "" })}
                  data-testid="button-add-instruction"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
              {instructionFields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="w-8 h-10 flex items-center justify-center font-mono text-muted-foreground font-bold shrink-0">
                    {index + 1}.
                  </div>
                  <Input 
                    placeholder="Step description..." 
                    {...form.register(`instructions.${index}.text` as any)} 
                    {...form.register(`instructions.${index}.step` as any, { value: index + 1 })}
                    data-testid={`input-instruction-${index}`}
                  />
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeInstruction(index)}
                    className="text-destructive shrink-0"
                  >
                    <Plus className="w-4 h-4 rotate-45" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-recipe">Cancel</Button>
              <Button type="submit" disabled={isPending || scanning} data-testid="button-submit-recipe">
                {isPending ? "Creating..." : "Create Recipe"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
