import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, isUnlocked, isOwner, isManager, authStorage } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { openai, speechToText, ensureCompatibleFormat } from "./replit_integrations/audio/client";

async function getUserFromReq(req: any) {
  return req.appUser || null;
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
        const recipe = await storage.updateRecipe(Number(req.params.id), input, user.id, "Direct edit by owner");
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

      const response = await openai.chat.completions.create({
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
      });

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
  app.get("/api/events/month", async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    const events = await storage.getEventsByMonth(year, month);
    res.json(events);
  });

  app.get("/api/events/:id", async (req, res) => {
    const event = await storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  });

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

  app.delete(api.events.delete.path, isAuthenticated, isUnlocked, async (req, res) => {
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

      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const userId = user.id;
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
  app.get("/api/pre-shift-notes", isAuthenticated, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const notes = await storage.getPreShiftNotes(date);
    res.json(notes);
  });

  app.post("/api/pre-shift-notes", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { content, date, locationId } = req.body;
      if (!content || !date) return res.status(400).json({ message: "Content and date are required" });
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const userId = user.id;
      const note = await storage.createPreShiftNote({ content, date, authorId: userId, locationId: locationId || null });
      res.status(201).json(note);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
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

      const enrichedShifts = todayShifts.map(shift => {
        const shiftUser = userMap.get(shift.userId);
        const displayName = shiftUser?.username || shiftUser?.firstName || shiftUser?.email || shift.userId;

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
      const base64Size = image.length * 0.75;
      if (base64Size > 15 * 1024 * 1024) {
        return res.status(400).json({ message: "Image too large" });
      }

      const fs = await import("fs");
      const path = await import("path");
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ message: "Invalid image format" });

      const allowedTypes = ["jpeg", "jpg", "png", "webp", "gif"];
      if (!allowedTypes.includes(matches[1].toLowerCase())) {
        return res.status(400).json({ message: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." });
      }

      const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
      const buffer = Buffer.from(matches[2], "base64");
      const filename = `pastry_${req.params.id}_${Date.now()}.${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer);

      const url = `/uploads/${filename}`;
      res.json({ url });
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
        const { buffer: audioBuffer, format: inputFormat } = await ensureCompatibleFormat(rawBuffer);
        transcript = await speechToText(audioBuffer, inputFormat);
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

      const parseResponse = await openai.chat.completions.create({
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
      });

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
      const timers = await storage.getActiveTimers();
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
    res.json(lists);
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

  app.post("/api/messages", isAuthenticated, isManager, async (req: any, res) => {
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

  // === PERSONALIZED HOME ===
  app.get("/api/home", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const today = new Date().toISOString().split("T")[0];
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      const [
        unreadCount,
        myShifts,
        timeOffReqs,
        bakeoffToday,
        recentAnnouncements,
      ] = await Promise.all([
        storage.getUnreadCount(user.id),
        storage.getShifts(today, weekEndStr),
        storage.getTimeOffRequests(user.id),
        storage.getBakeoffLogs(today),
        storage.getAnnouncements(),
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
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
