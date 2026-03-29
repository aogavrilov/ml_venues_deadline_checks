import registry from "../../data/sources/registry.json";
import { sourceRegistrySchema } from "./source-registry.schema";

const parsedRegistry = sourceRegistrySchema.parse(registry);

export const sourceRegistry = parsedRegistry;

export const registrySummary = parsedRegistry.venues.map((venue) => ({
  slug: venue.slug,
  name: venue.name,
  sourceCount: venue.sources.length
}));
