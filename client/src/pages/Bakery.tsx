import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import {
  ChefHat, Plus, Trash2, Clock, ArrowRight,
  ClipboardList, Flame, CheckCircle2, ListChecks
} from "lucide-react";
import type { PastryTotal, ShapingLog, BakeoffLog, Recipe } from "@shared/schema";

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getNow() {
  return format(new Date(), "h:mm a");
}

const pastryTotalFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  targetCount: z.coerce.number().min(1, "Must be at least 1"),
});

const shapingFormSchema = z.object({
  doughType: z.string().min(1, "Dough type is required"),
  yieldCount: z.coerce.number().min(1, "Must be at least 1"),
});

const bakeoffFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  quantity: z.coerce.number().min(1, "Must be at least 1"),
});

export default function Bakery() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = getToday();
  const isLocked = user?.locked;

  const totalForm = useForm<z.infer<typeof pastryTotalFormSchema>>({
    resolver: zodResolver(pastryTotalFormSchema),
    defaultValues: { itemName: "", targetCount: 0 },
  });

  const shapingForm = useForm<z.infer<typeof shapingFormSchema>>({
    resolver: zodResolver(shapingFormSchema),
    defaultValues: { doughType: "", yieldCount: 0 },
  });

  const bakeoffForm = useForm<z.infer<typeof bakeoffFormSchema>>({
    resolver: zodResolver(bakeoffFormSchema),
    defaultValues: { itemName: "", quantity: 0 },
  });

  const totalsKey = `/api/pastry-totals?date=${today}`;
  const shapingKey = `/api/shaping-logs?date=${today}`;
  const bakeoffKey = `/api/bakeoff-logs?date=${today}`;

  const { data: pastryTotals = [] } = useQuery<PastryTotal[]>({
    queryKey: [totalsKey],
  });

  const { data: shapingLogs = [] } = useQuery<ShapingLog[]>({
    queryKey: [shapingKey],
  });

  const { data: bakeoffLogs = [] } = useQuery<BakeoffLog[]>({
    queryKey: [bakeoffKey],
  });

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
  });

  const createTotal = useMutation({
    mutationFn: async (data: z.infer<typeof pastryTotalFormSchema>) => {
      const res = await apiRequest("POST", "/api/pastry-totals", { ...data, date: today });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [totalsKey] });
      totalForm.reset();
    },
  });

  const deleteTotal = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/pastry-totals/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [totalsKey] }),
  });

  const createShaping = useMutation({
    mutationFn: async (data: z.infer<typeof shapingFormSchema>) => {
      const res = await apiRequest("POST", "/api/shaping-logs", { ...data, date: today, shapedAt: getNow() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [shapingKey] });
      shapingForm.reset();
      toast({ title: "Shaping logged" });
    },
  });

  const deleteShaping = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/shaping-logs/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [shapingKey] }),
  });

  const createBakeoff = useMutation({
    mutationFn: async (data: z.infer<typeof bakeoffFormSchema>) => {
      const res = await apiRequest("POST", "/api/bakeoff-logs", { ...data, date: today, bakedAt: getNow() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [bakeoffKey] });
      bakeoffForm.reset();
      toast({ title: "Bake-off logged" });
    },
  });

  const deleteBakeoff = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/bakeoff-logs/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [bakeoffKey] }),
  });

  const todoList = useMemo(() => {
    return pastryTotals.map(total => {
      const shaped = shapingLogs
        .filter(s => s.doughType.toLowerCase() === total.itemName.toLowerCase())
        .reduce((sum, s) => sum + s.yieldCount, 0);
      const remaining = Math.max(0, total.targetCount - shaped);
      return {
        itemName: total.itemName,
        target: total.targetCount,
        shaped,
        remaining,
        done: remaining === 0,
      };
    });
  }, [pastryTotals, shapingLogs]);

  const allDone = todoList.length > 0 && todoList.every(t => t.done);

  const pastryItemNames = useMemo(() => {
    const names = new Set<string>();
    pastryTotals.forEach(t => names.add(t.itemName));
    recipes.forEach(r => {
      if (r.category === "Pastry" || r.category === "Bread") names.add(r.title);
    });
    return Array.from(names).sort();
  }, [pastryTotals, recipes]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold">Bakery</h1>
          <p className="text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/lamination">
            <Button variant="default" data-testid="button-go-to-studio">
              <Flame className="w-4 h-4 mr-2" />
              Lamination Studio
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/recipes">
            <Button variant="outline" data-testid="button-view-recipes">
              <ChefHat className="w-4 h-4 mr-2" />
              Recipes
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground" data-testid="text-studio-note">
        Primary production logging happens in <Link href="/lamination" className="font-medium text-primary underline underline-offset-2">Lamination Studio</Link> — bake-offs are logged automatically when doughs finish. Use the Quick Log button there for non-laminated items like muffins or cookies.
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pastry Totals */}
        <Card data-testid="container-pastry-totals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Pastry Totals
            </CardTitle>
            <Badge variant="secondary">{pastryTotals.length} items</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Set target counts for each pastry needed today.</p>
            {pastryTotals.map(total => (
              <div key={total.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate" data-testid={`text-total-item-${total.id}`}>{total.itemName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" data-testid={`text-total-count-${total.id}`}>{total.targetCount}</Badge>
                  {!isLocked && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteTotal.mutate(total.id)}
                      data-testid={`button-delete-total-${total.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!isLocked && (
              <Form {...totalForm}>
                <form onSubmit={totalForm.handleSubmit((data) => createTotal.mutate(data))} className="flex gap-2 pt-2">
                  <FormField
                    control={totalForm.control}
                    name="itemName"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input placeholder="Item name" {...field} data-testid="input-total-item" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={totalForm.control}
                    name="targetCount"
                    render={({ field }) => (
                      <FormItem className="w-20">
                        <FormControl>
                          <Input type="number" placeholder="Count" {...field} data-testid="input-total-count" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button
                    size="icon"
                    type="submit"
                    disabled={createTotal.isPending}
                    data-testid="button-add-total"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        {/* Auto To-Do List */}
        <Card data-testid="container-todo-list">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-primary" />
              Shaping To-Do
            </CardTitle>
            {allDone && <Badge variant="default">All Done</Badge>}
          </CardHeader>
          <CardContent className="space-y-2">
            {todoList.length === 0 && (
              <p className="text-sm text-muted-foreground">Add pastry totals to generate your to-do list.</p>
            )}
            {todoList.map(item => (
              <div key={item.itemName} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground shrink-0" />
                  )}
                  <span className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`} data-testid={`text-todo-item-${item.itemName}`}>
                    {item.itemName}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground" data-testid={`text-todo-progress-${item.itemName}`}>
                    {item.shaped}/{item.target}
                  </span>
                  {!item.done && (
                    <Badge variant="secondary" data-testid={`text-todo-remaining-${item.itemName}`}>
                      {item.remaining} left
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Shaping Log */}
      <Card data-testid="container-shaping-log">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Shaping Log
          </CardTitle>
          <Badge variant="secondary">{shapingLogs.length} entries</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLocked && (
            <Form {...shapingForm}>
              <form onSubmit={shapingForm.handleSubmit((data) => createShaping.mutate(data))} className="flex gap-2 flex-wrap">
                <FormField
                  control={shapingForm.control}
                  name="doughType"
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[160px]">
                      <FormControl>
                        {pastryItemNames.length > 0 ? (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger data-testid="select-shaping-dough">
                              <SelectValue placeholder="Dough type" />
                            </SelectTrigger>
                            <SelectContent>
                              {pastryItemNames.map(name => (
                                <SelectItem key={name} value={name}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input placeholder="Dough type" {...field} data-testid="input-shaping-dough" />
                        )}
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={shapingForm.control}
                  name="yieldCount"
                  render={({ field }) => (
                    <FormItem className="w-20">
                      <FormControl>
                        <Input type="number" placeholder="Yield" {...field} data-testid="input-shaping-yield" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={createShaping.isPending}
                  data-testid="button-add-shaping"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Log Shaping
                </Button>
              </form>
            </Form>
          )}

          {shapingLogs.length === 0 && (
            <p className="text-sm text-muted-foreground">No shaping entries yet today.</p>
          )}

          <div className="space-y-2">
            {shapingLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className="shrink-0" data-testid={`text-shaping-type-${log.id}`}>{log.doughType}</Badge>
                  <span className="text-sm" data-testid={`text-shaping-yield-${log.id}`}>Yield: {log.yieldCount}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground" data-testid={`text-shaping-time-${log.id}`}>{log.shapedAt}</span>
                  {!isLocked && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteShaping.mutate(log.id)}
                      data-testid={`button-delete-shaping-${log.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bake-Off Log */}
      <Card data-testid="container-bakeoff-log">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Flame className="w-5 h-5 text-primary" />
            Bake-Off Log
          </CardTitle>
          <Badge variant="secondary">{bakeoffLogs.length} racks</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLocked && (
            <Form {...bakeoffForm}>
              <form onSubmit={bakeoffForm.handleSubmit((data) => createBakeoff.mutate(data))} className="flex gap-2 flex-wrap">
                <FormField
                  control={bakeoffForm.control}
                  name="itemName"
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[160px]">
                      <FormControl>
                        {pastryItemNames.length > 0 ? (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger data-testid="select-bakeoff-item">
                              <SelectValue placeholder="Item" />
                            </SelectTrigger>
                            <SelectContent>
                              {pastryItemNames.map(name => (
                                <SelectItem key={name} value={name}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input placeholder="Item name" {...field} data-testid="input-bakeoff-item" />
                        )}
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={bakeoffForm.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem className="w-20">
                      <FormControl>
                        <Input type="number" placeholder="Qty" {...field} data-testid="input-bakeoff-qty" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={createBakeoff.isPending}
                  data-testid="button-add-bakeoff"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Log Bake-Off
                </Button>
              </form>
            </Form>
          )}

          {bakeoffLogs.length === 0 && (
            <p className="text-sm text-muted-foreground">No bake-off entries yet today.</p>
          )}

          <div className="space-y-2">
            {bakeoffLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className="shrink-0" data-testid={`text-bakeoff-item-${log.id}`}>{log.itemName}</Badge>
                  <span className="text-sm" data-testid={`text-bakeoff-qty-${log.id}`}>x{log.quantity}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground" data-testid={`text-bakeoff-time-${log.id}`}>{log.bakedAt}</span>
                  {!isLocked && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteBakeoff.mutate(log.id)}
                      data-testid={`button-delete-bakeoff-${log.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
