/**
 * Validates src/content/distros/*.yaml against the catalog schema without a
 * full Astro sync, plus cross-entry rules the schema cannot express:
 * unique `order`, `basedOn` pointing at an existing slug, logo file present,
 * and a sane logo SVG. Usage: bun scripts/validate-catalog.ts [slug ...]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { distroSchema } from "../src/lib/schemas";

const DIR = "src/content/distros";
const LOGOS = "src/assets/logos";
const only = new Set(process.argv.slice(2));
const files = readdirSync(DIR).filter((f) => f.endsWith(".yaml"));
const slugs = new Set(files.map((f) => f.replace(/\.yaml$/, "")));
const orders = new Map<number, string>();
let failed = 0;

for (const file of files) {
  const slug = file.replace(/\.yaml$/, "");
  const raw = parse(readFileSync(join(DIR, file), "utf8"));
  const res = distroSchema.safeParse(raw);
  const errors: string[] = [];
  if (!res.success) {
    for (const issue of res.error.issues) errors.push(`${issue.path.join(".")}: ${issue.message}`);
  } else {
    const d = res.data;
    const prev = orders.get(d.order);
    if (prev) errors.push(`order ${d.order} duplicates ${prev}`);
    orders.set(d.order, slug);
    if (d.basedOn && !slugs.has(d.basedOn))
      errors.push(`basedOn "${d.basedOn}" is not a catalog slug`);
    const logoPath = join(LOGOS, d.logo.file);
    if (!existsSync(logoPath)) errors.push(`logo ${logoPath} missing`);
    else {
      const svg = readFileSync(logoPath, "utf8");
      if (!/<svg[\s>]/.test(svg)) errors.push("logo is not an SVG");
      if (!/viewBox=/.test(svg)) errors.push("logo has no viewBox");
      if (/<script|on\w+=|href="https?:/i.test(svg))
        errors.push("logo has scripts or external refs");
      if (svg.length > 60_000) errors.push(`logo is large (${svg.length} bytes)`);
    }
  }
  if (only.size && !only.has(slug)) continue;
  if (errors.length) {
    failed++;
    console.error(`✗ ${slug}\n  ${errors.join("\n  ")}`);
  } else console.log(`✓ ${slug}`);
}

console.log(`${files.length} entries, ${failed} with errors`);
process.exit(failed ? 1 : 0);
