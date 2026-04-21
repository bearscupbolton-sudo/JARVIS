import type { Express } from "express";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { locations, wholesaleOrders } from "@shared/schema";
import { isAuthenticated, isOwner } from "../replit_integrations/auth";
import { isWholesaleAuthenticated, isWholesaleOnboarded } from "../wholesale-auth";

export function registerWholesaleRoutes(app: Express) {
  // === WHOLESALE PORTAL ENDPOINTS ===

  app.get("/api/wholesale/catalog", isWholesaleAuthenticated, isWholesaleOnboarded, async (_req, res) => {
    try {
      const items = await storage.getWholesaleCatalogItems(true);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/onboarding", isWholesaleAuthenticated, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const { businessName, contactName, phone, email, address, city, state, zip, certificateOfAuthority, st120IsBlanket, st120FilePath } = req.body;

      if (!businessName || !contactName || !phone || !email || !certificateOfAuthority) {
        return res.status(400).json({ message: "Business name, contact name, phone, email, and Certificate of Authority number are required" });
      }

      const updated = await storage.updateWholesaleCustomer(customer.id, {
        businessName,
        contactName,
        phone,
        email,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        certificateOfAuthority,
        st120IsBlanket: st120IsBlanket || false,
        st120FilePath: st120FilePath || null,
        onboardingComplete: true,
      });

      const { pinHash: _, ...safe } = updated;
      res.json(safe);
    } catch (err: any) {
      console.error("Wholesale onboarding error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/wholesale/orders", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const orders = await storage.getWholesaleOrders(customer.id);
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/orders", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const { orderDate, notes, items, isRecurring, recurringTemplateId } = req.body;
      if (!orderDate || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "orderDate and items are required" });
      }

      const catalogItems = await storage.getWholesaleCatalogItems(true);
      const catalogMap = new Map(catalogItems.map(ci => [ci.id, ci]));

      let totalAmount = 0;
      const orderItems: any[] = [];
      for (const item of items) {
        const ci = catalogMap.get(item.catalogItemId);
        if (!ci) return res.status(400).json({ message: `Unknown catalog item: ${item.catalogItemId}` });
        const subtotal = ci.unitPrice * item.quantity;
        totalAmount += subtotal;
        orderItems.push({
          catalogItemId: ci.id,
          itemName: ci.name,
          quantity: item.quantity,
          unitPrice: ci.unitPrice,
          subtotal,
          orderId: 0,
        });
      }

      const order = await storage.createWholesaleOrder(
        { customerId: customer.id, orderDate, notes: notes || null, totalAmount, isRecurring: isRecurring || false, recurringTemplateId: recurringTemplateId || null, status: "pending" },
        orderItems
      );

      const itemLines = order.items.map(i => `  • ${i.itemName} x${i.quantity} — $${i.subtotal.toFixed(2)}`).join("\n");
      const messageBody = `Wholesale Order #${order.id} from ${customer.businessName}\n\nDelivery Date: ${orderDate}\nTotal: $${totalAmount.toFixed(2)}\n\nItems:\n${itemLines}${notes ? `\n\nNotes: ${notes}` : ""}`;

      try {
        const owners = await db.select().from(users).where(eq(users.role, "owner"));
        const ownerIds = owners.map(o => o.id);
        if (ownerIds.length > 0) {
          await storage.sendMessage(
            { senderId: ownerIds[0], subject: `Wholesale Order #${order.id} — ${customer.businessName}`, body: messageBody, priority: "urgent", requiresAck: false, targetType: "role", targetValue: "owner", parentMessageId: null },
            ownerIds
          );
        }
      } catch (msgErr) {
        console.error("Failed to send wholesale order message:", msgErr);
      }

      try {
        const eventDate = new Date(orderDate + "T09:00:00");
        await storage.createEvent({
          title: `Wholesale: ${customer.businessName} — Order #${order.id}`,
          description: messageBody,
          date: eventDate,
          endDate: null,
          eventType: "delivery",
          contactName: customer.contactName,
          contactPhone: customer.phone || null,
          contactEmail: customer.email || null,
          address: null,
          startTime: null,
          endTime: null,
          taggedUserIds: null,
          isPersonal: false,
          invitedDepartments: null,
          createdBy: "system",
        });
      } catch (eventErr) {
        console.error("Failed to create wholesale calendar event:", eventErr);
      }

      res.status(201).json(order);
    } catch (err: any) {
      console.error("Wholesale order error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/orders/:id/payment-link", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const orderId = parseInt(req.params.id);
      const orders = await storage.getWholesaleOrders(customer.id);
      const order = orders.find((o: any) => o.id === orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status !== "pending") return res.status(400).json({ message: "Payment links can only be created for pending orders" });

      if (order.paymentLinkUrl) {
        return res.json({ paymentLinkUrl: order.paymentLinkUrl });
      }

      const { SquareClient, SquareEnvironment } = await import("square");
      const squareClient = new SquareClient({
        token: process.env.SQUARE_ACCESS_TOKEN || "",
        environment: (process.env.SQUARE_ENVIRONMENT === "production") ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
      });

      const [defaultLoc] = await db.select().from(locations).where(eq(locations.isDefault, true)).limit(1);
      const squareLocationId = defaultLoc?.squareLocationId || process.env.SQUARE_LOCATION_ID || "";
      if (!squareLocationId) {
        return res.status(400).json({ message: "Square location not configured. Please contact Bear's Cup." });
      }

      const lineItems = (order.items || []).map((item: any) => ({
        name: item.itemName,
        quantity: String(item.quantity),
        basePriceMoney: {
          amount: BigInt(Math.round(item.unitPrice * 100)),
          currency: "USD",
        },
      }));

      const result = await squareClient.checkout.paymentLinks.create({
        idempotencyKey: `wholesale-order-${orderId}-${Date.now()}`,
        quickPay: undefined,
        order: {
          locationId: squareLocationId,
          lineItems,
        },
        paymentNote: `Wholesale Order #${orderId} — ${customer.businessName}`,
      });

      const paymentLink = result.paymentLink;
      if (paymentLink?.url) {
        await db.update(wholesaleOrders)
          .set({ paymentLinkUrl: paymentLink.url, paymentLinkId: paymentLink.id || null })
          .where(eq(wholesaleOrders.id, orderId));

        return res.json({ paymentLinkUrl: paymentLink.url });
      }

      res.status(500).json({ message: "Failed to create payment link" });
    } catch (err: any) {
      console.error("Square payment link error:", err);
      res.status(500).json({ message: err.message || "Failed to create payment link" });
    }
  });

  app.get("/api/wholesale/templates", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const templates = await storage.getWholesaleTemplates(customer.id);
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/templates", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const { dayOfWeek, templateName, items } = req.body;
      if (dayOfWeek === undefined || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: "dayOfWeek and items are required" });
      }
      const template = await storage.createWholesaleTemplate(
        { customerId: customer.id, dayOfWeek, templateName: templateName || null, isActive: true },
        items.map((i: any) => ({ templateId: 0, catalogItemId: i.catalogItemId, quantity: i.quantity }))
      );
      res.status(201).json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/wholesale/templates/:id", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const id = parseInt(req.params.id);
      const templates = await storage.getWholesaleTemplates(customer.id);
      const existing = templates.find(t => t.id === id);
      if (!existing) return res.status(404).json({ message: "Template not found" });

      const { dayOfWeek, templateName, items, isActive } = req.body;
      const updateData: any = {};
      if (dayOfWeek !== undefined) updateData.dayOfWeek = dayOfWeek;
      if (templateName !== undefined) updateData.templateName = templateName;
      if (isActive !== undefined) updateData.isActive = isActive;

      const itemsToUpdate = items ? items.map((i: any) => ({ templateId: id, catalogItemId: i.catalogItemId, quantity: i.quantity })) : undefined;
      const updated = await storage.updateWholesaleTemplate(id, updateData, itemsToUpdate);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/wholesale/templates/:id", isWholesaleAuthenticated, isWholesaleOnboarded, async (req, res) => {
    try {
      const customer = (req as any).wholesaleCustomer;
      const id = parseInt(req.params.id);
      const templates = await storage.getWholesaleTemplates(customer.id);
      if (!templates.find(t => t.id === id)) return res.status(404).json({ message: "Template not found" });
      await storage.deleteWholesaleTemplate(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === WHOLESALE ADMIN (Owner-only) ===

  app.get("/api/wholesale/admin/customers", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const customers = await storage.getWholesaleCustomers();
      res.json(customers.map(c => { const { pinHash: _, ...safe } = c; return safe; }));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/admin/customers", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { businessName, contactName, phone, email, pin, notes, locationId } = req.body;
      if (!pin) {
        return res.status(400).json({ message: "PIN is required" });
      }
      const bcrypt = await import("bcryptjs");
      const pinHash = await bcrypt.hash(pin, 12);
      const customer = await storage.createWholesaleCustomer({
        businessName: businessName || "New Customer",
        contactName: contactName || "Pending Setup",
        phone: phone || null, email: email || null,
        pinHash, notes: notes || null, isActive: true,
        onboardingComplete: !!(businessName && contactName),
        locationId: locationId || null,
      });
      const { pinHash: _, ...safe } = customer;
      res.status(201).json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/wholesale/admin/customers/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { businessName, contactName, phone, email, pin, notes, isActive, locationId } = req.body;
      const updates: any = {};
      if (businessName !== undefined) updates.businessName = businessName;
      if (contactName !== undefined) updates.contactName = contactName;
      if (phone !== undefined) updates.phone = phone;
      if (email !== undefined) updates.email = email;
      if (notes !== undefined) updates.notes = notes;
      if (isActive !== undefined) updates.isActive = isActive;
      if (locationId !== undefined) updates.locationId = locationId;
      if (pin) {
        const bcrypt = await import("bcryptjs");
        updates.pinHash = await bcrypt.hash(pin, 12);
      }
      const updated = await storage.updateWholesaleCustomer(id, updates);
      const { pinHash: _, ...safe } = updated;
      res.json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/wholesale/admin/catalog", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const items = await storage.getWholesaleCatalogItems(false);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/admin/catalog", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { name, description, category, unitPrice, unit, sortOrder } = req.body;
      if (!name || unitPrice === undefined) {
        return res.status(400).json({ message: "name and unitPrice are required" });
      }
      const item = await storage.createWholesaleCatalogItem({
        name, description: description || null, category: category || null,
        unitPrice: parseFloat(unitPrice), unit: unit || "each",
        isActive: true, sortOrder: sortOrder || 0,
      });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/wholesale/admin/catalog/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates: any = {};
      for (const key of ["name", "description", "category", "unitPrice", "unit", "isActive", "sortOrder"]) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (updates.unitPrice !== undefined) updates.unitPrice = parseFloat(updates.unitPrice);
      const item = await storage.updateWholesaleCatalogItem(id, updates);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/wholesale/admin/catalog/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      await storage.deleteWholesaleCatalogItem(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/wholesale/admin/orders", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const orders = await storage.getWholesaleOrders();
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wholesale/admin/orders", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { customerId, orderDate, notes, items, generatePaymentLink } = req.body;
      if (!customerId || !orderDate || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "customerId, orderDate, and items are required" });
      }

      const customers = await storage.getWholesaleCustomers();
      const customer = customers.find((c: any) => c.id === customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      for (const item of items) {
        if (!item.catalogItemId || typeof item.catalogItemId !== "number" || !Number.isInteger(item.quantity) || item.quantity < 1) {
          return res.status(400).json({ message: "Each item must have a valid catalogItemId and quantity >= 1" });
        }
      }

      const catalogItems = await storage.getWholesaleCatalogItems(true);
      const catalogMap = new Map(catalogItems.map(ci => [ci.id, ci]));

      let totalAmount = 0;
      const orderItems: any[] = [];
      for (const item of items) {
        const ci = catalogMap.get(item.catalogItemId);
        if (!ci) return res.status(400).json({ message: `Unknown catalog item: ${item.catalogItemId}` });
        const subtotal = ci.unitPrice * item.quantity;
        totalAmount += subtotal;
        orderItems.push({
          catalogItemId: ci.id,
          itemName: ci.name,
          quantity: item.quantity,
          unitPrice: ci.unitPrice,
          subtotal,
          orderId: 0,
        });
      }

      const order = await storage.createWholesaleOrder(
        { customerId: customer.id, orderDate, notes: notes || null, totalAmount, isRecurring: false, recurringTemplateId: null, status: "pending" },
        orderItems
      );

      try {
        const eventDate = new Date(orderDate + "T09:00:00");
        await storage.createEvent({
          title: `Wholesale: ${customer.businessName} — Order #${order.id}`,
          description: `Phone-in order placed by staff.\n\nTotal: $${totalAmount.toFixed(2)}\n\nItems:\n${orderItems.map(i => `  • ${i.itemName} x${i.quantity} — $${i.subtotal.toFixed(2)}`).join("\n")}${notes ? `\n\nNotes: ${notes}` : ""}`,
          date: eventDate,
          endDate: null,
          eventType: "delivery",
          contactName: customer.contactName,
          contactPhone: customer.phone || null,
          contactEmail: customer.email || null,
          address: null,
          startTime: null,
          endTime: null,
          taggedUserIds: null,
          isPersonal: false,
          invitedDepartments: null,
          createdBy: "system",
        });
      } catch (eventErr) {
        console.error("Failed to create wholesale calendar event:", eventErr);
      }

      let paymentLinkUrl = null;
      if (generatePaymentLink) {
        try {
          const { SquareClient, SquareEnvironment } = await import("square");
          const squareClient = new SquareClient({
            token: process.env.SQUARE_ACCESS_TOKEN || "",
            environment: (process.env.SQUARE_ENVIRONMENT === "production") ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
          });

          const [defaultLoc] = await db.select().from(locations).where(eq(locations.isDefault, true)).limit(1);
          const squareLocationId = defaultLoc?.squareLocationId || process.env.SQUARE_LOCATION_ID || "";
          if (squareLocationId) {
            const lineItems = orderItems.map((item: any) => ({
              name: item.itemName,
              quantity: String(item.quantity),
              basePriceMoney: {
                amount: BigInt(Math.round(item.unitPrice * 100)),
                currency: "USD",
              },
            }));

            const result = await squareClient.checkout.paymentLinks.create({
              idempotencyKey: `wholesale-order-${order.id}-${Date.now()}`,
              quickPay: undefined,
              order: {
                locationId: squareLocationId,
                lineItems,
              },
              paymentNote: `Wholesale Order #${order.id} — ${customer.businessName}`,
            });

            const paymentLink = result.paymentLink;
            if (paymentLink?.url) {
              paymentLinkUrl = paymentLink.url;
              await db.update(wholesaleOrders)
                .set({ paymentLinkUrl: paymentLink.url, paymentLinkId: paymentLink.id || null })
                .where(eq(wholesaleOrders.id, order.id));
            }
          }
        } catch (plErr) {
          console.error("Failed to generate payment link for admin order:", plErr);
        }
      }

      res.status(201).json({ ...order, paymentLinkUrl });
    } catch (err: any) {
      console.error("Admin wholesale order error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/wholesale/admin/orders/:id/status", isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!["pending", "confirmed", "completed", "cancelled", "paid"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const order = await storage.updateWholesaleOrderStatus(id, status);
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
