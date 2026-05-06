import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isCustomerAuthenticated } from "../customer-auth";
import { fetchSquareCatalog, createSquareOrder } from "../square";

export function registerPortalRoutes(app: Express) {
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
}
