import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { distroSchema } from "./lib/schemas";

const distros = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/distros" }),
  schema: distroSchema,
});

export const collections = { distros };
