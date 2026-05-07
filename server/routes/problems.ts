import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { isAuthenticated, isUnlocked, isOwner } from "../replit_integrations/auth";
import { getUserFromReq } from "./_helpers";

export function registerProblemsRoutes(app: Express) {
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
      const { pendingPhotos, ...rest } = req.body;
      const input = api.problems.create.input.parse(rest);

      let photoUrls: string[] = [];
      if (pendingPhotos && Array.isArray(pendingPhotos) && pendingPhotos.length > 0) {
        const { uploadMediaWithThumbnail } = await import("./media");
        const crypto = await import("crypto");
        const results = await Promise.all(
          pendingPhotos.slice(0, 5).map((b64: string) => uploadMediaWithThumbnail(b64, "problem", crypto.randomUUID()))
        );
        photoUrls = results.map(r => r.url);
      }
      if (photoUrls.length > 0) (input as any).photos = photoUrls;

      const user = await getUserFromReq(req);
      if (user) {
        (input as any).reportedById = user.id;
        if (!input.reportedBy) {
          (input as any).reportedBy = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username;
        }
      }

      const problem = await storage.createProblem(input);

      const authorName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : (input.reportedBy || "System");
      try {
        await storage.createProblemNote({
          problemId: problem.id,
          content: `Problem reported: "${problem.title}"${problem.severity ? ` — Severity: ${problem.severity}` : ""}${problem.description ? `\n\n${problem.description}` : ""}`,
          authorId: user?.id || "system",
          authorName,
          photos: photoUrls,
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

      if (input.status === "resolved" && existing.status !== "resolved" && existing.reportedById) {
        const user = await getUserFromReq(req);
        const closedByName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : "Someone";
        if (!user || user.id !== existing.reportedById) {
          try {
            const [msg] = await db.insert(directMessages).values({
              senderId: user?.id || "system",
              subject: "Problem Resolved",
              body: `Your problem **"${existing.title}"** has been marked as resolved by ${closedByName}.\n\nCheck the Maintenance hub for details.`,
              priority: "normal",
              requiresAck: false,
            }).returning();
            await db.insert(messageRecipients).values({
              messageId: msg.id,
              userId: existing.reportedById,
              read: false,
              acknowledged: false,
              pinned: false,
              archived: false,
            });
            try {
              const { sendPushToUser } = await import("./push");
              await sendPushToUser(existing.reportedById, {
                title: "Problem Resolved",
                body: `"${existing.title}" has been resolved`,
                url: "/maintenance",
              });
            } catch {}
          } catch (notifErr) {
            console.error("Failed to notify reporter of resolution:", notifErr);
          }
        }
      }

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

    let photoUrls: string[] = [];
    if (req.body.pendingPhotos && Array.isArray(req.body.pendingPhotos) && req.body.pendingPhotos.length > 0) {
      const { uploadMediaWithThumbnail } = await import("./media");
      const crypto = await import("crypto");
      const results = await Promise.all(
        req.body.pendingPhotos.slice(0, 5).map((b64: string) => uploadMediaWithThumbnail(b64, "problem-note", crypto.randomUUID()))
      );
      photoUrls = results.map(r => r.url);
    }

    const note = await storage.createProblemNote({
      problemId: Number(req.params.id),
      content: req.body.content || "",
      authorId: user.id,
      authorName: user.username || user.firstName || "Unknown",
      photos: photoUrls.length > 0 ? photoUrls : undefined,
    });

    const problem = await storage.getProblem(Number(req.params.id));
    if (problem) {
      if (photoUrls.length > 0) {
        const allPhotos = [...(problem.photos || []), ...photoUrls];
        await storage.updateProblem(Number(req.params.id), { photos: allPhotos } as any);
      }

      if (problem.reportedById && problem.reportedById !== user.id) {
        const authorDisplayName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username;
        try {
          const [msg] = await db.insert(directMessages).values({
            senderId: user.id,
            subject: "Problem Updated",
            body: `**${authorDisplayName}** added a note to your problem **"${problem.title}"**:\n\n${(req.body.content || "").substring(0, 200)}${photoUrls.length > 0 ? `\n\n(${photoUrls.length} photo${photoUrls.length > 1 ? "s" : ""} attached)` : ""}\n\nCheck the Maintenance hub for details.`,
            priority: "normal",
            requiresAck: false,
          }).returning();
          await db.insert(messageRecipients).values({
            messageId: msg.id,
            userId: problem.reportedById,
            read: false,
            acknowledged: false,
            pinned: false,
            archived: false,
          });
          try {
            const { sendPushToUser } = await import("./push");
            await sendPushToUser(problem.reportedById, {
              title: "Problem Updated",
              body: `Note added to "${problem.title}"`,
              url: "/maintenance",
            });
          } catch {}
        } catch (notifErr) {
          console.error("Failed to notify reporter of note:", notifErr);
        }
      }
    }

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

}
