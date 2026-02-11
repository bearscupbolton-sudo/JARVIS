import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";
import { storage } from "../../storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const BASE_SYSTEM_PROMPT = `You are Jarvis, the in-house AI assistant for Bear's Cup Bakehouse. You have direct access to the bakery's own recipes and Standard Operating Procedures (SOPs). Always refer to this data when answering questions — it is the source of truth for how this bakery operates.

Your capabilities:
- Answer questions about the bakery's recipes, ingredients, baker's percentages, and procedures
- Help with recipe scaling and conversions based on the actual recipes in the system
- Advise on ingredient substitutions and their effects
- Explain SOPs and help the team follow proper procedures
- Assist with fermentation, lamination, troubleshooting, food safety, and production scheduling
- General baking knowledge when the question goes beyond what's in the system

Keep answers practical and concise. Use baker's terminology when appropriate. When referencing a recipe or SOP from the system, mention it by name so the team knows exactly what you're referring to. If asked about something not covered by the bakery's data, you can still help with general baking knowledge but note that it's not from the bakery's own records.`;

async function buildSystemPrompt(): Promise<string> {
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

  return context;
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
      const systemPrompt = await buildSystemPrompt();
      const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_tokens: 2048,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullResponse += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

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
}
