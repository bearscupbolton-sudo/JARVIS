import { z } from 'zod';
import { insertRecipeSchema, insertProductionLogSchema, insertSopSchema, recipes, productionLogs, sops } from './schema';

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
