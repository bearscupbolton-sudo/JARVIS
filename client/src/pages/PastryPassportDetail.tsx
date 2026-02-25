import { useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Plus, X, Image, Film, Upload, Stamp, Link2, Save, Trash2, Package, ExternalLink, DollarSign, AlertCircle } from "lucide-react";
import type { PastryItem, InventoryItem } from "@shared/schema";
import { Separator } from "@/components/ui/separator";

const PASSPORT_CATEGORIES = [
  "Bread",
  "Viennoiserie",
  "Component",
  "Gluten Free",
  "Cookies",
  "Muffin/Cake",
  "Mother",
] as const;

function EditableTextField({
  label,
  value,
  fieldName,
  passportId,
}: {
  label: string;
  value: string | null;
  fieldName: string;
  passportId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/pastry-passports/${passportId}`, { [fieldName]: text });
      queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', passportId] });
      setEditing(false);
      toast({ title: "Saved", description: `${label} updated successfully.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
          <Button variant="ghost" size="sm" onClick={() => { setText(value || ""); setEditing(true); }} data-testid={`button-edit-${fieldName}`}>
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>
        <p className="text-foreground whitespace-pre-wrap" data-testid={`text-${fieldName}`}>
          {value || <span className="text-muted-foreground italic">No content yet.</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[120px]"
        data-testid={`textarea-${fieldName}`}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving} data-testid={`button-save-${fieldName}`}>
          <Save className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(false)} data-testid={`button-cancel-${fieldName}`}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function PastryPassportDetail() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);

  const { data: passport, isLoading } = useQuery<any>({
    queryKey: ['/api/pastry-passports', params.id],
  });
  const { data: recipes } = useQuery<any[]>({ queryKey: ['/api/recipes'] });
  const { data: pastryItems } = useQuery<PastryItem[]>({ queryKey: ['/api/pastry-items'] });
  const { data: inventoryItems } = useQuery<InventoryItem[]>({ queryKey: ['/api/inventory'] });

  const { data: costData, isLoading: costLoading } = useQuery<any>({
    queryKey: ['/api/pastry-items', passport?.pastryItemId, 'cost'],
    queryFn: async () => {
      const res = await fetch(`/api/pastry-items/${passport.pastryItemId}/cost`);
      if (!res.ok) throw new Error('Failed to fetch cost data');
      return res.json();
    },
    enabled: !!passport?.pastryItemId,
  });

  const linkedPastryItem = passport?.pastryItemId ? pastryItems?.find(i => i.id === passport.pastryItemId) : null;

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editMotherRecipeId, setEditMotherRecipeId] = useState<string>("");
  const [editPrimaryRecipeId, setEditPrimaryRecipeId] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);

  const [addMediaDialogOpen, setAddMediaDialogOpen] = useState(false);
  const [mediaKind, setMediaKind] = useState<"photo" | "video">("photo");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [addingMedia, setAddingMedia] = useState(false);

  const [addComponentDialogOpen, setAddComponentDialogOpen] = useState(false);
  const [componentRecipeId, setComponentRecipeId] = useState<string>("");
  const [componentNotes, setComponentNotes] = useState("");
  const [addingComponent, setAddingComponent] = useState(false);

  const [addAddinDialogOpen, setAddAddinDialogOpen] = useState(false);
  const [addinName, setAddinName] = useState("");
  const [addinQuantity, setAddinQuantity] = useState("");
  const [addinUnit, setAddinUnit] = useState("");
  const [addinNotes, setAddinNotes] = useState("");
  const [addinInventoryItemId, setAddinInventoryItemId] = useState<string>("");
  const [addingAddin, setAddingAddin] = useState(false);

  const [uploading, setUploading] = useState(false);

  const openEditDialog = () => {
    if (!passport) return;
    setEditName(passport.name);
    setEditCategory(passport.category);
    setEditMotherRecipeId(passport.motherRecipeId ? String(passport.motherRecipeId) : "");
    setEditPrimaryRecipeId(passport.primaryRecipeId ? String(passport.primaryRecipeId) : "");
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    setEditSaving(true);
    try {
      await apiRequest("PUT", `/api/pastry-passports/${params.id}`, {
        name: editName,
        category: editCategory,
        motherRecipeId: editMotherRecipeId ? Number(editMotherRecipeId) : null,
        primaryRecipeId: editPrimaryRecipeId ? Number(editPrimaryRecipeId) : null,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
      setEditDialogOpen(false);
      toast({ title: "Updated", description: "Passport details updated." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max image size is 10MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await apiRequest("POST", `/api/pastry-passports/${params.id}/upload-photo`, { image: base64 });
        const data = await res.json();
        await apiRequest("PUT", `/api/pastry-passports/${params.id}`, { photoUrl: data.url });
        queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
        toast({ title: "Photo uploaded", description: "Passport photo updated." });
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleMediaPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max image size is 10MB.", variant: "destructive" });
      return;
    }
    setAddingMedia(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await apiRequest("POST", `/api/pastry-passports/${params.id}/upload-photo`, { image: base64 });
        const data = await res.json();
        await apiRequest("POST", `/api/pastry-passports/${params.id}/media`, { kind: "photo", url: data.url, caption: mediaCaption || undefined });
        queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
        toast({ title: "Media added", description: "Photo added to gallery." });
        setAddMediaDialogOpen(false);
        setMediaCaption("");
        setAddingMedia(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setAddingMedia(false);
    }
    if (mediaFileInputRef.current) mediaFileInputRef.current.value = "";
  };

  const handleAddVideoMedia = async () => {
    if (!mediaUrl.trim()) return;
    setAddingMedia(true);
    try {
      await apiRequest("POST", `/api/pastry-passports/${params.id}/media`, { kind: "video", url: mediaUrl, caption: mediaCaption || undefined });
      queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
      toast({ title: "Media added", description: "Video added to gallery." });
      setAddMediaDialogOpen(false);
      setMediaUrl("");
      setMediaCaption("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setAddingMedia(false);
    }
  };

  const handleDeleteMedia = async (mediaId: number) => {
    try {
      await apiRequest("DELETE", `/api/pastry-passports/${params.id}/media/${mediaId}`);
      queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
      toast({ title: "Deleted", description: "Media removed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleAddComponent = async () => {
    if (!componentRecipeId) return;
    setAddingComponent(true);
    try {
      await apiRequest("POST", `/api/pastry-passports/${params.id}/components`, {
        recipeId: Number(componentRecipeId),
        notes: componentNotes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
      toast({ title: "Component added", description: "Recipe component linked." });
      setAddComponentDialogOpen(false);
      setComponentRecipeId("");
      setComponentNotes("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setAddingComponent(false);
    }
  };

  const handleDeleteComponent = async (componentId: number) => {
    try {
      await apiRequest("DELETE", `/api/pastry-passports/${params.id}/components/${componentId}`);
      queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
      toast({ title: "Deleted", description: "Component removed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleAddAddin = async () => {
    if (!addinName.trim()) return;
    setAddingAddin(true);
    try {
      await apiRequest("POST", `/api/pastry-passports/${params.id}/addins`, {
        name: addinName,
        unit: addinUnit || undefined,
        quantity: addinQuantity ? Number(addinQuantity) : undefined,
        notes: addinNotes || undefined,
        inventoryItemId: addinInventoryItemId ? Number(addinInventoryItemId) : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
      toast({ title: "Ingredient added", description: "Add-in ingredient saved." });
      setAddAddinDialogOpen(false);
      setAddinName("");
      setAddinQuantity("");
      setAddinUnit("");
      setAddinNotes("");
      setAddinInventoryItemId("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setAddingAddin(false);
    }
  };

  const handleDeleteAddin = async (addinId: number) => {
    try {
      await apiRequest("DELETE", `/api/pastry-passports/${params.id}/addins/${addinId}`);
      queryClient.invalidateQueries({ queryKey: ['/api/pastry-passports', params.id] });
      toast({ title: "Deleted", description: "Add-in removed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Skeleton className="w-32 h-10" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!passport) {
    return (
      <div className="space-y-4">
        <Link href="/pastry-passports">
          <Button variant="ghost" className="gap-2 pl-0" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" /> Back to Passports
          </Button>
        </Link>
        <p className="text-center text-muted-foreground py-12" data-testid="text-not-found">Passport not found.</p>
      </div>
    );
  }

  const motherRecipe = passport.motherRecipeId && recipes?.find((r: any) => r.id === passport.motherRecipeId);
  const primaryRecipe = passport.primaryRecipeId && recipes?.find((r: any) => r.id === passport.primaryRecipeId);
  const componentRecipes = recipes?.filter((r: any) => r.category === "Component") || [];
  const media = passport.media || [];
  const components = passport.components || [];
  const addins = passport.addins || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link href="/pastry-passports">
        <Button variant="ghost" className="gap-2 pl-0" data-testid="button-back">
          <ArrowLeft className="w-4 h-4" /> Back to Passports
        </Button>
      </Link>

      <Card className="border-t-2 border-t-primary border-dashed" data-testid="card-passport-header">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-48 shrink-0 space-y-3">
              <div className="w-full aspect-square rounded-md bg-muted flex items-center justify-center overflow-hidden">
                {passport.photoUrl ? (
                  <img src={passport.photoUrl} alt={passport.name} className="w-full h-full object-cover" data-testid="img-passport-photo" />
                ) : (
                  <Image className="w-12 h-12 text-muted-foreground" />
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handlePhotoUpload}
                data-testid="input-photo-upload"
              />
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="button-upload-photo"
              >
                <Upload className="w-4 h-4" /> {uploading ? "Uploading..." : "Upload Photo"}
              </Button>
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="space-y-1">
                  <h1 className="text-3xl font-display font-bold" data-testid="text-passport-name">{passport.name}</h1>
                  <p className="font-mono text-sm text-muted-foreground" data-testid="text-passport-id">
                    PP-{String(passport.id).padStart(4, "0")}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={openEditDialog} data-testid="button-edit-passport">
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-mono text-xs uppercase tracking-wider" data-testid="badge-category">
                  <Stamp className="w-3 h-3 mr-1" /> {passport.category}
                </Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {linkedPastryItem && (
                  <Link href="/admin/pastry-items">
                    <Badge variant="secondary" className="gap-1 cursor-pointer" data-testid="badge-linked-pastry-item">
                      <Package className="w-3 h-3" /> {linkedPastryItem.doughType} Dough
                      {!linkedPastryItem.isActive && <span className="text-muted-foreground">(Inactive)</span>}
                      <ExternalLink className="w-3 h-3" />
                    </Badge>
                  </Link>
                )}
                {motherRecipe && (
                  <Link href={`/recipes/${motherRecipe.id}`}>
                    <Badge variant="outline" className="gap-1 cursor-pointer" data-testid="badge-mother-recipe">
                      <Link2 className="w-3 h-3" /> Mother Dough: {motherRecipe.title}
                    </Badge>
                  </Link>
                )}
                {primaryRecipe && (
                  <Link href={`/recipes/${primaryRecipe.id}`}>
                    <Badge variant="outline" className="gap-1 cursor-pointer" data-testid="badge-primary-recipe">
                      <Link2 className="w-3 h-3" /> Primary Recipe: {primaryRecipe.title}
                    </Badge>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-edit-passport">
          <DialogHeader>
            <DialogTitle>Edit Passport</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-name" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger data-testid="select-edit-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {PASSPORT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mother Dough Recipe</Label>
              <Select value={editMotherRecipeId} onValueChange={setEditMotherRecipeId}>
                <SelectTrigger data-testid="select-edit-mother-recipe">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {recipes?.filter((r: any) => r.category === "Mother").map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Primary Recipe</Label>
              <Select value={editPrimaryRecipeId} onValueChange={setEditPrimaryRecipeId}>
                <SelectTrigger data-testid="select-edit-primary-recipe">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {recipes?.map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">Cancel</Button>
              <Button onClick={handleEditSave} disabled={editSaving} data-testid="button-save-edit">
                {editSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="description" className="w-full" data-testid="tabs-passport">
        <TabsList className="w-full justify-start" data-testid="tabs-list">
          <TabsTrigger value="description" data-testid="tab-description">Description</TabsTrigger>
          <TabsTrigger value="assembly" data-testid="tab-assembly">Assembly</TabsTrigger>
          <TabsTrigger value="baking" data-testid="tab-baking">Baking</TabsTrigger>
          <TabsTrigger value="finish" data-testid="tab-finish">Finish</TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="space-y-6 mt-4">
          <Card>
            <CardContent className="p-6">
              <EditableTextField
                label="Description"
                value={passport.descriptionText}
                fieldName="descriptionText"
                passportId={params.id!}
              />
            </CardContent>
          </Card>

          <Card data-testid="card-media-gallery">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Media Gallery</h3>
                <Dialog open={addMediaDialogOpen} onOpenChange={setAddMediaDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="button-add-media">
                      <Plus className="w-4 h-4 mr-1" /> Add Media
                    </Button>
                  </DialogTrigger>
                  <DialogContent data-testid="dialog-add-media">
                    <DialogHeader>
                      <DialogTitle>Add Media</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={mediaKind} onValueChange={(v) => setMediaKind(v as "photo" | "video")}>
                          <SelectTrigger data-testid="select-media-kind">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="photo">Photo</SelectItem>
                            <SelectItem value="video">Video</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Caption (optional)</Label>
                        <Input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} placeholder="Caption" data-testid="input-media-caption" />
                      </div>
                      {mediaKind === "photo" ? (
                        <div className="space-y-2">
                          <input
                            type="file"
                            accept="image/*"
                            ref={mediaFileInputRef}
                            className="hidden"
                            onChange={handleMediaPhotoUpload}
                            data-testid="input-media-photo-upload"
                          />
                          <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => mediaFileInputRef.current?.click()}
                            disabled={addingMedia}
                            data-testid="button-upload-media-photo"
                          >
                            <Image className="w-4 h-4" /> {addingMedia ? "Uploading..." : "Choose Photo"}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Video URL</Label>
                          <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." data-testid="input-media-url" />
                          <Button onClick={handleAddVideoMedia} disabled={addingMedia || !mediaUrl.trim()} className="w-full" data-testid="button-add-video">
                            {addingMedia ? "Adding..." : "Add Video"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {media.length === 0 ? (
                <p className="text-muted-foreground text-sm italic" data-testid="text-no-media">No media yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {media.map((m: any) => (
                    <div key={m.id} className="relative group rounded-md overflow-hidden border border-border" data-testid={`media-item-${m.id}`}>
                      {m.kind === "photo" ? (
                        <img src={m.url} alt={m.caption || "Media"} className="w-full h-48 object-cover" data-testid={`img-media-${m.id}`} />
                      ) : (
                        <video src={m.url} controls className="w-full h-48 object-cover" data-testid={`video-media-${m.id}`} />
                      )}
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ visibility: "visible" }}
                        onClick={() => handleDeleteMedia(m.id)}
                        data-testid={`button-delete-media-${m.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      {m.caption && (
                        <p className="p-2 text-xs text-muted-foreground">{m.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assembly" className="space-y-6 mt-4">
          <Card>
            <CardContent className="p-6">
              <EditableTextField
                label="Assembly Instructions"
                value={passport.assemblyText}
                fieldName="assemblyText"
                passportId={params.id!}
              />
            </CardContent>
          </Card>

          <Card data-testid="card-components">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Package className="w-4 h-4 inline mr-1" /> Components
                </h3>
                <Dialog open={addComponentDialogOpen} onOpenChange={setAddComponentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="button-add-component">
                      <Plus className="w-4 h-4 mr-1" /> Add Component
                    </Button>
                  </DialogTrigger>
                  <DialogContent data-testid="dialog-add-component">
                    <DialogHeader>
                      <DialogTitle>Add Component Recipe</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Recipe</Label>
                        <Select value={componentRecipeId} onValueChange={setComponentRecipeId}>
                          <SelectTrigger data-testid="select-component-recipe">
                            <SelectValue placeholder="Select a component recipe" />
                          </SelectTrigger>
                          <SelectContent>
                            {componentRecipes.map((r: any) => (
                              <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes (optional)</Label>
                        <Input value={componentNotes} onChange={(e) => setComponentNotes(e.target.value)} placeholder="Notes" data-testid="input-component-notes" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setAddComponentDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddComponent} disabled={addingComponent || !componentRecipeId} data-testid="button-save-component">
                          {addingComponent ? "Adding..." : "Add Component"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {components.length === 0 ? (
                <p className="text-muted-foreground text-sm italic" data-testid="text-no-components">No components linked yet.</p>
              ) : (
                <div className="space-y-2">
                  {components.map((c: any) => {
                    const recipe = recipes?.find((r: any) => r.id === c.recipeId);
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/30 border border-border" data-testid={`component-item-${c.id}`}>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground" data-testid={`text-component-name-${c.id}`}>{recipe?.title || `Recipe #${c.recipeId}`}</p>
                          {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteComponent(c.id)} data-testid={`button-delete-component-${c.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-addins">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Add-ins / Store-Bought</h3>
                <Dialog open={addAddinDialogOpen} onOpenChange={setAddAddinDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="button-add-addin">
                      <Plus className="w-4 h-4 mr-1" /> Add Ingredient
                    </Button>
                  </DialogTrigger>
                  <DialogContent data-testid="dialog-add-addin">
                    <DialogHeader>
                      <DialogTitle>Add Ingredient</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Link to Inventory Item (optional)</Label>
                        <Select value={addinInventoryItemId} onValueChange={(val) => {
                          setAddinInventoryItemId(val === "none" ? "" : val);
                          if (val && val !== "none") {
                            const item = inventoryItems?.find(i => i.id === Number(val));
                            if (item) {
                              setAddinName(item.name);
                              if (item.unit) setAddinUnit(item.unit);
                            }
                          }
                        }}>
                          <SelectTrigger data-testid="select-addin-inventory-item">
                            <SelectValue placeholder="Select inventory item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {inventoryItems?.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                {item.name} {item.costPerUnit != null ? `($${item.costPerUnit.toFixed(2)}/${item.unit})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={addinName} onChange={(e) => setAddinName(e.target.value)} placeholder="Ingredient name" data-testid="input-addin-name" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Quantity</Label>
                          <Input type="number" value={addinQuantity} onChange={(e) => setAddinQuantity(e.target.value)} placeholder="Amount" data-testid="input-addin-quantity" />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit</Label>
                          <Input value={addinUnit} onChange={(e) => setAddinUnit(e.target.value)} placeholder="g, ml, etc." data-testid="input-addin-unit" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes (optional)</Label>
                        <Input value={addinNotes} onChange={(e) => setAddinNotes(e.target.value)} placeholder="Notes" data-testid="input-addin-notes" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setAddAddinDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddAddin} disabled={addingAddin || !addinName.trim()} data-testid="button-save-addin">
                          {addingAddin ? "Adding..." : "Add Ingredient"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {addins.length === 0 ? (
                <p className="text-muted-foreground text-sm italic" data-testid="text-no-addins">No add-ins yet.</p>
              ) : (
                <div className="space-y-2">
                  {addins.map((a: any) => {
                    const linkedInventory = a.inventoryItemId ? inventoryItems?.find(i => i.id === a.inventoryItemId) : null;
                    return (
                    <div key={a.id} className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/30 border border-border" data-testid={`addin-item-${a.id}`}>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground" data-testid={`text-addin-name-${a.id}`}>
                          {a.name}
                          {a.quantity != null && a.unit && <span className="text-muted-foreground ml-2 text-sm">{a.quantity} {a.unit}</span>}
                        </p>
                        {linkedInventory && linkedInventory.costPerUnit != null && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-addin-cost-${a.id}`}>
                            {"$"}{linkedInventory.costPerUnit.toFixed(2)}/{linkedInventory.unit}
                          </p>
                        )}
                        {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteAddin(a.id)} data-testid={`button-delete-addin-${a.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="baking" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <EditableTextField
                label="Baking Instructions"
                value={passport.bakingText}
                fieldName="bakingText"
                passportId={params.id!}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finish" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <EditableTextField
                label="Finishing Instructions"
                value={passport.finishText}
                fieldName="finishText"
                passportId={params.id!}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {passport?.pastryItemId && (
        <Card data-testid="card-cost-breakdown">
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0 pb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="text-lg">Cost Breakdown</CardTitle>
            </div>
            {costData && (
              <Badge
                variant={costData.dataCompleteness === "full" ? "default" : "secondary"}
                className={
                  costData.dataCompleteness === "full"
                    ? "bg-green-600 text-white"
                    : costData.dataCompleteness === "partial"
                    ? "bg-yellow-600 text-white"
                    : ""
                }
                data-testid="badge-data-completeness"
              >
                {costData.dataCompleteness === "full"
                  ? "Complete"
                  : costData.dataCompleteness === "partial"
                  ? "Partial Data"
                  : "No Data"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {costLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : !costData ? (
              <p className="text-muted-foreground text-sm italic" data-testid="text-no-cost-data">
                Unable to calculate costs.
              </p>
            ) : (
              <>
                <div className="space-y-2" data-testid="section-dough-cost">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dough</h4>
                  {costData.doughCost.costPerPiece != null ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm text-foreground" data-testid="text-dough-recipe">
                          {costData.doughCost.recipeName || "Mother Dough"}
                        </span>
                        <span className="font-mono text-sm font-medium" data-testid="text-dough-cost-per-piece">
                          ${costData.doughCost.costPerPiece.toFixed(2)}/pc
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground" data-testid="text-dough-allocation">
                        {costData.doughCost.allocationMethod === "weight"
                          ? `Allocated by weight (${costData.doughCost.weightPerPieceG}g/pc of ${costData.doughCost.doughWeightG}g batch)`
                          : costData.doughCost.allocationMethod === "equal"
                          ? `Split equally across ~${costData.doughCost.piecesFromDough} pieces`
                          : "No allocation data"}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertCircle className="w-4 h-4" />
                      <span data-testid="text-no-dough-cost">No dough cost data available</span>
                    </div>
                  )}
                </div>

                {costData.addinsCost.items.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2" data-testid="section-addins-cost">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Add-ins</h4>
                      <div className="space-y-1">
                        {costData.addinsCost.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`addin-cost-${idx}`}>
                            <span className="text-sm text-foreground">{item.name}</span>
                            <span className="font-mono text-sm text-muted-foreground">
                              {item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "No cost data"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {costData.componentsCost.items.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2" data-testid="section-components-cost">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Components</h4>
                      <div className="space-y-1">
                        {costData.componentsCost.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`component-cost-${idx}`}>
                            <span className="text-sm text-foreground">{item.recipeName}</span>
                            <span className="font-mono text-sm text-muted-foreground">
                              {item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "No cost data"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
          {costData?.totalCost != null && (
            <CardFooter className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2 w-full flex-wrap">
                <span className="text-sm font-semibold uppercase tracking-wider" data-testid="label-total-cogs">Total COGS</span>
                <span className="font-mono text-lg font-bold" data-testid="text-total-cogs">
                  ${costData.totalCost.toFixed(2)}
                </span>
              </div>
            </CardFooter>
          )}
        </Card>
      )}
    </div>
  );
}