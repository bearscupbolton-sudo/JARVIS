import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, isUnlocked, isOwner, isManager, authStorage } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";

async function getUserFromReq(req: any) {
  const userId = req.user?.claims?.sub;
  if (!userId) return null;
  return await authStorage.getUser(userId);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerChatRoutes(app);

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
      const input = api.recipes.create.input.parse(req.body);
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
      const input = api.recipes.update.input.parse(req.body);
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      if (user.role === "owner") {
        const recipe = await storage.updateRecipe(Number(req.params.id), input);
        return res.json(recipe);
      }

      const pending = await storage.createPendingChange({
        entityType: "recipe",
        action: "update",
        entityId: Number(req.params.id),
        payload: input,
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
      res.status(404).json({ message: 'Recipe not found' });
    }
  });

  app.delete(api.recipes.delete.path, isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteRecipe(Number(req.params.id));
    res.status(204).send();
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

      const pending = await storage.createPendingChange({
        entityType: "sop",
        action: "update",
        entityId: Number(req.params.id),
        payload: input,
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

  // === PROBLEMS ===
  app.get(api.problems.list.path, async (req, res) => {
    const includeCompleted = req.query.includeCompleted === "true";
    const problems = await storage.getProblems(includeCompleted);
    res.json(problems);
  });

  app.post(api.problems.create.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.problems.create.input.parse(req.body);
      const problem = await storage.createProblem(input);
      res.status(201).json(problem);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.patch(api.problems.update.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.problems.update.input.parse(req.body);
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

  // === EVENTS ===
  app.get(api.events.list.path, async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 5;
    const events = await storage.getUpcomingEvents(days);
    res.json(events);
  });

  app.post(api.events.create.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.date === "string") body.date = new Date(body.date);
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

  app.put(api.events.update.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
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

  app.delete(api.events.delete.path, isAuthenticated, isOwner, async (req, res) => {
    await storage.deleteEvent(Number(req.params.id));
    res.status(204).send();
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

  app.post("/api/pending-changes/:id/approve", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const changeId = Number(req.params.id);
      const change = await storage.getPendingChange(changeId);
      if (!change) return res.status(404).json({ message: "Pending change not found" });
      if (change.status !== "pending") return res.status(400).json({ message: "Already reviewed" });

      const userId = req.user.claims.sub;
      const payload = change.payload as any;

      if (change.entityType === "recipe") {
        if (change.action === "create") {
          await storage.createRecipe(payload);
        } else if (change.action === "update" && change.entityId) {
          await storage.updateRecipe(change.entityId, payload);
        }
      } else if (change.entityType === "sop") {
        if (change.action === "create") {
          await storage.createSOP(payload);
        } else if (change.action === "update" && change.entityId) {
          await storage.updateSOP(change.entityId, payload);
        }
      }

      const updated = await storage.updatePendingChangeStatus(changeId, "approved", userId, req.body.reviewNote);
      res.json(updated);
    } catch (error) {
      console.error("Error approving change:", error);
      res.status(500).json({ message: "Failed to approve change" });
    }
  });

  app.post("/api/pending-changes/:id/reject", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const changeId = Number(req.params.id);
      const change = await storage.getPendingChange(changeId);
      if (!change) return res.status(404).json({ message: "Pending change not found" });
      if (change.status !== "pending") return res.status(400).json({ message: "Already reviewed" });

      const userId = req.user.claims.sub;
      const updated = await storage.updatePendingChangeStatus(changeId, "rejected", userId, req.body.reviewNote);
      res.json(updated);
    } catch (error) {
      console.error("Error rejecting change:", error);
      res.status(500).json({ message: "Failed to reject change" });
    }
  });

  // === PASTRY TOTALS ===
  app.get(api.pastryTotals.list.path, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const totals = await storage.getPastryTotals(date);
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

  app.post(api.bakeoffLogs.create.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const input = api.bakeoffLogs.create.input.parse(req.body);
      const log = await storage.createBakeoffLog(input);
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
    const items = await storage.getInventoryItems();
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
  app.get(api.invoices.list.path, isAuthenticated, async (req, res) => {
    const invoiceList = await storage.getInvoices();
    res.json(invoiceList);
  });

  app.get(api.invoices.get.path, isAuthenticated, async (req, res) => {
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

  app.post(api.invoices.scan.path, isAuthenticated, isUnlocked, async (req, res) => {
    try {
      const { image } = api.invoices.scan.input.parse(req.body);
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 4096,
        messages: [
          {
            role: "system",
            content: `You are an expert invoice parser for a bakery. Extract ALL data from the invoice image.
Return a JSON object with this exact structure:
{
  "vendorName": "string - the vendor/supplier name",
  "invoiceDate": "string - date in YYYY-MM-DD format",
  "invoiceNumber": "string or null - the invoice number if visible",
  "invoiceTotal": number or null - the grand total amount,
  "notes": "string or null - any special notes on the invoice",
  "lines": [
    {
      "itemDescription": "string - item name/description exactly as shown",
      "quantity": number - the quantity ordered,
      "unit": "string or null - unit of measure (case, lb, ea, bag, etc.)",
      "unitPrice": number or null - price per unit,
      "lineTotal": number or null - total for this line
    }
  ]
}
Be thorough - capture EVERY line item. For prices, use numbers without currency symbols. If a field isn't visible, use null. Parse the date into YYYY-MM-DD format. Return ONLY the JSON, no other text.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Parse this invoice image and extract all the data into the specified JSON format."
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
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(400).json({ message: "Could not parse invoice image" });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(400).json({ message: "Could not extract structured data from the invoice. Please try a clearer photo." });
        }
      }
      res.json(parsed);
    } catch (err: any) {
      console.error("Invoice scan error:", err);
      res.status(500).json({ message: err.message || "Failed to scan invoice" });
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

  // === SCHEDULE MESSAGES ===
  app.get(api.scheduleMessages.list.path, isAuthenticated, async (req, res) => {
    const messages = await storage.getScheduleMessages();
    res.json(messages);
  });

  app.post(api.scheduleMessages.create.path, isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const input = api.scheduleMessages.create.input.parse(req.body);
      const userId = req.user?.claims?.sub;
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
    const result = await storage.getShifts(start, end);
    res.json(result);
  });

  app.post(api.shifts.create.path, isAuthenticated, isManager, async (req: any, res) => {
    try {
      const input = api.shifts.create.input.parse(req.body);
      const existingShifts = await storage.getShifts(input.shiftDate, input.shiftDate);
      const deptCount = existingShifts.filter(s => s.department === (input.department || "kitchen")).length;
      if (deptCount >= 10) {
        return res.status(400).json({ message: `Maximum 10 staff per department per day reached for ${input.department || "kitchen"}` });
      }
      const shift = await storage.createShift(input);
      res.status(201).json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.shifts.update.path, isAuthenticated, isManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.shifts.update.input.parse(req.body);
      const shift = await storage.updateShift(id, input);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      res.json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.delete(api.shifts.delete.path, isAuthenticated, isManager, async (req, res) => {
    await storage.deleteShift(Number(req.params.id));
    res.status(204).send();
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
      const userId = req.user?.claims?.sub;
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
      const userId = req.user?.claims?.sub;
      const updated = await storage.updateTimeOffRequestStatus(id, status, userId, reviewNote);
      if (!updated) return res.status(404).json({ message: "Request not found" });
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

  return httpServer;
}
