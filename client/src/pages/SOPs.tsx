import { useState, useRef } from "react";
import { useSOPs, useCreateSOP, useDeleteSOP } from "@/hooks/use-sops";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, BookOpen, Trash2, ChevronDown, ChevronUp, Camera, Loader2, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSopSchema, type InsertSOP } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import ReactMarkdown from "react-markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiRequest } from "@/lib/queryClient";

export default function SOPs() {
  const { data: sops, isLoading } = useSOPs();
  const { user } = useAuth();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-display font-bold">Standard Operating Procedures</h1>
          <p className="text-muted-foreground">Technical specifications and safety guidelines.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!user?.locked && <ScanSOPDialog />}
          <CreateSOPDialog />
        </div>
      </div>

      {user?.locked && (
        <div className="bg-muted border border-border rounded-lg p-3 text-sm text-muted-foreground">
          Your account is read-only. You can view SOPs but cannot make changes.
        </div>
      )}

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
  const { user } = useAuth();

  const handlePrint = () => {
    const escapeHtml = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const safeTitle = escapeHtml(sop.title);
    const safeCategory = escapeHtml(sop.category);
    const updatedLabel = sop.updatedAt ? new Date(sop.updatedAt).toLocaleDateString() : "N/A";

    const markdownToHtml = (md: string): string => {
      const lines = md.split("\n");
      let html = "";
      let inOl = false;
      let inUl = false;
      for (const raw of lines) {
        const line = raw.trimEnd();
        const olMatch = line.match(/^\d+\.\s+(.*)/);
        const ulMatch = line.match(/^[-*]\s+(.*)/);
        if (olMatch) {
          if (inUl) { html += "</ul>"; inUl = false; }
          if (!inOl) { html += "<ol>"; inOl = true; }
          html += `<li>${escapeHtml(olMatch[1]).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`;
          continue;
        }
        if (ulMatch) {
          if (inOl) { html += "</ol>"; inOl = false; }
          if (!inUl) { html += "<ul>"; inUl = true; }
          html += `<li>${escapeHtml(ulMatch[1]).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`;
          continue;
        }
        if (inOl) { html += "</ol>"; inOl = false; }
        if (inUl) { html += "</ul>"; inUl = false; }
        if (line.startsWith("### ")) html += `<h3>${escapeHtml(line.slice(4))}</h3>`;
        else if (line.startsWith("## ")) html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
        else if (line.startsWith("# ")) html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
        else if (line.trim() === "") html += "<br>";
        else html += `<p>${escapeHtml(line).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`;
      }
      if (inOl) html += "</ol>";
      if (inUl) html += "</ul>";
      return html;
    };

    const contentHtml = markdownToHtml(sop.content);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${safeTitle} - Bear's Cup Bakehouse SOP</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; line-height: 1.6; }
.header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 24px; }
.header h1 { margin: 0 0 4px 0; font-size: 24px; }
.header .meta { font-size: 13px; color: #666; }
.category { display: inline-block; background: #f0f0f0; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
h2 { font-size: 18px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
h3 { font-size: 15px; margin-top: 18px; }
p { margin: 4px 0; }
ol, ul { padding-left: 24px; }
li { margin-bottom: 6px; }
strong { color: #000; }
.footer { border-top: 1px solid #ccc; margin-top: 40px; padding-top: 12px; font-size: 11px; color: #999; text-align: center; }
@media print { body { padding: 0; } }
</style></head>
<body>
<div class="header"><h1>${safeTitle}</h1><div class="meta"><span class="category">${safeCategory}</span> &middot; Bear's Cup Bakehouse &middot; Last updated: ${updatedLabel}</div></div>
<div>${contentHtml}</div>
<div class="footer">Bear's Cup Bakehouse &mdash; Standard Operating Procedure</div>
<script>window.print();<\/script>
</body></html>`);
    printWindow.document.close();
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="industrial-card overflow-hidden">
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
            <div className="flex justify-between items-center pt-4 border-t border-border/50 flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                data-testid={`button-print-sop-${sop.id}`}
              >
                <Printer className="w-4 h-4 mr-2" /> Print / Export
              </Button>
              {user?.role === "owner" && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive"
                  onClick={() => deleteSOP(sop.id)}
                  data-testid={`button-delete-sop-${sop.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete SOP
                </Button>
              )}
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
  const { user } = useAuth();
  const { toast } = useToast();

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
      onSuccess: (result) => {
        setOpen(false);
        form.reset();
        if (result.pending) {
          toast({ title: "Submitted for approval", description: "Your SOP will be reviewed by the owner before it goes live." });
        } else {
          toast({ title: "SOP created" });
        }
      }
    });
  };

  if (user?.locked) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/20" data-testid="button-create-sop">
          <Plus className="w-4 h-4 mr-2" /> New SOP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Standard Operating Procedure</DialogTitle>
          <DialogDescription>Write a new SOP from scratch using Markdown formatting.</DialogDescription>
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

function ScanSOPDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "scanning" | "review">("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<{ title: string; category: string; content: string } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate: createSOP, isPending: saving } = useCreateSOP();
  const { toast } = useToast();

  const resetState = () => {
    setStep("upload");
    setImagePreview(null);
    setScannedData(null);
    setEditTitle("");
    setEditCategory("");
    setEditContent("");
    setPreviewMode(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Image is too large (max 20MB)", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setImagePreview(base64);
      setStep("scanning");

      try {
        const res = await apiRequest("POST", "/api/sops/scan", { image: base64 });
        const data = await res.json();
        setScannedData(data);
        setEditTitle(data.title);
        setEditCategory(data.category);
        setEditContent(data.content);
        setStep("review");
      } catch (err: any) {
        toast({ title: "Failed to scan SOP", description: err.message, variant: "destructive" });
        setStep("upload");
        setImagePreview(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!editTitle.trim() || !editContent.trim()) {
      toast({ title: "Title and content are required", variant: "destructive" });
      return;
    }
    createSOP(
      { title: editTitle.trim(), category: editCategory.trim() || "General", content: editContent.trim() },
      {
        onSuccess: (result) => {
          resetState();
          setOpen(false);
          if (result.pending) {
            toast({ title: "Submitted for approval", description: "Your scanned SOP will be reviewed by the owner." });
          } else {
            toast({ title: "SOP created from scan!" });
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-scan-sop">
          <Camera className="w-4 h-4 mr-2" /> Scan SOP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Scan an Existing SOP"}
            {step === "scanning" && "Reading Your SOP..."}
            {step === "review" && "Review Scanned SOP"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Take a photo or upload an image of your existing SOP. Jarvis will read it and create a clean, uniform digital version."}
            {step === "scanning" && "Jarvis is reading and formatting your SOP. This may take a moment."}
            {step === "review" && "Review and edit the scanned SOP below. Make any corrections needed, then save."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover-elevate"
              onClick={() => fileInputRef.current?.click()}
              data-testid="drop-zone-sop-scan"
            >
              <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium">Tap to take a photo or upload an image</p>
              <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, HEIC up to 20MB</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-sop-scan-file"
            />
          </div>
        )}

        {step === "scanning" && (
          <div className="text-center py-12 space-y-4">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Jarvis is reading your SOP...</p>
              <p className="text-xs text-muted-foreground mt-1">Converting to a clean, uniform format</p>
            </div>
            {imagePreview && (
              <img src={imagePreview} alt="Uploaded SOP" className="max-h-48 mx-auto rounded-md border border-border mt-4 object-contain" />
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="SOP Title"
                  data-testid="input-scan-sop-title"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <Input
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  placeholder="e.g. Safety, Cleaning"
                  data-testid="input-scan-sop-category"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Content</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewMode(!previewMode)}
                  data-testid="button-toggle-preview"
                >
                  {previewMode ? "Edit" : "Preview"}
                </Button>
              </div>
              {previewMode ? (
                <div className="border border-border rounded-md p-4 min-h-[300px] max-h-[400px] overflow-y-auto prose prose-sm prose-slate max-w-none">
                  <ReactMarkdown>{editContent}</ReactMarkdown>
                </div>
              ) : (
                <Textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="min-h-[300px] max-h-[400px] font-mono text-sm"
                  placeholder="SOP content in Markdown..."
                  data-testid="textarea-scan-sop-content"
                />
              )}
            </div>

            <div className="flex justify-between gap-3 flex-wrap">
              <Button variant="outline" onClick={() => { resetState(); }} data-testid="button-scan-again">
                <Camera className="w-4 h-4 mr-2" /> Scan Another
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setOpen(false); resetState(); }}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving} data-testid="button-save-scanned-sop">
                  {saving ? "Saving..." : "Save SOP"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
