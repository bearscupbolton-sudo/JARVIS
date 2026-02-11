import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Chat/AI setup
  registerChatRoutes(app);

  // Recipes
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

  app.post(api.recipes.create.path, async (req, res) => {
    try {
      const input = api.recipes.create.input.parse(req.body);
      const recipe = await storage.createRecipe(input);
      res.status(201).json(recipe);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.recipes.update.path, async (req, res) => {
    try {
      const input = api.recipes.update.input.parse(req.body);
      const recipe = await storage.updateRecipe(Number(req.params.id), input);
      res.json(recipe);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(404).json({ message: 'Recipe not found' });
    }
  });

  app.delete(api.recipes.delete.path, async (req, res) => {
    await storage.deleteRecipe(Number(req.params.id));
    res.status(204).send();
  });

  // Production Logs
  app.get(api.productionLogs.list.path, async (req, res) => {
    const logs = await storage.getProductionLogs();
    res.json(logs);
  });

  app.post(api.productionLogs.create.path, async (req, res) => {
    try {
      const input = api.productionLogs.create.input.parse(req.body);
      const log = await storage.createProductionLog(input);
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // SOPs
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

  app.post(api.sops.create.path, async (req, res) => {
    try {
      const input = api.sops.create.input.parse(req.body);
      const sop = await storage.createSOP(input);
      res.status(201).json(sop);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.sops.update.path, async (req, res) => {
    try {
      const input = api.sops.update.input.parse(req.body);
      const sop = await storage.updateSOP(Number(req.params.id), input);
      res.json(sop);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(404).json({ message: 'SOP not found' });
    }
  });

  app.delete(api.sops.delete.path, async (req, res) => {
    await storage.deleteSOP(Number(req.params.id));
    res.status(204).send();
  });

  // Problems
  app.get(api.problems.list.path, async (req, res) => {
    const includeCompleted = req.query.includeCompleted === "true";
    const problems = await storage.getProblems(includeCompleted);
    res.json(problems);
  });

  app.post(api.problems.create.path, async (req, res) => {
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

  app.patch(api.problems.update.path, async (req, res) => {
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

  app.delete(api.problems.delete.path, async (req, res) => {
    await storage.deleteProblem(Number(req.params.id));
    res.status(204).send();
  });

  // Events
  app.get(api.events.list.path, async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 5;
    const events = await storage.getUpcomingEvents(days);
    res.json(events);
  });

  app.post(api.events.create.path, async (req, res) => {
    try {
      const input = api.events.create.input.parse(req.body);
      const event = await storage.createEvent(input);
      res.status(201).json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put(api.events.update.path, async (req, res) => {
    try {
      const input = api.events.update.input.parse(req.body);
      const event = await storage.updateEvent(Number(req.params.id), input);
      res.json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(404).json({ message: 'Event not found' });
    }
  });

  app.delete(api.events.delete.path, async (req, res) => {
    await storage.deleteEvent(Number(req.params.id));
    res.status(204).send();
  });

  // Announcements
  app.get(api.announcements.list.path, async (req, res) => {
    const announcements = await storage.getAnnouncements();
    res.json(announcements);
  });

  app.post(api.announcements.create.path, async (req, res) => {
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

  app.put(api.announcements.update.path, async (req, res) => {
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

  app.delete(api.announcements.delete.path, async (req, res) => {
    await storage.deleteAnnouncement(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}
