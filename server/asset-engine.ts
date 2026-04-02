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
      assetType: isLeasehold ? "leasehold" : "equipment",
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

export async function seedTurboChefFinancing(createdBy: string) {
  const existing = await db.select().from(fixedAssets)
    .where(eq(fixedAssets.name, "TurboChef Speed Oven"));
  if (existing.length > 0) {
    console.log("[TurboChef Seed] Already exists, skipping");
    return { seeded: false, assetId: existing[0].id };
  }

  const purchasePrice = 17914.03;
  const interestTotal = 313.50;
  const loanAmount = 18227.53;
  const disbursementDate = "2025-11-27";
  const usefulLifeMonths = 84;

  const [asset] = await db.insert(fixedAssets).values({
    name: "TurboChef Speed Oven",
    description: "Financed via Eleven36 (CK-ICJ5757, Order FSX10769000). Loan: $18,227.53 (1.75% interest). 2 payments.",
    vendor: "Eleven36",
    purchasePrice,
    placedInServiceDate: disbursementDate,
    usefulLifeMonths,
    salvageValue: 0,
    locationId: 1,
    locationTag: "SARATOGA_01",
    status: "capitalized",
    section179Eligible: true,
    section179Elected: false,
    bookDepreciationMethod: "straight_line",
    taxDepreciationMethod: "straight_line",
    capitalizedBy: createdBy,
    capitalizedAt: new Date(),
    createdBy,
  }).returning();

  const equipmentAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1500")).limit(1);
  const loansAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2500")).limit(1);
  const cashAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);
  const interestAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6260")).limit(1);

  if (equipmentAcct.length > 0 && loansAcct.length > 0) {
    const [capitalizeJE] = await db.insert(journalEntries).values({
      transactionDate: disbursementDate,
      description: "Capitalize TurboChef Speed Oven — financed via Eleven36",
      referenceType: "capex",
      referenceId: `turbochef-capitalize-${asset.id}`,
      createdBy,
      status: "posted",
    }).returning();

    if (capitalizeJE) {
      const { ledgerLines } = await import("@shared/schema");
      await db.insert(ledgerLines).values([
        { entryId: capitalizeJE.id, accountId: equipmentAcct[0].id, debit: purchasePrice, credit: 0, memo: "Capitalize TurboChef Speed Oven" },
        { entryId: capitalizeJE.id, accountId: loansAcct[0].id, debit: 0, credit: purchasePrice, memo: "Eleven36 equipment financing" },
      ]);

      await db.update(fixedAssets).set({ journalEntryId: capitalizeJE.id }).where(eq(fixedAssets.id, asset.id));
    }
  }

  const payments = [
    { date: "2025-12-29", total: 9113.77, principal: 8957.02, interest: 156.75 },
    { date: "2026-01-27", total: 9113.76, principal: 8957.01, interest: 156.75 },
  ];

  for (const pmt of payments) {
    const existingJE = await db.select().from(journalEntries)
      .where(eq(journalEntries.referenceId, `turbochef-pmt-${pmt.date}`)).limit(1);
    if (existingJE.length > 0) continue;

    if (loansAcct.length > 0 && cashAcct.length > 0 && interestAcct.length > 0) {
      const [pmtJE] = await db.insert(journalEntries).values({
        transactionDate: pmt.date,
        description: `Eleven36 TurboChef payment — $${pmt.total.toFixed(2)} (principal $${pmt.principal.toFixed(2)} + interest $${pmt.interest.toFixed(2)})`,
        referenceType: "loan_payment",
        referenceId: `turbochef-pmt-${pmt.date}`,
        createdBy,
        status: "posted",
      }).returning();

      if (pmtJE) {
        const { ledgerLines } = await import("@shared/schema");
        await db.insert(ledgerLines).values([
          { entryId: pmtJE.id, accountId: loansAcct[0].id, debit: pmt.principal, credit: 0, memo: `Eleven36 principal: TurboChef` },
          { entryId: pmtJE.id, accountId: interestAcct[0].id, debit: pmt.interest, credit: 0, memo: `Eleven36 interest (1.75%): TurboChef` },
          { entryId: pmtJE.id, accountId: cashAcct[0].id, debit: 0, credit: pmt.total, memo: `Eleven36 payment: TurboChef` },
        ]);
      }
    }
  }

  const bookSchedule = calculateStraightLineSchedule(purchasePrice, 0, usefulLifeMonths, disbursementDate);

  const [bookSched] = await db.insert(depreciationSchedules).values({
    assetId: asset.id,
    ledgerType: "book",
    method: "straight_line",
    totalAmount: bookSchedule.totalAmount,
    monthlyAmount: bookSchedule.monthlyAmount,
    startDate: disbursementDate,
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

  const taxSchedule = calculateSection179Schedule(purchasePrice, disbursementDate);
  const [taxSched] = await db.insert(depreciationSchedules).values({
    assetId: asset.id,
    ledgerType: "tax",
    method: "section_179",
    totalAmount: taxSchedule.totalAmount,
    monthlyAmount: null,
    startDate: disbursementDate,
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

  await logAssetAudit(
    asset.id,
    "FINANCED_ASSET_SEED",
    `TurboChef Speed Oven seeded. Purchase: $${purchasePrice.toLocaleString()}, Financed: $${loanAmount.toLocaleString()} via Eleven36 (1.75%). ` +
    `2 payments: 12/29/2025 ($9,113.77) + 01/27/2026 ($9,113.76). Book: straight-line ${usefulLifeMonths}mo ($${bookSchedule.monthlyAmount.toFixed(2)}/mo). Tax: §179 eligible.`,
    createdBy
  );

  console.log(`[TurboChef Seed] Created asset #${asset.id}, capitalization JE, 2 payment JEs, book + tax depreciation schedules`);
  return { seeded: true, assetId: asset.id };
}

export async function seedLoanProfiles(createdBy: string) {
  const { firmRecurringObligations } = await import("@shared/schema");
  const existing = await db.select().from(firmRecurringObligations);
  const existingNames = new Set(existing.map(o => o.name.toLowerCase()));
  let seeded = 0;

  // --- 1. SBA 7(a) Loan — $400K via City National Bank ---
  if (!existingNames.has("sba 7(a) loan — city national bank")) {
    await db.insert(firmRecurringObligations).values({
      name: "SBA 7(a) Loan — City National Bank",
      type: "loan",
      creditor: "City National Bank / Windsor Servicing",
      originalAmount: 400000.00,
      currentBalance: 400000.00,
      monthlyPayment: 5453.55,
      interestRate: 10.75,
      paymentDueDay: 1,
      frequency: "monthly",
      startDate: "2024-11-19",
      endDate: "2034-12-01",
      nextPaymentDate: "2026-05-01",
      autopay: true,
      category: "debt_payment",
      notes: "SBA 7(a) variable rate (Prime + 2.75%). Initial rate 10.75%. Maturity 12/1/2034. " +
        "Windsor services the loan — notices sent to Gmail. Monthly payment split: principal reduces 2500, interest to 6260.",
      isActive: true,
    });

    const loansAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2500")).limit(1);
    const cashAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);
    if (loansAcct.length > 0 && cashAcct.length > 0) {
      const existingJE = await db.select().from(journalEntries)
        .where(eq(journalEntries.referenceId, "sba-loan-origination-2024")).limit(1);
      if (existingJE.length === 0) {
        const [je] = await db.insert(journalEntries).values({
          transactionDate: "2024-11-19",
          description: "SBA 7(a) Loan origination — $400,000 via City National Bank",
          referenceType: "loan_origination",
          referenceId: "sba-loan-origination-2024",
          createdBy,
          status: "posted",
        }).returning();
        if (je) {
          const { ledgerLines } = await import("@shared/schema");
          await db.insert(ledgerLines).values([
            { entryId: je.id, accountId: cashAcct[0].id, debit: 400000, credit: 0, memo: "SBA 7(a) loan proceeds" },
            { entryId: je.id, accountId: loansAcct[0].id, debit: 0, credit: 400000, memo: "SBA 7(a) loan liability" },
          ]);
        }
      }
    }
    seeded++;
    console.log("[Loan Seed] SBA 7(a) — $400K loan obligation created");
  }

  // --- 2. Navitas Equipment Finance — Mytico Due espresso machine ---
  if (!existingNames.has("navitas equipment finance — mytico due")) {
    const purchasePrice = 40799.05;
    const monthlyPayment = 895.77;
    const termMonths = 60;
    const totalPayments = monthlyPayment * termMonths;
    const totalInterest = totalPayments - purchasePrice;
    const monthlyInterest = totalInterest / termMonths;
    const monthlyPrincipal = monthlyPayment - monthlyInterest;

    await db.insert(firmRecurringObligations).values({
      name: "Navitas Equipment Finance — Mytico Due",
      type: "equipment_finance",
      creditor: "Navitas Credit Corp",
      originalAmount: purchasePrice,
      currentBalance: purchasePrice,
      monthlyPayment,
      interestRate: null,
      paymentDueDay: 18,
      frequency: "monthly",
      startDate: "2025-09-18",
      endDate: "2030-09-18",
      nextPaymentDate: "2026-05-18",
      autopay: true,
      category: "debt_payment",
      notes: `Equipment Finance Agreement #41511478. Mytico Due two-step espresso machine from Liemco Ltd. ` +
        `Amount financed: $${purchasePrice.toLocaleString()}. 60 payments @ $${monthlyPayment}/mo. ` +
        `Processing fee: $275. ACH from TD Bank (Bolton). Guarantor: Louis DeSantis.`,
      isActive: true,
    });

    const existingAsset = await db.select().from(fixedAssets)
      .where(eq(fixedAssets.name, "Mytico Due Espresso Machine"));
    if (existingAsset.length === 0) {
      const [asset] = await db.insert(fixedAssets).values({
        name: "Mytico Due Espresso Machine",
        description: "Mytico Due two-step machine, four coffee hoppers with dedicated grinders, 8\" touch screen. " +
          "Financed via Navitas Credit Corp (#41511478) from Liemco Ltd. 60mo @ $895.77/mo.",
        vendor: "Liemco Ltd",
        purchasePrice,
        placedInServiceDate: "2025-09-18",
        usefulLifeMonths: termMonths,
        salvageValue: 0,
        locationId: 1,
        locationTag: "SARATOGA_01",
        status: "capitalized",
        section179Eligible: true,
        section179Elected: false,
        bookDepreciationMethod: "straight_line",
        taxDepreciationMethod: "straight_line",
        capitalizedBy: createdBy,
        capitalizedAt: new Date(),
        createdBy,
      }).returning();

      const equipmentAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1500")).limit(1);
      const loansAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2500")).limit(1);

      if (equipmentAcct.length > 0 && loansAcct.length > 0) {
        const existingJE = await db.select().from(journalEntries)
          .where(eq(journalEntries.referenceId, `navitas-capitalize-${asset.id}`)).limit(1);
        if (existingJE.length === 0) {
          const [je] = await db.insert(journalEntries).values({
            transactionDate: "2025-09-18",
            description: "Capitalize Mytico Due Espresso Machine — financed via Navitas Credit Corp",
            referenceType: "capex",
            referenceId: `navitas-capitalize-${asset.id}`,
            createdBy,
            status: "posted",
          }).returning();
          if (je) {
            const { ledgerLines } = await import("@shared/schema");
            await db.insert(ledgerLines).values([
              { entryId: je.id, accountId: equipmentAcct[0].id, debit: purchasePrice, credit: 0, memo: "Capitalize Mytico Due (Navitas financing)" },
              { entryId: je.id, accountId: loansAcct[0].id, debit: 0, credit: purchasePrice, memo: "Navitas equipment finance liability" },
            ]);
          }
        }
      }

      const bookSchedule = calculateStraightLineSchedule(purchasePrice, 0, termMonths, "2025-09-18");
      const [bookSched] = await db.insert(depreciationSchedules).values({
        assetId: asset.id,
        ledgerType: "book",
        method: "straight_line",
        totalAmount: bookSchedule.totalAmount,
        monthlyAmount: bookSchedule.monthlyAmount,
        startDate: "2025-09-18",
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

      const taxSchedule = calculateSection179Schedule(purchasePrice, "2025-09-18");
      const [taxSched] = await db.insert(depreciationSchedules).values({
        assetId: asset.id,
        ledgerType: "tax",
        method: "section_179",
        totalAmount: taxSchedule.totalAmount,
        monthlyAmount: null,
        startDate: "2025-09-18",
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

      await logAssetAudit(
        asset.id,
        "FINANCED_ASSET_SEED",
        `Mytico Due Espresso Machine seeded. Purchase: $${purchasePrice.toLocaleString()}, ` +
        `Financed via Navitas #41511478 (60mo @ $${monthlyPayment}/mo). Vendor: Liemco Ltd. Location: Saratoga.`,
        createdBy
      );

      console.log(`[Loan Seed] Navitas — Mytico Due asset #${asset.id} created with depreciation schedules`);
    }
    seeded++;
    console.log("[Loan Seed] Navitas Equipment Finance — $40.8K obligation created");
  }

  // --- 3. Square Capital Loan — $50K ($58.3K payback) ---
  if (!existingNames.has("square capital loan — bolton landing")) {
    await db.insert(firmRecurringObligations).values({
      name: "Square Capital Loan — Bolton Landing",
      type: "revenue_based",
      creditor: "Square Financial Services",
      originalAmount: 50000.00,
      currentBalance: 58300.00,
      monthlyPayment: 3238.88,
      interestRate: null,
      paymentDueDay: null,
      frequency: "daily",
      startDate: "2025-10-17",
      endDate: "2027-04-17",
      nextPaymentDate: null,
      autopay: true,
      category: "debt_payment",
      notes: "Square Capital loan. Loan Amount: $50,000. Loan Fee: $8,300 (flat). Loan Balance: $58,300. " +
        "Repayment: 10% of daily Square sales at Bolton Landing (Location XFS6DD0Z4HHKJ). " +
        "Minimum payment: $3,238.88 every 60 days. Maturity: 4/17/2027. " +
        "Repayments auto-deducted from Square deposits — already reflected in net deposit amounts.",
      isActive: true,
    });

    const loansAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2500")).limit(1);
    const cashAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);
    if (loansAcct.length > 0 && cashAcct.length > 0) {
      const existingJE = await db.select().from(journalEntries)
        .where(eq(journalEntries.referenceId, "square-capital-origination-2025")).limit(1);
      if (existingJE.length === 0) {
        const [je] = await db.insert(journalEntries).values({
          transactionDate: "2025-10-17",
          description: "Square Capital loan origination — $50,000 (fee: $8,300, total payback: $58,300)",
          referenceType: "loan_origination",
          referenceId: "square-capital-origination-2025",
          createdBy,
          status: "posted",
        }).returning();
        if (je) {
          const { ledgerLines } = await import("@shared/schema");
          const interestAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6260")).limit(1);
          await db.insert(ledgerLines).values([
            { entryId: je.id, accountId: cashAcct[0].id, debit: 50000, credit: 0, memo: "Square Capital loan proceeds" },
            { entryId: je.id, accountId: loansAcct[0].id, debit: 0, credit: 50000, memo: "Square Capital loan liability" },
          ]);
          if (interestAcct.length > 0) {
            const [feeJE] = await db.insert(journalEntries).values({
              transactionDate: "2025-10-17",
              description: "Square Capital loan fee — $8,300 (amortized over loan term as interest expense)",
              referenceType: "loan_fee",
              referenceId: "square-capital-fee-2025",
              createdBy,
              status: "posted",
            }).returning();
            if (feeJE) {
              await db.insert(ledgerLines).values([
                { entryId: feeJE.id, accountId: interestAcct[0].id, debit: 8300, credit: 0, memo: "Square Capital loan fee" },
                { entryId: feeJE.id, accountId: loansAcct[0].id, debit: 0, credit: 8300, memo: "Square Capital fee added to loan balance" },
              ]);
            }
          }
        }
      }
    }
    seeded++;
    console.log("[Loan Seed] Square Capital — $50K loan obligation created");
  }

  console.log(`[Loan Seed] Complete: ${seeded} new loan(s) seeded`);
  return { seeded };
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
