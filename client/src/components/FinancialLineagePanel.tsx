import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, AlertTriangle, Ghost, Brain, ChevronDown, ChevronUp, Loader2, Shield, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LineageProps {
  open: boolean;
  onClose: () => void;
  category: string;
  label: string;
  startDate: string;
  endDate: string;
}

interface LineageAccount {
  code: string;
  name: string;
  type: string;
  category: string | null;
  laymanDescription: string | null;
  subtotal: number;
}

interface LineageLedgerLine {
  ledgerLineId: number;
  entryId: number;
  accountId: number;
  debit: number;
  credit: number;
  memo: string | null;
  transactionDate: string;
  description: string;
  isNonCash: boolean;
  createdBy: string | null;
  status: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountCategory: string | null;
  laymanDescription: string | null;
}

interface DuplicateRiskEntry {
  ledgerLineId: number;
  entryId: number;
  transactionDate: string;
  description: string;
  accountCode: string;
  accountName: string;
}

interface DuplicateRisk {
  amount: number;
  entries: DuplicateRiskEntry[];
  daySpan: number;
  riskLevel: "high" | "medium";
}

interface GhostEntry {
  ledgerLineId: number;
  entryId: number;
  transactionDate: string;
  description: string;
  debit: number;
  credit: number;
  accountCode: string;
  accountName: string;
  memo: string | null;
}

interface LineageResponse {
  category: string;
  coaCodes: string[];
  startDate: string;
  endDate: string;
  total: number;
  revenueTotal?: number;
  expenseTotal?: number;
  isNetView?: boolean;
  categoryLaymanDescription: string;
  accounts: LineageAccount[];
  ledgerLines: LineageLedgerLine[];
  duplicateRisks: DuplicateRisk[];
  ghostEntries: GhostEntry[];
  narrative: string;
  cached: boolean;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function AccountRow({ acct }: { acct: LineageAccount }) {
  return (
    <div className="rounded-lg p-3 border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-cyan-400 font-mono">{acct.code}</span>
          <span className="text-sm text-white ml-2 font-medium">{acct.name}</span>
        </div>
        <span className="text-sm font-bold text-white tabular-nums" data-testid={`lineage-acct-${acct.code}`}>
          {formatCurrency(acct.subtotal)}
        </span>
      </div>
      {acct.laymanDescription && (
        <p className="text-xs text-gray-400 mt-1 italic">{acct.laymanDescription}</p>
      )}
    </div>
  );
}

export default function FinancialLineagePanel({ open, onClose, category, label, startDate, endDate }: LineageProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>("entries");
  const [searchFilter, setSearchFilter] = useState("");

  const { data, isLoading, error } = useQuery<LineageResponse>({
    queryKey: ["/api/firm/audit/lineage", category, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/audit/lineage?category=${encodeURIComponent(category)}&startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to load");
      return res.json();
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  if (!open) return null;

  const duplicateLineIds = new Set<number>();
  if (data?.duplicateRisks) {
    for (const risk of data.duplicateRisks) {
      for (const entry of risk.entries) {
        duplicateLineIds.add(entry.ledgerLineId);
      }
    }
  }

  const ghostLineIds = new Set<number>();
  if (data?.ghostEntries) {
    for (const entry of data.ghostEntries) {
      ghostLineIds.add(entry.ledgerLineId);
    }
  }

  const filteredLines = data?.ledgerLines?.filter((line: LineageLedgerLine) => {
    if (!searchFilter) return true;
    const s = searchFilter.toLowerCase();
    return (
      line.description?.toLowerCase().includes(s) ||
      line.memo?.toLowerCase().includes(s) ||
      line.accountName?.toLowerCase().includes(s)
    );
  }) || [];

  const toggle = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
        data-testid="lineage-backdrop"
      />
      <div
        className="fixed top-0 right-0 h-full w-full max-w-xl z-50 overflow-y-auto shadow-2xl"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          backgroundImage: `
            linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%),
            repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 11px),
            repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 11px)
          `,
        }}
        data-testid="lineage-panel"
      >
        <div className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between border-b border-white/10" style={{ background: "rgba(26,26,46,0.95)", backdropFilter: "blur(8px)" }}>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2" data-testid="lineage-panel-title">
              <Shield className="w-5 h-5 text-cyan-400" />
              Audit Lineage
            </h2>
            <p className="text-xs text-gray-400">{label} &middot; {startDate} to {endDate}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1" data-testid="button-close-lineage">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm p-4 rounded-lg bg-red-900/20 border border-red-500/30" data-testid="lineage-error">
              {(error as Error).message}
            </div>
          )}

          {data && !isLoading && (
            <>
              <div className="rounded-xl p-4 border border-cyan-500/20" style={{ background: "rgba(0,200,255,0.05)" }}>
                <div className="text-3xl font-bold text-white tabular-nums" data-testid="lineage-total">
                  {formatCurrency(data.total)}
                </div>
                {data.categoryLaymanDescription && (
                  <p className="text-sm text-cyan-300/80 mt-1 italic" data-testid="lineage-category-description">{data.categoryLaymanDescription}</p>
                )}
                {data.isNetView && (
                  <div className="flex gap-4 mt-2 text-sm">
                    <div>
                      <span className="text-gray-400">Revenue: </span>
                      <span className="text-green-400 font-semibold tabular-nums" data-testid="lineage-revenue-total">{formatCurrency(data.revenueTotal || 0)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Expenses: </span>
                      <span className="text-red-400 font-semibold tabular-nums" data-testid="lineage-expense-total">{formatCurrency(data.expenseTotal || 0)}</span>
                    </div>
                  </div>
                )}
                <div className="text-sm text-gray-400 mt-1">{data.ledgerLines?.length || 0} journal entries</div>
                {data.cached && <Badge variant="outline" className="mt-1 text-[10px] text-cyan-300 border-cyan-500/30">cached</Badge>}
              </div>

              {data.accounts?.length > 0 && (
                <div className="space-y-2">
                  {data.isNetView && (
                    <>
                      <div className="text-xs font-semibold text-green-400 uppercase tracking-wide pt-2">Revenue Accounts</div>
                      {data.accounts.filter((a: LineageAccount) => a.type === "Revenue").map((acct: LineageAccount) => (
                        <AccountRow key={acct.code} acct={acct} />
                      ))}
                      <div className="text-xs font-semibold text-red-400 uppercase tracking-wide pt-3">Expense Accounts</div>
                      {data.accounts.filter((a: LineageAccount) => a.type !== "Revenue").map((acct: LineageAccount) => (
                        <AccountRow key={acct.code} acct={acct} />
                      ))}
                    </>
                  )}
                  {!data.isNetView && data.accounts.map((acct: LineageAccount) => (
                    <AccountRow key={acct.code} acct={acct} />
                  ))}
                </div>
              )}

              {data.duplicateRisks?.length > 0 && (
                <div className="rounded-xl border-2 border-amber-500/60 p-4 animate-pulse-border" style={{ background: "rgba(245,158,11,0.08)" }} data-testid="lineage-duplicates">
                  <button onClick={() => toggle("duplicates")} className="w-full flex items-center justify-between text-left">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-semibold text-amber-300">Double-Counting Auditor</span>
                      <Badge className="bg-amber-600/20 text-amber-300 border-amber-500/30 text-[10px]">{data.duplicateRisks.length} risk{data.duplicateRisks.length > 1 ? "s" : ""}</Badge>
                    </div>
                    {expandedSection === "duplicates" ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
                  </button>
                  {expandedSection === "duplicates" && (
                    <div className="mt-3 space-y-3">
                      {data.duplicateRisks.map((risk: DuplicateRisk, idx: number) => (
                        <div key={idx} className="rounded-lg p-3 border border-amber-500/30" style={{ background: "rgba(245,158,11,0.05)" }}>
                          <div className="text-xs text-amber-300 font-semibold mb-2">
                            {formatCurrency(risk.amount)} &middot; {risk.entries.length} entries within {Math.round(risk.daySpan)} day(s)
                            <Badge className={`ml-2 text-[10px] ${risk.riskLevel === "high" ? "bg-red-600/30 text-red-300" : "bg-amber-600/30 text-amber-300"}`}>
                              {risk.riskLevel} risk
                            </Badge>
                          </div>
                          {risk.entries.map((e: DuplicateRiskEntry) => (
                            <div key={e.ledgerLineId} className="text-xs text-gray-300 py-1 border-t border-amber-500/10 flex justify-between">
                              <span>{e.transactionDate} &middot; {e.description}</span>
                              <span className="text-amber-400 font-mono">{e.accountCode}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {data.ghostEntries?.length > 0 && (
                <div className="rounded-xl border border-purple-500/30 p-4" style={{ background: "rgba(168,85,247,0.05)" }} data-testid="lineage-ghosts">
                  <button onClick={() => toggle("ghosts")} className="w-full flex items-center justify-between text-left">
                    <div className="flex items-center gap-2">
                      <Ghost className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-semibold text-purple-300">Accrual Impact — Ghost Entries</span>
                      <Badge className="bg-purple-600/20 text-purple-300 border-purple-500/30 text-[10px]">{data.ghostEntries.length}</Badge>
                    </div>
                    {expandedSection === "ghosts" ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
                  </button>
                  <p className="text-xs text-purple-400/70 mt-1">Non-cash entries that lower net income without cash leaving the bank</p>
                  {expandedSection === "ghosts" && (
                    <div className="mt-3 space-y-1">
                      {data.ghostEntries.map((g: GhostEntry) => (
                        <div
                          key={g.ledgerLineId}
                          className="text-xs py-2 px-3 rounded border border-purple-500/20 flex justify-between items-center"
                          style={{ background: "rgba(168,85,247,0.04)", opacity: 0.65 }}
                        >
                          <div>
                            <span className="text-gray-400">{g.transactionDate}</span>
                            <span className="text-gray-300 ml-2">{g.description}</span>
                            {g.memo && <span className="text-gray-500 ml-1 italic">— {g.memo}</span>}
                          </div>
                          <span className="text-purple-300 font-mono tabular-nums">
                            {g.debit > 0 ? formatCurrency(g.debit) : formatCurrency(g.credit)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-white/10 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                <button onClick={() => toggle("entries")} className="w-full flex items-center justify-between text-left" data-testid="lineage-toggle-entries">
                  <span className="text-sm font-semibold text-white">Ledger Entries</span>
                  {expandedSection === "entries" ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {expandedSection === "entries" && (
                  <div className="mt-3 space-y-1">
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500" />
                      <input
                        type="text"
                        placeholder="Filter entries..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs rounded bg-white/5 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50"
                        data-testid="input-lineage-search"
                      />
                    </div>
                    <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1" data-testid="lineage-entries-list">
                      {filteredLines.length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-4">No entries found</p>
                      )}
                      {filteredLines.map((line: LineageLedgerLine) => {
                        const isDuplicate = duplicateLineIds.has(line.ledgerLineId);
                        const isGhost = ghostLineIds.has(line.ledgerLineId);
                        const amount = line.debit > 0 ? line.debit : line.credit;
                        const isDebit = line.debit > 0;

                        return (
                          <div
                            key={line.ledgerLineId}
                            className={`text-xs py-2 px-3 rounded border flex justify-between items-start gap-2 ${
                              isDuplicate
                                ? "border-amber-500/40 bg-amber-500/5"
                                : isGhost
                                  ? "border-purple-500/20 bg-purple-500/5"
                                  : "border-white/5 bg-white/[0.02]"
                            }`}
                            style={isGhost ? { opacity: 0.55 } : undefined}
                            data-testid={`lineage-entry-${line.ledgerLineId}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-gray-500">{line.transactionDate}</span>
                                <span className="text-gray-300 truncate">{line.description}</span>
                                {isDuplicate && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                                {isGhost && <Ghost className="w-3 h-3 text-purple-400 shrink-0" />}
                              </div>
                              {line.memo && <div className="text-gray-500 italic mt-0.5 truncate">{line.memo}</div>}
                              <div className="text-gray-600 mt-0.5">{line.accountCode} &middot; {line.accountName}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`font-mono font-medium tabular-nums ${isDebit ? "text-red-400" : "text-green-400"}`}>
                                {isDebit ? "-" : "+"}{formatCurrency(amount)}
                              </div>
                              <div className="text-gray-600">{isDebit ? "DR" : "CR"}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {data.narrative && (
                <div className="rounded-xl border border-cyan-500/20 p-4" style={{ background: "rgba(0,200,255,0.03)" }} data-testid="lineage-narrative">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-semibold text-cyan-300">AI Trend Analysis</span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{data.narrative}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulseBorder {
          0%, 100% { border-color: rgba(245, 158, 11, 0.6); }
          50% { border-color: rgba(245, 158, 11, 0.2); }
        }
        .animate-pulse-border {
          animation: pulseBorder 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
