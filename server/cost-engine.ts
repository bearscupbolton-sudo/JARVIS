import { db } from "./db";
import {
  recipes, inventoryItems, invoiceLines,
  pastryPassports, pastryComponents, pastryAddins,
  pastryItems, laminationDoughs, doughTypeConfigs,
  type Recipe, type InventoryItem, type PastryPassport,
} from "@shared/schema";
import { eq, desc, and, isNotNull, ne } from "drizzle-orm";

const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  kg: { g: 1000, oz: 35.274, lb: 2.20462 },
  g: { kg: 0.001, oz: 0.035274, lb: 0.00220462 },
  lb: { oz: 16, g: 453.592, kg: 0.453592 },
  oz: { lb: 0.0625, g: 28.3495, kg: 0.0283495 },
  l: { ml: 1000, gal: 0.264172, qt: 1.05669 },
  ml: { l: 0.001, gal: 0.000264172 },
  gal: { l: 3.78541, ml: 3785.41, qt: 4 },
  qt: { l: 0.946353, ml: 946.353, gal: 0.25 },
};

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim().replace(/\.$/, "").replace(/s$/, "");
  const aliases: Record<string, string> = {
    kilogram: "kg", kilo: "kg",
    gram: "g",
    pound: "lb",
    ounce: "oz",
    liter: "l", litre: "l",
    milliliter: "ml", millilitre: "ml",
    gallon: "gal",
    quart: "qt",
    each: "ea", unit: "ea", piece: "ea", pc: "ea",
  };
  return aliases[u] || u;
}

function convertQuantity(qty: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return qty;
  const conversions = UNIT_CONVERSIONS[from];
  if (conversions && conversions[to] !== undefined) {
    return qty * conversions[to];
  }
  return null;
}

export type IngredientCostBreakdown = {
  name: string;
  quantity: number;
  unit: string;
  inventoryItemId: number | null;
  inventoryItemName: string | null;
  costPerUnit: number | null;
  totalCost: number | null;
  matched: boolean;
  unitConverted: boolean;
};

export type RecipeCostResult = {
  recipeId: number;
  recipeName: string;
  yieldAmount: number;
  yieldUnit: string;
  totalCost: number | null;
  costPerYieldUnit: number | null;
  ingredients: IngredientCostBreakdown[];
  unmatchedCount: number;
  matchedCount: number;
};

export async function calculateRecipeCost(recipeId: number): Promise<RecipeCostResult | null> {
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
  if (!recipe) return null;

  const allItems = await db.select().from(inventoryItems);
  const ingredients = (recipe.ingredients as any[]) || [];

  const breakdowns: IngredientCostBreakdown[] = [];
  let totalCost = 0;
  let allMatched = true;

  for (const ing of ingredients) {
    const ingName = (ing.name || "").toLowerCase().trim();
    const ingUnit = normalizeUnit(ing.unit || "");
    const ingQty = ing.quantity || 0;

    let matchedItem: InventoryItem | null = null;
    for (const item of allItems) {
      if (item.name.toLowerCase().trim() === ingName) {
        matchedItem = item;
        break;
      }
      if (item.aliases?.some((a: string) => a.toLowerCase().trim() === ingName)) {
        matchedItem = item;
        break;
      }
    }

    if (matchedItem && matchedItem.costPerUnit != null) {
      const itemUnit = normalizeUnit(matchedItem.unit);
      let convertedQty = convertQuantity(ingQty, ingUnit, itemUnit);
      const unitConverted = convertedQty !== null && ingUnit !== itemUnit;

      if (convertedQty === null) {
        convertedQty = ingQty;
      }

      const cost = convertedQty * matchedItem.costPerUnit;
      totalCost += cost;

      breakdowns.push({
        name: ing.name,
        quantity: ingQty,
        unit: ing.unit,
        inventoryItemId: matchedItem.id,
        inventoryItemName: matchedItem.name,
        costPerUnit: matchedItem.costPerUnit,
        totalCost: cost,
        matched: true,
        unitConverted,
      });
    } else {
      allMatched = false;
      breakdowns.push({
        name: ing.name,
        quantity: ingQty,
        unit: ing.unit,
        inventoryItemId: matchedItem?.id || null,
        inventoryItemName: matchedItem?.name || null,
        costPerUnit: matchedItem?.costPerUnit || null,
        totalCost: null,
        matched: !!matchedItem,
        unitConverted: false,
      });
    }
  }

  const matchedCount = breakdowns.filter(b => b.totalCost !== null).length;
  const unmatchedCount = breakdowns.length - matchedCount;

  return {
    recipeId: recipe.id,
    recipeName: recipe.title,
    yieldAmount: recipe.yieldAmount,
    yieldUnit: recipe.yieldUnit,
    totalCost: matchedCount > 0 ? totalCost : null,
    costPerYieldUnit: matchedCount > 0 && recipe.yieldAmount > 0 ? totalCost / recipe.yieldAmount : null,
    ingredients: breakdowns,
    unmatchedCount,
    matchedCount,
  };
}

export type PastryCostResult = {
  pastryItemId: number;
  pastryName: string;
  doughCost: {
    recipeId: number | null;
    recipeName: string | null;
    totalRecipeCost: number | null;
    piecesFromDough: number | null;
    weightPerPieceG: number | null;
    doughWeightG: number | null;
    wasteG: number | null;
    costPerPiece: number | null;
    allocationMethod: "weight" | "equal" | "none";
  };
  laminationFatCost: {
    fatDescription: string | null;
    fatRatio: number | null;
    fatCostPerUnit: number | null;
    fatCostPerPiece: number | null;
    configured: boolean;
  };
  addinsCost: {
    items: Array<{
      name: string;
      quantity: number | null;
      unit: string | null;
      costPerUnit: number | null;
      totalCost: number | null;
      inventoryItemId: number | null;
      linked: boolean;
    }>;
    total: number | null;
  };
  componentsCost: {
    items: Array<{
      recipeId: number;
      recipeName: string;
      totalCost: number | null;
    }>;
    total: number | null;
  };
  totalCost: number | null;
  dataCompleteness: "full" | "partial" | "none";
};

export async function calculatePastryCost(pastryItemId: number): Promise<PastryCostResult | null> {
  const [item] = await db.select().from(pastryItems).where(eq(pastryItems.id, pastryItemId));
  if (!item) return null;

  const allPassports = await db.select().from(pastryPassports);
  const passport = allPassports.find(p => p.pastryItemId === pastryItemId)
    || allPassports.find(p => p.name.toLowerCase() === item.name.toLowerCase());

  let doughCost: PastryCostResult["doughCost"] = {
    recipeId: null, recipeName: null, totalRecipeCost: null,
    piecesFromDough: null, weightPerPieceG: null, doughWeightG: null,
    wasteG: null, costPerPiece: null, allocationMethod: "none",
  };

  if (passport?.motherRecipeId) {
    const recipeCost = await calculateRecipeCost(passport.motherRecipeId);
    if (recipeCost) {
      doughCost.recipeId = recipeCost.recipeId;
      doughCost.recipeName = recipeCost.recipeName;
      doughCost.totalRecipeCost = recipeCost.totalCost;

      const recentDoughs = await db.select().from(laminationDoughs)
        .where(
          and(
            eq(laminationDoughs.doughType, item.doughType),
            isNotNull(laminationDoughs.shapings),
            ne(laminationDoughs.status, "trashed"),
          )
        )
        .orderBy(desc(laminationDoughs.createdAt))
        .limit(5);

      let avgPieces = 0;
      let avgWeightPerPiece: number | null = null;
      let avgDoughWeight: number | null = null;
      let avgWaste: number | null = null;

      if (recentDoughs.length > 0) {
        const relevantDoughs = recentDoughs.filter(d => {
          const shapings = d.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>;
          return shapings?.some(s => s.pastryType === item.name);
        });

        const doughsToUse = relevantDoughs.length > 0 ? relevantDoughs : recentDoughs;

        avgPieces = doughsToUse.reduce((sum, d) => sum + (d.totalPieces || 0), 0) / doughsToUse.length;
        doughCost.piecesFromDough = Math.round(avgPieces);

        const weightsPerPiece: number[] = [];
        const doughWeights: number[] = [];
        const wastes: number[] = [];

        for (const d of doughsToUse) {
          if (d.doughWeightG) doughWeights.push(d.doughWeightG);
          if (d.wasteG != null) wastes.push(d.wasteG);
          const shapings = d.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>;
          if (shapings) {
            for (const s of shapings) {
              if (s.pastryType === item.name && s.weightPerPieceG) {
                weightsPerPiece.push(s.weightPerPieceG);
              }
            }
          }
        }

        if (weightsPerPiece.length > 0) {
          avgWeightPerPiece = weightsPerPiece.reduce((a, b) => a + b, 0) / weightsPerPiece.length;
          doughCost.weightPerPieceG = Math.round(avgWeightPerPiece);
        }
        if (doughWeights.length > 0) {
          avgDoughWeight = doughWeights.reduce((a, b) => a + b, 0) / doughWeights.length;
          doughCost.doughWeightG = Math.round(avgDoughWeight);
        }
        if (wastes.length > 0) {
          avgWaste = wastes.reduce((a, b) => a + b, 0) / wastes.length;
          doughCost.wasteG = Math.round(avgWaste);
        }

        if (recipeCost.totalCost != null && avgWeightPerPiece && avgDoughWeight) {
          const usableWeight = avgDoughWeight - (avgWaste || 0);
          if (usableWeight > 0) {
            doughCost.costPerPiece = (recipeCost.totalCost * avgWeightPerPiece) / usableWeight;
            doughCost.allocationMethod = "weight";
          }
        } else if (recipeCost.totalCost != null && avgPieces > 0) {
          doughCost.costPerPiece = recipeCost.totalCost / avgPieces;
          doughCost.allocationMethod = "equal";
        }
      }
    }
  }

  let laminationFatCost: PastryCostResult["laminationFatCost"] = {
    fatDescription: null, fatRatio: null, fatCostPerUnit: null,
    fatCostPerPiece: null, configured: false,
  };

  const [dtConfig] = await db.select().from(doughTypeConfigs).where(eq(doughTypeConfigs.doughType, item.doughType));
  if (dtConfig && dtConfig.fatRatio) {
    laminationFatCost.configured = true;
    laminationFatCost.fatDescription = dtConfig.fatDescription;
    laminationFatCost.fatRatio = dtConfig.fatRatio;

    if (dtConfig.fatInventoryItemId) {
      const allInvItems = await db.select().from(inventoryItems);
      const fatItem = allInvItems.find(i => i.id === dtConfig.fatInventoryItemId);
      if (fatItem?.costPerUnit != null) {
        laminationFatCost.fatCostPerUnit = fatItem.costPerUnit;
        const fatUnit = normalizeUnit(fatItem.unit);

        if (doughCost.weightPerPieceG && doughCost.doughWeightG) {
          const totalFatWeightG = doughCost.doughWeightG * dtConfig.fatRatio / (1 - dtConfig.fatRatio);
          let fatWeightInItemUnit = convertQuantity(totalFatWeightG, "g", fatUnit);
          if (fatWeightInItemUnit === null) fatWeightInItemUnit = totalFatWeightG / 1000;
          const totalFatCost = fatWeightInItemUnit * fatItem.costPerUnit;
          const usableWeight = doughCost.doughWeightG - (doughCost.wasteG || 0);
          if (usableWeight > 0 && doughCost.weightPerPieceG) {
            laminationFatCost.fatCostPerPiece = (totalFatCost * doughCost.weightPerPieceG) / usableWeight;
          }
        } else if (doughCost.piecesFromDough && doughCost.piecesFromDough > 0 && doughCost.totalRecipeCost != null) {
          const fatCostTotal = doughCost.totalRecipeCost * dtConfig.fatRatio / (1 - dtConfig.fatRatio);
          laminationFatCost.fatCostPerPiece = fatCostTotal / doughCost.piecesFromDough;
        }
      }
    }
  }

  let addinsCost: PastryCostResult["addinsCost"] = { items: [], total: null };
  let componentsCost: PastryCostResult["componentsCost"] = { items: [], total: null };

  if (passport) {
    const addins = await db.select().from(pastryAddins).where(eq(pastryAddins.pastryId, passport.id));
    const allInvItems = await db.select().from(inventoryItems);
    let addinsTotal = 0;
    let hasAddinCost = false;

    for (const addin of addins) {
      let invItem: InventoryItem | null = null;
      if (addin.inventoryItemId) {
        invItem = allInvItems.find(i => i.id === addin.inventoryItemId) || null;
      }

      let addinCost: number | null = null;
      if (invItem?.costPerUnit != null && addin.quantity != null) {
        const addinUnit = normalizeUnit(addin.unit || "");
        const invUnit = normalizeUnit(invItem.unit);
        let convertedQty = convertQuantity(addin.quantity, addinUnit, invUnit);
        if (convertedQty === null) convertedQty = addin.quantity;
        addinCost = convertedQty * invItem.costPerUnit;
        addinsTotal += addinCost;
        hasAddinCost = true;
      }

      addinsCost.items.push({
        name: addin.name,
        quantity: addin.quantity,
        unit: addin.unit,
        costPerUnit: invItem?.costPerUnit || null,
        totalCost: addinCost,
        inventoryItemId: addin.inventoryItemId,
        linked: !!addin.inventoryItemId,
      });
    }
    if (hasAddinCost) addinsCost.total = addinsTotal;

    const components = await db.select().from(pastryComponents).where(eq(pastryComponents.pastryId, passport.id));
    let compTotal = 0;
    let hasCompCost = false;

    for (const comp of components) {
      const compCost = await calculateRecipeCost(comp.recipeId);
      componentsCost.items.push({
        recipeId: comp.recipeId,
        recipeName: compCost?.recipeName || "Unknown",
        totalCost: compCost?.totalCost || null,
      });
      if (compCost?.totalCost != null) {
        compTotal += compCost.totalCost;
        hasCompCost = true;
      }
    }
    if (hasCompCost) componentsCost.total = compTotal;
  }

  const doughPart = doughCost.costPerPiece || 0;
  const fatPart = laminationFatCost.fatCostPerPiece || 0;
  const addinPart = addinsCost.total || 0;
  const compPart = componentsCost.total || 0;
  const hasAnyCost = doughCost.costPerPiece != null || laminationFatCost.fatCostPerPiece != null || addinsCost.total != null || componentsCost.total != null;

  let dataCompleteness: "full" | "partial" | "none" = "none";
  if (hasAnyCost) {
    const hasDough = doughCost.costPerPiece != null;
    const hasFat = !laminationFatCost.configured || laminationFatCost.fatCostPerPiece != null;
    const hasAllAddins = addinsCost.items.length === 0 || addinsCost.items.every(a => a.totalCost != null);
    const hasAllComps = componentsCost.items.length === 0 || componentsCost.items.every(c => c.totalCost != null);
    dataCompleteness = hasDough && hasFat && hasAllAddins && hasAllComps ? "full" : "partial";
  }

  return {
    pastryItemId: item.id,
    pastryName: item.name,
    doughCost,
    laminationFatCost,
    addinsCost,
    componentsCost,
    totalCost: hasAnyCost ? doughPart + fatPart + addinPart + compPart : null,
    dataCompleteness,
  };
}

export type PastryCostSummary = {
  totalCost: number | null;
  dataCompleteness: "full" | "partial" | "none";
};

export async function calculateAllPastryCosts(): Promise<Record<number, PastryCostSummary>> {
  const allItems = await db.select().from(pastryItems);
  const result: Record<number, PastryCostSummary> = {};

  for (const item of allItems) {
    try {
      const cost = await calculatePastryCost(item.id);
      if (cost) {
        result[item.id] = {
          totalCost: cost.totalCost,
          dataCompleteness: cost.dataCompleteness,
        };
      }
    } catch {
      result[item.id] = { totalCost: null, dataCompleteness: "none" };
    }
  }

  return result;
}
