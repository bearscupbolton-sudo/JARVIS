import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, isUnlocked, isOwner, isManager, authStorage } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { openai, speechToText, ensureCompatibleFormat } from "./replit_integrations/audio/client";
import { sendPushToUsers, sendPushToUser } from "./push";
import { sendSms } from "./sms";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq, and, gte, lte, lt, desc, isNotNull, inArray } from "drizzle-orm";
import { squareCatalogMap, squareSales, shifts, directMessages, timeEntries, breakEntries, laminationDoughs, recipeSessions, bakeoffLogs, pastryItems } from "@shared/schema";
import { withRetry } from "./ai-retry";
import { calculatePastryCost, calculateAllPastryCosts } from "./cost-engine";
import {
  testSquareConnection, fetchSquareCatalog, syncSquareSales,
  getSquareSalesForDate, generateForecast, autoPopulatePastryGoals,
  getLiveInventoryDashboard, fetchSquareTips,
} from "./square";

async function getUserFromReq(req: any) {
  return req.appUser || null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
      const feedback = await storage.createCustomerFeedback({
        rating,
        comment: trimmed(comment, 2000),
        name: trimmed(name, 100),
        email: trimmed(email, 200),
        visitDate: trimmed(visitDate, 10),
        locationId: typeof locationId === "number" ? locationId : null,
      });
      res.status(201).json(feedback);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/feedback", isAuthenticated, isManager, async (_req, res) => {
    const feedback = await storage.getCustomerFeedback();
    res.json(feedback);
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
      const { squareItemId, squareItemName, squareVariationId, squareVariationName, pastryItemName } = req.body;
      const [mapping] = await db.insert(squareCatalogMap).values({
        squareItemId,
        squareItemName,
        squareVariationId: squareVariationId || null,
        squareVariationName: squareVariationName || null,
        pastryItemName: pastryItemName || null,
        isActive: true,
      }).returning();
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
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/square/catalog-map/:id", isAuthenticated, isOwner, async (req, res) => {
    await db.delete(squareCatalogMap).where(eq(squareCatalogMap.id, Number(req.params.id)));
    res.status(204).send();
  });

  app.post("/api/square/sync", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const date = (req.body?.date as string) || new Date().toISOString().split("T")[0];
      const locationId = req.body?.locationId ? parseInt(req.body.locationId, 10) : undefined;
      const result = await syncSquareSales(date, locationId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/square/sales", isAuthenticated, isOwner, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined;
    const sales = await getSquareSalesForDate(date, locationId);
    res.json(sales);
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
      const { itemName, date, soldOutAt, notes, locationId } = req.body;
      if (!itemName || !date || !soldOutAt) {
        return res.status(400).json({ message: "itemName, date, and soldOutAt are required" });
      }
      const log = await storage.createSoldoutLog({
        itemName,
        date,
        soldOutAt,
        reportedBy: req.appUser?.firstName || req.appUser?.username || "Unknown",
        notes: notes || null,
        locationId: locationId || null,
      });
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

      const fohUserIds = Array.from(new Set(allShifts.map(s => s.userId)));
      let fohStaff: any[] = [];
      if (fohUserIds.length > 0) {
        fohStaff = await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(inArray(users.id, fohUserIds));
      }
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

      const weeklyStaff = new Map<string, { name: string; username: string; totalMinutes: number; tipsCents: number; tipCount: number }>();

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
            weeklyStaff.set(te.userId, { name: staffName, username, totalMinutes: 0, tipsCents: 0, tipCount: 0 });
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
              weeklyStaff.set(uid, { name: staffName, username: staff?.username || "Unknown", totalMinutes: 0, tipsCents: 0, tipCount: 0 });
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
      const fohUserIds = Array.from(new Set(fohShifts.map(s => s.userId)));

      let fohStaff: any[] = [];
      if (fohUserIds.length > 0) {
        fohStaff = await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(inArray(users.id, fohUserIds));
      }
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

      const staffTotals = new Map<string, { name: string; username: string; totalMinutes: number; tipsCents: number; tipCount: number }>();
      for (const te of dayTimeEntries) {
        const staff = staffMap.get(te.userId);
        const staffName = staff ? `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.username : "Unknown";
        const username = staff?.username || "Unknown";

        if (!staffTotals.has(te.userId)) {
          staffTotals.set(te.userId, { name: staffName, username, totalMinutes: 0, tipsCents: 0, tipCount: 0 });
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
            staffTotals.set(uid, { name: staffName, username: staff?.username || "Unknown", totalMinutes: 0, tipsCents: 0, tipCount: 0 });
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
        max_completion_tokens: 4096,
        messages: [
          {
            role: "system",
            content: `You are an expert invoice parser for a bakery. Extract ALL data from the invoice image${imageList.length > 1 ? "s" : ""}.${multiImageNote}
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
                text: `Parse this invoice${imageList.length > 1 ? ` (${imageList.length} pages)` : ""} and extract all the data into the specified JSON format.`
              },
              ...imageContent,
            ]
          }
        ],
        response_format: { type: "json_object" },
      }), "invoice-scan");

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(400).json({ message: "Could not parse invoice image" });
      }

      let invoiceData;
      try {
        invoiceData = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          invoiceData = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(400).json({ message: "Could not extract structured data from the invoice. Please try a clearer photo." });
        }
      }
      res.json(invoiceData);
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
      const existingShifts = await storage.getShifts(input.shiftDate, input.shiftDate);
      const deptCount = existingShifts.filter(s => s.department === (input.department || "kitchen")).length;
      if (deptCount >= 10) {
        return res.status(400).json({ message: `Maximum 10 staff per department per day reached for ${input.department || "kitchen"}` });
      }
      const isOpenShift = !input.userId;
      const shiftData = {
        ...input,
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
      const shift = await storage.getShiftById(shiftId);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      if (shift.status !== "open") return res.status(400).json({ message: "This shift is not available for pickup" });
      const updated = await storage.updateShift(shiftId, {
        status: "pending",
        claimedBy: userId,
        claimedAt: new Date(),
      } as any);
      const shiftManagers = await authStorage.getAllUsers();
      const managers = shiftManagers.filter(u => u.isShiftManager || u.role === "owner");
      for (const mgr of managers) {
        sendPushToUser(mgr.id, {
          title: "Shift Pickup Request",
          body: `A team member has requested to pick up a shift on ${shift.shiftDate} (${shift.startTime} - ${shift.endTime})`,
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

  app.patch("/api/shifts/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Only shift managers, general managers, or owners can approve shift pickups" });
      }
      const shiftId = Number(req.params.id);
      const shift = await storage.getShiftById(shiftId);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
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
      if (user.role !== "owner" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Only shift managers, general managers, or owners can deny shift pickups" });
      }
      const shiftId = Number(req.params.id);
      const shift = await storage.getShiftById(shiftId);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      if (shift.status !== "pending" || !shift.claimedBy) {
        return res.status(400).json({ message: "This shift has no pending pickup request" });
      }
      const claimedBy = shift.claimedBy;
      const updated = await storage.updateShift(shiftId, {
        status: "open",
        claimedBy: null,
        claimedAt: null,
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

  app.delete(api.shifts.delete.path, isAuthenticated, isManager, async (req, res) => {
    await storage.deleteShift(Number(req.params.id));
    res.status(204).send();
  });

  app.delete("/api/shifts/clear", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Only shift managers, general managers, or owners can clear schedules" });
      }
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      if (startDate > endDate) {
        return res.status(400).json({ message: "startDate must be before or equal to endDate" });
      }
      const deleted = await storage.deleteShiftsByDateRange(startDate as string, endDate as string);
      storage.logActivity({ userId: user.id, action: "clear_schedule", metadata: { startDate, endDate, deletedCount: deleted } }).catch(() => {});
      res.json({ deleted });
    } catch (error: any) {
      console.error("Error clearing schedule:", error);
      res.status(500).json({ message: "Failed to clear schedule" });
    }
  });

  app.post("/api/shifts/import", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Only shift managers, general managers, or owners can import schedules" });
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
      })).filter(u => u.name || u.username);

      const { openai: aiClient } = await import("./replit_integrations/audio/client");

      const baseInstructions = `You are a schedule parser. Given the following team members and schedule data, extract shift assignments.

Team members (id, name, username):
${teamList.map(t => `- ${t.id}: ${t.name} (${t.username})`).join("\n")}

${weekStartDate ? `The week starts on: ${weekStartDate}` : ""}

Return a JSON array of shift objects. Each shift should have:
- userId: the team member's ID from the list above (match by name or username, case-insensitive)
- shiftDate: in YYYY-MM-DD format
- startTime: in format like "6:00 AM"
- endTime: in format like "2:00 PM"
- department: one of "kitchen", "foh", or "bakery" (infer from context, default to "kitchen")
- position: optional role description
- notes: optional notes

If you can't match a name to a team member, set userId to null and add the original name in notes.
Only return the JSON array, no other text.`;

      let messages: any[];

      if (imageBase64) {
        const mime = imageMimeType || "image/jpeg";
        messages = [{
          role: "user",
          content: [
            { type: "text", text: `${baseInstructions}\n\nRead the schedule from the attached photo. Extract all shift assignments you can see, including names, dates, and times. If dates are shown as days of the week (Mon, Tue, etc.), map them to actual dates based on the week start date provided.` },
            { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
          ],
        }];
      } else {
        messages = [{
          role: "user",
          content: `${baseInstructions}\n\nSchedule data:\n${csvContent}`,
        }];
      }

      const completion = await withRetry(() => aiClient.chat.completions.create({
        model: imageBase64 ? "gpt-4o" : "gpt-4o-mini",
        messages,
        max_tokens: 4096,
        temperature: 0.1,
      }), "schedule-import");

      const responseText = completion.choices[0]?.message?.content || "[]";
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return res.status(400).json({ message: "Could not parse schedule from the uploaded data" });
      }
      const parsedShifts = JSON.parse(jsonMatch[0]);
      res.json({ shifts: parsedShifts, teamMembers: teamList });
    } catch (err) {
      console.error("Error importing schedule:", err);
      res.status(500).json({ message: "Failed to parse schedule data" });
    }
  });

  app.post("/api/shifts/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as any;
      if (user.role !== "owner" && !user.isShiftManager && !user.isGeneralManager) {
        return res.status(403).json({ message: "Only shift managers, general managers, or owners can bulk create shifts" });
      }
      const { shifts: shiftList } = req.body;
      console.log("[Bulk Shifts] Received", shiftList?.length, "shifts. Sample:", JSON.stringify(shiftList?.[0]));
      if (!Array.isArray(shiftList) || shiftList.length === 0) {
        return res.status(400).json({ message: "No shifts provided" });
      }
      const created = [];
      let skipped = 0;
      for (const s of shiftList) {
        if (!s.shiftDate || !s.startTime || !s.endTime) {
          console.log("[Bulk Shifts] Skipping shift — missing required fields:", JSON.stringify(s));
          skipped++;
          continue;
        }
        const shift = await storage.createShift({
          userId: s.userId || null,
          shiftDate: s.shiftDate,
          startTime: s.startTime,
          endTime: s.endTime,
          department: s.department || "kitchen",
          position: s.position || null,
          notes: s.notes || null,
          locationId: s.locationId || null,
          status: s.userId ? "assigned" : "open",
          createdBy: user.id,
        } as any);
        created.push(shift);
        if (s.userId) {
          sendPushToUser(s.userId, {
            title: "New Shift Assigned",
            body: `You've been scheduled on ${s.shiftDate} from ${s.startTime} to ${s.endTime}`,
            tag: `shift-${shift.id}`,
            url: "/schedule",
          }).catch(err => console.error("[Push] Bulk shift notification error:", err));
        }
      }
      console.log("[Bulk Shifts] Created", created.length, "shifts, skipped", skipped);
      res.status(201).json(created);
    } catch (err) {
      console.error("Error bulk creating shifts:", err);
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
      const enrichedShifts = validShifts.map(shift => {
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

      await storage.createBakeoffLog({
        date: today,
        itemName: dough.pastryType || dough.doughType,
        quantity: dough.proofPieces || dough.totalPieces || 1,
        bakedAt: bakedAtTime,
        locationId: null,
      });

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
      res.json(settings || { enabled: false, frequencyMinutes: 30, businessHoursStart: "06:00", businessHoursEnd: "18:00" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/lobby-check/settings", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const { enabled, frequencyMinutes, businessHoursStart, businessHoursEnd, locationId } = req.body;
      const freq = Number(frequencyMinutes);
      if (!freq || freq < 5 || freq > 480) return res.status(400).json({ message: "Frequency must be between 5 and 480 minutes" });
      const settings = await storage.upsertLobbyCheckSettings({
        enabled: !!enabled,
        frequencyMinutes: freq,
        businessHoursStart: businessHoursStart || "06:00",
        businessHoursEnd: businessHoursEnd || "18:00",
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

      for (const te of allTimeEntries) {
        if (!te.clockOut) continue;
        const msWorked = new Date(te.clockOut).getTime() - new Date(te.clockIn).getTime();
        const breakMs = breaksByEntry.get(te.id) || 0;
        const netMs = Math.max(0, msWorked - breakMs);
        const hours = netMs / (1000 * 60 * 60);
        totalLaborHours += hours;

        const user = userMap.get(te.userId);
        const rate = user?.hourlyRate || 0;
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
        const msWorked = new Date(te.clockOut).getTime() - new Date(te.clockIn).getTime();
        const breakMs = breaksByEntry.get(te.id) || 0;
        const netMs = Math.max(0, msWorked - breakMs);
        const hours = netMs / (1000 * 60 * 60);
        prevLaborHours += hours;
        const user = userMap.get(te.userId);
        prevLaborCost += hours * (user?.hourlyRate || 0);
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

      for (const te of entries) {
        if (!te.clockOut) continue;
        const msWorked = new Date(te.clockOut).getTime() - new Date(te.clockIn).getTime();
        const breakMs = breaksByEntry.get(te.id) || 0;
        const netMs = Math.max(0, msWorked - breakMs);
        const hours = netMs / (1000 * 60 * 60);

        const existing = laborByUser.get(te.userId) || { hours: 0, cost: 0, shifts: 0 };
        const user = userMap.get(te.userId);
        const rate = user?.hourlyRate || 0;
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
          hoursWorked: Math.round(data.hours * 100) / 100,
          totalCost: Math.round(data.cost * 100) / 100,
          shifts: data.shifts,
          revenuePerHour: data.hours > 0 ? Math.round((totalRevenue / totalHours) * data.hours / data.hours * 100) / 100 : 0,
        };
      }).sort((a, b) => b.hoursWorked - a.hoursWorked);

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
  app.get("/api/home/jarvis-briefing", isAuthenticated, async (req: any, res) => {
    try {
      const context = await storage.getJarvisBriefingContext(req.appUser.id);

      if (!context.user.showJarvisBriefing && req.query.force !== "true") {
        return res.json({ briefingText: null, showWelcome: false, welcomeMessage: null, disabled: true });
      }

      const now = new Date();
      const cacheAge = context.user.lastBriefingAt ? (now.getTime() - new Date(context.user.lastBriefingAt).getTime()) / 1000 / 60 : Infinity;

      if (cacheAge < 30 && context.user.lastBriefingText && req.query.refresh !== "true") {
        const hasWelcome = !!context.user.jarvisWelcomeMessage;
        return res.json({
          briefingText: context.user.lastBriefingText,
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

      const focusLabels: Record<string, string> = {
        all: "all bakery operations",
        foh: "front-of-house (customer service, display cases, pastry availability, sales)",
        boh: "back-of-house (production, dough work, baking, recipes)",
        management: "management (team, scheduling, production AND sales metrics, time-off requests)",
      };
      const focusDescription = focusLabels[focus] || focusLabels.all;

      const systemPrompt = `You are Jarvis, the AI assistant for Bear's Cup Bakehouse. Generate a brief, warm, personalized briefing (2-4 sentences max) for a team member opening the app. Be natural and conversational — like a helpful colleague giving a quick heads-up. No bullet points, no lists, no "here's your briefing" phrasing.

STRICT RULE — ONLY STATE FACTS FROM THE DATA PROVIDED BELOW. Never invent, assume, or hallucinate information. If the data says 0 doughs proofing, do NOT mention doughs proofing. If no active doughs are listed, do NOT reference any doughs. If no production logs exist, do NOT claim there are any. Only mention items explicitly present in the bakery state data.

SHIFT AWARENESS — Always weave the person's schedule into the greeting naturally:
- If they have a shift today that starts later: greet them and let them know what's going on before their shift.
- If they're currently on shift: acknowledge they're in the thick of it.
- If they have no shift today: keep it light and positive.
- If they haven't been on the schedule for 4+ days (WELCOME BACK flag): warmly welcome them back and catch them up on what's happening.
- If they've worked 13+ consecutive days (WELLNESS ALERT flag): genuinely encourage them to take a day off, rest, hydrate, and stretch. Be caring, not preachy — like a friend who notices they've been grinding too hard.
- If they've worked 7-12 consecutive days: acknowledge their solid work ethic with a brief encouraging note.

This person's briefing focus is "${focus}" — they care about ${focusDescription}. Prioritize information relevant to their focus. Don't mention things outside their focus unless critical.

WHEN NOTHING ELSE IS HAPPENING: If the bakery state shows little or no operational activity beyond the shift info, keep it short, warm, and motivational — offer an encouraging thought or a positive note about the day. Be genuine and uplifting, like a supportive teammate.`;

      const userPrompt = `Team member: ${context.user.firstName} (role: ${context.user.role}, briefing focus: ${focus})
Time: Good ${timeOfDay}
Current bakery state data (ONLY reference items that appear here — do not invent anything):
${stateLines.join("\n")}

Generate a personalized briefing for ${context.user.firstName}. Remember: only state facts from the data above. Weave the shift/schedule info naturally into the greeting.`;

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
        max_tokens: 200,
        temperature: 0.7,
      }), "jarvis-briefing");

      const briefingText = completion.choices[0]?.message?.content || "Welcome back! Everything looks good at the bakehouse.";

      await storage.updateJarvisBriefingCache(req.appUser.id, briefingText);

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
      if (needsReorder.length === 0) {
        return res.json({ message: "All items are above par level", order: null, itemCount: 0 });
      }

      const today = new Date().toISOString().split("T")[0];
      const order = await storage.createPurchaseOrder({
        vendorId,
        orderDate: today,
        status: "draft",
        generatedBy: req.user.id,
      });

      const lines = needsReorder.map(vi => {
        const orderUpTo = vi.orderUpToLevel ?? (vi.parLevel! * 1.5);
        const qty = Math.max(0, orderUpTo - vi.inventoryItem.onHand);
        return {
          purchaseOrderId: order.id,
          inventoryItemId: vi.inventoryItemId,
          itemName: vi.vendorDescription || vi.inventoryItem.name,
          quantity: Math.ceil(qty * 100) / 100,
          unit: vi.preferredUnit || vi.inventoryItem.unit,
          currentOnHand: vi.inventoryItem.onHand,
          parLevel: vi.parLevel,
        };
      }).filter(l => l.quantity > 0);

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

  app.post("/api/notes/transcribe", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const { audio } = req.body;
      if (!audio || typeof audio !== "string") return res.status(400).json({ message: "Audio data required" });
      if (audio.length > 10 * 1024 * 1024) return res.status(400).json({ message: "Audio too large. Maximum 10MB." });
      const audioBuffer = Buffer.from(audio, "base64");
      const { buffer, format } = await ensureCompatibleFormat(audioBuffer);
      const transcript = await speechToText(buffer, format);
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

  return httpServer;
}
