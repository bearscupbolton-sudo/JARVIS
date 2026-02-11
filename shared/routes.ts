import { z } from 'zod';
import { insertRecipeSchema, insertProductionLogSchema, insertSopSchema, insertProblemSchema, insertEventSchema, insertAnnouncementSchema, recipes, productionLogs, sops, problems, events, announcements } from './schema';

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
