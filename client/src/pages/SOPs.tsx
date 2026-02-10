import { useState } from "react";
import { useSOPs, useCreateSOP, useDeleteSOP } from "@/hooks/use-sops";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, BookOpen, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSopSchema, type InsertSOP } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import ReactMarkdown from "react-markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export default function SOPs() {
  const { data: sops, isLoading } = useSOPs();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Standard Operating Procedures</h1>
          <p className="text-muted-foreground">Technical specifications and safety guidelines.</p>
        </div>
        <CreateSOPDialog />
      </div>

      <div className="grid gap-6">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : sops?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No SOPs found. Create one to get started.</div>
        ) : (
          sops?.map(sop => <SOPCard key={sop.id} sop={sop} />)
        )}
      </div>
    </div>
  );
}

function SOPCard({ sop }: { sop: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const { mutate: deleteSOP } = useDeleteSOP();

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="industrial-card border-l-4 border-l-primary/40 overflow-hidden">
        <CollapsibleTrigger className="w-full text-left">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{sop.title}</h3>
                <span className="text-xs font-mono bg-accent/10 text-accent-foreground px-2 py-0.5 rounded">
                  {sop.category}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground">
              {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-6 pt-0 border-t border-border/50">
            <div className="prose prose-sm prose-slate max-w-none py-6">
              <ReactMarkdown>{sop.content}</ReactMarkdown>
            </div>
            <div className="flex justify-end pt-4 border-t border-border/50">
               <Button 
                 variant="ghost" 
                 size="sm" 
                 className="text-destructive hover:text-destructive hover:bg-destructive/10"
                 onClick={() => deleteSOP(sop.id)}
               >
                 <Trash2 className="w-4 h-4 mr-2" /> Delete SOP
               </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function CreateSOPDialog() {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useCreateSOP();

  const form = useForm<InsertSOP>({
    resolver: zodResolver(insertSopSchema),
    defaultValues: {
      title: "",
      category: "General",
      content: ""
    }
  });

  const onSubmit = (data: InsertSOP) => {
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
          <Plus className="w-4 h-4 mr-2" /> New SOP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Standard Operating Procedure</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Procedure Title" />
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
                    <FormControl>
                      <Input {...field} placeholder="e.g. Safety, Cleaning" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content (Markdown supported)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      className="min-h-[300px] font-mono text-sm" 
                      placeholder="# Steps\n1. Do this first..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Create SOP"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
