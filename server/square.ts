import { SquareClient, SquareEnvironment } from "square";
import { db } from "./db";
import { squareCatalogMap, squareSales, squareDailySummary, pastryTotals, bakeoffLogs, locations, pastryItems, timeEntries, breakEntries, wholesaleOrders } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, or, gte, lte, inArray, isNull, isNotNull } from "drizzle-orm";

function getSquareClient() {
  return new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN || "",
    environment: (process.env.SQUARE_ENVIRONMENT === "production")
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  });
}

const activeSyncs = new Map<string, Promise<{ itemsSynced: number; ordersProcessed: number }>>();

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
      const objects = response.objects || response.data || [];

      for (const obj of objects) {
        const isItem = obj.type === "ITEM";
        const data = obj.itemData || obj.item_data;
        if (isItem && data) {
          const vars = data.variations || data.item_variations || [];
          const variations = vars.map((v: any) => {
            const vData = v.itemVariationData || v.item_variation_data || {};
            const pm = vData.priceMoney || vData.price_money;
            return {
              id: v.id,
              name: vData.name || "Default",
              priceMoney: pm ? { amount: Number(pm.amount ?? 0), currency: pm.currency } : undefined,
            };
          });
          items.push({
            id: obj.id,
            name: data.name,
            description: data.description || data.descriptionPlaintext || data.description_plaintext,
            variations,
          });
        }
      }
      cursor = response.cursor || undefined;
    } while (cursor);

    return JSON.parse(JSON.stringify(items, (_, v) => typeof v === "bigint" ? Number(v) : v));
  } catch (error: any) {
    console.error("Error fetching Square catalog:", error);
    throw new Error("Failed to fetch Square catalog");
  }
}

export async function syncSquareSales(date: string, jarvisLocationId?: number): Promise<{ itemsSynced: number; ordersProcessed: number }> {
  const lockKey = `${date}:${jarvisLocationId ?? "all"}`;
  const existing = activeSyncs.get(lockKey);
  if (existing) {
    console.log(`[Square Sync] Sync already in progress for ${lockKey}, waiting for it to finish`);
    return existing;
  }

  const syncPromise = doSyncSquareSales(date, jarvisLocationId);
  activeSyncs.set(lockKey, syncPromise);
  try {
    const result = await syncPromise;
    return result;
  } finally {
    activeSyncs.delete(lockKey);
  }
}

async function doSyncSquareSales(date: string, jarvisLocationId?: number): Promise<{ itemsSynced: number; ordersProcessed: number }> {
  try {
    const client = getSquareClient();
    const startAt = `${date}T00:00:00Z`;
    const endAt = `${date}T23:59:59Z`;

    let squareLocIds: string[] = [];

    if (jarvisLocationId) {
      const [loc] = await db.select().from(locations).where(eq(locations.id, jarvisLocationId));
      if (loc?.squareLocationId) {
        squareLocIds = [loc.squareLocationId];
      } else {
        throw new Error("Selected location has no Square Location ID linked. Go to Schedule > Locations and add the Square Location ID.");
      }
    } else {
      const allLocs = await db.select().from(locations);
      const linked = allLocs.filter(l => l.squareLocationId);
      if (linked.length > 0) {
        squareLocIds = linked.map(l => l.squareLocationId!);
      } else {
        const locResponse = await client.locations.list();
        const locs = locResponse.locations || [];
        squareLocIds = locs.map((l: any) => l.id).filter(Boolean) as string[];
      }
    }

    const catalogMappings = await db.select().from(squareCatalogMap).where(eq(squareCatalogMap.isActive, true));
    const variationToItem = new Map<string, { name: string; pastryItemId: number | null }>();
    const itemIdToMapping = new Map<string, { name: string; pastryItemId: number | null }>();

    for (const mapping of catalogMappings) {
      if (mapping.pastryItemName) {
        const info = { name: mapping.pastryItemName, pastryItemId: mapping.pastryItemId };
        if (mapping.squareVariationId) {
          variationToItem.set(mapping.squareVariationId, info);
        }
        itemIdToMapping.set(mapping.squareItemId, info);
      }
    }

    const salesAgg = new Map<string, { qty: number; revenue: number; pastryItemId: number | null }>();
    let ordersProcessed = 0;
    let totalRevenue = 0;
    const hourlyBuckets = new Map<number, { orderCount: number; revenue: number; itemsSold: number }>();
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
      locationIds: squareLocIds.length > 0 ? squareLocIds : undefined,
    };

    do {
      if (cursor) body.cursor = cursor;
      const response = await client.orders.search(body);
      const orders = response.orders || [];

      for (const order of orders) {
        ordersProcessed++;

        const orderTotalCents = (order as any).totalMoney?.amount ? Number((order as any).totalMoney.amount) : 0;
        totalRevenue += orderTotalCents / 100;

        const createdAt = (order as any).createdAt;
        let orderHour = 0;
        if (createdAt) {
          const orderDate = new Date(createdAt);
          orderHour = orderDate.getHours();
        }
        const bucket = hourlyBuckets.get(orderHour) || { orderCount: 0, revenue: 0, itemsSold: 0 };
        bucket.orderCount++;
        bucket.revenue += orderTotalCents / 100;

        for (const lineItem of (order as any).lineItems || []) {
          const catalogId = lineItem.catalogObjectId;

          let mappingInfo: { name: string; pastryItemId: number | null } | undefined;
          if (catalogId) {
            mappingInfo = variationToItem.get(catalogId) || itemIdToMapping.get(catalogId);
          }
          if (!mappingInfo) continue;

          const qty = parseInt(lineItem.quantity || "1", 10);
          const revCents = lineItem.totalMoney?.amount ? Number(lineItem.totalMoney.amount) : 0;
          const existing = salesAgg.get(mappingInfo.name) || { qty: 0, revenue: 0, pastryItemId: mappingInfo.pastryItemId };
          existing.qty += qty;
          existing.revenue += revCents / 100;
          salesAgg.set(mappingInfo.name, existing);

          bucket.itemsSold += qty;
        }
        hourlyBuckets.set(orderHour, bucket);
      }

      cursor = (response as any).cursor || undefined;
    } while (cursor);

    if (jarvisLocationId) {
      await db.delete(squareSales).where(and(eq(squareSales.date, date), eq(squareSales.locationId, jarvisLocationId)));
      await db.delete(squareDailySummary).where(and(eq(squareDailySummary.date, date), eq(squareDailySummary.locationId, jarvisLocationId)));
    } else {
      await db.delete(squareSales).where(eq(squareSales.date, date));
      await db.delete(squareDailySummary).where(eq(squareDailySummary.date, date));
    }

    const entries = Array.from(salesAgg.entries());
    for (const [itemName, data] of entries) {
      await db.insert(squareSales).values({
        date,
        itemName,
        pastryItemId: data.pastryItemId,
        quantitySold: data.qty,
        revenue: data.revenue,
        locationId: jarvisLocationId || null,
        lastSyncedAt: new Date(),
      });
    }

    const hourlyBreakdown = Array.from(hourlyBuckets.entries())
      .map(([hour, data]) => ({ hour, orderCount: data.orderCount, revenue: data.revenue, itemsSold: data.itemsSold }))
      .sort((a, b) => a.hour - b.hour);

    await db.insert(squareDailySummary).values({
      date,
      locationId: jarvisLocationId || null,
      orderCount: ordersProcessed,
      totalRevenue,
      hourlyBreakdown,
      lastSyncedAt: new Date(),
    });

    return { itemsSynced: salesAgg.size, ordersProcessed };
  } catch (error: any) {
    console.error("Error syncing Square sales:", error);
    throw new Error(`Failed to sync sales: ${error.message}`);
  }
}

export async function getSquareSalesForDate(date: string, locationId?: number) {
  const conditions = [eq(squareSales.date, date)];
  if (locationId) conditions.push(eq(squareSales.locationId, locationId));
  return await db.select().from(squareSales).where(and(...conditions)).orderBy(squareSales.itemName);
}

export async function getSquareDailySummaries(startDate: string, endDate: string, locationId?: number) {
  const conditions = [gte(squareDailySummary.date, startDate), lte(squareDailySummary.date, endDate)];
  if (locationId) conditions.push(eq(squareDailySummary.locationId, locationId));
  return await db.select().from(squareDailySummary).where(and(...conditions)).orderBy(squareDailySummary.date);
}

export async function generateForecast(date: string, locationId?: number): Promise<{ itemName: string; forecast: number; method: string; confidence: number }[]> {
  const targetDate = new Date(date);

  const pastDates: string[] = [];
  for (let weeksBack = 1; weeksBack <= 8; weeksBack++) {
    const pastDate = new Date(targetDate);
    pastDate.setDate(pastDate.getDate() - (weeksBack * 7));
    pastDates.push(pastDate.toISOString().split("T")[0]);
  }

  const salesConditions = [inArray(squareSales.date, pastDates)];
  if (locationId) salesConditions.push(or(eq(squareSales.locationId, locationId), isNull(squareSales.locationId))!);
  const allSalesData = pastDates.length > 0
    ? await db.select().from(squareSales).where(and(...salesConditions))
    : [];

  const goalsConditions = [inArray(pastryTotals.date, pastDates)];
  if (locationId) goalsConditions.push(or(eq(pastryTotals.locationId, locationId), isNull(pastryTotals.locationId))!);
  const pastryGoalsData = pastDates.length > 0
    ? await db.select().from(pastryTotals).where(and(...goalsConditions))
    : [];

  const activePastries = await db.select().from(pastryItems).where(eq(pastryItems.isActive, true));
  const pastryNameSet = new Set(activePastries.map(p => p.name.toLowerCase().trim()));

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

  const filtered = forecasts.filter(f => pastryNameSet.has(f.itemName.toLowerCase().trim()));
  return filtered.sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export async function autoPopulatePastryGoals(date: string, locationId?: number): Promise<{ populated: number; skipped: number }> {
  const forecasts = await generateForecast(date, locationId);
  const conditions = [eq(pastryTotals.date, date)];
  if (locationId) conditions.push(eq(pastryTotals.locationId, locationId));
  const existing = await db.select().from(pastryTotals).where(and(...conditions));
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

export async function getLiveInventoryDashboard(date: string, locationId?: number) {
  const goalsCond = [eq(pastryTotals.date, date)];
  if (locationId) goalsCond.push(or(eq(pastryTotals.locationId, locationId), isNull(pastryTotals.locationId))!);
  const salesCond = [eq(squareSales.date, date)];
  if (locationId) salesCond.push(or(eq(squareSales.locationId, locationId), isNull(squareSales.locationId))!);
  const bakedCond = [eq(bakeoffLogs.date, date)];
  if (locationId) bakedCond.push(or(eq(bakeoffLogs.locationId, locationId), isNull(bakeoffLogs.locationId))!);
  const [activePastryItems, goals, baked, sales] = await Promise.all([
    db.select().from(pastryItems).where(eq(pastryItems.isActive, true)),
    db.select().from(pastryTotals).where(and(...goalsCond)),
    db.select().from(bakeoffLogs).where(and(...bakedCond)),
    db.select().from(squareSales).where(and(...salesCond)),
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
    ...activePastryItems.map(p => p.name),
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

    if (bakedCount > 0) {
      if (remaining <= 0) {
        paceStatus = "sold_out";
      } else if (goal > 0 && dayProgress > 0.1 && soldData.qty > 0) {
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
      } else if (soldData.qty > 0) {
        paceStatus = remaining <= 0 ? "sold_out" : "on_track";
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
    pipelineStatus: {
      activePastryCount: activePastryItems.length,
      bakeoffCount: baked.length,
      salesSynced: sales.length > 0,
    },
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

export async function createSquareOrder(params: {
  squareLocationId: string;
  items: { catalogObjectId: string; variationId: string; quantity: number; note?: string }[];
  pickupName?: string;
  customerNote?: string;
}): Promise<{ orderId: string; totalAmount: number }> {
  const client = getSquareClient();

  const lineItems = params.items.map((item) => ({
    catalogObjectId: item.variationId,
    quantity: item.quantity.toString(),
    note: item.note || undefined,
  }));

  const orderRequest: any = {
    order: {
      locationId: params.squareLocationId,
      lineItems,
      fulfillments: [
        {
          type: "PICKUP",
          state: "PROPOSED",
          pickupDetails: {
            recipient: {
              displayName: params.pickupName || "Guest",
            },
            note: params.customerNote || undefined,
            scheduleType: "ASAP",
          },
        },
      ],
    },
    idempotencyKey: `lacarte-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };

  const response: any = await client.orders.create(orderRequest);
  const order = response.order;

  if (!order) {
    throw new Error("Square did not return an order");
  }

  const totalAmount = order.totalMoney ? parseInt(order.totalMoney.amount || "0") : 0;

  return {
    orderId: order.id,
    totalAmount,
  };
}

export async function fetchSquareTeamMembers(): Promise<{ success: boolean; members: any[]; error?: string }> {
  try {
    const client = getSquareClient();
    const allMembers: any[] = [];
    let cursor: string | undefined;

    do {
      const response: any = await client.teamMembers.search({
        query: {
          filter: {
            status: "ACTIVE",
          },
        },
        limit: 100,
        cursor,
      });
      const members = response.teamMembers || [];
      allMembers.push(...members.map((m: any) => ({
        id: m.id,
        firstName: m.givenName || "",
        lastName: m.familyName || "",
        email: m.emailAddress || null,
        phone: m.phoneNumber || null,
        status: m.status,
        isOwner: m.isOwner || false,
        createdAt: m.createdAt,
      })));
      cursor = response.cursor;
    } while (cursor);

    return { success: true, members: allMembers };
  } catch (error: any) {
    console.error("[Square Labor] Failed to fetch team members:", error.message);
    return { success: false, members: [], error: error.message || "Failed to fetch team members" };
  }
}

export async function fetchSquareTimecards(startDate: string, endDate: string, teamMemberIds?: string[], locationIds?: string[]): Promise<{ success: boolean; timecards: any[]; error?: string }> {
  try {
    const client = getSquareClient();
    const allTimecards: any[] = [];
    let cursor: string | undefined;

    const filter: any = {
      start: {
        startAt: startDate + "T00:00:00Z",
      },
      end: {
        endAt: endDate + "T23:59:59Z",
      },
    };

    if (teamMemberIds && teamMemberIds.length > 0) {
      filter.teamMemberIds = teamMemberIds;
    }

    if (locationIds && locationIds.length > 0) {
      filter.locationIds = locationIds;
    }

    do {
      const response: any = await client.labor.searchTimecards({
        query: { filter },
        limit: 100,
        cursor,
      });
      const timecards = response.timecards || [];
      allTimecards.push(...timecards);
      cursor = response.cursor;
    } while (cursor);

    return { success: true, timecards: allTimecards };
  } catch (error: any) {
    console.error("[Square Labor] Failed to fetch timecards:", error.message);
    return { success: false, timecards: [], error: error.message || "Failed to fetch timecards" };
  }
}

export async function syncSquareTimecards(startDate: string, endDate: string, locationId?: number): Promise<{
  success: boolean;
  synced: number;
  updated: number;
  skipped: number;
  unlinked: string[];
  error?: string;
}> {
  try {
    const linkedUsers = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      squareTeamMemberId: users.squareTeamMemberId,
    })
      .from(users)
      .where(isNotNull(users.squareTeamMemberId));

    const linkedBySquareId = new Map<string, { id: string; firstName: string | null; lastName: string | null }>();
    for (const u of linkedUsers) {
      if (u.squareTeamMemberId) {
        linkedBySquareId.set(u.squareTeamMemberId, { id: u.id, firstName: u.firstName, lastName: u.lastName });
      }
    }

    if (linkedBySquareId.size === 0) {
      return { success: true, synced: 0, updated: 0, skipped: 0, unlinked: [], error: "No users are linked to Square team members. Link team members first." };
    }

    const squareTeamMemberIds = Array.from(linkedBySquareId.keys());
    const result = await fetchSquareTimecards(startDate, endDate, squareTeamMemberIds);
    if (!result.success) {
      return { success: false, synced: 0, updated: 0, skipped: 0, unlinked: [], error: result.error };
    }

    const squareShiftIds = result.timecards
      .map((tc: any) => tc.id)
      .filter(Boolean);

    let existingBySquareId = new Map<string, { id: number; squareShiftId: string | null; clockIn: Date; clockOut: Date | null; status: string }>();
    if (squareShiftIds.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < squareShiftIds.length; i += batchSize) {
        const batch = squareShiftIds.slice(i, i + batchSize);
        const existingEntries = await db.select({
          id: timeEntries.id,
          squareShiftId: timeEntries.squareShiftId,
          clockIn: timeEntries.clockIn,
          clockOut: timeEntries.clockOut,
          status: timeEntries.status,
        })
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.source, "square"),
              inArray(timeEntries.squareShiftId, batch)
            )
          );
        for (const e of existingEntries) {
          if (e.squareShiftId) {
            existingBySquareId.set(e.squareShiftId, e);
          }
        }
      }
    }

    let synced = 0;
    let updated = 0;
    let skipped = 0;
    const unlinkedTeamMemberIds = new Set<string>();

    for (const tc of result.timecards) {
      const squareId = tc.id;
      const teamMemberId = tc.teamMemberId;

      if (!teamMemberId || !linkedBySquareId.has(teamMemberId)) {
        if (teamMemberId) unlinkedTeamMemberIds.add(teamMemberId);
        skipped++;
        continue;
      }

      const jarvisUser = linkedBySquareId.get(teamMemberId)!;
      const clockIn = tc.clockInAt ? new Date(tc.clockInAt) : null;
      const clockOut = tc.clockOutAt ? new Date(tc.clockOutAt) : null;
      const status = clockOut ? "completed" : "active";

      if (!clockIn) {
        skipped++;
        continue;
      }

      const existing = existingBySquareId.get(squareId);

      if (existing) {
        const clockOutChanged = (clockOut?.getTime() || null) !== (existing.clockOut?.getTime() || null);
        const statusChanged = status !== existing.status;
        if (clockOutChanged || statusChanged) {
          await db.update(timeEntries)
            .set({
              clockOut: clockOut,
              status: status,
            })
            .where(eq(timeEntries.id, existing.id));
          updated++;
        } else {
          skipped++;
        }

        await syncBreaksForTimecard(existing.id, tc);
      } else {
        const [inserted] = await db.insert(timeEntries).values({
          userId: jarvisUser.id,
          clockIn: clockIn,
          clockOut: clockOut,
          status: status,
          source: "square",
          squareShiftId: squareId,
          notes: `Synced from Square POS`,
          locationId: locationId || null,
        }).returning({ id: timeEntries.id });

        if (inserted) {
          await syncBreaksForTimecard(inserted.id, tc);
        }
        synced++;
      }
    }

    const unlinkedNames: string[] = [];
    if (unlinkedTeamMemberIds.size > 0) {
      const membersResult = await fetchSquareTeamMembers();
      if (membersResult.success) {
        for (const uid of unlinkedTeamMemberIds) {
          const member = membersResult.members.find((m: any) => m.id === uid);
          if (member) {
            unlinkedNames.push(`${member.firstName} ${member.lastName}`.trim());
          } else {
            unlinkedNames.push(`Unknown (${uid})`);
          }
        }
      }
    }

    console.log(`[Square Labor] Sync complete: ${synced} new, ${updated} updated, ${skipped} skipped, ${unlinkedNames.length} unlinked`);
    return { success: true, synced, updated, skipped, unlinked: unlinkedNames };
  } catch (error: any) {
    console.error("[Square Labor] Sync error:", error);
    return { success: false, synced: 0, updated: 0, skipped: 0, unlinked: [], error: error.message || "Sync failed" };
  }
}

let lastWebhookEventAt: Date | null = null;

export function getLastWebhookEventAt(): Date | null {
  return lastWebhookEventAt;
}

export async function handleSquareWebhook(eventType: string, data: any): Promise<void> {
  lastWebhookEventAt = new Date();
  console.log(`[Square Webhook] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case "labor.timecard.created":
        await handleTimecardCreated(data);
        break;
      case "labor.timecard.updated":
        await handleTimecardUpdated(data);
        break;
      case "labor.timecard.deleted":
        await handleTimecardDeleted(data);
        break;
      case "labor.shift.created":
        await handleTimecardCreated(data);
        break;
      case "labor.shift.updated":
        await handleTimecardUpdated(data);
        break;
      case "labor.shift.deleted":
        await handleTimecardDeleted(data);
        break;
      case "order.created":
      case "order.updated":
        await handleOrderEvent(data);
        break;
      case "payment.created":
      case "payment.updated":
      case "payment.completed":
        await handlePaymentEvent(data);
        break;
      default:
        console.log(`[Square Webhook] Ignoring unhandled event type: ${eventType}`);
    }
  } catch (error: any) {
    console.error(`[Square Webhook] Error processing ${eventType}:`, error.message);
  }
}

const recentOrderEvents = new Map<string, string>();
const MAX_ORDER_CACHE = 500;

function pruneOrderCache() {
  if (recentOrderEvents.size > MAX_ORDER_CACHE) {
    const keys = Array.from(recentOrderEvents.keys());
    for (let i = 0; i < keys.length - MAX_ORDER_CACHE / 2; i++) {
      recentOrderEvents.delete(keys[i]);
    }
  }
}

async function handlePaymentEvent(data: any): Promise<void> {
  try {
    const payment = data?.object?.payment || data?.data?.object?.payment || null;
    if (!payment) return;

    const status = payment.status || "";
    if (status !== "COMPLETED") {
      console.log(`[Square Webhook] Payment ${payment.id} status ${status}, skipping wholesale check`);
      return;
    }

    const note = payment.note || payment.receipt_url || "";
    const match = note.match(/Wholesale Order #(\d+)/i);
    if (match) {
      await markWholesaleOrderPaid(parseInt(match[1]), payment.order_id || payment.orderId || payment.id);
      return;
    }

    const sqOrderId = payment.order_id || payment.orderId;
    if (sqOrderId) {
      const [wo] = await db.select().from(wholesaleOrders)
        .where(and(
          eq(wholesaleOrders.status, "pending"),
          isNotNull(wholesaleOrders.paymentLinkId)
        ));
      if (wo) {
        try {
          const client = getSquareClient();
          const orderResult = await client.orders.get({ orderId: sqOrderId });
          const sqOrder = orderResult.order;
          if (sqOrder) {
            await checkWholesalePayment(sqOrder, sqOrderId);
          }
        } catch (e: any) {
          console.log(`[Square Webhook] Could not fetch order ${sqOrderId} for wholesale check: ${e.message}`);
        }
      }
    }
  } catch (err: any) {
    console.error("[Square Webhook] Payment event error:", err.message);
  }
}

async function checkWholesalePayment(order: any, squareOrderId: string): Promise<void> {
  try {
    if (!order) return;

    const note = order.note || order.payment_note || "";
    const match = note.match(/Wholesale Order #(\d+)/i);

    if (!match) {
      const tenders = order.tenders || [];
      const tenderNote = tenders.find((t: any) => t.note?.match(/Wholesale Order #\d+/i))?.note || "";
      const tenderMatch = tenderNote.match(/Wholesale Order #(\d+)/i);
      if (!tenderMatch) return;
      const wholesaleId = parseInt(tenderMatch[1]);
      await markWholesaleOrderPaid(wholesaleId, squareOrderId);
      return;
    }

    const wholesaleId = parseInt(match[1]);
    await markWholesaleOrderPaid(wholesaleId, squareOrderId);
  } catch (err: any) {
    console.error("[Square Webhook] Wholesale payment check error:", err.message);
  }
}

async function markWholesaleOrderPaid(wholesaleId: number, squareOrderId: string): Promise<void> {
  const [existing] = await db.select().from(wholesaleOrders).where(eq(wholesaleOrders.id, wholesaleId)).limit(1);
  if (!existing) {
    console.log(`[Square Webhook] Wholesale order #${wholesaleId} not found, skipping`);
    return;
  }
  if (existing.status === "paid") {
    console.log(`[Square Webhook] Wholesale order #${wholesaleId} already marked paid`);
    return;
  }
  await db.update(wholesaleOrders)
    .set({ status: "paid", updatedAt: new Date() })
    .where(eq(wholesaleOrders.id, wholesaleId));
  console.log(`[Square Webhook] Wholesale order #${wholesaleId} marked as PAID (Square order: ${squareOrderId})`);
}

async function handleOrderEvent(data: any): Promise<void> {
  const order = data?.object?.order || data?.data?.object?.order || null;

  const orderId = order?.id || data?.object?.order_updated?.order_id || data?.id || null;
  if (!orderId) {
    console.log("[Square Webhook] No order ID found in event payload, triggering today sync");
    const today = new Date().toISOString().split("T")[0];
    try {
      const result = await syncSquareSales(today);
      console.log(`[Square Webhook] Today sync complete: ${result.ordersProcessed} orders, ${result.itemsSynced} items synced`);
    } catch (err: any) {
      console.error(`[Square Webhook] Today sync failed:`, err.message);
    }
    return;
  }

  const cacheKey = `${orderId}`;
  const now = Date.now();
  const cachedTimestamp = recentOrderEvents.get(cacheKey);
  if (cachedTimestamp) {
    const elapsed = now - parseInt(cachedTimestamp);
    if (elapsed < 5000) {
      console.log(`[Square Webhook] Order ${orderId} synced ${elapsed}ms ago, skipping rapid duplicate`);
      return;
    }
  }
  recentOrderEvents.set(cacheKey, String(now));
  pruneOrderCache();

  if (order && order.state && order.state !== "COMPLETED") {
    console.log(`[Square Webhook] Order ${orderId} state is ${order.state}, skipping (only COMPLETED orders synced)`);
    return;
  }

  await checkWholesalePayment(order, orderId);

  let dateStr: string;
  const orderDate = order?.createdAt || order?.created_at;
  if (orderDate) {
    dateStr = new Date(orderDate).toISOString().split("T")[0];
  } else {
    dateStr = new Date().toISOString().split("T")[0];
  }

  let jarvisLocationId: number | undefined;
  const squareLocationId = order?.locationId || order?.location_id;
  if (squareLocationId) {
    const [loc] = await db.select().from(locations).where(eq(locations.squareLocationId, squareLocationId));
    if (loc) {
      jarvisLocationId = loc.id;
    }
  }

  console.log(`[Square Webhook] Order ${orderId} — triggering sync for ${dateStr} (location: ${jarvisLocationId ?? "all"})`);

  try {
    const result = await syncSquareSales(dateStr, jarvisLocationId);
    console.log(`[Square Webhook] Sync complete for ${dateStr}: ${result.ordersProcessed} orders, ${result.itemsSynced} items synced`);
  } catch (err: any) {
    console.error(`[Square Webhook] Sync failed for ${dateStr}:`, err.message);
  }
}

async function resolveTimecardFromData(data: any): Promise<any | null> {
  const timecard = data?.object?.timecard || data?.object?.shift || null;
  return timecard;
}

async function findLinkedUser(teamMemberId: string): Promise<{ id: string; firstName: string | null; lastName: string | null } | null> {
  if (!teamMemberId) return null;
  const [user] = await db.select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
  })
    .from(users)
    .where(eq(users.squareTeamMemberId, teamMemberId))
    .limit(1);
  return user || null;
}

async function handleTimecardCreated(data: any): Promise<void> {
  const timecard = await resolveTimecardFromData(data);
  if (!timecard) {
    console.warn("[Square Webhook] No timecard data in created event");
    return;
  }

  const squareId = timecard.id;
  const teamMemberId = timecard.teamMemberId || timecard.team_member_id;

  const jarvisUser = await findLinkedUser(teamMemberId);
  if (!jarvisUser) {
    console.log(`[Square Webhook] Unlinked team member ${teamMemberId}, skipping clock-in`);
    return;
  }

  const [existing] = await db.select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(eq(timeEntries.source, "square"), eq(timeEntries.squareShiftId, squareId)))
    .limit(1);

  if (existing) {
    console.log(`[Square Webhook] Time entry already exists for Square shift ${squareId}, skipping`);
    return;
  }

  const clockIn = timecard.startAt || timecard.start_at;
  if (!clockIn) {
    console.warn(`[Square Webhook] No start time for shift ${squareId}`);
    return;
  }

  const clockOut = timecard.endAt || timecard.end_at || null;
  const status = clockOut ? "completed" : "active";

  const [inserted] = await db.insert(timeEntries).values({
    userId: jarvisUser.id,
    clockIn: new Date(clockIn),
    clockOut: clockOut ? new Date(clockOut) : null,
    status,
    source: "square",
    squareShiftId: squareId,
    notes: "Synced from Square POS (real-time)",
    locationId: null,
  }).returning({ id: timeEntries.id });

  if (inserted && timecard.breaks?.length) {
    await syncBreaksForTimecard(inserted.id, timecard);
  }

  console.log(`[Square Webhook] Created time entry for ${jarvisUser.firstName} ${jarvisUser.lastName} (shift ${squareId})`);
}

async function handleTimecardUpdated(data: any): Promise<void> {
  const timecard = await resolveTimecardFromData(data);
  if (!timecard) {
    console.warn("[Square Webhook] No timecard data in updated event");
    return;
  }

  const squareId = timecard.id;
  const teamMemberId = timecard.teamMemberId || timecard.team_member_id;

  const [existing] = await db.select({ id: timeEntries.id, clockOut: timeEntries.clockOut, status: timeEntries.status })
    .from(timeEntries)
    .where(and(eq(timeEntries.source, "square"), eq(timeEntries.squareShiftId, squareId)))
    .limit(1);

  if (!existing) {
    const jarvisUser = await findLinkedUser(teamMemberId);
    if (!jarvisUser) {
      console.log(`[Square Webhook] Unlinked team member ${teamMemberId}, skipping update`);
      return;
    }

    const clockIn = timecard.startAt || timecard.start_at;
    if (!clockIn) return;
    const clockOut = timecard.endAt || timecard.end_at || null;
    const status = clockOut ? "completed" : "active";

    const [inserted] = await db.insert(timeEntries).values({
      userId: jarvisUser.id,
      clockIn: new Date(clockIn),
      clockOut: clockOut ? new Date(clockOut) : null,
      status,
      source: "square",
      squareShiftId: squareId,
      notes: "Synced from Square POS (real-time)",
      locationId: null,
    }).returning({ id: timeEntries.id });

    if (inserted && timecard.breaks?.length) {
      await syncBreaksForTimecard(inserted.id, timecard);
    }
    console.log(`[Square Webhook] Created missing time entry on update for shift ${squareId}`);
    return;
  }

  const clockIn = timecard.startAt || timecard.start_at || null;
  const clockOut = timecard.endAt || timecard.end_at || null;
  const status = clockOut ? "completed" : "active";

  await db.update(timeEntries)
    .set({
      ...(clockIn ? { clockIn: new Date(clockIn) } : {}),
      clockOut: clockOut ? new Date(clockOut) : null,
      status,
    })
    .where(eq(timeEntries.id, existing.id));

  await syncBreaksForTimecard(existing.id, timecard);
  console.log(`[Square Webhook] Updated time entry for shift ${squareId} (status: ${status})`);
}

async function handleTimecardDeleted(data: any): Promise<void> {
  const timecard = await resolveTimecardFromData(data);
  const squareId = timecard?.id || data?.id;
  if (!squareId) {
    console.warn("[Square Webhook] No shift ID in deleted event");
    return;
  }

  const [existing] = await db.select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(eq(timeEntries.source, "square"), eq(timeEntries.squareShiftId, squareId)))
    .limit(1);

  if (!existing) {
    console.log(`[Square Webhook] No time entry found for deleted shift ${squareId}, skipping`);
    return;
  }

  await db.delete(timeEntries).where(eq(timeEntries.id, existing.id));
  console.log(`[Square Webhook] Deleted time entry for shift ${squareId}`);
}

async function syncBreaksForTimecard(timeEntryId: number, timecard: any) {
  const breaks = timecard.breaks || [];
  if (breaks.length === 0) return;

  const existingBreaks = await db.select()
    .from(breakEntries)
    .where(eq(breakEntries.timeEntryId, timeEntryId));

  for (const b of breaks) {
    const startAt = b.startAt ? new Date(b.startAt) : null;
    const endAt = b.endAt ? new Date(b.endAt) : null;
    if (!startAt) continue;

    const alreadyExists = existingBreaks.some(
      (eb) => Math.abs(eb.startAt.getTime() - startAt.getTime()) < 60000
    );

    if (!alreadyExists) {
      await db.insert(breakEntries).values({
        timeEntryId,
        startAt,
        endAt,
      });
    } else if (endAt) {
      const match = existingBreaks.find(
        (eb) => Math.abs(eb.startAt.getTime() - startAt.getTime()) < 60000
      );
      if (match && !match.endAt) {
        await db.update(breakEntries)
          .set({ endAt })
          .where(eq(breakEntries.id, match.id));
      }
    }
  }
}