import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Mic, MicOff, Trash2, Share2, Pin, PinOff, Search,
  FileText, ChefHat, ClipboardList, Sparkles, ArrowLeft,
  MoreVertical, Loader2, Lock, Users, UserPlus, X, CalendarPlus,
} from "lucide-react";
import type { Note } from "@shared/schema";

type CollaboratorUser = { id: string; firstName: string | null; lastName: string | null; username: string | null; profileImageUrl: string | null };

function formatDate(date: string | Date | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function NoteEditor({
  note,
  onBack,
  isOwner,
}: {
  note: Note;
  onBack: () => void;
  isOwner: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [isShared, setIsShared] = useState(note.isShared);
  const [sharedWith, setSharedWith] = useState<string[]>((note.sharedWith as string[]) || []);
  const [showCollabDialog, setShowCollabDialog] = useState(false);
  const [collabSearch, setCollabSearch] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showGenerated, setShowGenerated] = useState(false);
  const [generatedContent, setGeneratedContent] = useState(note.generatedContent || "");
  const [generatedType, setGeneratedType] = useState(note.generatedType || "");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: allUsers } = useQuery<CollaboratorUser[]>({
    queryKey: ["/api/notes/collaborator-users"],
    enabled: isOwner,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Note>) =>
      apiRequest("PATCH", `/api/notes/${note.id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: (type: string) =>
      apiRequest("POST", `/api/notes/${note.id}/generate`, { type }),
    onSuccess: async (res) => {
      const data = await res.json();
      setGeneratedContent(data.generatedContent);
      setGeneratedType(data.type);
      setShowGenerated(true);
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({ title: "Document generated", description: `Your ${data.type} has been created by Jarvis.` });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const [, setLocation] = useLocation();

  const saveToSystemMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await apiRequest("POST", `/api/notes/${note.id}/generate/save`, { type });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      if (data.type === "recipe") {
        queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
        toast({ title: "Recipe created!", description: `"${data.title}" has been saved to your recipes.` });
      } else if (data.type === "sop") {
        queryClient.invalidateQueries({ queryKey: ["/api/sops"] });
        toast({ title: "SOP created!", description: `"${data.title}" has been saved to your SOPs.` });
      } else if (data.type === "event") {
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        toast({ title: `${data.count} event(s) created!`, description: `Added to your calendar: ${data.title}` });
      }
      setShowGenerated(false);
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const autoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const updates: any = { title, content };
      if (isOwner) {
        updates.isShared = isShared;
        updates.sharedWith = sharedWith;
      }
      updateMutation.mutate(updates);
    }, 1000);
  }, [title, content, isShared, sharedWith, isOwner]);

  useEffect(() => {
    autoSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [title, content, isShared, sharedWith, isOwner]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1]);
            };
            reader.readAsDataURL(blob);
          });
          const res = await apiRequest("POST", "/api/notes/transcribe", { audio: base64 });
          const data = await res.json();
          if (data.transcript) {
            setContent(prev => prev ? prev + "\n" + data.transcript : data.transcript);
            toast({ title: "Voice note added" });
          }
        } catch (err: any) {
          toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err: any) {
      toast({ title: "Microphone access denied", description: "Please allow microphone access to use voice notes.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  return (
    <div className="space-y-4" data-testid="note-editor">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-notes">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={(e) => {
            if (title === "Untitled Note") e.target.select();
          }}
          autoFocus={title === "Untitled Note"}
          className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0"
          placeholder="Note title..."
          data-testid="input-note-title"
        />
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {isOwner && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCollabDialog(true)}
                className="gap-1.5 h-8 text-xs"
                data-testid="button-manage-collaborators"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {sharedWith.length > 0 ? `${sharedWith.length} Collaborator${sharedWith.length > 1 ? "s" : ""}` : "Add People"}
              </Button>
              <div className="flex items-center gap-1.5">
                <Switch
                  id="shared"
                  checked={isShared}
                  onCheckedChange={setIsShared}
                  data-testid="switch-shared"
                />
                <Label htmlFor="shared" className="text-xs text-muted-foreground whitespace-nowrap">
                  {isShared ? <Share2 className="w-3.5 h-3.5 inline" /> : <Lock className="w-3.5 h-3.5 inline" />}
                  {isShared ? " Public" : " Private"}
                </Label>
              </div>
            </>
          )}
          {!isOwner && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Users className="w-3 h-3" /> Collaborator
            </Badge>
          )}
        </div>
      </div>

      <div className="relative">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start typing your note, or tap the mic to dictate..."
          className="min-h-[300px] resize-y text-sm leading-relaxed"
          data-testid="textarea-note-content"
        />
        <div className="absolute bottom-3 right-3 flex gap-2">
          {isTranscribing && (
            <Badge variant="secondary" className="animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin mr-1" /> Transcribing...
            </Badge>
          )}
          <Button
            variant={isRecording ? "destructive" : "outline"}
            size="icon"
            className="rounded-full h-10 w-10 shadow-md"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing}
            data-testid="button-voice-record"
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {isRecording && (
        <div className="flex items-center gap-2 text-destructive text-sm animate-pulse">
          <div className="w-2 h-2 rounded-full bg-destructive" />
          Recording... Tap mic to stop
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={generateMutation.isPending || !content.trim()} data-testid="button-generate">
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => generateMutation.mutate("recipe")} data-testid="menu-generate-recipe">
              <ChefHat className="w-4 h-4 mr-2" />
              Preview Recipe
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => saveToSystemMutation.mutate("recipe")} disabled={saveToSystemMutation.isPending} data-testid="menu-build-recipe">
              <ChefHat className="w-4 h-4 mr-2" />
              Build Recipe
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => generateMutation.mutate("sop")} data-testid="menu-generate-sop">
              <ClipboardList className="w-4 h-4 mr-2" />
              Preview SOP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => saveToSystemMutation.mutate("sop")} disabled={saveToSystemMutation.isPending} data-testid="menu-build-sop">
              <ClipboardList className="w-4 h-4 mr-2" />
              Build SOP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => generateMutation.mutate("event")} data-testid="menu-generate-event">
              <CalendarPlus className="w-4 h-4 mr-2" />
              Preview Events
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => saveToSystemMutation.mutate("event")} disabled={saveToSystemMutation.isPending} data-testid="menu-build-event">
              <CalendarPlus className="w-4 h-4 mr-2" />
              Build Events
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => generateMutation.mutate("letterhead")} data-testid="menu-generate-letterhead">
              <FileText className="w-4 h-4 mr-2" />
              Letter Head
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {(generatedContent || note.generatedContent) && (
          <Button
            variant="secondary"
            onClick={() => {
              setGeneratedContent(generatedContent || note.generatedContent || "");
              setGeneratedType(generatedType || note.generatedType || "");
              setShowGenerated(true);
            }}
            data-testid="button-view-generated"
          >
            <FileText className="w-4 h-4 mr-2" />
            View {generatedType || note.generatedType || "Document"}
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {updateMutation.isPending ? "Saving..." : `Updated ${formatDate(note.updatedAt)}`}
        </span>
      </div>

      <Dialog open={showGenerated} onOpenChange={setShowGenerated}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {generatedType === "recipe" && <ChefHat className="w-5 h-5" />}
              {generatedType === "sop" && <ClipboardList className="w-5 h-5" />}
              {generatedType === "event" && <CalendarPlus className="w-5 h-5" />}
              {generatedType === "letterhead" && <FileText className="w-5 h-5" />}
              Generated {generatedType === "letterhead" ? "Letter Head" : generatedType === "event" ? "Calendar Events" : generatedType?.toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap" data-testid="text-generated-content">
            {generatedContent}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText(generatedContent);
              toast({ title: "Copied to clipboard" });
            }} data-testid="button-copy-generated">
              Copy to Clipboard
            </Button>
            {generatedType === "recipe" && (
              <Button
                onClick={() => saveToSystemMutation.mutate("recipe")}
                disabled={saveToSystemMutation.isPending}
                className="gap-2"
                data-testid="button-save-as-recipe"
              >
                {saveToSystemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChefHat className="w-4 h-4" />}
                {saveToSystemMutation.isPending ? "Building Recipe..." : "Save to Recipes"}
              </Button>
            )}
            {generatedType === "sop" && (
              <Button
                onClick={() => saveToSystemMutation.mutate("sop")}
                disabled={saveToSystemMutation.isPending}
                className="gap-2"
                data-testid="button-save-as-sop"
              >
                {saveToSystemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                {saveToSystemMutation.isPending ? "Building SOP..." : "Save to SOPs"}
              </Button>
            )}
            {generatedType === "event" && (
              <Button
                onClick={() => saveToSystemMutation.mutate("event")}
                disabled={saveToSystemMutation.isPending}
                className="gap-2"
                data-testid="button-save-as-event"
              >
                {saveToSystemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
                {saveToSystemMutation.isPending ? "Creating Events..." : "Save to Calendar"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setShowGenerated(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isOwner && (
        <Dialog open={showCollabDialog} onOpenChange={setShowCollabDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Manage Collaborators
              </DialogTitle>
              <DialogDescription>
                Add team members who can edit this note with you.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Search team members..."
              value={collabSearch}
              onChange={(e) => setCollabSearch(e.target.value)}
              data-testid="input-collab-search"
            />
            {sharedWith.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="collab-chips">
                {sharedWith.map(uid => {
                  const u = allUsers?.find(u => u.id === uid);
                  const name = u ? (u.firstName || u.username || "User") : "Unknown";
                  return (
                    <Badge key={uid} variant="secondary" className="gap-1 pr-1" data-testid={`chip-collab-${uid}`}>
                      {name}
                      <button
                        onClick={() => setSharedWith(prev => prev.filter(id => id !== uid))}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        data-testid={`button-remove-collab-${uid}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            <div className="max-h-[240px] overflow-y-auto space-y-1" data-testid="collab-user-list">
              {(allUsers || [])
                .filter(u => u.id !== user?.id)
                .filter(u => {
                  if (!collabSearch.trim()) return true;
                  const q = collabSearch.toLowerCase();
                  return (u.firstName?.toLowerCase().includes(q) || u.lastName?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q));
                })
                .map(u => {
                  const isSelected = sharedWith.includes(u.id);
                  const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "User";
                  const initials = (u.firstName?.[0] || "") + (u.lastName?.[0] || "");
                  return (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                      onClick={() => {
                        if (isSelected) {
                          setSharedWith(prev => prev.filter(id => id !== u.id));
                        } else {
                          setSharedWith(prev => [...prev, u.id]);
                        }
                      }}
                      data-testid={`collab-user-${u.id}`}
                    >
                      <Checkbox checked={isSelected} />
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px]">{initials || "?"}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm flex-1">{displayName}</span>
                    </div>
                  );
                })}
            </div>
            <DialogFooter>
              <Button onClick={() => setShowCollabDialog(false)} data-testid="button-close-collab-dialog">Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {sharedWith.length > 0 && isOwner && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          <Users className="w-3.5 h-3.5" />
          <span>Shared with {sharedWith.length} collaborator{sharedWith.length > 1 ? "s" : ""} who can edit this note</span>
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onClick,
  onDelete,
  onTogglePin,
  isOwner,
  isCollaborator,
}: {
  note: Note;
  onClick: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  isOwner: boolean;
  isCollaborator?: boolean;
}) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/40 transition-colors group"
      onClick={onClick}
      data-testid={`card-note-${note.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {note.isPinned && <Pin className="w-3.5 h-3.5 text-primary shrink-0" />}
              <h3 className="font-medium truncate text-sm" data-testid={`text-note-title-${note.id}`}>
                {note.title || "Untitled"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {note.content || "Empty note"}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-muted-foreground">
                {formatDate(note.updatedAt)}
              </span>
              {note.isShared && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  <Share2 className="w-2.5 h-2.5 mr-0.5" /> Public
                </Badge>
              )}
              {isCollaborator && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                  <Users className="w-2.5 h-2.5 mr-0.5" /> Collaborator
                </Badge>
              )}
              {!isCollaborator && note.sharedWith && Array.isArray(note.sharedWith) && note.sharedWith.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  <Users className="w-2.5 h-2.5 mr-0.5" /> {note.sharedWith.length} collaborator{note.sharedWith.length > 1 ? "s" : ""}
                </Badge>
              )}
              {note.generatedType && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  <Sparkles className="w-2.5 h-2.5 mr-0.5" /> {note.generatedType}
                </Badge>
              )}
            </div>
          </div>
          {isOwner && onDelete && onTogglePin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" data-testid={`button-note-menu-${note.id}`}>
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={onTogglePin} data-testid={`menu-pin-${note.id}`}>
                  {note.isPinned ? <PinOff className="w-4 h-4 mr-2" /> : <Pin className="w-4 h-4 mr-2" />}
                  {note.isPinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive" data-testid={`menu-delete-${note.id}`}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Notes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState("my");

  const { data, isLoading } = useQuery<{ myNotes: Note[]; sharedNotes: Note[] }>({
    queryKey: ["/api/notes"],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/notes", { title: "Untitled Note", content: "" }),
    onSuccess: async (res) => {
      const note = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setActiveNote(note);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({ title: "Note deleted" });
    },
  });

  const pinMutation = useMutation({
    mutationFn: (note: Note) =>
      apiRequest("PATCH", `/api/notes/${note.id}`, { isPinned: !note.isPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
    },
  });

  const myNotes = data?.myNotes || [];
  const sharedNotes = data?.sharedNotes || [];

  const filterNotes = (notes: Note[]) => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(n =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  };

  const sortNotes = (notes: Note[]) => {
    return [...notes].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
  };

  const displayMyNotes = sortNotes(filterNotes(myNotes));
  const displaySharedNotes = sortNotes(filterNotes(sharedNotes));

  if (activeNote) {
    const noteIsOwned = activeNote.userId === user?.id;
    return (
      <div className="max-w-3xl mx-auto p-4">
        <NoteEditor
          key={activeNote.id}
          note={activeNote}
          isOwner={noteIsOwned}
          onBack={() => {
            setActiveNote(null);
            queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" data-testid="notes-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" data-testid="text-notes-heading">Notes</h1>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-new-note">
          <Plus className="w-4 h-4 mr-2" />
          New Note
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-notes"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="my" className="flex-1" data-testid="tab-my-notes">
            My Notes ({myNotes.length})
          </TabsTrigger>
          <TabsTrigger value="shared" className="flex-1" data-testid="tab-shared-notes">
            Shared ({sharedNotes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayMyNotes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">
                  {searchQuery ? "No notes match your search" : "No notes yet. Create one to get started!"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {displayMyNotes.map(note => {
                const owned = note.userId === user?.id;
                return (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onClick={() => setActiveNote(note)}
                    onDelete={() => owned ? deleteMutation.mutate(note.id) : undefined}
                    onTogglePin={() => owned ? pinMutation.mutate(note) : undefined}
                    isOwner={owned}
                    isCollaborator={!owned}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="shared" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : displaySharedNotes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Share2 className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">
                  {searchQuery ? "No shared notes match your search" : "No shared notes from team members yet."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {displaySharedNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onClick={() => setActiveNote(note)}
                  onDelete={() => {}}
                  onTogglePin={() => {}}
                  isOwner={false}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
