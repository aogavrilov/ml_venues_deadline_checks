import { z } from "zod";

const sourceSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(["official", "community", "mirror"]),
  url: z.string().url(),
  notes: z.string().min(1),
  selectors: z
    .object({
      deadlineText: z.string().min(1).optional(),
      cfpLink: z.string().min(1).optional()
    })
    .optional()
});

const trackSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  area: z.enum(["ml", "cv", "nlp", "robotics", "general"])
});

const venueSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  series: z.string().min(1),
  area: z.enum(["ml", "cv", "nlp", "robotics", "general"]),
  timezone: z.string().min(1),
  tracks: z.array(trackSchema).min(1),
  sources: z.array(sourceSchema).min(1)
});

export const sourceRegistrySchema = z.object({
  version: z.number().int().positive(),
  venues: z.array(venueSchema).min(1)
});

export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;
