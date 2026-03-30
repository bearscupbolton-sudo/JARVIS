import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Vault, DollarSign, ChevronLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export default function QuickPayout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [category, setCategory] = useState<"BOH" | "FOH" | "Maint">("BOH");
  const [note, setNote] = useState("");

  const { data: locations } = useQuery<any[]>({ queryKey: ["/api/my-locations"] });
  const primaryLocation = locations?.[0]?.location;

  const { data: vaultData, isLoading: vaultLoading } = useQuery<{ balance: number }>({
    queryKey: ["/api/firm/vault/balance"],
  });

  const payoutMut = useMutation({
    mutationFn: async () => {
      const trimmedName = recipientName.trim();
      const parsed = parseFloat(amount);
      if (!trimmedName || isNaN(parsed) || parsed <= 0) throw new Error("Invalid input");
      const rounded = Math.round(parsed * 100) / 100;
      const res = await apiRequest("POST", "/api/firm/vault/payout", {
        amount: rounded,
        category,
        recipientName: trimmedName,
        description: note.trim() || undefined,
        locationId: primaryLocation?.id || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payout recorded", description: `$${parseFloat(amount).toFixed(2)} to ${recipientName}` });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/vault/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/vault/history"] });
      setAmount("");
      setRecipientName("");
      setNote("");
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const balance = vaultData?.balance ?? 0;
  const isNegative = balance < 0;
  const isLazy = balance > 5000;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Link href="/the-firm">
          <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold" data-testid="text-page-title">Quick Payout</h1>
          <p className="text-xs text-muted-foreground">Shadow Ledger — Cash Labor</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase">Vault</p>
          {vaultLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <p className={`text-sm font-bold tabular-nums ${isNegative ? "text-red-600" : isLazy ? "text-yellow-600" : "text-green-600"}`} data-testid="text-vault-balance">
              ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          )}
        </div>
      </div>

      {isNegative && (
        <div className="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2" data-testid="alert-vault-negative">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-400">Vault is negative — more cash paid out than collected. Investigate.</p>
        </div>
      )}

      <div className="flex-1 p-4 space-y-5">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="pl-10 h-14 text-2xl font-bold tabular-nums"
                  data-testid="input-amount"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Paid To</label>
              <Input
                placeholder="Name"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                className="h-12 text-base"
                data-testid="input-recipient"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Department</label>
              <div className="grid grid-cols-3 gap-2">
                {(["BOH", "FOH", "Maint"] as const).map(dept => (
                  <Button
                    key={dept}
                    variant={category === dept ? "default" : "outline"}
                    className={`h-12 text-base font-semibold ${category === dept ? "" : "border-2"}`}
                    onClick={() => setCategory(dept)}
                    data-testid={`button-dept-${dept.toLowerCase()}`}
                  >
                    {dept}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Note (optional)</label>
              <Input
                placeholder="What was this for?"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="h-12 text-base"
                data-testid="input-note"
              />
            </div>

            {primaryLocation && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs" data-testid="badge-location">{primaryLocation.name}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full h-16 text-lg font-bold"
          disabled={!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0 || !recipientName.trim() || payoutMut.isPending}
          onClick={() => payoutMut.mutate()}
          data-testid="button-submit-payout"
        >
          {payoutMut.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : payoutMut.isSuccess ? (
            <CheckCircle2 className="w-5 h-5 mr-2" />
          ) : (
            <Vault className="w-5 h-5 mr-2" />
          )}
          {payoutMut.isPending ? "Recording..." : payoutMut.isSuccess ? "Recorded!" : "Record Payout"}
        </Button>
      </div>
    </div>
  );
}
