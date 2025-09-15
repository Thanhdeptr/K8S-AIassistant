import { z } from "zod";

/**
 * Helper function to make Zod schemas work with client.request validation
 * This addresses type issues with the client library validation
 */
export function asResponseSchema<T extends z.ZodTypeAny>(schema: T) {
  return schema as unknown as z.ZodType<z.infer<T>, z.ZodTypeDef, object>;
} 