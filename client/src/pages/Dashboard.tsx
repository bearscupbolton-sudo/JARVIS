import { useRecipes } from "@/hooks/use-recipes";
import { useProductionLogs } from "@/hooks/use-production-logs";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowUpRight, 
  ChefHat, 
  ClipboardList, 
  TrendingUp, 
  Clock 
} from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: recipes, isLoading: loadingRecipes } = useRecipes();
  const { data: logs, isLoading: loadingLogs } = useProductionLogs();

  const recentLogs = logs?.slice(0, 5) || [];
  const totalRecipes = recipes?.length || 0;
  
  // Calculate total production yield today
  const today = new Date().toDateString();
  const todayYield = logs?.filter(log => new Date(log.date).toDateString() === today)
    .reduce((acc, log) => acc + log.yieldProduced, 0) || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold">Dashboard</h1>
        <p className="text-muted-foreground font-mono">{format(new Date(), "MMMM do, yyyy")}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="industrial-card border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Recipes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold font-mono">{totalRecipes}</div>
              <ChefHat className="w-8 h-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card className="industrial-card border-l-4 border-l-accent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Today's Production</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold font-mono">{todayYield.toLocaleString()} <span className="text-sm text-muted-foreground font-sans">units</span></div>
              <TrendingUp className="w-8 h-8 text-accent/20" />
            </div>
          </CardContent>
        </Card>

        <Card className="industrial-card border-l-4 border-l-muted-foreground">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link href="/production" className="flex-1">
              <Button className="w-full" size="sm">Log Production</Button>
            </Link>
            <Link href="/assistant" className="flex-1">
              <Button variant="outline" className="w-full" size="sm">Ask Jarvis</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Recent Production */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Recent Logs
            </h2>
            <Link href="/production" className="text-sm text-accent hover:underline flex items-center">
              View All <ArrowUpRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          
          <Card className="industrial-card">
            <div className="divide-y divide-border">
              {loadingLogs ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="p-4 flex gap-4">
                    <Skeleton className="w-12 h-12 rounded" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))
              ) : recentLogs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No logs recorded yet.</div>
              ) : (
                recentLogs.map((log: any) => (
                  <div key={log.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary font-bold font-mono text-sm">
                        {log.yieldProduced}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{log.recipe?.title || "Unknown Recipe"}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(log.date), "MMM d, h:mm a")}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                       {log.recipe?.yieldUnit}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Recipe Library */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <ChefHat className="w-5 h-5" /> Recipes
            </h2>
            <Link href="/recipes" className="text-sm text-accent hover:underline flex items-center">
              Browse All <ArrowUpRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {loadingRecipes ? (
              Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)
            ) : (
              recipes?.slice(0, 4).map((recipe) => (
                <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                  <Card className="industrial-card h-full hover:border-accent cursor-pointer group">
                    <CardContent className="p-4 flex flex-col justify-between h-full">
                      <div>
                        <div className="text-xs font-mono text-accent mb-1">{recipe.category}</div>
                        <div className="font-bold text-foreground group-hover:text-primary transition-colors">{recipe.title}</div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
                        <span>Yield: {recipe.yieldAmount} {recipe.yieldUnit}</span>
                        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
