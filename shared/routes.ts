import { z } from 'zod';
import { insertRecipeSchema, insertProductionLogSchema, insertSopSchema, insertProblemSchema, insertEventSchema, insertAnnouncementSchema, insertPastryTotalSchema, insertShapingLogSchema, insertBakeoffLogSchema, insertInventoryItemSchema, insertInvoiceSchema, insertInvoiceLineSchema, insertInventoryCountSchema, insertInventoryCountLineSchema, insertShiftSchema, insertTimeOffRequestSchema, insertLocationSchema, insertScheduleMessageSchema, insertPreShiftNoteSchema, insertPastryPassportSchema, insertPastryMediaSchema, insertPastryComponentSchema, insertPastryAddinSchema, recipes, productionLogs, sops, problems, events, announcements, pastryTotals, shapingLogs, bakeoffLogs, inventoryItems, invoices, invoiceLines, inventoryCounts, inventoryCountLines, shifts, timeOffRequests, locations, scheduleMessages, preShiftNotes, pastryPassports, pastryMedia, pastryComponents, pastryAddins } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  recipes: {
    list: {
      method: 'GET' as const,
      path: '/api/recipes' as const,
      responses: {
        200: z.array(z.custom<typeof recipes.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/recipes/:id' as const,
      responses: {
        200: z.custom<typeof recipes.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/recipes' as const,
      input: insertRecipeSchema,
      responses: {
        201: z.custom<typeof recipes.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/recipes/:id' as const,
      input: insertRecipeSchema.partial(),
      responses: {
        200: z.custom<typeof recipes.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/recipes/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    scan: {
      method: 'POST' as const,
      path: '/api/recipes/scan' as const,
      input: z.object({
        image: z.string().min(1),
      }),
      responses: { 200: z.any(), 400: errorSchemas.validation },
    },
  },
  productionLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/production-logs' as const,
      responses: {
        200: z.array(z.custom<typeof productionLogs.$inferSelect & { recipe: typeof recipes.$inferSelect | null }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/production-logs' as const,
      input: insertProductionLogSchema,
      responses: {
        201: z.custom<typeof productionLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  sops: {
    list: {
      method: 'GET' as const,
      path: '/api/sops' as const,
      responses: {
        200: z.array(z.custom<typeof sops.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/sops/:id' as const,
      responses: {
        200: z.custom<typeof sops.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/sops' as const,
      input: insertSopSchema,
      responses: {
        201: z.custom<typeof sops.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/sops/:id' as const,
      input: insertSopSchema.partial(),
      responses: {
        200: z.custom<typeof sops.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/sops/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    scan: {
      method: 'POST' as const,
      path: '/api/sops/scan' as const,
      input: z.object({ image: z.string() }),
      responses: {
        200: z.object({
          title: z.string(),
          category: z.string(),
          content: z.string(),
        }),
        400: errorSchemas.validation,
      },
    },
  },
  problems: {
    list: {
      method: 'GET' as const,
      path: '/api/problems' as const,
      responses: {
        200: z.array(z.custom<typeof problems.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/problems' as const,
      input: insertProblemSchema,
      responses: {
        201: z.custom<typeof problems.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/problems/:id' as const,
      input: insertProblemSchema.partial(),
      responses: {
        200: z.custom<typeof problems.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/problems/:id' as const,
      responses: { 204: z.void() },
    },
  },
  events: {
    list: {
      method: 'GET' as const,
      path: '/api/events' as const,
      responses: {
        200: z.array(z.custom<typeof events.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/events' as const,
      input: insertEventSchema,
      responses: {
        201: z.custom<typeof events.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/events/:id' as const,
      input: insertEventSchema.partial(),
      responses: {
        200: z.custom<typeof events.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/events/:id' as const,
      responses: { 204: z.void() },
    },
  },
  announcements: {
    list: {
      method: 'GET' as const,
      path: '/api/announcements' as const,
      responses: {
        200: z.array(z.custom<typeof announcements.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/announcements' as const,
      input: insertAnnouncementSchema,
      responses: {
        201: z.custom<typeof announcements.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/announcements/:id' as const,
      input: insertAnnouncementSchema.partial(),
      responses: {
        200: z.custom<typeof announcements.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/announcements/:id' as const,
      responses: { 204: z.void() },
    },
  },
  pastryTotals: {
    list: {
      method: 'GET' as const,
      path: '/api/pastry-totals' as const,
      responses: {
        200: z.array(z.custom<typeof pastryTotals.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/pastry-totals' as const,
      input: insertPastryTotalSchema,
      responses: {
        201: z.custom<typeof pastryTotals.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/pastry-totals/:id' as const,
      input: insertPastryTotalSchema.partial(),
      responses: {
        200: z.custom<typeof pastryTotals.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/pastry-totals/:id' as const,
      responses: { 204: z.void() },
    },
  },
  shapingLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/shaping-logs' as const,
      responses: {
        200: z.array(z.custom<typeof shapingLogs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/shaping-logs' as const,
      input: insertShapingLogSchema,
      responses: {
        201: z.custom<typeof shapingLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/shaping-logs/:id' as const,
      responses: { 204: z.void() },
    },
  },
  inventoryItems: {
    list: {
      method: 'GET' as const,
      path: '/api/inventory-items' as const,
      responses: { 200: z.array(z.custom<typeof inventoryItems.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/inventory-items' as const,
      input: insertInventoryItemSchema,
      responses: { 201: z.custom<typeof inventoryItems.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/inventory-items/:id' as const,
      input: insertInventoryItemSchema.partial(),
      responses: { 200: z.custom<typeof inventoryItems.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/inventory-items/:id' as const,
      responses: { 204: z.void() },
    },
  },
  invoices: {
    list: {
      method: 'GET' as const,
      path: '/api/invoices' as const,
      responses: { 200: z.array(z.custom<typeof invoices.$inferSelect>()) },
    },
    get: {
      method: 'GET' as const,
      path: '/api/invoices/:id' as const,
      responses: { 200: z.any(), 404: errorSchemas.notFound },
    },
    create: {
      method: 'POST' as const,
      path: '/api/invoices' as const,
      input: z.object({
        vendorName: z.string().min(1),
        invoiceDate: z.string().min(1),
        invoiceNumber: z.string().nullable().optional(),
        invoiceTotal: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
        enteredBy: z.string().nullable().optional(),
        documentType: z.string().optional(),
        locationTag: z.string().nullable().optional(),
        deliveryDate: z.string().nullable().optional(),
        hasShorts: z.boolean().optional(),
        hasSubstitutions: z.boolean().optional(),
        hasPriceAlerts: z.boolean().optional(),
        reviewStatus: z.string().optional(),
        lines: z.array(z.object({
          itemDescription: z.string().min(1),
          quantity: z.number().min(0),
          unit: z.string().nullable().optional(),
          unitPrice: z.number().nullable().optional(),
          lineTotal: z.number().nullable().optional(),
          manualMatchId: z.number().nullable().optional(),
          saveAsAlias: z.boolean().optional(),
          packSize: z.string().nullable().optional(),
          quantityOrdered: z.number().nullable().optional(),
          quantityShipped: z.number().nullable().optional(),
          isShort: z.boolean().optional(),
          isSubstitution: z.boolean().optional(),
          originalProduct: z.string().nullable().optional(),
          priceVariancePercent: z.number().nullable().optional(),
          previousUnitPrice: z.number().nullable().optional(),
        })),
      }),
      responses: { 201: z.any(), 400: errorSchemas.validation },
    },
    scan: {
      method: 'POST' as const,
      path: '/api/invoices/scan' as const,
      input: z.object({
        image: z.string().optional(),
        images: z.array(z.string()).optional(),
      }).refine(data => data.image || (data.images && data.images.length > 0), {
        message: "At least one image is required",
      }),
      responses: { 200: z.any(), 400: errorSchemas.validation },
    },
  },
  inventoryCounts: {
    list: {
      method: 'GET' as const,
      path: '/api/inventory-counts' as const,
      responses: { 200: z.array(z.custom<typeof inventoryCounts.$inferSelect>()) },
    },
    get: {
      method: 'GET' as const,
      path: '/api/inventory-counts/:id' as const,
      responses: { 200: z.any(), 404: errorSchemas.notFound },
    },
    start: {
      method: 'POST' as const,
      path: '/api/inventory-counts' as const,
      input: insertInventoryCountSchema,
      responses: { 201: z.any(), 400: errorSchemas.validation },
    },
    addLine: {
      method: 'POST' as const,
      path: '/api/inventory-counts/:id/lines' as const,
      input: z.object({ inventoryItemId: z.number(), quantity: z.number() }),
      responses: { 201: z.custom<typeof inventoryCountLines.$inferSelect>(), 400: errorSchemas.validation },
    },
    complete: {
      method: 'POST' as const,
      path: '/api/inventory-counts/:id/complete' as const,
      input: z.object({}),
      responses: { 200: z.any() },
    },
  },
  bakeoffLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/bakeoff-logs' as const,
      responses: {
        200: z.array(z.custom<typeof bakeoffLogs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/bakeoff-logs' as const,
      input: insertBakeoffLogSchema,
      responses: {
        201: z.custom<typeof bakeoffLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/bakeoff-logs/:id' as const,
      responses: { 204: z.void() },
    },
  },
  shifts: {
    list: {
      method: 'GET' as const,
      path: '/api/shifts' as const,
      responses: {
        200: z.array(z.custom<typeof shifts.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/shifts' as const,
      input: insertShiftSchema,
      responses: {
        201: z.custom<typeof shifts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/shifts/:id' as const,
      input: insertShiftSchema.partial(),
      responses: {
        200: z.custom<typeof shifts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/shifts/:id' as const,
      responses: { 204: z.void() },
    },
  },
  timeOffRequests: {
    list: {
      method: 'GET' as const,
      path: '/api/time-off' as const,
      responses: {
        200: z.array(z.custom<typeof timeOffRequests.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/time-off' as const,
      input: insertTimeOffRequestSchema,
      responses: {
        201: z.custom<typeof timeOffRequests.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/time-off/:id/status' as const,
      input: z.object({
        status: z.enum(["approved", "denied"]),
        reviewNote: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof timeOffRequests.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/time-off/:id' as const,
      responses: { 204: z.void() },
    },
  },
  locations: {
    list: {
      method: 'GET' as const,
      path: '/api/locations' as const,
      responses: { 200: z.array(z.custom<typeof locations.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/locations' as const,
      input: insertLocationSchema,
      responses: { 201: z.custom<typeof locations.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/locations/:id' as const,
      input: insertLocationSchema.partial(),
      responses: { 200: z.custom<typeof locations.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/locations/:id' as const,
      responses: { 204: z.void() },
    },
  },
  scheduleMessages: {
    list: {
      method: 'GET' as const,
      path: '/api/schedule-messages' as const,
      responses: { 200: z.array(z.custom<typeof scheduleMessages.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/schedule-messages' as const,
      input: insertScheduleMessageSchema,
      responses: { 201: z.custom<typeof scheduleMessages.$inferSelect>(), 400: errorSchemas.validation },
    },
    resolve: {
      method: 'PATCH' as const,
      path: '/api/schedule-messages/:id/resolve' as const,
      input: z.object({ resolved: z.boolean() }),
      responses: { 200: z.custom<typeof scheduleMessages.$inferSelect>() },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/schedule-messages/:id' as const,
      responses: { 204: z.void() },
    },
  },
  pastryPassports: {
    list: {
      method: 'GET' as const,
      path: '/api/pastry-passports' as const,
      responses: { 200: z.any() },
    },
    get: {
      method: 'GET' as const,
      path: '/api/pastry-passports/:id' as const,
      responses: { 200: z.any(), 404: errorSchemas.notFound },
    },
    create: {
      method: 'POST' as const,
      path: '/api/pastry-passports' as const,
      input: insertPastryPassportSchema,
      responses: { 201: z.any(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/pastry-passports/:id' as const,
      input: insertPastryPassportSchema.partial(),
      responses: { 200: z.any(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/pastry-passports/:id' as const,
      responses: { 204: z.void() },
    },
    addMedia: {
      method: 'POST' as const,
      path: '/api/pastry-passports/:id/media' as const,
      input: z.object({
        kind: z.enum(["photo", "video"]),
        url: z.string().min(1),
        caption: z.string().optional(),
      }),
      responses: { 201: z.any(), 400: errorSchemas.validation },
    },
    deleteMedia: {
      method: 'DELETE' as const,
      path: '/api/pastry-passports/:pastryId/media/:mediaId' as const,
      responses: { 204: z.void() },
    },
    addComponent: {
      method: 'POST' as const,
      path: '/api/pastry-passports/:id/components' as const,
      input: z.object({
        recipeId: z.number(),
        notes: z.string().optional(),
        weightPerPieceG: z.number().optional(),
      }),
      responses: { 201: z.any(), 400: errorSchemas.validation },
    },
    deleteComponent: {
      method: 'DELETE' as const,
      path: '/api/pastry-passports/:pastryId/components/:componentId' as const,
      responses: { 204: z.void() },
    },
    addAddin: {
      method: 'POST' as const,
      path: '/api/pastry-passports/:id/addins' as const,
      input: z.object({
        name: z.string().min(1),
        unit: z.string().optional(),
        quantity: z.number().optional(),
        notes: z.string().optional(),
        inventoryItemId: z.number().optional(),
        weightPerPieceG: z.number().optional(),
      }),
      responses: { 201: z.any(), 400: errorSchemas.validation },
    },
    deleteAddin: {
      method: 'DELETE' as const,
      path: '/api/pastry-passports/:pastryId/addins/:addinId' as const,
      responses: { 204: z.void() },
    },
    uploadPhoto: {
      method: 'POST' as const,
      path: '/api/pastry-passports/:id/upload-photo' as const,
      input: z.object({
        image: z.string().min(1),
      }),
      responses: { 200: z.object({ url: z.string() }), 400: errorSchemas.validation },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
