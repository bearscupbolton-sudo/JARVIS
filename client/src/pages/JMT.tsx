import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Monitor, Upload, Image, Trash2, ExternalLink, RefreshCw,
  Sparkles, Tv, Settings2, Eye, EyeOff, RotateCw,
  Grid3X3, List, ChevronDown, ChevronUp, Zap,
  Copy, AlertTriangle, CheckCircle2, Clock, Tag,
} from "lucide-react";
import type { JmtMenu, JmtDisplay } from "@shared/schema";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "drinks", label: "Drinks" },
  { value: "pastries", label: "Pastries" },
  { value: "specials", label: "Specials" },
  { value: "seasonal", label: "Seasonal" },
  { value: "catering", label: "Catering" },
];

const ORIENTATIONS = [
  { value: "portrait", label: "Portrait (9:16)" },
  { value: "landscape", label: "Landscape (16:9)" },
];

const ROTATIONS = [
  { value: "0", label: "No Rotation" },
  { value: "90", label: "Rotate 90° CW" },
  { value: "-90", label: "Rotate 90° CCW" },
  { value: "180", label: "Rotate 180°" },
];

export default function JMT() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"command" | "library" | "displays" | "jarvis">("command");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editMenu, setEditMenu] = useState<JmtMenu | null>(null);
  const [assignDialog, setAssignDialog] = useState<JmtDisplay | null>(null);
  const [previewMenu, setPreviewMenu] = useState<JmtMenu | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: menus = [], isLoading: loadingMenus } = useQuery<JmtMenu[]>({
    queryKey: ["/api/jmt/menus"],
  });

  const { data: displays = [], isLoading: loadingDisplays } = useQuery<JmtDisplay[]>({
    queryKey: ["/api/jmt/displays"],
  });

  const isOwner = user?.role === "owner";
  const isManager = user?.role === "manager" || isOwner;

  const liveDisplays = displays.filter(d => d.isLive);
  const unassignedDisplays = displays.filter(d => !d.menuId);
  const activeMenus = menus.filter(m => m.isActive);

  const tabs = [
    { id: "command" as const, label: "Command Center", icon: Monitor },
    { id: "library" as const, label: "Menu Library", icon: Image },
    { id: "displays" as const, label: "Display Matrix", icon: Grid3X3 },
    { id: "jarvis" as const, label: "Jarvis Recommends", icon: Sparkles },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6" data-testid="container-jmt">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-jmt-title">
            <Tv className="w-6 h-6 text-primary" />
            Jarvis Menu Theater
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Creative command center for all things menu display
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5" data-testid="badge-live-count">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {liveDisplays.length} Live
          </Badge>
          <Badge variant="secondary" data-testid="badge-menu-count">
            {activeMenus.length} Menus
          </Badge>
          {isManager && (
            <Button size="sm" onClick={() => setUploadOpen(true)} data-testid="button-upload-menu">
              <Upload className="w-4 h-4 mr-1.5" />
              Upload Menu
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg" data-testid="container-jmt-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
              activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "command" && (
        <CommandCenter displays={displays} menus={menus} loading={loadingDisplays || loadingMenus} />
      )}
      {activeTab === "library" && (
        <MenuLibrary
          menus={menus}
          loading={loadingMenus}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onEdit={setEditMenu}
          onPreview={setPreviewMenu}
          isManager={isManager}
          isOwner={isOwner}
        />
      )}
      {activeTab === "displays" && (
        <DisplayMatrix
          displays={displays}
          menus={menus}
          loading={loadingDisplays}
          onAssign={setAssignDialog}
          isManager={isManager}
        />
      )}
      {activeTab === "jarvis" && (
        <JarvisRecommends />
      )}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <EditMenuDialog menu={editMenu} onClose={() => setEditMenu(null)} />
      <AssignDialog display={assignDialog} menus={menus} onClose={() => setAssignDialog(null)} />
      <PreviewDialog menu={previewMenu} onClose={() => setPreviewMenu(null)} />
    </div>
  );
}

function CommandCenter({ displays, menus, loading }: { displays: JmtDisplay[]; menus: JmtMenu[]; loading: boolean }) {
  if (loading) return <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;

  const liveDisplays = displays.filter(d => d.isLive);
  const menuMap = new Map(menus.map(m => [m.id, m]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-primary" data-testid="stat-total-displays">{displays.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Displays</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-emerald-600" data-testid="stat-live-displays">{liveDisplays.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Live Now</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-blue-600" data-testid="stat-total-menus">{menus.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Menu Designs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-amber-600" data-testid="stat-standby">{displays.filter(d => !d.isLive).length}</div>
            <div className="text-xs text-muted-foreground mt-1">On Standby</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-500" />
            Live Displays
          </CardTitle>
        </CardHeader>
        <CardContent>
          {liveDisplays.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No displays are live. Go to Display Matrix to publish.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {liveDisplays.map(display => {
                const menu = display.menuId ? menuMap.get(display.menuId) : null;
                return (
                  <div key={display.id} className="flex items-center gap-3 p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20" data-testid={`card-live-display-${display.slotNumber}`}>
                    <div className="w-12 h-16 rounded bg-muted flex-shrink-0 overflow-hidden">
                      {menu?.thumbnailUrl ? (
                        <img src={menu.thumbnailUrl} alt={menu.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Tv className="w-5 h-5 text-muted-foreground" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-sm font-medium truncate">{display.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{menu?.name || "No menu"}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px] h-4 px-1">/menu/{display.slotNumber}</Badge>
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{display.orientation}</Badge>
                      </div>
                    </div>
                    <a
                      href={`/menu/${display.slotNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0"
                    >
                      <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Quick Links
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {displays.slice(0, 15).map(d => (
              <a
                key={d.id}
                href={`/menu/${d.slotNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                  d.isLive ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10" : "border-border hover:bg-muted"
                }`}
                data-testid={`link-display-${d.slotNumber}`}
              >
                <Monitor className={`w-3.5 h-3.5 ${d.isLive ? "text-emerald-500" : "text-muted-foreground"}`} />
                <span className="truncate">{d.name}</span>
                {d.isLive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-auto flex-shrink-0" />}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MenuLibrary({ menus, loading, viewMode, setViewMode, onEdit, onPreview, isManager, isOwner }: {
  menus: JmtMenu[]; loading: boolean; viewMode: "grid" | "list"; setViewMode: (v: "grid" | "list") => void;
  onEdit: (m: JmtMenu) => void; onPreview: (m: JmtMenu) => void; isManager: boolean; isOwner: boolean;
}) {
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/jmt/menus/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jmt/menus"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jmt/displays"] });
      toast({ title: "Menu Deleted" });
    },
  });

  const filtered = filter === "all" ? menus : menus.filter(m => m.category === filter);

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-menu-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} menu{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded ${viewMode === "grid" ? "bg-muted" : ""}`} data-testid="button-view-grid">
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setViewMode("list")} className={`p-1.5 rounded ${viewMode === "list" ? "bg-muted" : ""}`} data-testid="button-view-list">
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Image className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No menus yet. Upload your first design.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(menu => (
            <Card key={menu.id} className="overflow-hidden group cursor-pointer hover:shadow-md transition-shadow" data-testid={`card-menu-${menu.id}`}>
              <div className="aspect-[3/4] relative bg-muted overflow-hidden" onClick={() => onPreview(menu)}>
                {menu.thumbnailUrl ? (
                  <img src={menu.thumbnailUrl} alt={menu.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : menu.imageUrl ? (
                  <img src={menu.imageUrl} alt={menu.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Image className="w-10 h-10 text-muted-foreground" /></div>
                )}
                {!menu.isActive && (
                  <div className="absolute top-2 right-2"><Badge variant="secondary" className="text-[10px]">Inactive</Badge></div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); onEdit(menu); }}>
                      <Settings2 className="w-3 h-3 mr-1" />Edit
                    </Button>
                    <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onPreview(menu); }}>
                      <Eye className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="text-sm font-medium truncate" data-testid={`text-menu-name-${menu.id}`}>{menu.name}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{menu.category}</Badge>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{menu.orientation}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(menu => (
            <div key={menu.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors" data-testid={`row-menu-${menu.id}`}>
              <div className="w-12 h-16 rounded bg-muted flex-shrink-0 overflow-hidden">
                {menu.thumbnailUrl ? (
                  <img src={menu.thumbnailUrl} alt={menu.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Image className="w-5 h-5 text-muted-foreground" /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{menu.name}</p>
                {menu.description && <p className="text-xs text-muted-foreground truncate">{menu.description}</p>}
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{menu.category}</Badge>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{menu.orientation}</Badge>
                  {!menu.isActive && <Badge variant="secondary" className="text-[10px] h-4">Inactive</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onPreview(menu)}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                {isManager && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(menu)}>
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                {isOwner && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(menu.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DisplayMatrix({ displays, menus, loading, onAssign, isManager }: {
  displays: JmtDisplay[]; menus: JmtMenu[]; loading: boolean; onAssign: (d: JmtDisplay) => void; isManager: boolean;
}) {
  const { toast } = useToast();
  const menuMap = new Map(menus.map(m => [m.id, m]));

  const toggleLiveMutation = useMutation({
    mutationFn: async ({ id, isLive }: { id: number; isLive: boolean }) => {
      await apiRequest("PATCH", `/api/jmt/displays/${id}`, { isLive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jmt/displays"] });
      toast({ title: "Display Updated" });
    },
  });

  if (loading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage all 15 display slots. Assign menus, configure orientation, and go live.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displays.map(display => {
          const menu = display.menuId ? menuMap.get(display.menuId) : null;
          return (
            <Card key={display.id} className={`overflow-hidden transition-all ${display.isLive ? "ring-2 ring-emerald-500/50" : ""}`} data-testid={`card-display-${display.slotNumber}`}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Monitor className={`w-4 h-4 ${display.isLive ? "text-emerald-500" : "text-muted-foreground"}`} />
                    {display.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">/menu/{display.slotNumber}</Badge>
                    {display.isLive && (
                      <Badge className="text-[10px] h-4 px-1.5 bg-emerald-500 hover:bg-emerald-600">LIVE</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                <div className="aspect-video rounded-md bg-muted overflow-hidden flex items-center justify-center border">
                  {menu?.thumbnailUrl ? (
                    <img src={menu.thumbnailUrl} alt={menu.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center py-4">
                      <Tv className="w-8 h-8 text-muted-foreground/30 mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">No menu assigned</p>
                    </div>
                  )}
                </div>

                {menu && <p className="text-xs text-muted-foreground truncate">Showing: {menu.name}</p>}

                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{display.orientation}</Badge>
                  {display.rotationDeg !== 0 && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{display.rotationDeg}°</Badge>}
                  {display.showEightySixed && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-300 text-red-600">86'd overlay</Badge>}
                  {display.scheduleEnabled && display.scheduleStart && display.scheduleEnd && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-300 text-blue-600">
                      <Clock className="w-2.5 h-2.5 mr-0.5" />{display.scheduleStart}–{display.scheduleEnd}
                    </Badge>
                  )}
                </div>

                {isManager && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => onAssign(display)} data-testid={`button-assign-${display.slotNumber}`}>
                      <Settings2 className="w-3 h-3 mr-1" />
                      Configure
                    </Button>
                    <Button
                      size="sm"
                      variant={display.isLive ? "destructive" : "default"}
                      className="h-7 text-xs"
                      disabled={!display.menuId && !display.isLive}
                      onClick={() => toggleLiveMutation.mutate({ id: display.id, isLive: !display.isLive })}
                      data-testid={`button-toggle-live-${display.slotNumber}`}
                    >
                      {display.isLive ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                      {display.isLive ? "Take Offline" : "Go Live"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function JarvisRecommends() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [recommendation, setRecommendation] = useState<string | null>(null);

  const recommendMutation = useMutation({
    mutationFn: async (context: string) => {
      const res = await apiRequest("POST", "/api/jmt/jarvis-recommend", { context });
      return res.json();
    },
    onSuccess: (data) => {
      setRecommendation(data.recommendation);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const quickPrompts = [
    "What should I display during the morning rush?",
    "We just 86'd three items — what menu changes should I make?",
    "Recommend a seasonal menu rotation for this week.",
    "How should I optimize my display layout for upselling?",
    "We're launching a new special tomorrow. Menu strategy?",
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Ask Jarvis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ask Jarvis about menu strategy, display optimization, seasonal rotations..."
            className="min-h-[80px] text-sm"
            data-testid="input-jarvis-prompt"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => recommendMutation.mutate(prompt)}
              disabled={recommendMutation.isPending}
              data-testid="button-jarvis-recommend"
            >
              {recommendMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
              {recommendMutation.isPending ? "Thinking..." : "Get Recommendation"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickPrompts.map((qp, i) => (
              <button
                key={i}
                onClick={() => { setPrompt(qp); recommendMutation.mutate(qp); }}
                className="text-[11px] px-2.5 py-1 rounded-full border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                data-testid={`button-quick-prompt-${i}`}
              >
                {qp}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {recommendation && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <img src="/bear-logo.png" alt="Jarvis" className="w-8 h-8 rounded-full border-2 border-primary/30 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary mb-2">Jarvis</p>
                <div className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-jarvis-recommendation">
                  {recommendation}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [orientation, setOrientation] = useState("portrait");
  const [category, setCategory] = useState("general");
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!name) setName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, [name]);

  const handleUpload = async () => {
    if (!preview || !name) return;
    setUploading(true);
    try {
      await apiRequest("POST", "/api/jmt/menus", {
        name, description, imageData: preview, orientation, category,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jmt/menus"] });
      toast({ title: "Menu Uploaded", description: `"${name}" is ready to assign.` });
      setName(""); setDescription(""); setPreview(null); setOrientation("portrait"); setCategory("general");
      onClose();
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Upload Menu Design</DialogTitle>
          <DialogDescription>Upload a menu image from Canva or any design tool.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
            data-testid="dropzone-upload"
          >
            {preview ? (
              <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded" />
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Click to select an image</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or WebP up to 15MB</p>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid="input-file-upload" />
          </div>
          <Input placeholder="Menu name" value={name} onChange={e => setName(e.target.value)} data-testid="input-menu-name" />
          <Textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} className="min-h-[60px]" data-testid="input-menu-description" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Orientation</label>
              <Select value={orientation} onValueChange={setOrientation}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-orientation"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIENTATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" onClick={handleUpload} disabled={!preview || !name || uploading} data-testid="button-confirm-upload">
            {uploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploading ? "Uploading..." : "Upload Menu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditMenuDialog({ menu, onClose }: { menu: JmtMenu | null; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [orientation, setOrientation] = useState("portrait");
  const [category, setCategory] = useState("general");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (menu) {
      setName(menu.name);
      setDescription(menu.description || "");
      setOrientation(menu.orientation);
      setCategory(menu.category);
      setIsActive(menu.isActive);
    }
  }, [menu]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!menu) return;
      await apiRequest("PATCH", `/api/jmt/menus/${menu.id}`, { name, description, orientation, category, isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jmt/menus"] });
      toast({ title: "Menu Updated" });
      onClose();
    },
  });

  if (!menu) return null;

  return (
    <Dialog open={!!menu} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Menu</DialogTitle>
          <DialogDescription>Update the details for "{menu.name}"</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" data-testid="input-edit-name" />
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className="min-h-[60px]" data-testid="input-edit-description" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Orientation</label>
              <Select value={orientation} onValueChange={setOrientation}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIENTATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <span className="text-sm">Active</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-active" />
          </div>
          <Button className="w-full" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-edit">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ display, menus, onClose }: { display: JmtDisplay | null; menus: JmtMenu[]; onClose: () => void }) {
  const { toast } = useToast();
  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  const [orientation, setOrientation] = useState("portrait");
  const [rotationDeg, setRotationDeg] = useState("0");
  const [showEightySixed, setShowEightySixed] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [refreshInterval, setRefreshInterval] = useState("0");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleStart, setScheduleStart] = useState("06:00");
  const [scheduleEnd, setScheduleEnd] = useState("20:00");

  useEffect(() => {
    if (display) {
      setSelectedMenuId(display.menuId ? String(display.menuId) : "");
      setOrientation(display.orientation);
      setRotationDeg(String(display.rotationDeg));
      setShowEightySixed(display.showEightySixed);
      setDisplayName(display.name);
      setRefreshInterval(String(display.refreshInterval || 0));
      setScheduleEnabled(display.scheduleEnabled ?? false);
      setScheduleStart(display.scheduleStart || "06:00");
      setScheduleEnd(display.scheduleEnd || "20:00");
    }
  }, [display]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!display) return;
      await apiRequest("PATCH", `/api/jmt/displays/${display.id}`, {
        name: displayName,
        menuId: selectedMenuId && selectedMenuId !== "none" ? parseInt(selectedMenuId) : null,
        orientation,
        rotationDeg: parseInt(rotationDeg),
        showEightySixed,
        refreshInterval: parseInt(refreshInterval),
        scheduleEnabled,
        scheduleStart: scheduleEnabled ? scheduleStart : null,
        scheduleEnd: scheduleEnabled ? scheduleEnd : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jmt/displays"] });
      toast({ title: "Display Configured" });
      onClose();
    },
  });

  if (!display) return null;

  return (
    <Dialog open={!!display} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="w-5 h-5" />
            Configure Display {display.slotNumber}
          </DialogTitle>
          <DialogDescription>Set up /menu/{display.slotNumber} for your TV</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g., Front Counter Left" data-testid="input-display-name" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Assigned Menu</label>
            <Select value={selectedMenuId} onValueChange={setSelectedMenuId}>
              <SelectTrigger className="h-9" data-testid="select-assign-menu">
                <SelectValue placeholder="Select a menu..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Menu (Standby)</SelectItem>
                {menus.filter(m => m.isActive).map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name} ({m.orientation})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Orientation</label>
              <Select value={orientation} onValueChange={setOrientation}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIENTATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rotation</label>
              <Select value={rotationDeg} onValueChange={setRotationDeg}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROTATIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Auto-Refresh (seconds, 0 = off)</label>
            <Input type="number" min="0" value={refreshInterval} onChange={e => setRefreshInterval(e.target.value)} className="h-8 text-xs" data-testid="input-refresh-interval" />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <span className="text-sm">86'd Item Overlay</span>
              <p className="text-xs text-muted-foreground">Show sold-out items on display</p>
            </div>
            <Switch checked={showEightySixed} onCheckedChange={setShowEightySixed} data-testid="switch-86d-overlay" />
          </div>
          <div className="rounded-lg border overflow-hidden">
            <div className="flex items-center justify-between p-3">
              <div>
                <span className="text-sm flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Display Schedule</span>
                <p className="text-xs text-muted-foreground">Auto on/off by time (ET)</p>
              </div>
              <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} data-testid="switch-schedule-enabled" />
            </div>
            {scheduleEnabled && (
              <div className="px-3 pb-3 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Turn On</label>
                    <Input type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} className="h-8 text-xs" data-testid="input-schedule-start" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Turn Off</label>
                    <Input type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} className="h-8 text-xs" data-testid="input-schedule-end" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Display goes dark outside this window. Times in Eastern.</p>
              </div>
            )}
          </div>
          <Button className="w-full" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-display">
            {updateMutation.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({ menu, onClose }: { menu: JmtMenu | null; onClose: () => void }) {
  if (!menu) return null;
  return (
    <Dialog open={!!menu} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{menu.name}</DialogTitle>
          <DialogDescription>{menu.description || `${menu.category} · ${menu.orientation}`}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center bg-black rounded-lg overflow-hidden" style={{ maxHeight: "70vh" }}>
          <img src={menu.imageUrl} alt={menu.name} className="max-h-[70vh] object-contain" data-testid="img-preview-full" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{menu.category}</Badge>
          <Badge variant="outline">{menu.orientation}</Badge>
          {menu.tags?.map((t, i) => <Badge key={i} variant="secondary" className="text-xs"><Tag className="w-3 h-3 mr-1" />{t}</Badge>)}
          {menu.createdAt && <span className="text-xs text-muted-foreground ml-auto">Uploaded {new Date(menu.createdAt).toLocaleDateString()}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
