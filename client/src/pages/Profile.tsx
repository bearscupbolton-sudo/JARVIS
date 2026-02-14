import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserCircle, Save, Phone, Bell, Cake } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const profileSchema = z.object({
  username: z.string().min(2, "Display name must be at least 2 characters").max(30, "Display name must be 30 characters or less"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState(user?.phone || "");
  const [smsOptIn, setSmsOptIn] = useState(user?.smsOptIn || false);
  const [birthday, setBirthday] = useState(user?.birthday || "");

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
    </div>
  );
}
