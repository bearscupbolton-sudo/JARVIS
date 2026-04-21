import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, isUnlocked, isManager } from "../replit_integrations/auth";
import { getUserFromReq, createOvenTimersForItem } from "./_helpers";

export function registerLaminationRoutes(app: Express) {
  app.get("/api/lamination/active", isAuthenticated, async (req: any, res) => {
    try {
      const doughs = await storage.getActiveLaminationDoughs();
      res.json(doughs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/lamination/freezer-inventory", isAuthenticated, async (_req: any, res) => {
    try {
      const inv = await storage.getFreezerInventory();
      res.set("Cache-Control", "private, max-age=15");
      res.json(inv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/lamination/:date", isAuthenticated, async (req: any, res) => {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
        return res.status(404).json({ message: "Not found" });
      }
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
        status: z.enum(["turning", "resting", "completed", "proofing", "frozen", "baked", "chilling", "fridge", "trashed", "box1", "box2", "box3"]).optional(),
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
        retarderBox: z.enum(["box1", "box2", "box3"]).nullable().optional(),
        boxProgramConfirmed: z.boolean().optional(),
        boxReadyAt: z.string().nullable().optional(),
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
      if (parsed.boxReadyAt) updates.boxReadyAt = new Date(parsed.boxReadyAt);
      const dough = await storage.updateLaminationDough(id, updates);
      storage.clearAllBriefingCaches().catch(() => {});

      // === WATERFALL HOOK ===
      // When a dough enters "resting" with an intended pastry, look up the
      // Par & Yield Registry. If the registry assigns a component task
      // (e.g. "Almond Paste", "Glaze"), drop it into today's bakery task list.
      if (parsed.status === "resting") {
        const intended = parsed.intendedPastry ?? dough.intendedPastry ?? null;
        if (intended && intended.trim()) {
          (async () => {
            try {
              const pastryItemId = await storage.resolvePastryItemId(intended.trim());
              if (!pastryItemId) return;
              const config = await storage.getPastryYieldConfig(pastryItemId);
              if (!config?.componentTaskId) return;

              // PPIE Phase 5: compute the cumulative quantity needed across
              // ALL active doughs intended for this pastry, using the highest
              // of target par or projected par from the registry.
              const effectivePar = Math.max(
                config.targetPar ?? 0,
                config.projectedPar ?? 0,
              );
              const yieldPerDough = config.yieldPerDough || 1;

              let needPieces = 0;
              if (effectivePar > 0) {
                // Live shaped pieces across active doughs for this pastry
                const allActive = await storage.getActiveLaminationDoughs();
                const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
                const target = norm(intended);
                let liveShaped = 0;
                for (const d of allActive) {
                  const shapings = (d.shapings as Array<{ pastryType: string; pieces: number }> | null) ?? [];
                  for (const s of shapings) {
                    if (norm(s.pastryType) === target) liveShaped += s.pieces || 0;
                  }
                }
                needPieces = Math.max(0, effectivePar - liveShaped);
              } else {
                // Fallback: at least one dough's worth
                needPieces = yieldPerDough;
              }

              await storage.activateProductionTask(config.componentTaskId, {
                notes: `for ${intended}`,
                quantity: needPieces,
                quantityUnit: "pcs",
              });
            } catch (e) {
              console.error("[Waterfall] activateProductionTask failed:", e);
            }
          })();
        }
      }

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

  app.post("/api/lamination/bake-off", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const schema = z.object({
        box: z.enum(["box1", "box2", "box3"]),
        pastryName: z.string().min(1),
        count: z.number().int().positive(),
      });
      const { box, pastryName, count } = schema.parse(req.body);
      const result = await storage.bakeOffFromBox(box, pastryName, count, user?.id || null);

      if (result.actuallyBaked > 0) {
        const pid = await storage.resolvePastryItemId(pastryName);
        createOvenTimersForItem(pastryName, pid, user?.id || null).catch(() => {});
      }
      storage.clearAllBriefingCaches().catch(() => {});

      res.json(result);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/lamination/bake-off-batch", isAuthenticated, isUnlocked, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const schema = z.object({
        box: z.enum(["box1", "box2", "box3"]),
        items: z.array(z.object({
          pastryName: z.string().min(1),
          count: z.number().int().positive(),
        })).min(1),
      });
      const { box, items } = schema.parse(req.body);
      const results = await storage.bakeOffBatchFromBox(box, items, user?.id || null);

      for (const r of results) {
        if (r.actuallyBaked > 0) {
          const pid = await storage.resolvePastryItemId(r.pastryName);
          createOvenTimersForItem(r.pastryName, pid, user?.id || null).catch(() => {});
        }
      }
      storage.clearAllBriefingCaches().catch(() => {});

      res.json({ results });
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

  // === PASTRY YIELD CONFIGS (Par & Yield Registry) ===
  app.get("/api/pastry-yield-configs", isAuthenticated, async (req: any, res) => {
    try {
      const configs = await storage.getPastryYieldConfigs();
      res.json(configs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/pastry-yield-configs", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const schema = z.object({
        pastryItemId: z.number().int().positive(),
        yieldPerDough: z.number().int().min(1).default(40),
        componentTaskId: z.number().int().nullable().optional(),
        targetPar: z.number().int().min(0).default(0),
        notes: z.string().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const config = await storage.upsertPastryYieldConfig(data);
      res.json(config);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  // === PPIE: Par & Yield Registry with stats ===
  app.get("/api/par-registry/with-stats", isAuthenticated, async (_req: any, res) => {
    try {
      const rows = await storage.getParRegistryWithStats();
      res.set("Cache-Control", "private, max-age=10");
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/par-registry/refresh-rolling-avg", isAuthenticated, isManager, async (_req: any, res) => {
    try {
      const updated = await storage.refreshAllRolling4WkAvg();
      res.json({ updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === PPIE: Sell-Out Logger ===
  app.post("/api/inventory/log-86", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserFromReq(req);
      const schema = z.object({
        pastryItemId: z.number().int().positive(),
        soldOutAt: z.string().datetime().optional(),
        notes: z.string().nullable().optional(),
      });
      const { pastryItemId, soldOutAt, notes } = schema.parse(req.body);
      const at = soldOutAt ? new Date(soldOutAt) : new Date();
      const result = await storage.logSellOut(pastryItemId, at, user?.id || null, notes || undefined);
      res.json(result);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sell-out-events", isAuthenticated, async (req: any, res) => {
    try {
      const days = req.query.days ? Math.max(1, Math.min(90, parseInt(req.query.days as string))) : 14;
      const events = await storage.getRecentSellOutEvents(days);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
