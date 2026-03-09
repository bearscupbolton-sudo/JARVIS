import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import bearLogoPath from "@assets/bear_logo_clean.png";
import { Loader2, Upload, CheckCircle2, FileText } from "lucide-react";

export default function WholesaleOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [st120File, setSt120File] = useState<File | null>(null);
  const [st120Uploaded, setSt120Uploaded] = useState(false);

  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    certificateOfAuthority: "",
    st120IsBlanket: false,
  });

  const { data: customer, isLoading: authLoading } = useQuery<{ id: number; onboardingComplete: boolean } | null>({
    queryKey: ["/api/wholesale/me"],
    queryFn: async () => {
      const res = await fetch("/api/wholesale/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const { uploadFile, isUploading } = useUpload({
    onError: () => {
      toast({ title: "Failed to upload ST-120", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && !customer) {
      setLocation("/wholesale/login");
    } else if (!authLoading && customer?.onboardingComplete) {
      setLocation("/wholesale");
    }
  }, [authLoading, customer, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!customer || customer.onboardingComplete) return null;

  function updateField(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.businessName || !form.contactName || !form.phone || !form.email || !form.certificateOfAuthority) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      let st120Path: string | null = null;
      if (st120File) {
        const uploadResult = await uploadFile(st120File);
        if (uploadResult) {
          st120Path = uploadResult.objectPath;
          setSt120Uploaded(true);
        }
      }

      await apiRequest("POST", "/api/wholesale/onboarding", {
        businessName: form.businessName,
        contactName: form.contactName,
        phone: form.phone,
        email: form.email,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        certificateOfAuthority: form.certificateOfAuthority,
        st120IsBlanket: form.st120IsBlanket,
        st120FilePath: st120Path,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/wholesale/me"] });
      toast({ title: "Welcome aboard!", description: "Your account is all set up." });
      setLocation("/wholesale");
    } catch (err: any) {
      toast({ title: "Onboarding failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-background dark:from-neutral-950 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-xl overflow-hidden bg-amber-800 flex items-center justify-center mb-4">
            <img src={bearLogoPath} alt="Bear's Cup" className="w-12 h-12 object-contain invert" />
          </div>
          <h1 className="text-2xl font-bold font-serif tracking-tight" data-testid="text-onboarding-title">
            Welcome to BC Wholesale
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Let's get your account set up. Please fill out the information below to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Business Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    value={form.businessName}
                    onChange={(e) => updateField("businessName", e.target.value)}
                    placeholder="Your business name"
                    data-testid="input-business-name"
                  />
                </div>
                <div>
                  <Label htmlFor="contactName">Contact Name *</Label>
                  <Input
                    id="contactName"
                    value={form.contactName}
                    onChange={(e) => updateField("contactName", e.target.value)}
                    placeholder="Primary contact person"
                    data-testid="input-contact-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="(555) 123-4567"
                    data-testid="input-phone"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="you@business.com"
                    data-testid="input-email"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="123 Main Street"
                  data-testid="input-address"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="City"
                    data-testid="input-city"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={form.state}
                    onChange={(e) => updateField("state", e.target.value)}
                    placeholder="NY"
                    maxLength={2}
                    data-testid="input-state"
                  />
                </div>
                <div>
                  <Label htmlFor="zip">ZIP</Label>
                  <Input
                    id="zip"
                    value={form.zip}
                    onChange={(e) => updateField("zip", e.target.value)}
                    placeholder="10001"
                    data-testid="input-zip"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Tax Exemption — NY Form ST-120</CardTitle>
              <p className="text-sm text-muted-foreground">
                As a wholesale customer purchasing goods for resale, please provide your Certificate of Authority and a signed ST-120 form.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="certificateOfAuthority">Certificate of Authority Number *</Label>
                <Input
                  id="certificateOfAuthority"
                  value={form.certificateOfAuthority}
                  onChange={(e) => updateField("certificateOfAuthority", e.target.value)}
                  placeholder="e.g. 123456789"
                  data-testid="input-cert-authority"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Found on your NYS Certificate of Authority issued by the Tax Department
                </p>
              </div>

              <div>
                <Label>Upload Signed ST-120 Form</Label>
                <div className="mt-1.5">
                  {st120Uploaded ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <span className="text-sm text-green-700 dark:text-green-400">ST-120 uploaded successfully</span>
                    </div>
                  ) : (
                    <label
                      className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 cursor-pointer transition-colors"
                      data-testid="input-st120-upload"
                    >
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setSt120File(file);
                        }}
                      />
                      {st120File ? (
                        <>
                          <FileText className="h-5 w-5 text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{st120File.name}</p>
                            <p className="text-xs text-muted-foreground">{(st120File.size / 1024).toFixed(0)} KB — will upload on submit</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">Click to select your ST-120</p>
                            <p className="text-xs text-muted-foreground">PDF, JPG, or PNG accepted</p>
                          </div>
                        </>
                      )}
                    </label>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Checkbox
                  id="st120IsBlanket"
                  checked={form.st120IsBlanket}
                  onCheckedChange={(checked) => updateField("st120IsBlanket", !!checked)}
                  className="mt-0.5"
                  data-testid="checkbox-blanket"
                />
                <div>
                  <Label htmlFor="st120IsBlanket" className="font-medium cursor-pointer">
                    This is a Blanket Certificate
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A blanket ST-120 covers all future purchases of the same type of goods, so you won't need to provide a new form each time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full h-12 mt-6"
            disabled={loading || isUploading}
            data-testid="button-complete-onboarding"
          >
            {loading || isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Complete Setup"
            )}
          </Button>
        </form>

        <p className="text-xs text-center text-muted-foreground pb-4">
          Bear's Cup Bakehouse — Wholesale Portal
        </p>
      </div>
    </div>
  );
}
