import { db } from "./db";
import { fixedAssets, depreciationSchedules, depreciationEntries, assetAuditLog } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createJournalEntry } from "./accounting-engine";

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

export async function postMonthlyDepreciation(periodDate: string, createdBy: string) {
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
  for (const row of unpaidEntries) {
    const entry = row.depreciation_entries;
    const schedule = row.depreciation_schedules;

    const [asset] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, entry.assetId));
    if (!asset || asset.status !== "capitalized") continue;

    const je = await createJournalEntry({
      date: periodDate,
      memo: `Monthly depreciation: ${asset.name} (${periodDate})`,
      lines: [
        { accountCode: "6130", debit: entry.amount, credit: 0 },
        { accountCode: "1510", debit: 0, credit: entry.amount },
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

    posted++;
  }

  return { posted, periodDate };
}

export async function getAssetSummary() {
  const assets = await db.select().from(fixedAssets).where(eq(fixedAssets.status, "capitalized"));
  const schedules = await db.select().from(depreciationSchedules);
  const entries = await db.select().from(depreciationEntries);

  const totalCost = assets.reduce((s, a) => s + a.purchasePrice, 0);

  let totalBookDepreciation = 0;
  let totalTaxDeduction = 0;
  for (const asset of assets) {
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
        purchasePrice: a.purchasePrice,
        monthlyDepreciation: bookScheds[0]?.monthlyAmount || 0,
        accumulatedDepreciation: Math.round(accum * 100) / 100,
        netBookValue: Math.round((a.purchasePrice - accum) * 100) / 100,
        locationTag: a.locationTag,
      };
    }),
  };
}

export async function getCapExRecommendation(purchasePrice: number, ytdNetIncome: number) {
  const section179Limit2026 = 2_560_000;
  const phaseOutStart2026 = 4_090_000;

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
