import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";
import { storage } from "../../storage";
import { withRetry } from "../../ai-retry";
import { processCFOInstruction, GHOST_ACTION_DETECTION_PROMPT, type GhostAction } from "../../ghost-commands";
import { db } from "../../db";
import { firmTransactions, users } from "@shared/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { runAgenticLoop } from "../../tool-dispatcher";
import { isAuthenticated } from "../auth/replitAuth";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const BASE_SYSTEM_PROMPT = `You are Jarvis, the in-house AI assistant for Bear's Cup Bakehouse (Bear's Cup LLC, EIN: 83-3429330). You have direct access to the bakery's own recipes, Standard Operating Procedures (SOPs), and financial data.

Your capabilities:
- Answer questions about the bakery's recipes, ingredients, baker's percentages, and procedures
- Help with recipe scaling and conversions based on the actual recipes in the system
- Advise on ingredient substitutions and their effects
- Explain SOPs and help the team follow proper procedures
- Assist with fermentation, lamination, troubleshooting, food safety, and production scheduling
- General baking knowledge when the question goes beyond what's in the system
- Financial advisory: review transactions, identify misclassifications, flag items needing capitalization

De Minimis Safe Harbor threshold: $2,500. Any single asset purchase above this MUST be capitalized (COA 1500), not expensed.

Keep answers practical and concise. Use baker's terminology when appropriate. When referencing a recipe or SOP from the system, mention it by name so the team knows exactly what you're referring to.`;

const AGENTIC_SYSTEM_RULES = `

CRITICAL RULES FOR FINANCIAL QUERIES:
- NEVER calculate financial totals yourself — always use get_profit_and_loss to get authoritative numbers.
- If you use an accounting term, look up its laymanDescription via get_coa_definition and include it in your response.
- End every financial answer with source attribution listing which tools provided the data (e.g., "Verified via get_profit_and_loss, get_audit_lineage").
- When investigating a spike, follow this pattern: P&L overview → identify spiking account → audit lineage for that account → price variance if ingredient-related.
- Report numbers exactly as returned by tools. Do not round, estimate, or derive new totals.`;

async function buildSystemPrompt(includeFinancial: boolean = false): Promise<string> {
  let context = BASE_SYSTEM_PROMPT;

  try {
    const recipes = await storage.getRecipes();
    if (recipes.length > 0) {
      context += "\n\n=== BAKERY RECIPES ===\n";
      for (const recipe of recipes) {
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
        context += `\n--- ${recipe.title} (${recipe.category}) ---\n`;
        if (recipe.description) context += `Description: ${recipe.description}\n`;
        context += `Yield: ${recipe.yieldAmount} ${recipe.yieldUnit}\n`;
        if (ingredients.length > 0) {
          context += "Ingredients:\n";
          for (const ing of ingredients as any[]) {
            const bp = ing.bakersPercentage ? ` (${ing.bakersPercentage}%)` : "";
            context += `  - ${ing.name}: ${ing.quantity} ${ing.unit}${bp}\n`;
          }
        }
        if (instructions.length > 0) {
          context += "Instructions:\n";
          for (const inst of instructions as any[]) {
            context += `  ${inst.step}. ${inst.text}\n`;
          }
        }
      }
    }

    const allSOPs = await storage.getSOPs();
    if (allSOPs.length > 0) {
      context += "\n\n=== STANDARD OPERATING PROCEDURES ===\n";
      for (const sop of allSOPs) {
        context += `\n--- ${sop.title} (${sop.category}) ---\n`;
        context += sop.content + "\n";
      }
    }
  } catch (error) {
    console.error("Error loading bakery data for Jarvis context:", error);
  }

  if (includeFinancial) {
    context += AGENTIC_SYSTEM_RULES;
    context += "\n" + GHOST_ACTION_DETECTION_PROMPT;
  }

  return context;
}

function isFinancialQuery(content: string): boolean {
  const financialKeywords = [
    "transaction", "expense", "revenue", "categoriz", "reclassif", "capitalize",
    "asset", "depreciat", "coa", "chart of accounts", "ledger", "accrual",
    "balance", "p&l", "profit", "loss", "tax", "deduction", "write off",
    "cost", "invoice", "vendor", "supplier", "payment", "reconcil",
    "misclassif", "fixed asset", "de minimis", "oven", "equipment",
    "mixer", "repair", "maintenance", "electrician", "plumber",
    "financial", "accounting", "books", "cfo", "budget"
  ];
  const lower = content.toLowerCase();
  return financialKeywords.some(kw => lower.includes(kw));
}

function extractGhostActions(text: string): { cleanText: string; actions: GhostAction[] } {
  const actions: GhostAction[] = [];
  const ghostPattern = /:::ghost_action\s*\n([\s\S]*?)\n:::/g;
  let match;

  while ((match = ghostPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.type && parsed.reason && parsed.impact && parsed.payload) {
        actions.push(parsed as GhostAction);
      }
    } catch (err) {
      console.error("Failed to parse ghost_action block:", err);
    }
  }

  const cleanText = text.replace(ghostPattern, "").trim();
  return { cleanText, actions };
}

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", async (_req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id as string);
      const { content } = req.body;

      await chatStorage.createMessage(conversationId, "user", content);

      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const currentIsFinancial = isFinancialQuery(content);
      const conversationHasFinancial = currentIsFinancial || messages.some(m => isFinancialQuery(m.content));
      const systemPrompt = await buildSystemPrompt(conversationHasFinancial);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const isFollowUpInFinancialThread = !currentIsFinancial && conversationHasFinancial && content.length < 80;

      if (currentIsFinancial || isFollowUpInFinancialThread) {
        const agenticMessages = [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role as string,
            content: m.content,
          })),
        ];

        const { responseText, toolsUsed } = await runAgenticLoop(agenticMessages, {
          sseResponse: res,
        });

        let finalText = responseText;
        if (toolsUsed.length > 0 && !finalText.includes("Verified via") && !finalText.includes("Source:")) {
          const uniqueTools = [...new Set(toolsUsed)];
          finalText += `\n\n*Verified via ${uniqueTools.join(", ")}.*`;
        }

        const { cleanText, actions } = extractGhostActions(finalText);

        const chunks = cleanText.match(/.{1,20}/g) || [cleanText];
        for (const chunk of chunks) {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        if (actions.length > 0) {
          for (const action of actions) {
            res.write(`data: ${JSON.stringify({ ghost_action: action })}\n\n`);
          }
        }

        await chatStorage.createMessage(conversationId, "assistant", cleanText);
      } else {
        const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        const stream = await withRetry(() => openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: chatMessages,
          stream: true,
          max_tokens: 2048,
        }), "jarvis-chat");

        let fullResponse = "";

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }

        const { cleanText, actions } = extractGhostActions(fullResponse);

        if (actions.length > 0) {
          for (const action of actions) {
            res.write(`data: ${JSON.stringify({ ghost_action: action })}\n\n`);
          }
        }

        await chatStorage.createMessage(conversationId, "assistant", cleanText);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  app.post("/api/ghost-action/execute", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const appUser = (req as any).appUser;

      const [user] = await db.select().from(users).where(eq(users.id, appUser.id));
      if (!user || user.role !== "owner") {
        return res.status(403).json({ error: "Only owners can execute CFO commands" });
      }

      const action = req.body as GhostAction;
      if (!action?.type || !action?.reason || !action?.payload) {
        return res.status(400).json({ error: "Invalid ghost action" });
      }

      const result = await processCFOInstruction(action, user.id, user.firstName || user.username);
      res.json(result);
    } catch (error) {
      console.error("Error executing ghost action:", error);
      res.status(500).json({ error: "Failed to execute action" });
    }
  });
}
