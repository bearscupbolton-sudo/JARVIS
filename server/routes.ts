import type { Express } from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, isUnlocked, isOwner, isManager, isBakeryDepartment, authStorage } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { openai, speechToText, ensureCompatibleFormat, detectAudioFormat } from "./replit_integrations/audio/client";
import { uploadMedia, uploadMediaWithThumbnail, deleteMedia, streamMediaToResponse } from "./media";
import { sendPushToUsers, sendPushToUser } from "./push";
import { sendSms } from "./sms";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq, and, gte, lte, lt, desc, asc, isNotNull, isNull, inArray, or, sql } from "drizzle-orm";
import { squareCatalogMap, squareSales, squareDailySummary, shifts, directMessages, messageRecipients, timeEntries, breakEntries, laminationDoughs, recipeSessions, bakeoffLogs, pastryItems, sentimentShiftScores, customerFeedback, locations, pastryPassports, doughTypeConfigs, inventoryItems, insertCoffeeInventorySchema, insertCoffeeUsageLogSchema, insertServiceContactSchema, insertEquipmentSchema, insertEquipmentMaintenanceSchema, insertProductionComponentSchema, insertComponentBomSchema, productionComponents, componentBom, componentTransactions, jmtMenus, jmtDisplays, jmtDisplayHistory, soldoutLogs, wholesaleOrders, tutorials, tutorialViews, insertTutorialSchema, appSettings, coffeeDrinkRecipes, recipes, regionalPricing, invoices, invoiceLines, chartOfAccounts, journalEntries, ledgerLines, firmTransactions, financialConsultations, aiInferenceLogs, complianceCalendar, salesTaxJurisdictions, accrualPlaceholders, donations, fixedAssets, depreciationSchedules, depreciationEntries, assetAuditLog, employeeReimbursements, aiLearningRules, cashPayoutLogs, projectMetadata, taxProfiles, inventoryTransfers, vibeAlerts, hiveFoundWords, emailExtractions, vendorProfiles } from "@shared/schema";
import { getDemoDataForEndpoint } from "./demo-data";
import { withRetry } from "./ai-retry";
import { calculatePastryCost, calculateAllPastryCosts, calculateRecipeCost } from "./cost-engine";
import { registerPortalAuthRoutes, isCustomerAuthenticated } from "./customer-auth";
import { registerWholesaleAuthRoutes, isWholesaleAuthenticated, isWholesaleOnboarded } from "./wholesale-auth";
import { createSquareOrder } from "./square";
import {
  testSquareConnection, fetchSquareCatalog, syncSquareSales,
  getSquareSalesForDate, generateForecast, autoPopulatePastryGoals,
  getLiveInventoryDashboard, fetchSquareTips,
  fetchSquareTeamMembers, syncSquareTimecards,
  handleSquareWebhook, getLastWebhookEventAt,
} from "./square";

async function getUserFromReq(req: any) {
  return req.appUser || null;
}

async function createOvenTimersForItem(
  itemName: string,
  pastryItemId: number | null,
  userId: string | null,
): Promise<void> {
  try {
    const passport = await storage.getPassportByPastryItemIdOrName(pastryItemId, itemName);
    if (!passport?.bakeTimeMinutes) return;

    const bakeMinutes = passport.bakeTimeMinutes;
    const now = new Date();

    const activeTimers = await storage.getActiveTimers();
    const activeBakeTimer = activeTimers.find(
      (t) => t.label.includes("— Bake") && t.expiresAt > now && !t.dismissed
    );

    if (activeBakeTimer) {
      const existingLabels = activeBakeTimer.label.replace(" — Bake", "").split(", ");
      if (!existingLabels.includes(itemName)) {
        existingLabels.push(itemName);
        const newLabel = existingLabels.join(", ") + " — Bake";
        await storage.updateTimer(activeBakeTimer.id, { label: newLabel });
      }

      const activeSpinTimer = activeTimers.find(
        (t) => t.label.includes("— Spin") && t.expiresAt > now && !t.dismissed
      );
      if (activeSpinTimer) {
        const spinLabels = activeSpinTimer.label.replace(" — Spin", "").split(", ");
        if (!spinLabels.includes(itemName)) {
          spinLabels.push(itemName);
          const newSpinLabel = spinLabels.join(", ") + " — Spin";
          await storage.updateTimer(activeSpinTimer.id, { label: newSpinLabel });
        }
      }
      return;
    }

    await storage.createTimer({
      label: `${itemName} — Bake`,
      durationSeconds: bakeMinutes * 60,
      startedAt: now,
      expiresAt: new Date(now.getTime() + bakeMinutes * 60 * 1000),
      dismissed: false,
      createdBy: userId,
      department: "bakery",
      pastryItemId: pastryItemId,
    });

    if (bakeMinutes > 8) {
      const spinSeconds = (bakeMinutes - 8) * 60;
      await storage.createTimer({
        label: `${itemName} — Spin`,
        durationSeconds: spinSeconds,
        startedAt: now,
        expiresAt: new Date(now.getTime() + spinSeconds * 1000),
        dismissed: false,
        createdBy: userId,
        department: "bakery",
        pastryItemId: pastryItemId,
      });
    }
  } catch (err) {
    console.error("Failed to create oven timers:", err);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const screenClients = new Map<string, Set<any>>();

  function removeScreenClient(res: any) {
    for (const [key, set] of screenClients) {
      set.delete(res);
      if (set.size === 0) screenClients.delete(key);
    }
  }

  function broadcastToScreen(slot: number | "all") {
    const targets = slot === "all"
      ? [...screenClients.values()].flatMap(s => [...s])
      : [...(screenClients.get(String(slot)) || [])];
    const data = JSON.stringify({ type: "refresh", slot, timestamp: Date.now() });
    for (const client of targets) {
      try {
        if (client.writableEnded || client.destroyed) {
          removeScreenClient(client);
        } else {
          client.write(`data: ${data}\n\n`);
        }
      } catch {
        removeScreenClient(client);
      }
    }
  }

  app.get('/sw.js', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/') && !req.path.match(/\.\w+$/)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
  });

  await setupAuth(app);
  registerAuthRoutes(app);
  registerChatRoutes(app);
  registerObjectStorageRoutes(app);

  app.get("/api/demo-data", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser;
      if (!user?.demoMode) {
        return res.status(400).json({ message: "Demo mode is not enabled" });
      }
      const { endpoint } = req.query;
      if (!endpoint || typeof endpoint !== "string") {
        return res.status(400).json({ message: "endpoint query parameter is required" });
      }
      const demoData = getDemoDataForEndpoint(endpoint, user.id);
      if (demoData === null) {
        return res.status(404).json({ message: "No demo data available for this endpoint" });
      }
      res.json(demoData);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  registerPortalAuthRoutes(app);
  registerWholesaleAuthRoutes(app);

  app.post("/api/media/upload", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { image, category } = req.body;
      if (!image || !category) return res.status(400).json({ message: "image and category required" });
      const validCategories = ["pastry", "note", "message", "shift-note", "recipe", "sop", "general"];
      if (!validCategories.includes(category)) return res.status(400).json({ message: "Invalid category" });
      const result = await uploadMediaWithThumbnail(image, category, req.appUser.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/media/file/{*path}", async (req, res) => {
    try {
      const filePath = (req.params as any).path;
      await streamMediaToResponse(filePath, res);
    } catch (err: any) {
      res.status(404).json({ message: "File not found" });
    }
  });

  app.delete("/api/media/{*key}", isAuthenticated, isUnlocked, isManager, async (req: any, res) => {
    try {
      await deleteMedia(req.params.key);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === WHOLESALE PORTAL ENDPOINTS ===

  app.get("/api/wholesale/catalog", isWholesaleAuthenticated, isWholesaleOnboarded, async (_req, res) => {
    try {
      const items = await storage.getWholesaleCatalogItems(true);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/onboarding", isWholesaleAuthenticated, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const { businessName, contactName, phone, email, address, city, state, zip, certificateOfAuthority, st120IsBlanket, st120FilePath } = req.body;

      if (!businessName || !contactName || !phone || !email || !certificateOfAuthority) {
        return res.status(400).json({ message: "Business name, contact name, phone, email, and Certificate of Authority number are required" });
      }

      const updated = await storage.updateWholesaleCustomer(customer.id, {
        businessName,
        contactName,
        phone,
        email,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        certificateOfAuthority,
        st120IsBlanket: st120IsBlanket || false,
        st120FilePath: st120FilePath || null,
        onboardingComplete: true,
      });

      const { pinHash: _, ...safe } = updated;
      res.json(safe);
    } catch (err: any) {
      console.error("Wholesale onboarding error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/wholesale/orders", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const orders = await storage.getWholesaleOrders(customer.id);
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/orders", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const { orderDate, notes, items, isRecurring, recurringTemplateId } = req.body;
      if (!orderDate || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "orderDate and items are required" });
      }

      const catalogItems = await storage.getWholesaleCatalogItems(true);
      const catalogMap = new Map(catalogItems.map(ci => [ci.id, ci]));

      let totalAmount = 0;
      const orderItems: any[] = [];
      for (const item of items) {
        const ci = catalogMap.get(item.catalogItemId);
        if (!ci) return res.status(400).json({ message: `Unknown catalog item: ${item.catalogItemId}` });
        const subtotal = ci.unitPrice * item.quantity;
        totalAmount += subtotal;
        orderItems.push({
          catalogItemId: ci.id,
          itemName: ci.name,
          quantity: item.quantity,
          unitPrice: ci.unitPrice,
          subtotal,
          orderId: 0,
        });
      }

      const order = await storage.createWholesaleOrder(
        { customerId: customer.id, orderDate, notes: notes || null, totalAmount, isRecurring: isRecurring || false, recurringTemplateId: recurringTemplateId || null, status: "pending" },
        orderItems
      );

      const itemLines = order.items.map(i => `  • ${i.itemName} x${i.quantity} — $${i.subtotal.toFixed(2)}`).join("\n");
      const messageBody = `Wholesale Order #${order.id} from ${customer.businessName}\n\nDelivery Date: ${orderDate}\nTotal: $${totalAmount.toFixed(2)}\n\nItems:\n${itemLines}${notes ? `\n\nNotes: ${notes}` : ""}`;

      try {
        const owners = await db.select().from(users).where(eq(users.role, "owner"));
        const ownerIds = owners.map(o => o.id);
        if (ownerIds.length > 0) {
          await storage.sendMessage(
            { senderId: ownerIds[0], subject: `Wholesale Order #${order.id} — ${customer.businessName}`, body: messageBody, priority: "urgent", requiresAck: false, targetType: "role", targetValue: "owner", parentMessageId: null },
            ownerIds
          );
        }
      } catch (msgErr) {
        console.error("Failed to send wholesale order message:", msgErr);
      }

      try {
        const eventDate = new Date(orderDate + "T09:00:00");
        await storage.createEvent({
          title: `Wholesale: ${customer.businessName} — Order #${order.id}`,
          description: messageBody,
          date: eventDate,
          endDate: null,
          eventType: "delivery",
          contactName: customer.contactName,
          contactPhone: customer.phone || null,
          contactEmail: customer.email || null,
          address: null,
          startTime: null,
          endTime: null,
          taggedUserIds: null,
          isPersonal: false,
          invitedDepartments: null,
          createdBy: "system",
        });
      } catch (eventErr) {
        console.error("Failed to create wholesale calendar event:", eventErr);
      }

      res.status(201).json(order);
    } catch (err: any) {
      console.error("Wholesale order error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/orders/:id/payment-link", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const orderId = parseInt(req.params.id);
      const orders = await storage.getWholesaleOrders(customer.id);
      const order = orders.find((o: any) => o.id === orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status !== "pending") return res.status(400).json({ message: "Payment links can only be created for pending orders" });

      if (order.paymentLinkUrl) {
        return res.json({ paymentLinkUrl: order.paymentLinkUrl });
      }

      const { SquareClient, SquareEnvironment } = await import("square");
      const squareClient = new SquareClient({
        token: process.env.SQUARE_ACCESS_TOKEN || "",
        environment: (process.env.SQUARE_ENVIRONMENT === "production") ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
      });

      const [defaultLoc] = await db.select().from(locations).where(eq(locations.isDefault, true)).limit(1);
      const squareLocationId = defaultLoc?.squareLocationId || process.env.SQUARE_LOCATION_ID || "";
      if (!squareLocationId) {
        return res.status(400).json({ message: "Square location not configured. Please contact Bear's Cup." });
      }

      const lineItems = (order.items || []).map((item: any) => ({
        name: item.itemName,
        quantity: String(item.quantity),
        basePriceMoney: {
          amount: BigInt(Math.round(item.unitPrice * 100)),
          currency: "USD",
        },
      }));

      const result = await squareClient.checkout.paymentLinks.create({
        idempotencyKey: `wholesale-order-${orderId}-${Date.now()}`,
        quickPay: undefined,
        order: {
          locationId: squareLocationId,
          lineItems,
        },
        paymentNote: `Wholesale Order #${orderId} — ${customer.businessName}`,
      });

      const paymentLink = result.paymentLink;
      if (paymentLink?.url) {
        await db.update(wholesaleOrders)
          .set({ paymentLinkUrl: paymentLink.url, paymentLinkId: paymentLink.id || null })
          .where(eq(wholesaleOrders.id, orderId));

        return res.json({ paymentLinkUrl: paymentLink.url });
      }

      res.status(500).json({ message: "Failed to create payment link" });
    } catch (err: any) {
      console.error("Square payment link error:", err);
      res.status(500).json({ message: err.message || "Failed to create payment link" });
    }
  });

  app.get("/api/wholesale/templates", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const templates = await storage.getWholesaleTemplates(customer.id);
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/templates", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const { dayOfWeek, templateName, items } = req.body;
      if (dayOfWeek === undefined || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: "dayOfWeek and items are required" });
      }
      const template = await storage.createWholesaleTemplate(
        { customerId: customer.id, dayOfWeek, templateName: templateName || null, isActive: true },
        items.map((i: any) => ({ templateId: 0, catalogItemId: i.catalogItemId, quantity: i.quantity }))
      );
      res.status(201).json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/wholesale/templates/:id", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const id = parseInt(req.params.id);
      const templates = await storage.getWholesaleTemplates(customer.id);
      const existing = templates.find(t => t.id === id);
      if (!existing) return res.status(404).json({ message: "Template not found" });

      const { dayOfWeek, templateName, items, isActive } = req.body;
      const updateData: any = {};
      if (dayOfWeek !== undefined) updateData.dayOfWeek = dayOfWeek;
      if (templateName !== undefined) updateData.templateName = templateName;
      if (isActive !== undefined) updateData.isActive = isActive;

      const itemsToUpdate = items ? items.map((i: any) => ({ templateId: id, catalogItemId: i.catalogItemId, quantity: i.quantity })) : undefined;
      const updated = await storage.updateWholesaleTemplate(id, updateData, itemsToUpdate);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/wholesale/templates/:id", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const id = parseInt(req.params.id);
      const templates = await storage.getWholesaleTemplates(customer.id);
      if (!templates.find(t => t.id === id)) return res.status(404).json({ message: "Template not found" });
      await storage.deleteWholesaleTemplate(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === WHOLESALE ADMIN (Owner-only) ===

  app.get("/api/wholesale/admin/customers", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const customers = await storage.getWholesaleCustomers();
      res.json(customers.map(c => { const { pinHash: _, ...safe } = c; return safe; }));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/admin/customers", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { businessName, contactName, phone, email, pin, notes, locationId } = req.body;
      if (!pin) {
        return res.status(400).json({ message: "PIN is required" });
      }
      const bcrypt = await import("bcryptjs");
      const pinHash = await bcrypt.hash(pin, 12);
      const customer = await storage.createWholesaleCustomer({
        businessName: businessName || "New Customer",
        contactName: contactName || "Pending Setup",
        phone: phone || null, email: email || null,
        pinHash, notes: notes || null, isActive: true,
        onboardingComplete: !!(businessName && contactName),
        locationId: locationId || null,
      });
      const { pinHash: _, ...safe } = customer;
      res.status(201).json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/wholesale/admin/customers/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { businessName, contactName, phone, email, pin, notes, isActive, locationId } = req.body;
      const updates: any = {};
      if (businessName !== undefined) updates.businessName = businessName;
      if (contactName !== undefined) updates.contactName = contactName;
      if (phone !== undefined) updates.phone = phone;
      if (email !== undefined) updates.email = email;
      if (notes !== undefined) updates.notes = notes;
      if (isActive !== undefined) updates.isActive = isActive;
      if (locationId !== undefined) updates.locationId = locationId;
      if (pin) {
        const bcrypt = await import("bcryptjs");
        updates.pinHash = await bcrypt.hash(pin, 12);
      }
      const updated = await storage.updateWholesaleCustomer(id, updates);
      const { pinHash: _, ...safe } = updated;
      res.json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/wholesale/admin/catalog", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const items = await storage.getWholesaleCatalogItems(false);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/admin/catalog", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { name, description, category, unitPrice, unit, sortOrder } = req.body;
      if (!name || unitPrice === undefined) {
        return res.status(400).json({ message: "name and unitPrice are required" });
      }
      const item = await storage.createWholesaleCatalogItem({
        name, description: description || null, category: category || null,
        unitPrice: parseFloat(unitPrice), unit: unit || "each",
        isActive: true, sortOrder: sortOrder || 0,
      });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/wholesale/admin/catalog/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates: any = {};
      for (const key of ["name", "description", "category", "unitPrice", "unit", "isActive", "sortOrder"]) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (updates.unitPrice !== undefined) updates.unitPrice = parseFloat(updates.unitPrice);
      const item = await storage.updateWholesaleCatalogItem(id, updates);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/wholesale/admin/catalog/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      await storage.deleteWholesaleCatalogItem(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/wholesale/admin/orders", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const orders = await storage.getWholesaleOrders();
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/admin/orders", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { customerId, orderDate, notes, items, generatePaymentLink } = req.body;
      if (!customerId || !orderDate || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "customerId, orderDate, and items are required" });
      }

      const customers = await storage.getWholesaleCustomers();
      const customer = customers.find((c: any) => c.id === customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      for (const item of items) {
        if (!item.catalogItemId || typeof item.catalogItemId !== "number" || !Number.isInteger(item.quantity) || item.quantity < 1) {
          return res.status(400).json({ message: "Each item must have a valid catalogItemId and quantity >= 1" });
        }
      }

      const catalogItems = await storage.getWholesaleCatalogItems(true);
      const catalogMap = new Map(catalogItems.map(ci => [ci.id, ci]));

      let totalAmount = 0;
      const orderItems: any[] = [];
      for (const item of items) {
        const ci = catalogMap.get(item.catalogItemId);
        if (!ci) return res.status(400).json({ message: `Unknown catalog item: ${item.catalogItemId}` });
        const subtotal = ci.unitPrice * item.quantity;
        totalAmount += subtotal;
        orderItems.push({
          catalogItemId: ci.id,
          itemName: ci.name,
          quantity: item.quantity,
          unitPrice: ci.unitPrice,
          subtotal,
          orderId: 0,
        });
      }

      const order = await storage.createWholesaleOrder(
        { customerId: customer.id, orderDate, notes: notes || null, totalAmount, isRecurring: false, recurringTemplateId: null, status: "pending" },
        orderItems
      );

      try {
        const eventDate = new Date(orderDate + "T09:00:00");
        await storage.createEvent({
          title: `Wholesale: ${customer.businessName} — Order #${order.id}`,
          description: `Phone-in order placed by staff.\n\nTotal: $${totalAmount.toFixed(2)}\n\nItems:\n${orderItems.map(i => `  • ${i.itemName} x${i.quantity} — $${i.subtotal.toFixed(2)}`).join("\n")}${notes ? `\n\nNotes: ${notes}` : ""}`,
          date: eventDate,
          endDate: null,
          eventType: "delivery",
          contactName: customer.contactName,
          contactPhone: customer.phone || null,
          contactEmail: customer.email || null,
          address: null,
          startTime: null,
          endTime: null,
          taggedUserIds: null,
          isPersonal: false,
          invitedDepartments: null,
          createdBy: "system",
        });
      } catch (eventErr) {
        console.error("Failed to create wholesale calendar event:", eventErr);
      }

      let paymentLinkUrl = null;
      if (generatePaymentLink) {
        try {
          const { SquareClient, SquareEnvironment } = await import("square");
          const squareClient = new SquareClient({
            token: process.env.SQUARE_ACCESS_TOKEN || "",
            environment: (process.env.SQUARE_ENVIRONMENT === "production") ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
          });

          const [defaultLoc] = await db.select().from(locations).where(eq(locations.isDefault, true)).limit(1);
          const squareLocationId = defaultLoc?.squareLocationId || process.env.SQUARE_LOCATION_ID || "";
          if (squareLocationId) {
            const lineItems = orderItems.map((item: any) => ({
              name: item.itemName,
              quantity: String(item.quantity),
              basePriceMoney: {
                amount: BigInt(Math.round(item.unitPrice * 100)),
                currency: "USD",
              },
            }));

            const result = await squareClient.checkout.paymentLinks.create({
              idempotencyKey: `wholesale-order-${order.id}-${Date.now()}`,
              quickPay: undefined,
              order: {
                locationId: squareLocationId,
                lineItems,
              },
              paymentNote: `Wholesale Order #${order.id} — ${customer.businessName}`,
            });

            const paymentLink = result.paymentLink;
            if (paymentLink?.url) {
              paymentLinkUrl = paymentLink.url;
              await db.update(wholesaleOrders)
                .set({ paymentLinkUrl: paymentLink.url, paymentLinkId: paymentLink.id || null })
                .where(eq(wholesaleOrders.id, order.id));
            }
          }
        } catch (plErr) {
          console.error("Failed to generate payment link for admin order:", plErr);
        }
      }

      res.status(201).json({ ...order, paymentLinkUrl });
    } catch (err: any) {
      console.error("Admin wholesale order error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/wholesale/admin/orders/:id/status", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!["pending", "confirmed", "completed", "cancelled", "paid"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const order = await storage.updateWholesaleOrderStatus(id, status);
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PORTAL DATA ENDPOINTS (La Carte) ===

  app.get("/api/portal/fresh-today", isCustomerAuthenticated, async (_req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const logs = await storage.getBakeoffLogs(today);
      const summary: Record<string, number> = {};
      for (const log of logs) {
        const name = log.itemName || "Unknown";
        summary[name] = (summary[name] || 0) + (log.quantity || 0);
      }
      const items = Object.entries(summary).map(([itemName, quantity]) => ({ itemName, quantity }));
      res.json(items);
    } catch (error) {
      console.error("Portal fresh-today error:", error);
      res.json([]);
    }
  });

  app.get("/api/portal/coming-soon", isCustomerAuthenticated, async (_req, res) => {
    try {
      const specials = await storage.getTestKitchenItems({ status: "finalized" });
      const upcoming = specials
        .filter((s: any) => s.startDate && new Date(s.startDate) > new Date())
        .map((s: any) => ({
          title: s.title,
          description: s.description,
          department: s.department,
          startDate: s.startDate,
        }))
        .slice(0, 6);
      res.json(upcoming);
    } catch (error) {
      console.error("Portal coming-soon error:", error);
      res.json([]);
    }
  });

  app.get("/api/portal/menu", isCustomerAuthenticated, async (_req, res) => {
    try {
      const catalog = await fetchSquareCatalog();
      const passports = await storage.getPastryPassports();
      const items = catalog.map((item: any) => {
        const passport = passports.find((p: any) => {
          const pName = (p.pastryItem?.name || "").toLowerCase();
          const iName = (item.name || "").toLowerCase();
          return pName === iName || iName.includes(pName);
        });
        return {
          id: item.id,
          name: item.name,
          description: item.description || null,
          story: passport?.descriptionText || null,
          category: null,
          variations: item.variations || [],
        };
      });
      res.json(items);
    } catch (error) {
      console.error("Portal menu error:", error);
      res.json([]);
    }
  });

  app.get("/api/portal/locations", isCustomerAuthenticated, async (_req, res) => {
    try {
      const locs = await storage.getLocations();
      res.json(locs.map((l: any) => ({ id: l.id, name: l.name, squareLocationId: l.squareLocationId })));
    } catch (error) {
      res.json([]);
    }
  });

  app.get("/api/portal/orders", isCustomerAuthenticated, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const orders = await storage.getCustomerOrders(customer.id);
      res.json(orders);
    } catch (error) {
      console.error("Portal orders error:", error);
      res.json([]);
    }
  });

  app.post("/api/portal/orders", isCustomerAuthenticated, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const schema = z.object({
        locationId: z.number(),
        items: z.array(z.object({
          catalogObjectId: z.string(),
          variationId: z.string(),
          quantity: z.number().min(1),
          note: z.string().optional(),
        })),
        pickupName: z.string().optional(),
        customerNote: z.string().optional(),
      });
      const input = schema.parse(req.body);

      const location = await storage.getLocation(input.locationId);
      if (!location) {
        return res.status(400).json({ message: "Location not found" });
      }

      let squareOrderId: string | null = null;
      let totalAmount = 0;

      if (location.squareLocationId) {
        try {
          const result = await createSquareOrder({
            squareLocationId: location.squareLocationId,
            items: input.items,
            pickupName: input.pickupName || customer.firstName,
            customerNote: input.customerNote,
          });
          squareOrderId = result.orderId;
          totalAmount = result.totalAmount || 0;
        } catch (sqErr: any) {
          console.error("Square order creation failed:", sqErr);
          return res.status(500).json({ message: "Failed to create order in Square. Please try again." });
        }
      }

      const catalog = await fetchSquareCatalog();
      const itemDetails = input.items.map((item) => {
        const catalogItem = catalog.find((c: any) => c.id === item.catalogObjectId);
        const variation = catalogItem?.variations?.find((v: any) => v.id === item.variationId);
        return {
          name: catalogItem?.name || "Unknown Item",
          variationName: variation?.name || "Default",
          quantity: item.quantity,
          priceAmount: variation?.priceMoney ? parseInt(variation.priceMoney.amount || "0") : 0,
        };
      });

      if (!totalAmount) {
        totalAmount = itemDetails.reduce((sum, i) => sum + i.priceAmount * i.quantity, 0);
      }

      const order = await storage.createCustomerOrder({
        customerId: customer.id,
        squareOrderId,
        locationId: input.locationId,
        items: itemDetails,
        total: totalAmount,
        status: squareOrderId ? "sent" : "pending",
        pickupName: input.pickupName || customer.firstName,
        customerNote: input.customerNote || null,
      });

      res.status(201).json(order);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      console.error("Portal order creation error:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // === RECIPES ===
  app.get(api.recipes.list.path, async (req, res) => {
    const recipes = await storage.getRecipes();
    res.json(recipes);
  });

  app.get(api.recipes.get.path, async (req, res) => {
    const recipe = await storage.getRecipe(Number(req.params.id));
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }
    res.json(recipe);
  });

  app.post(api.recipes.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { changeReason, ...body } = req.body;
      const input = api.recipes.create.input.parse(body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      if (user.role === "owner") {
        const recipe = await storage.createRecipe(input);
        return res.status(201).json(recipe);
      }

      const pending = await storage.createPendingChange({
        entityType: "recipe",
        action: "create",
        entityId: null,
        payload: input,
        originalPayload: null,
        changeReason: changeReason || null,
        submittedBy: user.id,
        submittedByUsername: user.username || user.firstName || "Unknown",
        status: "pending",
        reviewedBy: null,
        reviewNote: null,
      });
      return res.status(202).json({ message: "Submitted for approval", pendingId: pending.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.recipes.update.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { changeReason, ...body } = req.body;
      const input = api.recipes.update.input.parse(body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      if (user.role === "owner") {
        const recipe = await storage.updateRecipe(Number(req.params.id), input, user.id, "Direct edit by owner");
        return res.json(recipe);
      }

      const existingRecipe = await storage.getRecipe(Number(req.params.id));

      const pending = await storage.createPendingChange({
        entityType: "recipe",
        action: "update",
        entityId: Number(req.params.id),
        payload: input,
        originalPayload: existingRecipe ? {
          title: existingRecipe.title,
          description: existingRecipe.description,
          category: existingRecipe.category,
          yieldAmount: existingRecipe.yieldAmount,
          yieldUnit: existingRecipe.yieldUnit,
          ingredients: existingRecipe.ingredients,
          instructions: existingRecipe.instructions,
        } : null,
        changeReason: changeReason || null,
        submittedBy: user.id,
        submittedByUsername: user.username || user.firstName || "Unknown",
        status: "pending",
        reviewedBy: null,
        reviewNote: null,
      });
      return res.status(202).json({ message: "Update submitted for approval", pendingId: pending.id, pending: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(404).json({ message: 'Recipe not found' });
    }
  });

  app.delete(api.recipes.delete.path, isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteRecipe(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/recipes/:id/versions", isAuthenticated, async (req, res) => {
    const versions = await storage.getRecipeVersions(Number(req.params.id));
    res.json(versions);
  });

  app.post(api.recipes.scan.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { image } = api.recipes.scan.input.parse(req.body);
      const base64Size = image.length * 0.75;
      if (base64Size > 15 * 1024 * 1024) {
        return res.status(400).json({ message: "Image too large. Please upload an image under 10MB." });
      }
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 4096,
        messages: [
          {
            role: "system",
            content: `You are Jarvis, an expert bakery recipe parser for Bear's Cup Bakehouse. Extract recipe data from the uploaded image (handwritten notes, printed recipes, spreadsheets, or formula sheets).

Return a JSON object with this exact structure:
{
  "title": "string - the recipe name",
  "description": "string - a brief description of the recipe",
  "category": "string - one of: Bread, Viennoiserie, Component, Gluten Free, Cookies, Muffin/Cake, Mother",
  "yieldAmount": number - the yield quantity (default 1 if not clear),
  "yieldUnit": "string - the yield unit (e.g. batch, loaves, kg, pieces)",
  "ingredients": [
    {
      "name": "string - ingredient name exactly as shown",
      "quantity": number - the quantity (weight/amount),
      "unit": "string - unit of measure (g, kg, ml, oz, lb, ea, etc.)"
    }
  ],
  "instructions": [
    {
      "step": number - step number starting at 1,
      "text": "string - instruction text"
    }
  ]
}

Guidelines:
- Weights should be in grams (g) when possible. Convert if needed.
- If no instructions are visible, return an empty instructions array.
- Choose the most appropriate category from the allowed list.
- If the yield is not clear, default to 1 batch.
- Return ONLY the JSON, no other text.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Parse this recipe image and extract all the data into the specified JSON format."
              },
              {
                type: "image_url",
                image_url: {
                  url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`,
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
      }), "recipe-scan");

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(400).json({ message: "Could not parse recipe image" });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(400).json({ message: "Could not extract recipe data. Please try a clearer photo." });
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("Recipe scan error:", error);
      res.status(500).json({ message: "Failed to parse recipe image. Please try again." });
    }
  });

  // === PRODUCTION LOGS ===
  app.get(api.productionLogs.list.path, async (req, res) => {
    const logs = await storage.getProductionLogs();
    res.json(logs);
  });

  app.post(api.productionLogs.create.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.productionLogs.create.input.parse(req.body);
      const log = await storage.createProductionLog(input);
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  // Recipe Sessions
  app.post("/api/recipe-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        recipeId: z.number().int(),
        recipeTitle: z.string(),
        scaleFactor: z.number().default(1),
        unitWeight: z.number().nullable().optional(),
        unitQty: z.number().int().nullable().optional(),
        scaledIngredients: z.any(),
        notes: z.string().nullable().optional(),
        assistMode: z.string().default("off"),
        startedAt: z.string().optional(),
        completedAt: z.string().optional(),
        taskListItemId: z.number().int().optional(),
      });
      const parsed = schema.parse(req.body);
      const session = await storage.createRecipeSession({
        ...parsed,
        userId: req.appUser.id,
        startedAt: parsed.startedAt ? new Date(parsed.startedAt) : new Date(),
        completedAt: parsed.completedAt ? new Date(parsed.completedAt) : new Date(),
      });

      // Inventory deduction: reduce onHand for linked ingredients
      if (parsed.scaledIngredients && Array.isArray(parsed.scaledIngredients)) {
        const allInventory = await storage.getInventoryItems();
        for (const ing of parsed.scaledIngredients) {
          let itemId = ing.inventoryItemId;
          if (!itemId && ing.name) {
            const match = allInventory.find((inv: any) => {
              const nameMatch = inv.name.toLowerCase() === ing.name.toLowerCase();
              const aliasMatch = inv.aliases && Array.isArray(inv.aliases) &&
                inv.aliases.some((a: string) => a.toLowerCase() === ing.name.toLowerCase());
              return nameMatch || aliasMatch;
            });
            if (match) itemId = match.id;
          }
          if (itemId && ing.quantity > 0) {
            try {
              await storage.deductInventoryItem(itemId, ing.quantity);
            } catch (e) {
              console.error(`[Inventory] Failed to deduct ${ing.name}:`, e);
            }
          }
        }
      }

      // Auto-complete linked task list item if taskListItemId provided
      if (parsed.taskListItemId) {
        try {
          await storage.updateTaskListItem(parsed.taskListItemId, {
            completed: true,
            completedAt: new Date(),
            completedBy: req.appUser.id,
          });
        } catch (e) {
          console.error("[Task] Failed to auto-complete task item:", e);
        }
      }

      // Prep EQ: auto-refill component if this recipe is linked
      try {
        const allComponents = await storage.getComponents();
        const linked = allComponents.filter(c => c.linkedRecipeId === parsed.recipeId);
        for (const comp of linked) {
          if (comp.yieldPerBatch) {
            const refillQty = comp.yieldPerBatch * (parsed.scaleFactor || 1);
            await storage.addComponentTransaction({
              componentId: comp.id,
              type: "refill",
              quantity: refillQty,
              referenceType: "recipe_session",
              referenceId: session.id,
              notes: `Auto-refill from recipe: ${parsed.recipeTitle} (×${parsed.scaleFactor || 1})`,
              createdBy: req.appUser.id,
            });
          }
        }
      } catch (e) {
        console.error("[PrepEQ] Failed to auto-refill component:", e);
      }

      res.status(201).json(session);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/recipe-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const recipeId = req.query.recipeId ? parseInt(req.query.recipeId) : undefined;
      const sessions = await storage.getRecipeSessions(recipeId);
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/users/:userId/recipe-assist", isAuthenticated, async (req: any, res) => {
    try {
      const requestingUser = req.appUser;
      if (requestingUser.role !== "owner" && requestingUser.role !== "manager") {
        return res.status(403).json({ message: "Only owners and managers can change recipe assist settings" });
      }
      const { mode } = z.object({ mode: z.enum(["off", "optional", "mandatory", "photo_required", "locked"]) }).parse(req.body);
      await storage.updateUserRecipeAssistMode(req.params.userId, mode);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === SOPs ===
  app.get(api.sops.list.path, async (req, res) => {
    const sops = await storage.getSOPs();
    res.json(sops);
  });

  app.get(api.sops.get.path, async (req, res) => {
    const sop = await storage.getSOP(Number(req.params.id));
    if (!sop) {
      return res.status(404).json({ message: 'SOP not found' });
    }
    res.json(sop);
  });

  app.post(api.sops.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.sops.create.input.parse(req.body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      if (user.role === "owner") {
        const sop = await storage.createSOP(input);
        return res.status(201).json(sop);
      }

      const pending = await storage.createPendingChange({
        entityType: "sop",
        action: "create",
        entityId: null,
        payload: input,
        originalPayload: null,
        changeReason: (req.body as any).changeReason || null,
        submittedBy: user.id,
        submittedByUsername: user.username || user.firstName || "Unknown",
        status: "pending",
        reviewedBy: null,
        reviewNote: null,
      });
      return res.status(202).json({ message: "Submitted for approval", pendingId: pending.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.sops.update.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.sops.update.input.parse(req.body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      if (user.role === "owner") {
        const sop = await storage.updateSOP(Number(req.params.id), input);
        return res.json(sop);
      }

      const existingSop = await storage.getSOP(Number(req.params.id));

      const pending = await storage.createPendingChange({
        entityType: "sop",
        action: "update",
        entityId: Number(req.params.id),
        payload: input,
        originalPayload: existingSop ? {
          title: existingSop.title,
          content: existingSop.content,
          category: existingSop.category,
        } : null,
        changeReason: (req.body as any).changeReason || null,
        submittedBy: user.id,
        submittedByUsername: user.username || user.firstName || "Unknown",
        status: "pending",
        reviewedBy: null,
        reviewNote: null,
      });
      return res.status(202).json({ message: "Update submitted for approval", pendingId: pending.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(404).json({ message: 'SOP not found' });
    }
  });

  app.delete(api.sops.delete.path, isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteSOP(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.sops.scan.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { image } = api.sops.scan.input.parse(req.body);

      const sizeBytes = Buffer.byteLength(image, "utf8");
      if (sizeBytes > 15 * 1024 * 1024) {
        return res.status(400).json({ message: "Image is too large. Please use a smaller photo (max ~10MB)." });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const allSops = await storage.getSOPs();
      const existingCategories = Array.from(new Set(allSops.map(s => s.category)));

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 8192,
        messages: [
          {
            role: "system",
            content: `You are a professional bakery SOP writer for Bear's Cup Bakehouse. Your job is to read images of existing SOPs (handwritten, printed, or typed) and convert them into clean, uniform, well-structured Standard Operating Procedures in Markdown format.

Return a JSON object with this exact structure:
{
  "title": "string - a clear, professional title for this SOP",
  "category": "string - best matching category from existing ones or a new appropriate one",
  "content": "string - the full SOP content in clean Markdown format"
}

Existing categories in use: ${existingCategories.length > 0 ? existingCategories.join(", ") : "General, Safety, Cleaning, Equipment, Production"}

FORMAT RULES for the content field:
- Use clear Markdown headings (## for sections)
- Use numbered lists for sequential steps
- Use bullet points for non-sequential items
- Bold key terms, temperatures, times, and measurements
- Include any safety warnings or notes in a clear format
- Keep the professional but approachable tone of a bakery
- Preserve ALL specific details from the original (temperatures, times, quantities, product names)
- If the image is hard to read, do your best and note any uncertain parts with [unclear] markers
- Return ONLY the JSON, no other text.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Read this SOP image and convert it into a clean, uniform, professional SOP document."
              },
              {
                type: "image_url",
                image_url: {
                  url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`,
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
      }), "sop-scan");

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(400).json({ message: "Could not read the SOP image. Try a clearer photo." });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            return res.status(400).json({ message: "AI returned invalid data. Please try again." });
          }
        } else {
          return res.status(400).json({ message: "AI returned invalid data. Please try again." });
        }
      }

      res.json({
        title: parsed.title || "Untitled SOP",
        category: parsed.category || "General",
        content: parsed.content || content,
      });
    } catch (err: any) {
      console.error("SOP scan error:", err);
      res.status(500).json({ message: err.message || "Failed to scan SOP image" });
    }
  });

  // === PROBLEMS ===
  app.get(api.problems.list.path, isAuthenticated, async (req, res) => {
    const filters: any = {};
    if (req.query.includeCompleted === "true") filters.includeCompleted = true;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.locationId) filters.locationId = Number(req.query.locationId);
    if (req.query.priority) filters.priority = req.query.priority as string;
    const problems = await storage.getProblems(filters);
    res.json(problems);
  });

  app.get("/api/problems/:id", isAuthenticated, async (req, res) => {
    const problem = await storage.getProblem(Number(req.params.id));
    if (!problem) return res.status(404).json({ message: "Problem not found" });
    res.json(problem);
  });

  app.post(api.problems.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.problems.create.input.parse(req.body);
      const problem = await storage.createProblem(input);

      const user = await getUserFromReq(req);
      const authorName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : (input.reportedBy || "System");
      try {
        await storage.createProblemNote({
          problemId: problem.id,
          content: `Problem reported: "${problem.title}"${problem.severity ? ` — Severity: ${problem.severity}` : ""}${problem.description ? `\n\n${problem.description}` : ""}`,
          authorId: user?.id || "system",
          authorName,
        });
      } catch (noteErr) {
        console.error("Failed to create initial problem note:", noteErr);
      }

      res.status(201).json(problem);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.patch(api.problems.update.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.problems.update.input.parse(req.body);
      const existing = await storage.getProblem(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Problem not found" });

      const targetAssignee = input.assignedTo || existing.assignedTo;
      if (input.status === "needs-attention" && targetAssignee) {
        const user = await getUserFromReq(req);
        if (user) {
          try {
            const [assignedUser] = await db.select().from(users).where(eq(users.id, targetAssignee));
            if (assignedUser) {
              const [msg] = await db.insert(directMessages).values({
                senderId: user.id,
                subject: "Problem Needs Your Attention",
                body: `**${existing.title}**\n\n${existing.description || "No description."}\n\nPlease check the Maintenance hub for details.`,
                priority: "urgent",
                requiresAck: false,
              }).returning();
              await db.insert(messageRecipients).values({
                messageId: msg.id,
                userId: assignedUser.id,
                read: false,
                acknowledged: false,
                pinned: false,
                archived: false,
              });
              try {
                const { sendPushToUser } = await import("./push");
                await sendPushToUser(assignedUser.id, {
                  title: "Problem Needs Your Attention",
                  body: existing.title,
                  url: "/maintenance",
                });
              } catch (pushErr) {
                console.error("Push notification failed:", pushErr);
              }
            }
          } catch (msgErr) {
            console.error("Failed to send needs-attention notification:", msgErr);
          }
        }
      }

      if (input.status === "resolved" && existing.status !== "resolved") {
        (input as any).resolvedAt = new Date();
        (input as any).completed = true;
      }

      const problem = await storage.updateProblem(Number(req.params.id), input);
      res.json(problem);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(404).json({ message: 'Problem not found' });
    }
  });

  app.delete(api.problems.delete.path, isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteProblem(Number(req.params.id));
    res.status(204).send();
  });

  // Problem Notes
  app.get("/api/problems/:id/notes", isAuthenticated, async (req, res) => {
    const notes = await storage.getProblemNotes(Number(req.params.id));
    res.json(notes);
  });

  app.post("/api/problems/:id/notes", isAuthenticated, isUnlocked, async (req: any, res) => {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const note = await storage.createProblemNote({
      problemId: Number(req.params.id),
      content: req.body.content,
      authorId: user.id,
      authorName: user.username || user.firstName || "Unknown",
    });
    res.status(201).json(note);
  });

  // Problem Contacts
  app.get("/api/problems/:id/contacts", isAuthenticated, async (req, res) => {
    const contacts = await storage.getProblemContacts(Number(req.params.id));
    res.json(contacts);
  });

  app.post("/api/problems/:id/contacts", isAuthenticated, isUnlocked, async (req, res) => {
    const link = await storage.linkContactToProblem({
      problemId: Number(req.params.id),
      serviceContactId: req.body.serviceContactId,
      role: req.body.role || null,
    });
    res.status(201).json(link);
  });

  app.delete("/api/problems/:id/contacts/:linkId", isAuthenticated, isUnlocked, async (req, res) => {
    await storage.unlinkContactFromProblem(Number(req.params.linkId));
    res.status(204).send();
  });

  // === SERVICE CONTACTS ===
  app.get("/api/service-contacts", isAuthenticated, async (req, res) => {
    if (req.query.search || req.query.q) {
      const query = (req.query.search || req.query.q) as string;
      const contacts = await storage.searchServiceContacts(query);
      return res.json(contacts);
    }
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const contacts = await storage.getServiceContacts(locationId);
    res.json(contacts);
  });

  app.get("/api/service-contacts/:id", isAuthenticated, async (req, res) => {
    const contact = await storage.getServiceContact(Number(req.params.id));
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.json(contact);
  });

  app.post("/api/service-contacts", isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = insertServiceContactSchema.parse(req.body);
      const contact = await storage.createServiceContact(input);
      res.status(201).json(contact);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/service-contacts/:id", isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = insertServiceContactSchema.partial().parse(req.body);
      const contact = await storage.updateServiceContact(Number(req.params.id), input);
      res.json(contact);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(404).json({ message: "Contact not found" });
    }
  });

  app.delete("/api/service-contacts/:id", isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteServiceContact(Number(req.params.id));
    res.status(204).send();
  });

  // === EQUIPMENT ===
  app.get("/api/equipment", isAuthenticated, async (req, res) => {
    if (req.query.search) {
      const results = await storage.searchEquipment(req.query.search as string);
      return res.json(results);
    }
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const items = await storage.getEquipment(locationId);
    res.json(items);
  });

  app.get("/api/equipment/maintenance/overdue", isAuthenticated, async (req, res) => {
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const overdue = await storage.getOverdueMaintenanceSchedules(locationId);
    res.json(overdue);
  });

  app.get("/api/equipment/:id", isAuthenticated, async (req, res) => {
    const item = await storage.getEquipmentItem(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Equipment not found" });
    res.json(item);
  });

  app.post("/api/equipment", isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = insertEquipmentSchema.parse(req.body);
      const item = await storage.createEquipment(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/equipment/:id", isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = insertEquipmentSchema.partial().parse(req.body);
      const item = await storage.updateEquipment(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(404).json({ message: "Equipment not found" });
    }
  });

  app.delete("/api/equipment/:id", isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteEquipment(Number(req.params.id));
    res.status(204).send();
  });

  // Equipment Maintenance
  app.get("/api/equipment/:id/maintenance", isAuthenticated, async (req, res) => {
    const schedules = await storage.getMaintenanceSchedules(Number(req.params.id));
    res.json(schedules);
  });

  app.post("/api/equipment/:id/maintenance", isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = insertEquipmentMaintenanceSchema.parse({ ...req.body, equipmentId: Number(req.params.id) });
      const schedule = await storage.createMaintenanceSchedule(input);
      res.status(201).json(schedule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/equipment/maintenance/:id", isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = insertEquipmentMaintenanceSchema.partial().parse(req.body);
      const schedule = await storage.updateMaintenanceSchedule(Number(req.params.id), input);
      res.json(schedule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(404).json({ message: "Schedule not found" });
    }
  });

  app.delete("/api/equipment/maintenance/:id", isAuthenticated, isUnlocked, async (req, res) => {
    await storage.deleteMaintenanceSchedule(Number(req.params.id));
    res.status(204).send();
  });

  // === PREP EQ ===
  app.get("/api/prep-eq/components", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const items = await storage.getComponents(locationId);
    res.json(items);
  });

  app.get("/api/prep-eq/components/:id", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const item = await storage.getComponent(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Component not found" });
    res.json(item);
  });

  app.post("/api/prep-eq/components", isAuthenticated, isBakeryDepartment, isUnlocked, async (req, res) => {
    try {
      const input = insertProductionComponentSchema.parse(req.body);
      const item = await storage.createComponent(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/prep-eq/components/:id", isAuthenticated, isBakeryDepartment, isUnlocked, async (req, res) => {
    try {
      const input = insertProductionComponentSchema.partial().parse(req.body);
      const item = await storage.updateComponent(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(404).json({ message: "Component not found" });
    }
  });

  app.delete("/api/prep-eq/components/:id", isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteComponent(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/prep-eq/components/:id/usage", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const usage = await storage.getComponentUsage(Number(req.params.id));
    res.json(usage);
  });

  app.get("/api/prep-eq/components/:id/transactions", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const txns = await storage.getComponentTransactions(Number(req.params.id), limit);
    res.json(txns);
  });

  app.post("/api/prep-eq/components/:id/adjust", isAuthenticated, isBakeryDepartment, isUnlocked, async (req: any, res) => {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const { quantity, notes } = req.body;
    if (typeof quantity !== "number" || isNaN(quantity) || quantity === 0) return res.status(400).json({ message: "Valid non-zero quantity required" });
    const compId = Number(req.params.id);
    if (isNaN(compId)) return res.status(400).json({ message: "Invalid component ID" });
    const txn = await storage.addComponentTransaction({
      componentId: Number(req.params.id),
      type: "adjustment",
      quantity,
      referenceType: "manual",
      notes: notes || "Manual adjustment",
      createdBy: user.id,
    });
    res.status(201).json(txn);
  });

  // BOM
  app.get("/api/prep-eq/bom/:pastryPassportId", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const bom = await storage.getBOM(Number(req.params.pastryPassportId));
    res.json(bom);
  });

  app.post("/api/prep-eq/bom", isAuthenticated, isBakeryDepartment, isUnlocked, async (req, res) => {
    try {
      const input = insertComponentBomSchema.parse(req.body);
      const item = await storage.setBOMItem(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/prep-eq/bom/:id", isAuthenticated, isBakeryDepartment, isUnlocked, async (req, res) => {
    try {
      const input = insertComponentBomSchema.partial().parse(req.body);
      const item = await storage.updateBOMItem(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(404).json({ message: "BOM item not found" });
    }
  });

  app.delete("/api/prep-eq/bom/:id", isAuthenticated, isBakeryDepartment, isUnlocked, async (req, res) => {
    await storage.deleteBOMItem(Number(req.params.id));
    res.status(204).send();
  });

  // Closeouts
  app.get("/api/prep-eq/closeouts", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const closeouts = await storage.getCloseouts(locationId, limit);
    res.json(closeouts);
  });

  app.get("/api/prep-eq/closeout/latest", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const closeout = await storage.getLatestCloseout(locationId);
    res.json(closeout || null);
  });

  app.get("/api/prep-eq/closeout/:id/items", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const items = await storage.getCloseoutItems(Number(req.params.id));
    res.json(items);
  });

  app.post("/api/prep-eq/closeout", isAuthenticated, isBakeryDepartment, isUnlocked, async (req: any, res) => {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const { notes, locationId, items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "items array required" });
    const closeout = await storage.createCloseout(
      { closedBy: user.id, locationId: locationId || undefined, notes: notes || undefined },
      items.map((item: any) => ({
        closeoutId: 0,
        componentId: item.componentId,
        reportedLevel: item.reportedLevel,
        previousLevel: item.previousLevel,
        notes: item.notes || undefined,
      }))
    );
    res.status(201).json(closeout);
  });

  // Analytics
  app.get("/api/prep-eq/demand", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const demand = await storage.getComponentDemand(date, locationId);
    res.json(demand);
  });

  app.get("/api/prep-eq/dashboard", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const components = await storage.getComponents(locationId);
    const date = new Date().toISOString().split("T")[0];
    const demand = await storage.getComponentDemand(date, locationId);
    const demandMap = new Map(demand.map(d => [d.componentId, d.demandQuantity]));
    const dashboard = components.map(c => ({
      ...c,
      demandToday: demandMap.get(c.id) || 0,
      shortfall: Math.max(0, (demandMap.get(c.id) || 0) - c.currentLevel),
      belowPar: c.parLevel != null && c.currentLevel < c.parLevel,
    }));
    res.json(dashboard);
  });

  app.get("/api/prep-eq/pieces-per-dough", isAuthenticated, isBakeryDepartment, async (req, res) => {
    const doughType = req.query.doughType as string;
    const days = req.query.days ? Number(req.query.days) : 30;
    if (!doughType) return res.status(400).json({ message: "doughType required" });

    const since = new Date();
    since.setDate(since.getDate() - days);
    const doughs = await db.select().from(laminationDoughs).where(
      and(
        eq(laminationDoughs.doughType, doughType),
        gte(laminationDoughs.createdAt, since),
        isNotNull(laminationDoughs.totalPieces)
      )
    );

    const pieces = doughs
      .filter(d => d.totalPieces && d.totalPieces > 0)
      .map(d => ({ pieces: d.totalPieces!, date: d.createdAt, doughId: d.id }));

    if (pieces.length === 0) {
      return res.json({ average: 0, median: 0, outliers: [], dataPoints: 0, recommended: null, manualOverride: null });
    }

    const sorted = pieces.map(p => p.pieces).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;

    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const upperFence = q3 + 1.5 * iqr;

    const outliers = pieces.filter(p => p.pieces > upperFence);

    const [component] = await db.select().from(productionComponents).where(
      and(eq(productionComponents.category, "dough"), sql`LOWER(${productionComponents.name}) LIKE LOWER(${'%' + doughType + '%'})`)
    );

    res.json({
      average: Math.round(mean * 10) / 10,
      median,
      outliers,
      dataPoints: pieces.length,
      upperFence: Math.round(upperFence * 10) / 10,
      recommended: null,
      manualOverride: component?.piecesPerDough || null,
    });
  });

  // === EVENTS ===
  function canSeePersonalEvent(event: any, userId: string | null, userDepartment: string | null): boolean {
    if (!event.isPersonal) return true;
    if (!userId) return false;
    if (event.createdBy === userId) return true;
    if (event.taggedUserIds && Array.isArray(event.taggedUserIds)) {
      const uidStr = String(userId);
      if (event.taggedUserIds.some((id: any) => String(id) === uidStr)) return true;
    }
    if (event.invitedDepartments && Array.isArray(event.invitedDepartments) && userDepartment && event.invitedDepartments.includes(userDepartment)) return true;
    return false;
  }

  app.get("/api/events/month", isAuthenticated, async (req: any, res) => {
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    const allEvents = await storage.getEventsByMonth(year, month);
    const userId = req.appUser?.id || null;
    const userDepartment = req.appUser?.department || null;
    const filtered = allEvents.filter((e: any) => canSeePersonalEvent(e, userId, userDepartment));
    res.json(filtered);
  });

  app.get("/api/events/:id", isAuthenticated, async (req: any, res) => {
    const event = await storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (!canSeePersonalEvent(event, req.appUser?.id || null, req.appUser?.department || null)) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  });

  app.get(api.events.list.path, isAuthenticated, async (req: any, res) => {
    const days = req.query.days ? Number(req.query.days) : 5;
    const allEvents = await storage.getUpcomingEvents(days);
    const userId = req.appUser?.id || null;
    const userDepartment = req.appUser?.department || null;
    const filtered = allEvents.filter((e: any) => canSeePersonalEvent(e, userId, userDepartment));
    res.json(filtered);
  });

  app.post(api.events.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.date === "string") body.date = new Date(body.date);
      body.createdBy = req.appUser?.id || null;
      const input = api.events.create.input.parse(body);
      const event = await storage.createEvent(input);
      res.status(201).json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.events.update.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const existing = await storage.getEvent(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Event not found" });
      if (existing.isPersonal && existing.createdBy !== req.appUser?.id) {
        return res.status(404).json({ message: "Event not found" });
      }
      const body = { ...req.body };
      if (typeof body.date === "string") body.date = new Date(body.date);
      const input = api.events.update.input.parse(body);
      const event = await storage.updateEvent(Number(req.params.id), input);
      res.json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(404).json({ message: 'Event not found' });
    }
  });

  app.delete(api.events.delete.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    const existing = await storage.getEvent(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Event not found" });
    if (existing.isPersonal && existing.createdBy !== req.appUser?.id) {
      return res.status(404).json({ message: "Event not found" });
    }
    await storage.deleteEvent(Number(req.params.id));
    res.status(204).send();
  });

  // === EVENT JOBS ===
  app.get("/api/events/:id/jobs", isAuthenticated, async (req, res) => {
    const jobs = await storage.getJobsByEvent(Number(req.params.id));
    res.json(jobs);
  });

  app.post("/api/events/:id/jobs", isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const { title, description, assignedUserIds } = req.body;
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Job title is required" });
      }
      const job = await storage.createEventJob({
        eventId,
        title: title.trim(),
        description: description || null,
        assignedUserIds: Array.isArray(assignedUserIds) && assignedUserIds.length > 0 ? assignedUserIds : null,
        completed: false,
      });
      res.status(201).json(job);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/event-jobs/:id", isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const allowed: Record<string, any> = {};
      if (typeof req.body.completed === "boolean") allowed.completed = req.body.completed;
      if (typeof req.body.title === "string") allowed.title = req.body.title.trim();
      if (req.body.description !== undefined) allowed.description = req.body.description || null;
      if (Array.isArray(req.body.assignedUserIds)) allowed.assignedUserIds = req.body.assignedUserIds;
      const job = await storage.updateEventJob(Number(req.params.id), allowed);
      res.json(job);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/event-jobs/:id", isAuthenticated, isUnlocked, async (req, res) => {
    await storage.deleteEventJob(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/my-event-jobs", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const numericId = typeof user.id === "string" ? parseInt(user.id, 10) : user.id;
      if (isNaN(numericId)) return res.json([]);
      const jobs = await storage.getJobsForUser(numericId);
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === CUSTOMER FEEDBACK (PUBLIC) ===
  app.post("/api/feedback", async (req, res) => {
    try {
      const { rating, comment, name, email, visitDate, locationId } = req.body;
      if (!rating || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
      }
      const trimmed = (s: any, max: number) => (typeof s === "string" ? s.trim().slice(0, max) || null : null);
      const parsedLocationId = typeof locationId === "number" ? locationId : (typeof locationId === "string" && locationId ? Number(locationId) : null);
      const feedback = await storage.createCustomerFeedback({
        rating,
        comment: trimmed(comment, 2000),
        name: trimmed(name, 100),
        email: trimmed(email, 200),
        visitDate: trimmed(visitDate, 10),
        locationId: parsedLocationId && !isNaN(parsedLocationId) ? parsedLocationId : null,
      });

      try {
        const feedbackTime = feedback.createdAt || new Date();
        const conditions = [
          lte(timeEntries.clockIn, feedbackTime),
          or(isNull(timeEntries.clockOut), gte(timeEntries.clockOut, feedbackTime)),
        ];
        if (feedback.locationId) {
          conditions.push(eq(timeEntries.locationId, feedback.locationId));
        }
        const clockedIn = await db.select().from(timeEntries).where(and(...conditions));
        for (const entry of clockedIn) {
          await storage.createSentimentShiftScore({
            userId: entry.userId,
            locationId: feedback.locationId || entry.locationId || null,
            feedbackId: feedback.id,
            rating: feedback.rating,
            shiftStart: entry.clockIn,
            shiftEnd: entry.clockOut || null,
            feedbackAt: feedbackTime,
          });
        }
      } catch (linkErr) {
        console.error("Failed to link feedback to shifts:", linkErr);
      }

      let jarvisResponse: string | null = null;
      let followUpToken: string | null = null;
      if (rating < 5) {
        const { randomBytes } = await import("crypto");
        followUpToken = randomBytes(32).toString("hex");

        try {
          const OpenAI = (await import("openai")).default;
          const ai = new OpenAI({
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          });
          const customerName = feedback.name || "friend";
          const systemMsg = `You are Jarvis, the warm and caring voice of Bear's Cup Bakehouse. A customer just left feedback that wasn't a perfect 5-star rating. Your job is to write a short, heartfelt, personalized response that:
1. Sincerely acknowledges their specific feedback (reference what they said if a comment was provided)
2. Expresses genuine gratitude for their honesty — their feedback matters MORE than a perfect score
3. Naturally mentions that if they're still in the shop, they're welcome to bring the item to the expo counter for a fresh remake or a full refund — no questions asked
4. Lets them know they can also leave their email and we'll personally follow up to make things right
5. Closes with appreciation for their business

Tone: Warm, genuine, humble. Like a bakery owner who truly cares — not corporate, not scripted. Short and sweet (3-5 sentences max). Do NOT use bullet points or numbered lists. Write it as a flowing, natural message. Use their name naturally if provided.`;

          const userMsg = `Customer: ${customerName}
Rating: ${rating}/5 stars
${feedback.comment ? `Their comment: "${feedback.comment}"` : "No comment provided — they just rated us."}

Write the personalized response:`;

          const completion = await ai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemMsg },
              { role: "user", content: userMsg },
            ],
            max_tokens: 200,
            temperature: 0.7,
          });
          jarvisResponse = completion.choices[0]?.message?.content || null;
        } catch (aiErr) {
          console.error("Failed to generate Jarvis feedback response:", aiErr);
        }

        await db.update(customerFeedback).set({
          jarvisResponse,
          followUpToken,
        }).where(eq(customerFeedback.id, feedback.id));
      }

      res.status(201).json({ ...feedback, jarvisResponse, followUpToken });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/feedback/:id/email", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { email, token } = req.body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      if (!token || typeof token !== "string") {
        return res.status(403).json({ message: "Invalid token" });
      }
      const [existing] = await db.select().from(customerFeedback).where(eq(customerFeedback.id, id));
      if (!existing || existing.followUpToken !== token) {
        return res.status(403).json({ message: "Invalid token" });
      }
      await db.update(customerFeedback).set({
        email: email.trim().slice(0, 200),
        followUpToken: null,
      }).where(eq(customerFeedback.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/feedback", isAuthenticated, isManager, async (_req, res) => {
    const feedback = await storage.getCustomerFeedback();
    res.json(feedback);
  });

  // === SENTIMENT MATRIX ===
  app.get("/api/sentiment/team-summary", isAuthenticated, isManager, async (req, res) => {
    try {
      const days = Number(req.query.days) || 30;
      const locId = req.query.locationId ? Number(req.query.locationId) : undefined;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const prevStart = new Date();
      prevStart.setDate(prevStart.getDate() - days * 2);

      const scores = await storage.getSentimentShiftScores({ locationId: locId, startDate });
      const prevScores = await storage.getSentimentShiftScores({ locationId: locId, startDate: prevStart, endDate: startDate });

      const allUsers = await db.select().from(users);
      const allLocations = await db.select().from(locations);

      const byUser: Record<string, { ratings: number[]; locationRatings: Record<number, number[]> }> = {};
      for (const s of scores) {
        if (!byUser[s.userId]) byUser[s.userId] = { ratings: [], locationRatings: {} };
        byUser[s.userId].ratings.push(s.rating);
        const lid = s.locationId || 0;
        if (!byUser[s.userId].locationRatings[lid]) byUser[s.userId].locationRatings[lid] = [];
        byUser[s.userId].locationRatings[lid].push(s.rating);
      }

      const prevByUser: Record<string, number[]> = {};
      for (const s of prevScores) {
        if (!prevByUser[s.userId]) prevByUser[s.userId] = [];
        prevByUser[s.userId].push(s.rating);
      }

      const teamSummary = Object.entries(byUser).map(([userId, data]) => {
        const u = allUsers.find(u => u.id === userId);
        const avg = data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length;
        const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        data.ratings.forEach(r => breakdown[r]++);
        const prevRatings = prevByUser[userId] || [];
        const prevAvg = prevRatings.length > 0 ? prevRatings.reduce((a, b) => a + b, 0) / prevRatings.length : null;
        const locationBreakdown = Object.entries(data.locationRatings).map(([lid, ratings]) => {
          const loc = allLocations.find(l => l.id === Number(lid));
          return {
            locationId: Number(lid),
            locationName: loc?.name || "Unknown",
            avgRating: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
            count: ratings.length,
          };
        });
        return {
          userId,
          firstName: u?.firstName || null,
          lastName: u?.lastName || null,
          avgRating: Number(avg.toFixed(2)),
          prevAvgRating: prevAvg ? Number(prevAvg.toFixed(2)) : null,
          totalFeedback: data.ratings.length,
          ratingBreakdown: breakdown,
          locationBreakdown,
        };
      }).sort((a, b) => b.avgRating - a.avgRating);

      const overallAvg = scores.length > 0 ? Number((scores.reduce((a, b) => a + b.rating, 0) / scores.length).toFixed(2)) : 0;
      const prevOverallAvg = prevScores.length > 0 ? Number((prevScores.reduce((a, b) => a + b.rating, 0) / prevScores.length).toFixed(2)) : null;

      res.json({ teamSummary, overallAvg, prevOverallAvg, totalFeedback: scores.length, days });
    } catch (err: any) {
      console.error("Sentiment team summary error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sentiment/shift-analysis", isAuthenticated, isManager, async (req, res) => {
    try {
      const days = Number(req.query.days) || 30;
      const locId = req.query.locationId ? Number(req.query.locationId) : undefined;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const scores = await storage.getSentimentShiftScores({ locationId: locId, startDate });
      const allUsers = await db.select().from(users);
      const allLocations = await db.select().from(locations);

      const windows: Record<string, { ratings: number[]; userRatings: Record<string, number[]>; locationRatings: Record<number, number[]> }> = {
        morning: { ratings: [], userRatings: {}, locationRatings: {} },
        afternoon: { ratings: [], userRatings: {}, locationRatings: {} },
        evening: { ratings: [], userRatings: {}, locationRatings: {} },
      };

      for (const s of scores) {
        const hour = s.shiftStart.getHours();
        let window = "evening";
        if (hour >= 5 && hour < 11) window = "morning";
        else if (hour >= 11 && hour < 17) window = "afternoon";
        const w = windows[window];
        w.ratings.push(s.rating);
        if (!w.userRatings[s.userId]) w.userRatings[s.userId] = [];
        w.userRatings[s.userId].push(s.rating);
        const lid = s.locationId || 0;
        if (!w.locationRatings[lid]) w.locationRatings[lid] = [];
        w.locationRatings[lid].push(s.rating);
      }

      const shifts = Object.entries(windows).map(([window, data]) => {
        const topPerformers = Object.entries(data.userRatings)
          .map(([uid, ratings]) => {
            const u = allUsers.find(u => u.id === uid);
            return {
              userId: uid,
              name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Unknown",
              avgRating: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
              count: ratings.length,
            };
          })
          .sort((a, b) => b.avgRating - a.avgRating)
          .slice(0, 5);
        const locationBreakdown = Object.entries(data.locationRatings).map(([lid, ratings]) => {
          const loc = allLocations.find(l => l.id === Number(lid));
          return {
            locationId: Number(lid),
            locationName: loc?.name || "Unknown",
            avgRating: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
            count: ratings.length,
          };
        });
        return {
          shiftWindow: window,
          avgRating: data.ratings.length > 0 ? Number((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(2)) : 0,
          count: data.ratings.length,
          topPerformers,
          locationBreakdown,
        };
      });

      res.json({ shifts });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sentiment/location-comparison", isAuthenticated, isManager, async (req, res) => {
    try {
      const days = Number(req.query.days) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const prevStart = new Date();
      prevStart.setDate(prevStart.getDate() - days * 2);

      const scores = await storage.getSentimentShiftScores({ startDate });
      const prevScores = await storage.getSentimentShiftScores({ startDate: prevStart, endDate: startDate });
      const allUsers = await db.select().from(users);
      const allLocations = await db.select().from(locations);

      const byLoc: Record<number, { ratings: number[]; userRatings: Record<string, number[]> }> = {};
      for (const s of scores) {
        const lid = s.locationId || 0;
        if (!byLoc[lid]) byLoc[lid] = { ratings: [], userRatings: {} };
        byLoc[lid].ratings.push(s.rating);
        if (!byLoc[lid].userRatings[s.userId]) byLoc[lid].userRatings[s.userId] = [];
        byLoc[lid].userRatings[s.userId].push(s.rating);
      }

      const prevByLoc: Record<number, number[]> = {};
      for (const s of prevScores) {
        const lid = s.locationId || 0;
        if (!prevByLoc[lid]) prevByLoc[lid] = [];
        prevByLoc[lid].push(s.rating);
      }

      const locationComparison = Object.entries(byLoc).map(([lid, data]) => {
        const loc = allLocations.find(l => l.id === Number(lid));
        const avg = data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length;
        const prevRatings = prevByLoc[Number(lid)] || [];
        const prevAvg = prevRatings.length > 0 ? prevRatings.reduce((a, b) => a + b, 0) / prevRatings.length : null;
        const topPerformers = Object.entries(data.userRatings)
          .map(([uid, ratings]) => {
            const u = allUsers.find(u => u.id === uid);
            return {
              userId: uid,
              name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Unknown",
              avgRating: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
              count: ratings.length,
            };
          })
          .sort((a, b) => b.avgRating - a.avgRating)
          .slice(0, 3);
        return {
          locationId: Number(lid),
          locationName: loc?.name || "Unknown",
          avgRating: Number(avg.toFixed(2)),
          prevAvgRating: prevAvg ? Number(prevAvg.toFixed(2)) : null,
          totalFeedback: data.ratings.length,
          topPerformers,
        };
      }).sort((a, b) => b.avgRating - a.avgRating);

      res.json({ locations: locationComparison });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sentiment/member/:userId", isAuthenticated, isManager, async (req, res) => {
    try {
      const { userId } = req.params;
      const days = Number(req.query.days) || 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const scores = await storage.getSentimentShiftScores({ userId, startDate });
      const allLocations = await db.select().from(locations);
      const allFeedback = await storage.getCustomerFeedback();

      if (scores.length === 0) {
        return res.json({
          userId, avgRating: 0, totalFeedback: 0,
          ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          recentFeedback: [], locationBreakdown: [], shiftBreakdown: [], trend: [],
        });
      }

      const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      scores.forEach(s => breakdown[s.rating]++);
      const avg = scores.reduce((a, b) => a + b.rating, 0) / scores.length;

      const recentFeedback = scores.slice(0, 10).map(s => {
        const fb = allFeedback.find(f => f.id === s.feedbackId);
        return {
          feedbackId: s.feedbackId,
          rating: s.rating,
          comment: fb?.comment || null,
          customerName: fb?.name || null,
          feedbackAt: s.feedbackAt,
          locationId: s.locationId,
        };
      });

      const locMap: Record<number, number[]> = {};
      const shiftMap: Record<string, number[]> = { morning: [], afternoon: [], evening: [] };
      for (const s of scores) {
        const lid = s.locationId || 0;
        if (!locMap[lid]) locMap[lid] = [];
        locMap[lid].push(s.rating);
        const hour = s.shiftStart.getHours();
        let window = "evening";
        if (hour >= 5 && hour < 11) window = "morning";
        else if (hour >= 11 && hour < 17) window = "afternoon";
        shiftMap[window].push(s.rating);
      }

      const locationBreakdown = Object.entries(locMap).map(([lid, ratings]) => {
        const loc = allLocations.find(l => l.id === Number(lid));
        return {
          locationId: Number(lid),
          locationName: loc?.name || "Unknown",
          avgRating: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
          count: ratings.length,
        };
      });

      const shiftBreakdown = Object.entries(shiftMap).map(([window, ratings]) => ({
        shiftWindow: window,
        avgRating: ratings.length > 0 ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : 0,
        count: ratings.length,
      }));

      const trendMap: Record<string, number[]> = {};
      for (const s of scores) {
        const week = new Date(s.feedbackAt).toISOString().slice(0, 10);
        const weekKey = week.slice(0, 7);
        if (!trendMap[weekKey]) trendMap[weekKey] = [];
        trendMap[weekKey].push(s.rating);
      }
      const trend = Object.entries(trendMap).sort().map(([period, ratings]) => ({
        period,
        avgRating: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
        count: ratings.length,
      }));

      res.json({
        userId, avgRating: Number(avg.toFixed(2)), totalFeedback: scores.length,
        ratingBreakdown: breakdown, recentFeedback, locationBreakdown, shiftBreakdown, trend,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sentiment/backfill", isAuthenticated, isOwner, async (req, res) => {
    try {
      const linkedIds = await storage.getLinkedFeedbackIds();
      const allFeedback = await storage.getCustomerFeedback();
      const unlinked = allFeedback.filter(f => !linkedIds.includes(f.id));
      let created = 0;

      for (const feedback of unlinked) {
        const feedbackTime = feedback.createdAt || new Date();
        const conditions: any[] = [
          lte(timeEntries.clockIn, feedbackTime),
          or(isNull(timeEntries.clockOut), gte(timeEntries.clockOut, feedbackTime)),
        ];
        if (feedback.locationId) {
          conditions.push(eq(timeEntries.locationId, feedback.locationId));
        }
        const clockedIn = await db.select().from(timeEntries).where(and(...conditions));
        for (const entry of clockedIn) {
          await storage.createSentimentShiftScore({
            userId: entry.userId,
            locationId: feedback.locationId || entry.locationId || null,
            feedbackId: feedback.id,
            rating: feedback.rating,
            shiftStart: entry.clockIn,
            shiftEnd: entry.clockOut || null,
            feedbackAt: feedbackTime,
          });
          created++;
        }
      }

      res.json({ backfilled: created, feedbackProcessed: unlinked.length });
    } catch (err: any) {
      console.error("Sentiment backfill error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // === THE LOOP (Feedback Action Dashboard) ===
  app.get("/api/loop/sentiment-trend", isAuthenticated, async (req: any, res) => {
    try {
      const locationId = req.query.locationId ? Number(req.query.locationId) : null;
      const days = Math.min(Number(req.query.days) || 30, 365);
      const since = new Date();
      since.setDate(since.getDate() - days);

      const allFeedback = await storage.getCustomerFeedback();
      const filtered = allFeedback.filter(f => {
        if (!f.createdAt || new Date(f.createdAt) < since) return false;
        if (locationId && f.locationId !== locationId) return false;
        return true;
      });

      const byDate: Record<string, { total: number; count: number }> = {};
      for (const f of filtered) {
        const day = new Date(f.createdAt!).toISOString().slice(0, 10);
        if (!byDate[day]) byDate[day] = { total: 0, count: 0 };
        byDate[day].total += f.rating;
        byDate[day].count += 1;
      }

      const trend = Object.entries(byDate)
        .map(([date, { total, count }]) => ({ date, avg: Math.round((total / count) * 100) / 100, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const totalRating = filtered.reduce((s, f) => s + f.rating, 0);
      const overallAvg = filtered.length > 0 ? Math.round((totalRating / filtered.length) * 100) / 100 : 0;

      const priorStart = new Date(since);
      priorStart.setDate(priorStart.getDate() - days);
      const priorFeedback = allFeedback.filter(f => {
        if (!f.createdAt) return false;
        const d = new Date(f.createdAt);
        if (d < priorStart || d >= since) return false;
        if (locationId && f.locationId !== locationId) return false;
        return true;
      });
      const priorAvg = priorFeedback.length > 0
        ? Math.round((priorFeedback.reduce((s, f) => s + f.rating, 0) / priorFeedback.length) * 100) / 100
        : null;

      res.json({ trend, overallAvg, totalCount: filtered.length, priorAvg, priorCount: priorFeedback.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/loop/themes", isAuthenticated, async (req: any, res) => {
    try {
      const locationId = req.query.locationId ? Number(req.query.locationId) : null;
      const days = Math.min(Number(req.query.days) || 90, 365);
      const since = new Date();
      since.setDate(since.getDate() - days);

      const allFeedback = await storage.getCustomerFeedback();
      const filtered = allFeedback.filter(f => {
        if (!f.createdAt || new Date(f.createdAt) < since) return false;
        if (locationId && f.locationId !== locationId) return false;
        return !!f.comment && f.comment.trim().length > 0;
      });

      if (filtered.length === 0) {
        return res.json({ themes: [] });
      }

      const comments = filtered.map(f => `[Rating: ${f.rating}/5] ${f.comment}`).slice(0, 200);

      const { openai: aiClient } = await import("./replit_integrations/audio/client");
      const completion = await aiClient.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content: `You are a customer feedback analyst for a bakery called Bear's Cup Bakehouse. Analyze these customer reviews and extract recurring themes that appear MORE THAN ONCE. Focus on actionable insights for shift leaders.

Return ONLY valid JSON — no markdown, no code fences. Format:
[{"theme":"short theme name","count":number_of_mentions,"sentiment":"negative"|"neutral"|"positive","examples":["quote1","quote2"]}]

Rules:
- Only include themes mentioned in 2+ reviews
- Keep theme names short (2-5 words)
- Include max 2 example quotes per theme, keep them brief
- Sort by count descending
- Max 10 themes`
          },
          {
            role: "user",
            content: `Analyze these ${comments.length} customer reviews:\n\n${comments.join("\n")}`
          }
        ],
      });

      let themes: any[] = [];
      try {
        const raw = completion.choices[0]?.message?.content?.trim() || "[]";
        const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
        themes = JSON.parse(cleaned);
      } catch {
        themes = [];
      }

      res.json({ themes, feedbackCount: filtered.length });
    } catch (err: any) {
      console.error("Loop themes error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/loop/recent", isAuthenticated, async (req: any, res) => {
    try {
      const locationId = req.query.locationId ? Number(req.query.locationId) : null;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 20, 50);

      const allFeedback = await storage.getCustomerFeedback();
      const filtered = locationId ? allFeedback.filter(f => f.locationId === locationId) : allFeedback;

      const total = filtered.length;
      const paginated = filtered.slice((page - 1) * limit, page * limit);

      res.json({ feedback: paginated, total, page, pages: Math.ceil(total / limit) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === ANNOUNCEMENTS ===
  app.get(api.announcements.list.path, async (req, res) => {
    const announcements = await storage.getAnnouncements();
    res.json(announcements);
  });

  app.post(api.announcements.create.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.announcements.create.input.parse(req.body);
      const announcement = await storage.createAnnouncement(input);
      if (input.pinned) {
        const allUsers = await authStorage.getAllUsers();
        const allUserIds = allUsers.map(u => u.id);
        sendPushToUsers(allUserIds, {
          title: "New Announcement",
          body: input.content.slice(0, 120) + (input.content.length > 120 ? "..." : ""),
          tag: `announcement-${announcement.id}`,
          url: "/dashboard",
        }).catch(err => console.error("[Push] Announcement notification error:", err));
      }
      res.status(201).json(announcement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.announcements.update.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.announcements.update.input.parse(req.body);
      const announcement = await storage.updateAnnouncement(Number(req.params.id), input);
      res.json(announcement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(404).json({ message: 'Announcement not found' });
    }
  });

  app.delete(api.announcements.delete.path, isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteAnnouncement(Number(req.params.id));
    res.status(204).send();
  });

  // === PENDING CHANGES / APPROVALS ===
  app.get("/api/pending-changes", isAuthenticated, async (req, res) => {
    const status = (req.query.status as string) || "pending";
    const changes = await storage.getPendingChanges(status);
    res.json(changes);
  });

  app.get("/api/pending-changes/count", isAuthenticated, async (req, res) => {
    const changes = await storage.getPendingChanges("pending");
    res.json({ count: changes.length });
  });

  app.post("/api/pending-changes/:id/approve", isAuthenticated, async (req: any, res) => {
    const approver = req.appUser as any;
    if (approver.role !== "owner" && !approver.isGeneralManager) {
      return res.status(403).json({ message: "Owner or General Manager access required" });
    }
    try {
      const changeId = Number(req.params.id);
      const change = await storage.getPendingChange(changeId);
      if (!change) return res.status(404).json({ message: "Pending change not found" });
      if (change.status !== "pending") return res.status(400).json({ message: "Already reviewed" });

      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const userId = user.id;
      const payload = change.payload as any;

      if (change.entityType === "recipe") {
        if (change.action === "create") {
          await storage.createRecipe(payload);
        } else if (change.action === "update" && change.entityId) {
          await storage.updateRecipe(change.entityId, payload, change.submittedBy, `Approved change by ${change.submittedByUsername || "team member"}`);
        }
      } else if (change.entityType === "sop") {
        if (change.action === "create") {
          await storage.createSOP(payload);
        } else if (change.action === "update" && change.entityId) {
          await storage.updateSOP(change.entityId, payload);
        }
      }

      const updated = await storage.updatePendingChangeStatus(changeId, "approved", userId, req.body?.reviewNote);
      res.json(updated);
    } catch (error: any) {
      console.error("Error approving change:", error?.message || error, error?.stack);
      res.status(500).json({ message: "Failed to approve change", detail: error?.message });
    }
  });

  app.post("/api/pending-changes/:id/reject", isAuthenticated, async (req: any, res) => {
    const rejecter = req.appUser as any;
    if (rejecter.role !== "owner" && !rejecter.isGeneralManager) {
      return res.status(403).json({ message: "Owner or General Manager access required" });
    }
    try {
      const changeId = Number(req.params.id);
      const change = await storage.getPendingChange(changeId);
      if (!change) return res.status(404).json({ message: "Pending change not found" });
      if (change.status !== "pending") return res.status(400).json({ message: "Already reviewed" });

      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const userId = user.id;
      const updated = await storage.updatePendingChangeStatus(changeId, "rejected", userId, req.body?.reviewNote);
      res.json(updated);
    } catch (error) {
      console.error("Error rejecting change:", error);
      res.status(500).json({ message: "Failed to reject change" });
    }
  });

  // === ADMIN BACKFILL ===
  app.post("/api/admin/backfill-pastry-ids", isAuthenticated, isOwner, async (req, res) => {
    try {
      const result = await storage.backfillPastryItemIds();
      res.json(result);
    } catch (error: any) {
      console.error("Backfill error:", error);
      res.status(500).json({ message: "Backfill failed: " + error.message });
    }
  });

  app.get("/api/admin/pipeline-health", isAuthenticated, isOwner, async (req, res) => {
    try {
      const allPastryItemsList = await db.select().from(pastryItems).where(eq(pastryItems.isActive, true));
      const totalPastryItems = allPastryItemsList.length;

      const allMappings = await db.select().from(squareCatalogMap).where(eq(squareCatalogMap.isActive, true));
      const mappedPastryNames = new Set(allMappings.filter(m => m.pastryItemName).map(m => m.pastryItemName!.toLowerCase()));
      const mappedCount = allPastryItemsList.filter(pi => mappedPastryNames.has(pi.name.toLowerCase())).length;

      const allPassports = await db.select().from(pastryPassports);
      const passportsLinked = allPassports.filter(p => p.pastryItemId).length;
      const passportWithRecipe = allPassports.filter(p => p.motherRecipeId || p.primaryRecipeId).length;

      const allInventory = await db.select().from(inventoryItems);
      const inventoryWithCost = allInventory.filter(i => i.costPerUnit && i.costPerUnit > 0).length;

      const uniqueDoughTypes = [...new Set(allPastryItemsList.map(pi => pi.doughType))];
      const allDoughConfigs = await db.select().from(doughTypeConfigs);
      const configuredDoughTypes = new Set(allDoughConfigs.map(c => c.doughType));
      const doughTypesCovered = uniqueDoughTypes.filter(dt => configuredDoughTypes.has(dt)).length;

      let squareConnected = false;
      try {
        const testResult = await testSquareConnection();
        squareConnected = testResult.success;
      } catch { }

      const steps = [
        { name: "Square Connection", status: squareConnected ? "complete" : "missing", current: squareConnected ? 1 : 0, total: 1 },
        { name: "Catalog Mappings", status: mappedCount >= totalPastryItems ? "complete" : mappedCount > 0 ? "partial" : "missing", current: mappedCount, total: totalPastryItems },
        { name: "Pastry Passports", status: passportsLinked >= totalPastryItems ? "complete" : passportsLinked > 0 ? "partial" : "missing", current: passportsLinked, total: totalPastryItems },
        { name: "Recipe Links", status: passportWithRecipe >= allPassports.length && allPassports.length > 0 ? "complete" : passportWithRecipe > 0 ? "partial" : "missing", current: passportWithRecipe, total: allPassports.length },
        { name: "Ingredient Costing", status: inventoryWithCost >= allInventory.length && allInventory.length > 0 ? "complete" : inventoryWithCost > 0 ? "partial" : "missing", current: inventoryWithCost, total: allInventory.length },
        { name: "Dough Type Configs", status: doughTypesCovered >= uniqueDoughTypes.length ? "complete" : doughTypesCovered > 0 ? "partial" : "missing", current: doughTypesCovered, total: uniqueDoughTypes.length },
      ];

      const completedSteps = steps.filter(s => s.status === "complete").length;
      const overallPct = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;

      res.json({ steps, overallPct });
    } catch (error: any) {
      console.error("Pipeline health error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === SQUARE INTEGRATION ===
  app.get("/api/square/test", isAuthenticated, isOwner, async (req, res) => {
    try {
      const result = await testSquareConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/square/catalog", isAuthenticated, isOwner, async (req, res) => {
    try {
      const items = await fetchSquareCatalog();
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/square/catalog-map", isAuthenticated, async (req, res) => {
    const mappings = await db.select().from(squareCatalogMap).orderBy(squareCatalogMap.squareItemName);
    res.json(mappings);
  });

  app.post("/api/square/catalog-map", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { squareItemId, squareItemName, squareVariationId, squareVariationName, pastryItemName, pastryItemId, targetType, coffeeDrinkId, coffeeDrinkName } = req.body;
      let resolvedPastryItemId = pastryItemId || null;
      if (!resolvedPastryItemId && pastryItemName && (!targetType || targetType === "pastry")) {
        resolvedPastryItemId = await storage.resolvePastryItemId(pastryItemName);
      }
      const [mapping] = await db.insert(squareCatalogMap).values({
        squareItemId,
        squareItemName,
        squareVariationId: squareVariationId || null,
        squareVariationName: squareVariationName || null,
        pastryItemName: targetType === "drink" ? null : (pastryItemName || null),
        pastryItemId: targetType === "drink" ? null : resolvedPastryItemId,
        targetType: targetType || "pastry",
        coffeeDrinkId: targetType === "drink" ? (coffeeDrinkId || null) : null,
        coffeeDrinkName: targetType === "drink" ? (coffeeDrinkName || null) : null,
        isActive: true,
      }).returning();
      if (targetType === "drink" && coffeeDrinkId && squareItemId) {
        await db.update(coffeeDrinkRecipes).set({
          squareItemId,
          squareItemName: squareItemName,
          squareVariationId: squareVariationId || null,
        }).where(eq(coffeeDrinkRecipes.id, coffeeDrinkId));
      }
      res.status(201).json(mapping);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/square/catalog-map/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { pastryItemName, isActive } = req.body;
      const updates: any = {};
      if (pastryItemName !== undefined) updates.pastryItemName = pastryItemName;
      if (isActive !== undefined) updates.isActive = isActive;
      const [updated] = await db.update(squareCatalogMap).set(updates).where(eq(squareCatalogMap.id, id)).returning();
      if (updated.targetType === "drink" && updated.coffeeDrinkId && isActive === false) {
        await db.update(coffeeDrinkRecipes).set({
          squareItemId: null,
          squareItemName: null,
          squareVariationId: null,
        }).where(eq(coffeeDrinkRecipes.id, updated.coffeeDrinkId));
      }
      if (updated.targetType === "drink" && updated.coffeeDrinkId && isActive === true) {
        await db.update(coffeeDrinkRecipes).set({
          squareItemId: updated.squareItemId,
          squareItemName: updated.squareItemName,
          squareVariationId: updated.squareVariationId || null,
        }).where(eq(coffeeDrinkRecipes.id, updated.coffeeDrinkId));
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/square/catalog-map/:id", isAuthenticated, isOwner, async (req, res) => {
    const [deleted] = await db.delete(squareCatalogMap).where(eq(squareCatalogMap.id, Number(req.params.id))).returning();
    if (deleted?.targetType === "drink" && deleted.coffeeDrinkId) {
      await db.update(coffeeDrinkRecipes).set({
        squareItemId: null,
        squareItemName: null,
        squareVariationId: null,
      }).where(eq(coffeeDrinkRecipes.id, deleted.coffeeDrinkId));
    }
    res.status(204).send();
  });

  app.post("/api/square/catalog-map/auto-match", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const catalog = await fetchSquareCatalog();
      const allPastryItems = await db.select().from(pastryItems).where(eq(pastryItems.isActive, true));
      const existingMappings = await db.select().from(squareCatalogMap);
      const mappedSquareIds = new Set(existingMappings.map(m => m.squareItemId));

      const suggestions: {
        squareItemId: string;
        squareItemName: string;
        squareVariationId: string | null;
        squareVariationName: string | null;
        pastryItemId: number;
        pastryItemName: string;
        confidence: "exact" | "likely" | "possible";
      }[] = [];

      for (const item of catalog) {
        if (mappedSquareIds.has(item.id)) continue;
        const sqName = (item.name || "").trim();
        const sqNameLower = sqName.toLowerCase();

        let bestMatch: { pastryItem: typeof allPastryItems[0]; confidence: "exact" | "likely" | "possible" } | null = null;

        for (const pi of allPastryItems) {
          const piNameLower = pi.name.toLowerCase();
          if (sqNameLower === piNameLower) {
            bestMatch = { pastryItem: pi, confidence: "exact" };
            break;
          }
        }

        if (!bestMatch) {
          for (const pi of allPastryItems) {
            const piNameLower = pi.name.toLowerCase();
            if (sqNameLower.includes(piNameLower) || piNameLower.includes(sqNameLower)) {
              bestMatch = { pastryItem: pi, confidence: "likely" };
              break;
            }
          }
        }

        if (!bestMatch) {
          for (const pi of allPastryItems) {
            const piWords = pi.name.toLowerCase().split(/\s+/);
            const sqWords = sqNameLower.split(/\s+/);
            const overlap = piWords.filter((w: string) => w.length > 2 && sqWords.some((sw: string) => sw.includes(w) || w.includes(sw)));
            if (overlap.length > 0 && overlap.length >= Math.min(piWords.length, sqWords.length) * 0.5) {
              bestMatch = { pastryItem: pi, confidence: "possible" };
              break;
            }
          }
        }

        if (bestMatch) {
          const variation = item.variations?.[0];
          suggestions.push({
            squareItemId: item.id,
            squareItemName: sqName,
            squareVariationId: variation?.id || null,
            squareVariationName: variation?.name || null,
            pastryItemId: bestMatch.pastryItem.id,
            pastryItemName: bestMatch.pastryItem.name,
            confidence: bestMatch.confidence,
          });
        }
      }

      res.json(suggestions);
    } catch (error: any) {
      console.error("Auto-match error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/square/catalog-map/bulk", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const schema = z.object({
        mappings: z.array(z.object({
          squareItemId: z.string(),
          squareItemName: z.string(),
          squareVariationId: z.string().nullable(),
          squareVariationName: z.string().nullable(),
          pastryItemId: z.number(),
          pastryItemName: z.string(),
        })),
      });
      const { mappings: toCreate } = schema.parse(req.body);
      const created = [];
      for (const m of toCreate) {
        const [mapping] = await db.insert(squareCatalogMap).values({
          squareItemId: m.squareItemId,
          squareItemName: m.squareItemName,
          squareVariationId: m.squareVariationId,
          squareVariationName: m.squareVariationName,
          pastryItemName: m.pastryItemName,
          pastryItemId: m.pastryItemId,
          isActive: true,
        }).returning();
        created.push(mapping);
      }
      res.status(201).json({ created: created.length, mappings: created });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/square/sync", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const date = (req.body?.date as string) || new Date().toISOString().split("T")[0];
      const locationId = req.body?.locationId ? parseInt(req.body.locationId, 10) : undefined;
      const result = await syncSquareSales(date, locationId);
      try {
        const { journalizeSquareRevenue } = await import("./accounting-engine");
        await journalizeSquareRevenue(date, date);
      } catch (journalErr: any) {
        console.error("[Square Sync] Auto-journalize failed:", journalErr.message);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/firm/journalize-square", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { journalizeSquareRevenue } = await import("./accounting-engine");
      const startDate = req.body?.startDate || `${new Date().getFullYear()}-01-01`;
      const endDate = req.body?.endDate || new Date().toISOString().slice(0, 10);
      const result = await journalizeSquareRevenue(startDate, endDate);
      console.log(`[Journalize Square] ${startDate} → ${endDate}: ${result.journalized} journalized, ${result.skipped} skipped of ${result.total} summaries`);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/firm/backfill-journal-entries", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { postJournalEntry } = await import("./accounting-engine");

      const SPECIAL_CATEGORIES = new Set(["owner_draw", "prior_period_adjustment", "loan_principal", "sales_tax_payment", "equipment", "rent_split", "debt_payment", "Test Expense"]);
      const REVENUE_CATEGORIES = new Set(["revenue", "other_income"]);
      const CATEGORY_COA_MAP: Record<string, { debit: string; credit: string }> = {
        cogs: { debit: "5010", credit: "1010" },
        labor: { debit: "6010", credit: "1010" },
        supplies: { debit: "6090", credit: "1010" },
        utilities: { debit: "6040", credit: "1010" },
        rent: { debit: "6030", credit: "1010" },
        insurance: { debit: "6050", credit: "1010" },
        marketing: { debit: "6060", credit: "1010" },
        taxes: { debit: "6020", credit: "1010" },
        travel_lodging: { debit: "6140", credit: "1010" },
        repairs: { debit: "6070", credit: "1010" },
        advertising: { debit: "6060", credit: "1010" },
        car_mileage: { debit: "6150", credit: "1010" },
        vehicle_expense: { debit: "6155", credit: "1010" },
        commissions: { debit: "6160", credit: "1010" },
        contract_labor: { debit: "6170", credit: "1010" },
        employee_benefits: { debit: "6180", credit: "1010" },
        professional_services: { debit: "6100", credit: "1010" },
        licenses_permits: { debit: "6190", credit: "1010" },
        bank_charges: { debit: "6200", credit: "1010" },
        amortization: { debit: "6210", credit: "1010" },
        pension_plans: { debit: "6220", credit: "1010" },
        llc_fee: { debit: "6230", credit: "1010" },
        meals_deductible: { debit: "6240", credit: "1010" },
        interest_mortgage: { debit: "6250", credit: "1010" },
        interest_other: { debit: "6260", credit: "1010" },
        technology: { debit: "6080", credit: "1010" },
        misc: { debit: "6090", credit: "1010" },
        loan_interest: { debit: "6260", credit: "1010" },
        donations_charity: { debit: "7700", credit: "1010" },
        donations_promo: { debit: "7040", credit: "1010" },
      };

      const allTxns = await db.select().from(firmTransactions);
      const categorized = allTxns.filter(t => t.category && !SPECIAL_CATEGORIES.has(t.category) && !REVENUE_CATEGORIES.has(t.category) && CATEGORY_COA_MAP[t.category]);

      const existingJEs = await db.select({ referenceId: journalEntries.referenceId })
        .from(journalEntries)
        .where(eq(journalEntries.referenceType, "firm-txn"));
      const alreadyPosted = new Set(existingJEs.map(e => e.referenceId));

      const allAccounts = await db.select().from(chartOfAccounts);
      const codeToId = new Map(allAccounts.map(a => [a.code, a.id]));

      let posted = 0;
      let skipped = 0;
      let errors = 0;

      for (const txn of categorized) {
        if (alreadyPosted.has(String(txn.id))) {
          skipped++;
          continue;
        }

        const absAmount = Math.abs(txn.amount);

        if (txn.category === "labor") {
          const activeAccruals = await db.select().from(journalEntries)
            .where(and(eq(journalEntries.referenceType, "labor_accrual"), eq(journalEntries.status, "posted")));
          if (activeAccruals.length > 0) {
            const payrollLiabId = codeToId.get("2100");
            const cashId = codeToId.get("1010");
            if (payrollLiabId && cashId) {
              try {
                await postJournalEntry(
                  {
                    transactionDate: txn.date,
                    description: `Payroll payment (accrual reversal): ${txn.description}`,
                    referenceType: "firm-txn",
                    referenceId: String(txn.id),
                    status: "posted",
                    locationId: txn.locationId ?? undefined,
                    createdBy: "system-backfill",
                  },
                  [
                    { accountId: payrollLiabId, debit: absAmount, credit: 0, memo: `Reversal of accrued payroll` },
                    { accountId: cashId, debit: 0, credit: absAmount, memo: `Cash payment for payroll` },
                  ]
                );
                posted++;
              } catch (err: any) { errors++; }
              continue;
            }
          }
        }

        const mapping = CATEGORY_COA_MAP[txn.category!];
        const debitId = codeToId.get(mapping.debit);
        const creditId = codeToId.get(mapping.credit);

        if (!debitId || !creditId) {
          errors++;
          continue;
        }

        try {
          await postJournalEntry(
            {
              transactionDate: txn.date,
              description: txn.description,
              referenceType: "firm-txn",
              referenceId: String(txn.id),
              status: "posted",
              locationId: txn.locationId ?? undefined,
              createdBy: "system-backfill",
            },
            [
              { accountId: debitId, debit: absAmount, credit: 0, memo: txn.description },
              { accountId: creditId, debit: 0, credit: absAmount, memo: txn.description },
            ]
          );
          posted++;
        } catch (err: any) {
          console.error(`[Backfill] Failed for txn ${txn.id}:`, err.message);
          errors++;
        }
      }

      res.json({ posted, skipped, errors, totalCategorized: categorized.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/cleanup-revenue-journal-entries", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const revenueAccounts = await db.select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.type, "Revenue"));
      const revenueAccountIds = new Set(revenueAccounts.map(a => a.id));

      const firmTxnEntries = await db.select({ id: journalEntries.id, referenceId: journalEntries.referenceId, description: journalEntries.description })
        .from(journalEntries)
        .where(eq(journalEntries.referenceType, "firm-txn"));

      let deleted = 0;
      for (const entry of firmTxnEntries) {
        const lines = await db.select().from(ledgerLines).where(eq(ledgerLines.entryId, entry.id));
        const hasRevenueLine = lines.some(l => revenueAccountIds.has(l.accountId));
        if (hasRevenueLine) {
          await db.delete(ledgerLines).where(eq(ledgerLines.entryId, entry.id));
          await db.delete(journalEntries).where(eq(journalEntries.id, entry.id));
          deleted++;
        }
      }

      res.json({ deleted, message: `Removed ${deleted} revenue journal entries from bank transactions. Revenue should only come from Square.` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/rebuild-revenue", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const allSquareJes = await db.select({ id: journalEntries.id })
        .from(journalEntries)
        .where(eq(journalEntries.referenceType, "square-daily"));

      let deletedJes = 0;
      for (const je of allSquareJes) {
        await db.delete(ledgerLines).where(eq(ledgerLines.entryId, je.id));
        await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
        deletedJes++;
      }
      console.log(`[Rebuild Revenue] Deleted ${deletedJes} stale square-daily JEs`);

      const ytdStart = `${new Date().getFullYear()}-01-01`;
      const today = new Date().toISOString().slice(0, 10);

      const { journalizeSquareRevenue } = await import("./accounting-engine");
      const result = await journalizeSquareRevenue(ytdStart, today);

      res.json({
        deletedOldJes: deletedJes,
        journalized: result.journalized,
        skipped: result.skipped,
        cleaned: result.cleaned,
        message: `Rebuilt revenue: deleted ${deletedJes} old JEs, created ${result.journalized} new JEs from corrected Square data`
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/square/sales", isAuthenticated, isOwner, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined;
    const sales = await getSquareSalesForDate(date, locationId);
    res.json(sales);
  });

  app.post("/api/square/backfill", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ message: "Invalid dates" });

      const dates: string[] = [];
      const current = new Date(start);
      while (current <= end) {
        dates.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }

      console.log(`[Square Backfill] Starting backfill for ${dates.length} days (${startDate} → ${endDate})`);
      res.json({ message: `Backfill started for ${dates.length} days`, daysQueued: dates.length });

      (async () => {
        let synced = 0;
        let errors = 0;
        for (const date of dates) {
          try {
            await syncSquareSales(date);
            synced++;
            if (synced % 7 === 0) {
              console.log(`[Square Backfill] Progress: ${synced}/${dates.length} days synced`);
            }
          } catch (err: any) {
            errors++;
            console.error(`[Square Backfill] Error on ${date}: ${err.message}`);
          }
          await new Promise(r => setTimeout(r, 200));
        }
        console.log(`[Square Backfill] Complete: ${synced} synced, ${errors} errors out of ${dates.length} days`);

        try {
          const { journalizeSquareRevenue } = await import("./accounting-engine");
          const result = await journalizeSquareRevenue(startDate, endDate);
          console.log(`[Square Backfill] Auto-journalized revenue: ${result.journalized} new, ${result.skipped} already existed`);
        } catch (journalErr: any) {
          console.error(`[Square Backfill] Auto-journalize failed: ${journalErr.message}`);
        }
      })();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/firm/undeposited-cash", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const startDate = (req.query.startDate as string) || "2025-01-01";
      const endDate = (req.query.endDate as string) || new Date().toISOString().slice(0, 10);

      const summaryRows = await db.select().from(squareDailySummary).where(
        and(gte(squareDailySummary.date, startDate), lte(squareDailySummary.date, endDate))
      );

      const boltonLocId = "XFS6DD0Z4HHKJ";
      const saratogaLocId = "L8JQJBM6C66AK";

      let boltonCashTender = 0, saratogaCashTender = 0;
      let boltonTotalRevenue = 0, saratogaTotalRevenue = 0;
      let boltonProcessingFees = 0, saratogaProcessingFees = 0;

      for (const row of summaryRows) {
        if (row.squareLocationId === boltonLocId) {
          boltonCashTender += row.cashTender || 0;
          boltonTotalRevenue += row.totalRevenue || 0;
          boltonProcessingFees += row.processingFees || 0;
        } else if (row.squareLocationId === saratogaLocId) {
          saratogaCashTender += row.cashTender || 0;
          saratogaTotalRevenue += row.totalRevenue || 0;
          saratogaProcessingFees += row.processingFees || 0;
        } else {
          boltonCashTender += row.cashTender || 0;
          boltonTotalRevenue += row.totalRevenue || 0;
          boltonProcessingFees += row.processingFees || 0;
        }
      }

      const totalSquareCashTender = boltonCashTender + saratogaCashTender;

      const cashDeposits = await db.select().from(firmTransactions).where(
        and(
          gte(firmTransactions.date, startDate),
          lte(firmTransactions.date, endDate),
          or(
            eq(firmTransactions.category, "revenue"),
          )
        )
      );

      let cashDeposited = 0;
      let reimbursements = 0;
      for (const txn of cashDeposits) {
        const desc = (txn.description || "").toLowerCase();
        const tags = txn.tags || [];
        const isCashDeposit = desc.includes("cash deposit") || desc.includes("cash drop") ||
          desc.includes("atm deposit") || tags.includes("cash_deposit");
        const isReimbursement = desc.includes("reimbursement") || desc.includes("reimburse") ||
          tags.includes("reimbursement") || txn.category === "other_income";

        if (isCashDeposit && txn.amount > 0) {
          cashDeposited += txn.amount;
        }
        if (isReimbursement && txn.amount > 0) {
          reimbursements += txn.amount;
        }
      }

      const reimbursementTxns = await db.select().from(firmTransactions).where(
        and(
          gte(firmTransactions.date, startDate),
          lte(firmTransactions.date, endDate),
          eq(firmTransactions.category, "other_income"),
        )
      );
      for (const txn of reimbursementTxns) {
        const desc = (txn.description || "").toLowerCase();
        if (desc.includes("reimburse") && txn.amount > 0) {
          reimbursements += txn.amount;
        }
      }

      const undepositedCash = Math.max(0, totalSquareCashTender - cashDeposited - reimbursements);

      res.json({
        totalSquareCashTender,
        boltonCashTender,
        saratogaCashTender,
        cashDeposited,
        reimbursements,
        undepositedCash,
        squareGrossRevenue: boltonTotalRevenue + saratogaTotalRevenue,
        boltonGrossRevenue: boltonTotalRevenue,
        saratogaGrossRevenue: saratogaTotalRevenue,
        totalProcessingFees: boltonProcessingFees + saratogaProcessingFees,
        period: { startDate, endDate },
        daysCovered: summaryRows.length,
      });
    } catch (error: any) {
      console.error("[Undeposited Cash] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/square/team-members", isAuthenticated, isOwner, async (req, res) => {
    try {
      const result = await fetchSquareTeamMembers();
      if (!result.success) {
        return res.status(500).json({ message: result.error });
      }

      const allUsers = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        squareTeamMemberId: users.squareTeamMemberId,
      }).from(users);

      const membersWithLinks = result.members.map((m: any) => {
        const linkedUser = allUsers.find(u => u.squareTeamMemberId === m.id);
        return {
          ...m,
          jarvisUserId: linkedUser?.id || null,
          jarvisUserName: linkedUser ? `${linkedUser.firstName || ""} ${linkedUser.lastName || ""}`.trim() : null,
        };
      });

      const unlinkedJarvisUsers = allUsers
        .filter(u => !u.squareTeamMemberId)
        .map(u => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
        }));

      res.json({ members: membersWithLinks, unlinkedJarvisUsers });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/square/team-members/link", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { userId, squareTeamMemberId } = req.body;
      if (!userId || !squareTeamMemberId) {
        return res.status(400).json({ message: "userId and squareTeamMemberId are required" });
      }

      await db.update(users)
        .set({ squareTeamMemberId })
        .where(eq(users.id, userId));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/square/team-members/unlink", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      await db.update(users)
        .set({ squareTeamMemberId: null })
        .where(eq(users.id, userId));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/square/team-members/auto-link", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const result = await fetchSquareTeamMembers();
      if (!result.success) {
        return res.status(500).json({ message: result.error });
      }

      const allUsers = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        squareTeamMemberId: users.squareTeamMemberId,
      }).from(users);

      let linked = 0;
      const matches: Array<{ jarvisUser: string; squareMember: string }> = [];

      for (const member of result.members) {
        const alreadyLinked = allUsers.find(u => u.squareTeamMemberId === member.id);
        if (alreadyLinked) continue;

        const nameMatch = allUsers.find(u => {
          if (u.squareTeamMemberId) return false;
          const jFirst = (u.firstName || "").toLowerCase().trim();
          const jLast = (u.lastName || "").toLowerCase().trim();
          const sFirst = (member.firstName || "").toLowerCase().trim();
          const sLast = (member.lastName || "").toLowerCase().trim();
          return jFirst === sFirst && jLast === sLast;
        });

        if (nameMatch) {
          await db.update(users)
            .set({ squareTeamMemberId: member.id })
            .where(eq(users.id, nameMatch.id));
          nameMatch.squareTeamMemberId = member.id;
          linked++;
          matches.push({
            jarvisUser: `${nameMatch.firstName} ${nameMatch.lastName}`,
            squareMember: `${member.firstName} ${member.lastName}`,
          });
        }
      }

      res.json({ success: true, linked, matches });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/square/timecards/sync", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate, locationId } = req.body;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required (YYYY-MM-DD)" });
      }
      if (startDate > endDate) {
        return res.status(400).json({ message: "startDate must be before or equal to endDate" });
      }
      const daySpan = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daySpan > 90) {
        return res.status(400).json({ message: "Date range cannot exceed 90 days" });
      }

      const result = await syncSquareTimecards(startDate, endDate, locationId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/square/timecards/status", isAuthenticated, isOwner, async (req, res) => {
    try {
      const linkedCount = await db.select({ id: users.id })
        .from(users)
        .where(isNotNull(users.squareTeamMemberId));

      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const recentSquareEntries = await db.select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.source, "square"),
            gte(timeEntries.clockIn, new Date(weekAgo + "T00:00:00Z"))
          )
        );

      res.json({
        linkedTeamMembers: linkedCount.length,
        recentSquareEntries: recentSquareEntries.length,
        hasSquareToken: !!process.env.SQUARE_ACCESS_TOKEN,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/square/webhooks", async (req: any, res) => {
    try {
      const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
      if (!signatureKey) {
        console.warn("[Square Webhook] No SQUARE_WEBHOOK_SIGNATURE_KEY configured, rejecting");
        return res.status(403).json({ message: "Webhook not configured" });
      }

      const signature = req.headers["x-square-hmacsha256-signature"];
      if (!signature) {
        return res.status(403).json({ message: "Missing signature" });
      }

      const { WebhooksHelper } = await import("square");

      const rawBody = req.rawBody instanceof Buffer ? req.rawBody.toString("utf8") : String(req.rawBody || "");

      const forwardedProto = req.headers["x-forwarded-proto"] || req.protocol;
      const forwardedHost = req.headers["x-forwarded-host"] || req.get("host");
      const notificationUrl = process.env.SQUARE_WEBHOOK_URL || `${forwardedProto}://${forwardedHost}/api/square/webhooks`;

      const isValid = WebhooksHelper.verifySignature({
        requestBody: rawBody,
        signatureHeader: signature,
        signatureKey: signatureKey,
        notificationUrl: notificationUrl,
      });

      if (!isValid) {
        console.warn("[Square Webhook] Invalid signature, rejecting");
        return res.status(403).json({ message: "Invalid signature" });
      }

      res.status(200).json({ received: true });

      const eventType = req.body?.type;
      const eventData = req.body?.data;
      if (eventType && eventData) {
        handleSquareWebhook(eventType, eventData).catch(err => {
          console.error("[Square Webhook] Async processing error:", err);
        });
      }
    } catch (error: any) {
      console.error("[Square Webhook] Error:", error.message);
      res.status(500).json({ message: "Webhook processing error" });
    }
  });

  app.get("/api/square/webhook-status", isAuthenticated, isOwner, async (req, res) => {
    try {
      const configured = !!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
      const lastEventAt = getLastWebhookEventAt();
      res.json({
        configured,
        lastEventAt: lastEventAt?.toISOString() || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === FORECASTING & SMART GOALS ===
  app.get("/api/forecast", isAuthenticated, async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined;
      const forecasts = await generateForecast(date, locationId);
      res.json(forecasts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/forecast/populate", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const date = (req.body?.date as string) || new Date().toISOString().split("T")[0];
      const locationId = req.body?.locationId ? parseInt(req.body.locationId, 10) : undefined;
      const result = await autoPopulatePastryGoals(date, locationId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === LIVE INVENTORY DASHBOARD ===
  app.get("/api/inventory-dashboard", isAuthenticated, async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined;
      const dashboard = await getLiveInventoryDashboard(date, locationId);
      res.json(dashboard);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/inventory-dashboard/snapshot", isAuthenticated, async (req: any, res) => {
    try {
      const { date, items, locationId } = req.body;
      if (!date || !items) return res.status(400).json({ message: "date and items required" });
      const d = new Date(date + "T12:00:00");
      const dayOfWeek = d.getDay();
      for (const item of items) {
        await storage.upsertDailyPastryTracking({
          date,
          itemName: item.itemName,
          locationId: locationId || null,
          goal: item.goal || 0,
          baked: item.baked || 0,
          sold: item.sold || 0,
          revenue: Math.round((item.revenue || 0) * 100),
          eightySixedAt: item.eightySixedAt || null,
          eightySixedBy: item.eightySixedBy || null,
          pastryBoxQty: item.pastryBoxQty || 0,
          remaining: item.remaining || 0,
          paceStatus: item.paceStatus || null,
          dayOfWeek,
        });
      }
      res.json({ success: true, count: items.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/daily-pastry-tracking", isAuthenticated, async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined;
      const data = await storage.getDailyPastryTracking(date, locationId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === SOLDOUT LOGS ===
  app.get("/api/soldout-logs", isAuthenticated, async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined;
      const logs = await storage.getSoldoutLogs(date, locationId);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/soldout-logs", isAuthenticated, async (req: any, res) => {
    try {
      const { itemName, date, soldOutAt, notes, locationId, baked, sold } = req.body;
      if (!itemName || !date || !soldOutAt) {
        return res.status(400).json({ message: "itemName, date, and soldOutAt are required" });
      }
      const reportedBy = req.appUser?.firstName || req.appUser?.username || "Unknown";
      const log = await storage.createSoldoutLog({
        itemName,
        date,
        soldOutAt,
        reportedBy,
        notes: notes || null,
        locationId: locationId || null,
      });
      const pastryBoxQty = (baked != null && sold != null && baked > sold) ? baked - sold : 0;
      const d = new Date(date + "T12:00:00");
      const existingTracking = await storage.getDailyPastryTracking(date, locationId || undefined);
      const existing = existingTracking.find(t => t.itemName === itemName);
      await storage.upsertDailyPastryTracking({
        date,
        itemName,
        locationId: locationId || null,
        goal: existing?.goal ?? 0,
        baked: baked || existing?.baked || 0,
        sold: sold || existing?.sold || 0,
        revenue: existing?.revenue ?? 0,
        eightySixedAt: soldOutAt,
        eightySixedBy: reportedBy,
        pastryBoxQty,
        remaining: 0,
        paceStatus: "sold_out",
        dayOfWeek: d.getDay(),
      });
      broadcastToScreen("all");
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/soldout-logs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { soldOutAt, notes } = req.body;
      const updates: any = {};
      if (soldOutAt !== undefined) updates.soldOutAt = soldOutAt;
      if (notes !== undefined) updates.notes = notes;
      const log = await storage.updateSoldoutLog(id, updates);
      if (!log) return res.status(404).json({ message: "Not found" });
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/soldout-logs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const ok = await storage.deleteSoldoutLog(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === TTIS (Tip Transparency Informational Dashboard) ===

  function parseTimeToMinutes(timeStr: string): number {
    const t = timeStr.trim().toUpperCase();
    const ampm = t.includes("PM") ? "PM" : t.includes("AM") ? "AM" : null;
    const cleaned = t.replace(/\s*(AM|PM)\s*/i, "");
    const parts = cleaned.split(":").map(Number);
    let hours = parts[0] || 0;
    const mins = parts[1] || 0;
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return hours * 60 + mins;
  }

  app.get("/api/ttis/my-tips", isAuthenticated, async (req: any, res) => {
    const user = req.appUser as any;
    if (user.role === "owner") {
      return res.json({
        weekStart: new Date().toISOString().split("T")[0],
        weekEnd: new Date().toISOString().split("T")[0],
        totalTips: 0,
        tipCount: 0,
        averageSplitCount: 0,
        dailyBreakdown: [],
      });
    }
    try {
      const { inArray, lte, or, isNull, ne } = await import("drizzle-orm");

      const weekStartDay = parseInt(req.query.weekStartDay as string) || 3;
      const now = new Date();
      const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const currentDay = eastern.getDay();
      const diff = (currentDay - weekStartDay + 7) % 7;
      const weekStart = new Date(eastern);
      weekStart.setDate(weekStart.getDate() - diff);
      const startDate = weekStart.toISOString().split("T")[0];

      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate + "T12:00:00");
        d.setDate(d.getDate() + i);
        const ds = d.toISOString().split("T")[0];
        dates.push(ds);
        const todayStr = eastern.toISOString().split("T")[0];
        if (ds === todayStr) break;
      }

      const allShifts = await db.select().from(shifts)
        .where(and(inArray(shifts.shiftDate, dates), eq(shifts.department, "foh")));
      const allShiftUserIds = Array.from(new Set([...allShifts.map(s => s.userId), user.id]));
      const ownerUsers = await db.select({ id: users.id }).from(users)
        .where(and(inArray(users.id, allShiftUserIds), eq(users.role, "owner")));
      const ownerIdSet = new Set(ownerUsers.map(u => u.id));
      const fohUserIds = allShiftUserIds.filter(id => !ownerIdSet.has(id));

      const weekBoundsStart = easternDayBounds(dates[0]).start;
      const weekBoundsEnd = easternDayBounds(dates[dates.length - 1]).end;
      const allTimeEntries = await db.select().from(timeEntries)
        .where(and(
          inArray(timeEntries.userId, fohUserIds),
          lte(timeEntries.clockIn, weekBoundsEnd),
          or(isNull(timeEntries.clockOut), sql`${timeEntries.clockOut} >= ${weekBoundsStart}`),
        ));

      let myTipsCents = 0;
      let myTipCount = 0;
      const splitCounts: number[] = [];
      const dailyBreakdown: { date: string; tips: number; tipCount: number; avgSplit: number }[] = [];

      for (const date of dates) {
        const { start: dayStartUtc, end: dayEndUtc } = easternDayBounds(date);
        const dayTimeEntries = allTimeEntries.filter(te => {
          const clockOut = te.clockOut || new Date();
          return te.clockIn <= dayEndUtc && clockOut >= dayStartUtc;
        });
        const clockedInUserIds = Array.from(new Set(dayTimeEntries.map(te => te.userId)));
        const dayFohShiftUserIds = Array.from(new Set(allShifts.filter(s => s.shiftDate === date).map(s => s.userId)));

        let tipData = { tips: [] as any[], totalTipsCents: 0, orderCount: 0 };
        try { tipData = await fetchSquareTips(date); } catch {
          dailyBreakdown.push({ date, tips: 0, tipCount: 0, avgSplit: 0 });
          continue;
        }

        let dayTipsCents = 0;
        let dayTipCount = 0;
        const daySplits: number[] = [];

        for (const tip of tipData.tips) {
          let tipTime: Date | null = null;
          try { tipTime = new Date(tip.createdAt); } catch { continue; }
          const tipMs = tipTime.getTime();

          const onDutyStaff: string[] = [];
          for (const te of dayTimeEntries) {
            const clockOut = te.clockOut || new Date();
            if (tipMs >= te.clockIn.getTime() && tipMs <= clockOut.getTime()) {
              if (!onDutyStaff.includes(te.userId)) onDutyStaff.push(te.userId);
            }
          }
          if (onDutyStaff.length === 0 && clockedInUserIds.length > 0) {
            onDutyStaff.push(...clockedInUserIds);
          }
          if (onDutyStaff.length === 0) {
            onDutyStaff.push(...dayFohShiftUserIds);
          }

          if (onDutyStaff.includes(user.id)) {
            const splitAmount = Math.round(tip.tipAmountCents / onDutyStaff.length);
            myTipsCents += splitAmount;
            myTipCount += 1;
            splitCounts.push(onDutyStaff.length);
            dayTipsCents += splitAmount;
            dayTipCount += 1;
            daySplits.push(onDutyStaff.length);
          }
        }

        dailyBreakdown.push({
          date,
          tips: Math.round(dayTipsCents) / 100,
          tipCount: dayTipCount,
          avgSplit: daySplits.length > 0 ? Math.round(daySplits.reduce((a, b) => a + b, 0) / daySplits.length) : 0,
        });
      }

      const avgSplit = splitCounts.length > 0 ? Math.round(splitCounts.reduce((a, b) => a + b, 0) / splitCounts.length) : 0;

      res.json({
        weekStart: dates[0],
        weekEnd: dates[dates.length - 1],
        totalTips: Math.round(myTipsCents) / 100,
        tipCount: myTipCount,
        averageSplitCount: avgSplit,
        dailyBreakdown,
      });
    } catch (error: any) {
      console.error("TTIS my-tips error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch your tip data" });
    }
  });

  app.get("/api/ttis/week", isAuthenticated, async (req: any, res) => {
    const user = req.appUser as any;
    if (user.role !== "owner" && !user.isGeneralManager) {
      return res.status(403).json({ message: "Owner or General Manager access required" });
    }
    try {
      const startDate = req.query.startDate as string;
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ message: "startDate query param required (YYYY-MM-DD)" });
      }

      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate + "T12:00:00");
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split("T")[0]);
      }

      const { inArray, lte, or, isNull } = await import("drizzle-orm");

      const allShifts = await db.select().from(shifts)
        .where(and(inArray(shifts.shiftDate, dates), eq(shifts.department, "foh")));

      let allFohUserIds = Array.from(new Set(allShifts.map(s => s.userId)));
      let fohStaff: any[] = [];
      if (allFohUserIds.length > 0) {
        fohStaff = await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          hourlyRate: users.hourlyRate,
        }).from(users).where(inArray(users.id, allFohUserIds));
      }
      const ownerIds = new Set(fohStaff.filter(s => s.role === "owner").map(s => s.id));
      fohStaff = fohStaff.filter(s => s.role !== "owner");
      const fohUserIds = allFohUserIds.filter(id => !ownerIds.has(id));
      const staffMap = new Map(fohStaff.map(s => [s.id, s]));

      const weekBoundsStart = easternDayBounds(dates[0]).start;
      const weekBoundsEnd = easternDayBounds(dates[6]).end;
      const allTimeEntries = fohUserIds.length > 0
        ? await db.select().from(timeEntries)
            .where(and(
              inArray(timeEntries.userId, fohUserIds),
              lte(timeEntries.clockIn, weekBoundsEnd),
              or(isNull(timeEntries.clockOut), sql`${timeEntries.clockOut} >= ${weekBoundsStart}`),
            ))
        : [];

      const allBreakIds = allTimeEntries.map(te => te.id);
      const allBreaks = allBreakIds.length > 0
        ? await db.select().from(breakEntries).where(inArray(breakEntries.timeEntryId, allBreakIds))
        : [];
      const breaksByEntry = new Map<number, typeof allBreaks>();
      for (const b of allBreaks) {
        if (!breaksByEntry.has(b.timeEntryId)) breaksByEntry.set(b.timeEntryId, []);
        breaksByEntry.get(b.timeEntryId)!.push(b);
      }

      const weeklyStaff = new Map<string, { name: string; username: string; totalMinutes: number; tipsCents: number; tipCount: number; hourlyRate: number | null }>();

      const daySummaries: Array<{
        date: string;
        totalTips: number;
        tippedOrders: number;
        fohStaffCount: number;
        staffNames: string[];
      }> = [];

      let weekTotalTipsCents = 0;
      let weekTotalTipped = 0;
      let weekSquareError: string | null = null;

      for (const date of dates) {
        const { start: dayStartUtc, end: dayEndUtc } = easternDayBounds(date);
        const dayTimeEntries = allTimeEntries.filter(te => {
          const clockOut = te.clockOut || new Date();
          return te.clockIn <= dayEndUtc && clockOut >= dayStartUtc;
        });
        const clockedInUserIds = Array.from(new Set(dayTimeEntries.map(te => te.userId)));
        const dayFohShiftUserIds = Array.from(new Set(allShifts.filter(s => s.shiftDate === date).map(s => s.userId)));

        for (const te of dayTimeEntries) {
          const staff = staffMap.get(te.userId);
          const staffName = staff ? `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.username : "Unknown";
          const username = staff?.username || "Unknown";

          if (!weeklyStaff.has(te.userId)) {
            weeklyStaff.set(te.userId, { name: staffName, username, totalMinutes: 0, tipsCents: 0, tipCount: 0, hourlyRate: staffMap.get(te.userId)?.hourlyRate ?? null });
          }
          const clockOut = te.clockOut || new Date();
          const overlapStart = Math.max(te.clockIn.getTime(), dayStartUtc.getTime());
          const overlapEnd = Math.min(clockOut.getTime(), dayEndUtc.getTime());
          let netMs = Math.max(0, overlapEnd - overlapStart);
          const entryBreaks = breaksByEntry.get(te.id) || [];
          for (const b of entryBreaks) {
            if (b.endAt) {
              const bStart = Math.max(b.startAt.getTime(), dayStartUtc.getTime());
              const bEnd = Math.min(b.endAt.getTime(), dayEndUtc.getTime());
              if (bEnd > bStart) netMs -= (bEnd - bStart);
            }
          }
          weeklyStaff.get(te.userId)!.totalMinutes += Math.max(0, netMs / 60000);
        }

        let tipData = { tips: [] as any[], totalTipsCents: 0, orderCount: 0 };
        try {
          tipData = await fetchSquareTips(date);
        } catch (err: any) {
          if (!weekSquareError) weekSquareError = err.message || "Failed to fetch tips from Square";
        }

        for (const tip of tipData.tips) {
          let tipTime: Date | null = null;
          try { tipTime = new Date(tip.createdAt); } catch { continue; }

          const tipMs = tipTime.getTime();

          const onDutyStaff: string[] = [];
          for (const te of dayTimeEntries) {
            const clockOut = te.clockOut || new Date();
            if (tipMs >= te.clockIn.getTime() && tipMs <= clockOut.getTime()) {
              if (!onDutyStaff.includes(te.userId)) onDutyStaff.push(te.userId);
            }
          }

          if (onDutyStaff.length === 0 && clockedInUserIds.length > 0) {
            onDutyStaff.push(...clockedInUserIds);
          }

          if (onDutyStaff.length === 0) {
            onDutyStaff.push(...dayFohShiftUserIds);
          }

          const splitAmount = onDutyStaff.length > 0 ? Math.round(tip.tipAmountCents / onDutyStaff.length) : 0;
          for (const uid of onDutyStaff) {
            if (!weeklyStaff.has(uid)) {
              const staff = staffMap.get(uid);
              const staffName = staff ? `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.username : "Unknown";
              weeklyStaff.set(uid, { name: staffName, username: staff?.username || "Unknown", totalMinutes: 0, tipsCents: 0, tipCount: 0, hourlyRate: staff?.hourlyRate ?? null });
            }
            const entry = weeklyStaff.get(uid);
            if (entry) {
              entry.tipsCents += splitAmount;
              entry.tipCount += 1;
            }
          }
        }

        weekTotalTipsCents += tipData.totalTipsCents;
        weekTotalTipped += tipData.tips.length;

        daySummaries.push({
          date,
          totalTips: tipData.totalTipsCents / 100,
          tippedOrders: tipData.tips.length,
          fohStaffCount: clockedInUserIds.length,
          staffNames: clockedInUserIds.map(uid => weeklyStaff.get(uid)?.name || "Unknown"),
        });
      }

      const staffBreakdown = Array.from(weeklyStaff.entries()).map(([userId, data]) => ({
        userId,
        name: data.name,
        username: data.username,
        hoursWorked: Math.round(data.totalMinutes / 60 * 100) / 100,
        totalTips: Math.round(data.tipsCents) / 100,
        tipCount: data.tipCount,
        hourlyRate: data.hourlyRate,
      })).sort((a, b) => b.totalTips - a.totalTips);

      res.json({
        startDate: dates[0],
        endDate: dates[6],
        totalTips: weekTotalTipsCents / 100,
        tippedOrders: weekTotalTipped,
        fohStaffCount: fohUserIds.length,
        staffBreakdown,
        daySummaries,
        squareError: weekSquareError,
      });
    } catch (error: any) {
      console.error("TTIS week error:", error);
      res.status(500).json({ message: error.message || "Failed to generate weekly tip report" });
    }
  });

  function toEastern(d: Date): Date {
    return new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  }
  function easternDayBounds(dateStr: string): { start: Date; end: Date } {
    const base = new Date(dateStr + "T00:00:00");
    const offsetStr = base.toLocaleString("en-US", { timeZone: "America/New_York" });
    const eastern = new Date(offsetStr);
    const diffMs = base.getTime() - eastern.getTime();
    const start = new Date(base.getTime() + diffMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start, end };
  }

  app.get("/api/ttis", isAuthenticated, async (req: any, res) => {
    const user = req.appUser as any;
    if (user.role !== "owner" && !user.isGeneralManager) {
      return res.status(403).json({ message: "Owner or General Manager access required" });
    }
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const { inArray, lte, or, isNull } = await import("drizzle-orm");

      const fohShifts = await db.select().from(shifts)
        .where(and(eq(shifts.shiftDate, date), eq(shifts.department, "foh")));
      let allFohUserIds = Array.from(new Set(fohShifts.map(s => s.userId)));

      let fohStaff: any[] = [];
      if (allFohUserIds.length > 0) {
        fohStaff = await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          hourlyRate: users.hourlyRate,
        }).from(users).where(inArray(users.id, allFohUserIds));
      }
      const ownerIds = new Set(fohStaff.filter(s => s.role === "owner").map(s => s.id));
      fohStaff = fohStaff.filter(s => s.role !== "owner");
      const fohUserIds = allFohUserIds.filter(id => !ownerIds.has(id));
      const staffMap = new Map(fohStaff.map(s => [s.id, s]));

      const { start: dayStartUtc, end: dayEndUtc } = easternDayBounds(date);
      const dayTimeEntries = fohUserIds.length > 0
        ? await db.select().from(timeEntries)
            .where(and(
              inArray(timeEntries.userId, fohUserIds),
              lte(timeEntries.clockIn, dayEndUtc),
              or(isNull(timeEntries.clockOut), sql`${timeEntries.clockOut} >= ${dayStartUtc}`),
            ))
        : [];

      const dayBreakIds = dayTimeEntries.map(te => te.id);
      const dayBreaks = dayBreakIds.length > 0
        ? await db.select().from(breakEntries).where(inArray(breakEntries.timeEntryId, dayBreakIds))
        : [];
      const breaksByEntry = new Map<number, typeof dayBreaks>();
      for (const b of dayBreaks) {
        if (!breaksByEntry.has(b.timeEntryId)) breaksByEntry.set(b.timeEntryId, []);
        breaksByEntry.get(b.timeEntryId)!.push(b);
      }

      const clockedInUserIds = Array.from(new Set(dayTimeEntries.map(te => te.userId)));

      const staffTotals = new Map<string, { name: string; username: string; totalMinutes: number; tipsCents: number; tipCount: number; hourlyRate: number | null }>();
      for (const te of dayTimeEntries) {
        const staff = staffMap.get(te.userId);
        const staffName = staff ? `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.username : "Unknown";
        const username = staff?.username || "Unknown";

        if (!staffTotals.has(te.userId)) {
          staffTotals.set(te.userId, { name: staffName, username, totalMinutes: 0, tipsCents: 0, tipCount: 0, hourlyRate: staff?.hourlyRate ?? null });
        }
        const clockOut = te.clockOut || new Date();
        const overlapStart = Math.max(te.clockIn.getTime(), dayStartUtc.getTime());
        const overlapEnd = Math.min(clockOut.getTime(), dayEndUtc.getTime());
        let netMs = Math.max(0, overlapEnd - overlapStart);
        const entryBreaks = breaksByEntry.get(te.id) || [];
        for (const b of entryBreaks) {
          if (b.endAt) {
            const bStart = Math.max(b.startAt.getTime(), dayStartUtc.getTime());
            const bEnd = Math.min(b.endAt.getTime(), dayEndUtc.getTime());
            if (bEnd > bStart) netMs -= (bEnd - bStart);
          }
        }
        staffTotals.get(te.userId)!.totalMinutes += Math.max(0, netMs / 60000);
      }

      let tipData = { tips: [] as any[], totalTipsCents: 0, orderCount: 0 };
      let squareError: string | null = null;
      try {
        tipData = await fetchSquareTips(date);
      } catch (err: any) {
        squareError = err.message || "Failed to fetch tips from Square";
      }

      const allocations: Array<{
        orderId: string;
        time: string;
        tipAmount: number;
        staffOnDuty: string[];
        splitAmount: number;
      }> = [];

      for (const tip of tipData.tips) {
        let tipTime: Date | null = null;
        try { tipTime = new Date(tip.createdAt); } catch { continue; }

        const tipMs = tipTime.getTime();

        const onDutyStaff: string[] = [];
        for (const te of dayTimeEntries) {
          const clockOut = te.clockOut || new Date();
          if (tipMs >= te.clockIn.getTime() && tipMs <= clockOut.getTime()) {
            if (!onDutyStaff.includes(te.userId)) onDutyStaff.push(te.userId);
          }
        }

        if (onDutyStaff.length === 0 && clockedInUserIds.length > 0) {
          onDutyStaff.push(...clockedInUserIds);
        }

        if (onDutyStaff.length === 0) {
          onDutyStaff.push(...fohUserIds);
        }

        const splitAmount = onDutyStaff.length > 0 ? Math.round(tip.tipAmountCents / onDutyStaff.length) : 0;
        for (const uid of onDutyStaff) {
          if (!staffTotals.has(uid)) {
            const staff = staffMap.get(uid);
            const staffName = staff ? `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.username : "Unknown";
            staffTotals.set(uid, { name: staffName, username: staff?.username || "Unknown", totalMinutes: 0, tipsCents: 0, tipCount: 0, hourlyRate: staff?.hourlyRate ?? null });
          }
          const entry = staffTotals.get(uid);
          if (entry) {
            entry.tipsCents += splitAmount;
            entry.tipCount += 1;
          }
        }

        allocations.push({
          orderId: tip.orderId,
          time: tip.createdAt,
          tipAmount: tip.tipAmountCents / 100,
          staffOnDuty: onDutyStaff.map(uid => staffTotals.get(uid)?.name || "Unknown"),
          splitAmount: splitAmount / 100,
        });
      }

      const staffBreakdown = Array.from(staffTotals.entries()).map(([userId, data]) => ({
        userId,
        name: data.name,
        username: data.username,
        hoursWorked: Math.round(data.totalMinutes / 60 * 100) / 100,
        totalTips: Math.round(data.tipsCents) / 100,
        tipCount: data.tipCount,
        hourlyRate: data.hourlyRate,
      })).sort((a, b) => b.totalTips - a.totalTips);

      res.json({
        date,
        totalTips: tipData.totalTipsCents / 100,
        totalOrders: tipData.orderCount,
        tippedOrders: tipData.tips.length,
        fohStaffCount: clockedInUserIds.length,
        staffBreakdown,
        allocations,
        squareError,
      });
    } catch (error: any) {
      console.error("TTIS error:", error);
      res.status(500).json({ message: error.message || "Failed to generate tip report" });
    }
  });

  // === PASTRY TOTALS ===
  app.get(api.pastryTotals.list.path, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const totals = await storage.getPastryTotals(date, locationId);
    res.json(totals);
  });

  app.post(api.pastryTotals.create.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.pastryTotals.create.input.parse(req.body);
      const total = await storage.createPastryTotal(input);
      res.status(201).json(total);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.pastryTotals.update.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.pastryTotals.update.input.parse(req.body);
      const total = await storage.updatePastryTotal(Number(req.params.id), input);
      if (!total) return res.status(404).json({ message: 'Pastry total not found' });
      res.json(total);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete(api.pastryTotals.delete.path, isAuthenticated, isUnlocked, async (req, res) => {
    const result = await storage.deletePastryTotal(Number(req.params.id));
    if (!result) return res.status(404).json({ message: 'Pastry total not found' });
    res.status(204).send();
  });

  // === SHAPING LOGS ===
  app.get(api.shapingLogs.list.path, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const logs = await storage.getShapingLogs(date);
    res.json(logs);
  });

  app.post(api.shapingLogs.create.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.shapingLogs.create.input.parse(req.body);
      const log = await storage.createShapingLog(input);
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete(api.shapingLogs.delete.path, isAuthenticated, isUnlocked, async (req, res) => {
    const result = await storage.deleteShapingLog(Number(req.params.id));
    if (!result) return res.status(404).json({ message: 'Shaping log not found' });
    res.status(204).send();
  });

  // === BAKE-OFF LOGS ===
  app.get(api.bakeoffLogs.list.path, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const logs = await storage.getBakeoffLogs(date);
    res.json(logs);
  });

  app.post(api.bakeoffLogs.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.bakeoffLogs.create.input.parse(req.body);
      const log = await storage.createBakeoffLog(input);

      if (log.itemName) {
        const pastryItemId = log.pastryItemId ?? await storage.resolvePastryItemId(log.itemName);
        createOvenTimersForItem(log.itemName, pastryItemId, req.appUser?.id || null).catch(() => {});
      }

      // Prep EQ: auto-consume components via BOM
      try {
        let pItemId = log.pastryItemId;
        if (!pItemId && log.itemName) {
          pItemId = await storage.resolvePastryItemId(log.itemName);
        }
        if (pItemId && log.quantity && log.quantity > 0) {
          const passports = await db.select().from(pastryPassports).where(eq(pastryPassports.pastryItemId, pItemId));
          for (const passport of passports) {
            const bomItems = await db.select().from(componentBom).where(eq(componentBom.pastryPassportId, passport.id));
            for (const bom of bomItems) {
              const consumeQty = bom.quantityPerUnit * log.quantity;
              await storage.addComponentTransaction({
                componentId: bom.componentId,
                type: "consumption",
                quantity: -consumeQty,
                referenceType: "bakeoff_log",
                referenceId: log.id,
                notes: `Auto-consume: ${log.quantity}× ${log.itemName}`,
                createdBy: req.appUser?.id || null,
              });
            }
          }
        }
      } catch (e) {
        console.error("[PrepEQ] Failed to auto-consume components:", e);
      }

      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete(api.bakeoffLogs.delete.path, isAuthenticated, isUnlocked, async (req, res) => {
    const result = await storage.deleteBakeoffLog(Number(req.params.id));
    if (!result) return res.status(404).json({ message: 'Bake-off log not found' });
    res.status(204).send();
  });

  // === INVENTORY ITEMS ===
  app.get(api.inventoryItems.list.path, isAuthenticated, async (req, res) => {
    const category = req.query.category as string | undefined;
    const items = await storage.getInventoryItems(category || undefined);
    res.json(items);
  });

  app.post(api.inventoryItems.create.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.inventoryItems.create.input.parse(req.body);
      const item = await storage.createInventoryItem(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.inventoryItems.update.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.inventoryItems.update.input.parse(req.body);
      const item = await storage.updateInventoryItem(Number(req.params.id), input);
      if (!item) return res.status(404).json({ message: 'Item not found' });
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete(api.inventoryItems.delete.path, isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteInventoryItem(Number(req.params.id));
    res.status(204).send();
  });

  // === INVOICES ===
  app.get(api.invoices.list.path, isAuthenticated, isManager, async (req, res) => {
    const invoiceList = await storage.getInvoices();
    res.json(invoiceList);
  });

  app.get(api.invoices.get.path, isAuthenticated, isManager, async (req, res) => {
    const invoice = await storage.getInvoice(Number(req.params.id));
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  });

  app.post(api.invoices.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.invoices.create.input.parse(req.body);
      const user = await getUserFromReq(req);
      const invoice = await storage.createInvoiceWithLines(
        {
          vendorName: input.vendorName,
          invoiceDate: input.invoiceDate,
          invoiceNumber: input.invoiceNumber || null,
          invoiceTotal: input.invoiceTotal ?? null,
          notes: input.notes || null,
          enteredBy: user?.username || user?.firstName || "Unknown",
          documentType: input.documentType || "invoice",
          locationTag: input.locationTag || null,
          deliveryDate: input.deliveryDate || null,
          hasShorts: input.hasShorts || false,
          hasSubstitutions: input.hasSubstitutions || false,
          hasPriceAlerts: input.hasPriceAlerts || false,
          reviewStatus: input.reviewStatus || "pending",
        },
        input.lines
      );
      res.status(201).json(invoice);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.patch("/api/invoice-lines/:id/link", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const lineId = Number(req.params.id);
      const { inventoryItemId, createNew, newItemName, newItemCategory, saveAsAlias } = req.body;

      const [line] = await db.select().from(invoiceLines).where(eq(invoiceLines.id, lineId)).limit(1);
      if (!line) return res.status(404).json({ message: "Invoice line not found" });

      let targetItemId: number | null = inventoryItemId || null;

      if (createNew && newItemName) {
        const [newItem] = await db.insert(inventoryItems).values({
          name: newItemName,
          category: newItemCategory || "other",
          unit: line.unit || "each",
          onHand: 0,
          parLevel: 0,
          costPerUnit: line.unitPrice || 0,
          aliases: line.itemDescription !== newItemName ? [line.itemDescription] : [],
        }).returning();
        targetItemId = newItem.id;
      }

      if (!targetItemId) return res.status(400).json({ message: "Must provide inventoryItemId or createNew" });

      await db.update(invoiceLines)
        .set({ inventoryItemId: targetItemId })
        .where(eq(invoiceLines.id, lineId));

      if (saveAsAlias && !createNew) {
        const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, targetItemId)).limit(1);
        if (item) {
          const existingAliases: string[] = (item.aliases as string[]) || [];
          const desc = line.itemDescription.toLowerCase().trim();
          if (!existingAliases.some(a => a.toLowerCase().trim() === desc) && desc !== item.name.toLowerCase().trim()) {
            await db.update(inventoryItems)
              .set({ aliases: [...existingAliases, line.itemDescription] })
              .where(eq(inventoryItems.id, targetItemId));
          }
        }
      }

      if (targetItemId && line.unitPrice) {
        await db.update(inventoryItems)
          .set({ costPerUnit: line.unitPrice })
          .where(eq(inventoryItems.id, targetItemId));
      }

      if (targetItemId && line.quantity) {
        const [item] = await db.select({ onHand: inventoryItems.onHand }).from(inventoryItems).where(eq(inventoryItems.id, targetItemId)).limit(1);
        if (item) {
          await db.update(inventoryItems)
            .set({ onHand: (item.onHand || 0) + line.quantity })
            .where(eq(inventoryItems.id, targetItemId));
        }
      }

      res.json({ success: true, inventoryItemId: targetItemId });
    } catch (error: any) {
      console.error("[Invoice Link] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post(api.invoices.scan.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const parsed = api.invoices.scan.input.parse(req.body);
      const imageList: string[] = [];
      if (parsed.images && parsed.images.length > 0) {
        imageList.push(...parsed.images);
      } else if (parsed.image) {
        imageList.push(parsed.image);
      }
      if (imageList.length === 0) {
        return res.status(400).json({ message: "At least one image is required" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const allItemsForScan = await db.select().from(inventoryItems);
      const { buildAIMatchingContext } = await import("./item-matcher");
      const inventoryContextScan = buildAIMatchingContext(allItemsForScan);

      const imageContent = imageList.map(img => ({
        type: "image_url" as const,
        image_url: {
          url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`,
        }
      }));

      const multiImageNote = imageList.length > 1
        ? ` This invoice spans ${imageList.length} photos/pages. Combine ALL line items from ALL images into a single invoice. Do not duplicate items that appear on multiple photos.`
        : "";

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 8192,
        messages: [
          {
            role: "system",
            content: `You are an expert invoice parser specializing in bakery and food-service supplier invoices. Extract ALL data from the invoice image${imageList.length > 1 ? "s" : ""}.${multiImageNote}

ITEM DESCRIPTION MATCHING - VERY IMPORTANT:
For each line item's "itemDescription", try to match it to our inventory list below. If you can identify which inventory item the invoice line refers to, use our inventory item name EXACTLY as the itemDescription. This helps us auto-link invoice items to our master list.
- "BUTTER SHEETS NON AOP 83%" → if we have "Butter Sheets" in inventory, use "Butter Sheets (BUTTER SHEETS NON AOP 83%)"
- "KA SIR LANCELOT BREAD FL 50#" → if we have "Sir Lancelot Flour" in inventory, use "Sir Lancelot Flour (KA SIR LANCELOT BREAD FL 50#)"
- If no clear match exists, keep the original description from the invoice.

OUR INVENTORY ITEMS:
${inventoryContextScan}

IMPORTANT GUIDELINES:
- This is a bakery invoice. Common suppliers include food distributors, dairy, flour mills, packaging, and produce vendors.
- Recognize common unit abbreviations: "cs" = case, "ea" = each, "bx" = box, "bg" = bag, "pk" = pack, "dz" = dozen, "lb" = pound, "oz" = ounce, "gal" = gallon, "ct" = count, "sl" = sleeve, "sk" = sack, "rl" = roll, "bkt" = bucket, "tub" = tub.
- If there are handwritten corrections, annotations, or crossed-out items, use the corrected/final values.
- For credit memos or returns, use NEGATIVE quantities or negative line totals as appropriate.
- If an item description spans multiple lines, combine them into a single itemDescription.
- Tax lines, delivery fees, fuel surcharges, and deposit charges should NOT be included as line items — capture them in the "notes" field instead (e.g. "Tax: $12.50, Delivery: $15.00").
- If any text is blurry or unclear, make your best guess and append "(?)" to that specific field value.
- For prices, use numbers only — no currency symbols, no commas.
- If a field is not visible or not applicable, use null.

Return a JSON object with this exact structure:
{
  "vendorName": "string",
  "invoiceDate": "string in YYYY-MM-DD format",
  "invoiceNumber": "string or null",
  "invoiceTotal": number or null,
  "notes": "string or null - include tax, delivery fees, special notes here",
  "documentType": "string or null - 'order_confirmation', 'invoice', 'will_call', or null if standard invoice",
  "deliveryDate": "string in YYYY-MM-DD format or null",
  "locationTag": "string or null - delivery location name/address if visible",
  "lines": [
    {
      "itemDescription": "string - use our inventory name if matched, with original in parentheses",
      "quantity": number,
      "unit": "string or null - full word preferred (case, pound, each, box, bag, dozen, etc.)",
      "unitPrice": number or null,
      "lineTotal": number or null,
      "packSize": "string or null - vendor pack description like '6/5 LB' or '4/1 GAL'",
      "quantityOrdered": number or null,
      "quantityShipped": number or null,
      "isSubstitution": boolean or null,
      "originalProduct": "string or null - only if isSubstitution is true"
    }
  ]
}

Be thorough — capture EVERY line item on the invoice. Return ONLY the JSON object.

US FOODS / DISTRIBUTOR-SPECIFIC INSTRUCTIONS:
If this is from US Foods (or similar distributors like Sysco, Performance Food Group):
- Include "documentType": "order_confirmation" or "invoice" or "will_call" based on what you see
- Include "deliveryDate" if visible (YYYY-MM-DD format)
- Include "locationTag" if the delivery location/address is visible
- For each line item, also include:
  - "packSize": e.g. "6/5 LB", "4/1 GAL", "1/50 LB" — the vendor's pack description
  - "quantityOrdered": the quantity the customer originally ordered (if shown)
  - "quantityShipped": the quantity actually shipped/delivered (if different from ordered)
  - "isSubstitution": true if the item shows as a substitute for another product
  - "originalProduct": if isSubstitution is true, what was the original item ordered
- If ordered and shipped quantities differ, the item was "shorted" — mark both fields
- If you see "OUT" or "0" shipped for an item, set quantityShipped to 0
- If you see "SUB" or "SUBSTITUTE" notation, set isSubstitution to true`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Parse this bakery supplier invoice${imageList.length > 1 ? ` (${imageList.length} pages)` : ""} and extract all data. Focus on capturing every single line item accurately, even if some fields are unclear — mark those with (?).`
              },
              ...imageContent,
            ]
          }
        ],
        response_format: { type: "json_object" },
      }), "invoice-scan");

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(400).json({ message: "Could not read the invoice. The image may be too blurry or dark — try taking a new photo with better lighting." });
      }

      let invoiceData;
      try {
        invoiceData = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          invoiceData = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(400).json({ message: "Could not extract structured data from the invoice. Try a clearer, well-lit photo with the invoice filling the frame." });
        }
      }

      if (!invoiceData.lines || !Array.isArray(invoiceData.lines) || invoiceData.lines.length === 0) {
        return res.status(400).json({ message: "No line items found on the invoice. Make sure the full invoice is visible in the photo and text is readable." });
      }

      const { validateInvoiceLines } = await import("./usfoods-validator");
      const alerts = await validateInvoiceLines(0, invoiceData.lines.map((l: any) => ({
        itemDescription: l.itemDescription,
        quantity: l.quantity,
        quantityOrdered: l.quantityOrdered,
        quantityShipped: l.quantityShipped,
        unitPrice: l.unitPrice,
        packSize: l.packSize,
        isSubstitution: l.isSubstitution,
        originalProduct: l.originalProduct,
        inventoryItemId: null,
      })));

      invoiceData.alerts = alerts;
      invoiceData.hasShorts = alerts.some((a: any) => a.type === "short");
      invoiceData.hasSubstitutions = alerts.some((a: any) => a.type === "substitution");
      invoiceData.hasPriceAlerts = alerts.some((a: any) => a.type === "price_variance");

      res.json(invoiceData);
    } catch (err: any) {
      console.error("Invoice scan error:", err);
      const msg = err.message || "";
      if (msg.includes("too large") || msg.includes("payload") || msg.includes("413")) {
        return res.status(400).json({ message: "Image is too large. Try taking the photo from a bit further away, or use fewer pages at once." });
      }
      if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
        return res.status(400).json({ message: "Scanning timed out — the image may be too complex. Try scanning one page at a time." });
      }
      res.status(500).json({ message: "Failed to scan invoice. Please try again with a clearer photo." });
    }
  });

  app.post("/api/invoices/:id/validate", isAuthenticated, isManager, async (req, res) => {
    try {
      const invoiceId = Number(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const { validateInvoiceLines } = await import("./usfoods-validator");
      const alerts = await validateInvoiceLines(invoiceId, invoice.lines.map(l => ({
        id: l.id,
        itemDescription: l.itemDescription,
        quantity: l.quantity,
        quantityOrdered: l.quantityOrdered,
        quantityShipped: l.quantityShipped,
        unitPrice: l.unitPrice,
        packSize: l.packSize,
        isSubstitution: l.isSubstitution || false,
        originalProduct: l.originalProduct,
        inventoryItemId: l.inventoryItemId,
      })));

      const hasShorts = alerts.some(a => a.type === "short");
      const hasSubs = alerts.some(a => a.type === "substitution");
      const hasPriceAlerts = alerts.some(a => a.type === "price_variance");

      await db.update(invoices)
        .set({ hasShorts, hasSubstitutions: hasSubs, hasPriceAlerts })
        .where(eq(invoices.id, invoiceId));

      res.json({ alerts, hasShorts, hasSubstitutions: hasSubs, hasPriceAlerts });
    } catch (err: any) {
      console.error("[Invoice Validate] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // === INVENTORY COUNTS ===
  app.get(api.inventoryCounts.list.path, isAuthenticated, async (req, res) => {
    const counts = await storage.getInventoryCounts();
    res.json(counts);
  });

  app.get(api.inventoryCounts.get.path, isAuthenticated, async (req, res) => {
    const count = await storage.getInventoryCount(Number(req.params.id));
    if (!count) return res.status(404).json({ message: 'Count not found' });
    res.json(count);
  });

  app.post(api.inventoryCounts.start.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.inventoryCounts.start.input.parse(req.body);
      const user = await getUserFromReq(req);
      const count = await storage.startInventoryCount({
        ...input,
        countedBy: user?.username || user?.firstName || "Unknown",
      });
      res.status(201).json(count);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.post(api.inventoryCounts.addLine.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const countId = Number(req.params.id);
      const input = api.inventoryCounts.addLine.input.parse(req.body);
      const count = await storage.getInventoryCount(countId);
      if (!count) return res.status(404).json({ message: "Count not found" });
      if (count.departments && count.departments.length > 0) {
        const item = await storage.getInventoryItem(input.inventoryItemId);
        if (!item) return res.status(404).json({ message: "Inventory item not found" });
        const validCategory = count.departments.includes(item.category) ||
          (count.departments.includes("Other") && !["Bakery", "Bar", "Kitchen", "FOH"].includes(item.category));
        if (!validCategory) {
          return res.status(400).json({ message: `Item "${item.name}" does not belong to the selected departments: ${count.departments.join(", ")}` });
        }
      }
      const line = await storage.addInventoryCountLine(countId, input);
      res.status(201).json(line);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.post(api.inventoryCounts.complete.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const countId = Number(req.params.id);
      const count = await storage.completeInventoryCount(countId);
      res.json(count);
    } catch (err) {
      res.status(500).json({ message: "Failed to complete count" });
    }
  });

  // Ensure default location exists
  storage.getOrCreateDefaultLocation().catch(err => console.error("Failed to create default location:", err));

  // === LOCATIONS ===
  app.get(api.locations.list.path, isAuthenticated, async (req, res) => {
    const locs = await storage.getLocations();
    res.json(locs);
  });

  app.post(api.locations.create.path, isAuthenticated, isOwner, async (req, res) => {
    try {
      const input = api.locations.create.input.parse(req.body);
      const location = await storage.createLocation(input);
      res.status(201).json(location);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.locations.update.path, isAuthenticated, isOwner, async (req, res) => {
    try {
      const input = api.locations.update.input.parse(req.body);
      const location = await storage.updateLocation(Number(req.params.id), input);
      res.json(location);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete(api.locations.delete.path, isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteLocation(Number(req.params.id));
    res.status(204).send();
  });

  // === USER LOCATIONS ===
  app.get("/api/user-locations/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const result = await storage.getUserLocations(req.params.userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/user-locations/:userId", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { locationIds, primaryLocationId } = req.body;
      if (!Array.isArray(locationIds)) {
        return res.status(400).json({ message: "locationIds must be an array" });
      }
      await storage.setUserLocations(req.params.userId, locationIds, primaryLocationId);
      const result = await storage.getUserLocations(req.params.userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/locations/:id/users", isAuthenticated, async (req: any, res) => {
    try {
      const result = await storage.getLocationUsers(Number(req.params.id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/my-locations", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const result = await storage.getUserLocations(user.id);
      if (result.length === 0) {
        const allLocs = await storage.getLocations();
        res.json(allLocs.map(loc => ({ id: 0, userId: user.id, locationId: loc.id, isPrimary: loc.isDefault, createdAt: loc.createdAt, location: loc })));
      } else {
        res.json(result);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === SCHEDULE MESSAGES ===
  app.get(api.scheduleMessages.list.path, isAuthenticated, async (req, res) => {
    const messages = await storage.getScheduleMessages();
    res.json(messages);
  });

  app.post(api.scheduleMessages.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.scheduleMessages.create.input.parse(req.body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const userId = user.id;
      const message = await storage.createScheduleMessage({ ...input, userId });
      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.patch(api.scheduleMessages.resolve.path, isAuthenticated, isManager, async (req, res) => {
    try {
      const input = api.scheduleMessages.resolve.input.parse(req.body);
      const message = await storage.resolveScheduleMessage(Number(req.params.id), input.resolved);
      res.json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete(api.scheduleMessages.delete.path, isAuthenticated, async (req: any, res) => {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const messages = await storage.getScheduleMessages();
    const target = messages.find(m => m.id === Number(req.params.id));
    if (!target) return res.status(404).json({ message: "Message not found" });
    if (target.userId !== user.id && user.role !== "owner" && user.role !== "manager") {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }
    await storage.deleteScheduleMessage(Number(req.params.id));
    res.status(204).send();
  });

  // === TEAM MEMBERS (for managers to see team) ===
  app.get("/api/team-members", isAuthenticated, isManager, async (req, res) => {
    try {
      const allUsers = await authStorage.getAllUsers();
      const teamMembers = allUsers.map(u => ({
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        phone: u.phone,
        smsOptIn: u.smsOptIn,
        department: u.department,
      }));
      res.json(teamMembers);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // === SHIFTS (Schedule) ===
  app.get(api.shifts.list.path, isAuthenticated, async (req, res) => {
    const start = (req.query.start as string) || "";
    const end = (req.query.end as string) || "";
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const result = await storage.getShifts(start, end, locationId);
    res.json(result);
  });

  app.post(api.shifts.create.path, isAuthenticated, isManager, async (req: any, res) => {
    try {
      const input = api.shifts.create.input.parse(req.body);
      const isOpenShift = !input.userId;
      let department = input.department;
      if (input.userId && !department) {
        const emp = await storage.getUser(input.userId);
        if (emp?.department) department = emp.department;
      }
      if (!department) {
        return res.status(400).json({ message: "Department is required. Please specify a department for this shift." });
      }
      const existingShifts = await storage.getShifts(input.shiftDate, input.shiftDate);
      const deptCount = existingShifts.filter(s => s.department === department).length;
      if (deptCount >= 10) {
        return res.status(400).json({ message: `Maximum 10 staff per department per day reached for ${department}` });
      }
      const shiftData = {
        ...input,
        department,
        status: isOpenShift ? "open" : "assigned",
        createdBy: (req.appUser as any).id,
      };
      const shift = await storage.createShift(shiftData);
      if (input.userId) {
        sendPushToUser(input.userId, {
          title: "New Shift Assigned",
          body: `You've been scheduled on ${input.shiftDate} from ${input.startTime} to ${input.endTime}`,
          tag: `shift-${shift.id}`,
          url: "/schedule",
        }).catch(err => console.error("[Push] Shift notification error:", err));
      }
      res.status(201).json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.post("/api/shifts/:id/claim", isAuthenticated, async (req: any, res) => {
    try {
      const shiftId = Number(req.params.id);
      const userId = (req.appUser as any).id;
      const claimNote = typeof req.body?.note === "string" ? req.body.note.trim() || null : null;
      const shift = await storage.getShiftById(shiftId);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      if (shift.status !== "open") return res.status(400).json({ message: "This shift is not available for pickup" });
      const updated = await storage.updateShift(shiftId, {
        status: "pending",
        claimedBy: userId,
        claimedAt: new Date(),
        claimNote,
      } as any);
      const claimantUser = await authStorage.getUser(userId);
      const claimantName = claimantUser ? `${claimantUser.firstName || ""} ${claimantUser.lastName || ""}`.trim() || claimantUser.username : "A team member";
      const allUsers = await authStorage.getAllUsers();
      const notifyTargets = allUsers.filter(u =>
        u.isShiftManager ||
        u.role === "owner" ||
        (u.isDepartmentLead && u.department === shift.department)
      );
      const noteSnippet = claimNote ? ` — "${claimNote.slice(0, 60)}"` : "";
      for (const mgr of notifyTargets) {
        sendPushToUser(mgr.id, {
          title: "Shift Pickup Request",
          body: `${claimantName} wants to pick up ${shift.shiftDate} (${shift.startTime} - ${shift.endTime})${noteSnippet}`,
          tag: `shift-claim-${shiftId}`,
          url: "/schedule",
        }).catch(err => console.error("[Push] Shift claim notification error:", err));
      }
      res.json(updated);
    } catch (err) {
      console.error("Error claiming shift:", err);
      res.status(500).json({ message: "Failed to claim shift" });
    }
  });

  app.post("/api/shifts/:id/release", isAuthenticated, async (req: any, res) => {
    try {
      const shiftId = Number(req.params.id);
      const userId = (req.appUser as any).id;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() || null : null;
      const shift = await storage.getShiftById(shiftId);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      if (shift.status !== "assigned" && shift.status !== "posted") return res.status(400).json({ message: "Only assigned or posted shifts can be released" });
      if (shift.userId !== userId) {
        const user = req.appUser as any;
        const canRelease = user.role === "owner" || user.isShiftManager || user.isGeneralManager;
        if (!canRelease) return res.status(403).json({ message: "You can only release your own shifts" });
      }
      const releasedByName = (req.appUser as any).firstName
        ? `${(req.appUser as any).firstName} ${(req.appUser as any).lastName || ""}`.trim()
        : (req.appUser as any).username;
      const releaseNote = reason ? `Released by ${releasedByName}: ${reason}` : `Released by ${releasedByName}`;
      const updated = await storage.updateShift(shiftId, {
        status: "open",
        notes: shift.notes ? `${shift.notes} | ${releaseNote}` : releaseNote,
      } as any);
      const allUsers = await authStorage.getAllUsers();
      const notifyTargets = allUsers.filter(u =>
        u.id !== userId && (u.department === shift.department || u.role === "owner" || u.isShiftManager)
      );
      for (const target of notifyTargets) {
        sendPushToUser(target.id, {
          title: "Shift Released",
          body: `${releasedByName} released ${shift.shiftDate} (${shift.startTime} - ${shift.endTime}). Pick it up in the Shift Bank!`,
          tag: `shift-release-${shiftId}`,
          url: "/schedule",
        }).catch(err => console.error("[Push] Shift release notification error:", err));
      }
      res.json(updated);
    } catch (err) {
      console.error("Error releasing shift:", err);
      res.status(500).json({ message: "Failed to release shift" });
    }
  });

  app.patch("/api/shifts/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      const shiftId = Number(req.params.id);
      const shift = await storage.getShiftById(shiftId);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      const canApprove = user.role === "owner" || user.isShiftManager || user.isGeneralManager ||
        (user.isDepartmentLead && user.department === shift.department);
      if (!canApprove) {
        return res.status(403).json({ message: "Only shift managers, general managers, department leads, or owners can approve shift pickups" });
      }
      if (shift.status !== "pending" || !shift.claimedBy) {
        return res.status(400).json({ message: "This shift has no pending pickup request" });
      }
      const updated = await storage.updateShift(shiftId, {
        status: "assigned",
        userId: shift.claimedBy,
      } as any);
      sendPushToUser(shift.claimedBy, {
        title: "Shift Pickup Approved",
        body: `Your pickup request for ${shift.shiftDate} (${shift.startTime} - ${shift.endTime}) has been approved!`,
        tag: `shift-approved-${shiftId}`,
        url: "/schedule",
      }).catch(err => console.error("[Push] Shift approve notification error:", err));
      res.json(updated);
    } catch (err) {
      console.error("Error approving shift:", err);
      res.status(500).json({ message: "Failed to approve shift" });
    }
  });

  app.patch("/api/shifts/:id/deny", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      const shiftId = Number(req.params.id);
      const shift = await storage.getShiftById(shiftId);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      const canDeny = user.role === "owner" || user.isShiftManager || user.isGeneralManager ||
        (user.isDepartmentLead && user.department === shift.department);
      if (!canDeny) {
        return res.status(403).json({ message: "Only shift managers, general managers, department leads, or owners can deny shift pickups" });
      }
      if (shift.status !== "pending" || !shift.claimedBy) {
        return res.status(400).json({ message: "This shift has no pending pickup request" });
      }
      const claimedBy = shift.claimedBy;
      const updated = await storage.updateShift(shiftId, {
        status: "open",
        claimedBy: null,
        claimedAt: null,
        claimNote: null,
      } as any);
      sendPushToUser(claimedBy, {
        title: "Shift Pickup Denied",
        body: `Your pickup request for ${shift.shiftDate} (${shift.startTime} - ${shift.endTime}) was not approved. The shift is still available.`,
        tag: `shift-denied-${shiftId}`,
        url: "/schedule",
      }).catch(err => console.error("[Push] Shift deny notification error:", err));
      res.json(updated);
    } catch (err) {
      console.error("Error denying shift:", err);
      res.status(500).json({ message: "Failed to deny shift" });
    }
  });

  app.put(api.shifts.update.path, isAuthenticated, isManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.shifts.update.input.parse(req.body);
      const existingShift = await storage.getShifts(input.shiftDate || "", input.shiftDate || "");
      const oldShift = existingShift.find(s => s.id === id);
      const shift = await storage.updateShift(id, input);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      if (oldShift && shift.userId) {
        sendPushToUser(shift.userId, {
          title: "Shift Updated",
          body: `Your shift on ${shift.shiftDate} has been updated: ${shift.startTime} - ${shift.endTime}`,
          tag: `shift-${shift.id}`,
          url: "/schedule",
        }).catch(err => console.error("[Push] Shift update notification error:", err));
      }
      res.json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete("/api/shifts/clear", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner" && user.role !== "manager" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Only managers, shift managers, general managers, or owners can clear schedules" });
      }
      const { startDate, endDate, locationId } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      if (startDate > endDate) {
        return res.status(400).json({ message: "startDate must be before or equal to endDate" });
      }
      const locId = locationId ? Number(locationId) : undefined;
      if (locId !== undefined && (!Number.isFinite(locId) || isNaN(locId))) {
        return res.status(400).json({ message: "Invalid locationId" });
      }
      const deleted = await storage.deleteShiftsByDateRange(startDate as string, endDate as string, locId);
      storage.logActivity({ userId: user.id, action: "clear_schedule", metadata: { startDate, endDate, locationId: locId, deletedCount: deleted } }).catch(() => {});
      res.json({ deleted });
    } catch (error: any) {
      console.error("Error clearing schedule:", error);
      res.status(500).json({ message: "Failed to clear schedule" });
    }
  });

  app.delete(api.shifts.delete.path, isAuthenticated, isManager, async (req, res) => {
    await storage.deleteShift(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/shift-notes/mine", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser;
      const notes = await storage.getUnacknowledgedShiftNotes(user.id);
      res.json(notes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/shift-notes", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { employeeId } = req.query;
      const notes = await storage.getShiftNotes(employeeId as string | undefined);
      res.json(notes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/shift-notes", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const user = req.appUser;
      const { shiftId, employeeId, shiftDate, rawNote } = req.body;
      if (!employeeId || !shiftDate || !rawNote) {
        return res.status(400).json({ message: "employeeId, shiftDate, and rawNote are required" });
      }

      let constructiveNote = rawNote;
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        const aiResponse = await withRetry(() => openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a supportive bakery manager writing constructive feedback for a team member. Rewrite the following shift note into professional, actionable feedback. Keep it brief (2-3 sentences max), supportive in tone, and focused on improvement. Do not add anything the manager didn't mention. Do not use bullet points. Write in second person (\"you\")."
            },
            { role: "user", content: rawNote }
          ],
          max_tokens: 200,
          temperature: 0.7,
        }));
        const aiText = aiResponse.choices[0]?.message?.content?.trim();
        if (aiText && aiText.length > 0) constructiveNote = aiText;
      } catch (aiErr) {
        console.error("AI rewrite failed, using raw note:", aiErr);
      }

      const note = await storage.createShiftNote({
        shiftId: shiftId || null,
        employeeId,
        shiftDate,
        rawNote,
        constructiveNote,
        createdBy: user.id,
        acknowledged: false,
      });
      res.status(201).json(note);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/shift-notes/:id/acknowledge", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const note = await storage.acknowledgeShiftNote(id, user.id);
      if (!note) return res.status(404).json({ message: "Note not found" });
      res.json(note);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/shifts/import", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner" && user.role !== "manager" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Only managers, shift managers, general managers, or owners can import schedules" });
      }
      const { csvContent, imageBase64, imageMimeType, weekStartDate } = req.body;
      if (!csvContent && !imageBase64) {
        return res.status(400).json({ message: "No schedule data provided" });
      }

      if (imageBase64) {
        const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
        const mime = imageMimeType || "image/jpeg";
        if (!allowedMimes.includes(mime)) {
          return res.status(400).json({ message: "Unsupported image format. Please upload a JPG, PNG, or WebP image." });
        }
        const sizeBytes = Buffer.byteLength(imageBase64, "base64");
        if (sizeBytes > 15 * 1024 * 1024) {
          return res.status(400).json({ message: "Image too large. Please upload an image under 15MB." });
        }
      }
      const allUsers = await authStorage.getAllUsers();
      const teamList = allUsers.map(u => ({
        id: u.id,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        username: u.username || "",
        department: (u as any).department || "kitchen",
      })).filter(u => u.name || u.username);

      const userDeptMap = new Map(teamList.map(t => [t.id, t.department]));

      const { openai: aiClient } = await import("./replit_integrations/audio/client");

      const today = new Date();
      const currentYear = today.getFullYear();
      const currentDateStr = today.toISOString().split("T")[0];

      const timeParsingRules = `Time parsing rules:
- Shorthand times like "7-2" = "7:00 AM" to "2:00 PM". "7-11" = "7:00 AM" to "11:00 AM". "5-1" = "5:00 AM" to "1:00 PM". "2-10" = "2:00 PM" to "10:00 PM".
- For single digit end times ≤ 4 (like "7-2", "6-1"), the end time is PM. For end times 5-12, determine AM/PM based on whether it creates a reasonable shift length (4-12 hours).
- If a cell says "OFF", "X", or is empty, skip it — no shift for that person on that day.`;

      let messages: any[];
      let parsedShifts: any[] = [];

      if (imageBase64) {
        const mime = imageMimeType || "image/jpeg";
        const imagePayload = { type: "image_url" as const, image_url: { url: `data:${mime};base64,${imageBase64}`, detail: "high" as const } };

        console.log("[Schedule Import] Phase 1: Reading grid structure from image...");
        const phase1Messages = [{
          role: "user" as const,
          content: [
            { type: "text" as const, text: `You are a schedule image reader. Today's date is ${currentDateStr} (year ${currentYear}).

Look at this schedule image carefully. It is a grid where rows are employees and columns are dates.

Tell me:
1. ALL employee names visible (one per line, in order from top to bottom)
2. ALL date columns visible (list every date header you see, in order left to right)
3. For EACH employee row, list EVERY cell value (the shift time) for each date column. Use "OFF" or "—" for empty/off cells.

Format your response EXACTLY like this:
EMPLOYEES:
- Row 1: [name as shown]
- Row 2: [name as shown]
...

DATES: [list all date headers separated by commas, e.g. "3/2, 3/3, 3/4, 3/5, 3/6, 3/7, 3/8, 3/9, 3/10, ..."]

GRID:
[name]: [cell1], [cell2], [cell3], ...
[name]: [cell1], [cell2], [cell3], ...

Read the ENTIRE image from top to bottom and left to right. Do not skip any rows or columns. Every date column and every employee row must be included.` },
            imagePayload,
          ],
        }];

        const phase1 = await withRetry(() => aiClient.chat.completions.create({
          model: "gpt-4o",
          messages: phase1Messages,
          max_tokens: 16384,
          temperature: 0.1,
        }), "schedule-import-phase1");

        const gridText = phase1.choices[0]?.message?.content || "";
        console.log("[Schedule Import] Phase 1 response length:", gridText.length, "chars");
        console.log("[Schedule Import] Phase 1 preview:", gridText.substring(0, 500));

        console.log("[Schedule Import] Phase 2: Converting grid to shift JSON...");
        const phase2Messages = [{
          role: "user" as const,
          content: `You are a schedule parser. Convert the following schedule grid data into a JSON array of shift objects.

Today's date is ${currentDateStr} (year ${currentYear}).

Team members (id, name, username, default department):
${teamList.map(t => `- ${t.id}: ${t.name} (${t.username}) [dept: ${t.department}]`).join("\n")}

${timeParsingRules}

Schedule grid data extracted from image:
${gridText}

INSTRUCTIONS:
- For each non-empty/non-OFF cell, create a shift object.
- Match employee names to the team member list above (case-insensitive, partial match OK — first name match is sufficient).
- Convert date headers to YYYY-MM-DD format using year ${currentYear}.
- For department: use the employee's default department from the team list. Only override if the schedule explicitly shows a different department.
- If you can't match a name, set userId to null and put "Unknown: [name]" in notes.

Return a JSON array where each object has:
- userId: matched team member ID or null
- shiftDate: "YYYY-MM-DD"
- startTime: "H:MM AM/PM"
- endTime: "H:MM AM/PM"
- department: "kitchen", "foh", or "bakery"
- notes: optional

Return ONLY the JSON array, no other text.`,
        }];

        const phase2 = await withRetry(() => aiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: phase2Messages,
          max_tokens: 16384,
          temperature: 0.1,
        }), "schedule-import-phase2");

        const responseText = phase2.choices[0]?.message?.content || "[]";
        console.log("[Schedule Import] Phase 2 response length:", responseText.length, "chars");
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          return res.status(400).json({ message: "Could not parse schedule from the uploaded data. The AI could read the image but failed to convert it to shifts." });
        }
        parsedShifts = JSON.parse(jsonMatch[0]);
      } else {
        const csvInstructions = `You are a schedule parser. Extract ALL shift assignments from the provided data. Today's date is ${currentDateStr} (year ${currentYear}).

Team members (id, name, username, default department):
${teamList.map(t => `- ${t.id}: ${t.name} (${t.username}) [dept: ${t.department}]`).join("\n")}

${weekStartDate ? `Reference date context: ${weekStartDate}` : ""}

${timeParsingRules}
- For department: use the employee's default department from the list above. Only override if the schedule explicitly indicates a different department.

Return a JSON array of shift objects. Each shift must have:
- userId: the team member's ID from the list above (match by name, first name, last name, or username — case-insensitive, partial match OK)
- shiftDate: in YYYY-MM-DD format
- startTime: in format like "6:00 AM"
- endTime: in format like "2:00 PM"
- department: one of "kitchen", "foh", or "bakery"
- notes: optional

If you can't match a name to a team member, set userId to null and put the original name in the notes field prefixed with "Unknown: ".
Return ONLY the JSON array, no other text or markdown.`;

        messages = [{
          role: "user",
          content: `${csvInstructions}\n\nSchedule data:\n${csvContent}`,
        }];

        console.log("[Schedule Import] Sending CSV to AI with max_tokens=16384, team size:", teamList.length);

        const completion = await withRetry(() => aiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          max_tokens: 16384,
          temperature: 0.1,
        }), "schedule-import");

        const responseText = completion.choices[0]?.message?.content || "[]";
        console.log("[Schedule Import] AI response length:", responseText.length, "chars");
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          return res.status(400).json({ message: "Could not parse schedule from the uploaded data" });
        }
        parsedShifts = JSON.parse(jsonMatch[0]);
      }

      const validDepts = ["kitchen", "foh", "bakery", "bar"];
      parsedShifts = parsedShifts.map((shift: any) => {
        if (shift.userId && userDeptMap.has(shift.userId)) {
          const profileDept = userDeptMap.get(shift.userId);
          if (!shift.department || !validDepts.includes(shift.department)) {
            shift.department = profileDept;
          }
        }
        return shift;
      });

      console.log("[Schedule Import] Parsed", parsedShifts.length, "shifts");
      res.json({ shifts: parsedShifts, teamMembers: teamList });
    } catch (err) {
      console.error("Error importing schedule:", err);
      res.status(500).json({ message: "Failed to parse schedule data" });
    }
  });

  app.post("/api/shifts/import-image-file", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner") {
        return res.status(403).json({ message: "Only owners can use this endpoint" });
      }
      const { filePath } = req.body;
      if (!filePath || typeof filePath !== "string") return res.status(400).json({ message: "filePath required" });

      const fs = await import("fs");
      const path = await import("path");
      const allowedDirs = [
        path.resolve("attached_assets"),
        path.resolve("uploads"),
        path.resolve("/tmp/uploads"),
      ];
      const absPath = path.resolve(filePath);
      if (!allowedDirs.some(dir => absPath.startsWith(dir + path.sep) || absPath === dir)) {
        return res.status(403).json({ message: "File path not allowed" });
      }

      const ext = path.extname(absPath).toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
      if (!allowedExts.includes(ext)) {
        return res.status(400).json({ message: "Only image files (.jpg, .jpeg, .png, .webp) are allowed" });
      }

      if (!fs.existsSync(absPath)) return res.status(404).json({ message: "File not found" });

      const stat = fs.statSync(absPath);
      if (stat.size > 20 * 1024 * 1024) {
        return res.status(400).json({ message: "File too large (max 20MB)" });
      }

      const imgBuffer = fs.readFileSync(absPath);
      const base64 = imgBuffer.toString("base64");
      const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
      const mime = mimeMap[ext] || "image/jpeg";

      const allUsers = await authStorage.getAllUsers();
      const teamList = allUsers.map(u => ({
        id: u.id,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        username: u.username || "",
        department: (u as any).department || "kitchen",
      })).filter(u => u.name || u.username);
      const userDeptMap = new Map(teamList.map(t => [t.id, t.department]));

      const { openai: aiClient } = await import("./replit_integrations/audio/client");
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentDateStr = today.toISOString().split("T")[0];
      const imagePayload = { type: "image_url" as const, image_url: { url: `data:${mime};base64,${base64}`, detail: "high" as const } };

      console.log("[Image Import] Phase 1: Reading grid...");
      const phase1 = await withRetry(() => aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user" as const,
          content: [
            { type: "text" as const, text: `You are a schedule image reader. Today's date is ${currentDateStr} (year ${currentYear}).

Look at this schedule image carefully. It contains MULTIPLE weekly grids stacked vertically. Each grid has rows for employees and columns for days Monday through Sunday.

Red/pink highlighted cells mean the employee is UNAVAILABLE / OFF that day — do NOT create a shift for these.

Tell me:
1. ALL employee names visible (one per line)
2. ALL date columns visible across ALL weeks
3. For EACH employee in EACH week, list EVERY cell value. Use "OFF" for empty or red-highlighted cells.

Format:
EMPLOYEES:
- [name]
...

WEEK 1 DATES: [comma-separated dates like 3/30, 3/31, 4/1, ...]
WEEK 1 GRID:
[name]: [cell1], [cell2], ...

WEEK 2 DATES: [...]
WEEK 2 GRID:
[name]: [cell1], [cell2], ...

(continue for all weeks)

Read the ENTIRE image top to bottom. Every week, every employee, every cell.` },
            imagePayload,
          ],
        }],
        max_tokens: 16384,
        temperature: 0.1,
      }), "image-import-phase1");

      const gridText = phase1.choices[0]?.message?.content || "";
      console.log("[Image Import] Phase 1 length:", gridText.length);
      console.log("[Image Import] Phase 1 preview:", gridText.substring(0, 800));

      console.log("[Image Import] Phase 2: Converting to JSON...");
      const phase2 = await withRetry(() => aiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user" as const,
          content: `Convert this schedule grid data into a JSON array of shift objects.

Today's date is ${currentDateStr} (year ${currentYear}).

Team members (id, name, username, default department):
${teamList.map(t => `- ${t.id}: ${t.name} (${t.username}) [dept: ${t.department}]`).join("\n")}

Time parsing rules:
- "7-2" = 7:00 AM to 2:00 PM. "7-11" = 7:00 AM to 11:00 AM. "7-10" = 7:00 AM to 10:00 AM. "5-1" = 5:00 AM to 1:00 PM. "7-12 ED" = 7:00 AM to 12:00 PM (ignore "ED" suffix).
- "OFF", "—", empty, or red-highlighted = skip, no shift.
- For single digit end times ≤ 4, the end time is PM.

Schedule grid data:
${gridText}

INSTRUCTIONS:
- For each non-OFF cell, create a shift object.
- Match employee names to the team list (case-insensitive, partial match OK).
- Convert dates to YYYY-MM-DD using year ${currentYear}.
- Department: use employee's default department.
- If can't match a name, set userId to null and put "Unknown: [name]" in notes.

Return JSON array, each object:
- userId: matched ID or null
- shiftDate: "YYYY-MM-DD"
- startTime: "H:MM AM/PM"
- endTime: "H:MM AM/PM"
- department: "kitchen", "foh", or "bakery"
- notes: optional

Return ONLY the JSON array.`,
        }],
        max_tokens: 16384,
        temperature: 0.1,
      }), "image-import-phase2");

      const responseText = phase2.choices[0]?.message?.content || "[]";
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return res.status(400).json({ message: "Could not parse shifts from image" });

      let parsedShifts: any[] = JSON.parse(jsonMatch[0]);

      const validDepts = ["kitchen", "foh", "bakery", "bar"];
      parsedShifts = parsedShifts.map((shift: any) => {
        if (shift.userId && userDeptMap.has(shift.userId)) {
          const profileDept = userDeptMap.get(shift.userId);
          if (!shift.department || !validDepts.includes(shift.department)) shift.department = profileDept;
        }
        return shift;
      });

      console.log("[Image Import] Parsed", parsedShifts.length, "shifts from image");
      res.json({ shifts: parsedShifts, teamMembers: teamList, gridText });
    } catch (err: any) {
      console.error("[Image Import] Error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/shifts/template", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner" && user.role !== "manager" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const weekStartStr = req.query.weekStart as string;
      if (weekStartStr && !/^\d{4}-\d{2}-\d{2}$/.test(weekStartStr)) {
        return res.status(400).json({ message: "Invalid weekStart format, use YYYY-MM-DD" });
      }
      const weeksCount = Math.min(Math.max(parseInt(req.query.weeks as string) || 4, 1), 8);

      const XLSX = await import("xlsx");
      const allUsers = await authStorage.getAllUsers();
      const sanitizeCell = (val: string) => {
        if (val && /^[=+\-@\t\r]/.test(val)) return "'" + val;
        return val;
      };
      const teamList = allUsers
        .filter(u => !u.locked)
        .map(u => sanitizeCell(`${u.firstName || ""} ${u.lastName || ""}`.trim()))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      const { addDays, startOfWeek, format: fnsFormat } = await import("date-fns");
      let baseDate: Date;
      if (weekStartStr) {
        baseDate = startOfWeek(new Date(weekStartStr + "T12:00:00"), { weekStartsOn: 3 });
      } else {
        baseDate = startOfWeek(new Date(), { weekStartsOn: 3 });
      }

      const rows: any[][] = [];

      for (let w = 0; w < weeksCount; w++) {
        const wkStart = addDays(baseDate, w * 7);
        const dayDates: Date[] = [];
        for (let d = 0; d < 7; d++) dayDates.push(addDays(wkStart, d));

        if (w > 0) rows.push([]);

        rows.push([
          "WEEK:",
          `Monday ${fnsFormat(dayDates[0], "M/d")}`,
          fnsFormat(dayDates[1], "M/d"),
          fnsFormat(dayDates[2], "M/d"),
          fnsFormat(dayDates[3], "M/d"),
          fnsFormat(dayDates[4], "M/d"),
          fnsFormat(dayDates[5], "M/d"),
          fnsFormat(dayDates[6], "M/d"),
        ]);

        rows.push(["EMPLOYEE", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);

        for (const name of teamList) {
          rows.push([name, "", "", "", "", "", "", ""]);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 22 },
        { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Schedule");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const fileName = `Schedule_Template_${fnsFormat(baseDate, "yyyy-MM-dd")}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(buf);
    } catch (err: any) {
      console.error("Error generating template:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/shifts/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner" && user.role !== "manager" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Only managers, shift managers, general managers, or owners can bulk create shifts" });
      }
      const { shifts: shiftList } = req.body;
      console.log("[Bulk Shifts] Received", shiftList?.length, "shifts. Sample:", JSON.stringify(shiftList?.[0]));
      if (!Array.isArray(shiftList) || shiftList.length === 0) {
        return res.status(400).json({ message: "No shifts provided" });
      }
      const allDates = [...new Set(shiftList.map((s: any) => s.shiftDate).filter(Boolean))];
      const allLocationIds = [...new Set(shiftList.map((s: any) => s.locationId).filter(Boolean))];
      let existingShifts: any[] = [];
      if (allDates.length > 0) {
        const minDate = allDates.sort()[0];
        const maxDate = allDates.sort()[allDates.length - 1];
        if (allLocationIds.length === 1) {
          existingShifts = await storage.getShifts(minDate, maxDate, allLocationIds[0]);
        } else {
          existingShifts = await storage.getShifts(minDate, maxDate);
        }
      }

      const allUsers = await storage.getUsers();
      const userDeptMap = new Map(allUsers.map((u: any) => [u.id, u.department]));

      const created = [];
      let skipped = 0;
      let duplicates = 0;
      let errors = 0;
      for (const s of shiftList) {
        if (!s.shiftDate || !s.startTime || !s.endTime) {
          console.log("[Bulk Shifts] Skipping shift — missing required fields:", JSON.stringify(s));
          skipped++;
          continue;
        }
        if (s.userId) {
          const isDuplicate = existingShifts.some(e =>
            e.shiftDate === s.shiftDate &&
            e.startTime === s.startTime &&
            e.endTime === s.endTime &&
            e.userId === s.userId &&
            ((!e.locationId && !s.locationId) || e.locationId === s.locationId)
          );
          if (isDuplicate) {
            console.log("[Bulk Shifts] Skipping duplicate:", s.shiftDate, s.startTime, s.userId);
            duplicates++;
            continue;
          }
        }
        const resolvedDept = s.department || (s.userId ? userDeptMap.get(s.userId) : undefined);
        if (!resolvedDept) {
          console.log("[Bulk Shifts] Skipping shift — no department resolved:", JSON.stringify(s));
          skipped++;
          continue;
        }
        try {
          const shift = await storage.createShift({
            userId: s.userId || null,
            shiftDate: s.shiftDate,
            startTime: s.startTime,
            endTime: s.endTime,
            department: resolvedDept,
            position: s.position || null,
            notes: s.notes || null,
            locationId: s.locationId || null,
            status: s.userId ? "assigned" : "open",
            createdBy: user.id,
          } as any);
          created.push(shift);
          existingShifts.push(shift);
          if (s.userId) {
            sendPushToUser(s.userId, {
              title: "New Shift Assigned",
              body: `You've been scheduled on ${s.shiftDate} from ${s.startTime} to ${s.endTime}`,
              tag: `shift-${shift.id}`,
              url: "/schedule",
            }).catch(err => console.error("[Push] Bulk shift notification error:", err));
          }
        } catch (shiftErr: any) {
          console.error("[Bulk Shifts] Error creating shift:", JSON.stringify(s), shiftErr?.message || shiftErr);
          errors++;
        }
      }
      console.log("[Bulk Shifts] Created", created.length, "shifts, skipped", skipped, "duplicates", duplicates, "errors", errors);
      if (created.length === 0 && errors > 0) {
        return res.status(500).json({ message: `Failed to create shifts (${errors} errors)` });
      }
      res.status(201).json({ created, skipped, duplicates, errors });
    } catch (err: any) {
      console.error("Error bulk creating shifts:", err?.message || err, err?.stack);
      res.status(500).json({ message: "Failed to create shifts" });
    }
  });

  // === TIME OFF REQUESTS ===
  app.get(api.timeOffRequests.list.path, isAuthenticated, async (req: any, res) => {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role === "owner" || user.role === "manager") {
      const result = await storage.getTimeOffRequests();
      return res.json(result);
    }
    const result = await storage.getTimeOffRequests(user.id);
    res.json(result);
  });

  app.post(api.timeOffRequests.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.timeOffRequests.create.input.parse(req.body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const userId = user.id;
      const request = await storage.createTimeOffRequest({ ...input, userId });
      res.status(201).json(request);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.patch(api.timeOffRequests.updateStatus.path, isAuthenticated, isManager, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { status, reviewNote } = api.timeOffRequests.updateStatus.input.parse(req.body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const userId = user.id;
      const updated = await storage.updateTimeOffRequestStatus(id, status, userId, reviewNote);
      if (!updated) return res.status(404).json({ message: "Request not found" });
      sendPushToUser(updated.userId, {
        title: `Time Off ${status === "approved" ? "Approved" : "Denied"}`,
        body: `Your time off request has been ${status}${reviewNote ? `: ${reviewNote}` : ""}`,
        tag: `timeoff-${updated.id}`,
        url: "/schedule",
      }).catch(err => console.error("[Push] Time off notification error:", err));
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete(api.timeOffRequests.delete.path, isAuthenticated, async (req: any, res) => {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const allRequests = await storage.getTimeOffRequests();
    const target = allRequests.find(r => r.id === Number(req.params.id));
    if (!target) return res.status(404).json({ message: "Request not found" });
    if (target.userId !== user.id && user.role !== "owner" && user.role !== "manager") {
      return res.status(403).json({ message: "You can only cancel your own requests" });
    }
    await storage.deleteTimeOffRequest(Number(req.params.id));
    res.status(204).send();
  });

  // === PRE-SHIFT NOTES ===
  app.get("/api/pre-shift-notes", isAuthenticated, async (req: any, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const user = await getUserFromReq(req);
      const notes = await storage.getPreShiftNotes(date);

      const noteIds = notes.map(n => n.id);
      const acks = await storage.getPreShiftNoteAcks(noteIds);

      const notesWithAcks = notes.map(n => ({
        ...n,
        acked: user ? acks.some(a => a.noteId === n.id && a.userId === user.id) : false,
        ackCount: acks.filter(a => a.noteId === n.id).length,
      }));

      res.json(notesWithAcks);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const createNoteSchema = z.object({
    content: z.string().min(1, "Content is required"),
    rawContent: z.string().nullable().optional(),
    date: z.string().min(1, "Date is required"),
    focus: z.enum(["foh", "boh", "all"]).default("all"),
    locationId: z.number().nullable().optional(),
  });

  app.post("/api/pre-shift-notes", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const parsed = createNoteSchema.parse(req.body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const userId = user.id;
      const note = await storage.createPreShiftNote({
        content: parsed.content,
        rawContent: parsed.rawContent || null,
        focus: parsed.focus,
        date: parsed.date,
        authorId: userId,
        locationId: parsed.locationId || null,
      });
      res.status(201).json(note);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  const generateNoteSchema = z.object({
    rawContent: z.string().min(1, "Raw content is required"),
    date: z.string().min(1, "Date is required"),
    focus: z.enum(["foh", "boh", "all"]).default("all"),
    locationId: z.number().nullable().optional(),
  });

  app.post("/api/pre-shift-notes/generate", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const parsed = generateNoteSchema.parse(req.body);
      const { rawContent, date, focus: focusArea, locationId } = parsed;
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      // === GATHER PHASE ===
      let locationName = "Springfield, MA";
      if (locationId) {
        const loc = await storage.getLocation(locationId);
        if (loc?.address) {
          locationName = loc.address;
        } else if (loc?.name) {
          locationName = loc.name;
        }
      }

      const todayShifts = await storage.getShifts(date, date, locationId || undefined);
      const allUsers = await authStorage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const shiftSummary = todayShifts
        .filter(s => userMap.has(s.userId))
        .map(s => {
          const u = userMap.get(s.userId)!;
          const name = u.firstName || u.username || "Team member";
          return `${name}: ${s.startTime}–${s.endTime}${s.role ? ` (${s.role})` : ""}`;
        })
        .join("; ");

      let weatherSummary = "";
      try {
        const weather = await fetchWeather(locationName);
        if (weather) {
          weatherSummary = `${weather.temp}°F, ${weather.description}, feels like ${weather.feelsLike}°F, wind ${weather.windSpeed} mph`;
        }
      } catch {}

      const allFeedback = await storage.getCustomerFeedback();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentWins = allFeedback
        .filter(f => {
          if (!f.createdAt || f.rating < 4) return false;
          if (locationId && f.locationId !== locationId) return false;
          return new Date(f.createdAt) >= sevenDaysAgo;
        })
        .slice(0, 5)
        .map(f => {
          const parts = [`${f.rating}-star`];
          if (f.name) parts.push(`from ${f.name}`);
          if (f.comment) parts.push(`"${f.comment.slice(0, 120)}"`);
          return parts.join(" ");
        })
        .join(" | ");

      const contextBlock = [
        shiftSummary ? `TODAY'S TEAM: ${shiftSummary}` : "",
        weatherSummary ? `WEATHER: ${weatherSummary}` : "",
        recentWins ? `RECENT WINS (The Loop): ${recentWins}` : "",
      ].filter(Boolean).join("\n");

      const focusGuidance = focusArea === "foh"
        ? "Focus on front-of-house: customer experience, display cases, upselling, service speed, and sales wins."
        : focusArea === "boh"
        ? "Focus on back-of-house: production, dough work, kitchen operations, prep lists, and bake-off schedules."
        : "Cover both front-of-house and back-of-house topics.";

      // === DRAFT PHASE ===
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const draftResponse = await withRetry(() => openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a pre-shift note writer for Bear's Cup Bakehouse, a craft bakery and café. Write a warm, concise pre-shift note that weaves the manager's raw input with the contextual data provided. ${focusGuidance}

Rules:
- Keep it under 200 words
- Use a warm, direct tone — no questions, no robotic phrasing
- Weave in relevant context naturally (weather, who's on shift, wins)
- Do NOT use bullet points or numbered lists — write in short paragraphs
- Do NOT start with greetings like "Hey team" — jump right into the substance
- Output ONLY the note text, nothing else`
          },
          {
            role: "user",
            content: `MANAGER'S RAW NOTE:\n${rawContent}\n\nCONTEXT:\n${contextBlock || "No additional context available."}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }));

      let draft = draftResponse.choices[0]?.message?.content?.trim() || rawContent;

      // === REVIEW PHASE ===
      const reviewResponse = await withRetry(() => openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an editor for Bear's Cup Bakehouse pre-shift notes. Review the draft and fix any issues:
- Remove any questions (rephrase as statements or encouragements)
- Remove robotic or corporate phrasing
- Ensure the tone is warm, human, and direct
- Keep it concise (under 200 words)
- If the draft is already good, return it unchanged
- Output ONLY the revised note text, nothing else`
          },
          {
            role: "user",
            content: draft
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }));

      let reviewed = reviewResponse.choices[0]?.message?.content?.trim() || draft;

      // === HUMANIZE PHASE ===
      const authorName = user.firstName || user.username || "Manager";
      const humanizeResponse = await withRetry(() => openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are doing a final pass on a Bear's Cup Bakehouse pre-shift note. Make these adjustments:
- If team members are mentioned by name, keep those callouts warm and personal
- Add a brief mission-aligned closing line that connects to Bear's Cup's mission of craft baking, community, and genuine hospitality
- Sign off with "— ${authorName}"
- Keep the overall length under 200 words
- Maintain the warm, direct tone
- Output ONLY the final note text, nothing else`
          },
          {
            role: "user",
            content: reviewed
          }
        ],
        temperature: 0.4,
        max_tokens: 500,
      }));

      const finalContent = humanizeResponse.choices[0]?.message?.content?.trim() || reviewed;

      res.json({ content: finalContent, rawContent });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[Pre-Shift Generate] Error:", err);
      res.status(500).json({ message: err.message || "Failed to generate pre-shift note" });
    }
  });

  app.post("/api/pre-shift-notes/:id/ack", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await storage.ackPreShiftNote(Number(req.params.id), user.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/pre-shift-notes/:id", isAuthenticated, isManager, async (req, res) => {
    try {
      const note = await storage.updatePreShiftNote(Number(req.params.id), req.body);
      res.json(note);
    } catch (err) {
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  app.delete("/api/pre-shift-notes/:id", isAuthenticated, isManager, async (req, res) => {
    await storage.deletePreShiftNote(Number(req.params.id));
    res.status(204).send();
  });

  // === TODAY'S SHIFTS (enriched with user names for Who's On) ===
  app.get("/api/shifts/today", isAuthenticated, async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const todayShifts = await storage.getShifts(date, date);
      const allUsers = await authStorage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      const timeOffReqs = await storage.getTimeOffRequests();
      const coverageMessages = await storage.getScheduleMessages();

      const validShifts = todayShifts.filter(shift => userMap.has(shift.userId));
      const seenUsers = new Set<string>();
      const dedupedShifts = validShifts.filter(shift => {
        if (!shift.userId) return true;
        if (seenUsers.has(shift.userId)) return false;
        seenUsers.add(shift.userId);
        return true;
      });
      const enrichedShifts = dedupedShifts.map(shift => {
        const shiftUser = userMap.get(shift.userId)!;
        const displayName = shiftUser.username || shiftUser.firstName || shiftUser.email || shift.userId;

        const hasCallout = timeOffReqs.some(r =>
          r.userId === shift.userId &&
          (r.status === "approved" || r.status === "pending") &&
          r.startDate <= date && r.endDate >= date
        );

        const hasCoverageRequest = coverageMessages.some(m =>
          m.userId === shift.userId &&
          !m.resolved &&
          (m.relatedDate === date || !m.relatedDate)
        );

        return {
          ...shift,
          displayName,
          hasCallout,
          hasCoverageRequest,
          calloutType: hasCallout ? timeOffReqs.find(r =>
            r.userId === shift.userId &&
            (r.status === "approved" || r.status === "pending") &&
            r.startDate <= date && r.endDate >= date
          )?.requestType : null,
        };
      });

      res.json(enrichedShifts);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch today's shifts" });
    }
  });

  // === PASTRY PASSPORTS ===
  app.get(api.pastryPassports.list.path, isAuthenticated, async (req, res) => {
    const passports = await storage.getPastryPassports();
    res.json(passports);
  });

  app.get(api.pastryPassports.get.path, isAuthenticated, async (req, res) => {
    const passport = await storage.getPastryPassport(Number(req.params.id));
    if (!passport) return res.status(404).json({ message: "Pastry passport not found" });
    res.json(passport);
  });

  app.post("/api/pastry-passports/bulk-create", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const schema = z.object({
        pastryItemIds: z.array(z.number().int()).min(1),
      });
      const { pastryItemIds } = schema.parse(req.body);

      const allPastryItems = await storage.getPastryItems();
      const allRecipes = await storage.getRecipes();
      const existingPassports = await storage.getPastryPassports();
      const linkedItemIds = new Set(existingPassports.filter(p => p.pastryItemId).map(p => p.pastryItemId));

      const DOUGH_TYPE_TO_CATEGORY: Record<string, string> = {
        "Croissant": "Viennoiserie",
        "Danish": "Viennoiserie",
        "Cookies": "Cookies",
        "Cake": "Muffin/Cake",
        "Bread": "Bread",
      };

      const created: any[] = [];
      const skipped: string[] = [];

      for (const itemId of pastryItemIds) {
        const item = allPastryItems.find((i: any) => i.id === itemId);
        if (!item) {
          skipped.push(`Item ID ${itemId} not found`);
          continue;
        }
        if (linkedItemIds.has(item.id)) {
          skipped.push(`${item.name} already has a passport`);
          continue;
        }

        const category = DOUGH_TYPE_TO_CATEGORY[item.doughType] || "Bread";

        let motherRecipeId: number | null = null;
        const doughTypeLower = item.doughType.toLowerCase();
        const motherMatch = allRecipes.find((r: any) =>
          r.category === "Mother" &&
          (r.title.toLowerCase().includes(doughTypeLower) ||
           doughTypeLower.includes(r.title.toLowerCase().replace(" dough", "").replace(" mother", "")))
        );
        if (motherMatch) {
          motherRecipeId = motherMatch.id;
        }

        const passport = await storage.createPastryPassport({
          name: item.name,
          category,
          pastryItemId: item.id,
          motherRecipeId,
          primaryRecipeId: null,
          photoUrl: null,
          descriptionText: null,
          assemblyText: null,
          bakingText: null,
          finishText: null,
        });
        created.push({ ...passport, motherRecipeTitle: motherMatch?.title || null });
        linkedItemIds.add(item.id);
      }

      res.status(201).json({ created, skipped });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Bulk create passports error:", err);
      res.status(500).json({ message: "Failed to bulk create passports" });
    }
  });

  app.post(api.pastryPassports.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.pastryPassports.create.input.parse(req.body);
      const passport = await storage.createPastryPassport(input);
      res.status(201).json(passport);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put(api.pastryPassports.update.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.pastryPassports.update.input.parse(req.body);
      const passport = await storage.updatePastryPassport(Number(req.params.id), input);
      res.json(passport);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete(api.pastryPassports.delete.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    await storage.deletePastryPassport(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.pastryPassports.addMedia.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.pastryPassports.addMedia.input.parse(req.body);
      const media = await storage.addPastryMedia({ ...input, pastryId: Number(req.params.id) });
      res.status(201).json(media);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/pastry-passports/:pastryId/media/:mediaId", isAuthenticated, isUnlocked, async (req: any, res) => {
    await storage.deletePastryMedia(Number(req.params.mediaId));
    res.status(204).send();
  });

  app.post(api.pastryPassports.addComponent.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.pastryPassports.addComponent.input.parse(req.body);
      const component = await storage.addPastryComponent({ ...input, pastryId: Number(req.params.id) });
      res.status(201).json(component);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/pastry-passports/:pastryId/components/:componentId", isAuthenticated, isUnlocked, async (req: any, res) => {
    await storage.deletePastryComponent(Number(req.params.componentId));
    res.status(204).send();
  });

  app.post(api.pastryPassports.addAddin.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.pastryPassports.addAddin.input.parse(req.body);
      const addin = await storage.addPastryAddin({ ...input, pastryId: Number(req.params.id) });
      res.status(201).json(addin);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/pastry-passports/:pastryId/addins/:addinId", isAuthenticated, isUnlocked, async (req: any, res) => {
    await storage.deletePastryAddin(Number(req.params.addinId));
    res.status(204).send();
  });

  app.post(api.pastryPassports.uploadPhoto.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { image } = api.pastryPassports.uploadPhoto.input.parse(req.body);
      const result = await uploadMediaWithThumbnail(image, "pastry", req.params.id);
      res.json({ url: result.url, thumbnailUrl: result.thumbnailUrl });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === KIOSK VOICE LOGGING ===
  app.post("/api/kiosk/voice-log", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { audio, text } = req.body;
      let transcript = "";

      if (text && typeof text === "string" && text.trim().length > 0) {
        transcript = text.trim();
      } else if (audio) {
        const rawBuffer = Buffer.from(audio, "base64");
        const detected = detectAudioFormat(rawBuffer);
        const audioFormat = detected === "unknown" ? "wav" : detected;
        transcript = await speechToText(rawBuffer, audioFormat);
      }

      if (!transcript || transcript.trim().length === 0) {
        return res.status(400).json({ message: "No input provided. Send audio or text." });
      }

      const today = new Date().toISOString().split("T")[0];
      const [pastryTotalsData, recipesData, existingBakeoffs] = await Promise.all([
        storage.getPastryTotals(today),
        storage.getRecipes(),
        storage.getBakeoffLogs(today),
      ]);

      const knownItems = [
        ...pastryTotalsData.map(pt => pt.itemName),
        ...recipesData.map(r => r.title),
      ];
      const uniqueItems = Array.from(new Set(knownItems));

      const parseResponse = await withRetry(() => openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are Jarvis, a bakery assistant. Parse a baker's spoken command and determine the action type.

Known bakery items: ${uniqueItems.join(", ")}

Commands you handle:
1. BAKE-OFF LOG: Items coming out of the oven. E.g. "12 croissants", "36 plain croissants out".
2. SHAPING LOG: Dough being shaped. E.g. "shaped 24 danish dough".
3. TIMER: Setting a kitchen timer. E.g. "set a timer for 18 minutes", "timer 12 minutes for croissants". Parse the duration in seconds and a label.
4. QUESTION: A question about recipes, procedures, or the bakery. E.g. "what temp for danishes?"

Rules:
- Match spoken item names to the closest known item. Be flexible with abbreviations.
- If they say "shaped" or "dough" or mentions shaping, those are shaping entries.
- For timers, parse the duration in total seconds. "18 minutes" = 1080, "1 hour" = 3600, "90 seconds" = 90.
- If a quantity is not clear, default to 1.
- If it's a question, leave bakeoff/shaping/timer empty and put the answer in "answer".

Respond with JSON:
{
  "bakeoff": [{ "itemName": "exact known name", "quantity": number }],
  "shaping": [{ "doughType": "exact known name", "yieldCount": number }],
  "timer": { "label": "description", "durationSeconds": number } | null,
  "answer": "response to a question if asked" | null,
  "summary": "brief confirmation message"
}`
          },
          {
            role: "user",
            content: transcript
          }
        ],
      }), "kiosk-voice");

      const parsed = JSON.parse(parseResponse.choices[0]?.message?.content || "{}");

      const bakeoffSchema = z.array(z.object({
        itemName: z.string().min(1),
        quantity: z.number().int().min(1).max(9999),
      }));
      const shapingSchema = z.array(z.object({
        doughType: z.string().min(1),
        yieldCount: z.number().int().min(1).max(9999),
      }));

      const bakeoffEntries = bakeoffSchema.safeParse(parsed.bakeoff);
      const shapingEntries = shapingSchema.safeParse(parsed.shaping);

      const validBakeoffs = bakeoffEntries.success ? bakeoffEntries.data : [];
      const validShapings = shapingEntries.success ? shapingEntries.data : [];

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

      const createdBakeoffs = [];
      for (const entry of validBakeoffs) {
        const log = await storage.createBakeoffLog({
          date: today,
          itemName: entry.itemName,
          quantity: entry.quantity,
          bakedAt: timeStr,
        });
        createdBakeoffs.push(log);
      }

      const createdShapings = [];
      for (const entry of validShapings) {
        const log = await storage.createShapingLog({
          date: today,
          doughType: entry.doughType,
          yieldCount: entry.yieldCount,
          shapedAt: timeStr,
        });
        createdShapings.push(log);
      }

      let createdTimer = null;
      const timerSchema = z.object({
        label: z.string().min(1),
        durationSeconds: z.number().int().min(1).max(86400),
      });
      const timerParsed = timerSchema.safeParse(parsed.timer);
      if (timerParsed.success) {
        const timerNow = new Date();
        createdTimer = await storage.createTimer({
          label: timerParsed.data.label,
          durationSeconds: timerParsed.data.durationSeconds,
          startedAt: timerNow,
          expiresAt: new Date(timerNow.getTime() + timerParsed.data.durationSeconds * 1000),
          dismissed: false,
          createdBy: req.appUser?.id || null,
        });
      }

      res.json({
        transcript,
        summary: parsed.summary || "Logged successfully",
        bakeoff: createdBakeoffs,
        shaping: createdShapings,
        timer: createdTimer,
        answer: parsed.answer || null,
      });
    } catch (err: any) {
      console.error("Kiosk voice-log error:", err);
      res.status(500).json({ message: err.message || "Failed to process voice input" });
    }
  });

  app.get("/api/kiosk/timers", isAuthenticated, async (req: any, res) => {
    try {
      const dept = req.query.department as string | undefined;
      let timers = await storage.getActiveTimers();
      if (dept) {
        timers = timers.filter(t => t.department === dept);
      }
      res.json(timers);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/kiosk/timers", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const timerInput = z.object({
        label: z.string().min(1).max(200),
        durationSeconds: z.number().int().min(1).max(86400),
        department: z.string().optional(),
      }).parse(req.body);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + timerInput.durationSeconds * 1000);

      const timer = await storage.createTimer({
        label: timerInput.label,
        durationSeconds: timerInput.durationSeconds,
        startedAt: now,
        expiresAt,
        dismissed: false,
        createdBy: req.appUser?.id || null,
        department: timerInput.department || null,
      });
      res.status(201).json(timer);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid timer input" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/kiosk/timers/:id/dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const dismissed = await storage.dismissTimer(id);
      if (!dismissed) return res.status(404).json({ message: "Timer not found" });
      res.json({ dismissed: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/kiosk/voice-log/undo", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const undoSchema = z.object({
        bakeoffIds: z.array(z.number().int().positive()).max(50),
        shapingIds: z.array(z.number().int().positive()).max(50),
      });
      const { bakeoffIds, shapingIds } = undoSchema.parse(req.body);

      const today = new Date().toISOString().split("T")[0];
      const todayBakeoffs = await storage.getBakeoffLogs(today);
      const todayShapings = await storage.getShapingLogs(today);
      const validBakeoffIds = bakeoffIds.filter(id => todayBakeoffs.some(l => l.id === id));
      const validShapingIds = shapingIds.filter(id => todayShapings.some(l => l.id === id));

      for (const id of validBakeoffIds) {
        await storage.deleteBakeoffLog(id);
      }
      for (const id of validShapingIds) {
        await storage.deleteShapingLog(id);
      }
      res.json({ undone: true, bakeoffRemoved: validBakeoffIds.length, shapingRemoved: validShapingIds.length });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid undo request" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  // === TASK JOBS ===
  app.get("/api/task-jobs", isAuthenticated, async (req, res) => {
    const jobs = await storage.getTaskJobs();
    res.json(jobs);
  });

  app.get("/api/task-jobs/:id", isAuthenticated, async (req, res) => {
    const job = await storage.getTaskJob(Number(req.params.id));
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  });

  app.post("/api/task-jobs", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { insertTaskJobSchema } = await import("@shared/schema");
      const input = insertTaskJobSchema.parse(req.body);
      const user = await getUserFromReq(req);
      const job = await storage.createTaskJob({ ...input, createdBy: user?.id || null });
      res.status(201).json(job);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/task-jobs/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { insertTaskJobSchema } = await import("@shared/schema");
      const updates = insertTaskJobSchema.partial().parse(req.body);
      const job = await storage.updateTaskJob(Number(req.params.id), updates);
      res.json(job);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/task-jobs/:id", isAuthenticated, isUnlocked, async (req, res) => {
    await storage.deleteTaskJob(Number(req.params.id));
    res.json({ deleted: true });
  });

  // === TASK LISTS ===
  app.get("/api/task-lists", isAuthenticated, async (req, res) => {
    const lists = await storage.getTaskLists();
    const enriched = await Promise.all(lists.map(async (list) => {
      const full = await storage.getTaskList(list.id);
      const items = full?.items || [];
      const totalItems = items.length;
      const completedItems = items.filter(i => i.completed).length;
      return { ...list, totalItems, completedItems };
    }));
    res.json(enriched);
  });

  app.get("/api/task-lists/assigned", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const lists = await storage.getAssignedTaskLists(user.id);
      res.json(lists);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/task-lists/:id", isAuthenticated, async (req, res) => {
    const list = await storage.getTaskList(Number(req.params.id));
    if (!list) return res.status(404).json({ message: "List not found" });
    res.json(list);
  });

  app.post("/api/task-lists", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { insertTaskListSchema } = await import("@shared/schema");
      const input = insertTaskListSchema.parse(req.body);
      const user = await getUserFromReq(req);
      const list = await storage.createTaskList({ ...input, createdBy: user?.id || null });
      res.status(201).json(list);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/task-lists/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { insertTaskListSchema } = await import("@shared/schema");
      const updates = insertTaskListSchema.partial().parse(req.body);
      const list = await storage.updateTaskList(Number(req.params.id), updates);
      res.json(list);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/task-lists/:id", isAuthenticated, isUnlocked, async (req, res) => {
    await storage.deleteTaskList(Number(req.params.id));
    res.json({ deleted: true });
  });

  // === TASK LIST ITEMS ===
  app.post("/api/task-lists/:listId/items", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { insertTaskListItemSchema } = await import("@shared/schema");
      const input = insertTaskListItemSchema.parse({
        ...req.body,
        listId: Number(req.params.listId),
      });
      const item = await storage.createTaskListItem(input);
      res.status(201).json(item);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/task-lists/:listId/add-sop", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const listId = Number(req.params.listId);
      const { sopId, startOrder } = req.body;
      if (!sopId) return res.status(400).json({ message: "sopId is required" });

      const sop = await storage.getSOP(sopId);
      if (!sop) return res.status(404).json({ message: "SOP not found" });

      const lines = sop.content.split("\n").map(l => l.trim()).filter(Boolean);
      const steps: string[] = [];
      for (const line of lines) {
        const cleaned = line
          .replace(/^#{1,6}\s+/, "")
          .replace(/^\d+[\.\)]\s*/, "")
          .replace(/^[-*•]\s*/, "")
          .replace(/^\[.\]\s*/, "")
          .replace(/^\*\*(.*?)\*\*$/, "$1")
          .trim();
        if (cleaned.length > 0 && cleaned.length < 300) {
          steps.push(cleaned);
        }
      }

      if (steps.length === 0) {
        steps.push(sop.title);
      }

      const items = [];
      for (let i = 0; i < steps.length; i++) {
        const item = await storage.createTaskListItem({
          listId,
          sopId: sop.id,
          manualTitle: steps[i],
          sortOrder: (startOrder || 0) + i,
          completed: false,
        });
        items.push(item);
      }

      res.status(201).json({ items, sopTitle: sop.title, stepCount: items.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/task-list-items/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const updateSchema = z.object({
        completed: z.boolean().optional(),
        manualTitle: z.string().nullable().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        jobId: z.number().int().nullable().optional(),
      });
      const updates = updateSchema.parse(req.body);
      const item = await storage.updateTaskListItem(Number(req.params.id), updates);
      res.json(item);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/task-list-items/:id", isAuthenticated, isUnlocked, async (req, res) => {
    await storage.deleteTaskListItem(Number(req.params.id));
    res.json({ deleted: true });
  });

  app.get("/api/task-lists/:id/print", isAuthenticated, async (req, res) => {
    const list = await storage.getTaskList(Number(req.params.id));
    if (!list) return res.status(404).send("List not found");

    const allSOPs = await storage.getSOPs();
    const sopIds = new Set<number>();
    (list as any).items?.forEach((item: any) => {
      if (item.job?.sopId) sopIds.add(item.job.sopId);
    });
    const linkedSOPs = allSOPs.filter((s) => sopIds.has(s.id));

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const rowsHtml = ((list as any).items || []).map((item: any) => {
      const title = esc(item.job?.name || item.manualTitle || "Untitled");
      const timeStr = item.startTime
        ? item.endTime ? `${item.startTime} - ${item.endTime}` : item.startTime
        : "";
      const hasSop = !!item.job?.sopId;
      const desc = item.job?.description ? `<br><span style="font-size:12px;color:#777">${esc(item.job.description)}</span>` : "";
      return `<tr><td class="ck"><span class="cb"></span></td><td class="tm">${timeStr}</td><td>${title}${desc}</td><td>${hasSop ? '<span class="sb">See SOP below</span>' : ""}</td></tr>`;
    }).join("");

    const sopsHtml = linkedSOPs.map((sop) => {
      const content = (sop.content || "").replace(/\n/g, "<br>");
      const cat = sop.category ? ` <span class="sb">${esc(sop.category)}</span>` : "";
      return `<div style="margin-top:40px;page-break-before:auto"><div style="font-size:18px;font-weight:700;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #ccc">${esc(sop.title)}${cat}</div><div style="font-size:13px;line-height:1.6">${content}</div></div>`;
    }).join("");

    const title = esc((list as any).title || "Checklist");
    const description = (list as any).description ? `<div class="mt">${esc((list as any).description)}</div>` : "";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} - Bear's Cup Bakehouse</title>
<style>
@page{margin:0.75in}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a1a;line-height:1.5;padding:20px}
.hd{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:24px}
.hd h1{font-size:28px;font-weight:700;margin-bottom:4px}
.st{font-size:12px;color:#666;text-transform:uppercase;letter-spacing:2px}
.mt{font-size:14px;color:#555;margin-top:8px}
.sc{margin-bottom:28px}
.sct{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;padding:6px 8px;border-bottom:2px solid #999}
td{padding:7px 8px;border-bottom:1px solid #e5e5e5;vertical-align:middle}
.ck{width:28px;text-align:center}
.cb{width:16px;height:16px;border:2px solid #555;border-radius:50%;display:inline-block}
tr:nth-child(even){background:#f8f8f8}
.tm{font-variant-numeric:tabular-nums;white-space:nowrap;color:#555;font-size:13px}
.sb{display:inline-block;font-size:10px;background:#eee;color:#555;padding:2px 8px;border-radius:10px;margin-left:8px;text-transform:uppercase;letter-spacing:0.5px}
.nb{border:1px solid #ccc;border-radius:4px;padding:12px;min-height:60px;margin-top:16px}
.nl{font-size:12px;color:#888;margin-bottom:4px}
.ft{margin-top:32px;padding-top:12px;border-top:1px solid #ccc;text-align:center;font-size:11px;color:#999}
.tb{text-align:center;margin-bottom:20px;padding:16px;background:#f5f5f5;border-radius:8px}
.tb button{padding:10px 32px;font-size:15px;cursor:pointer;background:#333;color:#fff;border:none;border-radius:6px;font-weight:600}
.tb button:hover{background:#555}
@media print{.tb{display:none!important}}
</style></head><body>
<div class="tb">
<button onclick="window.print()">Print This Page</button>
<a href="/" style="display:inline-block;margin-left:16px;padding:10px 32px;font-size:15px;background:#666;color:#fff;border-radius:6px;font-weight:600;text-decoration:none">Back to App</a>
</div>
<div class="hd"><div class="st">Bear's Cup Bakehouse</div><h1>${title}</h1>${description}<div class="mt">Date: ____________</div></div>
<div class="sc"><div class="sct">Checklist</div>
<table><thead><tr><th style="width:28px"></th><th>Time</th><th>Task</th><th>SOP</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
<div class="sc"><div class="nb"><div class="nl">Completed by: ____________&nbsp;&nbsp;&nbsp;&nbsp;Date: ____________&nbsp;&nbsp;&nbsp;&nbsp;Notes:</div></div></div>
${sopsHtml}
<div class="ft">Jarvis Task Manager - Bear's Cup Bakehouse</div>
</body></html>`);
  });

  // === TASK ASSIGNMENT & PERFORMANCE ===
  app.post("/api/task-lists/:id/assign", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const listId = Number(req.params.id);
      const { assignedTo, department, date } = req.body;
      if (!department || !date) {
        return res.status(400).json({ message: "department and date are required" });
      }

      const assigner = req.appUser;
      const assignerName = assigner?.firstName || assigner?.username || "Manager";

      const existingList = await storage.getTaskList(listId);
      if (!existingList) return res.status(404).json({ message: "List not found" });

      const list = await storage.assignTaskList(listId, assignedTo || null, assigner?.id || "unknown", department, date);
      if (!list) return res.status(500).json({ message: "Failed to assign list" });

      const fullList = await storage.getTaskList(listId);
      const itemCount = fullList?.items?.length || 0;

      if (assignedTo) {
        try {
          await storage.sendMessage({
            senderId: assigner?.id || "system",
            subject: `Task List Assigned: ${list.title}`,
            body: `${assignerName} assigned you a task list "${list.title}" with ${itemCount} item${itemCount !== 1 ? 's' : ''} for ${date} (${department} department).\n\nOpen your task list: /tasks/assigned/${listId}`,
            priority: "normal",
            requiresAck: false,
            targetType: "individual",
            targetValue: assignedTo,
          }, [assignedTo]);

          sendPushToUser(assignedTo, {
            title: "Task List Assigned",
            body: `"${list.title}" - ${itemCount} tasks for ${date}`,
            url: `/tasks/assigned/${listId}`,
          });
        } catch (e) {
          // Message send failure shouldn't block assignment
        }
      }

      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/task-list-items/:id/start", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const itemId = Number(req.params.id);
      const allLists = await storage.getTaskLists();
      const ownerList = allLists.find(l => l.assignedTo === user.id);
      if (!ownerList && user.role !== "owner" && user.role !== "manager") {
        return res.status(403).json({ message: "Not authorized to start this task" });
      }
      const item = await storage.startTaskItem(itemId, user.id);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/task-list-items/:id/complete", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const itemId = Number(req.params.id);
      const allLists = await storage.getTaskLists();
      const ownerList = allLists.find(l => l.assignedTo === user.id);
      if (!ownerList && user.role !== "owner" && user.role !== "manager") {
        return res.status(403).json({ message: "Not authorized to complete this task" });
      }
      const item = await storage.completeTaskItem(itemId, user.id);

      const today = new Date().toISOString().split("T")[0];
      let clockInTime: Date | null = null;
      try {
        const entries = await storage.getTimeEntries(user.id, today, today);
        if (entries.length > 0) {
          clockInTime = entries[entries.length - 1].clockIn;
        }
      } catch (e) {}

      const startedAt = item.startedAt || item.completedAt!;
      const durationMinutes = item.completedAt && item.startedAt
        ? (item.completedAt.getTime() - item.startedAt.getTime()) / 60000
        : null;

      try {
        await storage.createPerformanceLog({
          userId: user.id,
          taskListId: item.listId,
          taskListItemId: item.id,
          recipeId: item.recipeId || null,
          recipeSessionId: req.body.recipeSessionId || null,
          clockInTime,
          taskStartedAt: startedAt,
          taskCompletedAt: item.completedAt,
          durationMinutes,
          date: today,
        });
      } catch (e) {}

      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/task-lists/:id/rollover", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const listId = Number(req.params.id);
      const list = await storage.getTaskList(listId);
      if (!list) return res.status(404).json({ message: "List not found" });
      if ((list as any).status === "rolled_over") {
        return res.status(400).json({ message: "This list has already been rolled over" });
      }
      const department = (list as any).department || req.body.department || "bakery";
      const todos = await storage.rolloverUncompletedItems(listId, department);
      res.json({ rolledOver: todos.length, items: todos });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/department-todos/:department", isAuthenticated, async (req, res) => {
    try {
      const todos = await storage.getDepartmentTodos(req.params.department);
      res.json(todos);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/department-todos/:id/complete", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const todo = await storage.completeDepartmentTodo(Number(req.params.id), user.id);
      res.json(todo);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/performance/user/:userId", isAuthenticated, isManager, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const metrics = await storage.getPerformanceMetrics(req.params.userId, days);
      res.json(metrics);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/performance/team-average/:recipeId", isAuthenticated, async (req, res) => {
    try {
      const avg = await storage.getTeamAverageForRecipe(Number(req.params.recipeId));
      res.json({ recipeId: Number(req.params.recipeId), averageMinutes: avg });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === DIRECT MESSAGES (Inbox) ===
  app.get("/api/messages/inbox", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const messages = await storage.getInboxMessages(user.id);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/messages/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const count = await storage.getUnreadCount(user.id);
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/messages/urgent-unread", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const allInbox = await storage.getInboxMessages(user.id);
      const urgent = allInbox.filter(m =>
        m.priority === "urgent" &&
        m.requiresAck &&
        !m.recipient.acknowledged
      );
      res.json({ count: urgent.length, messages: urgent });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/messages/sent", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const messages = await storage.getSentMessagesWithRecipients(user.id);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/messages", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { subject, body, priority, requiresAck, targetType, targetValue, recipientIds } = req.body;
      if (!subject || !body) return res.status(400).json({ message: "Subject and body are required" });

      let resolvedRecipientIds: string[] = [];

      if (targetType === "individual" && recipientIds?.length) {
        resolvedRecipientIds = recipientIds;
      } else if (targetType === "role" && targetValue) {
        const allUsers = await authStorage.getAllUsers();
        resolvedRecipientIds = allUsers.filter(u => u.role === targetValue && u.id !== user.id).map(u => u.id);
      } else if (targetType === "department" && targetValue) {
        const today = new Date().toISOString().split("T")[0];
        const todayShifts = await storage.getShifts(today, today);
        const userIdsInDept = Array.from(new Set(todayShifts.filter(s => s.department === targetValue).map(s => s.userId)));
        resolvedRecipientIds = userIdsInDept.filter(id => id !== user.id);
      } else if (targetType === "everyone") {
        const allUsers = await authStorage.getAllUsers();
        resolvedRecipientIds = allUsers.filter(u => u.id !== user.id).map(u => u.id);
      } else {
        return res.status(400).json({ message: "Invalid target type or missing recipients" });
      }

      if (resolvedRecipientIds.length === 0) {
        return res.status(400).json({ message: "No recipients found" });
      }

      const message = await storage.sendMessage({
        senderId: user.id,
        subject,
        body,
        priority: priority || "normal",
        requiresAck: requiresAck || false,
        targetType: targetType || "individual",
        targetValue: targetValue || null,
      }, resolvedRecipientIds);

      const senderName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Manager";
      sendPushToUsers(resolvedRecipientIds, {
        title: priority === "urgent" ? `Urgent: ${subject}` : subject,
        body: `From ${senderName}: ${body.slice(0, 100)}${body.length > 100 ? "..." : ""}`,
        tag: `msg-${message.id}`,
        url: "/",
      }).catch(err => console.error("[Push] Error sending message notification:", err));

      res.json(message);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/messages/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await storage.markMessageRead(Number(req.params.id), user.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/messages/:id/acknowledge", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await storage.acknowledgeMessage(Number(req.params.id), user.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/messages/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await storage.deleteMessageForUser(Number(req.params.id), user.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/messages/:id/pin", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const pinned = await storage.togglePinMessage(Number(req.params.id), user.id);
      res.json({ pinned });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/messages/:id/archive", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await storage.archiveMessage(Number(req.params.id), user.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/messages/:id/unarchive", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await storage.unarchiveMessage(Number(req.params.id), user.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/messages/:id/replies", isAuthenticated, async (req: any, res) => {
    try {
      const replies = await storage.getMessageReplies(Number(req.params.id));
      res.json(replies);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/messages/:id/reply", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { body } = req.body;
      if (!body) return res.status(400).json({ message: "Reply body is required" });
      const parentId = Number(req.params.id);
      const parent = await db.select().from(directMessages).where(eq(directMessages.id, parentId));
      if (parent.length === 0) return res.status(404).json({ message: "Parent message not found" });
      const reply = await storage.sendMessage({
        senderId: user.id,
        subject: `Re: ${parent[0].subject}`,
        body,
        priority: "normal",
        requiresAck: false,
        targetType: parent[0].targetType,
        targetValue: parent[0].targetValue,
        parentMessageId: parentId,
      }, [parent[0].senderId]);
      res.json(reply);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const reactions = await storage.getReactionsForMessages([Number(req.params.id)]);
      res.json(reactions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ message: "Emoji is required" });
      const reaction = await storage.addReaction(Number(req.params.id), user.id, emoji);
      res.json(reaction);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ message: "Emoji is required" });
      await storage.removeReaction(Number(req.params.id), user.id, emoji);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/messages/search", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const q = (req.query.q as string) || "";
      if (!q.trim()) return res.json([]);
      const results = await storage.searchMessages(user.id, q.trim());
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/messages/archived", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const messages = await storage.getInboxMessages(user.id, true);
      const archived = messages.filter(m => m.recipient.archived);
      res.json(archived);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PUSH NOTIFICATIONS ===
  app.post("/api/push/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { endpoint, keys, deviceLabel } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }
      const sub = await storage.createPushSubscription({
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        deviceLabel: deviceLabel || null,
        isActive: true,
      });
      res.json(sub);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/push/unsubscribe", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ message: "Endpoint required" });
      await storage.deletePushSubscription(endpoint, user.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/push/status", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const subs = await storage.getPushSubscriptions(user.id);
      res.json({ enabled: subs.length > 0, devices: subs });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/push/test", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await sendPushToUser(user.id, {
        title: "Jarvis",
        body: "Push notifications are working!",
        tag: "test",
        url: "/",
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === USER NAMES (lightweight, for display purposes) ===
  app.get("/api/user-names", isAuthenticated, async (req: any, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
      }).from(users);
      const nameMap: Record<string, string> = {};
      for (const u of allUsers) {
        nameMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "Unknown";
      }
      res.json(nameMap);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === LAMINATION DOUGHS ===
  app.get("/api/lamination/active", isAuthenticated, async (req: any, res) => {
    try {
      const doughs = await storage.getActiveLaminationDoughs();
      res.json(doughs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/lamination/:date", isAuthenticated, async (req: any, res) => {
    try {
      const doughs = await storage.getLaminationDoughs(req.params.date);
      res.json(doughs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/lamination", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const schema = z.object({ doughType: z.string().min(1) });
      const parsed = schema.parse(req.body);
      const today = new Date().toISOString().split("T")[0];
      const maxNumber = await storage.getMaxDoughNumber();
      const dough = await storage.createLaminationDough({
        date: today,
        doughType: parsed.doughType,
        doughNumber: maxNumber + 1,
        status: "turning",
        createdBy: user?.id || null,
        startedAt: new Date(),
      });
      storage.clearAllBriefingCaches().catch(() => {});
      res.json(dough);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/lamination/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const schema = z.object({
        doughType: z.string().optional(),
        turn1Fold: z.string().optional(),
        turn2Fold: z.string().optional(),
        turn3Fold: z.string().nullable().optional(),
        foldSequence: z.string().optional(),
        foldSubtype: z.string().nullable().optional(),
        status: z.enum(["turning", "resting", "completed", "proofing", "frozen", "baked", "chilling", "fridge", "trashed"]).optional(),
        restStartedAt: z.string().nullable().optional(),
        pastryType: z.string().optional(),
        totalPieces: z.number().int().positive().optional(),
        completedAt: z.string().nullable().optional(),
        finalRestAt: z.string().nullable().optional(),
        openedBy: z.string().nullable().optional(),
        openedAt: z.string().nullable().optional(),
        shapedBy: z.string().nullable().optional(),
        shapedAt: z.string().nullable().optional(),
        destination: z.enum(["proof", "freezer", "fridge"]).nullable().optional(),
        proofStartedAt: z.string().nullable().optional(),
        proofPieces: z.number().int().positive().optional(),
        bakedAt: z.string().nullable().optional(),
        bakedBy: z.string().nullable().optional(),
        intendedPastry: z.string().nullable().optional(),
        chillingUntil: z.string().nullable().optional(),
        shapings: z.array(z.object({ pastryType: z.string(), pieces: z.number().int().positive() })).nullable().optional(),
        trashReason: z.string().nullable().optional(),
        trashedAt: z.string().nullable().optional(),
        trashedBy: z.string().nullable().optional(),
        roomTempAt: z.string().nullable().optional(),
        roomTempReturnedAt: z.string().nullable().optional(),
        adjustedProofStartedAt: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const updates: Record<string, any> = { ...parsed };
      if (parsed.restStartedAt) updates.restStartedAt = new Date(parsed.restStartedAt);
      if (parsed.completedAt) updates.completedAt = new Date(parsed.completedAt);
      if (parsed.finalRestAt) updates.finalRestAt = new Date(parsed.finalRestAt);
      if (parsed.openedAt) updates.openedAt = new Date(parsed.openedAt);
      if (parsed.shapedAt) updates.shapedAt = new Date(parsed.shapedAt);
      if (parsed.proofStartedAt) updates.proofStartedAt = new Date(parsed.proofStartedAt);
      if (parsed.bakedAt) updates.bakedAt = new Date(parsed.bakedAt);
      if (parsed.chillingUntil) updates.chillingUntil = new Date(parsed.chillingUntil);
      if (parsed.trashedAt) updates.trashedAt = new Date(parsed.trashedAt);
      if (parsed.roomTempAt) updates.roomTempAt = new Date(parsed.roomTempAt);
      if (parsed.roomTempReturnedAt) updates.roomTempReturnedAt = new Date(parsed.roomTempReturnedAt);
      if (parsed.adjustedProofStartedAt) updates.adjustedProofStartedAt = new Date(parsed.adjustedProofStartedAt);
      const dough = await storage.updateLaminationDough(id, updates);
      storage.clearAllBriefingCaches().catch(() => {});
      res.json(dough);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/lamination/:id/split", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const id = parseInt(req.params.id);
      const schema = z.object({
        proofPieces: z.number().int().positive(),
        freezerPieces: z.number().int().positive(),
        shapings: z.array(z.object({
          pastryType: z.string(),
          pieces: z.number().int().positive(),
          weightPerPieceG: z.number().optional(),
        })),
        doughWeightG: z.number().nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const dough = await storage.getLaminationDoughById(id);
      if (!dough) return res.status(404).json({ message: "Dough not found" });

      const now = new Date();
      const totalPieces = parsed.proofPieces + parsed.freezerPieces;
      const allPastryNames = parsed.shapings.map((e: any) => e.pastryType).join(", ");
      const primaryPastry = parsed.shapings[0]?.pastryType || dough.doughType;

      const proofDough = await storage.updateLaminationDough(id, {
        pastryType: primaryPastry,
        totalPieces: parsed.proofPieces,
        proofPieces: parsed.proofPieces,
        shapedBy: user?.id || null,
        shapedAt: now,
        shapings: parsed.shapings,
        doughWeightG: parsed.doughWeightG ?? null,
        status: "proofing",
        destination: "proof",
        proofStartedAt: now,
      });

      const maxNumber = await storage.getMaxDoughNumber();

      const freezerDough = await storage.createLaminationDough({
        date: dough.date,
        doughType: dough.doughType,
        doughNumber: maxNumber + 1,
        turn1Fold: dough.turn1Fold,
        turn2Fold: dough.turn2Fold,
        foldSequence: dough.foldSequence,
        foldSubtype: dough.foldSubtype,
        status: "frozen",
        createdBy: dough.createdBy,
        startedAt: dough.startedAt,
        openedBy: dough.openedBy,
        openedAt: dough.openedAt,
        shapedBy: user?.id || null,
        shapedAt: now,
        pastryType: primaryPastry,
        totalPieces: parsed.freezerPieces,
        proofPieces: parsed.freezerPieces,
        destination: "freezer",
        shapings: parsed.shapings,
        doughWeightG: parsed.doughWeightG ?? null,
        intendedPastry: dough.intendedPastry,
      });

      storage.clearAllBriefingCaches().catch(() => {});
      res.json({ proofDough, freezerDough });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/lamination/:id/bake", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const id = parseInt(req.params.id);
      const dough = await storage.getLaminationDoughById(id);
      if (!dough) return res.status(404).json({ message: "Dough not found" });
      if (dough.status !== "proofing") return res.status(400).json({ message: "Dough is not in the proof box" });

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      const h = hours % 12 || 12;
      const bakedAtTime = `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;

      const shapings = dough.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }> | null;
      if (shapings && shapings.length > 0) {
        for (const shaping of shapings) {
          await storage.createBakeoffLog({
            date: today,
            itemName: shaping.pastryType,
            quantity: shaping.pieces || 1,
            bakedAt: bakedAtTime,
            locationId: null,
          });
          const pid = await storage.resolvePastryItemId(shaping.pastryType);
          createOvenTimersForItem(shaping.pastryType, pid, user?.id || null).catch(() => {});
        }
      } else {
        const itemName = dough.pastryType || dough.doughType;
        await storage.createBakeoffLog({
          date: today,
          itemName,
          quantity: dough.proofPieces || dough.totalPieces || 1,
          bakedAt: bakedAtTime,
          locationId: null,
        });
        const pastryItemId = await storage.resolvePastryItemId(itemName);
        createOvenTimersForItem(itemName, pastryItemId, user?.id || null).catch(() => {});
      }

      const updated = await storage.updateLaminationDough(id, {
        status: "baked",
        bakedAt: now,
        bakedBy: user?.id || null,
      });
      storage.clearAllBriefingCaches().catch(() => {});

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/lamination/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteLaminationDough(id);
      storage.clearAllBriefingCaches().catch(() => {});
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PASTRY ITEMS (Master List) ===
  app.get("/api/pastry-items", isAuthenticated, async (req: any, res) => {
    try {
      const doughType = req.query.doughType as string | undefined;
      const items = await storage.getPastryItems(doughType);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pastry-items", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        doughType: z.string().min(1),
        department: z.string().optional(),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      const item = await storage.createPastryItem(data);
      res.json(item);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/pastry-items/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const schema = z.object({
        name: z.string().min(1).optional(),
        doughType: z.string().min(1).optional(),
        department: z.string().optional(),
        isActive: z.boolean().optional(),
      });
      const updates = schema.parse(req.body);
      const item = await storage.updatePastryItem(id, updates);
      res.json(item);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/pastry-items/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePastryItem(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === DOUGH TYPE CONFIGS ===
  app.get("/api/dough-type-configs", isAuthenticated, async (req: any, res) => {
    try {
      const configs = await storage.getDoughTypeConfigs();
      res.json(configs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/dough-type-configs", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const schema = z.object({
        doughType: z.string().min(1),
        fatRatio: z.number().min(0).max(1).nullable().optional(),
        fatInventoryItemId: z.number().nullable().optional(),
        fatDescription: z.string().nullable().optional(),
        baseDoughWeightG: z.number().min(0).nullable().optional(),
      });
      const data = schema.parse(req.body);
      const config = await storage.upsertDoughTypeConfig(data);
      res.json(config);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  // === COST ENGINE ===
  app.get("/api/recipes/:id/cost", isAuthenticated, async (req: any, res) => {
    try {
      const { calculateRecipeCost } = await import("./cost-engine");
      const id = parseInt(req.params.id);
      const result = await calculateRecipeCost(id);
      if (!result) return res.status(404).json({ message: "Recipe not found" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/pastry-items/costs", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { calculateAllPastryCosts } = await import("./cost-engine");
      const result = await calculateAllPastryCosts();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/pastry-items/:id/cost", isAuthenticated, async (req: any, res) => {
    try {
      const { calculatePastryCost } = await import("./cost-engine");
      const id = parseInt(req.params.id);
      const result = await calculatePastryCost(id);
      if (!result) return res.status(404).json({ message: "Pastry item not found" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PERSONALIZED HOME ===
  app.get("/api/home", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      if (user.demoMode) {
        const { DEMO_PRODUCTION, DEMO_SCHEDULES, DEMO_STATS } = await import("./demo-data");
        const today = new Date().toISOString().split("T")[0];
        const bakeoffSummary: Record<string, number> = {};
        DEMO_PRODUCTION.forEach(p => { bakeoffSummary[p.itemName] = (bakeoffSummary[p.itemName] || 0) + p.quantity; });
        const demoShifts = DEMO_SCHEDULES.map((s, i) => ({
          id: 9000 + i, userId: s.userId, shiftDate: today, startTime: s.startTime, endTime: s.endTime,
          department: s.department, role: s.role, userName: s.userName,
        }));
        return res.json({
          unreadCount: 2,
          myUpcomingShifts: demoShifts.slice(0, 2),
          pendingTimeOff: [],
          bakeoffSummary,
          pinnedAnnouncements: [{ id: 1, title: "Welcome to Jarvis!", body: "This is a demo of the bakery management system. Explore the sidebar to see all features.", pinned: true, createdAt: new Date().toISOString() }],
          managerData: {
            pendingTimeOffCount: 1,
            todayStaffCount: DEMO_STATS.teamOnShift,
            todayShiftCount: DEMO_SCHEDULES.length,
          },
          myTaggedEvents: [],
          myEventJobs: [],
        });
      }

      const today = new Date().toISOString().split("T")[0];
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      const numericUserId = typeof user.id === "string" ? parseInt(user.id, 10) : user.id;

      const [
        unreadCount,
        myShifts,
        timeOffReqs,
        bakeoffToday,
        recentAnnouncements,
        myTaggedEvents,
        myEventJobs,
      ] = await Promise.all([
        storage.getUnreadCount(user.id),
        storage.getShifts(today, weekEndStr),
        storage.getTimeOffRequests(user.id),
        storage.getBakeoffLogs(today),
        storage.getAnnouncements(),
        !isNaN(numericUserId) ? storage.getEventsForUser(numericUserId) : Promise.resolve([]),
        !isNaN(numericUserId) ? storage.getJobsForUser(numericUserId) : Promise.resolve([]),
      ]);

      const myUpcomingShifts = myShifts
        .filter(s => s.userId === user.id)
        .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate) || a.startTime.localeCompare(b.startTime));

      const pendingTimeOff = timeOffReqs.filter(r => r.status === "pending");

      const bakeoffSummary: Record<string, number> = {};
      bakeoffToday.forEach(log => {
        bakeoffSummary[log.itemName] = (bakeoffSummary[log.itemName] || 0) + log.quantity;
      });

      const pinnedAnnouncements = recentAnnouncements.filter(a => a.pinned).slice(0, 3);

      let managerData: any = null;
      if (user.role === "manager" || user.role === "owner") {
        const allTimeOff = await storage.getTimeOffRequests();
        const pendingRequests = allTimeOff.filter(r => r.status === "pending");
        const todayAllShifts = await storage.getShifts(today, today);
        managerData = {
          pendingTimeOffCount: pendingRequests.length,
          todayStaffCount: Array.from(new Set(todayAllShifts.map(s => s.userId))).length,
          todayShiftCount: todayAllShifts.length,
        };
      }

      res.json({
        unreadCount,
        myUpcomingShifts,
        pendingTimeOff,
        bakeoffSummary,
        pinnedAnnouncements,
        managerData,
        myTaggedEvents,
        myEventJobs,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === TIME CARD / CLOCK IN-OUT ===
  app.get("/api/time/active", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const entry = await storage.getActiveTimeEntry(user.id);
      res.json(entry || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/time/clock-in", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const entry = await storage.clockIn(user.id, "web");
      res.status(201).json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/time/clock-out", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const active = await storage.getActiveTimeEntry(user.id);
      if (!active) return res.status(400).json({ message: "Not clocked in" });
      const entry = await storage.clockOut(active.id);
      res.json(entry);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/time/break/start", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const active = await storage.getActiveTimeEntry(user.id);
      if (!active) return res.status(400).json({ message: "Not clocked in" });
      const breakEntry = await storage.startBreak(active.id);
      res.status(201).json(breakEntry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/time/break/end", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const active = await storage.getActiveTimeEntry(user.id);
      if (!active) return res.status(400).json({ message: "Not clocked in" });
      const activeBreak = await storage.getActiveBreak(active.id);
      if (!activeBreak) return res.status(400).json({ message: "Not on break" });
      const breakEntry = await storage.endBreak(activeBreak.id);
      res.json(breakEntry);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/time/mine", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { startDate, endDate } = req.query;
      const entries = await storage.getTimeEntries(user.id, startDate as string, endDate as string);
      res.json(entries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/time/team", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      const entries = await storage.getAllTimeEntries(startDate as string, endDate as string);
      res.json(entries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/time/:id/request-adjustment", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { clockIn, clockOut, note } = req.body;
      if (!clockIn || !note) return res.status(400).json({ message: "Clock in time and note are required" });
      const entry = await storage.requestTimeAdjustment(
        Number(req.params.id),
        new Date(clockIn),
        clockOut ? new Date(clockOut) : null,
        note
      );
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/time/:id/review", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { approved, reviewNote } = req.body;
      const entry = await storage.reviewTimeAdjustment(
        Number(req.params.id),
        user.id,
        approved,
        reviewNote
      );
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/time/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const updates: any = {};
      if (req.body.clockIn) updates.clockIn = new Date(req.body.clockIn);
      if (req.body.clockOut) updates.clockOut = new Date(req.body.clockOut);
      if (req.body.notes !== undefined) updates.notes = req.body.notes;
      if (req.body.status) updates.status = req.body.status;
      const entry = await storage.updateTimeEntry(Number(req.params.id), updates);
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === BAGEL BROS ===
  let bagelBrosAlertActive = false;
  let bagelBrosAlertType: string | null = null;

  app.get("/api/bagel-bros/session", isAuthenticated, async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const session = await storage.getOrCreateBagelSession(today);
      const loads = await storage.getOvenLoads(session.id);
      res.json({ session, loads });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bagel-bros/dump-board", isAuthenticated, async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const session = await storage.getOrCreateBagelSession(today);
      const updated = await storage.addToTrough(session.id, 20);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bagel-bros/load-oven", isAuthenticated, async (req, res) => {
    try {
      const { bagelType, deckNumber, bagelCount, durationSeconds } = req.body;
      if (!bagelType || !deckNumber) return res.status(400).json({ message: "bagelType and deckNumber are required" });
      const today = new Date().toISOString().split("T")[0];
      const session = await storage.getOrCreateBagelSession(today);
      const load = await storage.createOvenLoad({
        sessionId: session.id,
        deckNumber,
        bagelType,
        bagelCount: bagelCount || 20,
        durationSeconds: durationSeconds || 1080,
        status: "baking",
      });
      await storage.resetDrainTable(session.id);
      res.json(load);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bagel-bros/finish-bake/:id", isAuthenticated, async (req, res) => {
    try {
      const load = await storage.finishOvenLoad(Number(req.params.id));
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();
      const bakedAt = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      await storage.createBakeoffLog({
        date: today,
        itemName: `Bagel - ${load.bagelType.charAt(0).toUpperCase() + load.bagelType.slice(1)}`,
        quantity: load.bagelCount,
        bakedAt,
      });
      res.json({ success: true, load });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bagel-bros/send-alert", isAuthenticated, async (req, res) => {
    bagelBrosAlertActive = true;
    bagelBrosAlertType = req.body?.alertType || "general";
    res.json({ success: true });
  });

  app.get("/api/bagel-bros/alert", isAuthenticated, async (_req, res) => {
    res.json({ active: bagelBrosAlertActive, alertType: bagelBrosAlertType });
  });

  app.post("/api/bagel-bros/dismiss-alert", isAuthenticated, async (_req, res) => {
    bagelBrosAlertActive = false;
    bagelBrosAlertType = null;
    res.json({ success: true });
  });

  // === LOBBY CHECK ===
  app.get("/api/lobby-check/settings", isAuthenticated, async (req: any, res) => {
    try {
      const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
      const settings = await storage.getLobbyCheckSettings(locationId);
      res.json(settings || { enabled: false, frequencyMinutes: 30, businessHoursStart: "06:00", businessHoursEnd: "18:00", targetScreens: ["/platform"] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/lobby-check/settings", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { enabled, frequencyMinutes, businessHoursStart, businessHoursEnd, locationId, targetScreens } = req.body;
      const freq = Number(frequencyMinutes);
      if (!freq || freq < 5 || freq > 480) return res.status(400).json({ message: "Frequency must be between 5 and 480 minutes" });
      const settings = await storage.upsertLobbyCheckSettings({
        enabled: !!enabled,
        frequencyMinutes: freq,
        businessHoursStart: businessHoursStart || "06:00",
        businessHoursEnd: businessHoursEnd || "18:00",
        targetScreens: Array.isArray(targetScreens) ? targetScreens : ["/platform"],
        locationId: locationId || null,
        updatedBy: user?.id || null,
      });
      res.json(settings);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/lobby-check/logs", isAuthenticated, async (req: any, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
      const logs = await storage.getLobbyCheckLogs(date, locationId);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/lobby-check/clear", async (req: any, res) => {
    try {
      const { pin, scheduledAt, locationId } = req.body;
      if (!pin || !scheduledAt) return res.status(400).json({ message: "PIN and scheduledAt are required" });
      const bcrypt = await import("bcryptjs");
      const allUsers = await db.select().from(users);
      let matchedUser = null;
      for (const u of allUsers) {
        if (u.pinHash && await bcrypt.compare(pin, u.pinHash)) {
          matchedUser = u;
          break;
        }
      }
      if (!matchedUser) return res.status(401).json({ message: "Invalid PIN" });
      if (matchedUser.locked) return res.status(403).json({ message: "Account locked" });
      const today = new Date().toISOString().split("T")[0];
      const log = await storage.createLobbyCheckLog({
        scheduledAt,
        clearedBy: matchedUser.id,
        clearedByName: matchedUser.displayName || matchedUser.username || "Unknown",
        date: today,
        locationId: locationId || null,
      });
      res.json({ success: true, log, userName: matchedUser.displayName || matchedUser.username });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === KIOSK CLOCK-IN (PIN-based, no session required) ===
  app.post("/api/kiosk/clock-in", async (req: any, res) => {
    try {
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ message: "PIN is required" });
      const bcrypt = await import("bcryptjs");
      const allUsers = await db.select().from(users);
      let matchedUser = null;
      for (const u of allUsers) {
        if (u.pinHash && await bcrypt.compare(pin, u.pinHash)) {
          matchedUser = u;
          break;
        }
      }
      if (!matchedUser) return res.status(401).json({ message: "Invalid PIN" });
      if (matchedUser.locked) return res.status(403).json({ message: "Account locked" });

      const activeEntry = await storage.getActiveTimeEntry(matchedUser.id);
      let action: string;
      let entry;
      if (activeEntry) {
        entry = await storage.clockOut(activeEntry.id);
        action = "clock-out";
      } else {
        entry = await storage.clockIn(matchedUser.id, "kiosk");
        action = "clock-in";
      }
      res.json({
        action,
        entry,
        user: {
          id: matchedUser.id,
          firstName: matchedUser.firstName,
          lastName: matchedUser.lastName,
          username: matchedUser.username,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === ADMIN INSIGHTS (Owner Only) ===
  app.post("/api/activity", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser;
      const { action, metadata } = req.body;
      if (!action) return res.status(400).json({ message: "Action required" });
      await storage.logActivity({ userId: user.id, action, metadata: metadata || null });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/messages", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const messages = await storage.getAllMessages();
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/login-activity", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const activity = await storage.getLoginActivity(days);
      res.json(activity);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/feature-usage", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const usage = await storage.getFeatureUsage(days);
      res.json(usage);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/summary", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const summary = await storage.getInsightsSummary(days);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/activity-trends", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const trends = await storage.getActivityTrends(days);
      res.json(trends);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/user-activity", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const stats = await storage.getUserActivityStats(days);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/production", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const production = await storage.getProductionInsights(days);
      res.json(production);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/lamination", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const lamination = await storage.getLaminationInsights(days);
      res.json(lamination);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/heatmap", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const heatmap = await storage.getHourlyHeatmap(days);
      res.json(heatmap);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/user-drilldown/:userId", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const drilldown = await storage.getUserDrilldown(req.params.userId, days);
      res.json(drilldown);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/bagel-production", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const data = await storage.getBagelInsights();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/summary-comparison", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const comparison = await storage.getInsightsSummaryWithComparison(days);
      res.json(comparison);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/insights/sales-vs-production", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const data = await storage.getSalesVsProduction(days);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === KPI REPORT ENDPOINTS ===
  app.get("/api/admin/insights/kpi-report", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - days);

      const startDateStr = startDate.toISOString().split("T")[0];
      const prevStartDateStr = prevStartDate.toISOString().split("T")[0];
      const endDateStr = now.toISOString().split("T")[0];

      // 1. Sales data from Square
      const allSales = await db.select().from(squareSales).where(gte(squareSales.date, startDateStr));
      const currentSales = allSales.filter(s => s.date >= startDateStr && s.date <= endDateStr);
      const prevSales = await db.select().from(squareSales).where(and(gte(squareSales.date, prevStartDateStr), lt(squareSales.date, startDateStr)));

      const totalRevenue = currentSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
      const prevTotalRevenue = prevSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
      const totalItemsSold = currentSales.reduce((sum, s) => sum + s.quantitySold, 0);
      const prevTotalItemsSold = prevSales.reduce((sum, s) => sum + s.quantitySold, 0);

      // Sales by item
      const salesByItem = new Map<string, { qty: number; revenue: number }>();
      for (const s of currentSales) {
        const existing = salesByItem.get(s.itemName) || { qty: 0, revenue: 0 };
        existing.qty += s.quantitySold;
        existing.revenue += s.revenue || 0;
        salesByItem.set(s.itemName, existing);
      }

      // Daily revenue
      const dailyRevenue = new Map<string, number>();
      for (const s of currentSales) {
        dailyRevenue.set(s.date, (dailyRevenue.get(s.date) || 0) + (s.revenue || 0));
      }
      const revenueTrend = Array.from(dailyRevenue.entries())
        .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Order counts from square_daily_summary for accurate avg transaction value
      const { getSquareDailySummaries } = await import("./square");
      const currentDailySummaries = await getSquareDailySummaries(startDateStr, endDateStr);
      const prevDailySummaries = await getSquareDailySummaries(prevStartDateStr, startDateStr);
      const totalOrderCount = currentDailySummaries.reduce((sum, s) => sum + (s.orderCount || 0), 0);
      const prevTotalOrderCount = prevDailySummaries.reduce((sum, s) => sum + (s.orderCount || 0), 0);

      // 2. Labor data from time entries
      const allTimeEntries = await db.select().from(timeEntries).where(
        and(gte(timeEntries.clockIn, startDate), isNotNull(timeEntries.clockOut))
      );
      const prevTimeEntries = await db.select().from(timeEntries).where(
        and(gte(timeEntries.clockIn, prevStartDate), lt(timeEntries.clockIn, startDate), isNotNull(timeEntries.clockOut))
      );

      const allTeIds = [...allTimeEntries, ...prevTimeEntries].map(te => te.id);
      const allBreaks = allTeIds.length > 0
        ? await db.select().from(breakEntries).where(inArray(breakEntries.timeEntryId, allTeIds))
        : [];

      const breaksByEntry = new Map<number, number>();
      for (const b of allBreaks) {
        if (b.startAt && b.endAt) {
          const breakMs = new Date(b.endAt).getTime() - new Date(b.startAt).getTime();
          breaksByEntry.set(b.timeEntryId, (breaksByEntry.get(b.timeEntryId) || 0) + breakMs);
        }
      }

      const allUsers = await db.select().from(users);
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      let totalLaborHours = 0;
      let totalLaborCost = 0;
      const laborByUser = new Map<string, { hours: number; cost: number; shifts: number }>();

      const salariedOwnerIds = new Set(
        allUsers.filter(u => u.role === "owner" && u.payType === "salary" && u.annualSalary).map(u => u.id)
      );

      const VALID_MIN_TS = new Date("2020-01-01").getTime();
      const VALID_MAX_TS = new Date("2030-12-31").getTime();
      const isValidTimeEntry = (te: any): boolean => {
        const inMs = new Date(te.clockIn).getTime();
        if (isNaN(inMs) || inMs < VALID_MIN_TS || inMs > VALID_MAX_TS) return false;
        if (te.clockOut) {
          const outMs = new Date(te.clockOut).getTime();
          if (isNaN(outMs) || outMs < VALID_MIN_TS || outMs > VALID_MAX_TS) return false;
          if (outMs - inMs > 24 * 60 * 60 * 1000) return false;
        }
        return true;
      };

      for (const te of allTimeEntries) {
        if (!te.clockOut) continue;
        if (!isValidTimeEntry(te)) continue;
        const msWorked = new Date(te.clockOut).getTime() - new Date(te.clockIn).getTime();
        const breakMs = breaksByEntry.get(te.id) || 0;
        const netMs = Math.max(0, msWorked - breakMs);
        const hours = netMs / (1000 * 60 * 60);
        totalLaborHours += hours;

        const user = userMap.get(te.userId);
        const isSalariedOwner = salariedOwnerIds.has(te.userId);
        const rate = isSalariedOwner ? 0 : (user?.hourlyRate || 0);
        const cost = hours * rate;
        totalLaborCost += cost;

        const existing = laborByUser.get(te.userId) || { hours: 0, cost: 0, shifts: 0 };
        existing.hours += hours;
        existing.cost += cost;
        existing.shifts += 1;
        laborByUser.set(te.userId, existing);
      }

      // Previous period labor (with break subtraction)
      let prevLaborCost = 0;
      let prevLaborHours = 0;
      for (const te of prevTimeEntries) {
        if (!te.clockOut) continue;
        if (!isValidTimeEntry(te)) continue;
        const msWorked = new Date(te.clockOut).getTime() - new Date(te.clockIn).getTime();
        const breakMs = breaksByEntry.get(te.id) || 0;
        const netMs = Math.max(0, msWorked - breakMs);
        const hours = netMs / (1000 * 60 * 60);
        prevLaborHours += hours;
        const user = userMap.get(te.userId);
        const isSalariedOwner = salariedOwnerIds.has(te.userId);
        prevLaborCost += hours * (isSalariedOwner ? 0 : (user?.hourlyRate || 0));
      }

      for (const u of allUsers) {
        if (u.role === "owner" && u.payType === "salary" && u.annualSalary) {
          const ownerPeriodCost = (u.annualSalary / 365) * days;
          totalLaborCost += ownerPeriodCost;
          prevLaborCost += ownerPeriodCost;
        }
      }

      const laborCostPct = totalRevenue > 0 ? (totalLaborCost / totalRevenue) * 100 : 0;
      const prevLaborCostPct = prevTotalRevenue > 0 ? (prevLaborCost / prevTotalRevenue) * 100 : 0;
      const revenuePerLaborHour = totalLaborHours > 0 ? totalRevenue / totalLaborHours : 0;
      const prevRevenuePerLaborHour = prevLaborHours > 0 ? prevTotalRevenue / prevLaborHours : 0;

      // 3. Production data
      const allSessions = await db.select().from(recipeSessions).where(gte(recipeSessions.createdAt, startDate));
      const allBakeoffs = await db.select().from(bakeoffLogs).where(gte(bakeoffLogs.date, startDateStr));

      const productionByItem = new Map<string, number>();
      for (const session of allSessions) {
        const qty = session.unitQty || 1;
        productionByItem.set(session.recipeTitle, (productionByItem.get(session.recipeTitle) || 0) + qty);
      }
      for (const bakeoff of allBakeoffs) {
        productionByItem.set(bakeoff.itemName, (productionByItem.get(bakeoff.itemName) || 0) + bakeoff.quantity);
      }

      // Sales vs Production comparison
      const allItemNames = new Set([...Array.from(salesByItem.keys()), ...Array.from(productionByItem.keys())]);
      const salesVsProduction = Array.from(allItemNames).map(itemName => ({
        itemName,
        produced: productionByItem.get(itemName) || 0,
        sold: salesByItem.get(itemName)?.qty || 0,
        revenue: salesByItem.get(itemName)?.revenue || 0,
      })).sort((a, b) => b.sold - a.sold);

      // 4. Food Cost
      let totalFoodCost = 0;
      const foodCostItems: { itemName: string; unitCost: number | null; unitsProduced: number; totalCost: number | null; pctOfTotal?: number }[] = [];

      const allPastryItemsList = await db.select().from(pastryItems);
      const pastryCosts = await calculateAllPastryCosts();

      for (const pi of allPastryItemsList) {
        const produced = productionByItem.get(pi.name) || 0;
        const costData = pastryCosts[pi.id];
        const unitCost = costData?.totalCost || null;
        const itemTotalCost = unitCost != null && produced > 0 ? unitCost * produced : null;
        if (itemTotalCost != null) totalFoodCost += itemTotalCost;
        if (produced > 0 || unitCost != null) {
          foodCostItems.push({ itemName: pi.name, unitCost, unitsProduced: produced, totalCost: itemTotalCost });
        }
      }

      for (const item of foodCostItems) {
        item.pctOfTotal = totalFoodCost > 0 && item.totalCost != null ? (item.totalCost / totalFoodCost) * 100 : 0;
      }

      const foodCostPct = totalRevenue > 0 ? (totalFoodCost / totalRevenue) * 100 : 0;

      // 5. Waste tracking
      const trashedDoughs = await db.select().from(laminationDoughs).where(
        and(isNotNull(laminationDoughs.trashedAt), gte(laminationDoughs.trashedAt, startDate))
      );

      const wasteReasons = new Map<string, number>();
      for (const d of trashedDoughs) {
        const reason = d.trashReason || "Unknown";
        wasteReasons.set(reason, (wasteReasons.get(reason) || 0) + 1);
      }

      let totalScrapG = 0;
      const shapedDoughs = await db.select().from(laminationDoughs).where(
        and(isNotNull(laminationDoughs.shapedAt), gte(laminationDoughs.createdAt, startDate))
      );
      for (const d of shapedDoughs) {
        if (d.doughWeightG && d.shapings) {
          const shapings = d.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>;
          const usedWeight = shapings.reduce((sum, s) => sum + (s.pieces * (s.weightPerPieceG || 0)), 0);
          if (usedWeight > 0 && d.doughWeightG > usedWeight) {
            totalScrapG += d.doughWeightG - usedWeight;
          }
        }
      }

      // 6. Average transaction value (total revenue / order count from daily summaries)
      const avgTransactionValue = totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0;
      const prevAvgTransactionValue = prevTotalOrderCount > 0 ? prevTotalRevenue / prevTotalOrderCount : 0;

      // 7. Peak hour analysis (from sales date timestamps — approximate by bucketing sales)
      // Since we only have daily aggregated sales, we use clock-in times for staffing
      const clockInByHour = new Array(24).fill(0);
      for (const te of allTimeEntries) {
        const hour = new Date(te.clockIn).getHours();
        clockInByHour[hour]++;
      }

      const peakHours = clockInByHour.map((count, hour) => ({
        hour,
        staffingLevel: count,
        label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'AM' : 'PM'}`,
      }));

      // Helper for % change
      const pctChange = (current: number, previous: number) =>
        previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : current > 0 ? 100 : 0;

      res.json({
        period: { days, startDate: startDateStr, endDate: endDateStr },
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalRevenueChange: pctChange(totalRevenue, prevTotalRevenue),
          totalLaborCost: Math.round(totalLaborCost * 100) / 100,
          totalLaborCostChange: pctChange(totalLaborCost, prevLaborCost),
          laborCostPct: Math.round(laborCostPct * 10) / 10,
          laborCostPctChange: pctChange(laborCostPct, prevLaborCostPct),
          foodCostPct: Math.round(foodCostPct * 10) / 10,
          totalFoodCost: Math.round(totalFoodCost * 100) / 100,
          revenuePerLaborHour: Math.round(revenuePerLaborHour * 100) / 100,
          revenuePerLaborHourChange: pctChange(revenuePerLaborHour, prevRevenuePerLaborHour),
          avgTransactionValue: Math.round(avgTransactionValue * 100) / 100,
          avgTransactionValueChange: pctChange(avgTransactionValue, prevAvgTransactionValue),
          totalLaborHours: Math.round(totalLaborHours * 10) / 10,
        },
        salesVsProduction,
        foodCost: {
          totalFoodCost: Math.round(totalFoodCost * 100) / 100,
          foodCostPct: Math.round(foodCostPct * 10) / 10,
          items: foodCostItems.sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0)),
        },
        waste: {
          totalTrashed: trashedDoughs.length,
          reasons: Array.from(wasteReasons.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
          totalScrapG: Math.round(totalScrapG),
          shapedDoughCount: shapedDoughs.length,
        },
        peakHours,
        revenueTrend,
      });
    } catch (err: any) {
      console.error("KPI report error:", err);
      res.status(500).json({ message: err.message || "Failed to generate KPI report" });
    }
  });

  app.get("/api/admin/insights/kpi-labor-detail", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);

      const entries = await db.select().from(timeEntries).where(
        and(gte(timeEntries.clockIn, startDate), isNotNull(timeEntries.clockOut))
      );

      const entryIds = entries.map(te => te.id);
      const allBreaks = entryIds.length > 0
        ? await db.select().from(breakEntries).where(inArray(breakEntries.timeEntryId, entryIds))
        : [];

      const breaksByEntry = new Map<number, number>();
      for (const b of allBreaks) {
        if (b.startAt && b.endAt) {
          const breakMs = new Date(b.endAt).getTime() - new Date(b.startAt).getTime();
          breaksByEntry.set(b.timeEntryId, (breaksByEntry.get(b.timeEntryId) || 0) + breakMs);
        }
      }

      const allUsers = await db.select().from(users);
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      // Get total revenue for revenue-per-hour calc
      const startDateStr = startDate.toISOString().split("T")[0];
      const salesInPeriod = await db.select().from(squareSales).where(gte(squareSales.date, startDateStr));
      const totalRevenue = salesInPeriod.reduce((sum, s) => sum + (s.revenue || 0), 0);

      const laborByUser = new Map<string, { hours: number; cost: number; shifts: number }>();
      const salariedOwnerIds = new Set(
        allUsers.filter(u => u.role === "owner" && u.payType === "salary" && u.annualSalary).map(u => u.id)
      );

      const VALID_MIN = new Date("2020-01-01").getTime();
      const VALID_MAX = new Date("2030-12-31").getTime();
      for (const te of entries) {
        if (!te.clockOut) continue;
        const ciMs = new Date(te.clockIn).getTime();
        const coMs = new Date(te.clockOut).getTime();
        if (isNaN(ciMs) || isNaN(coMs) || ciMs < VALID_MIN || ciMs > VALID_MAX || coMs < VALID_MIN || coMs > VALID_MAX) continue;
        if (coMs - ciMs > 24 * 60 * 60 * 1000) continue;
        const msWorked = coMs - ciMs;
        const breakMs = breaksByEntry.get(te.id) || 0;
        const netMs = Math.max(0, msWorked - breakMs);
        const hours = netMs / (1000 * 60 * 60);

        const existing = laborByUser.get(te.userId) || { hours: 0, cost: 0, shifts: 0 };
        const user = userMap.get(te.userId);
        const isSalariedOwner = salariedOwnerIds.has(te.userId);
        const rate = isSalariedOwner ? 0 : (user?.hourlyRate || 0);
        existing.hours += hours;
        existing.cost += hours * rate;
        existing.shifts += 1;
        laborByUser.set(te.userId, existing);
      }

      const totalHours = Array.from(laborByUser.values()).reduce((sum, l) => sum + l.hours, 0);

      const employees = Array.from(laborByUser.entries()).map(([userId, data]) => {
        const user = userMap.get(userId);
        return {
          userId,
          firstName: user?.firstName || null,
          lastName: user?.lastName || null,
          username: user?.username || null,
          role: user?.role || null,
          hourlyRate: user?.hourlyRate || null,
          annualSalary: null as number | null,
          periodSalary: null as number | null,
          payType: (user?.payType || "hourly") as string,
          hoursWorked: Math.round(data.hours * 100) / 100,
          totalCost: Math.round(data.cost * 100) / 100,
          shifts: data.shifts,
          revenuePerHour: data.hours > 0 ? Math.round((totalRevenue / totalHours) * data.hours / data.hours * 100) / 100 : 0,
          isOwner: user?.role === "owner",
        };
      });

      for (const u of allUsers) {
        if (u.role === "owner" && u.payType === "salary" && u.annualSalary) {
          const existing = employees.find(e => e.userId === u.id);
          const periodSalary = Math.round((u.annualSalary / 365) * days * 100) / 100;
          if (existing) {
            existing.totalCost += periodSalary;
            existing.totalCost = Math.round(existing.totalCost * 100) / 100;
            existing.annualSalary = u.annualSalary;
            existing.periodSalary = periodSalary;
            existing.payType = "salary";
          } else {
            employees.push({
              userId: u.id,
              firstName: u.firstName || null,
              lastName: u.lastName || null,
              username: u.username || null,
              role: u.role,
              hourlyRate: null,
              annualSalary: u.annualSalary,
              periodSalary,
              payType: "salary",
              hoursWorked: 0,
              totalCost: periodSalary,
              shifts: 0,
              revenuePerHour: 0,
              isOwner: true,
            });
          }
        }
      }

      employees.sort((a, b) => b.totalCost - a.totalCost);

      const totalCost = employees.reduce((sum, e) => sum + e.totalCost, 0);

      res.json({
        period: { days, startDate: startDateStr },
        totalHours: Math.round(totalHours * 10) / 10,
        totalCost: Math.round(totalCost * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        revenuePerLaborHour: totalHours > 0 ? Math.round((totalRevenue / totalHours) * 100) / 100 : 0,
        employees,
      });
    } catch (err: any) {
      console.error("KPI labor detail error:", err);
      res.status(500).json({ message: err.message || "Failed to generate labor detail" });
    }
  });

  app.get("/api/admin/insights/kpi-production-detail", isAuthenticated, isOwner, async (req, res) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split("T")[0];

      // Production from recipe sessions
      const sessions = await db.select().from(recipeSessions).where(gte(recipeSessions.createdAt, startDate));
      // Production from bakeoff logs
      const bakeoffs = await db.select().from(bakeoffLogs).where(gte(bakeoffLogs.date, startDateStr));
      // Sales
      const sales = await db.select().from(squareSales).where(gte(squareSales.date, startDateStr));

      const productionByItem = new Map<string, { produced: number; sessions: number }>();
      for (const session of sessions) {
        const qty = session.unitQty || 1;
        const existing = productionByItem.get(session.recipeTitle) || { produced: 0, sessions: 0 };
        existing.produced += qty;
        existing.sessions += 1;
        productionByItem.set(session.recipeTitle, existing);
      }
      for (const bakeoff of bakeoffs) {
        const existing = productionByItem.get(bakeoff.itemName) || { produced: 0, sessions: 0 };
        existing.produced += bakeoff.quantity;
        existing.sessions += 1;
        productionByItem.set(bakeoff.itemName, existing);
      }

      const salesByItem = new Map<string, { qty: number; revenue: number }>();
      for (const s of sales) {
        const existing = salesByItem.get(s.itemName) || { qty: 0, revenue: 0 };
        existing.qty += s.quantitySold;
        existing.revenue += s.revenue || 0;
        salesByItem.set(s.itemName, existing);
      }

      // COGS per item
      const pastryCosts = await calculateAllPastryCosts();
      const allPastryItemsList = await db.select().from(pastryItems);
      const pastryNameToCost = new Map<string, number | null>();
      for (const pi of allPastryItemsList) {
        const costData = pastryCosts[pi.id];
        pastryNameToCost.set(pi.name, costData?.totalCost || null);
      }

      const allItemNames = new Set([...Array.from(productionByItem.keys()), ...Array.from(salesByItem.keys())]);
      const items = Array.from(allItemNames).map(itemName => {
        const prod = productionByItem.get(itemName) || { produced: 0, sessions: 0 };
        const sale = salesByItem.get(itemName) || { qty: 0, revenue: 0 };
        const unitCost = pastryNameToCost.get(itemName) || null;
        const variance = prod.produced - sale.qty;

        return {
          itemName,
          produced: prod.produced,
          sessions: prod.sessions,
          sold: sale.qty,
          revenue: Math.round(sale.revenue * 100) / 100,
          unitCost,
          totalCost: unitCost != null ? Math.round(unitCost * prod.produced * 100) / 100 : null,
          variance,
          variancePct: prod.produced > 0 ? Math.round((variance / prod.produced) * 1000) / 10 : 0,
        };
      }).sort((a, b) => b.sold - a.sold);

      res.json({
        period: { days, startDate: startDateStr },
        items,
        totals: {
          totalProduced: items.reduce((sum, i) => sum + i.produced, 0),
          totalSold: items.reduce((sum, i) => sum + i.sold, 0),
          totalRevenue: Math.round(items.reduce((sum, i) => sum + i.revenue, 0) * 100) / 100,
          totalCost: Math.round(items.filter(i => i.totalCost != null).reduce((sum, i) => sum + (i.totalCost || 0), 0) * 100) / 100,
        },
      });
    } catch (err: any) {
      console.error("KPI production detail error:", err);
      res.status(500).json({ message: err.message || "Failed to generate production detail" });
    }
  });

  // === JARVIS BRIEFING ===
  app.get("/api/settings/jarvis-intro-note", isAuthenticated, async (_req, res) => {
    try {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "jarvis_intro_note"));
      res.json({ value: row?.value || null });
    } catch (err: any) {
      res.json({ value: null });
    }
  });

  app.put("/api/settings/jarvis-intro-note", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { note } = req.body;
      const value = typeof note === "string" ? note.trim().slice(0, 500) : "";
      const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, "jarvis_intro_note"));
      if (existing) {
        await db.update(appSettings).set({ value }).where(eq(appSettings.key, "jarvis_intro_note"));
      } else {
        await db.insert(appSettings).values({ key: "jarvis_intro_note", value });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  interface GreetingResponse {
    greeting: string | null;
    enabled: boolean;
    weather: { temp: number; feelsLike: number; description: string; humidity: number; windSpeed: number; icon: string; location: string } | null;
    traffic: { duration: string; durationInTraffic: string; distance: string; summary: string } | null;
    error?: string;
  }
  const greetingCache = new Map<string, { data: GreetingResponse; fetchedAt: number }>();
  const GREETING_CACHE_TTL = 20 * 60 * 1000;
  const briefingSuppressedMode = new Map<string, boolean>();

  app.post("/api/user/dismiss-jarvis-intro", isAuthenticated, async (req: any, res) => {
    try {
      await db.update(users).set({ seenJarvisIntro: true }).where(eq(users.id, req.appUser.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/user/interests-collected", isAuthenticated, async (req: any, res) => {
    try {
      const { interests, personalizedGreetingsEnabled, skipped } = req.body;
      const updates: Partial<typeof users.$inferInsert> = {
        interestsCollected: true,
      };
      if (skipped) {
        updates.interests = [];
        updates.personalizedGreetingsEnabled = false;
      } else if (Array.isArray(interests)) {
        updates.interests = interests
          .filter((i: unknown) => typeof i === "string")
          .map((i: string) => i.trim())
          .filter((i: string) => i.length > 0 && i.length <= 100)
          .slice(0, 50);
        updates.personalizedGreetingsEnabled = !!personalizedGreetingsEnabled;
      }
      await db.update(users).set(updates).where(eq(users.id, req.appUser.id));
      greetingCache.delete(req.appUser.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  const weatherCache = new Map<string, { data: any; fetchedAt: number }>();
  const WEATHER_CACHE_TTL = 15 * 60 * 1000;

  async function fetchWeather(location: string): Promise<any> {
    const cached = weatherCache.get(location);
    if (cached && Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL) {
      return cached.data;
    }
    try {
      const apiKey = process.env.OPENWEATHERMAP_API_KEY;
      if (!apiKey) return null;
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=imperial&appid=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      const result = {
        temp: Math.round(data.main?.temp || 0),
        feelsLike: Math.round(data.main?.feels_like || 0),
        description: data.weather?.[0]?.description || "unknown",
        icon: data.weather?.[0]?.icon || "01d",
        humidity: data.main?.humidity || 0,
        windSpeed: Math.round(data.wind?.speed || 0),
        location: location,
      };
      weatherCache.set(location, { data: result, fetchedAt: Date.now() });
      return result;
    } catch (e) {
      console.error("[Weather] Error fetching weather:", e);
      return null;
    }
  }

  const trafficCache = new Map<string, { data: any; fetchedAt: number }>();
  const TRAFFIC_CACHE_TTL = 10 * 60 * 1000;

  async function fetchTraffic(origin: string, destination: string): Promise<any> {
    const cacheKey = `${origin}|${destination}`;
    const cached = trafficCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < TRAFFIC_CACHE_TTL) {
      return cached.data;
    }
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return null;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&departure_time=now&traffic_model=best_guess&key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.routes || data.routes.length === 0) return null;
      const leg = data.routes[0].legs[0];
      const result = {
        duration: leg.duration?.text || "unknown",
        durationInTraffic: leg.duration_in_traffic?.text || leg.duration?.text || "unknown",
        distance: leg.distance?.text || "unknown",
        summary: data.routes[0].summary || "",
      };
      trafficCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
      return result;
    } catch (e) {
      console.error("[Traffic] Error fetching traffic:", e);
      return null;
    }
  }

  app.delete("/api/user/greeting-cache", isAuthenticated, async (req: any, res) => {
    greetingCache.delete(req.appUser.id);
    res.json({ success: true });
  });

  app.get("/api/user/greeting", isAuthenticated, async (req: any, res) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.appUser.id));
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!user.personalizedGreetingsEnabled) {
        return res.json({ greeting: null, enabled: false });
      }

      const cachedGreeting = greetingCache.get(user.id);
      if (cachedGreeting && Date.now() - cachedGreeting.fetchedAt < GREETING_CACHE_TTL) {
        return res.json(cachedGreeting.data);
      }

      const interests: string[] = (user.interests as string[]) || [];

      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const todaySchedule = await db.select({
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        department: shifts.department,
        position: shifts.position,
        locationId: shifts.locationId,
      }).from(shifts).where(and(eq(shifts.userId, user.id), eq(shifts.shiftDate, todayStr)));

      let workLocation = "Saratoga Springs, NY";
      let workLocationName = "Saratoga Springs";
      if (todaySchedule.length > 0) {
        try {
          const shiftLocationId = todaySchedule[0].locationId;
          if (shiftLocationId) {
            const [shiftLocation] = await db.select().from(locations).where(eq(locations.id, shiftLocationId));
            if (shiftLocation) {
              workLocationName = shiftLocation.name;
              if (shiftLocation.address) {
                workLocation = shiftLocation.address;
              } else {
                workLocation = shiftLocation.name;
              }
            }
          } else {
            const allLocations = await storage.getLocations();
            const defaultLoc = allLocations.find(l => l.isDefault) || allLocations[0];
            if (defaultLoc) {
              workLocationName = defaultLoc.name;
              if (defaultLoc.address) {
                workLocation = defaultLoc.address;
              } else {
                workLocation = defaultLoc.name;
              }
            }
          }
        } catch {}
      }

      const weather = await fetchWeather(workLocation);
      const traffic = await fetchTraffic("Saratoga Springs, NY", workLocation);

      const etNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      const hour = etNow.getHours();
      let timeOfDay = "morning";
      if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
      else if (hour >= 17) timeOfDay = "evening";

      const contextLines: string[] = [];
      contextLines.push(`Time of day: Good ${timeOfDay}`);

      if (weather) {
        contextLines.push(`Weather at ${weather.location}: ${weather.temp}°F (feels like ${weather.feelsLike}°F), ${weather.description}, humidity ${weather.humidity}%, wind ${weather.windSpeed} mph`);
      }

      if (traffic && traffic.durationInTraffic !== "unknown") {
        contextLines.push(`Commute to work: ${traffic.durationInTraffic} (${traffic.distance}) via ${traffic.summary}`);
      }

      if (todaySchedule.length > 0) {
        contextLines.push("Today's shifts: " + todaySchedule.map(s =>
          `${s.startTime}-${s.endTime} (${s.department}${s.position ? `, ${s.position}` : ""})`
        ).join("; "));
      } else {
        contextLines.push("No shift scheduled today");
      }

      if (interests.length > 0) {
        contextLines.push(`Personal interests: ${interests.join(", ")}`);
      }

      const OpenAI = (await import("openai")).default;
      const greetingAI = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Generate a brief informative greeting (1-2 sentences) for a team member.

RULES:
- Start with "Good ${timeOfDay}, [name]." then provide a quick weather or commute summary
- Be warm but DECLARATIVE — state facts, do NOT ask questions or try to start a conversation. There is no reply box.
- If weather data is provided, state the conditions concisely (e.g. "It's 45°F and cloudy out there — layer up.")
- If traffic data is provided, mention it only if notable (delays, longer than usual)
- If the person has interests listed, you may include ONE brief relevant factual tidbit — but keep it informative, not a question
- NEVER ask questions. NEVER use phrases like "Have you tried...?" or "What do you think about...?"
- NEVER invent data not provided
- Keep it concise and useful — this is a quick status line, not a conversation starter`;

      const userPrompt = `Team member: ${user.firstName || "Team Member"}
${contextLines.join("\n")}

Generate a warm, personalized greeting.`;

      const completion = await withRetry(() => greetingAI.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.8,
      }), "personalized-greeting");

      const greeting = completion.choices[0]?.message?.content || null;

      const responseData = {
        greeting,
        enabled: true,
        weather: weather || null,
        traffic: traffic || null,
      };
      greetingCache.set(user.id, { data: responseData, fetchedAt: Date.now() });
      res.json(responseData);
    } catch (err: any) {
      console.error("Personalized greeting error:", err);
      res.json({ greeting: null, enabled: true, error: "Failed to generate greeting" });
    }
  });

  app.get("/api/home/jarvis-briefing", isAuthenticated, async (req: any, res) => {
    try {
      const context = await storage.getJarvisBriefingContext(req.appUser.id);

      if (!context.user.showJarvisBriefing && req.query.force !== "true") {
        return res.json({ briefingText: null, showWelcome: false, welcomeMessage: null, disabled: true });
      }

      const suppressGreeting = req.query.suppressGreeting === "true";

      const now = new Date();
      const cacheAge = context.user.lastBriefingAt ? (now.getTime() - new Date(context.user.lastBriefingAt).getTime()) / 1000 / 60 : Infinity;

      const cachedText = context.user.lastBriefingText;
      const lastSuppressedMode = briefingSuppressedMode.get(req.appUser.id);
      const cacheCompatible = lastSuppressedMode === undefined || lastSuppressedMode === suppressGreeting;

      if (cacheAge < 30 && cachedText && req.query.refresh !== "true" && cacheCompatible) {
        const hasWelcome = !!context.user.jarvisWelcomeMessage;
        return res.json({
          briefingText: cachedText,
          showWelcome: hasWelcome,
          welcomeMessage: hasWelcome ? context.user.jarvisWelcomeMessage : null,
          disabled: false,
        });
      }

      const hour = now.getHours();
      let timeOfDay = "morning";
      if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
      else if (hour >= 17) timeOfDay = "evening";

      const { bakeryState, shiftContext } = context;
      const focus = context.user.briefingFocus || "all";
      const stateLines: string[] = [];

      const includeBOH = focus === "all" || focus === "boh" || focus === "management";
      const includeFOH = focus === "all" || focus === "foh" || focus === "management";
      const includeManagement = focus === "management" || context.user.role === "owner" || context.user.role === "manager";

      if (shiftContext.hasShiftToday && bakeryState.todaySchedule.length > 0) {
        if (shiftContext.shiftStartsLater && shiftContext.upcomingShiftTime) {
          stateLines.push(`You're on the schedule today — your next shift starts at ${shiftContext.upcomingShiftTime}`);
        } else {
          stateLines.push("You're on the schedule today: " + bakeryState.todaySchedule
            .map(s => `${s.startTime}-${s.endTime} (${s.department}${s.position ? `, ${s.position}` : ""})`)
            .join("; "));
        }
      } else if (!shiftContext.hasShiftToday) {
        stateLines.push("No shift scheduled for you today");
      }

      if (shiftContext.daysSinceLastShift !== null && shiftContext.daysSinceLastShift >= 4) {
        stateLines.push(`WELCOME BACK — it's been ${shiftContext.daysSinceLastShift} days since your last shift`);
      }

      if (shiftContext.consecutiveDaysWorked >= 13) {
        stateLines.push(`WELLNESS ALERT: ${shiftContext.consecutiveDaysWorked} consecutive days worked — they deserve a rest day. Encourage hydration, stretching, and taking time to recharge.`);
      } else if (shiftContext.consecutiveDaysWorked >= 7) {
        stateLines.push(`${shiftContext.consecutiveDaysWorked} consecutive days worked — that's a solid stretch`);
      } else if (shiftContext.consecutiveDaysWorked >= 4) {
        stateLines.push(`${shiftContext.consecutiveDaysWorked} days in a row on the schedule`);
      }

      if (includeBOH) {
        if (bakeryState.proofingDoughs > 0) stateLines.push(`${bakeryState.proofingDoughs} dough(s) proofing`);
        if (bakeryState.restingDoughs > 0) stateLines.push(`${bakeryState.restingDoughs} dough(s) resting on the rack`);
        if (bakeryState.chillingDoughs > 0) stateLines.push(`${bakeryState.chillingDoughs} dough(s) chilling between turns`);
        if (bakeryState.frozenDoughs > 0) stateLines.push(`${bakeryState.frozenDoughs} shaped dough(s) in the freezer`);
        if (bakeryState.fridgeDoughs > 0) stateLines.push(`${bakeryState.fridgeDoughs} dough(s) in the fridge`);
        if (bakeryState.todayProductionLogs > 0) stateLines.push(`${bakeryState.todayProductionLogs} production log(s) today`);
        if (bakeryState.todayRecipeSessions > 0) stateLines.push(`${bakeryState.todayRecipeSessions} recipe session(s) today`);

        if (bakeryState.activeDoughDetails.length > 0) {
          stateLines.push("Active doughs: " + bakeryState.activeDoughDetails
            .map(d => `#${d.doughNumber} ${d.doughType} (${d.status}${d.intendedPastry ? `, for ${d.intendedPastry}` : ""})`)
            .join(", "));
        }
      }

      if (includeFOH || includeBOH) {
        if (bakeryState.pastryGoals.length > 0) {
          stateLines.push("Today's pastry goals: " + bakeryState.pastryGoals
            .map(g => `${g.itemName}: ${g.targetCount} target${g.forecastedCount ? ` (forecast: ${g.forecastedCount})` : ""}`)
            .join(", "));
        }
      }

      if (bakeryState.unreadMessages > 0) stateLines.push(`${bakeryState.unreadMessages} unread message(s)`);

      if (includeManagement) {
        if (bakeryState.pendingTimeOffRequests > 0) {
          stateLines.push(`${bakeryState.pendingTimeOffRequests} pending time-off request(s) to review`);
        }
      }

      if (context.user.role === "owner") {
        try {
          const today = new Date();
          const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
          const monthEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()}`;
          const firmSummary = await storage.getFirmSummary(monthStart, monthEnd);
          const firmObligations = await storage.getFirmObligations();

          if (firmSummary.squareRevenue > 0 || firmSummary.invoiceExpenseTotal > 0 || firmSummary.laborCost > 0) {
            const rev = firmSummary.squareRevenue || 0;
            const exp = (firmSummary.invoiceExpenseTotal || 0) + (firmSummary.laborCost || 0) + (firmSummary.payrollTotal || 0);
            stateLines.push(`FINANCIAL: Month-to-date revenue $${rev.toFixed(0)}, expenses $${exp.toFixed(0)}, net ${rev - exp >= 0 ? "+" : ""}$${(rev - exp).toFixed(0)}`);
          }

          const overdueObs = firmObligations.filter(o => {
            if (!o.isActive || !o.nextPaymentDate) return false;
            return new Date(o.nextPaymentDate) < today;
          });
          if (overdueObs.length > 0) {
            stateLines.push(`FINANCIAL ALERT: ${overdueObs.length} overdue payment(s): ${overdueObs.map(o => o.name).join(", ")}`);
          }

          if (firmSummary.cashVarianceTotal && Math.abs(firmSummary.cashVarianceTotal) > 10) {
            stateLines.push(`CASH ALERT: Cash drawer variance this month: $${firmSummary.cashVarianceTotal.toFixed(2)}`);
          }
        } catch (e) {
          // Financial data unavailable, continue without it
        }
      }

      if (context.upcomingEvents && context.upcomingEvents.length > 0) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        const dayAfterStart = new Date(todayStart);
        dayAfterStart.setDate(dayAfterStart.getDate() + 2);

        const todayEvents = context.upcomingEvents.filter(e => {
          const d = new Date(e.date);
          return d >= todayStart && d < tomorrowStart;
        });
        const tomorrowEvents = context.upcomingEvents.filter(e => {
          const d = new Date(e.date);
          return d >= tomorrowStart && d < dayAfterStart;
        });

        if (todayEvents.length > 0) {
          stateLines.push("Calendar today: " + todayEvents.map(e =>
            `${e.title} (${e.eventType}${e.startTime ? ` at ${e.startTime}` : ""})`
          ).join(", "));
        }
        if (tomorrowEvents.length > 0) {
          stateLines.push("Coming up tomorrow: " + tomorrowEvents.map(e =>
            `${e.title} (${e.eventType}${e.startTime ? ` at ${e.startTime}` : ""})`
          ).join(", "));
        }
      }

      if ((context as any).prepEQ) {
        const peq = (context as any).prepEQ;
        if (peq.componentsBelowDemand?.length > 0) {
          stateLines.push("PREP ALERT — Components below today's demand: " + peq.componentsBelowDemand.map((c: any) => `${c.name} (have ${c.current}, need ${c.demand})`).join(", "));
        }
        if (peq.componentsBelowPar?.length > 0) {
          stateLines.push("Components below par level: " + peq.componentsBelowPar.map((c: any) => `${c.name} (${c.current}/${c.par})`).join(", "));
        }
        if (includeBOH) {
          if (peq.doughRecommendations?.length > 0) {
            stateLines.push("Dough prep needed for tomorrow: " + peq.doughRecommendations.map((r: any) => `${r.name}: ${r.doughsNeeded} dough${r.doughsNeeded > 1 ? "s" : ""} (${r.piecesPerDough} pcs/dough)`).join(", "));
          }
          if (peq.leadTimeItemsNeedingPrep?.length > 0) {
            stateLines.push("Lead-time items requiring prep today: " + peq.leadTimeItemsNeedingPrep.join(", "));
          }
        }
      }

      const todayDateStr = new Date().toLocaleDateString("en-CA");
      const briefingNotes = context.user.briefingNotes;
      const briefingNotesDate = context.user.briefingNotesDate;
      if (briefingNotes && briefingNotesDate === todayDateStr) {
        stateLines.push(`MANAGER NOTE FOR THIS PERSON — ${briefingNotes}`);
      } else if (briefingNotes && briefingNotesDate !== todayDateStr) {
        db.update(users).set({ briefingNotes: null, briefingNotesDate: null }).where(eq(users.id, req.appUser.id)).catch(() => {});
      }

      const focusLabels: Record<string, string> = {
        all: "all bakery operations",
        foh: "front-of-house (customer service, display cases, pastry availability, sales)",
        boh: "back-of-house (production, dough work, baking, recipes)",
        management: "management (team, scheduling, production AND sales metrics, time-off requests)",
      };
      const focusDescription = focusLabels[focus] || focusLabels.all;

      const greetingSuppressionRule = suppressGreeting
        ? `\n\nGREETING SUPPRESSION — The personalized weather/commute greeting is already being shown separately above this briefing. Do NOT open with "Good ${timeOfDay}, ${context.user.firstName}" or any time-of-day greeting. Instead, jump straight into the operational update with a natural bridge — for example: "Here's what's going on at the bakehouse..." or "Quick update for you —" or "On the ops side..." or just dive right into the bakery state. Keep your opening conversational but skip the greeting entirely.`
        : "";

      const systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Generate a brief, warm, personalized briefing (2-4 sentences max) for a team member opening the app. Be natural and conversational — like a trusted friend and teammate who genuinely cares about them. No bullet points, no lists, no "here's your briefing" phrasing.${greetingSuppressionRule}

STRICT RULE — ONLY STATE FACTS FROM THE DATA PROVIDED BELOW. Never invent, assume, or hallucinate information. If the data says 0 doughs proofing, do NOT mention doughs proofing. If no active doughs are listed, do NOT reference any doughs. If no production logs exist, do NOT claim there are any. Only mention items explicitly present in the bakery state data.

TONE — Be genuinely empathetic and supportive. You're not just relaying information — you're checking in on someone you care about. Notice what they've been doing, acknowledge their contributions, and make them feel valued. Use their name warmly. Small touches of personality make a big difference: a bit of humor, a kind observation, a word of genuine encouragement. You want them to feel seen.

SHIFT AWARENESS — Always weave the person's schedule into the greeting naturally:
- If they have a shift today that starts later: greet them and let them know what's going on before their shift.
- If they're currently on shift: acknowledge they're in the thick of it — maybe note how the day is shaping up.
- If they have no shift today: keep it light, warm, and maybe a little playful — enjoy the day off.
- If they haven't been on the schedule for 4+ days (WELCOME BACK flag): warmly welcome them back. Let them know they were missed and catch them up on what's happening.
- If they've worked 13+ consecutive days (WELLNESS ALERT flag): genuinely encourage them to take a day off. Be caring, not preachy — like a friend who notices they've been grinding too hard. Mention hydration, rest, or stretching naturally.
- If they've worked 7-12 consecutive days: acknowledge their dedication with sincere appreciation.

CALENDAR AWARENESS — If upcoming events are listed, naturally weave them in:
- Today's events: mention them as part of what's happening ("You've got a meeting at 2pm" or "Heads up on that delivery coming in")
- Tomorrow's events: give a gentle heads-up ("Tomorrow you've got..." or "Just so it's on your radar...")
- Keep event mentions brief and conversational, not a list.

This person's briefing focus is "${focus}" — they care about ${focusDescription}. Prioritize information relevant to their focus. Don't mention things outside their focus unless critical.

LAMINATION & DOUGH PRODUCTION — Lamination studio data, dough production details (proofing, resting, chilling, freezing, fridge counts, active doughs, production logs, recipe sessions, dough prep recommendations) are strictly bakery/BOH domain information. If this person's focus is "foh", do NOT reference any dough or lamination production data whatsoever — even if such data somehow appears in the state below. FOH staff should only hear about pastry availability and sales, never production mechanics.

FINANCIAL AWARENESS — If FINANCIAL data is provided (owner only):
- Briefly mention the month-to-date financial snapshot if numbers are meaningful
- If there are FINANCIAL ALERTs (overdue payments, cash variance), mention them naturally
- Keep financial references brief and encouraging — "The numbers are looking solid this month" or "Heads up, there's a payment that needs attention"
- Don't lecture about finances — just acknowledge the state

PREP EQ AWARENESS — If prep component data is provided:
- Mention any components below demand naturally ("Heads up, we're a little low on almond paste — might need a batch")
- For dough prep recommendations, mention how many doughs need mixing today for tomorrow
- Keep it actionable but casual, not alarming
- Lead-time items that need prep today deserve a gentle nudge

MANAGER NOTES — If a "MANAGER NOTE FOR THIS PERSON" appears in the data, it contains a direct instruction or message from their manager about what this person needs to do today. Weave this information into the briefing naturally and seamlessly — do NOT use bold text, special formatting, color changes, or call it out as a "manager note." Just work it into the greeting as if Jarvis naturally knows what they should focus on. For example, if the note says "Make brown butter cookies, special is a hit" — say something like "Oh, and heads up — the brown butter cookie special has been flying, so jump on a batch as soon as you're in."

WHEN NOTHING ELSE IS HAPPENING: If the bakery state shows little or no operational activity beyond the shift info, keep it short, warm, and genuinely uplifting — offer a kind thought, acknowledge something about them, or share a positive note about the day. Be real and human, like a teammate who wants them to have a good day.`;

      const userLang = (context.user as any).language || "en";
      const langInstruction = userLang === "fr" ? "\n\nIMPORTANT: Respond entirely in French. Use natural, warm French — not stiff formal French. Address them with 'tu' not 'vous'." : "";

      const timeInstruction = suppressGreeting
        ? `Time of day: ${timeOfDay} (DO NOT open with a time-of-day greeting — it's already shown above)`
        : `Time: Good ${timeOfDay}`;

      const userPrompt = `Team member: ${context.user.firstName} (role: ${context.user.role}, briefing focus: ${focus})
${timeInstruction}
Current bakery state data (ONLY reference items that appear here — do not invent anything):
${stateLines.join("\n")}

Generate a personalized, empathetic briefing for ${context.user.firstName}. Remember: only state facts from the data above. Make them feel noticed and valued.${langInstruction}`;

      const OpenAI = (await import("openai")).default;
      const briefingAI = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await withRetry(() => briefingAI.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 280,
        temperature: 0.7,
      }), "jarvis-briefing");

      const briefingText = completion.choices[0]?.message?.content || "Welcome back! Everything looks good at the bakehouse.";

      await storage.updateJarvisBriefingCache(req.appUser.id, briefingText);
      briefingSuppressedMode.set(req.appUser.id, suppressGreeting);

      const hasWelcome = !!context.user.jarvisWelcomeMessage;
      res.json({
        briefingText,
        showWelcome: hasWelcome,
        welcomeMessage: hasWelcome ? context.user.jarvisWelcomeMessage : null,
        disabled: false,
      });
    } catch (err: any) {
      console.error("Jarvis briefing error:", err);
      res.json({
        briefingText: "Welcome back! I'm having trouble getting your briefing right now, but everything should be running smoothly.",
        showWelcome: false,
        welcomeMessage: null,
        disabled: false,
      });
    }
  });

  app.post("/api/home/jarvis-briefing/seen", isAuthenticated, async (req: any, res) => {
    try {
      await storage.markJarvisBriefingSeen(req.appUser.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/home/jarvis-briefing/clear", isAuthenticated, async (req: any, res) => {
    try {
      await storage.clearBriefingCache(req.appUser.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/users/:userId/jarvis-settings", isAuthenticated, async (req: any, res) => {
    try {
      const { showJarvisBriefing } = req.body;
      if (typeof showJarvisBriefing === "boolean") {
        await storage.updateShowJarvisBriefing(req.appUser.id, showJarvisBriefing);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/users/:userId/welcome-message", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { message } = req.body;
      await storage.setJarvisWelcomeMessage(req.params.userId, message || null);
      await storage.clearBriefingCache(req.params.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/users/:userId/briefing-notes", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const schema = z.object({ notes: z.string().max(500).nullable() });
      const { notes } = schema.parse(req.body);
      const today = new Date().toLocaleDateString("en-CA");
      await db.update(users).set({
        briefingNotes: notes || null,
        briefingNotesDate: notes ? today : null,
      }).where(eq(users.id, req.params.userId));
      await storage.clearBriefingCache(req.params.userId);
      res.json({ success: true, date: today });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/users/:userId/briefing-focus", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { focus } = req.body;
      const validFocuses = ["all", "foh", "boh", "management"];
      if (!focus || !validFocuses.includes(focus)) {
        return res.status(400).json({ message: "Invalid focus. Must be one of: all, foh, boh, management" });
      }
      await storage.updateJarvisBriefingFocus(req.params.userId, focus);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === VENDORS ===
  app.get("/api/vendors", isAuthenticated, async (req: any, res) => {
    try {
      const allVendors = await storage.getVendors();
      res.json(allVendors);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/vendors/today-orders", isAuthenticated, async (req: any, res) => {
    try {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const today = days[new Date().getDay()];
      const todayVendors = await storage.getVendorsByOrderDay(today);
      res.json(todayVendors);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/vendors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const vendor = await storage.getVendor(parseInt(req.params.id));
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      res.json(vendor);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/vendors", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        contactName: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        orderDays: z.array(z.string()).optional(),
        notes: z.string().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const vendor = await storage.createVendor(data);
      res.json(vendor);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/vendors/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).optional(),
        contactName: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        orderDays: z.array(z.string()).optional(),
        notes: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      });
      const updates = schema.parse(req.body);
      const vendor = await storage.updateVendor(parseInt(req.params.id), updates);
      res.json(vendor);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/vendors/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      await storage.deleteVendor(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === VENDOR ITEMS ===
  app.get("/api/vendors/:id/items", isAuthenticated, async (req: any, res) => {
    try {
      const items = await storage.getVendorItems(parseInt(req.params.id));
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/vendors/:id/items", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const schema = z.object({
        inventoryItemId: z.number(),
        vendorSku: z.string().nullable().optional(),
        vendorDescription: z.string().nullable().optional(),
        preferredUnit: z.string().nullable().optional(),
        parLevel: z.number().nullable().optional(),
        orderUpToLevel: z.number().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const item = await storage.createVendorItem({ ...data, vendorId: parseInt(req.params.id) });
      res.json(item);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/vendor-items/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const schema = z.object({
        vendorSku: z.string().nullable().optional(),
        vendorDescription: z.string().nullable().optional(),
        preferredUnit: z.string().nullable().optional(),
        parLevel: z.number().nullable().optional(),
        orderUpToLevel: z.number().nullable().optional(),
      });
      const updates = schema.parse(req.body);
      const item = await storage.updateVendorItem(parseInt(req.params.id), updates);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/vendor-items/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      await storage.deleteVendorItem(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PURCHASE ORDERS ===
  app.get("/api/purchase-orders", isAuthenticated, async (req: any, res) => {
    try {
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
      const orders = await storage.getPurchaseOrders(vendorId);
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const order = await storage.getPurchaseOrder(parseInt(req.params.id));
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-orders/generate", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { vendorId } = z.object({ vendorId: z.number() }).parse(req.body);
      const vendor = await storage.getVendor(vendorId);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });

      const needsReorder = await storage.getItemsNeedingReorder(vendorId);

      const pendingLines = needsReorder.map(vi => {
        const orderUpTo = vi.orderUpToLevel ?? (vi.parLevel! * 1.5);
        const qty = Math.max(0, orderUpTo - vi.inventoryItem.onHand);
        return {
          inventoryItemId: vi.inventoryItemId,
          itemName: vi.vendorDescription || vi.inventoryItem.name,
          quantity: Math.ceil(qty * 100) / 100,
          unit: vi.preferredUnit || vi.inventoryItem.unit,
          currentOnHand: vi.inventoryItem.onHand,
          parLevel: vi.parLevel,
        };
      }).filter(l => l.quantity > 0);

      // Test Kitchen specials: add ingredients for upcoming finalized specials
      const vendorVendorItems = await storage.getVendorItems(vendorId);
      const vendorInventoryIds = new Set(vendorVendorItems.map((vi: any) => vi.inventoryItemId));
      const allSpecials = await storage.getTestKitchenItems({ status: "finalized" });
      const now = new Date();
      for (const special of allSpecials) {
        if (!special.startDate || !special.endDate || !special.anticipatedDailySales) continue;
        const leadDays = special.orderLeadDays ?? 5;
        const leadDate = new Date(special.startDate);
        leadDate.setDate(leadDate.getDate() - leadDays);
        if (now < leadDate || now > special.endDate) continue;

        const totalDays = Math.ceil((special.endDate.getTime() - special.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const totalUnits = special.anticipatedDailySales * totalDays;
        const yieldAmount = special.yieldAmount || 1;
        const batches = totalUnits / yieldAmount;
        const ingredients = (special.ingredients as any[]) || [];

        for (const ing of ingredients) {
          if (!ing.inventoryItemId || !vendorInventoryIds.has(ing.inventoryItemId)) continue;
          const existingLine = pendingLines.find(l => l.inventoryItemId === ing.inventoryItemId);
          const extraQty = Math.ceil((ing.quantity || 0) * batches * 100) / 100;
          if (existingLine) {
            existingLine.quantity += extraQty;
          } else {
            const vi = vendorVendorItems.find((v: any) => v.inventoryItemId === ing.inventoryItemId);
            pendingLines.push({
              inventoryItemId: ing.inventoryItemId,
              itemName: vi?.vendorDescription || ing.name,
              quantity: extraQty,
              unit: vi?.preferredUnit || ing.unit || "",
              currentOnHand: null as any,
              parLevel: null as any,
            });
          }
        }
      }

      if (pendingLines.length === 0) {
        return res.json({ message: "All items are above par level", order: null, itemCount: 0 });
      }

      const today = new Date().toISOString().split("T")[0];
      const order = await storage.createPurchaseOrder({
        vendorId,
        orderDate: today,
        status: "draft",
        generatedBy: req.user.id,
      });

      const lines = pendingLines.map(l => ({ ...l, purchaseOrderId: order.id }));
      const createdLines = await storage.createPurchaseOrderLines(lines);
      const fullOrder = await storage.getPurchaseOrder(order.id);
      res.json(fullOrder);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input" });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/purchase-orders/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const schema = z.object({
        status: z.string().optional(),
        notes: z.string().nullable().optional(),
        sentVia: z.string().nullable().optional(),
        sentAt: z.string().nullable().optional(),
      });
      const updates = schema.parse(req.body);
      const order = await storage.updatePurchaseOrder(parseInt(req.params.id), {
        ...updates,
        sentAt: updates.sentAt ? new Date(updates.sentAt) : undefined,
      } as any);
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-orders/:id/send-sms", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const order = await storage.getPurchaseOrder(parseInt(req.params.id));
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (!order.vendor.phone) return res.status(400).json({ message: "Vendor has no phone number" });

      let msg = `Order from Bear's Cup Bakehouse\nDate: ${order.orderDate}\n\n`;
      for (const line of order.lines) {
        msg += `• ${line.itemName}: ${line.quantity} ${line.unit}\n`;
      }
      if (order.notes) msg += `\nNotes: ${order.notes}`;
      msg += `\n\nPlease confirm receipt. Thank you!`;

      const sent = await sendSms(order.vendor.phone, msg);
      if (sent) {
        await storage.updatePurchaseOrder(order.id, { status: "sent", sentVia: "sms", sentAt: new Date() } as any);
        res.json({ success: true, message: "Order sent via SMS" });
      } else {
        res.json({ success: false, message: "SMS not configured or failed. Order saved as draft." });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === STARKADE ===
  app.get("/api/starkade/access", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const activeEntry = await storage.getActiveTimeEntry(req.appUser.id);
      if (activeEntry) {
        return res.json({ locked: true, message: "Starkade's closed — but Bear's Cup is open. Suit up and get back to work!" });
      }
      res.json({ locked: false, message: null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/starkade/games", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const games = await storage.getStarkadeGames();
      res.json(games);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/starkade/games/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const game = await storage.getStarkadeGameById(Number(req.params.id));
      if (!game) return res.status(404).json({ message: "Game not found" });
      res.json(game);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/starkade/games/:id/play", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const gameId = Number(req.params.id);
      const { score, points, metadata } = req.body;
      const session = await storage.createGameSession({
        gameId,
        userId: req.appUser.id,
        score: score || 0,
        points: points || 0,
        metadata: metadata || null,
      });
      await storage.incrementGamePlayCount(gameId);
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/starkade/leaderboard/global", isAuthenticated, async (req: any, res) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const leaderboard = await storage.getGlobalLeaderboard(limit);
      res.json(leaderboard);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/starkade/leaderboard/game/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const gameId = Number(req.params.id);
      const limit = Number(req.query.limit) || 10;
      const leaderboard = await storage.getGameLeaderboard(gameId, limit);
      res.json(leaderboard);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/starkade/recent", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sessions = await storage.getRecentGameSessions(userId);
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/starkade/games/generate", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ message: "Game idea is required" });
      }

      const OpenAI = (await import("openai")).default;
      const ai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await withRetry(() => ai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a game designer for "Starkade" — an arcade in a bakery app. Generate a playable game config from the user's idea.

You MUST respond with valid JSON only (no markdown, no code blocks). The JSON must match one of these types:

TYPE "quiz": { "type": "quiz", "name": "Game Name", "description": "Short description", "questions": [{ "question": "text", "options": ["A", "B", "C", "D"], "correctIndex": 0, "timeLimit": 15 }] } — Generate 8-12 questions. timeLimit is seconds per question.

TYPE "word": { "type": "word", "name": "Game Name", "description": "Short description", "words": [{ "word": "CROISSANT", "hint": "Flaky French pastry" }] } — Generate 8-12 words. Words should be single words, ALL CAPS.

TYPE "memory": { "type": "memory", "name": "Game Name", "description": "Short description", "pairs": [{ "id": "1", "content": "🥐", "match": "Croissant" }] } — Generate 8 pairs (16 cards). Use emoji + text pairs.

TYPE "reaction": { "type": "reaction", "name": "Game Name", "description": "Short description", "rounds": 10, "minDelay": 1000, "maxDelay": 4000, "targetEmoji": "🥐", "decoyEmojis": ["🍕", "🌮", "🍔"] } — Reaction speed game.

Make games bakery/food themed when possible but adapt to the user's idea. Be creative with names (fun, catchy). Keep it simple and playable.`
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }), "game-gen");

      const content = response.choices[0]?.message?.content || "";
      let gameConfig: any;
      try {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        gameConfig = JSON.parse(cleaned);
      } catch {
        return res.status(400).json({ message: "Jarvis couldn't generate a valid game from that idea. Try rephrasing it!" });
      }

      if (!gameConfig.type || !gameConfig.name) {
        return res.status(400).json({ message: "Generated game is missing required fields. Try again!" });
      }

      res.json(gameConfig);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/starkade/games/save", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { name, type, description, config } = req.body;
      if (!name || !type || !config) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const game = await storage.createStarkadeGame({
        name,
        type,
        source: "ai",
        status: "active",
        config,
        description: description || null,
        createdBy: req.appUser.id,
      });
      res.json(game);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/starkade/games/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      await storage.deleteStarkadeGame(Number(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/cleanup-orphan-shifts", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const allUsers = await authStorage.getAllUsers();
      const userIds = new Set(allUsers.map(u => u.id));
      const allShifts = await storage.getShifts("2020-01-01", "2030-12-31");
      const orphanShifts = allShifts.filter(s => !userIds.has(s.userId));
      for (const shift of orphanShifts) {
        await storage.deleteShift(shift.id);
      }
      res.json({ deleted: orphanShifts.length, orphanUserIds: [...new Set(orphanShifts.map(s => s.userId))] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notes", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const myNotes = await storage.getNotes(user.id);
      const sharedNotes = await storage.getSharedNotes(user.id);
      res.json({ myNotes, sharedNotes });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notes/collaborator-users", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const allUsers = await authStorage.getAllUsers();
      res.json(allUsers.map(u => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username, profileImageUrl: u.profileImageUrl })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notes/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const note = await storage.getNote(Number(req.params.id));
      if (!note) return res.status(404).json({ message: "Note not found" });
      const isCollaborator = note.sharedWith && Array.isArray(note.sharedWith) && note.sharedWith.includes(user.id);
      if (note.userId !== user.id && !note.isShared && !isCollaborator) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(note);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notes", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { title, content, isShared, isPinned } = req.body;
      if (!title || typeof title !== "string") return res.status(400).json({ message: "Title is required" });
      const note = await storage.createNote({
        title,
        content: content || "",
        isShared: isShared === true,
        isPinned: isPinned === true,
        userId: user.id,
      });
      res.json(note);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/notes/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const note = await storage.getNote(Number(req.params.id));
      if (!note) return res.status(404).json({ message: "Note not found" });
      const isOwner = note.userId === user.id;
      const isCollaborator = note.sharedWith && Array.isArray(note.sharedWith) && note.sharedWith.includes(user.id);
      if (!isOwner && !isCollaborator) return res.status(403).json({ message: "Access denied" });
      const allowedFields: Partial<{ title: string; content: string; isShared: boolean; isPinned: boolean; sharedWith: string[] }> = {};
      if (req.body.title !== undefined) allowedFields.title = String(req.body.title);
      if (req.body.content !== undefined) allowedFields.content = String(req.body.content);
      if (isOwner) {
        if (req.body.isShared !== undefined) allowedFields.isShared = req.body.isShared === true;
        if (req.body.isPinned !== undefined) allowedFields.isPinned = req.body.isPinned === true;
        if (req.body.sharedWith !== undefined) {
          const requestedIds: string[] = Array.isArray(req.body.sharedWith) ? req.body.sharedWith.filter((id: any) => typeof id === "string") : [];
          if (requestedIds.length > 0) {
            const validUsers = await authStorage.getAllUsers();
            const validIds = new Set(validUsers.map(u => u.id));
            allowedFields.sharedWith = requestedIds.filter(id => validIds.has(id) && id !== user.id);
          } else {
            allowedFields.sharedWith = [];
          }
        }
      }
      const updated = await storage.updateNote(Number(req.params.id), allowedFields);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/notes/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const note = await storage.getNote(Number(req.params.id));
      if (!note) return res.status(404).json({ message: "Note not found" });
      if (note.userId !== user.id) return res.status(403).json({ message: "Access denied" });
      await storage.deleteNote(Number(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notes/scribe", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { image } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ message: "An image is required" });
      }
      const base64Part = image.includes(",") ? image.split(",")[1] : image;
      const estimatedBytes = Math.round((base64Part.length * 3) / 4);
      if (estimatedBytes > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "Image is too large (over 10MB). Try taking the photo from a bit further away." });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const imageUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 4096,
        messages: [
          {
            role: "system",
            content: `You are Jarvis, an AI assistant for Bear's Cup Bakehouse. Your task is to transcribe handwritten or printed notes from the provided image into clean, readable text.

GUIDELINES:
- Preserve the original structure: bullet points, numbered lists, paragraph breaks, and headings.
- Fix obvious spelling errors but keep the author's intent, voice, and terminology.
- If there are drawings, diagrams, or arrows, describe them briefly in [brackets] (e.g., [arrow pointing right], [circle around "butter"]).
- If any text is illegible, mark it as [illegible] rather than guessing wildly.
- Do NOT add any commentary, summaries, or interpretation — just transcribe what is written.
- Return the result as a JSON object with two fields:
  { "title": "A short descriptive title based on the content (5 words max)", "content": "The full transcribed text" }`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe all the handwritten or printed text in this image." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }), "notes-scribe");

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(400).json({ message: "Could not read the image. Try a clearer photo with better lighting." });
      }

      let result;
      try {
        result = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(400).json({ message: "Could not transcribe the notes. Try a clearer, well-lit photo." });
        }
      }

      const title = result.title || "Scribed Note";
      const transcribed = result.content || "";
      if (!transcribed.trim()) {
        return res.status(400).json({ message: "No readable text found in the image. Make sure the writing is visible and the photo is well-lit." });
      }

      res.json({ title, content: transcribed });
    } catch (err: any) {
      console.error("Scribe error:", err);
      res.status(500).json({ message: "Failed to transcribe the image. Please try again with a clearer photo." });
    }
  });

  app.post("/api/notes/email-to-event", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { image } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ message: "An image is required" });
      }
      const base64Part = image.includes(",") ? image.split(",")[1] : image;
      const estimatedBytes = Math.round((base64Part.length * 3) / 4);
      if (estimatedBytes > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "Image is too large (over 10MB). Try a smaller screenshot." });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const imageUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

      const today = new Date().toISOString().split("T")[0];

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 4096,
        messages: [
          {
            role: "system",
            content: `You are Jarvis, an AI assistant for Bear's Cup Bakehouse. You are analyzing a screenshot of an email to extract event/meeting/order details for a calendar entry.

TODAY'S DATE: ${today}

Extract the following information from the email. If a field is not present, use null.
Return a JSON object with these fields:
{
  "title": "A concise event title summarizing the purpose (e.g., 'Catering Order - Johnson Wedding')",
  "description": "A summary of the email content including any relevant details, quantities, special requests, or notes",
  "date": "YYYY-MM-DD format. If a relative date like 'next Friday' is used, calculate from today's date",
  "startTime": "HH:MM in 24-hour format (e.g., '14:00') or null",
  "endTime": "HH:MM in 24-hour format or null",
  "eventType": "One of: meeting, delivery, deadline, event, schedule. Choose the most appropriate.",
  "contactName": "The sender's name or the contact person mentioned",
  "contactPhone": "Phone number if mentioned",
  "contactEmail": "Email address of the sender or contact",
  "address": "Any address or location mentioned",
  "emailBody": "The full email text for reference"
}

GUIDELINES:
- Be thorough — extract every piece of useful information
- For catering/order emails, include item details and quantities in the description
- If multiple dates are mentioned, use the most relevant event date
- For vendor emails, the event type is usually 'delivery'
- For meeting requests, use 'meeting'
- For general inquiries or bookings, use 'event'
- If no specific date is found, set date to null`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract event details from this email screenshot." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }), "email-to-event");

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(400).json({ message: "Could not read the email screenshot. Try a clearer image." });
      }

      let result;
      try {
        result = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(400).json({ message: "Could not extract event details. Try a clearer screenshot." });
        }
      }

      const validEventTypes = ["meeting", "delivery", "deadline", "event", "schedule"];
      const eventType = validEventTypes.includes(result.eventType) ? result.eventType : "event";

      let date = result.date || null;
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = null;
      }

      let startTime = result.startTime || null;
      if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
        startTime = null;
      }

      let endTime = result.endTime || null;
      if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
        endTime = null;
      }

      res.json({
        title: result.title || "Email Event",
        description: result.description || "",
        date,
        startTime,
        endTime,
        eventType,
        contactName: result.contactName || null,
        contactPhone: result.contactPhone || null,
        contactEmail: result.contactEmail || null,
        address: result.address || null,
        emailBody: result.emailBody || null,
      });
    } catch (err: any) {
      console.error("Email-to-event error:", err);
      res.status(500).json({ message: "Failed to process the email screenshot. Please try again." });
    }
  });

  app.post("/api/notes/transcribe", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { audio } = req.body;
      if (!audio || typeof audio !== "string") return res.status(400).json({ message: "Audio data required" });
      if (audio.length > 10 * 1024 * 1024) return res.status(400).json({ message: "Audio too large. Maximum 10MB." });
      const audioBuffer = Buffer.from(audio, "base64");
      const detected = detectAudioFormat(audioBuffer);
      const format = detected === "unknown" ? "wav" : detected;
      const transcript = await speechToText(audioBuffer, format);
      res.json({ transcript });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notes/:id/generate", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const note = await storage.getNote(Number(req.params.id));
      if (!note) return res.status(404).json({ message: "Note not found" });
      const isCollabGen = note.sharedWith && Array.isArray(note.sharedWith) && note.sharedWith.includes(user.id);
      if (note.userId !== user.id && !note.isShared && !isCollabGen) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { type } = req.body;
      if (!type || !["recipe", "sop", "letterhead", "event"].includes(type)) {
        return res.status(400).json({ message: "Type must be recipe, sop, letterhead, or event" });
      }

      const OpenAI = (await import("openai")).default;
      const ai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      let systemPrompt = "";
      if (type === "recipe") {
        systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Convert the following note into a properly structured bakery recipe. Format it with:
- A clear title
- Yield amount and unit
- A categorized ingredient list with quantities and units (use grams/kg where appropriate)
- Step-by-step instructions numbered sequentially
- Baker's notes or tips if relevant

Return ONLY the formatted recipe as clean, readable text with clear section headers. Use markdown formatting.`;
      } else if (type === "sop") {
        systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Convert the following note into a professional Standard Operating Procedure (SOP). Format it with:
- A clear title and SOP number placeholder
- Purpose/Scope section
- Materials/Equipment needed
- Step-by-step procedure with numbered steps
- Safety considerations if applicable
- Quality checkpoints
- Revision history placeholder

Return ONLY the formatted SOP as clean, professional text. Use markdown formatting.`;
      } else if (type === "event") {
        systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Convert the following note into one or more calendar events. Format each event clearly with:
- Event Title
- Event Type (meeting, delivery, deadline, event, or schedule)
- Date and Time (include start and end if applicable)
- Description/Details
- Location/Address if mentioned
- Contact information if mentioned
- People to tag/involve if mentioned

If the note describes multiple events, list each one separately with clear headers (Event 1, Event 2, etc.).
Return ONLY the formatted events as clean, readable text. Use markdown formatting.`;
      } else if (type === "letterhead") {
        systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Convert the following note into a polished, spell-checked, properly worded professional document on Bear's Cup Bakehouse letterhead. Format it with:

BEAR'S CUP BAKEHOUSE
[Date]

[Professional, well-structured content based on the note]

Clean up grammar, spelling, and tone. Make it professional while keeping the original intent. Return ONLY the formatted document as clean text. Use markdown formatting.`;
      }

      const response = await withRetry(() => ai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Note Title: ${note.title}\n\nNote Content:\n${note.content}` },
        ],
      }));

      const generatedContent = response.choices[0]?.message?.content || "";
      await storage.updateNote(Number(req.params.id), {
        generatedType: type,
        generatedContent,
      });

      res.json({ generatedContent, type });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notes/:id/generate/save", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const note = await storage.getNote(Number(req.params.id));
      if (!note) return res.status(404).json({ message: "Note not found" });
      const isCollabSave = note.sharedWith && Array.isArray(note.sharedWith) && note.sharedWith.includes(user.id);
      if (note.userId !== user.id && !note.isShared && !isCollabSave) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { type } = req.body;
      if (!type || !["recipe", "sop", "event"].includes(type)) {
        return res.status(400).json({ message: "Type must be recipe, sop, or event" });
      }

      const OpenAI = (await import("openai")).default;
      const ai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      if (type === "recipe") {
        const systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Convert the following note into a structured recipe. Return ONLY valid JSON (no markdown code blocks, no extra text) with this exact structure:
{
  "title": "Recipe Name",
  "description": "Brief description",
  "yieldAmount": 10,
  "yieldUnit": "pieces",
  "category": "Pastry",
  "department": "bakery",
  "ingredients": [
    { "name": "All-Purpose Flour", "quantity": 500, "unit": "g" },
    { "name": "Butter", "quantity": 250, "unit": "g" }
  ],
  "instructions": [
    { "step": 1, "text": "Mix dry ingredients together." },
    { "step": 2, "text": "Add butter and combine." }
  ]
}

Rules:
- Use metric units (g, kg, ml, L) for ingredients when possible
- department must be one of: "bakery", "kitchen", "bar"
- category examples: "Bread", "Pastry", "Cake", "Viennoiserie", "Cookie", "Savory", "Beverage"
- yieldUnit examples: "pieces", "loaves", "kg", "portions", "cookies", "servings"
- Include all ingredients mentioned in the note
- Break instructions into clear, numbered steps`;

        const response = await withRetry(() => ai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Note Title: ${note.title}\n\nNote Content:\n${note.content}` },
          ],
        }));

        const raw = response.choices[0]?.message?.content || "";
        let parsed;
        try {
          const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          return res.status(422).json({ message: "AI returned invalid recipe format. Try again." });
        }

        if (!parsed.title || !parsed.ingredients || !parsed.instructions) {
          return res.status(422).json({ message: "AI response missing required fields. Try again." });
        }

        const recipe = await storage.createRecipe({
          title: parsed.title,
          description: parsed.description || null,
          yieldAmount: parsed.yieldAmount || 1,
          yieldUnit: parsed.yieldUnit || "batch",
          category: parsed.category || "Other",
          department: parsed.department || "bakery",
          ingredients: parsed.ingredients,
          instructions: parsed.instructions,
        });

        await storage.updateNote(Number(req.params.id), {
          generatedType: type,
          generatedContent: `Recipe "${recipe.title}" created (ID: ${recipe.id})`,
        });

        res.json({ saved: true, type: "recipe", id: recipe.id, title: recipe.title });
      } else if (type === "sop") {
        const systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Convert the following note into a professional Standard Operating Procedure. Return ONLY valid JSON (no markdown code blocks, no extra text) with this exact structure:
{
  "title": "SOP Title",
  "content": "Full SOP content in markdown format with sections for Purpose, Scope, Materials, Procedure (numbered steps), Safety, and Quality Checkpoints.",
  "category": "Operations"
}

Rules:
- category examples: "Safety", "Cleaning", "Equipment", "Operations", "Food Handling", "Opening", "Closing", "Production"
- content should be well-formatted markdown with headers, numbered lists, and bullet points
- Be thorough and professional`;

        const response = await withRetry(() => ai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Note Title: ${note.title}\n\nNote Content:\n${note.content}` },
          ],
        }));

        const raw = response.choices[0]?.message?.content || "";
        let parsed;
        try {
          const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          return res.status(422).json({ message: "AI returned invalid SOP format. Try again." });
        }

        if (!parsed.title || !parsed.content) {
          return res.status(422).json({ message: "AI response missing required fields. Try again." });
        }

        const sop = await storage.createSOP({
          title: parsed.title,
          content: parsed.content,
          category: parsed.category || "Operations",
        });

        await storage.updateNote(Number(req.params.id), {
          generatedType: type,
          generatedContent: `SOP "${sop.title}" created (ID: ${sop.id})`,
        });

        res.json({ saved: true, type: "sop", id: sop.id, title: sop.title });
      } else if (type === "event") {
        const today = new Date().toISOString().split("T")[0];
        const systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Convert the following note into one or more calendar events. Return ONLY valid JSON (no markdown code blocks, no extra text) with this exact structure:
{
  "events": [
    {
      "title": "Event Title",
      "description": "Event description/details",
      "eventType": "event",
      "date": "2026-03-15T09:00:00",
      "endDate": "2026-03-15T17:00:00",
      "startTime": "09:00",
      "endTime": "17:00",
      "address": "123 Main St (or null if not mentioned)",
      "contactName": "John Doe (or null if not mentioned)",
      "contactPhone": "555-1234 (or null if not mentioned)",
      "contactEmail": "john@example.com (or null if not mentioned)"
    }
  ]
}

Rules:
- eventType must be one of: "meeting", "delivery", "deadline", "event", "schedule"
- date and endDate must be valid ISO 8601 datetime strings
- If no specific date is mentioned, use reasonable dates starting from ${today}
- startTime and endTime should be in HH:MM 24-hour format (or null if not applicable)
- If the note contains multiple events, include all of them in the events array
- Use "event" as the default eventType if the type is unclear
- Include all relevant details from the note in the description`;

        const response = await withRetry(() => ai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Note Title: ${note.title}\n\nNote Content:\n${note.content}` },
          ],
        }));

        const raw = response.choices[0]?.message?.content || "";
        let parsed;
        try {
          const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          return res.status(422).json({ message: "AI returned invalid event format. Try again." });
        }

        const eventsArr = parsed.events || (parsed.title ? [parsed] : []);
        if (!eventsArr.length) {
          return res.status(422).json({ message: "AI could not extract any events from this note. Try again." });
        }

        const validTypes = ["meeting", "delivery", "deadline", "event", "schedule"];
        const createdEvents = [];
        for (const ev of eventsArr) {
          if (!ev.title || !ev.date) continue;
          const parsedDate = new Date(ev.date);
          if (isNaN(parsedDate.getTime())) continue;
          const parsedEndDate = ev.endDate ? new Date(ev.endDate) : null;
          if (parsedEndDate && isNaN(parsedEndDate.getTime())) continue;
          const event = await storage.createEvent({
            title: ev.title,
            description: ev.description || null,
            eventType: validTypes.includes(ev.eventType) ? ev.eventType : "event",
            date: parsedDate,
            endDate: parsedEndDate,
            startTime: ev.startTime || null,
            endTime: ev.endTime || null,
            address: ev.address || null,
            contactName: ev.contactName || null,
            contactPhone: ev.contactPhone || null,
            contactEmail: ev.contactEmail || null,
            taggedUserIds: null,
          });
          createdEvents.push(event);
        }

        const titles = createdEvents.map(e => e.title).join(", ");
        await storage.updateNote(Number(req.params.id), {
          generatedType: type,
          generatedContent: `${createdEvents.length} event(s) created: ${titles}`,
        });

        res.json({ saved: true, type: "event", count: createdEvents.length, events: createdEvents.map(e => ({ id: e.id, title: e.title })), title: titles });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === EMPLOYEE SKILLS ===
  app.get("/api/users/:id/skills", isAuthenticated, isManager, async (req, res) => {
    try {
      const skills = await storage.getEmployeeSkills(req.params.id);
      res.json(skills);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/users/:id/skills", isAuthenticated, isManager, async (req, res) => {
    try {
      const { skills } = req.body;
      if (!Array.isArray(skills)) return res.status(400).json({ message: "Skills must be an array" });
      const results = [];
      for (const skill of skills) {
        if (!skill.skillArea || !skill.proficiency) continue;
        const result = await storage.upsertEmployeeSkill({
          userId: req.params.id,
          skillArea: skill.skillArea,
          proficiency: Math.min(5, Math.max(1, skill.proficiency)),
          notes: skill.notes || null,
          assessedBy: (req as any).appUser.id,
          lastAssessedAt: new Date(),
        });
        results.push(result);
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === JARVIS TASK LIST GENERATION (Beta) ===
  app.post("/api/task-lists/generate", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { department, date, locationId } = req.body;
      if (!department || !date) {
        return res.status(400).json({ message: "Department and date are required" });
      }

      const allRecipes = await storage.getRecipes();
      const deptRecipes = allRecipes.filter((r: any) => r.department === department);

      const inventory = await storage.getInventoryItems();
      const lowStock = inventory.filter((i: any) => i.onHand !== null && i.onHand < 10).slice(0, 20);

      const todayShifts = await storage.getShifts(date, date, locationId);
      const deptShifts = todayShifts;

      const allSkills = await storage.getAllEmployeeSkills();
      const scheduledUserIds = Array.from(new Set(deptShifts.map((s: any) => s.userId))) as string[];
      const scheduledSkills = allSkills.filter((s: any) => scheduledUserIds.includes(s.userId));

      const scheduledUsers = await db.select().from(users).where(inArray(users.id, scheduledUserIds.filter(Boolean) as string[]));
      const userMap: Record<string, string> = {};
      scheduledUsers.forEach((u: any) => { userMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "Team Member"; });

      const pastryTotalsData = await storage.getPastryTotals(date, locationId);

      const yesterday = new Date(date + "T12:00:00");
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      const allProductionLogs = await storage.getProductionLogs();
      const recentLogs = allProductionLogs
        .filter((l: any) => {
          const logDate = l.date ? new Date(l.date).toISOString().split("T")[0] : null;
          return logDate === date || logDate === yesterdayStr;
        })
        .slice(0, 30)
        .map((l: any) => ({
          recipeTitle: l.recipe?.title || "Unknown",
          yieldProduced: l.yieldProduced,
          date: l.date ? new Date(l.date).toISOString().split("T")[0] : null,
          notes: l.notes,
        }));

      const context = {
        department,
        date,
        recipes: deptRecipes.map((r: any) => ({ id: r.id, title: r.title, category: r.category, prepTime: r.prepTime, yieldAmount: r.yieldAmount, yieldUnit: r.yieldUnit })),
        lowStockItems: lowStock.map((i: any) => ({ name: i.name, onHand: i.onHand, unit: i.unit })),
        scheduledTeam: scheduledUserIds.map((uid: any) => ({
          userId: uid,
          name: userMap[uid] || "Unknown",
          skills: scheduledSkills.filter((s: any) => s.userId === uid).map((s: any) => ({ area: s.skillArea, level: s.proficiency })),
        })),
        pastryTotals: pastryTotalsData.map((pt: any) => ({ item: pt.itemName, target: pt.targetCount, forecasted: pt.forecastedCount })),
        recentProduction: recentLogs,
      };

      const OpenAI = (await import("openai")).default;
      const ai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const aiResponse = await withRetry(() => ai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are Jarvis, the AI operations manager for Bear's Cup Bakehouse. Generate a daily task list for the ${department} department on ${date}.

You have the following context:
- Available recipes: ${JSON.stringify(context.recipes)}
- Low stock items: ${JSON.stringify(context.lowStockItems)}
- Scheduled team: ${JSON.stringify(context.scheduledTeam)}
- Today's pastry targets: ${JSON.stringify(context.pastryTotals)}
- Recent production (today + yesterday): ${JSON.stringify(context.recentProduction)}

Return JSON with:
{
  "title": "A descriptive title for the task list (e.g., 'Bakery Morning Prep - Feb 28')",
  "description": "Brief description of the day's focus",
  "items": [
    {
      "title": "Task title",
      "recipeId": null or recipe ID number if this is a recipe task,
      "assignTo": null or userId string to assign to based on skills,
      "startTime": "HH:MM" or null,
      "endTime": "HH:MM" or null,
      "sortOrder": 0,
      "reasoning": "Brief explanation of why this task and assignment"
    }
  ]
}

Guidelines:
- Use pastry targets to determine what needs to be produced today
- Consider recent production logs to avoid duplicating what was already made
- Prioritize recipes that use low-stock ingredients (use them before they expire)
- Assign tasks to team members based on their skill proficiencies
- Order tasks logically (prep work first, then production, then cleanup)
- Include 5-15 tasks depending on team size
- Balance workload across the team
- Include estimated times based on recipe prepTime when available`
          },
          {
            role: "user",
            content: `Generate the daily ${department} task list for ${date}.`
          }
        ],
      }));

      const content = aiResponse.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI returned no content" });
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ message: "AI response was not valid JSON" });
      }

      const generated = JSON.parse(jsonMatch[0]);

      const taskList = await storage.createTaskList({
        title: generated.title || `${department} Tasks - ${date}`,
        description: generated.description || null,
        department,
        date,
        status: "active",
        createdBy: req.appUser.id,
        autoGenerated: true,
      });

      const createdItems = [];
      for (const item of (generated.items || [])) {
        const created = await storage.createTaskListItem({
          listId: taskList.id,
          manualTitle: item.title,
          recipeId: item.recipeId || null,
          sortOrder: item.sortOrder || 0,
          startTime: item.startTime || null,
          endTime: item.endTime || null,
          completed: false,
        });
        createdItems.push({ ...created, reasoning: item.reasoning, assignTo: item.assignTo });
      }

      if (generated.items?.some((i: any) => i.assignTo)) {
        for (const item of generated.items) {
          if (item.assignTo && scheduledUserIds.includes(item.assignTo)) {
            // Assignment is noted but applied at the list level or can be extended
          }
        }
      }

      res.json({
        taskList,
        items: createdItems,
        context: {
          recipesConsidered: deptRecipes.length,
          teamSize: scheduledUserIds.length,
          lowStockCount: lowStock.length,
          pastryTargets: pastryTotalsData.length,
          recentProductionLogs: recentLogs.length,
        },
      });
    } catch (err: any) {
      console.error("[Jarvis TaskGen] Error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // === TEST KITCHEN ===
  app.get("/api/test-kitchen", isAuthenticated, async (req: any, res) => {
    try {
      const filters: { status?: string; department?: string } = {};
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.department) filters.department = req.query.department as string;
      const items = await storage.getTestKitchenItems(filters);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/test-kitchen/:id", isAuthenticated, async (req: any, res) => {
    try {
      const item = await storage.getTestKitchenItem(parseInt(req.params.id));
      if (!item) return res.status(404).json({ message: "Item not found" });
      const notes = await storage.getTestKitchenNotes(item.id);
      res.json({ ...item, notes });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/test-kitchen", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.startDate === "string") body.startDate = new Date(body.startDate);
      if (typeof body.endDate === "string") body.endDate = new Date(body.endDate);
      body.createdBy = req.appUser?.id || null;
      const item = await storage.createTestKitchenItem(body);
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/test-kitchen/:id", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const existing = await storage.getTestKitchenItem(parseInt(req.params.id));
      if (!existing) return res.status(404).json({ message: "Item not found" });

      const body = { ...req.body };
      if (typeof body.startDate === "string") body.startDate = new Date(body.startDate);
      if (typeof body.endDate === "string") body.endDate = new Date(body.endDate);

      if (body.status && body.status !== existing.status) {
        const allowed: Record<string, string[]> = {
          draft: ["testing", "archived"],
          testing: ["review", "draft", "archived"],
          review: ["finalized", "testing", "archived"],
          finalized: ["archived"],
          archived: ["draft"],
        };
        if (!allowed[existing.status]?.includes(body.status)) {
          return res.status(400).json({ message: `Cannot transition from ${existing.status} to ${body.status}` });
        }
        if (body.status === "finalized" && (!existing.startDate && !body.startDate || !existing.endDate && !body.endDate)) {
          return res.status(400).json({ message: "Start date and end date are required to finalize" });
        }
      }

      const item = await storage.updateTestKitchenItem(parseInt(req.params.id), body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/test-kitchen/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      await storage.deleteTestKitchenItem(parseInt(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/test-kitchen/:id/notes", isAuthenticated, async (req: any, res) => {
    try {
      const note = await storage.createTestKitchenNote({
        itemId: parseInt(req.params.id),
        userId: req.appUser?.id || null,
        content: req.body.content,
        imageUrl: req.body.imageUrl || null,
        noteType: req.body.noteType || "note",
      });
      res.status(201).json(note);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/test-kitchen/notes/:noteId", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteTestKitchenNote(parseInt(req.params.noteId));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/test-kitchen/:id/calculate-cost", isAuthenticated, async (req: any, res) => {
    try {
      const item = await storage.getTestKitchenItem(parseInt(req.params.id));
      if (!item) return res.status(404).json({ message: "Item not found" });

      const allInventory = await storage.getInventoryItems();
      const ingredients = (item.ingredients as any[]) || [];
      let totalCost = 0;
      const breakdown: any[] = [];

      for (const ing of ingredients) {
        const ingName = (ing.name || "").toLowerCase().trim();
        let matchedItem: any = null;

        if (ing.inventoryItemId) {
          matchedItem = allInventory.find((i: any) => i.id === ing.inventoryItemId);
        }
        if (!matchedItem) {
          for (const inv of allInventory) {
            if (inv.name.toLowerCase().trim() === ingName) { matchedItem = inv; break; }
            if (inv.aliases?.some((a: string) => a.toLowerCase().trim() === ingName)) { matchedItem = inv; break; }
          }
        }

        const qty = ing.quantity || 0;
        const cost = matchedItem?.costPerUnit != null ? qty * matchedItem.costPerUnit : null;
        if (cost != null) totalCost += cost;

        breakdown.push({
          name: ing.name,
          quantity: qty,
          unit: ing.unit,
          inventoryItemId: matchedItem?.id || null,
          inventoryItemName: matchedItem?.name || null,
          costPerUnit: matchedItem?.costPerUnit || null,
          totalCost: cost,
          matched: !!matchedItem,
        });
      }

      const costPerUnit = item.yieldAmount && item.yieldAmount > 0 ? totalCost / item.yieldAmount : null;
      await storage.updateTestKitchenItem(item.id, { totalCost, costPerUnit });

      res.json({ totalCost, costPerUnit, breakdown });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/test-kitchen/:id/optimize", isAuthenticated, async (req: any, res) => {
    try {
      const item = await storage.getTestKitchenItem(parseInt(req.params.id));
      if (!item) return res.status(404).json({ message: "Item not found" });

      const allInventory = await storage.getInventoryItems();
      const ingredients = (item.ingredients as any[]) || [];
      const methodSteps = (item.method as string[]) || [];

      const ingredientDetails = ingredients.map((ing: any) => {
        const linked = ing.inventoryItemId ? allInventory.find((i: any) => i.id === ing.inventoryItemId) : null;
        const costPerUnit = linked?.costPerUnit ?? ing.costPerUnit ?? null;
        const lineCost = costPerUnit != null ? ing.quantity * costPerUnit : null;
        return {
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          costPerUnit,
          lineCost,
          linkedInventoryItem: linked?.name || null,
        };
      });

      const totalCost = ingredientDetails.reduce((sum: number, i: any) => sum + (i.lineCost || 0), 0);
      const costPerUnit = item.yieldAmount && item.yieldAmount > 0 ? totalCost / item.yieldAmount : null;
      const margin = item.targetPrice && costPerUnit
        ? ((item.targetPrice - costPerUnit) / item.targetPrice * 100)
        : null;

      const prompt = `You are Jarvis, the AI operations manager for Bear's Cup Bakehouse. Analyze this Test Kitchen recipe and provide optimization recommendations that maintain or improve flavor and presentation while reducing cost.

RECIPE: "${item.title}"
Department: ${item.department}
Description: ${item.description || "None provided"}
Status: ${item.status}

TARGET PRICE: ${item.targetPrice != null ? `$${item.targetPrice.toFixed(2)}` : "Not set"}
YIELD: ${item.yieldAmount || "?"} ${item.yieldUnit || "units"}
TOTAL COST: $${totalCost.toFixed(2)}
COST/UNIT: ${costPerUnit != null ? `$${costPerUnit.toFixed(2)}` : "Unknown"}
MARGIN: ${margin != null ? `${margin.toFixed(1)}%` : "Unknown"}

INGREDIENTS:
${ingredientDetails.map((i: any) => `- ${i.name}: ${i.quantity} ${i.unit} (cost: ${i.lineCost != null ? `$${i.lineCost.toFixed(2)}` : "unknown"})`).join("\n")}

METHOD:
${methodSteps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n") || "No method provided"}

Respond with a JSON object:
{
  "summary": "Brief overall assessment (1-2 sentences)",
  "recommendations": [
    {
      "title": "Short recommendation title",
      "type": "substitution" | "quantity" | "technique" | "sourcing" | "general",
      "explanation": "Clear explanation of what to change and why",
      "estimatedSavings": "$X.XX per batch" or null if not calculable,
      "impactOnQuality": "none" | "minimal" | "improved"
    }
  ]
}

Provide 3-5 practical, specific recommendations. Focus on real bakery knowledge. If the recipe is already well-optimized, say so and suggest enhancements instead.`;

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Jarvis, the AI operations manager for a professional bakery. Always respond with valid JSON only, no markdown fences." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }), "test-kitchen-optimize");

      const raw = response.choices[0]?.message?.content || "{}";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let result;
      try {
        result = JSON.parse(cleaned);
      } catch {
        result = {
          summary: "I wasn't able to generate a structured analysis this time. Here's what I found:",
          recommendations: [{ title: "Raw Analysis", type: "general", explanation: cleaned, estimatedSavings: null, impactOnQuality: "none" }],
        };
      }

      res.json(result);
    } catch (err: any) {
      console.error("[Test Kitchen Optimize] Error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/test-kitchen/:id/finalize", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const item = await storage.getTestKitchenItem(parseInt(req.params.id));
      if (!item) return res.status(404).json({ message: "Item not found" });
      if (!item.startDate || !item.endDate) {
        return res.status(400).json({ message: "Start date and end date are required to finalize" });
      }
      const updated = await storage.updateTestKitchenItem(item.id, { status: "finalized" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === DEV MODE & FEEDBACK ===
  app.get("/api/app-settings/dev-mode", isAuthenticated, async (_req, res) => {
    try {
      const val = await storage.getAppSetting("dev_mode");
      res.json({ enabled: val === "true" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/app-settings/dev-mode", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { enabled } = req.body;
      await storage.setAppSetting("dev_mode", enabled ? "true" : "false");
      res.json({ enabled: !!enabled });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/dev-feedback", isAuthenticated, async (req, res) => {
    try {
      const devMode = await storage.getAppSetting("dev_mode");
      if (devMode !== "true") {
        return res.status(403).json({ message: "Developer mode is not enabled" });
      }
      const { type, description, pagePath } = req.body;
      const allowedTypes = ["bug", "suggestion", "idea"];
      if (!type || !allowedTypes.includes(type)) {
        return res.status(400).json({ message: "Type must be one of: bug, suggestion, idea" });
      }
      if (!description || typeof description !== "string" || description.trim().length === 0) {
        return res.status(400).json({ message: "Description is required" });
      }

      let title = description.slice(0, 80);
      let category = "General";
      let priority = "medium";
      let aiSummary = description;

      try {
        const OpenAI = (await import("openai")).default;
        const ai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        const aiResponse = await withRetry(() => ai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are Jarvis, an AI assistant for a bakery management app. A team member has submitted feedback. Analyze it and return JSON with:
- "title": A concise 5-10 word title summarizing the feedback
- "category": One of: "UI", "Production", "Scheduling", "Performance", "Navigation", "Data", "Notifications", "Login", "General"
- "priority": One of: "low", "medium", "high", "critical" (critical = app-breaking bugs, high = major issues, medium = moderate issues/good suggestions, low = minor/cosmetic)
- "summary": A 1-3 sentence organized summary of the feedback, written clearly for the app owner to review`
            },
            {
              role: "user",
              content: `Type: ${type}\nPage: ${pagePath || "Unknown"}\nDescription: ${description}`
            }
          ],
        }));
        const content = aiResponse.choices[0]?.message?.content;
        if (content) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            title = parsed.title || title;
            category = parsed.category || category;
            priority = parsed.priority || priority;
            aiSummary = parsed.summary || aiSummary;
          }
        }
      } catch (aiErr) {
        console.error("[DevFeedback] AI categorization failed, using defaults:", aiErr);
      }

      const feedback = await storage.createDevFeedback({
        type,
        title,
        description,
        category,
        priority,
        status: "open",
        pagePath: pagePath || null,
        userId: (req as any).appUser.id,
        aiSummary,
        metadata: {
          userAgent: req.headers["user-agent"],
          submittedAt: new Date().toISOString(),
        },
      });
      res.json(feedback);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dev-feedback", isAuthenticated, isOwner, async (req, res) => {
    try {
      const filters: { status?: string; type?: string } = {};
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.type) filters.type = req.query.type as string;
      const items = await storage.getDevFeedback(filters);

      const userIds = [...new Set(items.map(i => i.userId).filter(Boolean))] as string[];
      let userMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const allUsers = await db.select().from(users).where(inArray(users.id, userIds));
        for (const u of allUsers) {
          userMap[u.id] = { firstName: u.firstName, lastName: u.lastName, username: u.username };
        }
      }

      const enriched = items.map(item => ({
        ...item,
        submitter: item.userId ? userMap[item.userId] || null : null,
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/dev-feedback/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      const allowedStatuses = ["open", "reviewed", "in_progress", "resolved", "dismissed"];
      const { status } = req.body;
      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      const updated = await storage.updateDevFeedback(Number(req.params.id), { status });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/dev-feedback/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      await storage.deleteDevFeedback(Number(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  (async () => {
    try {
      const existingGames = await storage.getStarkadeGames();
      const existingTypes = new Set(existingGames.map(g => g.type));
      const classicGames = [
        {
          name: "Snake",
          type: "snake",
          source: "built_in",
          status: "active",
          description: "Classic snake — eat food, grow longer, don't hit the walls or yourself!",
          config: { speed: 120 },
        },
        {
          name: "Pac-Man",
          type: "pacman",
          source: "built_in",
          status: "active",
          description: "Navigate the maze, eat all the dots, and avoid the ghosts!",
          config: { lives: 3 },
        },
        {
          name: "Asteroids",
          type: "asteroids",
          source: "built_in",
          status: "active",
          description: "Pilot your ship through an asteroid field — rotate, thrust, and shoot to survive!",
          config: { lives: 3 },
        },
      ];
      for (const game of classicGames) {
        if (!existingTypes.has(game.type)) {
          await storage.createStarkadeGame(game as any);
          console.log(`[Starkade] Seeded classic game: ${game.name}`);
        }
      }
    } catch (err) {
      console.error("[Starkade] Failed to seed classic games:", err);
    }
  })();

  // === COFFEE COMMAND CENTER ===
  app.get("/api/coffee/inventory", isAuthenticated, async (_req, res) => {
    try {
      const items = await storage.getCoffeeInventory();
      const allInvItems = await db.select().from(inventoryItems);
      const invMap = new Map(allInvItems.map(i => [i.id, i]));

      const enriched = await Promise.all(items.map(async (item: any) => {
        let resolvedCost = item.costPerUnit;
        let costSource: string | null = null;
        let costResolved = false;

        if (item.inventoryItemId) {
          costSource = "inventory";
          const linked = invMap.get(item.inventoryItemId);
          if (linked?.costPerUnit != null) {
            resolvedCost = linked.costPerUnit;
            costResolved = true;
          }
        } else if (item.recipeId) {
          costSource = "recipe";
          const recipeCost = await calculateRecipeCost(item.recipeId);
          if (recipeCost && recipeCost.totalCost != null && recipeCost.yieldAmount > 0) {
            resolvedCost = recipeCost.totalCost / recipeCost.yieldAmount;
            costResolved = true;
          }
        }

        return { ...item, costPerUnit: resolvedCost, costSource, costResolved };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/coffee/inventory", isAuthenticated, async (req, res) => {
    try {
      const invId = req.body.inventoryItemId || null;
      const recId = req.body.recipeId || null;
      if (!invId && !recId) {
        return res.status(400).json({ message: "Must link to a vendor inventory item or a recipe for cost derivation" });
      }
      if (invId && recId) {
        return res.status(400).json({ message: "Cannot link to both inventory item and recipe — pick one" });
      }
      if (invId) {
        const [exists] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.id, invId));
        if (!exists) return res.status(400).json({ message: "Linked inventory item not found" });
      }
      if (recId) {
        const [exists] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, recId));
        if (!exists) return res.status(400).json({ message: "Linked recipe not found" });
      }
      const parsed = insertCoffeeInventorySchema.safeParse({
        name: req.body.name,
        category: req.body.category,
        unit: req.body.unit,
        onHand: req.body.onHand || 0,
        parLevel: req.body.parLevel || null,
        costPerUnit: null,
        inventoryItemId: invId,
        recipeId: recId,
        locationId: req.body.locationId || null,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }
      const item = await storage.createCoffeeInventoryItem(parsed.data);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/coffee/inventory/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.updateCoffeeInventoryItem(id, req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/coffee/inventory/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteCoffeeInventoryItem(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/coffee/components", isAuthenticated, async (_req, res) => {
    try {
      const components = await storage.getCoffeeComponents();
      const inventory = await storage.getCoffeeInventory();
      const inventoryMap = new Map(inventory.map(i => [i.id, i]));
      const enriched = components.map(c => ({
        ...c,
        inventoryItemName: c.coffeeInventoryId ? inventoryMap.get(c.coffeeInventoryId)?.name || null : null,
        costPerUnit: c.coffeeInventoryId ? inventoryMap.get(c.coffeeInventoryId)?.costPerUnit || null : null,
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/coffee/components", isAuthenticated, async (req, res) => {
    try {
      const { name, category, coffeeInventoryId, defaultQuantity, defaultUnit } = req.body;
      if (!name || !category) return res.status(400).json({ message: "Name and category required" });
      const component = await storage.createCoffeeComponent({
        name, category,
        coffeeInventoryId: coffeeInventoryId || null,
        defaultQuantity: defaultQuantity || null,
        defaultUnit: defaultUnit || null,
      });
      res.json(component);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/coffee/components/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.updateCoffeeComponent(id, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/coffee/components/:id", isAuthenticated, async (req, res) => {
    try {
      const compId = parseInt(req.params.id);
      const allIngredients = await storage.getAllCoffeeDrinkIngredients();
      const dependents = allIngredients.filter(i => i.coffeeComponentId === compId);
      if (dependents.length > 0) {
        return res.status(409).json({ message: `Cannot delete: component is used in ${dependents.length} drink ingredient(s). Remove those references first.` });
      }
      await storage.deleteCoffeeComponent(compId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/coffee/jarvis-parse-drinks", isAuthenticated, async (req, res) => {
    try {
      const { text: inputText, imageBase64 } = req.body;
      if (!inputText && !imageBase64) return res.status(400).json({ message: "Provide text or image" });
      if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 5 * 1024 * 1024) {
        return res.status(400).json({ message: "Image too large (max 5MB)" });
      }
      if (inputText && typeof inputText === "string" && inputText.length > 5000) {
        return res.status(400).json({ message: "Text too long (max 5000 chars)" });
      }

      const components = await storage.getCoffeeComponents();
      const inventory = await storage.getCoffeeInventory();
      const inventoryMap = new Map(inventory.map(i => [i.id, i]));

      const componentsList = components.map(c => ({
        id: c.id,
        name: c.name,
        category: c.category,
        coffeeInventoryId: c.coffeeInventoryId,
        defaultQuantity: c.defaultQuantity,
        defaultUnit: c.defaultUnit,
        costPerUnit: c.coffeeInventoryId ? inventoryMap.get(c.coffeeInventoryId)?.costPerUnit || null : null,
      }));

      const existingRecipes = await storage.getCoffeeDrinkRecipes();
      const baseRecipes = existingRecipes.filter(r => !r.parentDrinkId);

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse coffee program. Parse drink descriptions into structured recipes.

Available components library:
${JSON.stringify(componentsList, null, 2)}

Existing base drink recipes (can be used as parent templates):
${baseRecipes.map(r => `- id:${r.id} "${r.drinkName}"`).join("\n")}

RULES:
1. Match ingredients to components by name (fuzzy match). Use the component's id, defaultQuantity, and defaultUnit when matched.
2. For unmatched ingredients, set componentId to null and suggest a category.
3. Standard drink sizes: small=8oz, medium=12oz, large=16oz.
4. Common defaults: espresso shot=1oz, milk=varies by size, syrup pump=0.5oz, cold foam=2oz.
5. If a drink is a variation of an existing base (e.g., "Iced Latte" from "Latte"), set parentDrinkId.
6. Parse multiple drinks if the input describes more than one.

Return JSON: {
  "drinks": [{
    "drinkName": "string",
    "description": "string",
    "parentDrinkId": number | null,
    "ingredients": [{
      "componentId": number | null,
      "componentName": "string",
      "coffeeInventoryId": number | null,
      "quantityUsed": number,
      "unit": "string",
      "matched": boolean,
      "suggestedCategory": "string" | null
    }],
    "notes": "string" | null
  }],
  "questions": ["string"] | null
}`;

      const messages: any[] = [
        { role: "system", content: systemPrompt },
      ];

      if (imageBase64) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: inputText || "Parse the drinks from this image into recipes." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        });
      } else {
        messages.push({ role: "user", content: inputText });
      }

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        response_format: { type: "json_object" },
        max_tokens: 4096,
      }), "jarvis-drink-parser");

      const content = response.choices[0]?.message?.content || "{}";
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : { drinks: [], questions: ["Failed to parse response"] };
      }

      const drinks = parsed.drinks || [];
      for (const drink of drinks) {
        let totalCost = 0;
        for (const ing of drink.ingredients || []) {
          if (ing.coffeeInventoryId) {
            const invItem = inventoryMap.get(ing.coffeeInventoryId);
            if (invItem?.costPerUnit) {
              ing.estimatedCost = ing.quantityUsed * invItem.costPerUnit;
              totalCost += ing.estimatedCost;
            }
          }
        }
        drink.estimatedTotalCost = totalCost > 0 ? totalCost : null;
      }

      res.json(parsed);
    } catch (err: any) {
      console.error("Jarvis drink parser error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/coffee/drinks", isAuthenticated, async (_req, res) => {
    try {
      const recipes = await storage.getCoffeeDrinkRecipes();
      const allIngredients = await storage.getAllCoffeeDrinkIngredients();
      const inventory = await storage.getCoffeeInventory();
      const components = await storage.getCoffeeComponents();
      const inventoryMap = new Map(inventory.map(i => [i.id, i]));
      const componentMap = new Map(components.map(c => [c.id, c]));

      const enrichIngredient = (ing: any) => ({
        ...ing,
        inventoryItemName: ing.coffeeInventoryId ? (inventoryMap.get(ing.coffeeInventoryId)?.name || "Unknown") : (ing.coffeeComponentId ? componentMap.get(ing.coffeeComponentId)?.name || "Unmapped" : "Unmapped"),
        costPerUnit: ing.coffeeInventoryId ? (inventoryMap.get(ing.coffeeInventoryId)?.costPerUnit || null) : null,
        componentName: ing.coffeeComponentId ? componentMap.get(ing.coffeeComponentId)?.name || null : null,
      });

      const recipeIngMap = new Map<number, any[]>();
      for (const ing of allIngredients) {
        if (!recipeIngMap.has(ing.drinkRecipeId)) recipeIngMap.set(ing.drinkRecipeId, []);
        recipeIngMap.get(ing.drinkRecipeId)!.push(ing);
      }

      const drinksWithIngredients = recipes.map(r => {
        let ownIngredients = (recipeIngMap.get(r.id) || []).map(enrichIngredient);
        let effectiveIngredients = ownIngredients;

        if (r.parentDrinkId) {
          const parentIngs = (recipeIngMap.get(r.parentDrinkId) || []).map(enrichIngredient);
          const overrideKeys = new Set<string>();
          for (const oi of ownIngredients) {
            if (oi.isOverride) {
              overrideKeys.add(String(oi.coffeeInventoryId));
              if (oi.coffeeComponentId) overrideKeys.add(`c:${oi.coffeeComponentId}`);
            } else {
              overrideKeys.add(String(oi.coffeeInventoryId));
            }
          }
          const inherited = parentIngs.filter((pi: any) => {
            if (overrideKeys.has(String(pi.coffeeInventoryId))) return false;
            if (pi.coffeeComponentId && overrideKeys.has(`c:${pi.coffeeComponentId}`)) return false;
            return true;
          }).map((pi: any) => ({ ...pi, inherited: true }));
          effectiveIngredients = [...ownIngredients.map((i: any) => ({ ...i, inherited: false })), ...inherited];
        }

        return {
          ...r,
          ingredients: ownIngredients,
          effectiveIngredients,
        };
      });
      res.json(drinksWithIngredients);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/coffee/drinks", isAuthenticated, async (req, res) => {
    try {
      const { drinkName, description, parentDrinkId, squareItemName, squareItemId, squareVariationId, ingredients } = req.body;
      if (!drinkName || typeof drinkName !== "string" || !drinkName.trim()) {
        return res.status(400).json({ message: "Drink name is required" });
      }
      let validParentId = null;
      if (parentDrinkId) {
        const allRecipes = await storage.getCoffeeDrinkRecipes();
        const parent = allRecipes.find(r => r.id === parentDrinkId);
        if (parent && !parent.parentDrinkId) validParentId = parentDrinkId;
      }
      const recipe = await storage.createCoffeeDrinkRecipe({
        drinkName: drinkName.trim(),
        description: description || null,
        parentDrinkId: validParentId,
        squareItemName: squareItemName || null,
        squareItemId: squareItemId || null,
        squareVariationId: squareVariationId || null,
        isActive: true,
      });
      let savedIngredients: any[] = [];
      if (ingredients && Array.isArray(ingredients) && ingredients.length > 0) {
        const components = await storage.getCoffeeComponents();
        const componentMap = new Map(components.map(c => [c.id, c]));
        const resolvedIngredients = ingredients
          .filter((ing: any) => typeof ing.quantityUsed === "number" && ing.quantityUsed > 0 && typeof ing.unit === "string" && ing.unit.trim())
          .map((ing: any) => {
            let invId = ing.coffeeInventoryId ? Number(ing.coffeeInventoryId) : null;
            const compId = ing.coffeeComponentId ? Number(ing.coffeeComponentId) : null;
            if (!invId && compId) {
              const comp = componentMap.get(compId);
              if (comp?.coffeeInventoryId) invId = comp.coffeeInventoryId;
            }
            return {
              coffeeInventoryId: invId && invId > 0 ? invId : null,
              coffeeComponentId: compId && compId > 0 ? compId : null,
              quantityUsed: Number(ing.quantityUsed),
              unit: String(ing.unit).trim(),
              isOverride: Boolean(ing.isOverride),
            };
          }).filter((i: any) => i.coffeeInventoryId || i.coffeeComponentId);
        savedIngredients = await storage.setCoffeeDrinkIngredients(recipe.id, resolvedIngredients);
      }
      res.json({ ...recipe, ingredients: savedIngredients });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/coffee/drinks/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { drinkName, description, parentDrinkId, squareItemName, squareItemId, squareVariationId, isActive, ingredients } = req.body;
      const updates: any = {};
      if (drinkName !== undefined) updates.drinkName = drinkName;
      if (description !== undefined) updates.description = description;
      if (parentDrinkId !== undefined) {
        if (parentDrinkId) {
          const allRecipes = await storage.getCoffeeDrinkRecipes();
          const parent = allRecipes.find(r => r.id === parentDrinkId);
          updates.parentDrinkId = (parent && !parent.parentDrinkId && parentDrinkId !== id) ? parentDrinkId : null;
        } else {
          updates.parentDrinkId = null;
        }
      }
      if (squareItemName !== undefined) updates.squareItemName = squareItemName;
      if (squareItemId !== undefined) updates.squareItemId = squareItemId;
      if (squareVariationId !== undefined) updates.squareVariationId = squareVariationId;
      if (isActive !== undefined) updates.isActive = isActive;
      const recipe = await storage.updateCoffeeDrinkRecipe(id, updates);
      if (ingredients && Array.isArray(ingredients)) {
        const components = await storage.getCoffeeComponents();
        const componentMap = new Map(components.map(c => [c.id, c]));
        const resolvedIngredients = ingredients
          .filter((ing: any) => typeof ing.quantityUsed === "number" && ing.quantityUsed > 0 && typeof ing.unit === "string" && ing.unit.trim())
          .map((ing: any) => {
            let invId = ing.coffeeInventoryId ? Number(ing.coffeeInventoryId) : null;
            const compId = ing.coffeeComponentId ? Number(ing.coffeeComponentId) : null;
            if (!invId && compId) {
              const comp = componentMap.get(compId);
              if (comp?.coffeeInventoryId) invId = comp.coffeeInventoryId;
            }
            return {
              coffeeInventoryId: invId && invId > 0 ? invId : null,
              coffeeComponentId: compId && compId > 0 ? compId : null,
              quantityUsed: Number(ing.quantityUsed),
              unit: String(ing.unit).trim(),
              isOverride: Boolean(ing.isOverride),
            };
          }).filter((i: any) => i.coffeeInventoryId || i.coffeeComponentId);
        await storage.setCoffeeDrinkIngredients(id, resolvedIngredients);
      }
      const updatedIngredients = await storage.getCoffeeDrinkIngredients(id);
      res.json({ ...recipe, ingredients: updatedIngredients });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/coffee/drinks/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteCoffeeDrinkRecipe(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/coffee/usage/log", isAuthenticated, async (req, res) => {
    try {
      const parsed = insertCoffeeUsageLogSchema.safeParse({
        drinkRecipeId: req.body.drinkRecipeId || null,
        drinkName: req.body.drinkName,
        quantitySold: req.body.quantitySold,
        date: req.body.date,
        locationId: req.body.locationId || null,
        source: req.body.source || "manual",
      });
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }
      const { drinkRecipeId, drinkName, quantitySold } = parsed.data;
      const log = await storage.createCoffeeUsageLog(parsed.data);
      if (drinkRecipeId) {
        const ingredients = await storage.getCoffeeDrinkIngredients(drinkRecipeId);
        const inventory = await storage.getCoffeeInventory();
        const inventoryMap = new Map(inventory.map(i => [i.id, i]));
        const updates: Promise<any>[] = [];
        for (const ing of ingredients) {
          const deduction = ing.quantityUsed * quantitySold;
          const item = inventoryMap.get(ing.coffeeInventoryId);
          if (item) {
            const newOnHand = Math.max(0, (item.onHand || 0) - deduction);
            updates.push(storage.updateCoffeeInventoryItem(item.id, { onHand: newOnHand }));
          }
        }
        await Promise.all(updates);
      }
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/coffee/usage", isAuthenticated, async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const logs = await storage.getCoffeeUsageLogs(date);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/coffee/usage/summary", isAuthenticated, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const allLogs = await storage.getCoffeeUsageLogs();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      const recentLogs = allLogs.filter(l => l.date >= cutoffStr);
      const drinkSummary: Record<string, { drinkName: string; totalSold: number; drinkRecipeId: number | null }> = {};
      for (const log of recentLogs) {
        const key = log.drinkName;
        if (!drinkSummary[key]) {
          drinkSummary[key] = { drinkName: log.drinkName, totalSold: 0, drinkRecipeId: log.drinkRecipeId };
        }
        drinkSummary[key].totalSold += log.quantitySold;
      }
      const allIngredients = await storage.getAllCoffeeDrinkIngredients();
      const inventory = await storage.getCoffeeInventory();
      const inventoryMap = new Map(inventory.map(i => [i.id, i]));
      const summary = Object.values(drinkSummary).map(d => {
        const ings = d.drinkRecipeId ? allIngredients.filter(i => i.drinkRecipeId === d.drinkRecipeId) : [];
        return {
          ...d,
          ingredientImpact: ings.map(ing => ({
            inventoryItemName: inventoryMap.get(ing.coffeeInventoryId)?.name || "Unknown",
            totalUsed: ing.quantityUsed * d.totalSold,
            unit: ing.unit,
          })),
        };
      });
      res.json({ days, summary });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/coffee/sync-square-sales", isAuthenticated, async (req, res) => {
    try {
      const date = (req.body.date as string) || new Date().toISOString().split("T")[0];
      const allDrinks = await storage.getCoffeeDrinkRecipes();
      const mappedDrinks = allDrinks.filter(d => d.squareItemId || d.squareItemName);
      if (mappedDrinks.length === 0) {
        return res.json({ synced: 0, message: "No drinks mapped to Square catalog items" });
      }

      const { getSquareClient } = await import("./square");
      const client = getSquareClient();

      const startAt = `${date}T00:00:00Z`;
      const endAt = `${date}T23:59:59Z`;
      const allLocs = await storage.getLocations();
      const squareLocIds = allLocs.filter((l: any) => l.squareLocationId).map((l: any) => l.squareLocationId!);

      const body: any = {
        query: {
          filter: {
            dateTimeFilter: { createdAt: { startAt, endAt } },
            stateFilter: { states: ["COMPLETED"] },
          },
        },
        locationIds: squareLocIds.length > 0 ? squareLocIds : undefined,
      };

      const itemIdToName = new Map<string, string>();
      const variationToItemId = new Map<string, string>();
      const { fetchSquareCatalog } = await import("./square");
      const catalog = await fetchSquareCatalog();
      for (const item of catalog) {
        itemIdToName.set(item.id, item.name);
        for (const v of item.variations || []) {
          variationToItemId.set(v.id, item.id);
        }
      }

      const drinkSalesMap = new Map<number, number>();

      let cursor: string | undefined;
      do {
        if (cursor) body.cursor = cursor;
        const response = await client.orders.search(body);
        const orders = response.orders || [];

        for (const order of orders) {
          for (const lineItem of (order as any).lineItems || []) {
            const catalogId = lineItem.catalogObjectId;
            if (!catalogId) continue;

            const parentItemId = variationToItemId.get(catalogId) || catalogId;
            const itemName = itemIdToName.get(parentItemId) || lineItem.name || "";

            for (const drink of mappedDrinks) {
              let matched = false;
              if (drink.squareItemId) {
                if (drink.squareVariationId) {
                  matched = catalogId === drink.squareVariationId;
                } else {
                  matched = parentItemId === drink.squareItemId;
                }
              } else if (drink.squareItemName) {
                matched = itemName.toLowerCase() === drink.squareItemName.toLowerCase();
              }

              if (matched) {
                const qty = parseInt(lineItem.quantity || "1", 10);
                drinkSalesMap.set(drink.id, (drinkSalesMap.get(drink.id) || 0) + qty);
              }
            }
          }
        }
        cursor = (response as any).cursor;
      } while (cursor);

      const existingLogs = await storage.getCoffeeUsageLogs(date);
      const existingSquareKeys = new Set(
        existingLogs
          .filter((l: any) => l.source === "square")
          .map((l: any) => `${l.drinkRecipeId}-${l.date}`)
      );

      let synced = 0;
      for (const [drinkId, totalQty] of drinkSalesMap) {
        if (totalQty <= 0) continue;
        const key = `${drinkId}-${date}`;
        if (existingSquareKeys.has(key)) continue;

        const drink = allDrinks.find(d => d.id === drinkId)!;
        await storage.createCoffeeUsageLog({
          drinkRecipeId: drink.id,
          drinkName: drink.drinkName,
          quantitySold: totalQty,
          date,
          source: "square",
        });

        const ingredients = await storage.getCoffeeDrinkIngredients(drink.id);
        const inventory = await storage.getCoffeeInventory();
        const inventoryMap = new Map(inventory.map(i => [i.id, i]));
        for (const ing of ingredients) {
          const deduction = ing.quantityUsed * totalQty;
          const item = inventoryMap.get(ing.coffeeInventoryId);
          if (item) {
            const newOnHand = Math.max(0, (item.onHand || 0) - deduction);
            await storage.updateCoffeeInventoryItem(item.id, { onHand: newOnHand });
          }
        }

        synced++;
      }

      res.json({ synced, date, message: `${synced} drink${synced !== 1 ? "s" : ""} synced from Square` });
    } catch (err: any) {
      console.error("[Coffee] Square sync error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/coffee/briefing", isAuthenticated, async (req: any, res) => {
    try {
      const inventory = await storage.getCoffeeInventory();
      const drinks = await storage.getCoffeeDrinkRecipes();
      const today = new Date().toISOString().split("T")[0];
      const todayLogs = await storage.getCoffeeUsageLogs(today);
      const lowStockItems = inventory.filter(i => i.parLevel && i.onHand < i.parLevel);
      const totalDrinksToday = todayLogs.reduce((sum, l) => sum + l.quantitySold, 0);
      const userName = req.appUser?.firstName || "Coffee Master";
      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

      const { openai: aiClient } = await import("./replit_integrations/audio/client");
      const response = await aiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are Jarvis, the AI assistant for Bear's Cup Bakehouse — specifically speaking to the coffee program manager. You are passionate about coffee culture, trends, and the craft. Your tone is warm, knowledgeable, and slightly nerdy about coffee.

Your brief should include:
1. A warm greeting appropriate for the ${timeOfDay}
2. One or two sentences about a current coffee industry trend, technique, or interesting fact (be creative — mention things like new processing methods, origin spotlights, latte art trends, specialty roasting techniques, sustainability in coffee, etc.)
3. A quick summary of the coffee inventory status and any low-stock alerts
4. Today's drink sales summary if any
5. Any actionable insights or recommendations

Keep it conversational, 3-5 short paragraphs. No bullet points. No markdown formatting.`
          },
          {
            role: "user",
            content: `Generate a coffee briefing for ${userName}.

Inventory Status:
${inventory.length === 0 ? "No coffee inventory items set up yet." : inventory.map(i => `- ${i.name} (${i.category}): ${i.onHand} ${i.unit} on hand${i.parLevel ? `, par: ${i.parLevel} ${i.unit}` : ""}`).join("\n")}

Low Stock Alerts:
${lowStockItems.length === 0 ? "None — all items above par levels." : lowStockItems.map(i => `- ${i.name}: ${i.onHand} ${i.unit} (par: ${i.parLevel} ${i.unit})`).join("\n")}

Drinks Configured: ${drinks.length}
Drinks Sold Today: ${totalDrinksToday}
${todayLogs.length > 0 ? "Today's Sales:\n" + todayLogs.map(l => `- ${l.drinkName}: ${l.quantitySold}`).join("\n") : "No sales logged today yet."}`
          }
        ],
        max_tokens: 500,
        temperature: 0.8,
      });

      const briefing = response.choices[0]?.message?.content || "Couldn't generate the coffee briefing right now. Check back shortly.";
      res.json({ briefing, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      console.error("[Coffee Briefing] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // === HR ONBOARDING ===
  app.post("/api/hr/onboarding/invite", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { randomUUID } = await import("crypto");
      const token = randomUUID();
      const { firstName, lastName, email, position, department, locationId, hourlyWage } = req.body;
      if (!firstName) {
        return res.status(400).json({ message: "First name is required" });
      }
      const invite = await storage.createOnboardingInvite({
        token,
        firstName,
        lastName: lastName || null,
        email: email || null,
        position: position || null,
        department: department || null,
        locationId: locationId || null,
        hourlyWage: hourlyWage || null,
        status: "pending",
        createdBy: req.appUser.id,
      });
      res.json(invite);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hr/onboarding/invites", isAuthenticated, isManager, async (_req, res) => {
    try {
      const invites = await storage.getOnboardingInvites();
      res.json(invites);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/hr/onboarding/invite/:id", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid invite ID" });
      }
      const invite = await storage.getOnboardingInviteById(id);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }
      if (invite.status !== "pending") {
        return res.status(400).json({ message: "Only pending invites can be deleted. Completed or in-progress invites are legal records." });
      }
      await storage.deleteOnboardingInvite(id);
      res.json({ message: "Invite deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hr/onboarding/export/adp", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const invites = await storage.getOnboardingInvites();
      const completedInvites = invites.filter(i => i.status === "completed");

      const { decryptOrFallback } = await import("./encryption");
      const rows: any[] = [];
      for (const invite of completedInvites) {
        const sub = await storage.getOnboardingSubmissionByInviteId(invite.id);
        if (!sub) continue;
        const decryptedSSN = decryptOrFallback(sub.ssn);
        const decryptedRouting = decryptOrFallback(sub.routingNumber);
        const decryptedAccount = decryptOrFallback(sub.accountNumber);
        const formatSSN = (val: string | null) => {
          if (!val) return "";
          const digits = val.replace(/\D/g, "");
          if (digits.length === 9) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
          return val;
        };
        rows.push({
          firstName: sub.legalFirstName || "",
          lastName: sub.legalLastName || "",
          middleName: sub.middleName || "",
          ssn: formatSSN(decryptedSSN),
          dateOfBirth: sub.dateOfBirth || "",
          address: sub.address || "",
          city: sub.city || "",
          state: sub.state || "",
          zipCode: sub.zipCode || "",
          phone: sub.phone || "",
          personalEmail: sub.personalEmail || "",
          emergencyContactName: sub.emergencyContactName || "",
          emergencyContactPhone: sub.emergencyContactPhone || "",
          emergencyContactRelation: sub.emergencyContactRelation || "",
          federalFilingStatus: sub.federalFilingStatus || "",
          stateFilingStatus: sub.stateFilingStatus || "",
          allowances: String(sub.allowances ?? 0),
          multipleJobs: sub.multipleJobs ? "Yes" : "No",
          dependentsChild: String(sub.dependentsChildAmount ?? 0),
          dependentsOther: String(sub.dependentsOtherAmount ?? 0),
          otherIncome: String(sub.otherIncome ?? 0),
          deductions: String(sub.deductions ?? 0),
          extraWithholding: String(sub.extraWithholding ?? 0),
          bankName: sub.bankName || "",
          accountType: sub.accountType || "",
          routingNumber: decryptedRouting || "",
          accountNumber: decryptedAccount || "",
          hireDate: invite.createdAt ? new Date(invite.createdAt).toLocaleDateString("en-US") : "",
          position: invite.position || "",
          department: invite.department || "",
          hourlyWage: invite.hourlyWage || "",
        });
      }

      const headers = [
        "First Name", "Last Name", "Middle Name", "SSN", "Date of Birth",
        "Address", "City", "State", "ZIP", "Phone", "Personal Email",
        "Emergency Contact Name", "Emergency Contact Phone", "Emergency Contact Relation",
        "Federal Filing Status", "State Filing Status", "Allowances",
        "Multiple Jobs", "Dependents (Children)", "Dependents (Other)",
        "Other Income", "Deductions", "Extra Withholding",
        "Bank Name", "Account Type", "Routing Number", "Account Number",
        "Hire Date", "Position", "Department", "Hourly Wage"
      ];

      const sanitizeCell = (val: string): string => {
        let s = String(val).replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) {
          s = "'" + s;
        }
        return `"${s}"`;
      };

      const csvLines = [headers.map(h => sanitizeCell(h)).join(",")];
      for (const row of rows) {
        const values = Object.values(row).map((v: any) => sanitizeCell(String(v)));
        csvLines.push(values.join(","));
      }

      const csv = csvLines.join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=adp-onboarding-export.csv");
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hr/onboarding/w4/:inviteId", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const inviteId = parseInt(req.params.inviteId);
      if (!Number.isInteger(inviteId) || inviteId <= 0) {
        return res.status(400).json({ message: "Invalid invite ID" });
      }
      const invite = await storage.getOnboardingInviteById(inviteId);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }
      const submission = await storage.getOnboardingSubmissionByInviteId(inviteId);
      if (!submission) {
        return res.status(404).json({ message: "No submission found for this invite" });
      }
      const { decryptOrFallback } = await import("./encryption");
      const decryptedSSN = decryptOrFallback(submission.ssn);
      const { generateW4PDF } = await import("./w4-pdf");
      const pdfBytes = await generateW4PDF(submission, invite, decryptedSSN);
      const fileName = `W4_${submission.legalLastName}_${submission.legalFirstName}.pdf`.replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err: any) {
      console.error("[W-4 PDF] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hr/onboarding/submission/:inviteId", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const inviteId = parseInt(req.params.inviteId);
      const submission = await storage.getOnboardingSubmissionByInviteId(inviteId);
      if (!submission) {
        return res.status(404).json({ message: "No submission found for this invite" });
      }
      const reveal = req.query.reveal === "true";
      if (reveal && req.appUser?.role !== "owner") {
        return res.status(403).json({ message: "Only owners can reveal sensitive data" });
      }
      if (reveal) {
        const { decryptOrFallback } = await import("./encryption");
        const revealed = {
          ...submission,
          ssn: decryptOrFallback(submission.ssn),
          routingNumber: decryptOrFallback(submission.routingNumber),
          accountNumber: decryptOrFallback(submission.accountNumber),
        };
        return res.json(revealed);
      }
      const { maskSSN, maskBankNumber } = await import("./encryption");
      const masked = {
        ...submission,
        ssn: maskSSN(submission.ssn),
        routingNumber: maskBankNumber(submission.routingNumber),
        accountNumber: maskBankNumber(submission.accountNumber),
      };
      res.json(masked);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === ONBOARDING DOCUMENTS (must be before :token route) ===
  app.get("/api/hr/onboarding/documents", isAuthenticated, isManager, async (_req, res) => {
    try {
      const docs = await storage.getOnboardingDocuments();
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hr/onboarding/documents/:type", async (req, res) => {
    try {
      const doc = await storage.getOnboardingDocumentByType(req.params.type);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hr/onboarding/documents/scan", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { images, documentType } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: "At least one image is required" });
      }

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const imageContent = images.map((img: string) => ({
        type: "image_url" as const,
        image_url: {
          url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`,
        }
      }));

      const typeLabel = documentType === "noncompete" ? "Non-Compete & Confidentiality Agreement" : "Employee Handbook";
      const multiPageNote = images.length > 1
        ? ` This document spans ${images.length} pages/photos. Combine ALL content from ALL images into one cohesive document.`
        : "";

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 16384,
        messages: [
          {
            role: "system",
            content: `You are an expert document processor for Bear's Cup Bakehouse, a professional bakery. Extract ALL text content from the uploaded document image${images.length > 1 ? "s" : ""} and format it into a clean, professional ${typeLabel}.${multiPageNote}

IMPORTANT GUIDELINES:
- Extract every piece of text from the document faithfully — preserve all legal language, policy specifics, dates, and terms exactly as written.
- Organize the content into clearly numbered SECTIONS with descriptive headings (e.g., "SECTION 1: WELCOME & MISSION").
- Use clean, consistent formatting: section headers in ALL CAPS, sub-sections numbered (1.1, 1.2, etc.), bullet points for lists.
- If text is blurry or unclear, make your best professional interpretation and mark uncertain text with (?).
- At the end, include an ACKNOWLEDGMENT section appropriate for the document type.
- Do NOT add content that isn't in the original document — only organize and format what's there.
- If the document appears to be incomplete, format what's available and note any apparent gaps.
- Output ONLY the formatted document text — no JSON wrapping, no commentary.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Please extract and professionally format this ${typeLabel} document:` },
              ...imageContent,
            ],
          }
        ],
      });

      const extractedText = response.choices[0]?.message?.content || "";
      res.json({ content: extractedText, pages: images.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/hr/onboarding/documents/:type", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { type } = req.params;
      const { title, content, rawContent } = req.body;
      if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required" });
      }
      const validTypes = ["handbook", "noncompete"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid document type" });
      }
      const doc = await storage.upsertOnboardingDocument({
        type,
        title,
        content,
        rawContent: rawContent || null,
        updatedBy: req.appUser.id,
        updatedAt: new Date(),
      });
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hr/onboarding/:token", async (req, res) => {
    try {
      const invite = await storage.getOnboardingInviteByToken(req.params.token);
      if (!invite) {
        return res.status(404).json({ message: "Onboarding link not found or expired" });
      }
      res.json({
        id: invite.id,
        firstName: invite.firstName,
        lastName: invite.lastName,
        email: invite.email,
        position: invite.position,
        department: invite.department,
        status: invite.status,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hr/onboarding/:token/submit", async (req, res) => {
    try {
      const invite = await storage.getOnboardingInviteByToken(req.params.token);
      if (!invite) {
        return res.status(404).json({ message: "Onboarding link not found" });
      }
      if (invite.status === "completed") {
        return res.status(400).json({ message: "This onboarding has already been completed" });
      }
      const { z } = await import("zod");
      const submissionSchema = z.object({
        legalFirstName: z.string().min(1, "First name is required"),
        legalLastName: z.string().min(1, "Last name is required"),
        middleName: z.string().optional().nullable(),
        ssn: z.string().regex(/^\d{9}$/, "SSN must be 9 digits"),
        dateOfBirth: z.string().min(1, "Date of birth is required"),
        address: z.string().min(1, "Address is required"),
        city: z.string().min(1, "City is required"),
        state: z.string().min(1, "State is required"),
        zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code"),
        phone: z.string().min(1, "Phone is required"),
        personalEmail: z.string().email("Invalid email"),
        emergencyContactName: z.string().min(1, "Emergency contact name is required"),
        emergencyContactPhone: z.string().min(1, "Emergency contact phone is required"),
        emergencyContactRelation: z.string().min(1, "Emergency contact relation is required"),
        federalFilingStatus: z.string().optional(),
        stateFilingStatus: z.string().optional(),
        allowances: z.number().int().min(0).optional(),
        bankName: z.string().optional().nullable(),
        routingNumber: z.string().optional().nullable(),
        accountNumber: z.string().optional().nullable(),
        accountType: z.enum(["checking", "savings"]).optional().nullable(),
        multipleJobs: z.boolean().optional(),
        dependentsChildAmount: z.number().int().min(0).optional(),
        dependentsOtherAmount: z.number().int().min(0).optional(),
        otherIncome: z.number().int().min(0).optional(),
        deductions: z.number().int().min(0).optional(),
        extraWithholding: z.number().int().min(0).optional(),
      });
      const parsed = submissionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Validation failed" });
      }
      const data = parsed.data;
      const { encryptSensitive } = await import("./encryption");
      const securedData = {
        ...data,
        ssn: encryptSensitive(data.ssn),
        routingNumber: data.routingNumber ? encryptSensitive(data.routingNumber) : null,
        accountNumber: data.accountNumber ? encryptSensitive(data.accountNumber) : null,
      };
      const existing = await storage.getOnboardingSubmissionByInviteId(invite.id);
      if (existing) {
        const updated = await storage.updateOnboardingSubmission(existing.id, securedData);
        await storage.updateOnboardingInviteStatus(invite.id, "in_progress");
        return res.json(updated);
      }
      const submission = await storage.createOnboardingSubmission({
        inviteId: invite.id,
        ...securedData,
      });
      await storage.updateOnboardingInviteStatus(invite.id, "in_progress");
      res.json(submission);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hr/onboarding/:token/handbook", async (req, res) => {
    try {
      const invite = await storage.getOnboardingInviteByToken(req.params.token);
      if (!invite) {
        return res.status(404).json({ message: "Onboarding link not found" });
      }
      const submission = await storage.getOnboardingSubmissionByInviteId(invite.id);
      if (!submission) {
        return res.status(400).json({ message: "Personal info must be submitted first" });
      }
      const updated = await storage.updateOnboardingSubmission(submission.id, {
        handbookAcknowledged: true,
        handbookAcknowledgedAt: new Date(),
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hr/onboarding/:token/noncompete", async (req, res) => {
    try {
      const invite = await storage.getOnboardingInviteByToken(req.params.token);
      if (!invite) {
        return res.status(404).json({ message: "Onboarding link not found" });
      }
      const submission = await storage.getOnboardingSubmissionByInviteId(invite.id);
      if (!submission) {
        return res.status(400).json({ message: "Personal info must be submitted first" });
      }
      const { digitalSignature } = req.body;
      if (!digitalSignature) {
        return res.status(400).json({ message: "Digital signature is required" });
      }
      const updated = await storage.updateOnboardingSubmission(submission.id, {
        nonCompeteAcknowledged: true,
        nonCompeteAcknowledgedAt: new Date(),
        digitalSignature,
        completedAt: new Date(),
      });
      await storage.updateOnboardingInviteStatus(invite.id, "completed", new Date());
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === THE FIRM — Financial Management ===

  // Firm Accounts
  app.get("/api/firm/accounts", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const accounts = await storage.getFirmAccounts();
      res.json(accounts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/accounts", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        type: z.enum(["checking", "savings", "credit_card", "cash", "petty_cash", "loan", "line_of_credit"]),
        institution: z.string().optional().nullable(),
        lastFour: z.string().optional().nullable(),
        currentBalance: z.number().default(0),
        creditLimit: z.number().optional().nullable(),
        interestRate: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
        isActive: z.boolean().default(true),
      });
      const input = schema.parse(req.body);
      const account = await storage.createFirmAccount(input);
      res.status(201).json(account);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/accounts/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const account = await storage.updateFirmAccount(Number(req.params.id), req.body);
      if (!account) return res.status(404).json({ message: "Account not found" });
      res.json(account);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/accounts/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      await storage.deleteFirmAccount(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Firm Transactions
  app.get("/api/firm/transactions", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const filters: any = {};
      if (req.query.startDate) filters.startDate = req.query.startDate;
      if (req.query.endDate) filters.endDate = req.query.endDate;
      if (req.query.accountId) filters.accountId = Number(req.query.accountId);
      if (req.query.category) filters.category = req.query.category;
      if (req.query.referenceType) filters.referenceType = req.query.referenceType;
      if (req.query.reconciled !== undefined) filters.reconciled = req.query.reconciled === "true";
      const transactions = await storage.getFirmTransactions(filters);
      res.json(transactions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/transactions", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const schema = z.object({
        accountId: z.number().optional().nullable(),
        date: z.string().min(1),
        description: z.string().min(1),
        amount: z.number(),
        category: z.enum(["revenue", "cogs", "labor", "supplies", "utilities", "rent", "insurance", "marketing", "debt_payment", "loan_principal", "loan_interest", "equipment", "leasehold", "taxes", "other_income", "travel_lodging", "repairs", "misc", "advertising", "car_mileage", "commissions", "contract_labor", "employee_benefits", "professional_services", "licenses_permits", "bank_charges", "amortization", "pension_plans", "llc_fee", "meals_deductible", "interest_mortgage", "interest_other", "technology", "owner_draw", "sales_tax_payment", "prior_period_adjustment"]),
        subcategory: z.string().optional().nullable(),
        referenceType: z.enum(["square", "invoice", "payroll", "tip", "obligation", "plaid", "manual"]).default("manual"),
        referenceId: z.string().optional().nullable(),
        reconciled: z.boolean().default(false),
        notes: z.string().optional().nullable(),
        tags: z.array(z.string()).optional().nullable(),
        department: z.enum(["kitchen", "front_of_house", "admin", "marketing", "delivery", "maintenance"]).optional().nullable(),
        departmentAllocations: z.array(z.object({ department: z.string(), amount: z.number(), percent: z.number() })).optional().nullable(),
        createdBy: z.string().min(1),
      });
      const input = schema.parse({ ...req.body, createdBy: req.appUser.id });
      const transaction = await storage.createFirmTransaction(input);
      res.status(201).json(transaction);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/transactions/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const txnId = Number(req.params.id);
      const updates = req.body;

      if (updates.category === "owner_draw") {
        const existing = await storage.getFirmTransaction(txnId);
        if (!existing) return res.status(404).json({ message: "Transaction not found" });

        const priorJEs = await db.select().from(journalEntries).where(
          or(
            and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "firm-txn")),
            and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "owner_draw"))
          )
        );
        for (const je of priorJEs) {
          await db.delete(ledgerLines).where(eq(ledgerLines.entryId, je.id));
          await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
        }

        const drawAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "3010")).limit(1);
        const creditAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2020")).limit(1);

        if (drawAccount.length > 0 && creditAccount.length > 0) {
          const absAmount = Math.abs(existing.amount);
          try {
            const { postJournalEntry } = await import("./accounting-engine");
            await postJournalEntry(
              {
                transactionDate: existing.date,
                description: `Owner's Draw — ${existing.description}`,
                referenceType: "owner_draw",
                referenceId: String(txnId),
                createdBy: req.appUser?.id || null,
              },
              [
                { accountId: drawAccount[0].id, debit: absAmount, credit: 0, memo: `Personal: ${existing.description}` },
                { accountId: creditAccount[0].id, debit: 0, credit: absAmount, memo: `Personal: ${existing.description}` },
              ]
            );
          } catch (jeErr: any) {
            console.error("[Owner Draw] Journal entry failed:", jeErr.message);
          }
        }

        try {
          await db.insert(aiInferenceLogs).values({
            transactionId: txnId,
            inputAmount: existing.amount,
            rawInput: JSON.stringify({ description: existing.description, date: existing.date, amount: existing.amount }),
            suggestedCategory: "owner_draw",
            suggestedCoaCode: "3010",
            confidence: 1.0,
            logicSummary: "Manual reclassification of personal expense to Owner's Draw (COA 3010). Not tax-deductible.",
            anomalyFlag: false,
            accepted: true,
          });
        } catch (logErr: any) {
          console.error("[Owner Draw] Audit log failed:", logErr.message);
        }
      }

      if (updates.category === "prior_period_adjustment") {
        const ppaTxn = await storage.getFirmTransaction(txnId);
        if (ppaTxn) {
          const priorJEs = await db.select().from(journalEntries).where(
            or(
              and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "firm-txn")),
              and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "prior_period"))
            )
          );
          for (const je of priorJEs) {
            await db.delete(ledgerLines).where(eq(ledgerLines.entryId, je.id));
            await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
          }

          const retainedEarningsAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "3020")).limit(1);
          const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);

          if (retainedEarningsAccount.length > 0 && cashAccount.length > 0) {
            const absAmount = Math.abs(ppaTxn.amount);
            try {
              const { postJournalEntry } = await import("./accounting-engine");
              await postJournalEntry(
                {
                  transactionDate: ppaTxn.date,
                  description: `Prior Period Adjustment — ${ppaTxn.description}`,
                  referenceType: "prior_period",
                  referenceId: String(txnId),
                  createdBy: req.appUser?.id || null,
                },
                [
                  { accountId: retainedEarningsAccount[0].id, debit: absAmount, credit: 0, memo: `Back-year settlement: ${ppaTxn.description}` },
                  { accountId: cashAccount[0].id, debit: 0, credit: absAmount, memo: `Back-year settlement: ${ppaTxn.description}` },
                ]
              );
            } catch (jeErr: any) {
              console.error("[Prior Period] Journal entry failed:", jeErr.message);
            }
          }

          try {
            await storage.createCategorizationLog({
              transactionId: txnId,
              suggestedCategory: "prior_period_adjustment",
              suggestedCoaCode: "3020",
              confidence: 1.0,
              logicSummary: `Prior period adjustment — back-year expense booked against Retained Earnings (COA 3020). Excluded from current P&L.`,
              anomalyFlag: false,
              accepted: true,
            });
          } catch (logErr: any) {
            console.error("[Prior Period] Audit log failed:", logErr.message);
          }
        }
      }

      if (updates.category === "loan_principal") {
        const loanTxn = await storage.getFirmTransaction(txnId);
        if (loanTxn) {
          const priorJEs = await db.select().from(journalEntries).where(
            or(
              and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "firm-txn")),
              and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "loan_principal"))
            )
          );
          for (const je of priorJEs) {
            await db.delete(ledgerLines).where(eq(ledgerLines.entryId, je.id));
            await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
          }

          const loansPayableAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2500")).limit(1);
          const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);

          if (loansPayableAccount.length > 0 && cashAccount.length > 0) {
            const absAmount = Math.abs(loanTxn.amount);
            try {
              const { postJournalEntry } = await import("./accounting-engine");
              await postJournalEntry(
                {
                  transactionDate: loanTxn.date,
                  description: `Loan Principal Payment — ${loanTxn.description}`,
                  referenceType: "loan_principal",
                  referenceId: String(txnId),
                  createdBy: req.appUser?.id || null,
                },
                [
                  { accountId: loansPayableAccount[0].id, debit: absAmount, credit: 0, memo: `Principal reduction: ${loanTxn.description}` },
                  { accountId: cashAccount[0].id, debit: 0, credit: absAmount, memo: `Principal reduction: ${loanTxn.description}` },
                ]
              );
            } catch (jeErr: any) {
              console.error("[Loan Principal] Journal entry failed:", jeErr.message);
            }
          }
        }
      }

      if (updates.category === "equipment" || updates.category === "leasehold") {
        const priorJEs = await db.select().from(journalEntries).where(
          and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "firm-txn"))
        );
        for (const je of priorJEs) {
          await db.delete(ledgerLines).where(eq(ledgerLines.entryId, je.id));
          await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
        }
        try {
          const { assetAssessor } = await import("./asset-engine");
          await assetAssessor.capitalizeSingleAsset(txnId, req.appUser?.username || req.appUser?.firstName || "System", updates.category);
        } catch (assetErr: any) {
          console.error("[CapEx] Auto-asset creation failed:", assetErr.message);
        }
      }

      if (updates.category === "sales_tax_payment") {
        const taxTxn = await storage.getFirmTransaction(txnId);
        if (taxTxn) {
          const priorJEs = await db.select().from(journalEntries).where(
            or(
              and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "firm-txn")),
              and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "sales_tax"))
            )
          );
          for (const je of priorJEs) {
            await db.delete(ledgerLines).where(eq(ledgerLines.entryId, je.id));
            await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
          }

          const taxLiabilityAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2030")).limit(1);
          const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);

          if (taxLiabilityAccount.length > 0 && cashAccount.length > 0) {
            const absAmount = Math.abs(taxTxn.amount);
            try {
              const { postJournalEntry } = await import("./accounting-engine");
              await postJournalEntry(
                {
                  transactionDate: taxTxn.date,
                  description: `Sales Tax Settlement — ${taxTxn.description}`,
                  referenceType: "sales_tax",
                  referenceId: String(txnId),
                  createdBy: req.appUser?.id || null,
                },
                [
                  { accountId: taxLiabilityAccount[0].id, debit: absAmount, credit: 0, memo: `Tax settlement: ${taxTxn.description}` },
                  { accountId: cashAccount[0].id, debit: 0, credit: absAmount, memo: `Tax settlement: ${taxTxn.description}` },
                ]
              );
            } catch (jeErr: any) {
              console.error("[Sales Tax] Journal entry failed:", jeErr.message);
            }
          }
        }
      }

      if (updates.category) {
        const existing = await storage.getFirmTransaction(txnId);
        if (existing) {
          const { prepaidAmortizations, prepaidAmortizationEntries } = await import("@shared/schema");
          const existingPrepaid = await db.select().from(prepaidAmortizations)
            .where(eq(prepaidAmortizations.transactionId, txnId)).limit(1);

          if (existingPrepaid.length > 0 && updates.category !== "amortization") {
            const prepaid = existingPrepaid[0];
            const prepaidEntries = await db.select().from(prepaidAmortizationEntries)
              .where(eq(prepaidAmortizationEntries.amortizationId, prepaid.id));
            for (const entry of prepaidEntries) {
              if (entry.journalEntryId) {
                await db.delete(ledgerLines).where(eq(ledgerLines.entryId, entry.journalEntryId));
                await db.delete(journalEntries).where(eq(journalEntries.id, entry.journalEntryId));
              }
            }
            await db.delete(prepaidAmortizationEntries).where(eq(prepaidAmortizationEntries.amortizationId, prepaid.id));
            if (prepaid.initialJournalEntryId) {
              await db.delete(ledgerLines).where(eq(ledgerLines.entryId, prepaid.initialJournalEntryId));
              await db.delete(journalEntries).where(eq(journalEntries.id, prepaid.initialJournalEntryId));
            }
            await db.delete(prepaidAmortizations).where(eq(prepaidAmortizations.id, prepaid.id));
            console.log(`[Amortize Cleanup] Removed prepaid #${prepaid.id} + all JEs for txn #${txnId} (re-categorized to ${updates.category})`);
          }

          if (updates.category === "amortization" && existingPrepaid.length > 0) {
            const updated = await storage.updateFirmTransaction(txnId, { category: "amortization" });
            return res.json(updated);
          }
        }
      }

      const SPECIAL_CATEGORIES = new Set(["owner_draw", "prior_period_adjustment", "loan_principal", "sales_tax_payment", "equipment", "rent_split", "debt_payment"]);
      const REVENUE_CATEGORIES = new Set(["revenue", "other_income"]);
      const CATEGORY_COA_MAP: Record<string, { debit: string; credit: string }> = {
        cogs: { debit: "5010", credit: "1010" },
        labor: { debit: "6010", credit: "1010" },
        supplies: { debit: "6090", credit: "1010" },
        utilities: { debit: "6040", credit: "1010" },
        rent: { debit: "6030", credit: "1010" },
        insurance: { debit: "6050", credit: "1010" },
        marketing: { debit: "6060", credit: "1010" },
        taxes: { debit: "6020", credit: "1010" },
        travel_lodging: { debit: "6140", credit: "1010" },
        repairs: { debit: "6070", credit: "1010" },
        advertising: { debit: "6060", credit: "1010" },
        car_mileage: { debit: "6150", credit: "1010" },
        vehicle_expense: { debit: "6155", credit: "1010" },
        commissions: { debit: "6160", credit: "1010" },
        contract_labor: { debit: "6170", credit: "1010" },
        employee_benefits: { debit: "6180", credit: "1010" },
        professional_services: { debit: "6100", credit: "1010" },
        licenses_permits: { debit: "6190", credit: "1010" },
        bank_charges: { debit: "6200", credit: "1010" },
        amortization: { debit: "6210", credit: "1010" },
        pension_plans: { debit: "6220", credit: "1010" },
        llc_fee: { debit: "6230", credit: "1010" },
        meals_deductible: { debit: "6240", credit: "1010" },
        interest_mortgage: { debit: "6250", credit: "1010" },
        interest_other: { debit: "6260", credit: "1010" },
        technology: { debit: "6080", credit: "1010" },
        misc: { debit: "6090", credit: "1010" },
        loan_interest: { debit: "6260", credit: "1010" },
        delivery: { debit: "6120", credit: "1010" },
        merchant_fees: { debit: "6110", credit: "1010" },
        depreciation: { debit: "6130", credit: "1010" },
        donations_charity: { debit: "7700", credit: "1010" },
        donations_promo: { debit: "7040", credit: "1010" },
      };

      if (updates.category && !SPECIAL_CATEGORIES.has(updates.category) && !REVENUE_CATEGORIES.has(updates.category) && CATEGORY_COA_MAP[updates.category]) {
        const existing = await storage.getFirmTransaction(txnId);
        if (existing) {
          const existingJE = await db.select().from(journalEntries).where(
            and(eq(journalEntries.referenceId, String(txnId)), eq(journalEntries.referenceType, "firm-txn"))
          ).limit(1);

          if (existingJE.length > 0) {
            for (const je of existingJE) {
              await db.delete(ledgerLines).where(eq(ledgerLines.entryId, je.id));
              await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
            }
            try {
              const { invalidateLineageCache } = await import("./audit-lineage-engine");
              invalidateLineageCache();
            } catch {}
          }

          {
            const absAmount = Math.abs(existing.amount);
            const { postJournalEntry } = await import("./accounting-engine");

            if (updates.category === "labor") {
              const activeAccruals = await db.select().from(journalEntries)
                .where(and(
                  eq(journalEntries.referenceType, "labor_accrual"),
                  eq(journalEntries.status, "posted")
                ));
              const hasActiveAccrual = activeAccruals.length > 0;

              if (hasActiveAccrual) {
                const payrollLiab = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2100")).limit(1);
                const cashAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);
                if (payrollLiab.length > 0 && cashAcct.length > 0) {
                  try {
                    await postJournalEntry(
                      {
                        transactionDate: existing.date,
                        description: `Payroll payment (accrual reversal): ${existing.description}`,
                        referenceType: "firm-txn",
                        referenceId: String(txnId),
                        status: "posted",
                        locationId: existing.locationId ?? undefined,
                        createdBy: req.appUser?.id || "system",
                      },
                      [
                        { accountId: payrollLiab[0].id, debit: absAmount, credit: 0, memo: `Reversal of accrued payroll: ${existing.description}` },
                        { accountId: cashAcct[0].id, debit: 0, credit: absAmount, memo: `Cash payment for payroll` },
                      ]
                    );
                    console.log(`[LaborAccrual] Bank txn #${txnId} reversed accrual: $${absAmount} — debit 2100, credit 1010`);
                  } catch (jeErr: any) {
                    console.error(`[LaborAccrual] Reversal JE failed:`, jeErr.message);
                  }
                }
              } else {
                const mapping = CATEGORY_COA_MAP[updates.category];
                const debitAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, mapping.debit)).limit(1);
                const creditAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, mapping.credit)).limit(1);
                if (debitAcct.length > 0 && creditAcct.length > 0) {
                  try {
                    await postJournalEntry(
                      {
                        transactionDate: existing.date,
                        description: existing.description,
                        referenceType: "firm-txn",
                        referenceId: String(txnId),
                        status: "posted",
                        locationId: existing.locationId ?? undefined,
                        createdBy: req.appUser?.id || "system",
                      },
                      [
                        { accountId: debitAcct[0].id, debit: absAmount, credit: 0, memo: existing.description },
                        { accountId: creditAcct[0].id, debit: 0, credit: absAmount, memo: existing.description },
                      ]
                    );
                  } catch (jeErr: any) {
                    console.error(`[Auto-Journal] Failed for labor:`, jeErr.message);
                  }
                }
              }
            } else {
              const mapping = CATEGORY_COA_MAP[updates.category];
              const debitAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, mapping.debit)).limit(1);
              const creditAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, mapping.credit)).limit(1);

              if (debitAcct.length > 0 && creditAcct.length > 0) {
                try {
                  await postJournalEntry(
                    {
                      transactionDate: existing.date,
                      description: existing.description,
                      referenceType: "firm-txn",
                      referenceId: String(txnId),
                      status: "posted",
                      locationId: existing.locationId ?? undefined,
                      createdBy: req.appUser?.id || "system",
                    },
                    [
                      { accountId: debitAcct[0].id, debit: absAmount, credit: 0, memo: existing.description },
                      { accountId: creditAcct[0].id, debit: 0, credit: absAmount, memo: existing.description },
                    ]
                  );
                } catch (jeErr: any) {
                  console.error(`[Auto-Journal] Failed for category ${updates.category}:`, jeErr.message);
                }
              }
            }
          }
        }
      }

      const transaction = await storage.updateFirmTransaction(txnId, updates);
      if (!transaction) return res.status(404).json({ message: "Transaction not found" });
      res.json(transaction);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/transactions/:id/split", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const parentId = Number(req.params.id);
      const { splits } = req.body;
      if (!splits || !Array.isArray(splits) || splits.length < 2) {
        return res.status(400).json({ message: "At least 2 splits required" });
      }

      for (const sp of splits) {
        const amt = Number(sp.amount);
        if (!sp.description || !String(sp.description).trim()) return res.status(400).json({ message: "Every split needs a description" });
        if (!sp.category || !String(sp.category).trim()) return res.status(400).json({ message: "Every split needs a category" });
        if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: `Invalid split amount: ${sp.amount}` });
      }

      const parent = await storage.getFirmTransaction(parentId);
      if (!parent) return res.status(404).json({ message: "Transaction not found" });

      const parentAmount = Math.round(Math.abs(Number(parent.amount)) * 100) / 100;
      const splitTotal = Math.round(splits.reduce((s: number, sp: any) => s + Math.abs(Number(sp.amount)), 0) * 100) / 100;

      if (Math.abs(splitTotal - parentAmount) > 0.02) {
        return res.status(400).json({
          message: `Split total ($${splitTotal.toFixed(2)}) doesn't match parent ($${parentAmount.toFixed(2)}). Variance: $${Math.abs(splitTotal - parentAmount).toFixed(2)}`
        });
      }

      const isDebit = Number(parent.amount) < 0;
      if (!isDebit) {
        const specialCats = splits.filter((sp: any) => ["prior_period_adjustment", "owner_draw", "loan_principal"].includes(sp.category));
        if (specialCats.length > 0) {
          return res.status(400).json({ message: "Cannot split a credit/inflow transaction into prior_period_adjustment, owner_draw, or loan_principal categories (those require outflows)" });
        }
      }

      const createdTxns: any[] = [];

      for (const sp of splits) {
        const amount = isDebit ? -Math.abs(Number(sp.amount)) : Math.abs(Number(sp.amount));
        const newTxn = await storage.createFirmTransaction({
          accountId: parent.accountId,
          date: parent.date,
          description: String(sp.description).trim(),
          amount,
          category: String(sp.category).trim(),
          referenceType: parent.referenceType,
          referenceId: parent.referenceId ? `${parent.referenceId}_split` : null,
          reconciled: false,
          notes: `Split from TX #${parentId} (${parent.description})`,
          createdBy: req.appUser?.id || null,
          locationId: parent.locationId,
        });
        createdTxns.push(newTxn);
      }

      await storage.deleteFirmTransaction(parentId);

      const { postJournalEntry } = await import("./accounting-engine");

      for (const txn of createdTxns) {
        if (txn.category === "prior_period_adjustment") {
          const retainedEarningsAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "3020")).limit(1);
          const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);
          if (retainedEarningsAccount.length > 0 && cashAccount.length > 0) {
            const absAmount = Math.abs(txn.amount);
            await postJournalEntry(
              { transactionDate: txn.date, description: `Prior Period Adjustment — ${txn.description}`, referenceType: "prior_period", referenceId: String(txn.id), createdBy: req.user?.id || null },
              [
                { accountId: retainedEarningsAccount[0].id, debit: absAmount, credit: 0, memo: `Back-year settlement: ${txn.description}` },
                { accountId: cashAccount[0].id, debit: 0, credit: absAmount, memo: `Back-year settlement: ${txn.description}` },
              ]
            );
          }
        }

        if (txn.category === "owner_draw") {
          const drawAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "3010")).limit(1);
          const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);
          if (drawAccount.length > 0 && cashAccount.length > 0) {
            const absAmount = Math.abs(txn.amount);
            await postJournalEntry(
              { transactionDate: txn.date, description: `Owner's Draw — ${txn.description}`, referenceType: "owner_draw", referenceId: String(txn.id), createdBy: req.user?.id || null },
              [
                { accountId: drawAccount[0].id, debit: absAmount, credit: 0, memo: `Personal distribution: ${txn.description}` },
                { accountId: cashAccount[0].id, debit: 0, credit: absAmount, memo: `Personal distribution: ${txn.description}` },
              ]
            );
          }
        }
      }

      console.log(`[Split] TX #${parentId} ($${parentAmount}) → ${createdTxns.length} children: ${createdTxns.map(t => `${t.category} $${Math.abs(t.amount)}`).join(", ")}`);
      res.json({ success: true, parentDeleted: parentId, children: createdTxns });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/transactions/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      await storage.deleteFirmTransaction(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/reconciliation", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });

      const bankTxns = await storage.getFirmTransactions({ startDate: startDate as string, endDate: endDate as string });
      const bankEntries = bankTxns.filter(t => t.referenceType === "plaid");
      const internalEntries = bankTxns.filter(t => t.referenceType !== "plaid");

      const invoiceList = await db.select().from(invoices);
      const filteredInvoices = invoiceList.filter(inv =>
        inv.invoiceDate && inv.invoiceDate >= (startDate as string) && inv.invoiceDate <= (endDate as string)
      );

      const allAccounts = await storage.getFirmAccounts();
      const accountMap = new Map(allAccounts.map(a => [a.id, a]));

      const allInvoiceLines = filteredInvoices.length > 0
        ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, filteredInvoices.map(i => i.id)))
        : [];

      const unreconciledInternal: any[] = [];
      for (const inv of filteredInvoices) {
        const matchedTxn = bankTxns.find(t =>
          t.reconciled && t.referenceType === "invoice" && t.referenceId === String(inv.id)
        );
        if (!matchedTxn) {
          let invAmount = inv.invoiceTotal || 0;
          if (invAmount === 0) {
            const lines = allInvoiceLines.filter(l => l.invoiceId === inv.id);
            invAmount = lines.reduce((sum, l) => {
              if (l.lineTotal != null) return sum + l.lineTotal;
              if (l.unitPrice != null && l.quantity != null) return sum + (l.unitPrice * l.quantity);
              return sum;
            }, 0);
          }
          unreconciledInternal.push({
            type: "invoice",
            id: inv.id,
            date: inv.invoiceDate,
            description: `${inv.vendorName} Invoice${inv.invoiceNumber ? ` #${inv.invoiceNumber}` : ""}`,
            amount: -invAmount,
            vendor: inv.vendorName,
            category: "cogs",
            reconciled: false,
            matchedBankTxnId: null,
          });
        }
      }

      for (const txn of internalEntries) {
        if (!txn.reconciled) {
          unreconciledInternal.push({
            type: txn.referenceType,
            id: txn.id,
            date: txn.date,
            description: txn.description,
            amount: txn.amount,
            vendor: null,
            category: txn.category,
            reconciled: false,
            matchedBankTxnId: null,
          });
        }
      }

      const unreconciledBank = bankEntries.filter(t => !t.reconciled).map(t => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: t.category,
        accountId: t.accountId,
        accountName: t.accountId ? accountMap.get(t.accountId)?.name || "Unknown" : null,
        institution: t.accountId ? accountMap.get(t.accountId)?.institution || null : null,
        reconciled: false,
        referenceId: t.referenceId,
        notes: t.notes,
        suggestedCoaCode: t.suggestedCoaCode,
        suggestedCategory: t.suggestedCategory,
        suggestedConfidence: t.suggestedConfidence,
        suggestedRuleId: t.suggestedRuleId,
      }));

      const reconciledItems = bankTxns.filter(t => t.reconciled).map(t => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: t.category,
        referenceType: t.referenceType,
        accountId: t.accountId,
        accountName: t.accountId ? accountMap.get(t.accountId)?.name || "Unknown" : null,
      }));

      res.json({
        unreconciledInternal,
        unreconciledBank,
        reconciledItems,
        summary: {
          totalUnreconciledInternal: unreconciledInternal.length,
          totalUnreconciledBank: unreconciledBank.length,
          totalReconciled: reconciledItems.length,
          unreconciledInternalAmount: unreconciledInternal.reduce((s, e) => s + e.amount, 0),
          unreconciledBankAmount: unreconciledBank.reduce((s, e) => s + e.amount, 0),
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/reconcile", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { bankTxnId, internalType, internalId, category, notes } = req.body;

      if (bankTxnId) {
        await storage.updateFirmTransaction(bankTxnId, {
          reconciled: true,
          ...(category && { category }),
          ...(notes && { notes }),
          ...(internalType === "invoice" && internalId && {
            referenceType: "invoice",
            referenceId: String(internalId),
          }),
        });

        if (category) {
          const txn = await db.select().from(firmTransactions).where(eq(firmTransactions.id, bankTxnId)).limit(1);
          if (txn.length > 0) {
            const { extractVendorToken, learnVendorRule, autoSweepUnreconciled } = await import("./reconciler");
            const vendorString = extractVendorToken(txn[0].description);
            if (vendorString.length >= 3) {
              const allAccounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.isActive, true));
              const categoryToCoaMap: Record<string, string> = {
                cogs: "5010", revenue: "4010", labor: "6010", rent: "6030", utilities: "6040",
                insurance: "6050", supplies: "6090", marketing: "6060", technology: "6080",
                professional_services: "6100", misc: "6090", equipment: "1500", leasehold: "1520",
                travel_lodging: "6140", repairs: "6070", bank_charges: "6200",
              };
              const coaCode = categoryToCoaMap[category] || "6090";
              const coaAccount = allAccounts.find(a => a.code === coaCode);
              const coaName = coaAccount?.name || category;

              const user = await getUserFromReq(req);
              const rule = await learnVendorRule(vendorString, coaCode, coaName, category, user?.username || "Unknown");
              await autoSweepUnreconciled(vendorString, coaCode, category, rule.id, coaName);
            }
          }
        }
      }

      if (internalType === "manual" && internalId) {
        await storage.updateFirmTransaction(internalId, { reconciled: true });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/reconcile/batch-accept", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { transactionIds } = req.body;
      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({ message: "transactionIds array required" });
      }

      const txns = await db.select().from(firmTransactions)
        .where(and(
          inArray(firmTransactions.id, transactionIds),
          eq(firmTransactions.reconciled, false)
        ));

      const validTxns = txns.filter(t => t.suggestedCoaCode && (t.suggestedConfidence || 0) >= 0.95);
      if (validTxns.length === 0) {
        return res.status(400).json({ message: "No valid high-confidence transactions to accept" });
      }

      const allAccounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.isActive, true));
      const codeToId = new Map(allAccounts.map(a => [a.code, a.id]));
      const cashAccountId = codeToId.get("1010");
      if (!cashAccountId) {
        return res.status(500).json({ message: "Cash account (1010) not found" });
      }

      const ruleIds = [...new Set(validTxns.map(t => t.suggestedRuleId).filter(Boolean))] as number[];
      const ruleMap = new Map<number, any>();
      if (ruleIds.length > 0) {
        const rules = await db.select().from(aiLearningRules).where(inArray(aiLearningRules.id, ruleIds));
        for (const rule of rules) ruleMap.set(rule.id, rule);
      }

      const results = await db.transaction(async (tx) => {
        const txResults: any[] = [];

        for (const txn of validTxns) {
          const targetAccountId = codeToId.get(txn.suggestedCoaCode!);
          if (!targetAccountId) continue;

          const absAmount = Math.abs(txn.amount);
          const isExpense = txn.amount < 0;

          const jeLines = isExpense
            ? [
                { accountId: targetAccountId, debit: absAmount, credit: 0, memo: `Auto-reconciled: ${txn.description}` },
                { accountId: cashAccountId, debit: 0, credit: absAmount, memo: null as string | null },
              ]
            : [
                { accountId: cashAccountId, debit: absAmount, credit: 0, memo: null as string | null },
                { accountId: targetAccountId, debit: 0, credit: absAmount, memo: `Auto-reconciled: ${txn.description}` },
              ];

          const [journalEntry] = await tx.insert(journalEntries).values({
            transactionDate: txn.date,
            description: txn.description,
            referenceId: String(txn.id),
            referenceType: "batch_reconcile",
            status: "reconciled",
            createdBy: "batch-reconciler",
          }).returning();

          const createdLines = [];
          for (const line of jeLines) {
            const [created] = await tx.insert(ledgerLines).values({
              entryId: journalEntry.id,
              accountId: line.accountId,
              debit: line.debit || 0,
              credit: line.credit || 0,
              memo: line.memo || null,
            }).returning();
            createdLines.push(created);
          }

          await tx.update(firmTransactions).set({
            reconciled: true,
            category: txn.suggestedCategory || txn.category,
          }).where(eq(firmTransactions.id, txn.id));

          const coaAccount = allAccounts.find(a => a.code === txn.suggestedCoaCode);
          const rule = txn.suggestedRuleId ? ruleMap.get(txn.suggestedRuleId) : null;
          const ruleInfo = rule
            ? `Matched Global Rule #${rule.id}: ${rule.vendorString} → ${rule.matchedCoaCode} ${rule.matchedCoaName}`
            : "";

          await tx.insert(aiInferenceLogs).values({
            firmTransactionId: txn.id,
            journalEntryId: journalEntry.id,
            ledgerLineId: createdLines[0]?.id || null,
            rawInput: `${txn.description} | $${txn.amount} | ${txn.date}`,
            promptVersion: "batch-accept-v1",
            logicSummary: ruleInfo || `Auto-allocated to ${txn.suggestedCoaCode} ${coaAccount?.name || ""} with ${((txn.suggestedConfidence || 0) * 100).toFixed(0)}% confidence`,
            confidenceScore: txn.suggestedConfidence || 0.99,
            anomalyFlag: false,
            anomalyScore: 0,
            suggestedCoaCode: txn.suggestedCoaCode,
            appliedCoaCode: txn.suggestedCoaCode,
          });

          txResults.push({ transactionId: txn.id, journalEntryId: journalEntry.id });
        }

        return txResults;
      });

      res.json({ success: true, accepted: results.length, results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/transactions/:id/inference-log", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const txnId = Number(req.params.id);
      const logs = await db.select({
        id: aiInferenceLogs.id,
        firmTransactionId: aiInferenceLogs.firmTransactionId,
        journalEntryId: aiInferenceLogs.journalEntryId,
        ledgerLineId: aiInferenceLogs.ledgerLineId,
        rawInput: aiInferenceLogs.rawInput,
        promptVersion: aiInferenceLogs.promptVersion,
        logicSummary: aiInferenceLogs.logicSummary,
        confidenceScore: aiInferenceLogs.confidenceScore,
        anomalyFlag: aiInferenceLogs.anomalyFlag,
        suggestedCoaCode: aiInferenceLogs.suggestedCoaCode,
        appliedCoaCode: aiInferenceLogs.appliedCoaCode,
        createdAt: aiInferenceLogs.createdAt,
      }).from(aiInferenceLogs)
        .where(
          or(
            eq(aiInferenceLogs.firmTransactionId, txnId),
            sql`${aiInferenceLogs.journalEntryId} IN (SELECT id FROM journal_entries WHERE reference_id = ${String(txnId)})`
          )
        )
        .orderBy(desc(aiInferenceLogs.createdAt));
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/export-qb", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });

      const txns = await storage.getFirmTransactions({ startDate: startDate as string, endDate: endDate as string });

      const qbCategoryMap: Record<string, string> = {
        cogs: "Cost of Goods Sold",
        revenue: "Sales Income",
        labor: "Payroll Expenses",
        rent: "Rent or Lease",
        utilities: "Utilities",
        insurance: "Insurance",
        supplies: "Office Supplies",
        marketing: "Advertising/Marketing",
        debt_payment: "Loan Payment",
        loan_interest: "Interest Expense",
        equipment: "Equipment",
        taxes: "Taxes & Licenses",
        misc: "Miscellaneous",
        other_income: "Other Income",
      };

      const allAccounts = await storage.getFirmAccounts();
      const accountMap = new Map(allAccounts.map(a => [a.id, a]));

      const rows = txns.map(t => ({
        Date: t.date,
        Description: t.description,
        Amount: Math.abs(t.amount).toFixed(2),
        "Debit/Credit": t.amount < 0 ? "Debit" : "Credit",
        Category: qbCategoryMap[t.category] || t.category,
        Account: t.accountId ? accountMap.get(t.accountId)?.name || "" : "",
        "Reference Type": t.referenceType,
        "Reference ID": t.referenceId || "",
        Reconciled: t.reconciled ? "Yes" : "No",
        Department: t.department || "",
        Notes: t.notes || "",
      }));

      const headers = Object.keys(rows[0] || {});
      const csv = [headers.join(","), ...rows.map(r => headers.map(h => {
        const val = String((r as any)[h] || "").replace(/"/g, '""');
        return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val}"` : val;
      }).join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="quickbooks_export_${startDate}_to_${endDate}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/export-yearend", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const year = parseInt(req.query.year as string);
      if (!year || year < 2020 || year > 2099) return res.status(400).json({ message: "Valid year parameter required (2020-2099)" });

      const { generateYearEndExport } = await import("./yearend-export-engine");
      const exportData = await generateYearEndExport(year);

      const filename = `bears-cup-yearend-${year}.json`;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(exportData, null, 2));
    } catch (err: any) {
      console.error("[Year-End Export] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // Firm Obligations
  app.get("/api/firm/obligations", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const obligations = await storage.getFirmObligations();
      res.json(obligations);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/obligations", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        type: z.enum(["loan", "lease", "subscription", "recurring_bill", "line_of_credit"]),
        accountId: z.number().optional().nullable(),
        creditor: z.string().min(1),
        originalAmount: z.number().optional().nullable(),
        currentBalance: z.number().optional().nullable(),
        monthlyPayment: z.number(),
        interestRate: z.number().optional().nullable(),
        paymentDueDay: z.number().min(1).max(31).optional().nullable(),
        frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]).default("monthly"),
        startDate: z.string().min(1),
        endDate: z.string().optional().nullable(),
        nextPaymentDate: z.string().optional().nullable(),
        autopay: z.boolean().default(false),
        category: z.string().default("misc"),
        notes: z.string().optional().nullable(),
        isActive: z.boolean().default(true),
      });
      const input = schema.parse(req.body);
      const obligation = await storage.createFirmObligation(input);
      res.status(201).json(obligation);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/obligations/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const obligation = await storage.updateFirmObligation(Number(req.params.id), req.body);
      if (!obligation) return res.status(404).json({ message: "Obligation not found" });
      res.json(obligation);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/obligations/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      await storage.deleteFirmObligation(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/obligations/:id/record-payment", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const obligation = await storage.getFirmObligation(Number(req.params.id));
      if (!obligation) return res.status(404).json({ message: "Obligation not found" });

      const paymentDate = req.body.date || new Date().toISOString().slice(0, 10);
      const paymentAmount = req.body.amount || obligation.monthlyPayment;

      const transaction = await storage.createFirmTransaction({
        accountId: obligation.accountId,
        date: paymentDate,
        description: `Payment: ${obligation.name} (${obligation.creditor})`,
        amount: -Math.abs(paymentAmount),
        category: obligation.category,
        subcategory: null,
        referenceType: "obligation",
        referenceId: String(obligation.id),
        reconciled: false,
        notes: req.body.notes || null,
        createdBy: req.appUser.id,
      });

      const updates: any = {};
      if (obligation.currentBalance !== null && obligation.currentBalance !== undefined) {
        updates.currentBalance = Math.max(0, obligation.currentBalance - Math.abs(paymentAmount));
      }

      if (obligation.nextPaymentDate) {
        const next = new Date(obligation.nextPaymentDate);
        switch (obligation.frequency) {
          case "weekly": next.setDate(next.getDate() + 7); break;
          case "biweekly": next.setDate(next.getDate() + 14); break;
          case "monthly": next.setMonth(next.getMonth() + 1); break;
          case "quarterly": next.setMonth(next.getMonth() + 3); break;
          case "annual": next.setFullYear(next.getFullYear() + 1); break;
        }
        updates.nextPaymentDate = next.toISOString().slice(0, 10);
      }

      const updatedObligation = Object.keys(updates).length > 0
        ? await storage.updateFirmObligation(obligation.id, updates)
        : obligation;

      res.json({ transaction, obligation: updatedObligation });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Firm Payroll
  app.get("/api/firm/payroll", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const filters: any = {};
      if (req.query.startDate) filters.startDate = req.query.startDate;
      if (req.query.endDate) filters.endDate = req.query.endDate;
      const entries = await storage.getFirmPayrollEntries(filters);
      res.json(entries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/payroll", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const schema = z.object({
        employeeName: z.string().min(1),
        employeeId: z.string().optional().nullable(),
        payPeriodStart: z.string().min(1),
        payPeriodEnd: z.string().min(1),
        grossAmount: z.number(),
        deductions: z.number().default(0),
        netAmount: z.number(),
        paymentMethod: z.enum(["cash", "check", "direct_deposit", "venmo", "zelle"]),
        datePaid: z.string().min(1),
        accountId: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
        createdBy: z.string().min(1),
      });
      const input = schema.parse({ ...req.body, createdBy: req.appUser.id });
      const entry = await storage.createFirmPayrollEntry(input);

      await storage.createFirmTransaction({
        accountId: input.accountId || null,
        date: input.datePaid,
        description: `Payroll: ${input.employeeName} (${input.payPeriodStart} - ${input.payPeriodEnd})`,
        amount: -Math.abs(input.netAmount),
        category: "labor",
        subcategory: null,
        referenceType: "payroll",
        referenceId: String(entry.id),
        reconciled: false,
        notes: input.notes || null,
        createdBy: input.createdBy,
      });

      res.status(201).json(entry);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/payroll/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const entry = await storage.updateFirmPayrollEntry(Number(req.params.id), req.body);
      if (!entry) return res.status(404).json({ message: "Payroll entry not found" });
      res.json(entry);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/payroll/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      await storage.deleteFirmPayrollEntry(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Firm Cash Counts
  app.get("/api/firm/cash-counts", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const filters: any = {};
      if (req.query.startDate) filters.startDate = req.query.startDate;
      if (req.query.endDate) filters.endDate = req.query.endDate;
      if (req.query.locationId) filters.locationId = Number(req.query.locationId);
      const counts = await storage.getFirmCashCounts(filters);
      res.json(counts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/cash-counts", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const schema = z.object({
        date: z.string().min(1),
        locationId: z.number().optional().nullable(),
        countedBy: z.string().min(1),
        expectedAmount: z.number(),
        actualAmount: z.number(),
        variance: z.number(),
        denominations: z.any().optional().nullable(),
        notes: z.string().optional().nullable(),
      });
      const input = schema.parse({ ...req.body, countedBy: req.appUser.id });
      const count = await storage.createFirmCashCount(input);
      res.status(201).json(count);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/cash-counts/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const count = await storage.updateFirmCashCount(Number(req.params.id), req.body);
      if (!count) return res.status(404).json({ message: "Cash count not found" });
      res.json(count);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PLAID INTEGRATION ===
  app.post("/api/plaid/create-link-token", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { plaidClient, Products, CountryCode } = await import("./plaid");
      const request = {
        user: { client_user_id: req.appUser.id },
        client_name: "Bear's Cup Bakehouse",
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: "en",
      };
      const response = await plaidClient.linkTokenCreate(request);
      res.json({ link_token: response.data.link_token });
    } catch (err: any) {
      console.error("[Plaid] Link token error:", err.response?.data || err.message);
      res.status(500).json({ message: "Failed to create link token" });
    }
  });

  app.post("/api/plaid/exchange-token", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { plaidClient, mapPlaidAccountType } = await import("./plaid");
      const { public_token, institution } = req.body;
      const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
      const accessToken = exchangeResponse.data.access_token;
      const itemId = exchangeResponse.data.item_id;

      const plaidItem = await storage.createPlaidItem({
        itemId,
        accessToken,
        institutionId: institution?.institution_id || null,
        institutionName: institution?.name || null,
        status: "active",
        createdBy: req.appUser.id,
      });

      const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
      const linkedAccounts = [];

      for (const acct of accountsResponse.data.accounts) {
        const firmType = mapPlaidAccountType(acct.type, acct.subtype || null);
        const firmAccount = await storage.createFirmAccount({
          name: acct.name,
          type: firmType,
          institution: institution?.name || "",
          lastFour: acct.mask || "",
          currentBalance: acct.balances.current || 0,
          creditLimit: acct.balances.limit || undefined,
          notes: `Linked via Plaid (${acct.official_name || acct.name})`,
          isActive: true,
        });

        const plaidAccount = await storage.createPlaidAccount({
          plaidItemId: plaidItem.id,
          accountId: acct.account_id,
          firmAccountId: firmAccount.id,
          name: acct.name,
          officialName: acct.official_name || null,
          type: acct.type,
          subtype: acct.subtype || null,
          mask: acct.mask || null,
          currentBalance: acct.balances.current || 0,
          availableBalance: acct.balances.available || null,
          creditLimit: acct.balances.limit || null,
          isoCurrencyCode: acct.balances.iso_currency_code || "USD",
          lastUpdated: new Date(),
        });

        linkedAccounts.push({ plaidAccount, firmAccount });
      }

      const { accessToken: _omit, ...safeItem } = plaidItem;
      res.json({ item: safeItem, accounts: linkedAccounts.map(la => ({ firmAccount: la.firmAccount, plaidAccount: la.plaidAccount })) });
    } catch (err: any) {
      console.error("[Plaid] Token exchange error:", err.response?.data || err.message);
      res.status(500).json({ message: "Failed to link account" });
    }
  });

  app.post("/api/plaid/sync-balances", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { plaidClient } = await import("./plaid");
      const items = await storage.getPlaidItems();
      let updated = 0;

      for (const item of items) {
        if (item.status !== "active") continue;
        try {
          const response = await plaidClient.accountsGet({ access_token: item.accessToken });
          for (const acct of response.data.accounts) {
            const plaidAcct = await storage.getPlaidAccountByAccountId(acct.account_id);
            if (plaidAcct) {
              const plaidCurrent = acct.balances.current || 0;
              const plaidAvailable = acct.balances.available;
              await storage.updatePlaidAccount(plaidAcct.id, {
                currentBalance: plaidCurrent,
                availableBalance: plaidAvailable ?? null,
                creditLimit: acct.balances.limit || null,
                lastUpdated: new Date(),
              });
              if (plaidAcct.firmAccountId) {
                const acctType = acct.type || "";
                const useAvailable = ["depository"].includes(acctType) && plaidAvailable != null;
                await storage.updateFirmAccount(plaidAcct.firmAccountId, {
                  currentBalance: useAvailable ? plaidAvailable : plaidCurrent,
                  creditLimit: acct.balances.limit || undefined,
                });
              }
              updated++;
            }
          }
          await storage.updatePlaidItem(item.id, { lastSynced: new Date() });
        } catch (itemErr: any) {
          console.error(`[Plaid] Sync error for item ${item.id}:`, itemErr.response?.data || itemErr.message);
        }
      }
      res.json({ updated, itemCount: items.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/plaid/sync-transactions", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { plaidClient } = await import("./plaid");
      const items = await storage.getPlaidItems();
      let added = 0;

      for (const item of items) {
        if (item.status !== "active") continue;
        try {
          let hasMore = true;
          let cursor = item.cursor || undefined;

          while (hasMore) {
            const response = await plaidClient.transactionsSync({
              access_token: item.accessToken,
              cursor,
            });

            for (const txn of response.data.added) {
              const plaidAcct = await storage.getPlaidAccountByAccountId(txn.account_id);
              const firmAccountId = plaidAcct?.firmAccountId || null;
              const txnAmount = -(txn.amount || 0);
              const txnDesc = txn.name || txn.merchant_name || "Plaid Transaction";

              const dayBefore = new Date(txn.date);
              dayBefore.setDate(dayBefore.getDate() - 1);
              const dayAfter = new Date(txn.date);
              dayAfter.setDate(dayAfter.getDate() + 1);
              const nearby = await storage.getFirmTransactions({
                startDate: dayBefore.toISOString().split("T")[0],
                endDate: dayAfter.toISOString().split("T")[0],
              });

              const isDupe = nearby.some(e =>
                e.referenceType === "plaid" && (
                  e.referenceId === txn.transaction_id ||
                  (e.accountId === firmAccountId && Math.abs(Number(e.amount) - txnAmount) < 0.01)
                )
              );
              if (isDupe) continue;

              let category = "misc";
              if (txn.personal_finance_category?.primary) {
                const pc = txn.personal_finance_category.primary.toLowerCase();
                if (pc.includes("food") || pc.includes("groceries")) category = "cogs";
                else if (pc.includes("rent")) category = "rent";
                else if (pc.includes("utilities")) category = "utilities";
                else if (pc.includes("insurance")) category = "insurance";
                else if (pc.includes("transfer")) category = "misc";
                else if (pc.includes("income") || pc.includes("deposit")) category = "revenue";
                else if (pc.includes("loan") || pc.includes("debt")) category = "debt_payment";
              }

              await storage.createFirmTransaction({
                accountId: firmAccountId,
                date: txn.date,
                description: txnDesc,
                amount: txnAmount,
                category,
                referenceType: "plaid",
                referenceId: txn.transaction_id,
                reconciled: false,
                notes: txn.merchant_name ? `Merchant: ${txn.merchant_name}` : null,
                createdBy: req.appUser.id,
              });
              added++;
            }

            cursor = response.data.next_cursor;
            hasMore = response.data.has_more;
          }

          if (cursor) {
            await storage.updatePlaidItem(item.id, { cursor, lastSynced: new Date() });
          }
        } catch (itemErr: any) {
          console.error(`[Plaid] Txn sync error for item ${item.id}:`, itemErr.response?.data || itemErr.message);
        }
      }
      res.json({ added, itemCount: items.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/plaid/pull-historical", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { plaidClient } = await import("./plaid");
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required (YYYY-MM-DD)" });

      const items = await storage.getPlaidItems();
      let added = 0;
      let skipped = 0;

      for (const item of items) {
        if (item.status !== "active") continue;
        try {
          let offset = 0;
          let totalTxns = 1;

          while (offset < totalTxns) {
            const response = await plaidClient.transactionsGet({
              access_token: item.accessToken,
              start_date: startDate,
              end_date: endDate,
              options: { count: 500, offset },
            });

            totalTxns = response.data.total_transactions;

            for (const txn of response.data.transactions) {
              const plaidAcct = await storage.getPlaidAccountByAccountId(txn.account_id);
              const firmAccountId = plaidAcct?.firmAccountId || null;
              const txnAmount = -(txn.amount || 0);
              const txnDesc = txn.name || txn.merchant_name || "Plaid Transaction";

              const dayBefore = new Date(txn.date);
              dayBefore.setDate(dayBefore.getDate() - 1);
              const dayAfter = new Date(txn.date);
              dayAfter.setDate(dayAfter.getDate() + 1);
              const nearby = await storage.getFirmTransactions({
                startDate: dayBefore.toISOString().split("T")[0],
                endDate: dayAfter.toISOString().split("T")[0],
              });

              const isDupe = nearby.some(e =>
                e.referenceType === "plaid" && (
                  e.referenceId === txn.transaction_id ||
                  (e.accountId === firmAccountId && Math.abs(Number(e.amount) - txnAmount) < 0.01)
                )
              );
              if (isDupe) { skipped++; continue; }

              let category = "misc";
              if (txn.personal_finance_category?.primary) {
                const pc = txn.personal_finance_category.primary.toLowerCase();
                const desc = (txn.name || txn.merchant_name || "").toLowerCase();
                if (pc.includes("food") || pc.includes("groceries")) category = "cogs";
                else if (pc.includes("rent")) category = "rent";
                else if (pc.includes("utilities")) category = "utilities";
                else if (pc.includes("insurance")) category = "insurance";
                else if (pc.includes("payroll") || pc.includes("wages") || pc.includes("salary")) category = "labor";
                else if (pc.includes("transfer")) category = "misc";
                else if (pc.includes("income") || pc.includes("deposit")) category = "revenue";
                else if (pc.includes("loan") || pc.includes("debt")) category = "debt_payment";
                else if (desc.includes("adp") || desc.includes("payroll") || desc.includes("paychex") || desc.includes("gusto")) category = "labor";
              } else {
                const desc = (txn.name || txn.merchant_name || "").toLowerCase();
                if (desc.includes("adp") || desc.includes("payroll") || desc.includes("paychex") || desc.includes("gusto")) category = "labor";
              }

              await storage.createFirmTransaction({
                accountId: firmAccountId,
                date: txn.date,
                description: txnDesc,
                amount: txnAmount,
                category,
                referenceType: "plaid",
                referenceId: txn.transaction_id,
                reconciled: false,
                notes: txn.merchant_name ? `Merchant: ${txn.merchant_name}` : null,
                createdBy: req.appUser.id,
              });
              added++;
            }

            offset += response.data.transactions.length;
          }
        } catch (itemErr: any) {
          console.error(`[Plaid] Historical pull error for item ${item.id}:`, itemErr.response?.data || itemErr.message);
        }
      }

      console.log(`[Plaid] Historical pull ${startDate} to ${endDate}: ${added} added, ${skipped} duplicates skipped`);
      res.json({ added, skipped, itemCount: items.length, period: `${startDate} to ${endDate}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/import-csv-2025", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const { postJournalEntry, createJournalEntry } = await import("./accounting-engine");

      const csvPath = path.resolve("attached_assets/transactions_(1)_1774894808831.csv");
      if (!fs.existsSync(csvPath)) return res.status(404).json({ message: "CSV file not found" });

      const raw = fs.readFileSync(csvPath, "utf-8");
      const lines = raw.split("\n").filter(l => l.trim());
      const dataLines = lines.slice(1);

      const FIRM_ACCOUNT_ID = 13;

      const SPECIAL_CHECKS: Record<string, { category: string; coaCode: string; notes: string }> = {
        "1030": { category: "prepaid_expense", coaCode: "1200", notes: "Prepaid rent - amortize $8,750/mo Jan-Jul to 6030 Rent" },
        "1031": { category: "equipment", coaCode: "1500", notes: "Saratoga CapEx: Phinney Architectural Design" },
        "1032": { category: "owner_draw", coaCode: "3010", notes: "Owner's Draw - reduces Equity Basis" },
        "2188": { category: "leasehold", coaCode: "1520", notes: "Saratoga Leasehold: Lance Plumbing build-out" },
        "2192": { category: "leasehold", coaCode: "1520", notes: "Saratoga Leasehold: Phinney Architectural" },
        "2109": { category: "leasehold", coaCode: "1520", notes: "Saratoga Leasehold: JME Electric" },
        "2119": { category: "rent", coaCode: "6030", notes: "Standard Monthly Rent" },
      };

      function classifyByKeyword(desc: string, debit: number | null, credit: number | null, checkNum: string | null): { category: string; coaCode: string; notes: string } {
        const d = desc.toUpperCase();

        if (checkNum && SPECIAL_CHECKS[checkNum]) {
          return SPECIAL_CHECKS[checkNum];
        }

        if (d.includes("ADP WAGE PAY") || d.includes("ADP TAX")) return { category: "labor", coaCode: d.includes("TAX") ? "6020" : "6010", notes: "" };
        if (d.includes("ADP PAYROLL FEES") || d.includes("ADP PAY-BY-PAY")) return { category: "labor", coaCode: "6020", notes: "ADP service fees" };

        if (d.includes("SQUARE INC") && d.includes("DIRECTDEP")) return { category: "revenue", coaCode: "4010", notes: "Square deposit - skip JE (Square is sole revenue source)" };
        if (d.includes("SQUARE INC") && d.includes("SQ CAP")) {
          if (credit && credit > 0) return { category: "loan_proceeds", coaCode: "2500", notes: "Square Capital loan proceeds" };
          return { category: "debt_payment", coaCode: "2500", notes: "Square Capital repayment" };
        }
        if (d.includes("SQUARE INC SQ") && credit && credit > 0) return { category: "revenue", coaCode: "4010", notes: "Square deposit - skip JE (Square is sole revenue source)" };
        if (d.includes("SQUARE INC SQ") && debit && debit > 0) return { category: "merchant_fees", coaCode: "6110", notes: "Square processing fees" };

        if (d.includes("SYSCO") || d.includes("US FOODSERVICE") || d.includes("HILLCREST") || d.includes("DECRESCENTE DIST")) return { category: "cogs", coaCode: "5010", notes: "" };
        if (d.includes("TOPS MARKETS") || d.includes("MARKET32") || d.includes("PRICE CHOPPE") || d.includes("WAL MART")) return { category: "cogs", coaCode: "5010", notes: "Grocery/supplies for kitchen" };

        if (d.includes("NGRID36")) return { category: "utilities", coaCode: "6040", notes: "National Grid" };
        if (d.includes("SPECTRUM")) return { category: "utilities", coaCode: "6040", notes: "Spectrum internet/cable" };

        if (d.includes("AMEX EPAYMENT")) return { category: "debt_payment", coaCode: "2500", notes: "Amex card payment" };
        if (d.includes("CITY NATIONAL BA") && d.includes("SBAPAYMENT")) return { category: "debt_payment", coaCode: "2500", notes: "SBA loan payment" };
        if (d.includes("ALLY ALLY PAYMT")) return { category: "debt_payment", coaCode: "2500", notes: "Ally auto/equipment loan" };
        if (d.includes("HOME DEPOT AUTO PYMT") || d.includes("HOME DEPOT ONLINE PMT")) return { category: "debt_payment", coaCode: "2500", notes: "Home Depot credit payment" };
        if (d.includes("NAVITAS CREDIT")) return { category: "debt_payment", coaCode: "2500", notes: "Navitas equipment financing" };
        if (d.includes("BEST BUY PAYMENT")) return { category: "debt_payment", coaCode: "2500", notes: "Best Buy credit payment" };

        if (d.includes("NYS DTF SALES TAX")) return { category: "sales_tax_payment", coaCode: "2030", notes: "NY sales tax remittance" };
        if (d.includes("NYS DTF PIT TAX") || d.includes("NYS DTF CT TAX")) return { category: "tax_payment", coaCode: "6090", notes: "NYS income/corp tax" };

        if (d.includes("PROGRESSIVE") && d.includes("INSURANCE")) return { category: "insurance", coaCode: "6050", notes: "Progressive Insurance" };
        if (d.includes("ERIENIAGARAINSAS")) return { category: "insurance", coaCode: "6050", notes: "Erie/Niagara Insurance" };

        if (d.includes("INTUIT") && d.includes("QBOOKS")) return { category: "technology", coaCode: "6080", notes: "QuickBooks subscription" };

        if (d.includes("PLANET FITNESS") || d.includes("PLANET FIT")) return { category: "owner_draw", coaCode: "3010", notes: "Personal expense - owner draw" };

        if (d.includes("VENMO")) {
          if (d.includes("JULIA HALL") || d.includes("JULIA MCLAUGHLIN") || d.includes("JULIA MCLAUGHL")) return { category: "labor", coaCode: "6170", notes: "Contract labor via Venmo" };
          if (d.includes("ALYSSA BRADY")) return { category: "labor", coaCode: "6170", notes: "Contract labor via Venmo" };
          if (d.includes("LOUIS DESANTIS") || d.includes("ALEX DESANTIS")) return { category: "owner_draw", coaCode: "3010", notes: "Owner/family draw via Venmo" };
          if (d.includes("BRIANNA PECK") || d.includes("BRYCE ROSE") || d.includes("KAYLA SWEET") || d.includes("MCKENNA OKEEFE") || d.includes("BRYAN O KEEFE") || d.includes("CHLOE FREEMAN") || d.includes("ALLYSON REYNOL") || d.includes("NICHOLAS ANDER") || d.includes("MR FORMAL")) return { category: "labor", coaCode: "6170", notes: "Contract labor via Venmo" };
          return { category: "owner_draw", coaCode: "3010", notes: "Venmo payment - default to owner draw" };
        }

        if (d.includes("HOME DEPOT") || d.includes("HOMEDEPOT") || d.includes("HARBOR FREIGHT") || d.includes("LOWE")) return { category: "supplies", coaCode: "5020", notes: "Hardware/supplies" };
        if (d.includes("ALLERDICE GLASS")) return { category: "leasehold", coaCode: "1520", notes: "Allerdice glass/mirror - Saratoga buildout" };
        if (d.includes("WOLBERG ELECTRICAL")) return { category: "supplies", coaCode: "5020", notes: "Electrical supplies" };
        if (d.includes("FASTSIGNS")) return { category: "marketing", coaCode: "6060", notes: "Signage" };
        if (d.includes("STICKER MULE")) return { category: "marketing", coaCode: "6060", notes: "Sticker Mule marketing" };

        if (d.includes("JME ELECTRIC")) return { category: "leasehold", coaCode: "1520", notes: "JME Electric - Saratoga buildout" };
        if (d.includes("SUNOCO")) return { category: "supplies", coaCode: "6150", notes: "Gas/fuel" };
        if (d.includes("FEDEX")) return { category: "supplies", coaCode: "6120", notes: "Shipping" };

        if (d.includes("WHITEMAN OSTERMAN")) return { category: "professional_services", coaCode: "6100", notes: "Legal services" };
        if (d.includes("PHINNEY")) return { category: "leasehold", coaCode: "1520", notes: "Architectural services - Saratoga buildout" };
        if (d.includes("ALBANY FIRE PROTECTI")) return { category: "leasehold", coaCode: "1520", notes: "Fire protection - Saratoga buildout" };
        if (d.includes("MEERKAT PEST")) return { category: "maintenance", coaCode: "6070", notes: "Pest control" };

        if (d.includes("ETSY")) return { category: "supplies", coaCode: "5020", notes: "Etsy purchase" };
        if (d.includes("AMAZON")) return { category: "supplies", coaCode: "5020", notes: "Amazon purchase" };
        if (d.includes("ANTHROPOLOGIE")) return { category: "owner_draw", coaCode: "3010", notes: "Personal expense - owner draw" };
        if (d.includes("CASALE CUSTOM")) return { category: "marketing", coaCode: "6060", notes: "Custom apparel/branding" };

        if (d.includes("INTERIOR DESIGNS ATELI")) return { category: "leasehold", coaCode: "1520", notes: "Interior design - Saratoga buildout" };
        if (d.includes("F W  WEBB") || d.includes("FW WEBB")) return { category: "supplies", coaCode: "5020", notes: "Plumbing supplies" };
        if (d.includes("GENNAROS PIZZA")) return { category: "supplies", coaCode: "6090", notes: "Meals/miscellaneous" };
        if (d.includes("TARGET")) return { category: "supplies", coaCode: "5020", notes: "Target supplies" };
        if (d.includes("SUBWAY") || d.includes("STEWARTS")) return { category: "supplies", coaCode: "6090", notes: "Meals/miscellaneous" };
        if (d.includes("JOYBOS")) return { category: "supplies", coaCode: "5020", notes: "Kitchen supplies" };

        if (d.includes("SQ  RON S HARDWARE")) return { category: "supplies", coaCode: "5020", notes: "Local hardware" };
        if (d.includes("SQ  SQUARE HARDWARE")) return { category: "supplies", coaCode: "5020", notes: "Square hardware purchase" };
        if (d.includes("FRSMITHANDSONMARIN")) return { category: "maintenance", coaCode: "6070", notes: "FR Smith & Sons Marine" };
        if (d.includes("NEMER CHRYSLER")) return { category: "supplies", coaCode: "6150", notes: "Vehicle expense" };
        if (d.includes("521 BROADWAY")) return { category: "rent", coaCode: "6030", notes: "Saratoga lease - 521 Broadway" };

        if (d.includes("TD ZELLE SENT")) {
          if (d.includes("EPICURUS")) return { category: "cogs", coaCode: "5010", notes: "Epicurus LLC food vendor via Zelle" };
          if (d.includes("ELIZABETH SRIVASTAV")) return { category: "professional_services", coaCode: "6100", notes: "Professional services via Zelle" };
          return { category: "misc", coaCode: "6090", notes: "Zelle payment" };
        }

        if (d.includes("XFER") || d.includes("TRANSFER")) {
          if (d.includes("TRANSFER TO CK")) return { category: "transfer_out", coaCode: "1010", notes: "Internal transfer out" };
          if (d.includes("TRANSFER FROM CK")) return { category: "transfer_in", coaCode: "1010", notes: "Internal transfer in" };
          return { category: "transfer", coaCode: "1010", notes: "Internal bank transfer" };
        }

        if (d.includes("SBB MDEPOSIT")) return { category: "other_income", coaCode: "4090", notes: "Mobile deposit" };
        if (d.includes("IRS  TREAS") && d.includes("TAX REF")) return { category: "other_income", coaCode: "4090", notes: "IRS tax refund" };
        if (d.includes("NY STATE") && d.includes("TAXRFD")) return { category: "other_income", coaCode: "4090", notes: "NY State tax refund" };
        if (d.includes("CREDIT FEES REFUNDED")) return { category: "other_income", coaCode: "4090", notes: "Bank fee refund" };
        if (d.includes("FISHSTORE CLASS ACTION")) return { category: "other_income", coaCode: "4090", notes: "Class action settlement" };
        if (d.includes("ADP PAY-BY-PAY") && credit && credit > 0) return { category: "other_income", coaCode: "4090", notes: "ADP credit/refund" };

        if (d.includes("ZAZZLE")) return { category: "marketing", coaCode: "6060", notes: "Zazzle marketing" };
        if (d.includes("LANCE PLUMBING")) return { category: "leasehold", coaCode: "1520", notes: "Lance Plumbing - Saratoga buildout" };
        if (d.includes("ELEVEN36") || d.includes("ELEVEN 36")) return { category: "debt_payment", coaCode: "2500", notes: "Eleven36 equipment financing (TurboChef)" };
        if (d.includes("PAYPAL")) return { category: "misc", coaCode: "6090", notes: "PayPal payment" };

        return { category: "misc", coaCode: "6090", notes: "Uncategorized" };
      }

      const SKIP_JE_CATEGORIES = new Set(["revenue", "other_income", "transfer_in", "transfer_out", "transfer"]);

      const allAccounts = await db.select().from(chartOfAccounts);
      const codeToId = new Map(allAccounts.map((a: any) => [a.code, a.id]));
      const cashId = codeToId.get("1010");
      if (!cashId) return res.status(500).json({ message: "Cash account 1010 not found" });

      const existing = await storage.getFirmTransactions({ startDate: "2025-01-01", endDate: "2025-12-31" });
      const existingRefIds = new Set(existing.filter(e => e.referenceType === "csv-import-2025").map(e => e.referenceId));

      let added = 0, skipped = 0, jePosted = 0, errors: string[] = [];
      const seenRefKeys = new Map<string, number>();

      for (const line of dataLines) {
        try {
          const parts: string[] = [];
          let current = "";
          let inQuotes = false;
          for (const ch of line) {
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          parts.push(current.trim());

          const [dateStr, , , txnType, description, debitStr, creditStr, checkNumStr] = parts;
          if (!dateStr || !description) continue;

          const debit = debitStr ? parseFloat(debitStr.replace(/,/g, "")) : null;
          const credit = creditStr ? parseFloat(creditStr.replace(/,/g, "")) : null;
          const checkNum = checkNumStr || null;
          const amount = credit && credit > 0 ? credit : -(debit || 0);

          const baseRefId = `csv2025-${dateStr}-${(description || "").substring(0, 40).replace(/[^a-zA-Z0-9]/g, "")}-${Math.abs(amount).toFixed(2)}`;
          const seenCount = (seenRefKeys.get(baseRefId) || 0) + 1;
          seenRefKeys.set(baseRefId, seenCount);
          const refId = seenCount > 1 ? `${baseRefId}-dup${seenCount}` : baseRefId;

          if (existingRefIds.has(refId)) { skipped++; continue; }

          const { category, coaCode, notes } = classifyByKeyword(description, debit, credit, checkNum);

          const txn = await storage.createFirmTransaction({
            accountId: FIRM_ACCOUNT_ID,
            date: dateStr,
            description,
            amount,
            category,
            referenceType: "csv-import-2025",
            referenceId: refId,
            reconciled: true,
            notes: notes || null,
            suggestedCoaCode: coaCode,
            createdBy: "csv-import",
          });
          existingRefIds.add(refId);
          added++;

          if (SKIP_JE_CATEGORIES.has(category)) continue;

          const targetAcctId = codeToId.get(coaCode);
          if (!targetAcctId) {
            errors.push(`No COA for code ${coaCode} on ${dateStr}: ${description}`);
            continue;
          }

          const absAmount = Math.abs(amount);
          if (absAmount === 0) continue;

          let jeLines: Array<{ accountId: number; debit: number; credit: number; memo?: string }>;

          if (category === "sales_tax_payment") {
            jeLines = [
              { accountId: targetAcctId, debit: absAmount, credit: 0, memo: `Sales tax payment: ${description}` },
              { accountId: cashId, debit: 0, credit: absAmount },
            ];
          } else if (coaCode === "1200" || coaCode === "1500" || coaCode === "1520" || coaCode === "3010") {
            jeLines = [
              { accountId: targetAcctId, debit: absAmount, credit: 0, memo: notes || description },
              { accountId: cashId, debit: 0, credit: absAmount },
            ];
          } else if (coaCode === "2500") {
            if (amount > 0) {
              jeLines = [
                { accountId: cashId, debit: absAmount, credit: 0 },
                { accountId: targetAcctId, debit: 0, credit: absAmount, memo: notes || description },
              ];
            } else {
              jeLines = [
                { accountId: targetAcctId, debit: absAmount, credit: 0, memo: notes || description },
                { accountId: cashId, debit: 0, credit: absAmount },
              ];
            }
          } else {
            if (amount < 0) {
              jeLines = [
                { accountId: targetAcctId, debit: absAmount, credit: 0, memo: notes || undefined },
                { accountId: cashId, debit: 0, credit: absAmount },
              ];
            } else {
              jeLines = [
                { accountId: cashId, debit: absAmount, credit: 0 },
                { accountId: targetAcctId, debit: 0, credit: absAmount, memo: notes || undefined },
              ];
            }
          }

          await postJournalEntry(
            {
              transactionDate: dateStr,
              description,
              referenceId: refId,
              referenceType: "csv-import-2025",
              status: "reconciled",
              createdBy: "csv-import",
            },
            jeLines
          );
          jePosted++;
        } catch (lineErr: any) {
          errors.push(`Line error: ${lineErr.message} - ${line.substring(0, 80)}`);
        }
      }

      let amortized = 0;
      try {
        const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07"];
        const prepaidId = codeToId.get("1200");
        const rentId = codeToId.get("6030");
        if (prepaidId && rentId) {
          for (const mo of months) {
            const amortRefId = `csv2025-prepaid-amort-${mo}`;
            const existingJe = await db.select().from(journalEntries).where(eq(journalEntries.referenceId, amortRefId));
            if (existingJe.length > 0) continue;

            await postJournalEntry(
              {
                transactionDate: `${mo}-28`,
                description: `Prepaid rent amortization - ${mo} ($8,750/mo of CHECK 1030 $61,250)`,
                referenceId: amortRefId,
                referenceType: "csv-import-2025-amort",
                status: "reconciled",
                createdBy: "csv-import",
              },
              [
                { accountId: rentId, debit: 8750, credit: 0, memo: "Monthly rent amortization from prepaid" },
                { accountId: prepaidId, debit: 0, credit: 8750 },
              ]
            );
            amortized++;
          }
        }
      } catch (amortErr: any) {
        errors.push(`Amortization error: ${amortErr.message}`);
      }

      console.log(`[CSV Import 2025] ${added} transactions added, ${skipped} duplicates skipped, ${jePosted} JEs posted, ${amortized} amortization entries, ${errors.length} errors`);
      res.json({
        added,
        skipped,
        jePosted,
        amortizationEntries: amortized,
        errors: errors.slice(0, 20),
        totalLines: dataLines.length,
      });
    } catch (err: any) {
      console.error("[CSV Import 2025] Fatal error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/plaid/items", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const items = await storage.getPlaidItems();
      const allAccounts = await storage.getPlaidAccounts();
      const result = items.map(item => ({
        ...item,
        accessToken: undefined,
        accounts: allAccounts.filter(a => a.plaidItemId === item.id),
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/plaid/items/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      await storage.deletePlaidItem(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Firm Summary
  app.get("/api/firm/sales-tax", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const { fetchSalesTaxReport } = await import("./square");
      const report = await fetchSalesTaxReport(startDate, endDate, locationId);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/summary", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const summary = await storage.getFirmSummary(startDate, endDate, locationId);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === COMPLIANCE & STATUTORY REPORTING ===

  app.get("/api/firm/sales-tax/accrual", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { calculateSalesTaxLiability } = await import("./compliance-engine");
      const today = new Date();
      const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
      const periodStart = (req.query.startDate as string) || qStart.toISOString().split("T")[0];
      const periodEnd = (req.query.endDate as string) || qEnd.toISOString().split("T")[0];
      const liability = await calculateSalesTaxLiability(periodStart, periodEnd);
      res.json(liability);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/compliance/dashboard", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { getComplianceDashboard } = await import("./compliance-engine");
      const dashboard = await getComplianceDashboard();
      res.json(dashboard);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/compliance/calendar", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const filings = await db.select().from(complianceCalendar).orderBy(asc(complianceCalendar.dueDate));
      res.json(filings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/compliance/recalculate", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { recalculateAllFilings } = await import("./compliance-engine");
      const result = await recalculateAllFilings();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/compliance/calendar/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, notes, completedBy } = req.body;
      const updates: any = {};
      if (status) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      if (status === "COMPLETED") {
        updates.completedAt = new Date();
        updates.completedBy = completedBy || "Owner";
      }
      const [updated] = await db.update(complianceCalendar).set(updates).where(eq(complianceCalendar.id, id)).returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/compliance/tax-liability", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const periodStart = req.query.periodStart as string;
      const periodEnd = req.query.periodEnd as string;
      if (!periodStart || !periodEnd) return res.status(400).json({ message: "periodStart and periodEnd required" });
      const { calculateSalesTaxLiability } = await import("./compliance-engine");
      const liability = await calculateSalesTaxLiability(periodStart, periodEnd);
      res.json(liability);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/compliance/readiness", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { validateComplianceReadiness } = await import("./compliance-engine");
      const readiness = await validateComplianceReadiness();
      res.json(readiness);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/compliance/jurisdictions", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const jurisdictions = await db.select().from(salesTaxJurisdictions);
      res.json(jurisdictions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/compliance/jurisdictions/:locationId", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const locationId = parseInt(req.params.locationId);
      const { combinedRate, stateRate, countyRate, cityRate } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (combinedRate !== undefined) updates.combinedRate = combinedRate;
      if (stateRate !== undefined) updates.stateRate = stateRate;
      if (countyRate !== undefined) updates.countyRate = countyRate;
      if (cityRate !== undefined) updates.cityRate = cityRate;
      const [updated] = await db.update(salesTaxJurisdictions).set(updates).where(eq(salesTaxJurisdictions.locationId, locationId)).returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === ACCRUAL PLACEHOLDERS & ADJUSTED CASH ===

  app.get("/api/firm/placeholders", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const placeholders = await db.select().from(accrualPlaceholders).orderBy(desc(accrualPlaceholders.createdAt));
      res.json(placeholders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/placeholders", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { vendorName, vendorId, description, amount, expectedDate, coaCode, accountId, locationId } = req.body;
      if (!vendorName || !description || amount === undefined) {
        return res.status(400).json({ message: "vendorName, description, and amount are required" });
      }
      const [ph] = await db.insert(accrualPlaceholders).values({
        vendorName, vendorId, description, amount, expectedDate, coaCode, accountId, locationId,
        status: "OPEN", createdBy: user?.username || user?.firstName || "Owner",
      }).returning();
      res.status(201).json(ph);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/placeholders/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, vendorName, description, amount, expectedDate, coaCode } = req.body;
      const updates: any = {};
      if (status) updates.status = status;
      if (vendorName) updates.vendorName = vendorName;
      if (description) updates.description = description;
      if (amount !== undefined) updates.amount = amount;
      if (expectedDate) updates.expectedDate = expectedDate;
      if (coaCode) updates.coaCode = coaCode;
      if (status === "VOID") updates.staleSince = new Date();
      const [updated] = await db.update(accrualPlaceholders).set(updates).where(eq(accrualPlaceholders.id, id)).returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/placeholders/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(accrualPlaceholders).where(eq(accrualPlaceholders.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/placeholders/:id/match", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const placeholderId = parseInt(req.params.id);
      const { transactionId } = req.body;
      if (!transactionId) return res.status(400).json({ message: "transactionId required" });
      const { matchAndReconcilePlaceholder } = await import("./reconciler");
      const result = await matchAndReconcilePlaceholder(placeholderId, transactionId);
      if (!result.success) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/placeholders/find-match", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { description, amount } = req.body;
      if (!description || amount === undefined) return res.status(400).json({ message: "description and amount required" });
      const { findPlaceholderMatch, findVendorTemplate } = await import("./reconciler");
      const match = await findPlaceholderMatch(description, amount);
      const template = findVendorTemplate(description);
      res.json({ match, template });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/adjusted-cash", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { getAdjustedCashPosition } = await import("./reconciler");
      const position = await getAdjustedCashPosition();
      res.json(position);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/compliance/thresholds", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { checkStatutoryThresholds } = await import("./compliance-engine");
      const thresholds = await checkStatutoryThresholds();
      res.json(thresholds);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/placeholders/stale-check", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { markStalePlaceholders } = await import("./reconciler");
      const result = await markStalePlaceholders();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === DONATION ROI PIPELINE ===
  app.get("/api/firm/donations", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const rows = await db.select().from(donations).orderBy(desc(donations.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/donations", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { recipientName, recipientType, is501c3, ein, itemDescription, quantity, unitCogs, retailValue, donationDate, locationId, notes } = req.body;
      if (!recipientName || !itemDescription || !donationDate) {
        return res.status(400).json({ message: "recipientName, itemDescription, and donationDate are required" });
      }
      const totalCogs = (unitCogs || 0) * (quantity || 1);
      const [donation] = await db.insert(donations).values({
        recipientName,
        recipientType: recipientType || "other",
        is501c3: is501c3 || false,
        ein: ein || null,
        itemDescription,
        quantity: quantity || 1,
        unitCogs: unitCogs || null,
        totalCogs: totalCogs || null,
        retailValue: retailValue || null,
        donationDate,
        locationId: locationId || null,
        notes: notes || null,
        status: "pending",
        createdBy: user?.username || user?.firstName || "Unknown",
      }).returning();
      res.status(201).json(donation);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/donations/:id/approve", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const user = await getUserFromReq(req);
      const [donation] = await db.select().from(donations).where(eq(donations.id, id));
      if (!donation) return res.status(404).json({ message: "Donation not found" });
      if (donation.status === "approved") return res.status(400).json({ message: "Already approved" });

      const cogsAmount = donation.totalCogs || 0;
      const expenseCode = donation.is501c3 ? "7700" : "7040";

      const { createJournalEntry } = await import("./accounting-engine");
      const entry = await createJournalEntry({
        date: donation.donationDate,
        memo: `Donation to ${donation.recipientName}: ${donation.itemDescription}${donation.is501c3 ? " (501c3 Charity)" : " (Marketing/Promotional)"}`,
        lines: [
          { accountCode: expenseCode, debit: cogsAmount, credit: 0 },
          { accountCode: "1100", debit: 0, credit: cogsAmount },
        ],
        createdBy: user?.username || "System",
      });

      await db.update(donations).set({
        status: "approved",
        ledgerEntryId: entry?.id || null,
        approvedBy: user?.username || user?.firstName || "Unknown",
        approvedAt: new Date(),
      }).where(eq(donations.id, id));

      const [updated] = await db.select().from(donations).where(eq(donations.id, id));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/donations/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const [donation] = await db.select().from(donations).where(eq(donations.id, id));
      if (!donation) return res.status(404).json({ message: "Donation not found" });
      if (donation.status === "approved") return res.status(400).json({ message: "Cannot delete approved donations" });
      await db.delete(donations).where(eq(donations.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/donations/summary", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const year = (req.query.year as string) || new Date().getFullYear().toString();
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const rows = await db.select().from(donations).where(
        and(gte(donations.donationDate, startDate), lte(donations.donationDate, endDate), eq(donations.status, "approved"))
      );
      const totalCogs = rows.reduce((s, r) => s + (r.totalCogs || 0), 0);
      const totalRetail = rows.reduce((s, r) => s + (r.retailValue || 0), 0);
      const charity = rows.filter(r => r.is501c3);
      const promo = rows.filter(r => !r.is501c3);
      res.json({
        totalDonations: rows.length,
        totalCogsWrittenOff: totalCogs,
        totalRetailValue: totalRetail,
        charitableDonations: { count: charity.length, totalCogs: charity.reduce((s, r) => s + (r.totalCogs || 0), 0) },
        promotionalDonations: { count: promo.length, totalCogs: promo.reduce((s, r) => s + (r.totalCogs || 0), 0) },
        roi: totalRetail > 0 ? ((totalRetail - totalCogs) / totalCogs * 100) : 0,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Lightning-Offset: vendor template suggestions for bank transactions
  app.post("/api/firm/reconcile/suggest", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { description, amount } = req.body;
      if (!description) return res.status(400).json({ message: "description required" });

      const { findVendorTemplate, findPlaceholderMatch } = await import("./reconciler");
      const template = findVendorTemplate(description);

      let placeholderMatch = null;
      if (template || amount) {
        placeholderMatch = await findPlaceholderMatch(description, Math.abs(amount || 0));
      }

      const { isCapExCandidate } = await import("./asset-engine");
      const capExFlag = isCapExCandidate(description, Math.abs(amount || 0));

      if (capExFlag) {
        res.json({
          type: "capex_candidate",
          debitCode: "1500",
          debitName: "Fixed Assets - Equipment",
          creditCode: "1010",
          creditName: "Operating Cash",
          confidence: 0.9,
          message: `This $${Math.abs(amount || 0).toLocaleString()} transaction exceeds the $2,500 CapEx threshold. Recommend capitalizing as a Fixed Asset instead of expensing.`,
        });
        return;
      }

      const { isLodgingCharge } = await import("./reconciler");
      if (isLodgingCharge(description)) {
        const projects = await db.select().from(projectMetadata).where(eq(projectMetadata.status, "active"));
        res.json({
          type: "project_tag_required",
          debitCode: "6140",
          debitName: "Travel & Lodging",
          creditCode: "1010",
          creditName: "Operating Cash",
          confidence: 0.75,
          message: `Jarvis detected a lodging charge ($${Math.abs(amount || 0).toFixed(2)}). Was this for a project launch, daily operations, or maintenance?`,
          projects: projects.map(p => ({ id: p.id, name: p.name, code: p.code, type: p.type, coaCode: p.coaCode })),
          defaultOptions: [
            { label: "Daily Operations", coaCode: "6140", type: "opex", category: "travel_lodging" },
            { label: "Emergency / Maintenance", coaCode: "6070", type: "opex", category: "repairs" },
            { label: "Personal (Do Not Book)", coaCode: null, type: "personal", category: null },
          ],
        });
        return;
      }

      if (placeholderMatch && placeholderMatch.matchType !== "none") {
        res.json({
          type: "accrual_offset",
          debitCode: "2100",
          debitName: "Accrued Liabilities",
          creditCode: "1010",
          creditName: "Operating Cash",
          placeholder: placeholderMatch,
          confidence: placeholderMatch.matchType === "exact" ? 0.95 : placeholderMatch.matchType === "close" ? 0.8 : 0.6,
        });
      } else if (template) {
        res.json({
          type: "vendor_template",
          debitCode: template.coaCode,
          debitName: template.category,
          creditCode: "1010",
          creditName: "Operating Cash",
          vendor: template,
          confidence: 0.85,
        });
      } else {
        const { findLearnedVendorRule } = await import("./reconciler");
        const learned = await findLearnedVendorRule(description);
        if (learned) {
          res.json({
            type: "learned_rule",
            debitCode: learned.coaCode,
            debitName: learned.category,
            creditCode: "1010",
            creditName: "Operating Cash",
            confidence: learned.confidence,
            source: learned.source,
          });
        } else {
          res.json({ type: "none", confidence: 0 });
        }
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === VENDOR INTEGRITY ===
  app.get("/api/firm/vendor-integrity", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const days = parseInt(req.query.days as string) || 60;
      const { getVendorIntegrityReport, getVendorAlertSummary } = await import("./vendor-integrity-engine");
      const report = await getVendorIntegrityReport(days);
      const summary = getVendorAlertSummary(report);
      res.json({ report, summary });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/vendor-integrity/link", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { transactionId, invoiceId } = req.body;
      if (!transactionId || !invoiceId) return res.status(400).json({ message: "transactionId and invoiceId required" });
      const [txn] = await db.select().from(firmTransactions).where(eq(firmTransactions.id, transactionId));
      if (!txn) return res.status(404).json({ message: "Transaction not found" });
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
      if (!inv) return res.status(404).json({ message: "Invoice not found" });
      const { linkInvoiceToTransaction } = await import("./vendor-integrity-engine");
      await linkInvoiceToTransaction(transactionId, invoiceId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/vendor-integrity/unlink", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { transactionId } = req.body;
      if (!transactionId) return res.status(400).json({ message: "transactionId required" });
      const [txn] = await db.select().from(firmTransactions).where(eq(firmTransactions.id, transactionId));
      if (!txn) return res.status(404).json({ message: "Transaction not found" });
      const { unlinkInvoiceFromTransaction } = await import("./vendor-integrity-engine");
      await unlinkInvoiceFromTransaction(transactionId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === FIXED ASSETS (Capital Equipment) ===
  app.get("/api/firm/assets", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const rows = await db.select().from(fixedAssets).orderBy(desc(fixedAssets.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/assets", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { name, description, vendor, purchasePrice, serialNumber, warrantyExpiration, placedInServiceDate, usefulLifeMonths, salvageValue, locationId, section179Eligible } = req.body;
      if (!name || !purchasePrice || !placedInServiceDate) {
        return res.status(400).json({ message: "name, purchasePrice, and placedInServiceDate are required" });
      }
      const { getLocationTag } = await import("./asset-engine");
      const [asset] = await db.insert(fixedAssets).values({
        name,
        description: description || null,
        vendor: vendor || null,
        purchasePrice,
        serialNumber: serialNumber || null,
        warrantyExpiration: warrantyExpiration || null,
        placedInServiceDate,
        usefulLifeMonths: usefulLifeMonths || 120,
        salvageValue: salvageValue || 0,
        locationId: locationId || null,
        locationTag: getLocationTag(locationId || null),
        status: "pending",
        section179Eligible: section179Eligible !== false,
        bookDepreciationMethod: "straight_line",
        taxDepreciationMethod: section179Eligible !== false ? "section_179" : "straight_line",
        createdBy: user?.username || user?.firstName || "Unknown",
      }).returning();

      const { logAssetAudit } = await import("./asset-engine");
      await logAssetAudit(asset.id, "CREATED", `Asset registered: ${name} at $${purchasePrice}`, user?.username || "Unknown");

      res.status(201).json(asset);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/assets/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const user = await getUserFromReq(req);
      const [existing] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, id));
      if (!existing) return res.status(404).json({ message: "Asset not found" });

      const allowed: Record<string, any> = {};
      const fields = ["name", "description", "vendor", "serialNumber", "warrantyExpiration", "placedInServiceDate", "usefulLifeMonths", "salvageValue", "locationId", "section179Eligible", "section179Elected"];
      for (const f of fields) {
        if (req.body[f] !== undefined) allowed[f] = req.body[f];
      }
      if (allowed.locationId) {
        const { getLocationTag } = await import("./asset-engine");
        allowed.locationTag = getLocationTag(allowed.locationId);
      }
      if (Object.keys(allowed).length === 0) return res.status(400).json({ message: "No updatable fields provided" });

      const [updated] = await db.update(fixedAssets).set(allowed).where(eq(fixedAssets.id, id)).returning();
      const { logAssetAudit } = await import("./asset-engine");
      const changedFields = Object.keys(allowed).join(", ");
      await logAssetAudit(id, "UPDATED", `Asset profile updated: ${changedFields}`, user?.username || "Unknown");
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/assets/:id/capitalize", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const user = await getUserFromReq(req);
      const { capitalizeAsset } = await import("./asset-engine");
      const asset = await capitalizeAsset(id, user?.username || user?.firstName || "System");
      res.json(asset);
    } catch (err: any) {
      res.status(err.message.includes("not found") ? 404 : 400).json({ message: err.message });
    }
  });

  app.get("/api/firm/assets/:id/schedules", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const assetId = Number(req.params.id);
      const schedules = await db.select().from(depreciationSchedules).where(eq(depreciationSchedules.assetId, assetId));
      const entries = await db.select().from(depreciationEntries).where(eq(depreciationEntries.assetId, assetId)).orderBy(depreciationEntries.periodDate);
      res.json({ schedules, entries });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/assets/:id/audit-log", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const assetId = Number(req.params.id);
      const logs = await db.select().from(assetAuditLog).where(eq(assetAuditLog.assetId, assetId)).orderBy(desc(assetAuditLog.createdAt));
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/assets/summary", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { getAssetSummary } = await import("./asset-engine");
      const summary = await getAssetSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/liquidity", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate, debtAnchor } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });

      const accounts = await storage.getFirmAccounts();
      const bankBalance = accounts
        .filter((a: any) => a.isActive && ["checking", "savings", "cash", "petty_cash"].includes(a.type))
        .reduce((s: number, a: any) => s + Number(a.currentBalance), 0);

      let pendingLaborCost = 0;
      let laborDragBreakdown: Record<string, number> = {};
      let laborDragDetail: any = {};
      try {
        const { compileLiveLabor } = await import("./payroll-compiler");
        const today = new Date();
        const dow = today.getDay();

        const currentWedOffset = (dow >= 3) ? dow - 3 : dow + 4;
        const currentWedStart = new Date(today);
        currentWedStart.setDate(today.getDate() - currentWedOffset);
        const currentWeekEnd = new Date(currentWedStart);
        currentWeekEnd.setDate(currentWedStart.getDate() + 6);
        const currentStartStr = currentWedStart.toISOString().split("T")[0];
        const todayStr = today.toISOString().split("T")[0];

        const prevWedStart = new Date(currentWedStart);
        prevWedStart.setDate(prevWedStart.getDate() - 7);
        const prevWeekEnd = new Date(prevWedStart);
        prevWeekEnd.setDate(prevWedStart.getDate() + 6);
        const prevStartStr = prevWedStart.toISOString().split("T")[0];
        const prevEndStr = prevWeekEnd.toISOString().split("T")[0];

        const [currentWeekLabor, prevWeekLabor] = await Promise.all([
          compileLiveLabor(currentStartStr, todayStr),
          compileLiveLabor(prevStartStr, prevEndStr),
        ]);

        const currentWeekGross = currentWeekLabor.totalGross;

        let priorWeekUnbanked = prevWeekLabor.totalGross;
        const payrollOutflows = await db.select().from(firmTransactions)
          .where(
            and(
              eq(firmTransactions.reconciled, true),
              or(
                eq(firmTransactions.category, "labor"),
                eq(firmTransactions.category, "payroll"),
              ),
              gte(firmTransactions.date, currentStartStr),
              sql`CAST(${firmTransactions.amount} AS numeric) < 0`
            )
          );
        const totalPayrollOutflow = payrollOutflows.reduce((s: number, tx: any) => s + Math.abs(Number(tx.amount)), 0);

        let fridayFlushed = false;
        const FLUSH_THRESHOLD = 0.5;
        if (priorWeekUnbanked > 0 && totalPayrollOutflow >= priorWeekUnbanked * FLUSH_THRESHOLD) {
          priorWeekUnbanked = 0;
          fridayFlushed = true;
          console.log(`[LaborDrag] Friday flush: $${totalPayrollOutflow.toFixed(2)} in payroll outflows this week (>= 50% of $${prevWeekLabor.totalGross.toFixed(2)}) zeroed prior week`);
        } else if (totalPayrollOutflow > 0) {
          console.log(`[LaborDrag] Payroll outflows $${totalPayrollOutflow.toFixed(2)} this week below flush threshold (50% of $${priorWeekUnbanked.toFixed(2)}), prior week drag remains`);
        } else {
          console.log(`[LaborDrag] No payroll outflows this week yet, prior week drag $${priorWeekUnbanked.toFixed(2)} remains`);
        }

        pendingLaborCost = Math.round((priorWeekUnbanked + currentWeekGross) * 100) / 100;

        const { userLocations } = await import("@shared/schema");
        const allUserLocs = await db.select().from(userLocations);
        const userLocationMap = new Map<string, number>();
        for (const ul of allUserLocs) {
          if (ul.isPrimary || !userLocationMap.has(ul.userId)) {
            userLocationMap.set(ul.userId, ul.locationId);
          }
        }

        const saratogaLocationId = 3;
        let boltonLabor = 0;
        let saratogaLabor = 0;
        const allEmps = [...currentWeekLabor.employees, ...prevWeekLabor.employees];
        const seenUsers = new Set<string>();
        for (const emp of allEmps) {
          if (seenUsers.has(emp.userId)) continue;
          seenUsers.add(emp.userId);
          const currentEmp = currentWeekLabor.employees.find(e => e.userId === emp.userId);
          const prevEmp = prevWeekLabor.employees.find(e => e.userId === emp.userId);
          const totalEmpCost = (currentEmp?.grossEstimate || 0) + (fridayFlushed ? 0 : (prevEmp?.grossEstimate || 0));
          const locId = userLocationMap.get(emp.userId);
          if (locId === saratogaLocationId) {
            saratogaLabor += totalEmpCost;
          } else {
            boltonLabor += totalEmpCost;
          }
        }
        laborDragBreakdown = {
          "Bolton Landing": Math.round(boltonLabor * 100) / 100,
          "Saratoga Springs": Math.round(saratogaLabor * 100) / 100,
        };

        laborDragDetail = {
          currentWeek: {
            period: `${currentStartStr} to ${todayStr}`,
            gross: currentWeekGross,
            activeShifts: currentWeekLabor.activeShiftCount,
            asOf: currentWeekLabor.asOf,
          },
          priorWeek: {
            period: `${prevStartStr} to ${prevEndStr}`,
            gross: fridayFlushed ? 0 : priorWeekUnbanked,
            originalGross: prevWeekLabor.totalGross,
            flushed: fridayFlushed,
            totalPayrollOutflow,
          },
          totalDrag: pendingLaborCost,
        };

        if (pendingLaborCost > 0) {
          const currentWeekEndStr = currentWeekEnd.toISOString().split("T")[0];
          const refId = `labor-accrual-${currentStartStr}-${currentWeekEndStr}`;
          const staleAccruals = await db.select().from(journalEntries)
            .where(
              and(
                eq(journalEntries.referenceType, "labor_accrual"),
                sql`${journalEntries.referenceId} != ${refId}`
              )
            );
          for (const stale of staleAccruals) {
            await db.delete(ledgerLines).where(eq(ledgerLines.entryId, stale.id));
            await db.delete(journalEntries).where(eq(journalEntries.id, stale.id));
            console.log(`[LaborAccrual] Cleaned stale accrual JE #${stale.id} (${stale.referenceId})`);
          }

          const existingAccrualJE = await db.select().from(journalEntries)
            .where(eq(journalEntries.referenceId, refId)).limit(1);

          const laborAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6010")).limit(1);
          const payrollLiab = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "2100")).limit(1);

          if (laborAcct.length > 0 && payrollLiab.length > 0) {
            if (existingAccrualJE.length > 0) {
              const oldLines = await db.select().from(ledgerLines)
                .where(eq(ledgerLines.entryId, existingAccrualJE[0].id));
              const oldDebit = oldLines.find(l => Number(l.debit) > 0);
              const oldAmount = oldDebit ? Number(oldDebit.debit) : 0;

              if (Math.abs(oldAmount - pendingLaborCost) > 0.01) {
                await db.delete(ledgerLines).where(eq(ledgerLines.entryId, existingAccrualJE[0].id));
                await db.delete(journalEntries).where(eq(journalEntries.id, existingAccrualJE[0].id));
                console.log(`[LaborAccrual] Removed stale accrual JE #${existingAccrualJE[0].id} ($${oldAmount} → $${pendingLaborCost})`);

                const { postJournalEntry } = await import("./accounting-engine");
                const rounded = Math.round(pendingLaborCost * 100) / 100;
                const empCount = currentWeekLabor.employees.length;
                await postJournalEntry(
                  {
                    transactionDate: todayStr,
                    description: `Labor accrual: ${currentStartStr} to ${todayStr} (${empCount} employees, live burn)`,
                    referenceId: refId,
                    referenceType: "labor_accrual",
                    status: "posted",
                    isNonCash: true,
                    createdBy: "payroll-compiler",
                  },
                  [
                    { accountId: laborAcct[0].id, debit: rounded, credit: 0, memo: `Accrued wages: ${empCount} employees (live burn)` },
                    { accountId: payrollLiab[0].id, debit: 0, credit: rounded, memo: `Payroll liability accrual` },
                  ]
                );
                console.log(`[LaborAccrual] Posted updated live accrual: $${rounded}`);
              }
            } else {
              try {
                const { postJournalEntry } = await import("./accounting-engine");
                const rounded = Math.round(pendingLaborCost * 100) / 100;
                const empCount = currentWeekLabor.employees.length;
                await postJournalEntry(
                  {
                    transactionDate: todayStr,
                    description: `Labor accrual: ${currentStartStr} to ${todayStr} (${empCount} employees, live burn)`,
                    referenceId: refId,
                    referenceType: "labor_accrual",
                    status: "posted",
                    isNonCash: true,
                    createdBy: "payroll-compiler",
                  },
                  [
                    { accountId: laborAcct[0].id, debit: rounded, credit: 0, memo: `Accrued wages: ${empCount} employees (live burn)` },
                    { accountId: payrollLiab[0].id, debit: 0, credit: rounded, memo: `Payroll liability accrual` },
                  ]
                );
                console.log(`[LaborAccrual] Posted new live accrual: $${rounded}`);
              } catch (jeErr: any) {
                console.warn("[LaborAccrual] JE post error (non-fatal):", jeErr.message);
              }
            }
          }
        }
      } catch (payrollErr: any) {
        console.warn("[Liquidity] Live labor compilation failed (non-fatal), labor drag = 0:", payrollErr.message);
      }

      const { getLiquiditySnapshot } = await import("./liquidity-engine");
      const snapshot = await getLiquiditySnapshot(
        startDate as string,
        endDate as string,
        bankBalance,
        debtAnchor ? Number(debtAnchor) : undefined,
        pendingLaborCost,
        laborDragBreakdown
      );
      res.json({ ...snapshot, laborDragDetail });
    } catch (err: any) {
      console.error("[Liquidity] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/live-labor", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { compileLiveLabor } = await import("./payroll-compiler");
      const today = new Date();
      const dow = today.getDay();
      const wedOffset = (dow >= 3) ? dow - 3 : dow + 4;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - wedOffset);
      const startStr = req.query.startDate || weekStart.toISOString().split("T")[0];
      const endStr = req.query.endDate || today.toISOString().split("T")[0];
      const snapshot = await compileLiveLabor(startStr as string, endStr as string);
      res.json(snapshot);
    } catch (err: any) {
      console.error("[LiveLabor] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/debt-tracker", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { debtAnchor } = req.query;
      const { getDebtTracker } = await import("./liquidity-engine");
      const tracker = await getDebtTracker(debtAnchor ? Number(debtAnchor) : undefined);
      res.json(tracker);
    } catch (err: any) {
      console.error("[DebtTracker] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/assets/depreciation/post", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { periodDate } = req.body;
      if (!periodDate) return res.status(400).json({ message: "periodDate required (YYYY-MM-DD)" });
      const createdBy = user?.username || "System";
      const { postMonthlyDepreciation } = await import("./asset-engine");
      const depResult = await postMonthlyDepreciation(periodDate, createdBy);
      const { runMonthlyAmortization } = await import("./prepaid-engine");
      const amortResult = await runMonthlyAmortization(periodDate, createdBy);
      res.json({ depreciation: depResult, amortization: amortResult });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/assets/seed-legacy", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { seedLegacyAssets } = await import("./asset-engine");
      const result = await seedLegacyAssets(user?.username || user?.firstName || "System");
      res.json({ message: `Legacy asset DNA upload complete`, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/assets/capex-check", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { description, amount } = req.body;
      const { isCapExCandidate, getCapExRecommendation } = await import("./asset-engine");
      const isCapEx = isCapExCandidate(description || "", amount || 0);
      let recommendation = null;
      if (isCapEx) {
        const { getTrialBalance } = await import("./accounting-engine");
        const trial = await getTrialBalance(`${new Date().getFullYear()}-01-01`);
        const revenue = trial.filter((a: any) => a.accountType === "Revenue").reduce((s: number, a: any) => s + (a.totalCredit - a.totalDebit), 0);
        const expenses = trial.filter((a: any) => a.accountType === "Expense").reduce((s: number, a: any) => s + (a.totalDebit - a.totalCredit), 0);
        const ytdNetIncome = revenue - expenses;
        recommendation = await getCapExRecommendation(Math.abs(amount), ytdNetIncome);
      }
      res.json({ isCapEx, recommendation });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PREPAID AMORTIZATIONS ===
  app.get("/api/firm/prepaids", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { getPrepaidSummary } = await import("./prepaid-engine");
      const summary = await getPrepaidSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/prepaids", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { description, vendor, totalAmount, totalMonths, expenseAccountCode, startDate, locationId, transactionId } = req.body;
      if (!description || !totalAmount || !totalMonths || !expenseAccountCode || !startDate) {
        return res.status(400).json({ message: "description, totalAmount, totalMonths, expenseAccountCode, and startDate are required" });
      }
      const { createPrepaidAmortization } = await import("./prepaid-engine");
      const result = await createPrepaidAmortization({
        description,
        vendor,
        totalAmount: Math.abs(totalAmount),
        totalMonths,
        expenseAccountCode,
        startDate,
        locationId,
        transactionId,
        createdBy: user?.username || user?.firstName || "System",
      });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/firm/prepaids/from-transaction", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { transactionId, expenseAccountCode } = req.body;
      if (!transactionId || !expenseAccountCode) {
        return res.status(400).json({ message: "transactionId and expenseAccountCode are required" });
      }
      const { firmTransactions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const txns = await db.select().from(firmTransactions).where(eq(firmTransactions.id, transactionId)).limit(1);
      if (txns.length === 0) return res.status(404).json({ message: "Transaction not found" });
      const txn = txns[0];
      if ((txn.amount || 0) >= 0) return res.status(400).json({ message: "Only expense (negative amount) transactions can be amortized." });

      const priorJEs = await db.select().from(journalEntries).where(
        and(eq(journalEntries.referenceId, String(transactionId)), eq(journalEntries.referenceType, "firm-txn"))
      );
      for (const je of priorJEs) {
        await db.delete(ledgerLines).where(eq(ledgerLines.entryId, je.id));
        await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
      }

      const txnDate = new Date(txn.date + "T00:00:00");
      const txnMonth = txnDate.getMonth();
      const monthsRemaining = 12 - txnMonth;
      const startDate = `${txnDate.getFullYear()}-${String(txnMonth + 1).padStart(2, "0")}-01`;
      const totalAmount = Math.abs(txn.amount || 0);

      const { createPrepaidAmortization } = await import("./prepaid-engine");
      const result = await createPrepaidAmortization({
        description: txn.description || "Amortized Expense",
        vendor: txn.vendor || txn.description || "Unknown",
        totalAmount,
        totalMonths: monthsRemaining,
        expenseAccountCode,
        startDate,
        locationId: txn.locationId || undefined,
        transactionId: txn.id,
        createdBy: user?.username || user?.firstName || "System",
      });

      await db.update(firmTransactions).set({ category: "amortization" }).where(eq(firmTransactions.id, transactionId));

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/firm/prepaids/run-monthly", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { periodDate } = req.body;
      if (!periodDate) return res.status(400).json({ message: "periodDate required (YYYY-MM-DD)" });
      const { runMonthlyAmortization } = await import("./prepaid-engine");
      const result = await runMonthlyAmortization(periodDate, user?.username || user?.firstName || "System");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/assets/componentize", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { transactionId, components, adjustments, vendor, purchaseDate } = req.body;
      if (!transactionId || !components || !Array.isArray(components) || components.length === 0) {
        return res.status(400).json({ message: "transactionId and components[] required" });
      }
      const { componentizeTransaction } = await import("./asset-engine");
      const result = await componentizeTransaction(
        transactionId,
        components,
        vendor || "Unknown",
        purchaseDate || new Date().toISOString().split("T")[0],
        user?.username || user?.firstName || "System",
        adjustments,
      );

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/assets/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const [asset] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, id));
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      if (asset.status === "capitalized") return res.status(400).json({ message: "Cannot delete capitalized assets — use disposal workflow" });
      await db.delete(depreciationEntries).where(eq(depreciationEntries.assetId, id));
      await db.delete(depreciationSchedules).where(eq(depreciationSchedules.assetId, id));
      await db.delete(assetAuditLog).where(eq(assetAuditLog.assetId, id));
      await db.delete(fixedAssets).where(eq(fixedAssets.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === RENT — HOME OFFICE SPLIT ===
  app.post("/api/firm/rent-split", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { transactionId, businessPercent, memo } = req.body;
      if (!transactionId || businessPercent == null) {
        return res.status(400).json({ message: "transactionId and businessPercent required" });
      }
      if (businessPercent <= 0 || businessPercent >= 100) {
        return res.status(400).json({ message: "businessPercent must be between 0 and 100 exclusive" });
      }

      const txn = await storage.getFirmTransaction(transactionId);
      if (!txn) return res.status(404).json({ message: "Transaction not found" });

      const totalAmount = Math.abs(Number(txn.amount));
      const businessAmount = Math.round(totalAmount * businessPercent) / 100;
      const personalAmount = +(totalAmount - businessAmount).toFixed(2);

      const rentAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6030")).limit(1);
      const drawAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "3010")).limit(1);
      const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);

      if (!rentAccount.length || !drawAccount.length || !cashAccount.length) {
        return res.status(500).json({ message: "Required chart of accounts entries missing (6030, 3010, 1010)" });
      }

      const { postJournalEntry } = await import("./accounting-engine");
      const entry = await postJournalEntry(
        {
          transactionDate: txn.date,
          description: memo || `Rent — Home Office Split (${businessPercent}% business)`,
          referenceType: "rent_split",
          referenceId: String(transactionId),
          createdBy: req.user?.id || null,
        },
        [
          { accountId: rentAccount[0].id, debit: businessAmount, credit: 0, memo: `Business rent (${businessPercent}%)` },
          { accountId: drawAccount[0].id, debit: personalAmount, credit: 0, memo: `Personal rent (${(100 - businessPercent).toFixed(2)}%) — Owner's Draw` },
          { accountId: cashAccount[0].id, debit: 0, credit: totalAmount, memo: `Rent payment — ${memo || txn.description}` },
        ]
      );

      await storage.updateFirmTransaction(transactionId, { category: "rent_split" });

      console.log(`[Rent Split] TX #${transactionId}: $${businessAmount.toFixed(2)} business (${businessPercent}%) / $${personalAmount.toFixed(2)} personal → JE #${entry?.id}`);
      res.json({
        success: true,
        journalEntryId: entry?.id || null,
        businessAmount,
        personalAmount,
        totalAmount,
      });
    } catch (err: any) {
      console.error("[Rent Split] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // === GMAIL MULTI-ACCOUNT OAUTH ===
  app.get("/api/firm/gmail/accounts", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { getConnectedAccounts } = await import("./gmail-multi");
      const accounts = await getConnectedAccounts();
      res.json(accounts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/gmail/authorize", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { getAuthUrl } = await import("./gmail-multi");
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/firm/gmail/callback`;
      const url = getAuthUrl(redirectUri);
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/gmail/callback", async (req: any, res) => {
    try {
      const { code } = req.query;
      if (!code) return res.status(400).send("Missing authorization code");
      const { exchangeCode } = await import("./gmail-multi");
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/firm/gmail/callback`;
      const { email } = await exchangeCode(code as string, redirectUri);
      res.redirect(`/the-firm?gmailConnected=${encodeURIComponent(email)}`);
    } catch (err: any) {
      console.error("[GmailOAuth] Callback error:", err.message);
      res.redirect(`/the-firm?gmailError=${encodeURIComponent(err.message)}`);
    }
  });

  app.delete("/api/firm/gmail/accounts/:email", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { removeAccount } = await import("./gmail-multi");
      await removeAccount(decodeURIComponent(req.params.email));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === AUDIT TRAIL ASSESSOR (Gmail Receipt Matching) ===
  app.post("/api/firm/audit-trail/lookup/:transactionId", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const transactionId = Number(req.params.transactionId);
      if (!transactionId) return res.status(400).json({ message: "Valid transactionId required" });
      const { auditTrailAssessor } = await import("./audit-trail-engine");
      const result = await auditTrailAssessor.performJarvisLookup(transactionId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/audit-trail/link", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { transactionId, messageId } = req.body;
      if (!transactionId || !messageId) return res.status(400).json({ message: "transactionId and messageId required" });
      const { auditTrailAssessor } = await import("./audit-trail-engine");
      const result = await auditTrailAssessor.linkEvidence(transactionId, messageId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/audit-trail/unlink/:transactionId", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const transactionId = Number(req.params.transactionId);
      const { auditTrailAssessor } = await import("./audit-trail-engine");
      await auditTrailAssessor.unlinkEvidence(transactionId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/audit-trail/extract-pdf", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { messageId, accountEmail } = req.body;
      if (!messageId || !accountEmail) return res.status(400).json({ message: "messageId and accountEmail required" });

      const { getMessageAttachmentDetails, downloadAttachmentForAccount } = await import("./gmail-multi");

      const attachments = await getMessageAttachmentDetails(accountEmail, messageId);
      const pdfAttachments = attachments.filter(a =>
        a.mimeType === "application/pdf" || a.filename.toLowerCase().endsWith(".pdf")
      );

      if (pdfAttachments.length === 0) {
        return res.json({ success: false, message: "No PDF attachments found", data: {} });
      }

      let extractedText = "";
      const downloadedFiles: string[] = [];

      for (const pdf of pdfAttachments) {
        try {
          const buffer = await downloadAttachmentForAccount(accountEmail, messageId, pdf.attachmentId);
          downloadedFiles.push(pdf.filename);

          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(buffer) }).promise;
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            extractedText += content.items.map((item: any) => item.str).join(" ") + "\n";
          }
        } catch (pdfErr: any) {
          console.error(`[AuditTrail] PDF extraction failed for ${pdf.filename}:`, pdfErr.message);
        }
      }

      if (!extractedText.trim()) {
        const imageAttachments = attachments.filter(a =>
          a.mimeType.startsWith("image/") && !a.mimeType.includes("pdf")
        );
        if (imageAttachments.length > 0) {
          try {
            const target = imageAttachments[0];
            if (target.size > 10 * 1024 * 1024) throw new Error("Image attachment too large (>10MB)");
            const buffer = await downloadAttachmentForAccount(accountEmail, messageId, target.attachmentId);
            const OpenAI = (await import("openai")).default;
            const openai = new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
            const base64 = buffer.toString("base64");
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                { role: "system", content: "Extract all text from this invoice/receipt document. Return the raw text content including all line items, quantities, prices, and totals." },
                { role: "user", content: [{ type: "image_url", image_url: { url: `data:${target.mimeType};base64,${base64}` } }] },
              ],
              max_tokens: 3000,
            });
            extractedText = response.choices[0]?.message?.content || "";
          } catch (ocrErr: any) {
            console.error("[AuditTrail] OCR fallback failed:", ocrErr.message);
          }
        }
      }

      if (!extractedText.trim()) {
        return res.json({ success: false, message: "Could not extract text from PDF(s)", data: {}, files: downloadedFiles });
      }

      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `Parse the following extracted invoice/receipt text into structured data for a bakery business.
Return JSON:
{
  "vendorName": string or null,
  "totalAmount": number or null,
  "subtotal": number or null,
  "tax": number or null,
  "shipping": number or null,
  "invoiceDate": "YYYY-MM-DD" or null,
  "invoiceNumber": string or null,
  "orderNumber": string or null,
  "lineItems": [{"description": string, "quantity": number, "unitPrice": number, "total": number}] or [],
  "confidence": number (0-1)
}
Focus on the final total, not subtotals or tax lines. Date format must be YYYY-MM-DD.`,
            },
            { role: "user", content: `Extracted Text:\n${extractedText.substring(0, 8000)}` },
          ],
          response_format: { type: "json_object" },
          max_tokens: 3000,
        });

        const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
        console.log(`[AuditTrail] PDF extracted: ${downloadedFiles.join(", ")} → $${parsed.totalAmount} (${parsed.lineItems?.length || 0} line items)`);
        res.json({ success: true, data: parsed, files: downloadedFiles, textLength: extractedText.length });
      } catch (parseErr: any) {
        console.error("[AuditTrail] PDF parse step failed:", parseErr.message, parseErr.status || "");
        res.json({ success: false, message: "Text extracted but parsing failed", rawText: extractedText.substring(0, 2000), files: downloadedFiles });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/audit-trail/stats", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { auditTrailAssessor } = await import("./audit-trail-engine");
      const stats = await auditTrailAssessor.getVerificationStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === BASIS ASSESSOR (S-Corp Self-Rental) ===
  app.post("/api/firm/basis/rent-accrual", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { periodDate, locationId } = req.body;
      if (!periodDate) return res.status(400).json({ message: "periodDate required (YYYY-MM-DD)" });
      const user = await getUserFromReq(req);
      const { basisAssessor } = await import("./asset-engine");
      const result = await basisAssessor.runForBolton(periodDate, user?.username || "Owner");
      res.json({ posted: result ? 1 : 0, entries: result ? [result] : [] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/basis/summary/:year", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const year = parseInt(req.params.year);
      if (!year || year < 2020) return res.status(400).json({ message: "Valid year required" });
      const { basisAssessor } = await import("./asset-engine");
      const summary = await basisAssessor.getAnnualBasisSummary(year);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === EMPLOYEE REIMBURSEMENTS ===
  app.get("/api/firm/reimbursements", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const rows = await db.select().from(employeeReimbursements).orderBy(desc(employeeReimbursements.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/reimbursements", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { employeeName, employeeId, amount, category, coaCode, description, receiptImageUrl, expenseDate, locationId, notes } = req.body;
      const parsedAmount = parseFloat(amount);
      if (!employeeName || !parsedAmount || parsedAmount <= 0 || !description || !expenseDate) {
        return res.status(400).json({ message: "employeeName, positive amount, description, and expenseDate are required" });
      }
      const [reimbursement] = await db.insert(employeeReimbursements).values({
        employeeName,
        employeeId: employeeId || null,
        amount,
        category: category || "supplies",
        coaCode: coaCode || "6090",
        description,
        receiptImageUrl: receiptImageUrl || null,
        expenseDate,
        locationId: locationId || null,
        notes: notes || null,
        status: "pending",
        createdBy: user?.username || user?.firstName || "Unknown",
      }).returning();
      res.status(201).json(reimbursement);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/reimbursements/:id/pay", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const user = await getUserFromReq(req);
      const [reimbursement] = await db.select().from(employeeReimbursements).where(eq(employeeReimbursements.id, id));
      if (!reimbursement) return res.status(404).json({ message: "Reimbursement not found" });
      if (reimbursement.status === "paid") return res.status(400).json({ message: "Already paid" });

      const locId = reimbursement.locationId || 1;
      const cashDrawerCode = locId === 2 ? "1031" : "1030";
      const expenseCode = reimbursement.coaCode || "6090";
      const now = new Date();
      const paymentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const { createJournalEntry } = await import("./accounting-engine");

      const result = await db.transaction(async (tx) => {
        const entry = await createJournalEntry({
          date: paymentDate,
          memo: `Reimbursement to ${reimbursement.employeeName}: ${reimbursement.description}`,
          lines: [
            { accountCode: expenseCode, debit: reimbursement.amount, credit: 0 },
            { accountCode: cashDrawerCode, debit: 0, credit: reimbursement.amount },
          ],
          createdBy: user?.username || "System",
          referenceType: "reimbursement",
          referenceId: String(id),
          locationId: reimbursement.locationId || undefined,
        });

        await tx.insert(cashPayoutLogs).values({
          amount: reimbursement.amount,
          payoutType: "reimbursement",
          recipientName: reimbursement.employeeName,
          description: reimbursement.description,
          sourceAccount: cashDrawerCode,
          targetCoaCode: expenseCode,
          locationId: reimbursement.locationId || null,
          reimbursementId: id,
          journalEntryId: entry?.id || null,
          payoutDate: paymentDate,
          performedBy: user?.username || "Unknown",
        });

        await tx.update(employeeReimbursements).set({
          status: "paid",
          paidFrom: cashDrawerCode,
          paidAt: new Date(),
          paidBy: user?.username || user?.firstName || "Unknown",
          journalEntryId: entry?.id || null,
        }).where(eq(employeeReimbursements.id, id));

        const [updated] = await tx.select().from(employeeReimbursements).where(eq(employeeReimbursements.id, id));
        return updated;
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/reimbursements/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const [r] = await db.select().from(employeeReimbursements).where(eq(employeeReimbursements.id, id));
      if (!r) return res.status(404).json({ message: "Not found" });
      if (r.status === "paid") return res.status(400).json({ message: "Cannot delete paid reimbursements" });
      await db.delete(employeeReimbursements).where(eq(employeeReimbursements.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === AI LEARNING RULES ===
  app.get("/api/firm/learning-rules", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const rows = await db.select().from(aiLearningRules).orderBy(desc(aiLearningRules.confidenceScore));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/learning-rules", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { vendorString, matchedCoaCode, matchedCoaName, category } = req.body;
      if (!vendorString || !matchedCoaCode) {
        return res.status(400).json({ message: "vendorString and matchedCoaCode are required" });
      }
      const { learnVendorRule } = await import("./reconciler");
      const rule = await learnVendorRule(vendorString, matchedCoaCode, matchedCoaName || "", category || "learned", user?.username || "Unknown");
      res.status(201).json(rule);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/learning-rules/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(aiLearningRules).where(eq(aiLearningRules.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === CASH PAYOUT LOGS ===
  app.get("/api/firm/cash-payouts", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const rows = await db.select().from(cashPayoutLogs).orderBy(desc(cashPayoutLogs.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/cash-payouts", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { amount, payoutType, recipientName, description, sourceAccount, targetCoaCode, locationId, payoutDate } = req.body;
      if (!amount || !recipientName || !description || !payoutDate || !targetCoaCode) {
        return res.status(400).json({ message: "amount, recipientName, description, payoutDate, and targetCoaCode are required" });
      }
      const cashCode = sourceAccount || (locationId === 2 ? "1031" : "1030");

      const { createJournalEntry } = await import("./accounting-engine");
      const entry = await createJournalEntry({
        date: payoutDate,
        memo: `Cash payout to ${recipientName}: ${description}`,
        lines: [
          { accountCode: targetCoaCode, debit: amount, credit: 0 },
          { accountCode: cashCode, debit: 0, credit: amount },
        ],
        createdBy: user?.username || "System",
        referenceType: "cash_payout",
        locationId: locationId || undefined,
      });

      const [payout] = await db.insert(cashPayoutLogs).values({
        amount,
        payoutType: payoutType || "manual",
        recipientName,
        description,
        sourceAccount: cashCode,
        targetCoaCode,
        locationId: locationId || null,
        journalEntryId: entry?.id || null,
        payoutDate,
        performedBy: user?.username || "Unknown",
      }).returning();
      res.status(201).json(payout);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === SHADOW LEDGER / VIRTUAL VAULT ===
  app.get("/api/firm/vault/balance", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const vaultAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010-V")).limit(1);
      if (vaultAccount.length === 0) return res.json({ balance: 0, accountId: null });
      const result = await db.select({
        balance: sql<number>`COALESCE(SUM(${ledgerLines.debit}) - SUM(${ledgerLines.credit}), 0)`,
      }).from(ledgerLines)
        .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
        .where(and(
          eq(ledgerLines.accountId, vaultAccount[0].id),
          eq(journalEntries.status, "posted"),
        ));
      res.json({ balance: Number(result[0]?.balance || 0), accountId: vaultAccount[0].id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/vault/payout", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { amount, category, recipientName, description, locationId, projectId, expansionCategory, assetDetails } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ message: "amount is required and must be positive" });
      if (!recipientName) return res.status(400).json({ message: "recipientName is required" });

      const EXPANSION_COA_MAP: Record<string, string> = {
        "pre-opening-labor": "6015-V",
        "capex": "1500",
        "startup-amortization": "6210",
      };

      const targetCoaCode = (expansionCategory && EXPANSION_COA_MAP[expansionCategory]) || "6015";

      const vaultAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010-V")).limit(1);
      const targetAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, targetCoaCode)).limit(1);
      if (vaultAccount.length === 0 || targetAccount.length === 0) {
        return res.status(400).json({ message: `Required accounts not seeded (1010-V, ${targetCoaCode}). Re-seed COA.` });
      }

      const today = new Date().toISOString().split("T")[0];
      const dept = category || "BOH";
      const memo = description || `Cash payout: ${recipientName} (${dept})`;

      const { postJournalEntry } = await import("./accounting-engine");
      const entry = await postJournalEntry(
        {
          transactionDate: today,
          description: memo,
          referenceId: `shadow-payout-${Date.now()}`,
          referenceType: expansionCategory === "capex" ? "capex" : "shadow_ledger",
          status: "posted",
          locationId: locationId || undefined,
          projectId: projectId || undefined,
          createdBy: user?.username || "system",
        },
        [
          { accountId: targetAccount[0].id, debit: Math.round(amount * 100) / 100, credit: 0, memo: `${targetCoaCode === "1500" ? "CapEx" : "Cash labor"}: ${recipientName} (${dept})` },
          { accountId: vaultAccount[0].id, debit: 0, credit: Math.round(amount * 100) / 100, memo: `Vault payout to ${recipientName}` },
        ]
      );

      const [payout] = await db.insert(cashPayoutLogs).values({
        amount,
        payoutType: expansionCategory ? `expansion_${expansionCategory}` : "shadow_labor",
        recipientName,
        description: memo,
        sourceAccount: "1010-V",
        targetCoaCode,
        locationId: locationId || null,
        journalEntryId: entry?.id || null,
        payoutDate: today,
        performedBy: user?.username || "Unknown",
      }).returning();

      if (projectId) {
        await db.update(projectMetadata).set({
          totalSpent: sql`COALESCE(${projectMetadata.totalSpent}, 0) + ${Math.round(amount * 100) / 100}`,
        }).where(eq(projectMetadata.id, projectId));
      }

      let createdAsset = null;
      if (expansionCategory === "capex") {
        const { getLocationTag, logAssetAudit } = await import("./asset-engine");
        const assetName = assetDetails?.name || recipientName;
        const usefulLifeMonths = assetDetails?.usefulLifeMonths || 84;
        const section179 = assetDetails?.section179 !== false;
        const rounded = Math.round(amount * 100) / 100;

        const [asset] = await db.insert(fixedAssets).values({
          name: assetName,
          description: assetDetails?.description || memo,
          vendor: recipientName,
          purchasePrice: rounded,
          serialNumber: assetDetails?.serialNumber || null,
          warrantyExpiration: assetDetails?.warrantyExpiration || null,
          placedInServiceDate: today,
          usefulLifeMonths,
          salvageValue: assetDetails?.salvageValue || 0,
          locationId: locationId || null,
          locationTag: getLocationTag(locationId || null),
          status: "placed_in_service",
          section179Eligible: section179,
          section179Elected: false,
          bookDepreciationMethod: "straight_line",
          taxDepreciationMethod: section179 ? "section_179" : "straight_line",
          journalEntryId: entry?.id || null,
          createdBy: user?.username || "system",
        }).returning();

        const { calculateStraightLineSchedule, calculateSection179Schedule } = await import("./asset-engine");
        const bookSchedule = calculateStraightLineSchedule(rounded, assetDetails?.salvageValue || 0, usefulLifeMonths, today);
        const [bookSched] = await db.insert(depreciationSchedules).values({
          assetId: asset.id,
          ledgerType: "book",
          method: "straight_line",
          totalAmount: bookSchedule.totalAmount,
          monthlyAmount: bookSchedule.monthlyAmount,
          startDate: today,
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

        if (section179) {
          const taxSchedule = calculateSection179Schedule(rounded, today);
          const [taxSched] = await db.insert(depreciationSchedules).values({
            assetId: asset.id,
            ledgerType: "tax",
            method: "section_179",
            totalAmount: taxSchedule.totalAmount,
            monthlyAmount: null,
            startDate: today,
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

        await logAssetAudit(
          asset.id,
          "VAULT_CAPEX",
          `Created from vault CapEx payout. Vendor: ${recipientName}. Amount: $${rounded}. Useful life: ${usefulLifeMonths} months. Book: straight-line ($${bookSchedule.monthlyAmount.toFixed(2)}/mo). ${section179 ? "Section 179 eligible." : ""}${projectId ? ` Tagged to project #${projectId}.` : ""}`,
          user?.username || "system"
        );

        createdAsset = asset;
        console.log(`[VaultCapEx] Asset #${asset.id} created: ${assetName} ($${rounded}) — depreciation scheduled`);
      }

      res.status(201).json({ payout, journalEntry: entry, asset: createdAsset });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/vault/shadow-post-payroll", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });

      const { compilePayroll } = await import("./payroll-compiler");
      const preview = await compilePayroll(startDate, endDate);
      const cashGross = preview.totals.cashGross;
      if (cashGross <= 0) return res.json({ message: "No cash payroll to shadow-post", cashGross: 0 });

      const vaultAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010-V")).limit(1);
      const laborAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6015")).limit(1);
      if (vaultAccount.length === 0 || laborAccount.length === 0) {
        return res.status(400).json({ message: "Shadow ledger accounts not seeded" });
      }

      const refId = `shadow-payroll-${startDate}-${endDate}`;
      const existing = await db.select().from(journalEntries).where(eq(journalEntries.referenceId, refId)).limit(1);
      if (existing.length > 0) return res.status(400).json({ message: "Shadow payroll already posted for this period" });

      const { postJournalEntry } = await import("./accounting-engine");
      const entry = await postJournalEntry(
        {
          transactionDate: endDate,
          description: `Shadow Payroll: Cash labor ${startDate} to ${endDate} ($${cashGross.toFixed(2)})`,
          referenceId: refId,
          referenceType: "shadow_ledger",
          status: "posted",
          createdBy: user?.username || "system",
        },
        [
          { accountId: laborAccount[0].id, debit: Math.round(cashGross * 100) / 100, credit: 0, memo: `Cash payroll: ${preview.totals.employeeCount} employees` },
          { accountId: vaultAccount[0].id, debit: 0, credit: Math.round(cashGross * 100) / 100, memo: `Vault draw for cash payroll` },
        ]
      );

      res.status(201).json({ cashGross, journalEntry: entry, period: { startDate, endDate } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/vault/history", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const entries = await db.select()
        .from(journalEntries)
        .where(eq(journalEntries.referenceType, "shadow_ledger"))
        .orderBy(desc(journalEntries.createdAt))
        .limit(100);
      res.json(entries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PROJECT METADATA (Project Tagging) ===
  app.get("/api/firm/projects", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const rows = await db.select().from(projectMetadata).orderBy(desc(projectMetadata.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/projects", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { name, code, type, coaCode, locationId, description, totalBudget } = req.body;
      if (!name || !code || !coaCode) {
        return res.status(400).json({ message: "name, code, and coaCode are required" });
      }
      const [project] = await db.insert(projectMetadata).values({
        name,
        code,
        type: type || "opex",
        coaCode,
        locationId: locationId || null,
        description: description || null,
        totalBudget: totalBudget || null,
        createdBy: user?.username || "Unknown",
      }).returning();
      res.status(201).json(project);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/projects/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.totalBudget !== undefined) updates.totalBudget = req.body.totalBudget;
      const [updated] = await db.update(projectMetadata).set(updates).where(eq(projectMetadata.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Project not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/projects/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(projectMetadata).where(eq(projectMetadata.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/transactions/:id/tag-project", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const txnId = Number(req.params.id);
      const { projectId } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });

      const [project] = await db.select().from(projectMetadata).where(eq(projectMetadata.id, projectId));
      if (!project) return res.status(404).json({ message: "Project not found" });

      const [txn] = await db.select().from(firmTransactions).where(eq(firmTransactions.id, txnId));
      if (!txn) return res.status(404).json({ message: "Transaction not found" });

      await db.update(firmTransactions).set({
        projectId,
        category: project.type === "capex" ? "equipment" : txn.category,
      }).where(eq(firmTransactions.id, txnId));

      const absAmount = Math.abs(txn.amount);
      await db.update(projectMetadata).set({
        totalSpent: sql`COALESCE(${projectMetadata.totalSpent}, 0) + ${absAmount}`,
      }).where(eq(projectMetadata.id, projectId));

      const [updated] = await db.select().from(firmTransactions).where(eq(firmTransactions.id, txnId));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Jarvis Financial Intelligence
  let _firmInsightCache: { text: string; generatedAt: number; key: string } | null = null;

  app.get("/api/firm/jarvis-insight", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }

      const cacheKey = `${startDate}_${endDate}`;
      const now = Date.now();
      if (_firmInsightCache && _firmInsightCache.key === cacheKey && (now - _firmInsightCache.generatedAt) < 30 * 60 * 1000) {
        return res.json({ insight: _firmInsightCache.text });
      }

      const summary = await storage.getFirmSummary(startDate, endDate);
      const obligations = await storage.getFirmObligations();
      const accounts = await storage.getFirmAccounts();

      const activeAccounts = accounts.filter(a => a.isActive);
      const totalAssets = activeAccounts.filter(a => ["checking", "savings", "cash", "petty_cash"].includes(a.type)).reduce((s, a) => s + a.currentBalance, 0);
      const totalLiabilities = activeAccounts.filter(a => ["credit_card", "loan", "line_of_credit"].includes(a.type)).reduce((s, a) => s + Math.abs(a.currentBalance), 0);

      const revenue = summary.squareRevenue || 0;
      const invoiceExpenses = summary.invoiceExpenseTotal || 0;
      const laborCost = summary.laborCost || 0;
      const payrollTotal = summary.payrollTotal || 0;
      const manualCats = summary.manualTransactionsByCategory || {};
      const manualExpenses = Object.values(manualCats).reduce((s: number, v: any) => s + Math.abs(v as number), 0);
      const totalExpenses = invoiceExpenses + laborCost + payrollTotal + manualExpenses;
      const netPL = revenue - totalExpenses;
      const cashVariance = summary.cashVarianceTotal || 0;

      const upcomingObs = obligations.filter(o => o.isActive && o.nextPaymentDate).sort((a, b) => (a.nextPaymentDate || "").localeCompare(b.nextPaymentDate || ""));

      const dataPrompt = `Financial Data for ${startDate} to ${endDate}:
- Revenue (Square POS): ${revenue.toFixed(2)} from ${summary.squareOrderCount || 0} orders
- Invoice/COGS Expenses: ${invoiceExpenses.toFixed(2)}
- Labor Cost (clocked hours): ${laborCost.toFixed(2)}
- Off-system Payroll: ${payrollTotal.toFixed(2)}
- Manual Transaction Expenses: ${manualExpenses.toFixed(2)}
- Total Expenses: ${totalExpenses.toFixed(2)}
- Net Profit/Loss: ${netPL.toFixed(2)}
- Cash Position (assets): ${totalAssets.toFixed(2)}
- Total Liabilities: ${totalLiabilities.toFixed(2)}
- Net Worth: ${(totalAssets - totalLiabilities).toFixed(2)}
- Cash Drawer Variance: ${cashVariance.toFixed(2)}
${revenue > 0 ? `- Labor % of Revenue: ${((laborCost / revenue) * 100).toFixed(1)}%` : ""}
${revenue > 0 ? `- COGS % of Revenue: ${((invoiceExpenses / revenue) * 100).toFixed(1)}%` : ""}
- Upcoming Obligations (next 30 days): ${upcomingObs.slice(0, 5).map(o => `${o.name}: $${o.monthlyPayment} due ${o.nextPaymentDate}`).join("; ") || "None"}
- Expense breakdown by category: ${Object.entries(manualCats).map(([cat, total]) => `${cat}: $${Math.abs(total as number).toFixed(2)}`).join(", ") || "None recorded"}`;

      const systemPrompt = `You are Jarvis, the AI financial advisor for Bear's Cup Bakehouse — a small artisan bakery. You provide clear, actionable financial insights in plain English. Your tone is warm but professional, like a trusted accountant who actually cares about the business.

Your analysis should include:
1. A plain-English P&L summary (are we making or losing money?)
2. The biggest expense drivers and whether they're in healthy ranges
3. Industry benchmarks for context (bakery labor should be 25-35% of revenue, COGS 25-35%, rent under 10%)
4. Cash flow health — can we cover upcoming obligations?
5. Any red flags or things that need attention
6. One actionable suggestion for improving profitability

Keep it conversational but data-driven. Use actual numbers from the data. If data is sparse (zeros everywhere), acknowledge that we're just getting started and encourage logging transactions. Never make up data you don't have. Keep it under 200 words.`;

      const OpenAI = (await import("openai")).default;
      const insightAI = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await withRetry(() => insightAI.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: dataPrompt },
        ],
        max_tokens: 400,
        temperature: 0.6,
      }), "firm-jarvis-insight");

      const insightText = completion.choices[0]?.message?.content || "Financial data is being gathered. Check back soon for insights.";

      _firmInsightCache = { text: insightText, generatedAt: now, key: cacheKey };
      res.json({ insight: insightText });
    } catch (err: any) {
      console.error("Firm Jarvis insight error:", err.message);
      res.json({ insight: "I'm having trouble analyzing the finances right now. The data is all here — try again in a moment." });
    }
  });

  // === DOUBLE-ENTRY ACCOUNTING (Chart of Accounts, Journal, Reports) ===

  app.get("/api/firm/coa", isAuthenticated, isOwner, async (_req, res) => {
    const accounts = await db.select().from(chartOfAccounts).orderBy(chartOfAccounts.code);
    res.json(accounts);
  });

  app.post("/api/firm/coa", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { code, name, type, category, parentId, locationId, description } = req.body;
      if (!code || !name || !type) return res.status(400).json({ message: "code, name, and type are required" });
      const [acct] = await db.insert(chartOfAccounts).values({
        code, name, type, category: category || null, parentId: parentId || null,
        locationId: locationId || null, description: description || null, isActive: true,
      }).returning();
      res.status(201).json(acct);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/coa/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const [updated] = await db.update(chartOfAccounts).set(req.body).where(eq(chartOfAccounts.id, Number(req.params.id))).returning();
      if (!updated) return res.status(404).json({ message: "Account not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/journal", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate, status } = req.query;
      let conditions = [];
      if (startDate) conditions.push(gte(journalEntries.transactionDate, startDate as string));
      if (endDate) conditions.push(lte(journalEntries.transactionDate, endDate as string));
      if (status) conditions.push(eq(journalEntries.status, status as string));

      const entries = await db.select().from(journalEntries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(journalEntries.transactionDate))
        .limit(200);

      const result = [];
      for (const entry of entries) {
        const lines = await db.select({
          id: ledgerLines.id,
          accountId: ledgerLines.accountId,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          debit: ledgerLines.debit,
          credit: ledgerLines.credit,
          memo: ledgerLines.memo,
        }).from(ledgerLines)
          .innerJoin(chartOfAccounts, eq(ledgerLines.accountId, chartOfAccounts.id))
          .where(eq(ledgerLines.entryId, entry.id));
        result.push({ ...entry, lines });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/journal", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { transactionDate, description, referenceId, referenceType, locationId, lines, skipInference } = req.body;
      if (!transactionDate || !description || !lines || lines.length < 2) {
        return res.status(400).json({ message: "transactionDate, description, and at least 2 lines are required" });
      }
      const user = await getUserFromReq(req);
      const createdBy = user?.username || user?.firstName || "Unknown";
      const { postJournalEntry } = await import("./accounting-engine");
      const entry = await postJournalEntry(
        { transactionDate, description, referenceId, referenceType, locationId, createdBy },
        lines
      );

      if (!skipInference) {
        try {
          const { classifyTransaction } = await import("./ghost-accountant");
          const totalAmount = lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
          const classification = await classifyTransaction(description, -totalAmount, transactionDate);
          await db.insert(aiInferenceLogs).values({
            journalEntryId: entry.id,
            rawInput: `${description} | $${totalAmount.toFixed(2)} | ${transactionDate}`,
            promptVersion: "v1.0",
            logicSummary: classification.logicSummary,
            confidenceScore: classification.confidence,
            anomalyFlag: classification.anomalyScore >= 0.1,
            anomalyScore: classification.anomalyScore,
            suggestedCoaCode: classification.coaCode,
            appliedCoaCode: lines[0]?.accountId ? String(lines[0].accountId) : classification.coaCode,
          });
        } catch (inferErr: any) {
          console.error("[AI Inference] Post-commit inference failed:", inferErr.message);
        }
      }

      res.status(201).json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/firm/journal/by-account", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { code, startDate, endDate } = req.query;
      if (!code) return res.status(400).json({ message: "code (COA code) is required" });

      const [account] = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, code as string)).limit(1);
      if (!account) return res.status(404).json({ message: `Account ${code} not found` });

      let conditions: any[] = [eq(ledgerLines.accountId, account.id)];
      if (startDate) conditions.push(gte(journalEntries.transactionDate, startDate as string));
      if (endDate) conditions.push(lte(journalEntries.transactionDate, endDate as string));

      const lines = await db.select({
        ledgerLineId: ledgerLines.id,
        entryId: journalEntries.id,
        debit: ledgerLines.debit,
        credit: ledgerLines.credit,
        memo: ledgerLines.memo,
        transactionDate: journalEntries.transactionDate,
        description: journalEntries.description,
        status: journalEntries.status,
        referenceType: journalEntries.referenceType,
        referenceId: journalEntries.referenceId,
        createdBy: journalEntries.createdBy,
      }).from(ledgerLines)
        .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
        .where(and(...conditions))
        .orderBy(desc(journalEntries.transactionDate));

      const entriesWithLines = [];
      const seenEntryIds = new Set<number>();
      for (const line of lines) {
        if (seenEntryIds.has(line.entryId)) continue;
        seenEntryIds.add(line.entryId);

        const allLines = await db.select({
          id: ledgerLines.id,
          accountId: ledgerLines.accountId,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          debit: ledgerLines.debit,
          credit: ledgerLines.credit,
          memo: ledgerLines.memo,
        }).from(ledgerLines)
          .innerJoin(chartOfAccounts, eq(ledgerLines.accountId, chartOfAccounts.id))
          .where(eq(ledgerLines.entryId, line.entryId));

        entriesWithLines.push({
          entryId: line.entryId,
          transactionDate: line.transactionDate,
          description: line.description,
          status: line.status,
          referenceType: line.referenceType,
          referenceId: line.referenceId,
          createdBy: line.createdBy,
          lines: allLines,
        });
      }

      res.json({ account, entries: entriesWithLines });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/journal/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const entryId = parseInt(req.params.id);
      const { description, transactionDate, status, memo } = req.body;
      const updates: any = {};
      if (description !== undefined) updates.description = description;
      if (transactionDate !== undefined) updates.transactionDate = transactionDate;
      if (status !== undefined) updates.status = status;

      if (Object.keys(updates).length > 0) {
        await db.update(journalEntries).set(updates).where(eq(journalEntries.id, entryId));
      }

      if (memo !== undefined) {
        await db.update(ledgerLines).set({ memo }).where(eq(ledgerLines.entryId, entryId));
      }

      const { invalidateLineageCache } = await import("./audit-lineage-engine");
      invalidateLineageCache();

      const [updated] = await db.select().from(journalEntries).where(eq(journalEntries.id, entryId));
      const lines = await db.select({
        id: ledgerLines.id,
        accountId: ledgerLines.accountId,
        accountCode: chartOfAccounts.code,
        accountName: chartOfAccounts.name,
        debit: ledgerLines.debit,
        credit: ledgerLines.credit,
        memo: ledgerLines.memo,
      }).from(ledgerLines)
        .innerJoin(chartOfAccounts, eq(ledgerLines.accountId, chartOfAccounts.id))
        .where(eq(ledgerLines.entryId, entryId));

      res.json({ ...updated, lines });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/firm/journal/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const entryId = parseInt(req.params.id);

      await db.delete(ledgerLines).where(eq(ledgerLines.entryId, entryId));
      await db.delete(journalEntries).where(eq(journalEntries.id, entryId));

      const { invalidateLineageCache } = await import("./audit-lineage-engine");
      invalidateLineageCache();

      res.json({ deleted: true, entryId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/journal/reconcile-plaid", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { plaidTxnId, amount, description, transactionDate, debitAccountId, creditAccountId, locationId } = req.body;
      if (!plaidTxnId || amount == null || !debitAccountId || !creditAccountId) {
        return res.status(400).json({ message: "plaidTxnId, amount, debitAccountId, creditAccountId are required" });
      }
      const user = await getUserFromReq(req);
      const { reconcilePlaidTransaction } = await import("./accounting-engine");
      const entry = await reconcilePlaidTransaction(
        plaidTxnId, amount, description || "Plaid Transaction", transactionDate || new Date().toISOString().split("T")[0],
        debitAccountId, creditAccountId, user?.username || user?.firstName || "Unknown", locationId
      );

      await db.update(firmTransactions)
        .set({ reconciled: true })
        .where(eq(firmTransactions.referenceId, plaidTxnId));

      res.status(201).json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/firm/reports/pnl", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
      const { getProfitAndLoss } = await import("./accounting-engine");
      const layer = (req.query.layer === "baker") ? "baker" : "bank";
      const excludeProjectId = req.query.excludeProjectId ? parseInt(req.query.excludeProjectId as string) : undefined;
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const includeAccruals = req.query.includeAccruals === "true";
      const pnl = await getProfitAndLoss(startDate as string, endDate as string, layer, { excludeProjectId, locationId, includeAccruals });
      res.json(pnl);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/reports/balance-sheet", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { asOfDate } = req.query;
      if (!asOfDate) return res.status(400).json({ message: "asOfDate required" });
      const { getBalanceSheet } = await import("./accounting-engine");
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const bs = await getBalanceSheet(asOfDate as string, locationId ? { locationId } : undefined);
      res.json(bs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/reports/cash-flow", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
      const { getCashFlow } = await import("./accounting-engine");
      const cf = await getCashFlow(startDate as string, endDate as string);
      res.json(cf);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/reports/equity-basis", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
      const { getEquityBasisInsight } = await import("./accounting-engine");
      const insight = await getEquityBasisInsight(startDate as string, endDate as string);
      res.json(insight);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/reports/trial-balance", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      const { getTrialBalance } = await import("./accounting-engine");
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const tb = await getTrialBalance(startDate as string | undefined, endDate as string | undefined, locationId ? { locationId } : undefined);
      res.json(tb);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/coa/seed", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { seedChartOfAccounts } = await import("./accounting-engine");
      await seedChartOfAccounts();
      const accounts = await db.select().from(chartOfAccounts).orderBy(chartOfAccounts.code);
      res.json({ message: "Chart of Accounts seeded", accounts });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === GHOST ACCOUNTANT / AI FINANCIAL INTELLIGENCE ===
  app.post("/api/firm/ai/classify", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { description, amount, date } = req.body;
      if (!description || amount == null || !date) return res.status(400).json({ message: "description, amount, date required" });
      const { classifyTransaction } = await import("./ghost-accountant");
      const result = await classifyTransaction(description, amount, date);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/ai/infer-and-post", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { description, amount, date, referenceId, referenceType, locationId, category } = req.body;
      if (!description || amount == null || !date) return res.status(400).json({ message: "description, amount, date required" });
      const user = await getUserFromReq(req);
      const { inferAndPostTransaction } = await import("./ghost-accountant");
      const result = await inferAndPostTransaction(
        description, amount, date, referenceId, referenceType, locationId,
        user?.username || user?.firstName || "Unknown",
        category
      );
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/firm/ai/analyze", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
      const { generateAIConsultation } = await import("./ghost-accountant");
      const result = await generateAIConsultation(startDate, endDate);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/ai/consultations", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { status } = req.query;
      let conditions = [];
      if (status) conditions.push(eq(financialConsultations.status, status as string));
      const results = await db.select().from(financialConsultations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(financialConsultations.createdAt))
        .limit(100);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/ai/consultations/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { status, dismissedBy } = req.body;
      const updates: any = {};
      if (status) updates.status = status;
      if (dismissedBy) updates.dismissedBy = dismissedBy;
      if (status === "IMPLEMENTED") updates.implementedAt = new Date();
      const [updated] = await db.update(financialConsultations)
        .set(updates)
        .where(eq(financialConsultations.id, Number(req.params.id)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Consultation not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/ai/summary", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
      const { generateExecutiveSummary } = await import("./ghost-accountant");
      const summary = await generateExecutiveSummary(startDate as string, endDate as string);
      res.json({ summary });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/ai/audit-trail", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { getInferenceAuditTrail } = await import("./ghost-accountant");
      const trail = await getInferenceAuditTrail();
      res.json(trail);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/audit/lineage", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { code, category, startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      const codeOrCategory = code || category || "expense";
      const { getAuditLineage } = await import("./audit-lineage-engine");
      const result = await getAuditLineage(String(codeOrCategory), String(startDate), String(endDate));
      res.json(result);
    } catch (err: any) {
      console.error("[AuditLineage] Route error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // === ADP RUN API ROUTES ===
  app.get("/api/hr/adp/status", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { adpClient } = await import("./adp-api");
      const status = await adpClient.getStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hr/adp/workers", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { adpClient } = await import("./adp-api");
      const result = await adpClient.getWorkers();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hr/adp/link/:userId", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { adpAssociateOID } = req.body;
      if (!adpAssociateOID) {
        return res.status(400).json({ message: "ADP Associate OID is required" });
      }
      await storage.updateUserAdpOID(userId, adpAssociateOID);
      res.json({ message: "Employee linked to ADP worker successfully" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hr/adp/unlink/:userId", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { userId } = req.params;
      await storage.updateUserAdpOID(userId, null);
      res.json({ message: "ADP link removed" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hr/adp/sync-worker/:userId", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { adpClient } = await import("./adp-api");
      const status = await adpClient.getStatus();
      if (!status.configured) {
        return res.status(400).json({ message: "ADP is not configured" });
      }
      const { userId } = req.params;
      const { db } = await import("./db");
      const { users } = await import("@shared/models/auth");
      const { eq } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.adpAssociateOID) {
        return res.status(400).json({ message: "User not found or not linked to ADP" });
      }
      const results: string[] = [];
      if (user.firstName || user.lastName) {
        try {
          await adpClient.updateWorkerEvent(user.adpAssociateOID, "legal-name", "change", {
            person: { legalName: { givenName: user.firstName || "", familyName1: user.lastName || "" } }
          });
          results.push("Legal name updated");
        } catch (e: any) { results.push(`Legal name failed: ${e.message}`); }
      }
      if (user.hourlyRate) {
        try {
          await adpClient.updateWorkerEvent(user.adpAssociateOID, "work-assignment.base-remuneration", "change", {
            workAssignment: { baseRemuneration: { payRateAmount: { amountValue: user.hourlyRate } } }
          });
          results.push("Pay rate updated");
        } catch (e: any) { results.push(`Pay rate failed: ${e.message}`); }
      }
      res.json({ message: "Sync completed", results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hr/adp/codelists/:type", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { adpClient } = await import("./adp-api");
      const result = await adpClient.getCodeLists(req.params.type);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PAYROLL ROUTES ===
  app.get("/api/payroll/compile", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { start, end, locationId } = req.query;
      if (!start || !end) {
        return res.status(400).json({ message: "start and end dates are required (YYYY-MM-DD)" });
      }
      const { compilePayroll } = await import("./payroll-compiler");
      const summary = await compilePayroll(
        start as string,
        end as string,
        locationId ? parseInt(locationId as string) : undefined,
      );
      res.json(summary);
    } catch (err: any) {
      console.error("[Payroll Compile] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/payroll/tax-rates", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const row = await db.select().from(appSettings).where(eq(appSettings.key, "payroll_tax_rates")).limit(1);
      const defaults = {
        socialSecurity: 6.2,
        medicare: 1.45,
        federalUnemployment: 0.6,
        stateUnemployment: 2.7,
        workersComp: 1.5,
        disabilityInsurance: 0,
        paidFamilyLeave: 0,
        additionalFees: 0,
        adpPerCheckFee: 0,
        adpBaseWeeklyFee: 0,
      };
      if (row.length > 0) {
        res.json({ ...defaults, ...JSON.parse(row[0].value) });
      } else {
        res.json(defaults);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/payroll/tax-rates", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const rates = req.body;
      const existing = await db.select().from(appSettings).where(eq(appSettings.key, "payroll_tax_rates")).limit(1);
      if (existing.length > 0) {
        await db.update(appSettings).set({ value: JSON.stringify(rates) }).where(eq(appSettings.key, "payroll_tax_rates"));
      } else {
        await db.insert(appSettings).values({ key: "payroll_tax_rates", value: JSON.stringify(rates) });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payroll/push-to-adp", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { adpClient } = await import("./adp-api");
      const status = await adpClient.getStatus();
      if (!status.configured) {
        return res.status(400).json({ message: "ADP is not configured. Set ADP_CLIENT_ID, ADP_CLIENT_SECRET, ADP_SSL_CERT, and ADP_SSL_KEY." });
      }
      const { payPeriodStart, payPeriodEnd, locationId } = req.body;
      if (!payPeriodStart || !payPeriodEnd) {
        return res.status(400).json({ message: "payPeriodStart and payPeriodEnd are required" });
      }

      const { compilePayroll } = await import("./payroll-compiler");
      const compiledData = await compilePayroll(payPeriodStart, payPeriodEnd, locationId ? parseInt(locationId) : undefined);

      const linkedEmployees = compiledData.employees.filter((e: any) => e.adpAssociateOID);
      if (linkedEmployees.length === 0) {
        return res.status(400).json({ message: "No employees are linked to ADP workers" });
      }

      const payDataInput = {
        payrollGroupCode: { codeValue: "DEFAULT" },
        payPeriod: {
          startDate: payPeriodStart,
          endDate: payPeriodEnd,
        },
        payeePayInputs: linkedEmployees.map((emp: any) => ({
          associateOID: emp.adpAssociateOID,
          earningInputs: [
            ...(emp.payType === "salary" && emp.periodSalary ? [{
              earningCode: { codeValue: "SAL" },
              numberOfHours: 0,
              rate: { rateValue: emp.periodSalary, baseUnitCode: { codeValue: "FLAT" } },
            }] : []),
            ...(emp.payType !== "salary" && emp.regularHours > 0 ? [{
              earningCode: { codeValue: "REG" },
              numberOfHours: emp.regularHours,
              rate: { rateValue: emp.hourlyRate, baseUnitCode: { codeValue: "HOUR" } },
            }] : []),
            ...(emp.overtimeHours > 0 ? [{
              earningCode: { codeValue: "OT" },
              numberOfHours: emp.overtimeHours,
              rate: { rateValue: emp.hourlyRate * 1.5, baseUnitCode: { codeValue: "HOUR" } },
            }] : []),
            ...(emp.vacationHours > 0 ? [{
              earningCode: { codeValue: "VAC" },
              numberOfHours: emp.vacationHours,
              rate: { rateValue: emp.hourlyRate || (emp.annualSalary ? emp.annualSalary / 2080 : 0), baseUnitCode: { codeValue: "HOUR" } },
            }] : []),
            ...(emp.sickHours > 0 ? [{
              earningCode: { codeValue: "SICK" },
              numberOfHours: emp.sickHours,
              rate: { rateValue: emp.hourlyRate || (emp.annualSalary ? emp.annualSalary / 2080 : 0), baseUnitCode: { codeValue: "HOUR" } },
            }] : []),
            ...(emp.tips > 0 ? [{
              earningCode: { codeValue: "TIPS" },
              numberOfHours: 0,
              rate: { rateValue: emp.tips, baseUnitCode: { codeValue: "FLAT" } },
            }] : []),
          ],
        })),
      };

      const result = await adpClient.addPayDataInput(payDataInput);
      const batch = await storage.createPayrollBatch({
        payPeriodStart: new Date(payPeriodStart),
        payPeriodEnd: new Date(payPeriodEnd),
        status: "submitted",
        employeeCount: linkedEmployees.length,
        totalHours: compiledData.totals.regularHours + compiledData.totals.overtimeHours,
        totalGross: compiledData.totals.grossEstimate,
        adpBatchId: result?.data?.batchId || null,
        compiledData,
        submittedAt: new Date(),
        submittedBy: req.appUser.id,
      });

      res.json({ success: true, batch, adpResult: result });
    } catch (err: any) {
      console.error("[Payroll Push] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/payroll/history", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const batches = await storage.getPayrollBatches();
      res.json(batches);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/payroll/adp-status", isAuthenticated, isOwner, async (_req: any, res) => {
    try {
      const { adpClient } = await import("./adp-api");
      const status = await adpClient.getStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === JMT (JARVIS MENU THEATER) ===

  // Auto-fix broken JMT menu image URLs on startup
  (async () => {
    try {
      const brokenMenus = await db.select().from(jmtMenus);
      const broken = brokenMenus.filter(m => m.imageUrl && m.imageUrl.startsWith("/api/media/file/"));
      if (broken.length > 0) {
        const menusDir = path.join(process.cwd(), "client", "public", "menus");
        const distMenusDir = path.join(process.cwd(), "dist", "public", "menus");
        let staticFiles: string[] = [];
        for (const dir of [menusDir, distMenusDir]) {
          try {
            if (fs.existsSync(dir)) {
              staticFiles = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).map(f => `/menus/${f}`);
              if (staticFiles.length > 0) break;
            }
          } catch {}
        }
        if (staticFiles.length > 0) {
          for (let i = 0; i < broken.length; i++) {
            const staticUrl = staticFiles[i % staticFiles.length];
            await db.update(jmtMenus).set({ imageUrl: staticUrl, imageKey: null, thumbnailUrl: staticUrl }).where(eq(jmtMenus.id, broken[i].id));
            console.log(`[JMT] Auto-fixed menu "${broken[i].name}" (id=${broken[i].id}): ${broken[i].imageUrl} → ${staticUrl}`);
          }
        }
      }
    } catch (err) {
      console.error("[JMT] Auto-fix error:", err);
    }
  })();

  app.get("/api/jmt/static-images", isAuthenticated, (_req: any, res) => {
    try {
      const menusDir = path.join(process.cwd(), "client", "public", "menus");
      const distMenusDir = path.join(process.cwd(), "dist", "public", "menus");
      let files: string[] = [];
      for (const dir of [menusDir, distMenusDir]) {
        try {
          if (fs.existsSync(dir)) {
            const found = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp|gif)$/i.test(f));
            files = [...files, ...found.map(f => `/menus/${f}`)];
          }
        } catch {}
      }
      res.json([...new Set(files)]);
    } catch {
      res.json([]);
    }
  });

  // Get all menus
  app.get("/api/jmt/menus", isAuthenticated, async (_req: any, res) => {
    try {
      const menus = await db.select().from(jmtMenus).orderBy(desc(jmtMenus.createdAt));
      res.json(menus);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Upload a new menu
  app.post("/api/jmt/menus", isAuthenticated, async (req: any, res) => {
    const user = req.appUser as any;
    if (user.role !== "owner" && user.role !== "manager") {
      return res.status(403).json({ message: "Manager or owner access required" });
    }
    try {
      const { name, description, imageData, imageUrl: staticUrl, orientation, category, tags } = req.body;
      if (!name || (!imageData && !staticUrl)) {
        return res.status(400).json({ message: "name and either imageData or imageUrl are required" });
      }

      let imageUrl: string;
      let imageKey: string | null = null;
      let thumbnailUrl: string | null = null;

      if (staticUrl) {
        imageUrl = staticUrl;
      } else {
        const base64Match = imageData.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
        if (!base64Match) {
          return res.status(400).json({ message: "Invalid image data format" });
        }
        const ext = base64Match[1] === "jpeg" ? "jpg" : base64Match[1];
        const buffer = Buffer.from(base64Match[2], "base64");
        const filename = `menu_${Date.now()}.${ext}`;
        const clientDir = path.join(process.cwd(), "client", "public", "menus");
        const distDir = path.join(process.cwd(), "dist", "public", "menus");
        for (const dir of [clientDir, distDir]) {
          try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, filename), buffer);
          } catch (e) { console.error(`[JMT] Failed to write to ${dir}:`, e); }
        }
        imageUrl = `/menus/${filename}`;
        thumbnailUrl = `/menus/${filename}`;
      }

      const [menu] = await db.insert(jmtMenus).values({
        name,
        description: description || null,
        imageUrl,
        imageKey,
        thumbnailUrl,
        orientation: orientation || "portrait",
        category: category || "general",
        tags: tags || null,
        uploadedBy: user.id,
      }).returning();
      res.json(menu);
    } catch (err: any) {
      console.error("JMT menu upload error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Update menu metadata
  app.patch("/api/jmt/menus/:id", isAuthenticated, async (req: any, res) => {
    const user = req.appUser as any;
    if (user.role !== "owner" && user.role !== "manager") {
      return res.status(403).json({ message: "Manager or owner access required" });
    }
    try {
      const id = parseInt(req.params.id);
      const updates: any = { updatedAt: new Date() };
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.orientation !== undefined) updates.orientation = req.body.orientation;
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.tags !== undefined) updates.tags = req.body.tags;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      if (req.body.seasonalStart !== undefined) updates.seasonalStart = req.body.seasonalStart ? new Date(req.body.seasonalStart) : null;
      if (req.body.seasonalEnd !== undefined) updates.seasonalEnd = req.body.seasonalEnd ? new Date(req.body.seasonalEnd) : null;

      if (req.body.imageUrl) {
        updates.imageUrl = req.body.imageUrl;
        updates.imageKey = null;
        updates.thumbnailUrl = req.body.imageUrl;
      } else if (req.body.imageData) {
        const base64Match = req.body.imageData.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
        if (base64Match) {
          const ext = base64Match[1] === "jpeg" ? "jpg" : base64Match[1];
          const buffer = Buffer.from(base64Match[2], "base64");
          const filename = `menu_${Date.now()}.${ext}`;
          const clientDir = path.join(process.cwd(), "client", "public", "menus");
          const distDir = path.join(process.cwd(), "dist", "public", "menus");
          for (const dir of [clientDir, distDir]) {
            try {
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, filename), buffer);
            } catch (e) { console.error(`[JMT] Failed to write to ${dir}:`, e); }
          }
          updates.imageUrl = `/menus/${filename}`;
          updates.imageKey = null;
          updates.thumbnailUrl = `/menus/${filename}`;
        }
      }

      const [menu] = await db.update(jmtMenus).set(updates).where(eq(jmtMenus.id, id)).returning();
      res.json(menu);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Delete a menu
  app.delete("/api/jmt/menus/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await db.select().from(jmtMenus).where(eq(jmtMenus.id, id));
      if (existing[0]?.imageKey) {
        const { deleteMedia } = await import("./media");
        try { await deleteMedia(existing[0].imageKey); } catch {}
      }
      await db.update(jmtDisplays).set({ menuId: null, isLive: false, updatedAt: new Date() }).where(eq(jmtDisplays.menuId, id));
      await db.delete(jmtMenus).where(eq(jmtMenus.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get all displays
  app.get("/api/jmt/displays", isAuthenticated, async (_req: any, res) => {
    try {
      let displays = await db.select().from(jmtDisplays).orderBy(jmtDisplays.slotNumber);
      if (displays.length === 0) {
        const seedDisplays = [];
        for (let i = 1; i <= 15; i++) {
          seedDisplays.push({
            slotNumber: i,
            name: `Display ${i}`,
            orientation: "portrait" as const,
            rotationDeg: 0,
            isLive: false,
            showEightySixed: false,
            refreshInterval: 0,
          });
        }
        displays = await db.insert(jmtDisplays).values(seedDisplays).returning();
      }
      res.json(displays);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update a display (assign menu, change settings)
  app.patch("/api/jmt/displays/:id", isAuthenticated, async (req: any, res) => {
    const user = req.appUser as any;
    if (user.role !== "owner" && user.role !== "manager") {
      return res.status(403).json({ message: "Manager or owner access required" });
    }
    try {
      const id = parseInt(req.params.id);
      const updates: any = { updatedAt: new Date() };
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.menuId !== undefined) updates.menuId = req.body.menuId;
      if (req.body.orientation !== undefined) updates.orientation = req.body.orientation;
      if (req.body.rotationDeg !== undefined) updates.rotationDeg = req.body.rotationDeg;
      if (req.body.isLive !== undefined) updates.isLive = req.body.isLive;
      if (req.body.refreshInterval !== undefined) updates.refreshInterval = req.body.refreshInterval;
      if (req.body.showEightySixed !== undefined) updates.showEightySixed = req.body.showEightySixed;
      if (req.body.locationId !== undefined) updates.locationId = req.body.locationId;
      if (req.body.scheduleEnabled !== undefined) updates.scheduleEnabled = req.body.scheduleEnabled;
      if (req.body.scheduleStart !== undefined) updates.scheduleStart = req.body.scheduleStart;
      if (req.body.scheduleEnd !== undefined) updates.scheduleEnd = req.body.scheduleEnd;

      if (req.body.isLive === true) updates.lastPublishedAt = new Date();

      const [display] = await db.update(jmtDisplays).set(updates).where(eq(jmtDisplays.id, id)).returning();

      const historyMenuId = req.body.menuId ?? display.menuId;
      if ((req.body.menuId !== undefined || req.body.isLive !== undefined) && historyMenuId) {
        await db.insert(jmtDisplayHistory).values({
          displayId: id,
          menuId: historyMenuId,
          action: req.body.isLive ? "published" : req.body.menuId ? "assigned" : "updated",
          performedBy: user.id,
        });
      }

      if (display.slotNumber) broadcastToScreen(display.slotNumber);
      res.json(display);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get display history
  app.get("/api/jmt/displays/:id/history", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const history = await db.select().from(jmtDisplayHistory)
        .where(eq(jmtDisplayHistory.displayId, id))
        .orderBy(desc(jmtDisplayHistory.createdAt))
        .limit(50);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Jarvis Recommend — AI menu suggestions
  app.post("/api/jmt/jarvis-recommend", isAuthenticated, async (req: any, res) => {
    const user = req.appUser as any;
    if (user.role !== "owner" && user.role !== "manager") {
      return res.status(403).json({ message: "Manager or owner access required" });
    }
    try {
      const { context } = req.body;
      const soldoutResults = await db.select().from(soldoutLogs)
        .where(sql`DATE(${soldoutLogs.soldOutAt}) = CURRENT_DATE`)
        .limit(20);
      const eightySixedItems = soldoutResults.map((s: any) => s.itemName).filter(Boolean);

      const menus = await db.select({ name: jmtMenus.name, category: jmtMenus.category, orientation: jmtMenus.orientation }).from(jmtMenus).where(eq(jmtMenus.isActive, true));
      const displays = await db.select().from(jmtDisplays).where(eq(jmtDisplays.isLive, true));

      const systemPrompt = `You are Jarvis, the AI operations manager for Bear's Cup Bakehouse. You're an expert in menu engineering, visual merchandising, and bakery operations. Provide creative, actionable menu display recommendations.

Current state:
- ${menus.length} menu designs available (${menus.map(m => `"${m.name}" [${m.category}/${m.orientation}]`).join(", ") || "none"})
- ${displays.length} displays currently live
- 86'd items today: ${eightySixedItems.length > 0 ? eightySixedItems.join(", ") : "none"}

Consider: seasonal relevance, time of day, customer psychology, visual flow between displays, upselling opportunities, and any 86'd items that should trigger menu swaps.`;

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const completion = await withRetry(() => aiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context || "Give me your top recommendations for optimizing our menu displays right now." },
        ],
        temperature: 0.8,
        max_tokens: 800,
      }));

      res.json({ recommendation: completion.choices[0]?.message?.content || "No recommendation available." });
    } catch (err: any) {
      console.error("JMT Jarvis recommend error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/jmt/screen-events/:slot", (req, res) => {
    const slot = req.params.slot;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");

    if (!screenClients.has(slot)) screenClients.set(slot, new Set());
    screenClients.get(slot)!.add(res);

    const heartbeat = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch {}
    }, 30000);

    const cleanup = () => {
      screenClients.get(slot)?.delete(res);
      if (screenClients.get(slot)?.size === 0) screenClients.delete(slot);
      clearInterval(heartbeat);
    };
    req.on("close", cleanup);
    res.on("error", cleanup);
    res.on("finish", cleanup);
  });

  app.post("/api/jmt/push-refresh", isAuthenticated, isManager, (req: any, res) => {
    const slot = req.body.slot;
    if (slot !== undefined && slot !== "all") {
      const s = parseInt(slot);
      if (isNaN(s) || s < 1 || s > 15) return res.status(400).json({ message: "Invalid slot" });
      broadcastToScreen(s);
      return res.json({ pushed: s });
    }
    broadcastToScreen("all");
    res.json({ pushed: "all" });
  });

  // Public display endpoint — serves the menu for a specific slot
  app.get("/api/jmt/screen/:slot", async (req, res) => {
    try {
      const slot = parseInt(req.params.slot);
      if (isNaN(slot) || slot < 1 || slot > 15) {
        return res.status(404).json({ message: "Invalid display slot" });
      }
      const [display] = await db.select().from(jmtDisplays).where(eq(jmtDisplays.slotNumber, slot));
      if (!display || !display.isLive || !display.menuId) {
        return res.json({ active: false, slot });
      }

      if (display.scheduleEnabled && display.scheduleStart && display.scheduleEnd) {
        const now = new Date();
        const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const hh = eastern.getHours().toString().padStart(2, "0");
        const mm = eastern.getMinutes().toString().padStart(2, "0");
        const currentTime = `${hh}:${mm}`;
        const start = display.scheduleStart;
        const end = display.scheduleEnd;

        let inWindow: boolean;
        if (start <= end) {
          inWindow = currentTime >= start && currentTime < end;
        } else {
          inWindow = currentTime >= start || currentTime < end;
        }
        if (!inWindow) {
          return res.json({ active: false, slot, reason: "outside_schedule" });
        }
      }
      const [menu] = await db.select().from(jmtMenus).where(eq(jmtMenus.id, display.menuId));
      if (!menu) {
        return res.json({ active: false, slot });
      }

      let eightySixedItems: string[] = [];
      if (display.showEightySixed) {
        try {
          const logs = await db.select().from(soldoutLogs)
            .where(sql`DATE(${soldoutLogs.soldOutAt}) = CURRENT_DATE`)
            .limit(30);
          eightySixedItems = logs.map((l: any) => l.itemName).filter(Boolean);
        } catch {}
      }

      res.json({
        active: true,
        slot,
        imageUrl: menu.imageUrl,
        orientation: display.orientation,
        rotationDeg: display.rotationDeg,
        refreshInterval: display.refreshInterval || 0,
        showEightySixed: display.showEightySixed,
        eightySixedItems,
        menuName: menu.name,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === TUTORIALS ===

  app.get("/api/tutorials", isAuthenticated, async (req: any, res) => {
    try {
      const allTutorials = await db.select().from(tutorials).orderBy(tutorials.sortOrder);
      res.json(allTutorials);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/tutorials/for-page", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      const pagePath = req.query.pagePath as string;
      if (!pagePath) return res.status(400).json({ message: "pagePath required" });

      const pageTutorials = await db.select().from(tutorials)
        .where(and(
          eq(tutorials.pagePath, pagePath),
          eq(tutorials.isActive, true)
        ))
        .orderBy(tutorials.sortOrder);

      const filtered = pageTutorials.filter(t => {
        if (t.targetDepartment && t.targetDepartment !== user.department) return false;
        if (t.targetRole && t.targetRole !== user.role) return false;
        return true;
      });

      const viewed = await db.select().from(tutorialViews)
        .where(eq(tutorialViews.userId, user.id));
      const viewedIds = new Set(viewed.map(v => v.tutorialId));

      const unseen = filtered.filter(t => !viewedIds.has(t.id));
      res.json(unseen);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/tutorials/viewed", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      const { tutorialId } = req.body;
      if (!tutorialId) return res.status(400).json({ message: "tutorialId required" });

      const existing = await db.select().from(tutorialViews)
        .where(and(
          eq(tutorialViews.userId, user.id),
          eq(tutorialViews.tutorialId, tutorialId)
        )).limit(1);

      if (existing.length === 0) {
        await db.insert(tutorialViews).values({ userId: user.id, tutorialId });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/tutorials", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const [tutorial] = await db.insert(tutorials).values(req.body).returning();
      res.json(tutorial);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/tutorials/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [updated] = await db.update(tutorials)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(tutorials.id, id))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/tutorials/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(tutorialViews).where(eq(tutorialViews.tutorialId, id));
      await db.delete(tutorials).where(eq(tutorials.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/tutorials/reset-views", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { tutorialId } = req.body;
      if (tutorialId) {
        await db.delete(tutorialViews).where(eq(tutorialViews.tutorialId, tutorialId));
      } else {
        await db.delete(tutorialViews);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PFG SFTP Integration ===
  app.get("/api/pfg/test", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { testPfgConnection } = await import("./pfg-sftp");
      const result = await testPfgConnection();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/pfg/files", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { listPfgFiles } = await import("./pfg-sftp");
      const folder = (req.query.folder as string) || "/OUT";
      const result = await listPfgFiles(folder);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, files: [], message: err.message });
    }
  });

  app.get("/api/pfg/download", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { downloadPfgFile } = await import("./pfg-sftp");
      const path = req.query.path as string;
      if (!path) return res.status(400).json({ success: false, message: "path required" });
      const result = await downloadPfgFile(path);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/pfg/import", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { pullAndImportPfgInvoices } = await import("./pfg-sftp");
      const result = await pullAndImportPfgInvoices();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message, imported: [] });
    }
  });

  app.get("/api/pfg/order-guide", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { pullPfgOrderGuide } = await import("./pfg-sftp");
      const result = await pullPfgOrderGuide();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message, items: [] });
    }
  });

  app.get("/api/pfg/acknowledgements", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { pullPfgAcknowledgements } = await import("./pfg-sftp");
      const result = await pullPfgAcknowledgements();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message, acknowledgements: [] });
    }
  });

  // === GMAIL INTEGRATION ===
  app.get("/api/gmail/profile", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { getProfile } = await import("./gmail");
      const profile = await getProfile();
      res.json({ success: true, ...profile });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/gmail/messages", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { listEmails } = await import("./gmail");
      const query = req.query.q as string | undefined;
      const maxResults = parseInt(req.query.maxResults as string) || 20;
      const result = await listEmails(query, maxResults);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message, messages: [] });
    }
  });

  app.get("/api/gmail/messages/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { getEmail } = await import("./gmail");
      const email = await getEmail(req.params.id);
      res.json({ success: true, ...email });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/gmail/send", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { sendEmail } = await import("./gmail");
      const { to, subject, body, cc, bcc, replyToMessageId } = req.body;
      if (!to || !subject || !body) {
        return res.status(400).json({ success: false, message: "to, subject, and body are required" });
      }
      const result = await sendEmail({ to, subject, body, cc, bcc, replyToMessageId });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/gmail/scan-invoices", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { scanGmailForInvoices } = await import("./gmail");
      const daysBack = parseInt(req.query.days as string) || 7;
      const results = await scanGmailForInvoices(daysBack);
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message, results: [] });
    }
  });

  app.post("/api/gmail/process-invoice", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { getEmailWithAttachmentInfo, downloadAttachment } = await import("./gmail");
      const { messageId } = req.body;
      if (!messageId) return res.status(400).json({ success: false, message: "messageId required" });

      const email = await getEmailWithAttachmentInfo(messageId);
      const pdfAttachments = email.attachments.filter(a =>
        a.mimeType === 'application/pdf' ||
        a.filename.toLowerCase().endsWith('.pdf')
      );
      const imageAttachments = email.attachments.filter(a =>
        a.mimeType.startsWith('image/') ||
        /\.(png|jpg|jpeg|gif|webp|tiff?)$/i.test(a.filename)
      );

      const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
      const MAX_ATTACHMENTS = 5;
      const attachmentsToProcess = (pdfAttachments.length > 0 ? pdfAttachments : imageAttachments)
        .filter(a => a.size <= MAX_ATTACHMENT_SIZE)
        .slice(0, MAX_ATTACHMENTS);

      let invoiceData: any = null;

      if (attachmentsToProcess.length > 0) {
        const pdfTexts: string[] = [];
        const images: string[] = [];

        for (const att of attachmentsToProcess) {
          const buffer = await downloadAttachment(messageId, att.attachmentId);
          const isPdf = att.mimeType === 'application/pdf' || att.filename.toLowerCase().endsWith('.pdf');

          if (isPdf) {
            try {
              const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
              const uint8 = new Uint8Array(buffer);
              const doc = await pdfjsLib.getDocument({ data: uint8 }).promise;
              const pages: string[] = [];
              for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const content = await page.getTextContent();
                const text = content.items
                  .map((item: any) => item.str)
                  .join(' ');
                pages.push(text);
              }
              pdfTexts.push(`[PDF: ${att.filename}]\n${pages.join('\n---PAGE BREAK---\n')}`);
            } catch (pdfErr) {
              console.warn(`[Gmail] PDF parse failed for ${att.filename}, sending as base64:`, pdfErr);
              pdfTexts.push(`[PDF: ${att.filename} - could not extract text]`);
            }
          } else {
            const base64 = buffer.toString('base64');
            images.push(`data:${att.mimeType};base64,${base64}`);
          }
        }

        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });

        const allItemsForAI = await db.select().from(inventoryItems);
        const { buildAIMatchingContext } = await import("./item-matcher");
        const inventoryContext = buildAIMatchingContext(allItemsForAI);

        const systemPrompt = `You are an expert invoice parser for Bear's Cup Bakehouse. Extract ALL data from the invoice content provided.

CRITICAL RULES:
- invoiceTotal is REQUIRED. Look for "Total", "Invoice Total", "Amount Due", "Balance Due", "Grand Total", "Net Amount", or similar. If you cannot find an explicit total, SUM all line item totals and use that.
- Every line item MUST have a lineTotal. If lineTotal is not shown, calculate it as quantity × unitPrice.
- invoiceNumber is REQUIRED. Look for "Invoice #", "Invoice No", "Document #", "Ref #", or similar.

ITEM DESCRIPTION MATCHING - VERY IMPORTANT:
For each line item's "itemDescription", try to match it to our inventory list below. If you can identify which inventory item the invoice line refers to, use our inventory item name EXACTLY as the itemDescription. This helps us auto-link invoice items to our master list.
- "BUTTER SHEETS NON AOP 83%" → if we have "Butter Sheets" in inventory, use "Butter Sheets"
- "KA SIR LANCELOT BREAD FL 50#" → if we have "Sir Lancelot Flour" in inventory, use "Sir Lancelot Flour"
- "SPC KOSHER SALT 12/3 LB" → if we have "Kosher Salt" in inventory, use "Kosher Salt"
- If no clear match exists, keep the original description from the invoice.
- Also include the original vendor description in parentheses if you change it: "Butter Sheets (BUTTER SHEETS NON AOP 83%)"

OUR INVENTORY ITEMS:
${inventoryContext}

IMPORTANT GUIDELINES:
- Common suppliers: Chefs' Warehouse, Sysco, BakeMark, Copper Horse Coffee, PFG, Noissue, Ecoware, Harney & Sons, Noble Gas Solutions, Amazon
- Recognize unit abbreviations: cs=case, ea=each, bx=box, bg=bag, pk=pack, dz=dozen, lb=pound, oz=ounce, gal=gallon, ct=count
- Tax, delivery fees, fuel surcharges = capture in "notes" NOT as line items, but DO include them in the invoiceTotal
- If unclear, append "(?)" to that field value
- Prices: numbers only, no currency symbols

Return JSON:
{
  "vendorName": "string",
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "string - NEVER null, always find it",
  "invoiceTotal": number - NEVER null, always calculate if not found,
  "notes": "string or null - include tax/fees breakdown here",
  "lines": [{ "itemDescription": "string", "quantity": number, "unit": "string or null", "unitPrice": number or null, "lineTotal": number - NEVER null }]
}`;

        const userContent: any[] = [
          { type: "text", text: `Parse this invoice from email "${email.subject}" sent by ${email.from}. Extract all line items.\n\n${pdfTexts.join('\n\n')}` },
        ];

        if (images.length > 0) {
          for (const img of images) {
            userContent.push({ type: "image_url", image_url: { url: img } });
          }
        }

        const response = await withRetry(() => openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 8192,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ],
          response_format: { type: "json_object" },
        }), "gmail-invoice-scan");

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            invoiceData = JSON.parse(content);
          } catch {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) invoiceData = JSON.parse(jsonMatch[0]);
          }
        }
      } else if (email.body) {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });

        const response = await withRetry(() => openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 8192,
          messages: [
            {
              role: "system",
              content: `Extract invoice data from this email body. invoiceTotal is CRITICAL — look for "Total", "Amount Due", "Balance Due", etc. If not found, sum all line totals. Every line must have a lineTotal (calculate as qty × price if missing). Return JSON: { "vendorName": "string", "invoiceDate": "YYYY-MM-DD", "invoiceNumber": "string - always find it", "invoiceTotal": number - NEVER null, "notes": "string or null", "lines": [{ "itemDescription": "string", "quantity": number, "unit": "string or null", "unitPrice": number or null, "lineTotal": number }] }`
            },
            { role: "user", content: `Email from: ${email.from}\nSubject: ${email.subject}\n\n${email.body.slice(0, 10000)}` }
          ],
          response_format: { type: "json_object" },
        }), "gmail-invoice-body-scan");

        const content = response.choices[0]?.message?.content;
        if (content) {
          try { invoiceData = JSON.parse(content); } catch {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) invoiceData = JSON.parse(jsonMatch[0]);
          }
        }
      }

      if (!invoiceData) {
        return res.json({ success: false, message: "Could not extract invoice data from this email" });
      }

      if (Array.isArray(invoiceData.lines)) {
        for (const line of invoiceData.lines) {
          if (line.lineTotal == null && line.quantity && line.unitPrice) {
            line.lineTotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
          }
        }
      }

      if (invoiceData.invoiceTotal == null || invoiceData.invoiceTotal === 0) {
        const lineSum = (invoiceData.lines || []).reduce((sum: number, l: any) => {
          const lt = typeof l.lineTotal === 'number' ? l.lineTotal : parseFloat(l.lineTotal) || 0;
          return sum + lt;
        }, 0);
        if (lineSum > 0) {
          invoiceData.invoiceTotal = Math.round(lineSum * 100) / 100;
          invoiceData.notes = (invoiceData.notes || '') + (invoiceData.notes ? ' | ' : '') + 'Total calculated from line items';
        }
      }

      invoiceData.emailId = messageId;
      invoiceData.emailSubject = email.subject;
      invoiceData.emailFrom = email.from;
      invoiceData.emailDate = email.date;
      invoiceData.attachmentCount = email.attachments.length;

      res.json({ success: true, invoiceData });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/gmail/import-invoice", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { invoiceData } = req.body;
      if (!invoiceData) return res.status(400).json({ success: false, message: "invoiceData required" });

      const vendorName = String(invoiceData.vendorName || "Unknown").slice(0, 200);
      const invoiceDate = String(invoiceData.invoiceDate || new Date().toISOString().split("T")[0]).slice(0, 10);
      const invoiceNumber = invoiceData.invoiceNumber ? String(invoiceData.invoiceNumber).slice(0, 100) : null;
      const invoiceTotal = typeof invoiceData.invoiceTotal === "number" ? invoiceData.invoiceTotal : (parseFloat(invoiceData.invoiceTotal) || null);
      const emailId = invoiceData.emailId ? String(invoiceData.emailId) : null;

      if (invoiceNumber) {
        const existingInvoice = await db.select({ id: invoices.id }).from(invoices)
          .where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
        if (existingInvoice.length > 0) {
          return res.json({ success: false, message: `Invoice #${invoiceNumber} already exists`, duplicate: true });
        }
      }

      if (emailId) {
        const existingByEmail = await db.select({ id: invoices.id }).from(invoices)
          .where(sql`${invoices.notes} LIKE ${'%' + emailId + '%'}`).limit(1);
        if (existingByEmail.length > 0) {
          return res.json({ success: false, message: `This email has already been imported`, duplicate: true });
        }
      }

      const allItems = await db.select().from(inventoryItems);
      const { findBestMatch } = await import("./item-matcher");

      const lines = Array.isArray(invoiceData.lines) ? invoiceData.lines : [];

      const result = await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(invoices).values({
          vendorName,
          invoiceDate,
          invoiceNumber,
          invoiceTotal,
          notes: `Gmail import · ${invoiceData.emailSubject || ""} · emailId:${emailId || "none"} · ${new Date().toLocaleDateString()}`,
        }).returning();

        let matchedLines = 0;
        let unmatchedLines = 0;
        const matchDetails: { desc: string; matchedTo: string | null; confidence: number; method: string }[] = [];

        for (const line of lines) {
          const desc = String(line.itemDescription || "Unknown item").slice(0, 500);
          const qty = typeof line.quantity === "number" ? line.quantity : (parseFloat(line.quantity) || 0);
          const uPrice = typeof line.unitPrice === "number" ? line.unitPrice : (parseFloat(line.unitPrice) || null);
          const lTotal = typeof line.lineTotal === "number" ? line.lineTotal : (parseFloat(line.lineTotal) || (qty && uPrice ? qty * uPrice : null));

          const matchResult = findBestMatch(desc, allItems);
          const inventoryItemId = matchResult?.item.id || null;

          matchDetails.push({
            desc,
            matchedTo: matchResult ? matchResult.item.name : null,
            confidence: matchResult?.confidence || 0,
            method: matchResult?.method || "none",
          });

          if (matchResult && matchResult.confidence < 0.7 && matchResult.item.aliases) {
            const descNorm = desc.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
            const alreadyAlias = matchResult.item.aliases.some(a => a.toLowerCase() === descNorm);
            if (!alreadyAlias) {
              const newAliases = [...matchResult.item.aliases, desc.slice(0, 200)];
              await tx.update(inventoryItems)
                .set({ aliases: newAliases })
                .where(eq(inventoryItems.id, matchResult.item.id));
            }
          }

          await tx.insert(invoiceLines).values({
            invoiceId: inserted.id,
            itemDescription: desc,
            quantity: qty,
            unit: line.unit ? String(line.unit).slice(0, 50) : null,
            unitPrice: uPrice,
            lineTotal: lTotal,
            inventoryItemId,
          });

          if (inventoryItemId && uPrice && uPrice > 0) {
            await tx.update(inventoryItems)
              .set({ costPerUnit: uPrice, lastUpdatedCost: new Date() })
              .where(eq(inventoryItems.id, inventoryItemId));
            matchedLines++;
          } else {
            unmatchedLines++;
          }
        }

        return { invoiceId: inserted.id, matchedLines, unmatchedLines, matchDetails };
      });

      res.json({
        success: true,
        ...result,
        message: `Invoice from ${vendorName} imported: ${result.matchedLines} matched, ${result.unmatchedLines} unmatched`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/gmail/labels", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { getLabels } = await import("./gmail");
      const labels = await getLabels();
      res.json({ success: true, labels });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message, labels: [] });
    }
  });

  // === EMAIL INTELLIGENCE ENGINE ===
  app.post("/api/email-intelligence/process", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { messageId } = req.body;
      if (!messageId) return res.status(400).json({ message: "messageId required" });
      const { processEmailIntelligence } = await import("./email-intelligence-engine");
      const result = await processEmailIntelligence(messageId, req.appUser?.username || "system");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/email-intelligence/scan", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const daysBack = req.body.daysBack || 3;
      const { scanAndProcessVendorEmails } = await import("./email-intelligence-engine");
      const result = await scanAndProcessVendorEmails(daysBack, req.appUser?.username || "system");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/email-intelligence/summary", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { getExtractionSummary } = await import("./email-intelligence-engine");
      const summary = await getExtractionSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/email-intelligence/extractions", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const all = await db.select().from(emailExtractions).orderBy(sql`${emailExtractions.createdAt} DESC`).limit(50);
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/email-intelligence/vendor-profiles", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const profiles = await db.select().from(vendorProfiles).orderBy(sql`${vendorProfiles.totalProcessed} DESC`);
      res.json(profiles);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/email-intelligence/vendor-profiles/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      const [updated] = await db.update(vendorProfiles)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(vendorProfiles.id, id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Vendor profile not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/email-intelligence/review-queue", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const items = await db.select().from(emailExtractions)
        .where(eq(emailExtractions.requiresReview, true))
        .orderBy(sql`${emailExtractions.createdAt} DESC`);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/email-intelligence/approve/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const extraction = await db.select().from(emailExtractions).where(eq(emailExtractions.id, id)).limit(1);
      if (extraction.length === 0) return res.status(404).json({ message: "Extraction not found" });
      const ext = extraction[0];

      let actionResult = "Approved — no auto-action taken.";

      if (ext.extractedAmount && ext.extractedAmount >= 2500 && ext.anchoredTransactionId) {
        try {
          const { assetAssessor } = await import("./asset-engine");
          await assetAssessor.capitalizeSingleAsset(ext.anchoredTransactionId, req.appUser?.username || "System");
          actionResult = `CapEx: Capitalized txn #${ext.anchoredTransactionId} as fixed asset.`;
        } catch (capErr: any) {
          actionResult = `CapEx attempted but failed: ${capErr.message}`;
        }
      }

      if (ext.suggestedCategory && ext.actionTaken?.includes("prepaid amortization") && ext.extractedAmount) {
        try {
          const { createPrepaidAmortization } = await import("./prepaid-engine");
          const vendorProfile = ext.vendorName ? await db.select().from(vendorProfiles)
            .where(eq(vendorProfiles.vendorName, ext.vendorName)).limit(1) : [];
          const months = vendorProfile.length > 0 && vendorProfile[0].prepaidMonths ? vendorProfile[0].prepaidMonths : 12;

          await createPrepaidAmortization({
            description: `${ext.vendorName || "Vendor"} — ${ext.subject || "Prepaid Expense"}`,
            totalAmount: ext.extractedAmount,
            totalMonths: months,
            expenseAccountCode: ext.suggestedCoaCode || "6100",
            startDate: ext.extractedDate || new Date().toISOString().split("T")[0],
            createdBy: req.appUser?.username || "System",
          });
          actionResult = `Prepaid: Created ${months}-month amortization for $${ext.extractedAmount.toFixed(2)}.`;
        } catch (prepErr: any) {
          actionResult = `Prepaid attempted but failed: ${prepErr.message}`;
        }
      }

      await db.update(emailExtractions).set({
        requiresReview: false,
        actionTaken: actionResult,
        status: "approved",
      }).where(eq(emailExtractions.id, id));

      res.json({ success: true, action: actionResult });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PRICE HEAT MAP ===
  app.get("/api/price-heatmap", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const items = await db.select().from(inventoryItems).where(isNotNull(inventoryItems.costPerUnit));
      const pricing = await db.select().from(regionalPricing);
      const pricingMap = new Map<number, typeof pricing[0]>();
      for (const p of pricing) pricingMap.set(p.inventoryItemId, p);

      const heatmapData = items.map(item => {
        const regional = pricingMap.get(item.id);
        let variance: number | null = null;
        if (regional?.regionalAvgPrice && item.costPerUnit) {
          variance = Math.round(((item.costPerUnit - regional.regionalAvgPrice) / regional.regionalAvgPrice) * 10000) / 100;
        }
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          unit: item.unit,
          costPerUnit: item.costPerUnit,
          lastUpdatedCost: item.lastUpdatedCost,
          regional: regional ? {
            id: regional.id,
            matchedProduct: regional.matchedProduct,
            regionalAvgPrice: regional.regionalAvgPrice,
            priceSource: regional.priceSource,
            lastUpdated: regional.lastUpdated,
            manualOverride: regional.manualOverride,
          } : null,
          variance,
        };
      });

      res.json(heatmapData);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/price-heatmap/fetch-regional", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { itemIds } = req.body;
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ message: "itemIds required" });
      }

      const batchSize = 15;
      const targetIds = itemIds.slice(0, batchSize);
      const items = await db.select().from(inventoryItems).where(inArray(inventoryItems.id, targetIds));

      if (items.length === 0) return res.json({ fetched: 0 });

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const itemList = items.map(i => `- ID ${i.id}: "${i.name}" (unit: ${i.unit}, our cost: $${i.costPerUnit?.toFixed(2) || 'unknown'})`).join('\n');

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 4096,
        messages: [
          {
            role: "system",
            content: `You are a food service pricing analyst for the Springfield, MA region. For each item below, provide:
1. The most accurate matching wholesale/distributor product name
2. The estimated regional average wholesale price per unit
3. Your source reasoning (USDA market data, distributor catalogs, industry averages, etc.)

Consider: this is a bakery (Bear's Cup Bakehouse). Items come from distributors like Sysco, Chefs' Warehouse, PFG, BakeMark.
Factor in: New England region pricing, wholesale/case pricing vs retail, current market conditions.

Return JSON array:
[{ "id": number, "matchedProduct": "string - the standard wholesale product name", "regionalAvgPrice": number, "priceSource": "string - brief source description" }]`
          },
          { role: "user", content: `Estimate regional wholesale prices for these items in Springfield, MA:\n${itemList}` }
        ],
        response_format: { type: "json_object" },
      }), "regional-pricing");

      const content = response.choices[0]?.message?.content;
      if (!content) return res.json({ fetched: 0 });

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
        else return res.json({ fetched: 0 });
      }

      const results = Array.isArray(parsed) ? parsed : parsed.items || parsed.results || [];
      let fetched = 0;

      for (const r of results) {
        if (!r.id || r.regionalAvgPrice == null) continue;

        const existing = await db.select({ id: regionalPricing.id, manualOverride: regionalPricing.manualOverride })
          .from(regionalPricing).where(eq(regionalPricing.inventoryItemId, r.id)).limit(1);

        if (existing.length > 0 && existing[0].manualOverride) continue;

        if (existing.length > 0) {
          await db.update(regionalPricing)
            .set({
              matchedProduct: r.matchedProduct || r.name,
              regionalAvgPrice: r.regionalAvgPrice,
              priceSource: r.priceSource || "AI estimate",
              lastUpdated: new Date(),
            })
            .where(eq(regionalPricing.id, existing[0].id));
        } else {
          await db.insert(regionalPricing).values({
            inventoryItemId: r.id,
            matchedProduct: r.matchedProduct || r.name,
            regionalAvgPrice: r.regionalAvgPrice,
            priceSource: r.priceSource || "AI estimate",
          });
        }
        fetched++;
      }

      res.json({ fetched, total: results.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/price-heatmap/regional/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { matchedProduct, regionalAvgPrice } = req.body;

      const updates: any = { manualOverride: true, lastUpdated: new Date() };
      if (matchedProduct) updates.matchedProduct = matchedProduct;
      if (regionalAvgPrice != null) updates.regionalAvgPrice = parseFloat(regionalAvgPrice);

      const [updated] = await db.update(regionalPricing).set(updates).where(eq(regionalPricing.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/price-heatmap/refresh-single", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { inventoryItemId, matchedProduct } = req.body;
      if (!inventoryItemId || !matchedProduct) return res.status(400).json({ message: "inventoryItemId and matchedProduct required" });

      const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
      if (!item) return res.status(404).json({ message: "Item not found" });

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await withRetry(() => openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are a food service pricing analyst. Return the current regional wholesale price for the given product in Springfield, MA. Return JSON: { "regionalAvgPrice": number, "priceSource": "string" }`
          },
          { role: "user", content: `What is the wholesale price for "${matchedProduct}" (unit: ${item.unit}) in the Springfield, MA area?` }
        ],
        response_format: { type: "json_object" },
      }), "regional-pricing-single");

      const content = response.choices[0]?.message?.content;
      if (!content) return res.json({ success: false });

      const data = JSON.parse(content);

      const existing = await db.select({ id: regionalPricing.id }).from(regionalPricing)
        .where(eq(regionalPricing.inventoryItemId, inventoryItemId)).limit(1);

      if (existing.length > 0) {
        await db.update(regionalPricing).set({
          matchedProduct,
          regionalAvgPrice: data.regionalAvgPrice,
          priceSource: data.priceSource || "AI estimate (corrected)",
          manualOverride: true,
          lastUpdated: new Date(),
        }).where(eq(regionalPricing.id, existing[0].id));
      } else {
        await db.insert(regionalPricing).values({
          inventoryItemId,
          matchedProduct,
          regionalAvgPrice: data.regionalAvgPrice,
          priceSource: data.priceSource || "AI estimate (corrected)",
          manualOverride: true,
        });
      }

      res.json({ success: true, regionalAvgPrice: data.regionalAvgPrice, priceSource: data.priceSource });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pfg/push-order", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { pushPfgOrder } = await import("./pfg-sftp");
      const { customerNumber, poNumber, deliveryDate, specialInstructions, lines } = req.body;
      if (!poNumber || !lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ success: false, message: "poNumber and at least one line are required" });
      }
      const result = await pushPfgOrder({ customerNumber, poNumber, deliveryDate, specialInstructions, lines });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // === TAX PROFILES ===
  app.get("/api/firm/tax-profiles", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const profiles = await db.select().from(taxProfiles).orderBy(desc(taxProfiles.taxYear));
      res.json(profiles);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/firm/tax-profiles/active", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { getActiveTaxProfile } = await import("./tax-profile-engine");
      const profile = await getActiveTaxProfile();
      res.json(profile || {});
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/tax-profiles/seed-2024", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const { seedTaxProfile2024 } = await import("./tax-profile-engine");
      const result = await seedTaxProfile2024();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/firm/tax-profiles/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      await db.update(taxProfiles).set({ ...updates, updatedAt: new Date() }).where(eq(taxProfiles.id, id));
      const [updated] = await db.select().from(taxProfiles).where(eq(taxProfiles.id, id));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === INVENTORY TRANSFERS (MLL) ===
  app.get("/api/firm/transfers", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const transfers = await db.select().from(inventoryTransfers).orderBy(desc(inventoryTransfers.createdAt));
      res.json(transfers);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/transfers", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { executeInventoryTransfer } = await import("./tax-profile-engine");
      const user = (req as any).user;
      const data = {
        ...req.body,
        performedBy: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "System",
      };
      const result = await executeInventoryTransfer(data);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === FICA TIP CREDIT ===
  app.get("/api/firm/fica-tip-credit", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { calculateFicaTipCredit } = await import("./tax-profile-engine");
      const startDate = (req.query.startDate as string) || "2025-01-01";
      const endDate = (req.query.endDate as string) || new Date().toISOString().split("T")[0];
      const result = await calculateFicaTipCredit(startDate, endDate);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === VIBE THRESHOLDS ===
  app.get("/api/firm/vibe-alerts", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const alerts = await db.select().from(vibeAlerts)
        .where(eq(vibeAlerts.dismissed, false))
        .orderBy(desc(vibeAlerts.createdAt));
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/vibe-alerts/run", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { runVibeThresholdCheck } = await import("./tax-profile-engine");
      const startDate = req.body.startDate || "2025-01-01";
      const endDate = req.body.endDate || new Date().toISOString().split("T")[0];
      const result = await runVibeThresholdCheck(startDate, endDate);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/firm/vibe-alerts/:id/dismiss", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = (req as any).user;
      await db.update(vibeAlerts).set({
        dismissed: true,
        dismissedBy: user?.firstName || "Unknown",
        dismissedAt: new Date(),
      }).where(eq(vibeAlerts.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === TIME ENTRY CLEANUP (corrupted dates) ===
  app.get("/api/admin/time-entries/corrupted", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const allEntries = await db.select({
        id: timeEntries.id,
        userId: timeEntries.userId,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        status: timeEntries.status,
      }).from(timeEntries);

      const VALID_MIN = new Date("2020-01-01").getTime();
      const VALID_MAX = new Date("2030-12-31").getTime();

      const corrupted = allEntries.filter((te) => {
        const ciMs = new Date(te.clockIn).getTime();
        if (isNaN(ciMs) || ciMs < VALID_MIN || ciMs > VALID_MAX) return true;
        if (te.clockOut) {
          const coMs = new Date(te.clockOut).getTime();
          if (isNaN(coMs) || coMs < VALID_MIN || coMs > VALID_MAX) return true;
          if (coMs - ciMs > 24 * 60 * 60 * 1000) return true;
        }
        return false;
      });

      res.json({ total: allEntries.length, corrupted: corrupted.length, entries: corrupted });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/time-entries/corrupted", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const allEntries = await db.select({
        id: timeEntries.id,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
      }).from(timeEntries);

      const VALID_MIN = new Date("2020-01-01").getTime();
      const VALID_MAX = new Date("2030-12-31").getTime();

      const corruptedIds = allEntries.filter((te) => {
        const ciMs = new Date(te.clockIn).getTime();
        if (isNaN(ciMs) || ciMs < VALID_MIN || ciMs > VALID_MAX) return true;
        if (te.clockOut) {
          const coMs = new Date(te.clockOut).getTime();
          if (isNaN(coMs) || coMs < VALID_MIN || coMs > VALID_MAX) return true;
          if (coMs - ciMs > 24 * 60 * 60 * 1000) return true;
        }
        return false;
      }).map(te => te.id);

      if (corruptedIds.length > 0) {
        await db.delete(timeEntries).where(inArray(timeEntries.id, corruptedIds));
      }

      res.json({ deleted: corruptedIds.length, ids: corruptedIds });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === EXPANSION LABOR CHECK ===
  app.get("/api/firm/expansion-check/:locationId/:date", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { isExpansionLabor } = await import("./tax-profile-engine");
      const locationId = parseInt(req.params.locationId);
      const date = req.params.date;
      const isExpansion = await isExpansionLabor(locationId, date);
      res.json({ isExpansion, locationId, date });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === JARVIS HIVE (Team Spelling Bee) ===
  app.get("/api/hive/today", isAuthenticated, async (_req: any, res) => {
    try {
      const { getOrCreateTodayPuzzle, getLeaderboard, getRankTitle } = await import("./hive-engine");
      const { puzzle } = await getOrCreateTodayPuzzle();

      const leaderboard = await getLeaderboard(puzzle.id);
      const teamScore = leaderboard.reduce((s, e) => s + e.totalPoints, 0);
      const teamWordsFound = leaderboard.reduce((s, e) => s + e.wordCount, 0);

      res.json({
        puzzleId: puzzle.id,
        date: puzzle.date,
        centerLetter: puzzle.centerLetter,
        outerLetters: puzzle.outerLetters,
        totalWords: puzzle.validWords.length,
        maxScore: puzzle.maxScore,
        teamScore,
        teamWordsFound,
        teamRank: getRankTitle(teamScore, puzzle.maxScore),
        leaderboard,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hive/:puzzleId/my-words", isAuthenticated, async (req: any, res) => {
    try {
      const puzzleId = parseInt(req.params.puzzleId);
      if (!Number.isFinite(puzzleId)) return res.status(400).json({ message: "Invalid puzzleId" });
      const userId = req.appUser.id;
      const words = await db.select().from(hiveFoundWords).where(
        and(eq(hiveFoundWords.puzzleId, puzzleId), eq(hiveFoundWords.userId, userId))
      ).orderBy(desc(hiveFoundWords.foundAt));
      res.json(words);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hive/:puzzleId/all-words", isAuthenticated, async (req: any, res) => {
    try {
      const puzzleId = parseInt(req.params.puzzleId);
      if (!Number.isFinite(puzzleId)) return res.status(400).json({ message: "Invalid puzzleId" });
      const words = await db.select().from(hiveFoundWords).where(
        eq(hiveFoundWords.puzzleId, puzzleId)
      ).orderBy(desc(hiveFoundWords.foundAt));
      res.json(words);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hive/submit", isAuthenticated, async (req: any, res) => {
    try {
      const { puzzleId, word } = req.body;
      if (!puzzleId || !word) return res.status(400).json({ message: "puzzleId and word required" });
      const userId = req.appUser.id;
      const userName = `${req.appUser.firstName || ""} ${req.appUser.lastName || ""}`.trim() || req.appUser.username;
      const { submitWord } = await import("./hive-engine");
      const result = await submitWord(puzzleId, userId, userName, word);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
