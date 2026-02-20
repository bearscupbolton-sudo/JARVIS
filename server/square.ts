import { SquareClient, SquareEnvironment } from "square";
import { db } from "./db";
import { squareCatalogMap, squareSales, pastryTotals, bakeoffLogs } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

function getSquareClient() {
  return new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN || "",
    environment: (process.env.SQUARE_ENVIRONMENT === "production")
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  });
}

export async function testSquareConnection(): Promise<{ success: boolean; locations: any[]; error?: string }> {
  try {
    const client = getSquareClient();
    const response = await client.locations.list();
    const locs = response.locations || [];
    const locations = locs.map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      address: loc.address?.addressLine1,
      status: loc.status,
    }));
    return { success: true, locations };
  } catch (error: any) {
    console.error("Square connection test failed:", error);
    return { success: false, locations: [], error: error.message || "Connection failed" };
  }
}

export async function fetchSquareCatalog(): Promise<any[]> {
  try {
    const client = getSquareClient();
    const items: any[] = [];
    let cursor: string | undefined;

    do {
      const response: any = await client.catalog.list({ cursor, types: "ITEM" });
      const objects = response.objects || [];
      for (const obj of objects) {
        if (obj.type === "ITEM" && obj.itemData) {
          const variations = (obj.itemData.variations || []).map((v: any) => ({
            id: v.id,
            name: v.itemVariationData?.name || "Default",
            priceMoney: v.itemVariationData?.priceMoney,
          }));
          items.push({
            id: obj.id,
            name: obj.itemData.name,
            description: obj.itemData.description,
            variations,
          });
        }
      }
      cursor = response.cursor || undefined;
    } while (cursor);

    return items;
  } catch (error: any) {
    console.error("Error fetching Square catalog:", error);
    throw new Error("Failed to fetch Square catalog");
  }
}

export async function syncSquareSales(date: string, locationId?: string): Promise<{ itemsSynced: number; ordersProcessed: number }> {
  try {
    const client = getSquareClient();
    const startAt = `${date}T00:00:00Z`;
    const endAt = `${date}T23:59:59Z`;

    let locIds: string[] = [];
    if (locationId) {
      locIds = [locationId];
    } else {
      const locResponse = await client.locations.list();
      const locs = locResponse.locations || [];
      locIds = locs.map((l: any) => l.id).filter(Boolean) as string[];
    }

    const catalogMappings = await db.select().from(squareCatalogMap).where(eq(squareCatalogMap.isActive, true));
    const variationToItem = new Map<string, string>();
    const itemIdToName = new Map<string, string>();

    for (const mapping of catalogMappings) {
      if (mapping.pastryItemName) {
        if (mapping.squareVariationId) {
          variationToItem.set(mapping.squareVariationId, mapping.pastryItemName);
        }
        itemIdToName.set(mapping.squareItemId, mapping.pastryItemName);
      }
    }

    const salesAgg = new Map<string, { qty: number; revenue: number }>();
    let ordersProcessed = 0;
    let cursor: string | undefined;

    const body: any = {
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt,
              endAt,
            },
          },
          stateFilter: {
            states: ["COMPLETED"],
          },
        },
        sort: {
          sortField: "CREATED_AT",
          sortOrder: "ASC",
        },
      },
      locationIds: locIds.length > 0 ? locIds : undefined,
    };

    do {
      if (cursor) body.cursor = cursor;
      const response = await client.orders.search(body);
      const orders = response.orders || [];

      for (const order of orders) {
        ordersProcessed++;
        for (const lineItem of (order as any).lineItems || []) {
          const catalogId = lineItem.catalogObjectId;
          let pastryName: string | undefined;

          if (catalogId) {
            pastryName = variationToItem.get(catalogId) || itemIdToName.get(catalogId);
          }
          if (!pastryName && lineItem.name) {
            pastryName = lineItem.name;
          }
          if (!pastryName) continue;

          const qty = parseInt(lineItem.quantity || "1", 10);
          const revCents = lineItem.totalMoney?.amount ? Number(lineItem.totalMoney.amount) : 0;
          const existing = salesAgg.get(pastryName) || { qty: 0, revenue: 0 };
          existing.qty += qty;
          existing.revenue += revCents / 100;
          salesAgg.set(pastryName, existing);
        }
      }

      cursor = (response as any).cursor || undefined;
    } while (cursor);

    await db.delete(squareSales).where(eq(squareSales.date, date));

    const entries = Array.from(salesAgg.entries());
    for (const [itemName, data] of entries) {
      await db.insert(squareSales).values({
        date,
        itemName,
        quantitySold: data.qty,
        revenue: data.revenue,
        lastSyncedAt: new Date(),
      });
    }

    return { itemsSynced: salesAgg.size, ordersProcessed };
  } catch (error: any) {
    console.error("Error syncing Square sales:", error);
    throw new Error(`Failed to sync sales: ${error.message}`);
  }
}

export async function getSquareSalesForDate(date: string) {
  return await db.select().from(squareSales).where(eq(squareSales.date, date)).orderBy(squareSales.itemName);
}

export async function generateForecast(date: string): Promise<{ itemName: string; forecast: number; method: string; confidence: number }[]> {
  const targetDate = new Date(date);

  const pastDates: string[] = [];
  for (let weeksBack = 1; weeksBack <= 8; weeksBack++) {
    const pastDate = new Date(targetDate);
    pastDate.setDate(pastDate.getDate() - (weeksBack * 7));
    pastDates.push(pastDate.toISOString().split("T")[0]);
  }

  const allSalesData = pastDates.length > 0
    ? await db.select().from(squareSales).where(inArray(squareSales.date, pastDates))
    : [];

  const pastryGoalsData = pastDates.length > 0
    ? await db.select().from(pastryTotals).where(inArray(pastryTotals.date, pastDates))
    : [];

  const itemHistory = new Map<string, number[]>();
  for (const sale of allSalesData) {
    const list = itemHistory.get(sale.itemName) || [];
    list.push(sale.quantitySold);
    itemHistory.set(sale.itemName, list);
  }

  const goalItemHistory = new Map<string, number[]>();
  for (const goal of pastryGoalsData) {
    const list = goalItemHistory.get(goal.itemName) || [];
    list.push(goal.targetCount);
    goalItemHistory.set(goal.itemName, list);
  }

  const allItemKeys = Array.from(new Set([...Array.from(itemHistory.keys()), ...Array.from(goalItemHistory.keys())]));
  const forecasts: { itemName: string; forecast: number; method: string; confidence: number }[] = [];

  for (const itemName of allItemKeys) {
    const salesHistory = itemHistory.get(itemName) || [];
    const goalHistory = goalItemHistory.get(itemName) || [];

    if (salesHistory.length >= 3) {
      const recentWeights = salesHistory.map((_: number, i: number) => 1 / (i + 1));
      const totalWeight = recentWeights.reduce((a: number, b: number) => a + b, 0);
      const weightedAvg = salesHistory.reduce((sum: number, val: number, i: number) => sum + val * recentWeights[i], 0) / totalWeight;

      const forecast = Math.round(weightedAvg);
      const variance = salesHistory.length > 1
        ? Math.sqrt(salesHistory.reduce((sum: number, v: number) => sum + Math.pow(v - weightedAvg, 2), 0) / salesHistory.length)
        : 0;
      const confidence = Math.max(0.3, Math.min(0.95, 1 - (variance / (weightedAvg || 1)) * 0.5));

      forecasts.push({ itemName, forecast: Math.max(1, forecast), method: "weighted_average", confidence: Math.round(confidence * 100) / 100 });
    } else if (salesHistory.length > 0) {
      const avg = Math.round(salesHistory.reduce((a: number, b: number) => a + b, 0) / salesHistory.length);
      forecasts.push({ itemName, forecast: Math.max(1, avg), method: "simple_average", confidence: 0.4 });
    } else if (goalHistory.length > 0) {
      const avg = Math.round(goalHistory.reduce((a: number, b: number) => a + b, 0) / goalHistory.length);
      forecasts.push({ itemName, forecast: Math.max(1, avg), method: "goal_history", confidence: 0.3 });
    }
  }

  return forecasts.sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export async function autoPopulatePastryGoals(date: string): Promise<{ populated: number; skipped: number }> {
  const forecasts = await generateForecast(date);
  const existing = await db.select().from(pastryTotals).where(eq(pastryTotals.date, date));
  const existingMap = new Map(existing.map(e => [e.itemName, e]));

  let populated = 0;
  let skipped = 0;

  for (const forecast of forecasts) {
    const ex = existingMap.get(forecast.itemName);
    if (ex && ex.isManualOverride) {
      skipped++;
      continue;
    }

    if (ex) {
      await db.update(pastryTotals)
        .set({
          targetCount: forecast.forecast,
          forecastedCount: forecast.forecast,
          source: forecast.method,
          isManualOverride: false,
        })
        .where(eq(pastryTotals.id, ex.id));
    } else {
      await db.insert(pastryTotals).values({
        date,
        itemName: forecast.itemName,
        targetCount: forecast.forecast,
        forecastedCount: forecast.forecast,
        source: forecast.method,
        isManualOverride: false,
      });
    }
    populated++;
  }

  return { populated, skipped };
}

export async function getLiveInventoryDashboard(date: string) {
  const [goals, baked, sales] = await Promise.all([
    db.select().from(pastryTotals).where(eq(pastryTotals.date, date)),
    db.select().from(bakeoffLogs).where(eq(bakeoffLogs.date, date)),
    db.select().from(squareSales).where(eq(squareSales.date, date)),
  ]);

  const bakedAgg = new Map<string, number>();
  for (const b of baked) {
    bakedAgg.set(b.itemName, (bakedAgg.get(b.itemName) || 0) + b.quantity);
  }

  const soldAgg = new Map<string, { qty: number; revenue: number }>();
  for (const s of sales) {
    const existing = soldAgg.get(s.itemName) || { qty: 0, revenue: 0 };
    existing.qty += s.quantitySold;
    existing.revenue += s.revenue || 0;
    soldAgg.set(s.itemName, existing);
  }

  const allItemKeys = Array.from(new Set([
    ...goals.map(g => g.itemName),
    ...Array.from(bakedAgg.keys()),
    ...Array.from(soldAgg.keys()),
  ]));

  const now = new Date();
  const dayStart = new Date(date + "T06:00:00");
  const dayEnd = new Date(date + "T20:00:00");
  const elapsedHours = Math.max(0.5, (now.getTime() - dayStart.getTime()) / (1000 * 60 * 60));
  const totalHours = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
  const dayProgress = Math.min(1, elapsedHours / totalHours);

  const inventory: {
    itemName: string;
    goal: number;
    baked: number;
    sold: number;
    remaining: number;
    revenue: number;
    paceStatus: "on_track" | "selling_fast" | "selling_slow" | "sold_out" | "no_data";
    projectedSellOut: string | null;
    forecastedCount: number | null;
    isManualOverride: boolean;
    source: string | null;
  }[] = [];

  for (const itemName of allItemKeys) {
    const goalEntry = goals.find(g => g.itemName === itemName);
    const goal = goalEntry?.targetCount || 0;
    const bakedCount = bakedAgg.get(itemName) || 0;
    const soldData = soldAgg.get(itemName) || { qty: 0, revenue: 0 };
    const remaining = bakedCount - soldData.qty;

    let paceStatus: "on_track" | "selling_fast" | "selling_slow" | "sold_out" | "no_data" = "no_data";
    let projectedSellOut: string | null = null;

    if (goal > 0 && bakedCount > 0) {
      if (remaining <= 0) {
        paceStatus = "sold_out";
      } else if (dayProgress > 0.1 && soldData.qty > 0) {
        const salesRate = soldData.qty / elapsedHours;
        const expectedByNow = goal * dayProgress;
        const ratio = soldData.qty / expectedByNow;

        if (ratio > 1.2) {
          paceStatus = "selling_fast";
          if (salesRate > 0) {
            const hoursToSellOut = remaining / salesRate;
            const sellOutTime = new Date(now.getTime() + hoursToSellOut * 60 * 60 * 1000);
            projectedSellOut = sellOutTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          }
        } else if (ratio < 0.7) {
          paceStatus = "selling_slow";
        } else {
          paceStatus = "on_track";
        }
      } else {
        paceStatus = "on_track";
      }
    }

    inventory.push({
      itemName,
      goal,
      baked: bakedCount,
      sold: soldData.qty,
      remaining: Math.max(0, remaining),
      revenue: soldData.revenue,
      paceStatus,
      projectedSellOut,
      forecastedCount: goalEntry?.forecastedCount || null,
      isManualOverride: goalEntry?.isManualOverride || false,
      source: goalEntry?.source || null,
    });
  }

  return {
    date,
    dayProgress: Math.round(dayProgress * 100),
    lastSyncTime: sales.length > 0 ? sales[0].lastSyncedAt : null,
    items: inventory.sort((a, b) => a.itemName.localeCompare(b.itemName)),
  };
}

export interface TipEvent {
  orderId: string;
  tenderId: string;
  createdAt: string;
  tipAmountCents: number;
  totalAmountCents: number;
  tenderType: string;
}

export async function fetchSquareTips(date: string, locationId?: string): Promise<{ tips: TipEvent[]; totalTipsCents: number; orderCount: number }> {
  try {
    const client = getSquareClient();
    const startAt = `${date}T00:00:00Z`;
    const endAt = `${date}T23:59:59Z`;

    let locIds: string[] = [];
    if (locationId) {
      locIds = [locationId];
    } else {
      const locResponse = await client.locations.list();
      const locs = locResponse.locations || [];
      locIds = locs.map((l: any) => l.id).filter(Boolean) as string[];
    }

    if (locIds.length === 0) {
      throw new Error("No Square locations found. Configure at least one location in Square.");
    }

    const tips: TipEvent[] = [];
    let orderCount = 0;
    let cursor: string | undefined;

    const body: any = {
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: { startAt, endAt },
          },
          stateFilter: {
            states: ["COMPLETED"],
          },
        },
        sort: { sortField: "CREATED_AT", sortOrder: "ASC" },
      },
      locationIds: locIds,
    };

    do {
      if (cursor) body.cursor = cursor;
      const response = await client.orders.search(body);
      const orders = response.orders || [];

      for (const order of orders) {
        orderCount++;
        const tenders = (order as any).tenders || [];
        for (const tender of tenders) {
          const tipAmount = tender.tipMoney?.amount ? Number(tender.tipMoney.amount) : 0;
          if (tipAmount > 0) {
            tips.push({
              orderId: order.id || "",
              tenderId: tender.id || "",
              createdAt: (order as any).createdAt || "",
              tipAmountCents: tipAmount,
              totalAmountCents: tender.totalMoney?.amount ? Number(tender.totalMoney.amount) : 0,
              tenderType: tender.type || "OTHER",
            });
          }
        }
      }

      cursor = (response as any).cursor || undefined;
    } while (cursor);

    const totalTipsCents = tips.reduce((sum, t) => sum + t.tipAmountCents, 0);
    return { tips, totalTipsCents, orderCount };
  } catch (error: any) {
    console.error("Error fetching Square tips:", error);
    throw new Error(`Failed to fetch tips: ${error.message}`);
  }
}