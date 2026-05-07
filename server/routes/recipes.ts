import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { isAuthenticated, isUnlocked, isOwner } from "../replit_integrations/auth";
import { withRetry } from "../ai-retry";
import { getUserFromReq } from "./_helpers";

export function registerRecipesRoutes(app: Express) {
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
}
