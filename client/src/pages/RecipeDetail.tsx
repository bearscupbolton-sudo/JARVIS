import { useRecipe, useDeleteRecipe } from "@/hooks/use-recipes";
import { useRoute, Link, useLocation } from "wouter";
import { RecipeScaler } from "@/components/RecipeScaler";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Edit2, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { type Instruction } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function RecipeDetail() {
  const [match, params] = useRoute("/recipes/:id");
  const id = parseInt(params?.id || "0");
  const { data: recipe, isLoading } = useRecipe(id);
  const { mutate: deleteRecipe } = useDeleteRecipe();
  const [, setLocation] = useLocation();

  if (isLoading) return <RecipeDetailSkeleton />;
  if (!recipe) return <div className="p-8 text-center">Recipe not found</div>;

  const instructions = (recipe.instructions as Instruction[]) || [];

  const handleDelete = () => {
    deleteRecipe(id, {
      onSuccess: () => setLocation("/recipes")
    });
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between">
        <Link href="/recipes">
          <Button variant="ghost" className="gap-2 pl-0 hover:pl-2 transition-all">
            <ArrowLeft className="w-4 h-4" /> Back to Recipes
          </Button>
        </Link>
        <div className="flex gap-2">
          {/* Edit button placeholder - fully implementing edit is verbose but follows creation pattern */}
          <Button variant="outline" size="sm" className="gap-2" disabled>
            <Edit2 className="w-4 h-4" /> Edit
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2">
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

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono bg-accent/20 text-accent-foreground px-2 py-0.5 rounded">
                {recipe.category}
              </span>
            </div>
            <h1 className="text-4xl font-display font-bold text-foreground mb-4">{recipe.title}</h1>
            <p className="text-lg text-muted-foreground">{recipe.description}</p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold border-b border-border pb-2">Method</h2>
            <div className="space-y-6">
              {instructions.length === 0 ? (
                <p className="text-muted-foreground italic">No instructions provided.</p>
              ) : (
                instructions.sort((a, b) => a.step - b.step).map((inst) => (
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
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <RecipeScaler recipe={recipe} />
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
