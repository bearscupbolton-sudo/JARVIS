import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCircle, Save, Phone, Bell, BellRing, Cake, Smartphone, Trash2, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiRequest } from "@/lib/queryClient";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const profileSchema = z.object({
  username: z.string().min(2, "Display name must be at least 2 characters").max(30, "Display name must be 30 characters or less"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

type PushDevice = {
  id: number;
  endpoint: string;
  deviceLabel: string | null;
  createdAt: string | null;
};

type PushStatus = {
  enabled: boolean;
  devices: PushDevice[];
};

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState(user?.phone || "");
  const [smsOptIn, setSmsOptIn] = useState(user?.smsOptIn || false);
  const [birthday, setBirthday] = useState(user?.birthday || "");
  const [showJarvisBriefing, setShowJarvisBriefing] = useState((user as any)?.showJarvisBriefing ?? true);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [subscribing, setSubscribing] = useState(false);

  const { data: pushStatus, isLoading: loadingPush } = useQuery<PushStatus>({
    queryKey: ["/api/push/status"],
  });

  useEffect(() => {
    if ("Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.username || "",
    },
  });

  useEffect(() => {
    if (user?.username) {
      form.reset({ username: user.username });
    }
    if (user?.phone !== undefined) setPhone(user.phone || "");
    if (user?.smsOptIn !== undefined) setSmsOptIn(user.smsOptIn);
    if (user?.birthday !== undefined) setBirthday(user.birthday || "");
  }, [user?.username, user?.phone, user?.smsOptIn, user?.birthday]);

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to update profile");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Display name updated" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const contactMutation = useMutation({
    mutationFn: async (data: { phone: string; smsOptIn: boolean; birthday: string }) => {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to update contact info");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Contact info updated" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const jarvisToggleMutation = useMutation({
    mutationFn: async (show: boolean) => {
      const res = await apiRequest("PUT", `/api/users/${user?.id}/jarvis-settings`, { showJarvisBriefing: show });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home/jarvis-briefing"] });
      toast({ title: showJarvisBriefing ? "Daily briefing enabled" : "Daily briefing disabled" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
      setShowJarvisBriefing(!showJarvisBriefing);
    },
  });

  const testPushMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/push/test");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test notification sent!" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send test", description: error.message, variant: "destructive" });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (endpoint: string) => {
      const res = await apiRequest("DELETE", "/api/push/unsubscribe", { endpoint });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/status"] });
      toast({ title: "Device removed from push notifications" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove device", description: error.message, variant: "destructive" });
    },
  });

  const handleEnablePush = async () => {
    if (!VAPID_PUBLIC_KEY) {
      toast({ title: "Push notifications not configured", description: "Contact the app administrator.", variant: "destructive" });
      return;
    }

    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== "granted") {
        toast({ title: "Notification permission denied", description: "You can change this in your browser settings.", variant: "destructive" });
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = subscription.toJSON();
      const ua = navigator.userAgent;
      let deviceLabel = "Unknown device";
      if (/iPhone|iPad/.test(ua)) deviceLabel = "iPhone/iPad";
      else if (/Android/.test(ua)) deviceLabel = "Android";
      else if (/Mac/.test(ua)) deviceLabel = "Mac";
      else if (/Windows/.test(ua)) deviceLabel = "Windows";
      else if (/Linux/.test(ua)) deviceLabel = "Linux";

      await apiRequest("POST", "/api/push/subscribe", {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        deviceLabel,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/push/status"] });
      toast({ title: "Push notifications enabled!", description: "You'll now receive alerts on this device." });
    } catch (err: any) {
      console.error("Push subscription error:", err);
      toast({ title: "Failed to enable push notifications", description: err.message, variant: "destructive" });
    } finally {
      setSubscribing(false);
    }
  };

  const onSubmit = (data: ProfileFormValues) => {
    mutation.mutate(data);
  };

  const handleSaveContact = () => {
    contactMutation.mutate({ phone: phone.trim(), smsOptIn, birthday: birthday.trim() });
  };

  if (!user) return null;

  const hasNameChanged = form.watch("username")?.trim() !== (user.username || "");
  const hasContactChanged = phone.trim() !== (user.phone || "") || smsOptIn !== (user.smsOptIn || false) || birthday.trim() !== (user.birthday || "");
  const roleLabel = user.role === "owner" ? "Owner" : user.role === "manager" ? "Manager" : "Team Member";
  const pushSupported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const pushEnabled = pushStatus?.enabled || false;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-xl">
      <div>
        <h1 className="text-3xl font-display font-bold">Profile</h1>
        <p className="text-muted-foreground">Manage your display name, contact info, and notification preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="w-5 h-5" />
            Your Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Your display name"
                          maxLength={30}
                          data-testid="input-username"
                        />
                      </FormControl>
                      <Button
                        type="submit"
                        disabled={mutation.isPending || !hasNameChanged}
                        data-testid="button-save-username"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {mutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">This is how your name appears across the app.</p>
                  </FormItem>
                )}
              />
            </form>
          </Form>

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm" data-testid="text-profile-email">{user.email || "Not set"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge variant={user.role === "owner" ? "default" : "secondary"} data-testid="text-profile-role">
                {roleLabel}
              </Badge>
            </div>
            {user.locked && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant="outline">Read Only</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Contact & Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium flex items-center gap-2">
              <Cake className="w-4 h-4" />
              Birthday
            </label>
            <Input
              type="date"
              value={birthday}
              onChange={e => setBirthday(e.target.value)}
              data-testid="input-birthday"
            />
            <p className="text-xs text-muted-foreground mt-1">Your birthday will appear on the team calendar</p>
          </div>
          <div>
            <label className="text-sm font-medium">Phone Number</label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              type="tel"
              data-testid="input-phone"
            />
            <p className="text-xs text-muted-foreground mt-1">Used for schedule change notifications</p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">SMS Notifications</p>
                <p className="text-xs text-muted-foreground">Get text alerts for schedule changes</p>
              </div>
            </div>
            <Button
              variant={smsOptIn ? "default" : "outline"}
              size="sm"
              onClick={() => setSmsOptIn(!smsOptIn)}
              data-testid="button-toggle-sms"
            >
              {smsOptIn ? "On" : "Off"}
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <img src="/bear-logo.png" alt="Jarvis" className="w-4 h-4 rounded-full" />
              <div>
                <p className="text-sm font-medium">Daily Briefing</p>
                <p className="text-xs text-muted-foreground">Show personalized AI briefing on home page</p>
              </div>
            </div>
            <Button
              variant={showJarvisBriefing ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const newVal = !showJarvisBriefing;
                setShowJarvisBriefing(newVal);
                jarvisToggleMutation.mutate(newVal);
              }}
              disabled={jarvisToggleMutation.isPending}
              data-testid="button-toggle-jarvis"
            >
              {showJarvisBriefing ? "On" : "Off"}
            </Button>
          </div>

          <Button
            onClick={handleSaveContact}
            disabled={contactMutation.isPending || !hasContactChanged}
            className="w-full"
            data-testid="button-save-contact"
          >
            <Save className="w-4 h-4 mr-2" />
            {contactMutation.isPending ? "Saving..." : "Save Contact Info"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="w-5 h-5" />
            Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!pushSupported ? (
            <div className="text-center py-4 text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Push notifications are not supported on this browser.</p>
              <p className="text-xs mt-1">Try using Chrome, Edge, Firefox, or Safari 16.4+</p>
            </div>
          ) : pushPermission === "denied" ? (
            <div className="text-center py-4 text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Notifications are blocked for this site.</p>
              <p className="text-xs mt-1">Go to your browser settings to allow notifications, then refresh.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Get notified on this device when you receive messages, schedule changes, announcements, and time-off updates.
              </p>

              {!pushEnabled ? (
                <Button
                  onClick={handleEnablePush}
                  disabled={subscribing}
                  className="w-full"
                  data-testid="button-enable-push"
                >
                  <BellRing className="w-4 h-4 mr-2" />
                  {subscribing ? "Enabling..." : "Enable Push Notifications"}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <BellRing className="w-4 h-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Push Notifications Active</p>
                        <p className="text-xs text-muted-foreground">{pushStatus?.devices.length || 0} device(s) registered</p>
                      </div>
                    </div>
                    <Badge variant="secondary">Enabled</Badge>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEnablePush}
                    disabled={subscribing}
                    className="w-full"
                    data-testid="button-add-device"
                  >
                    <Smartphone className="w-4 h-4 mr-2" />
                    {subscribing ? "Adding..." : "Add This Device"}
                  </Button>

                  {loadingPush ? (
                    <Skeleton className="h-12 rounded-md" />
                  ) : (
                    pushStatus?.devices.map(device => (
                      <div
                        key={device.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-md border border-border"
                        data-testid={`push-device-${device.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Smartphone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm truncate">{device.deviceLabel || "Unknown device"}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {device.createdAt ? `Added ${new Date(device.createdAt).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => unsubscribeMutation.mutate(device.endpoint)}
                          disabled={unsubscribeMutation.isPending}
                          data-testid={`button-remove-device-${device.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testPushMutation.mutate()}
                    disabled={testPushMutation.isPending}
                    className="w-full"
                    data-testid="button-test-push"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {testPushMutation.isPending ? "Sending..." : "Send Test Notification"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
