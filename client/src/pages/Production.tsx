import { useState } from "react";
import { useProductionLogs, useCreateProductionLog } from "@/hooks/use-production-logs";
import { useRecipes } from "@/hooks/use-recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductionLogSchema, type InsertProductionLog } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PrepEQButton } from "@/components/PrepEQButton";

export default function Production() {
  const { data: logs, isLoading: logsLoading } = useProductionLogs();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Production Logs</h1>
          <p className="text-muted-foreground">Track daily output and production notes.</p>
        </div>
        <LogProductionDialog />
      </div>

      <Card className="industrial-card">
        <CardHeader className="border-b border-border bg-muted/20">
          <CardTitle className="text-lg">Production History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="p-4 space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : logs?.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No production logs recorded.</div>
          ) : (
            <div className="divide-y divide-border">
              {logs?.map((log: any) => (
                <div key={log.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                  <div className="space-y-1">
                    <div className="font-bold text-lg">{log.recipe?.title || "Unknown Recipe"}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                       <span>Recorded by {log.userId}</span>
                       <span>•</span>
                       <span>{format(new Date(log.date), "PPP p")}</span>
                    </div>
                    {log.notes && (
                      <p className="text-sm text-foreground/80 mt-2 bg-muted/30 p-2 rounded border border-border/50 max-w-xl">
                        "{log.notes}"
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Yield</div>
                    <div className="text-2xl font-mono font-bold text-primary">
                      {log.yieldProduced} <span className="text-sm font-sans font-normal text-muted-foreground">{log.recipe?.yieldUnit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PrepEQButton />
    </div>
  );
}

function LogProductionDialog() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { data: recipes } = useRecipes();
  const { mutate, isPending } = useCreateProductionLog();

  const form = useForm<InsertProductionLog>({
    resolver: zodResolver(insertProductionLogSchema),
    defaultValues: {
      recipeId: 0,
      userId: user?.id || "unknown", // This should be handled by backend usually, but schema requires it
      yieldProduced: 0,
      notes: "",
      date: new Date()
    }
  });

  // Update userId if user loads late
  if (user && form.getValues("userId") === "unknown") {
    form.setValue("userId", user.id);
  }

  const onSubmit = (data: InsertProductionLog) => {
    mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/20">
          <ClipboardList className="w-4 h-4 mr-2" /> Log Output
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Daily Production</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="recipeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipe</FormLabel>
                  <Select 
                    onValueChange={(val) => field.onChange(parseInt(val))}
                    defaultValue={field.value ? field.value.toString() : undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a recipe" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {recipes?.map(recipe => (
                        <SelectItem key={recipe.id} value={recipe.id.toString()}>
                          {recipe.title}
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
              name="yieldProduced"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Yield Produced</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      onChange={e => field.onChange(parseFloat(e.target.value))} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any issues? Quality notes?" 
                      className="resize-none"
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Log"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
