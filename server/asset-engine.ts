/**
 * JARVIS FIXED ASSET & COMPONENTIZATION ENGINE
 * Optimized for S-Corp Basis Tracking and Multi-Location Isolation.
 *
 * COA Map (Bear's Cup LLC):
 *   1500 = Fixed Assets – Equipment
 *   1510 = Accumulated Depreciation
 *   1010 = Operating Cash
 *   6130 = Depreciation Expense
 */

import { db } from "./db";
import { fixedAssets, depreciationSchedules, depreciationEntries, assetAuditLog, firmTransactions, chartOfAccounts, journalEntries } from "@shared/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { createJournalEntry, postJournalEntry } from "./accounting-engine";
import { storage } from "./storage";

const CAPEX_THRESHOLD = 2500;

const EQUIPMENT_VENDORS = [
  "bakemark", "sysco", "webstaurant", "kitchenaid", "hobart",
  "true manufacturing", "turbo air", "rational", "bakers pride",
  "blodgett", "middleby", "alto-shaam", "vulcan", "globe",
  "berkel", "robot coupe", "vitamix", "bunn", "fetco",
  "grindmaster", "taylor", "carpigiani", "kolpak", "norlake",
  "traulsen", "continental", "beverage-air", "hoshizaki",
  "manitowoc", "scotsman", "follett", "proofbox", "proof box",
];

export interface AssetComponent {
  description: string;
  cost: number;
  usefulLife: number;
  locationId: number;
}

export interface ExpenseAdjustment {
  type: string;
  description: string;
  cost: number;
}

const ADJUSTMENT_TYPE_COA: Record<string, string> = {
  delivery: "6120",
  sales_tax: "2030",
  cc_surcharge: "6110",
  other_expense: "6090",
};

export class AssetAssessor {
  private ASSET_ACCOUNT = "1500";
  private LEASEHOLD_ACCOUNT = "1520";
  private CASH_ACCOUNT = "1010";
  private ACCUM_DEPREC_ACCOUNT = "1510";
  private DEPREC_EXPENSE_ACCOUNT = "6130";

  private resolveAssetAccount(category?: string): string {
    return category === "leasehold" ? this.LEASEHOLD_ACCOUNT : this.ASSET_ACCOUNT;
  }

  /**
   * Transforms a single bank debit into multiple discrete capital assets.
   * Validated for S-Corp basis continuity.
   */
  async componentizeTransaction(transactionId: number, components: AssetComponent[], adjustments?: ExpenseAdjustment[]) {
    const originalTx = await storage.getFirmTransaction(transactionId);
    if (!originalTx) throw new Error("Transaction not found");

    const totalBasis = Math.round(components.reduce((sum, c) => sum + Number(c.cost), 0) * 100) / 100;
    const adjTotal = Math.round((adjustments || []).reduce((sum, a) => sum + Number(a.cost), 0) * 100) / 100;
    const txAmount = Math.round(Math.abs(Number(originalTx.amount)) * 100) / 100;
    const grandTotal = Math.round((totalBasis + adjTotal) * 100) / 100;

    if (Math.abs(grandTotal - txAmount) > 0.01) {
      throw new Error(
        `Audit Failure: Assets ($${totalBasis.toFixed(2)}) + Adjustments ($${adjTotal.toFixed(2)}) = $${grandTotal.toFixed(2)} does not match bank debit ($${txAmount.toFixed(2)}). Variance: $${Math.abs(grandTotal - txAmount).toFixed(2)}`
      );
    }

    const existingAssets = await db.select().from(fixedAssets)
      .where(eq(fixedAssets.purchaseTransactionId, transactionId));
    if (existingAssets.length > 0) {
      throw new Error(
        `Transaction #${transactionId} already has ${existingAssets.length} asset(s) linked. Delete existing assets first.`
      );
    }

    const createdAssets: any[] = [];

    for (const item of components) {
      const usefulLifeMonths = item.usefulLife * 12;
      const locationTag = getLocationTag(item.locationId);

      const [asset] = await db.insert(fixedAssets).values({
        name: item.description,
        description: `Split from TX #${transactionId}`,
        vendor: (originalTx as any).vendor || originalTx.description || "Unknown",
        purchasePrice: item.cost,
        placedInServiceDate: originalTx.date,
        usefulLifeMonths,
        salvageValue: 0,
        locationId: item.locationId,
        locationTag,
        status: "placed_in_service",
        section179Eligible: true,
        section179Elected: false,
        bookDepreciationMethod: "straight_line",
        taxDepreciationMethod: "straight_line",
        purchaseTransactionId: transactionId,
        createdBy: "AssetAssessor",
      }).returning();

      await logAssetAudit(
        asset.id,
        "COMPONENTIZED",
        `Split from TX #${transactionId}. Component: ${item.description} at $${item.cost.toLocaleString()}. ` +
        `Total parent: $${txAmount.toLocaleString()}. ${components.length} sibling(s) in split. ` +
        `Useful life: ${item.usefulLife}yr. Location: ${locationTag}.`,
        "AssetAssessor"
      );
      createdAssets.push(asset);
    }

    const assetAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, this.ASSET_ACCOUNT)).limit(1);
    const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, this.CASH_ACCOUNT)).limit(1);

    if (assetAccount.length > 0 && cashAccount.length > 0) {
      const componentNames = createdAssets.map((a: any) => a.name).join(", ");
      const jeLines: Array<{ accountId: number; debit: number; credit: number; memo: string }> = [];

      jeLines.push({ accountId: assetAccount[0].id, debit: totalBasis, credit: 0, memo: `Capitalize: ${componentNames}` });

      if (adjustments && adjustments.length > 0) {
        for (const adj of adjustments) {
          const expCode = ADJUSTMENT_TYPE_COA[adj.type] || "6200";
          const expAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, expCode)).limit(1);
          if (expAccount.length > 0) {
            jeLines.push({ accountId: expAccount[0].id, debit: Number(adj.cost), credit: 0, memo: `${adj.description} (non-CapEx portion of equipment purchase)` });
          } else {
            jeLines.push({ accountId: assetAccount[0].id, debit: Number(adj.cost), credit: 0, memo: `${adj.description} — expense COA ${expCode} not found, parked to assets` });
          }
        }
      }

      jeLines.push({ accountId: cashAccount[0].id, debit: 0, credit: txAmount, memo: `Equipment purchase: ${originalTx.description}` });

      await postJournalEntry(
        {
          transactionDate: originalTx.date,
          description: `Capitalized Equipment${adjustments && adjustments.length > 0 ? " (with expense adjustments)" : ""}: TX #${transactionId} — ${originalTx.description}`,
          referenceType: "capex",
          referenceId: String(transactionId),
          createdBy: null,
        },
        jeLines
      );
    }

    await db.update(firmTransactions)
      .set({
        category: "equipment",
        reconciled: true,
      })
      .where(eq(firmTransactions.id, transactionId));

    const adjSummary = adjustments && adjustments.length > 0
      ? ` + ${adjustments.length} expense adj ($${adjTotal})`
      : "";
    console.log(
      `[AssetAssessor] Componentized TX #${transactionId} ($${txAmount}) → ${createdAssets.length} assets ($${totalBasis}): ${createdAssets.map(a => `${a.name} ($${a.purchasePrice})`).join(", ")}${adjSummary}`
    );

    return {
      success: true,
      parentTransactionId: transactionId,
      totalCost: txAmount,
      capitalizedAmount: totalBasis,
      expenseAdjustments: adjTotal,
      assetCount: createdAssets.length,
      componentsCreated: createdAssets.length,
      assets: createdAssets,
    };
  }

  /**
   * Single-asset shortcut: one transaction = one piece of equipment.
   * Idempotent — returns existing asset if already linked.
   */
  async capitalizeSingleAsset(transactionId: number, createdBy: string, assetCategory?: string) {
    const tx = await storage.getFirmTransaction(transactionId);
    if (!tx) throw new Error(`Transaction #${transactionId} not found`);

    const existingAssets = await db.select().from(fixedAssets)
      .where(eq(fixedAssets.purchaseTransactionId, transactionId));
    if (existingAssets.length > 0) return existingAssets[0];

    const absAmount = Math.abs(Number(tx.amount));
    const locationTag = getLocationTag(tx.locationId);
    const isLeasehold = assetCategory === "leasehold";
    const defaultUsefulLife = isLeasehold ? 120 : 84;
    const defaultName = isLeasehold ? "Leasehold Improvement" : "Equipment Purchase";

    const [newAsset] = await db.insert(fixedAssets).values({
      name: tx.description || defaultName,
      description: `Auto-created from transaction #${transactionId}`,
      vendor: (tx as any).vendor || "Unknown",
      purchasePrice: absAmount,
      placedInServiceDate: tx.date,
      usefulLifeMonths: defaultUsefulLife,
      salvageValue: 0,
      locationId: tx.locationId || 1,
      locationTag,
      status: "capitalized",
      capitalizedBy: createdBy,
      capitalizedAt: new Date(),
      section179Eligible: true,
      section179Elected: false,
      bookDepreciationMethod: "straight_line",
      taxDepreciationMethod: "straight_line",
      purchaseTransactionId: transactionId,
      createdBy,
    }).returning();

    await logAssetAudit(
      newAsset.id,
      "AUTO_CREATED",
      `Auto-created from equipment reclassification. Transaction: ${tx.description}, Amount: $${absAmount.toLocaleString()}`,
      createdBy
    );

    const resolvedAccountCode = this.resolveAssetAccount(assetCategory);
    const assetAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, resolvedAccountCode)).limit(1);
    const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, this.CASH_ACCOUNT)).limit(1);
    if (assetAccount.length > 0 && cashAccount.length > 0) {
      const [je] = await db.insert(journalEntries).values({
        transactionDate: tx.date,
        description: `${isLeasehold ? "Leasehold Improvement" : "CapEx"} — ${tx.description}`,
        referenceType: "capex",
        referenceId: String(transactionId),
        createdBy: createdBy || null,
        status: "posted",
      }).returning();

      if (je) {
        const { ledgerLines } = await import("@shared/schema");
        await db.insert(ledgerLines).values([
          { entryId: je.id, accountId: assetAccount[0].id, debit: absAmount, credit: 0, memo: `Capitalize: ${tx.description}` },
          { entryId: je.id, accountId: cashAccount[0].id, debit: 0, credit: absAmount, memo: `Capitalize: ${tx.description}` },
        ]);

        await db.update(fixedAssets).set({
          journalEntryId: je.id,
        }).where(eq(fixedAssets.id, newAsset.id));
      }
    }

    const bookSchedule = calculateStraightLineSchedule(
      absAmount,
      0,
      newAsset.usefulLifeMonths,
      tx.date
    );

    const [bookSched] = await db.insert(depreciationSchedules).values({
      assetId: newAsset.id,
      ledgerType: "book",
      method: "straight_line",
      totalAmount: bookSchedule.totalAmount,
      monthlyAmount: bookSchedule.monthlyAmount,
      startDate: tx.date,
      endDate: bookSchedule.entries[bookSchedule.entries.length - 1]?.periodDate,
      totalMonths: bookSchedule.totalMonths,
      yearOneDeduction: null,
    }).returning();

    for (const e of bookSchedule.entries) {
      await db.insert(depreciationEntries).values({
        scheduleId: bookSched.id,
        assetId: newAsset.id,
        periodDate: e.periodDate,
        amount: e.amount,
        accumulatedDepreciation: e.accumulatedDepreciation,
        netBookValue: e.netBookValue,
        posted: false,
      });
    }

    if (newAsset.section179Eligible) {
      const taxSchedule = calculateSection179Schedule(absAmount, tx.date);
      const [taxSched] = await db.insert(depreciationSchedules).values({
        assetId: newAsset.id,
        ledgerType: "tax",
        method: "section_179",
        totalAmount: taxSchedule.totalAmount,
        monthlyAmount: null,
        startDate: tx.date,
        endDate: taxSchedule.entries[0]?.periodDate,
        totalMonths: 1,
        yearOneDeduction: taxSchedule.yearOneDeduction,
      }).returning();

      for (const e of taxSchedule.entries) {
        await db.insert(depreciationEntries).values({
          scheduleId: taxSched.id,
          assetId: newAsset.id,
          periodDate: e.periodDate,
          amount: e.amount,
          accumulatedDepreciation: e.accumulatedDepreciation,
          netBookValue: e.netBookValue,
          posted: false,
        });
      }
    }

    await logAssetAudit(
      newAsset.id,
      "DEPRECIATION_SCHEDULED",
      `Book depreciation: straight-line over ${newAsset.usefulLifeMonths} months ($${bookSchedule.monthlyAmount.toFixed(2)}/mo). Asset pending detail completion (serial, make, model).`,
      createdBy
    );

    console.log(`[AssetAssessor] Auto-created asset #${newAsset.id} from TX #${transactionId}: $${absAmount} — depreciation schedule created`);
    return newAsset;
  }

  /**
   * Ghost Accountant: Auto-generates monthly depreciation for all active assets.
   * Optionally filters by locationId for multi-location isolation.
   */
  async runMonthlyDepreciation(periodDate: string, createdBy: string, locationId?: number) {
    const unpaidEntries = await db.select().from(depreciationEntries)
      .innerJoin(depreciationSchedules, eq(depreciationEntries.scheduleId, depreciationSchedules.id))
      .where(
        and(
          eq(depreciationEntries.periodDate, periodDate),
          eq(depreciationEntries.posted, false),
          eq(depreciationSchedules.ledgerType, "book"),
        )
      );

    let posted = 0;
    let totalMonthlyDeprec = 0;

    for (const row of unpaidEntries) {
      const entry = row.depreciation_entries;

      const [asset] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, entry.assetId));
      if (!asset) continue;
      if (asset.status !== "capitalized" && asset.status !== "placed_in_service") continue;
      if (locationId && asset.locationId !== locationId) continue;

      const je = await createJournalEntry({
        date: periodDate,
        memo: `Monthly depreciation: ${asset.name} (${periodDate})`,
        lines: [
          { accountCode: this.DEPREC_EXPENSE_ACCOUNT, debit: entry.amount, credit: 0 },
          { accountCode: this.ACCUM_DEPREC_ACCOUNT, debit: 0, credit: entry.amount },
        ],
        createdBy,
        referenceType: "depreciation",
        referenceId: String(entry.id),
        locationId: asset.locationId || undefined,
      });

      await db.update(depreciationEntries).set({
        posted: true,
        journalEntryId: je?.id || null,
      }).where(eq(depreciationEntries.id, entry.id));

      await logAssetAudit(
        entry.assetId,
        "DEPRECIATION_POSTED",
        `Book depreciation $${entry.amount} posted for period ${periodDate}. Accumulated: $${entry.accumulatedDepreciation}. NBV: $${entry.netBookValue}. JE #${je?.id}`,
        createdBy,
        { posted: false, journalEntryId: null },
        { posted: true, journalEntryId: je?.id },
        "Monthly depreciation posting"
      );

      totalMonthlyDeprec += entry.amount;
      posted++;
    }

    return { posted, periodDate, totalMonthlyDeprec: Math.round(totalMonthlyDeprec * 100) / 100 };
  }
}

export const assetAssessor = new AssetAssessor();


export function isCapExCandidate(description: string, amount: number): boolean {
  const absAmount = Math.abs(amount);
  if (absAmount < CAPEX_THRESHOLD) return false;
  const lower = description.toLowerCase();
  return EQUIPMENT_VENDORS.some(v => lower.includes(v));
}

export function getLocationTag(locationId: number | null): string {
  if (locationId === 1) return "SARATOGA_01";
  if (locationId === 2) return "BOLTON_02";
  return "UNASSIGNED";
}

export function calculateStraightLineSchedule(
  purchasePrice: number,
  salvageValue: number,
  usefulLifeMonths: number,
  startDate: string
) {
  const depreciableAmount = purchasePrice - salvageValue;
  const monthlyAmount = depreciableAmount / usefulLifeMonths;
  const entries: Array<{
    periodDate: string;
    amount: number;
    accumulatedDepreciation: number;
    netBookValue: number;
  }> = [];

  let accumulated = 0;
  const start = new Date(startDate + "T00:00:00");

  for (let i = 0; i < usefulLifeMonths; i++) {
    const periodDate = new Date(start);
    periodDate.setMonth(periodDate.getMonth() + i);
    const dateStr = periodDate.toISOString().split("T")[0];
    accumulated += monthlyAmount;
    entries.push({
      periodDate: dateStr,
      amount: Math.round(monthlyAmount * 100) / 100,
      accumulatedDepreciation: Math.round(accumulated * 100) / 100,
      netBookValue: Math.round((purchasePrice - accumulated) * 100) / 100,
    });
  }

  return {
    method: "straight_line",
    totalAmount: depreciableAmount,
    monthlyAmount: Math.round(monthlyAmount * 100) / 100,
    totalMonths: usefulLifeMonths,
    entries,
  };
}

export function calculateSection179Schedule(
  purchasePrice: number,
  startDate: string
) {
  const yearStr = startDate.split("-")[0];
  return {
    method: "section_179",
    totalAmount: purchasePrice,
    yearOneDeduction: purchasePrice,
    totalMonths: 1,
    entries: [
      {
        periodDate: `${yearStr}-12-31`,
        amount: purchasePrice,
        accumulatedDepreciation: purchasePrice,
        netBookValue: 0,
      },
    ],
  };
}

export async function capitalizeAsset(assetId: number, createdBy: string) {
  const [asset] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, assetId));
  if (!asset) throw new Error("Asset not found");
  if (asset.status === "capitalized") throw new Error("Asset already capitalized");

  const entry = await createJournalEntry({
    date: asset.placedInServiceDate,
    memo: `Capitalize fixed asset: ${asset.name}${asset.vendor ? ` from ${asset.vendor}` : ""}`,
    lines: [
      { accountCode: "1500", debit: asset.purchasePrice, credit: 0 },
      { accountCode: "1010", debit: 0, credit: asset.purchasePrice },
    ],
    createdBy,
    referenceType: "fixed_asset",
    referenceId: String(assetId),
    locationId: asset.locationId || undefined,
  });

  const bookSchedule = calculateStraightLineSchedule(
    asset.purchasePrice,
    asset.salvageValue,
    asset.usefulLifeMonths,
    asset.placedInServiceDate
  );

  const [bookSched] = await db.insert(depreciationSchedules).values({
    assetId: asset.id,
    ledgerType: "book",
    method: "straight_line",
    totalAmount: bookSchedule.totalAmount,
    monthlyAmount: bookSchedule.monthlyAmount,
    startDate: asset.placedInServiceDate,
    endDate: bookSchedule.entries[bookSchedule.entries.length - 1]?.periodDate,
    totalMonths: bookSchedule.totalMonths,
    yearOneDeduction: null,
  }).returning();

  for (const e of bookSchedule.entries) {
    await db.insert(depreciationEntries).values({
      scheduleId: bookSched.id,
      assetId: asset.id,
      periodDate: e.periodDate,
      amount: e.amount,
      accumulatedDepreciation: e.accumulatedDepreciation,
      netBookValue: e.netBookValue,
      posted: false,
    });
  }

  if (asset.section179Eligible) {
    const taxSchedule = calculateSection179Schedule(asset.purchasePrice, asset.placedInServiceDate);
    const [taxSched] = await db.insert(depreciationSchedules).values({
      assetId: asset.id,
      ledgerType: "tax",
      method: "section_179",
      totalAmount: taxSchedule.totalAmount,
      monthlyAmount: null,
      startDate: asset.placedInServiceDate,
      endDate: taxSchedule.entries[0]?.periodDate,
      totalMonths: 1,
      yearOneDeduction: taxSchedule.yearOneDeduction,
    }).returning();

    for (const e of taxSchedule.entries) {
      await db.insert(depreciationEntries).values({
        scheduleId: taxSched.id,
        assetId: asset.id,
        periodDate: e.periodDate,
        amount: e.amount,
        accumulatedDepreciation: e.accumulatedDepreciation,
        netBookValue: e.netBookValue,
        posted: false,
      });
    }
  }

  await db.update(fixedAssets).set({
    status: "capitalized",
    journalEntryId: entry?.id || null,
    capitalizedBy: createdBy,
    capitalizedAt: new Date(),
    section179Elected: asset.section179Eligible,
    locationTag: getLocationTag(asset.locationId),
  }).where(eq(fixedAssets.id, assetId));

  await db.insert(assetAuditLog).values({
    assetId,
    action: "CAPITALIZED",
    details: `Asset capitalized at $${asset.purchasePrice}. Book: Straight-line over ${asset.usefulLifeMonths} months ($${bookSchedule.monthlyAmount}/mo). Tax: ${asset.section179Eligible ? `Section 179 full deduction $${asset.purchasePrice}` : "MACRS standard"}. JE #${entry?.id}`,
    performedBy: createdBy,
  });

  return db.select().from(fixedAssets).where(eq(fixedAssets.id, assetId)).then(r => r[0]);
}

export async function getAssetSummary() {
  const assets = await db.select().from(fixedAssets);
  const schedules = await db.select().from(depreciationSchedules);
  const entries = await db.select().from(depreciationEntries);

  const activeAssets = assets.filter(a => ["capitalized", "placed_in_service"].includes(a.status));
  const totalCost = activeAssets.reduce((s, a) => s + a.purchasePrice, 0);

  let totalBookDepreciation = 0;
  let totalTaxDeduction = 0;
  for (const asset of activeAssets) {
    const bookEntries = entries.filter(e => {
      const sched = schedules.find(s => s.id === e.scheduleId);
      return sched && sched.assetId === asset.id && sched.ledgerType === "book" && e.posted;
    });
    totalBookDepreciation += bookEntries.reduce((s, e) => s + e.amount, 0);

    const taxScheds = schedules.filter(s => s.assetId === asset.id && s.ledgerType === "tax");
    totalTaxDeduction += taxScheds.reduce((s, ts) => s + (ts.yearOneDeduction || 0), 0);
  }

  return {
    totalAssets: assets.length,
    activeAssets: activeAssets.length,
    totalCost: Math.round(totalCost * 100) / 100,
    totalBookDepreciation: Math.round(totalBookDepreciation * 100) / 100,
    netBookValue: Math.round((totalCost - totalBookDepreciation) * 100) / 100,
    totalSection179Deduction: Math.round(totalTaxDeduction * 100) / 100,
    assets: assets.map(a => {
      const bookScheds = schedules.filter(s => s.assetId === a.id && s.ledgerType === "book");
      const bookEntrs = entries.filter(e => bookScheds.some(s => s.id === e.scheduleId) && e.posted);
      const accum = bookEntrs.reduce((s, e) => s + e.amount, 0);
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        purchasePrice: a.purchasePrice,
        status: a.status,
        usefulLifeMonths: a.usefulLifeMonths,
        monthlyDepreciation: bookScheds[0]?.monthlyAmount || 0,
        accumulatedDepreciation: Math.round(accum * 100) / 100,
        netBookValue: Math.round((a.purchasePrice - accum) * 100) / 100,
        locationId: a.locationId,
        locationTag: a.locationTag,
        purchaseTransactionId: a.purchaseTransactionId,
      };
    }),
  };
}

export async function getCapExRecommendation(purchasePrice: number, ytdNetIncome: number) {
  const section179Limit2026 = 2_560_000;

  const recommendation: {
    strategy: "section_179" | "straight_line" | "hybrid";
    reason: string;
    bookImpact: { monthlyExpense: number; usefulLifeMonths: number };
    taxImpact: { yearOneDeduction: number; method: string };
    profitShield: boolean;
    loanReadiness: boolean;
  } = {
    strategy: "section_179",
    reason: "",
    bookImpact: { monthlyExpense: 0, usefulLifeMonths: 120 },
    taxImpact: { yearOneDeduction: 0, method: "" },
    profitShield: false,
    loanReadiness: false,
  };

  recommendation.bookImpact.monthlyExpense = Math.round((purchasePrice / 120) * 100) / 100;

  if (purchasePrice <= section179Limit2026) {
    if (ytdNetIncome > purchasePrice * 2) {
      recommendation.strategy = "section_179";
      recommendation.reason = `YTD profits ($${ytdNetIncome.toLocaleString()}) are strong. Section 179 deduction of $${purchasePrice.toLocaleString()} will reduce your 2026 tax liability while your book P&L only shows $${recommendation.bookImpact.monthlyExpense}/mo depreciation.`;
      recommendation.taxImpact = { yearOneDeduction: purchasePrice, method: "Section 179 (100% Year 1)" };
      recommendation.profitShield = true;
    } else if (ytdNetIncome < purchasePrice * 0.5) {
      recommendation.strategy = "straight_line";
      recommendation.reason = `YTD income ($${ytdNetIncome.toLocaleString()}) is modest relative to the $${purchasePrice.toLocaleString()} purchase. Straight-line depreciation preserves a stronger balance sheet for loan applications and keeps net income more predictable.`;
      recommendation.taxImpact = { yearOneDeduction: purchasePrice / 120 * 12, method: "Straight-Line (10yr MACRS)" };
      recommendation.loanReadiness = true;
    } else {
      recommendation.strategy = "section_179";
      recommendation.reason = `Section 179 is available and the deduction fits within your income level. Your book P&L remains clean at $${recommendation.bookImpact.monthlyExpense}/mo.`;
      recommendation.taxImpact = { yearOneDeduction: purchasePrice, method: "Section 179 (100% Year 1)" };
      recommendation.profitShield = true;
    }
  } else {
    recommendation.strategy = "straight_line";
    recommendation.reason = `Purchase exceeds typical Section 179 sweet spot. Straight-line depreciation recommended.`;
    recommendation.taxImpact = { yearOneDeduction: purchasePrice / 120 * 12, method: "MACRS / Straight-Line" };
  }

  return recommendation;
}

const LEGACY_ASSETS_2024 = [
  { name: "Spiral Mixer", placedInServiceDate: "2019-05-23", purchasePrice: 15322, group: "Saratoga/Bolton Machinery", locationTag: "SARATOGA_01" },
  { name: "Gas Oven with Stones", placedInServiceDate: "2019-05-23", purchasePrice: 28030, group: "Saratoga/Bolton Machinery", locationTag: "SARATOGA_01" },
  { name: "Bagel Roller", placedInServiceDate: "2023-02-01", purchasePrice: 32000, group: "Saratoga/Bolton Machinery", locationTag: "SARATOGA_01" },
  { name: "Kitchen Hood", placedInServiceDate: "2019-05-23", purchasePrice: 5189, group: "Saratoga/Bolton Machinery", locationTag: "SARATOGA_01" },
  { name: "Espresso Machine", placedInServiceDate: "2019-05-23", purchasePrice: 9684, group: "Saratoga/Bolton Machinery", locationTag: "SARATOGA_01" },
  { name: "Walk-in Refrigerator", placedInServiceDate: "2019-05-23", purchasePrice: 8305, group: "Saratoga/Bolton Machinery", locationTag: "SARATOGA_01" },
  { name: "Beer Towers", placedInServiceDate: "2022-08-01", purchasePrice: 4569, group: "The Tap System Assets", locationTag: "BOLTON_02" },
  { name: "Countertop High Speed Oven", placedInServiceDate: "2022-08-01", purchasePrice: 6779, group: "The Tap System Assets", locationTag: "BOLTON_02" },
  { name: "Frozen Beverage Machine", placedInServiceDate: "2022-08-01", purchasePrice: 2589, group: "The Tap System Assets", locationTag: "BOLTON_02" },
  { name: "Undercounter Nugget Ice", placedInServiceDate: "2022-08-01", purchasePrice: 3069, group: "The Tap System Assets", locationTag: "BOLTON_02" },
];

export async function seedLegacyAssets(createdBy: string) {
  const existing = await db.select().from(fixedAssets);
  const existingNames = new Set(existing.map(a => a.name.toLowerCase()));

  let seeded = 0;
  let skipped = 0;

  for (const legacy of LEGACY_ASSETS_2024) {
    if (existingNames.has(legacy.name.toLowerCase())) {
      skipped++;
      continue;
    }

    const locationId = legacy.locationTag === "SARATOGA_01" ? 1 : legacy.locationTag === "BOLTON_02" ? 2 : null;

    const [asset] = await db.insert(fixedAssets).values({
      name: legacy.name,
      description: `${legacy.group} — Transferred from prior entity. Section 179 fully expensed in prior year. Net book value $0.`,
      vendor: null,
      purchasePrice: legacy.purchasePrice,
      placedInServiceDate: legacy.placedInServiceDate,
      usefulLifeMonths: 0,
      salvageValue: 0,
      locationId,
      locationTag: legacy.locationTag,
      status: "fully_depreciated",
      section179Eligible: true,
      section179Elected: true,
      bookDepreciationMethod: "section_179",
      taxDepreciationMethod: "section_179",
      capitalizedBy: createdBy,
      capitalizedAt: new Date(),
      createdBy,
    }).returning();

    const yearStr = legacy.placedInServiceDate.split("-")[0];
    const [taxSched] = await db.insert(depreciationSchedules).values({
      assetId: asset.id,
      ledgerType: "tax",
      method: "section_179",
      totalAmount: legacy.purchasePrice,
      monthlyAmount: null,
      startDate: legacy.placedInServiceDate,
      endDate: `${yearStr}-12-31`,
      totalMonths: 1,
      yearOneDeduction: legacy.purchasePrice,
    }).returning();

    await db.insert(depreciationEntries).values({
      scheduleId: taxSched.id,
      assetId: asset.id,
      periodDate: `${yearStr}-12-31`,
      amount: legacy.purchasePrice,
      accumulatedDepreciation: legacy.purchasePrice,
      netBookValue: 0,
      posted: true,
    });

    const [bookSched] = await db.insert(depreciationSchedules).values({
      assetId: asset.id,
      ledgerType: "book",
      method: "section_179",
      totalAmount: legacy.purchasePrice,
      monthlyAmount: 0,
      startDate: legacy.placedInServiceDate,
      endDate: `${yearStr}-12-31`,
      totalMonths: 1,
      yearOneDeduction: legacy.purchasePrice,
    }).returning();

    await db.insert(depreciationEntries).values({
      scheduleId: bookSched.id,
      assetId: asset.id,
      periodDate: `${yearStr}-12-31`,
      amount: legacy.purchasePrice,
      accumulatedDepreciation: legacy.purchasePrice,
      netBookValue: 0,
      posted: true,
    });

    await db.insert(assetAuditLog).values({
      assetId: asset.id,
      action: "LEGACY_IMPORT",
      details: `2024 tax DNA upload: ${legacy.name} ($${legacy.purchasePrice.toLocaleString()}) from ${legacy.group}. Section 179 fully expensed in prior year. Net book value $0. No future depreciation.`,
      performedBy: createdBy,
    });

    seeded++;
  }

  return { seeded, skipped, total: LEGACY_ASSETS_2024.length };
}

/**
 * INTERCOMPANY RENT & S-CORP BASIS ENGINE
 *
 * Strategy: Kolby owns the Bolton Landing property via LODA Restaurant LLC (EIN 87-4427857).
 * Bear's Cup LLC (S-Corp, EIN 83-3429330) pays rent to LODA for the Bolton location.
 * This creates a deductible rent expense on Bear's Cup books and increases Kolby's S-Corp basis.
 * Saratoga is a third-party lease — no self-rental basis play there.
 *
 * Target: $50,000 annual basis contribution ($4,166.67/month) — Bolton Landing only
 *
 * COA Map:
 *   6030 = Rent (Expense - deductible on S-Corp return)
 *   3000 = Owner's Equity (basis increase)
 *
 * These entries are flagged isNonCash=true so they are invisible to bank reconciliation
 * but visible on the P&L, Balance Sheet, and K-1 basis computation.
 */
export class BasisAssessor {
  private MONTHLY_RENT_TARGET = 4166.67;
  private RENT_EXPENSE_COA = "6030";
  private EQUITY_CONTRIB_COA = "3000";
  private BOLTON_LOCATION_ID = 2;

  async runMonthlyRentAccrual(periodDate: string, locationId: number, createdBy: string = "BasisAssessor") {
    if (locationId !== this.BOLTON_LOCATION_ID) {
      console.log(`[BasisAssessor] Location ${locationId} not eligible — self-rental only applies to Bolton Landing (LODA property)`);
      return null;
    }

    const period = periodDate.slice(0, 7);
    const existing = await db.select().from(journalEntries)
      .where(
        and(
          eq(journalEntries.referenceType, "basis_rent_accrual"),
          eq(journalEntries.referenceId, `rent-${period}-loc${locationId}`),
        )
      );

    if (existing.length > 0) {
      console.log(`[BasisAssessor] Rent accrual already posted for ${period} at location ${locationId}`);
      return null;
    }

    const locationName = locationId === 1 ? "Saratoga" : "Bolton Landing";
    const entry = await createJournalEntry({
      date: periodDate,
      memo: `Monthly Self-Rental Basis Contribution – ${locationName} (${period})`,
      lines: [
        { accountCode: this.RENT_EXPENSE_COA, debit: this.MONTHLY_RENT_TARGET, credit: 0 },
        { accountCode: this.EQUITY_CONTRIB_COA, debit: 0, credit: this.MONTHLY_RENT_TARGET },
      ],
      referenceId: `rent-${period}-loc${locationId}`,
      referenceType: "basis_rent_accrual",
      locationId,
      isNonCash: true,
      createdBy,
    });

    console.log(`[BasisAssessor] Basis increased by $${this.MONTHLY_RENT_TARGET.toFixed(2)} for ${locationName} (${period})`);
    return entry;
  }

  async getAnnualBasisSummary(year: number) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const entries = await db.select().from(journalEntries)
      .where(
        and(
          eq(journalEntries.referenceType, "basis_rent_accrual"),
          gte(journalEntries.transactionDate, startDate),
          lte(journalEntries.transactionDate, endDate),
        )
      );

    const totalContributed = entries.length * this.MONTHLY_RENT_TARGET;
    const annualTarget = this.MONTHLY_RENT_TARGET * 12;

    return {
      year,
      monthsPosted: entries.length,
      totalContributed: Math.round(totalContributed * 100) / 100,
      annualTarget: Math.round(annualTarget * 100) / 100,
      remaining: Math.round((annualTarget - totalContributed) * 100) / 100,
      onTrack: entries.length >= new Date().getMonth() + 1 || year < new Date().getFullYear(),
      entries: entries.map(e => ({
        id: e.id,
        date: e.transactionDate,
        locationId: e.locationId,
        referenceId: e.referenceId,
      })),
    };
  }

  async runForBolton(periodDate: string, createdBy: string = "BasisAssessor") {
    return this.runMonthlyRentAccrual(periodDate, this.BOLTON_LOCATION_ID, createdBy);
  }
}

export const basisAssessor = new BasisAssessor();

/**
 * Backward compatibility exports
 */
export const componentizeTransaction = (
  id: number,
  comps: Array<{ name?: string; description?: string; cost: number; usefulLifeMonths?: number; usefulLife?: number; locationId: number }>,
  vendor?: string,
  purchaseDate?: string,
  createdBy?: string,
  adjustments?: Array<{ type: string; description: string; cost: number }>,
) => {
  const normalizedComps: AssetComponent[] = comps.map(c => ({
    description: c.description || c.name || "Equipment",
    cost: c.cost,
    usefulLife: c.usefulLife || (c.usefulLifeMonths ? c.usefulLifeMonths / 12 : 7),
    locationId: c.locationId,
  }));
  return assetAssessor.componentizeTransaction(id, normalizedComps, adjustments);
};

export const postMonthlyDepreciation = (periodDate: string, createdBy: string) =>
  assetAssessor.runMonthlyDepreciation(periodDate, createdBy);

export const calculateDepreciation = (locationId?: number) =>
  assetAssessor.runMonthlyDepreciation(new Date().toISOString().split("T")[0], "Ghost Accountant", locationId);

export async function logAssetAudit(assetId: number, action: string, details: string, performedBy: string, previousValues?: any, newValues?: any, reason?: string) {
  await db.insert(assetAuditLog).values({
    assetId,
    action,
    details,
    previousValues: previousValues ? JSON.stringify(previousValues) : null,
    newValues: newValues ? JSON.stringify(newValues) : null,
    reason: reason || null,
    performedBy,
  });
}
