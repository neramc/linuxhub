/**
 * Regenerates the per-distro table in docs/data-sources.md from the catalog
 * and the synced data (`bun run sync:docs`), so the documentation always says
 * where each distro's data really comes from.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { SOURCES } from "./sources";

const root = join(import.meta.dir, "..", "..");
const docPath = join(root, "docs", "data-sources.md");
const START = "<!-- sources:start -->";
const END = "<!-- sources:end -->";

const catalog = readdirSync(join(root, "src/content/distros"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => ({
    slug: f.replace(/\.yaml$/, ""),
    ...parse(readFileSync(join(root, "src/content/distros", f), "utf8")),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const json = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined);
const hostList = (urls: string[] = []) =>
  [...new Set(urls.map((u) => new URL(u).hostname))].join(", ");

const rows = catalog.map((d) => {
  const source = SOURCES.find((s) => s.slug === d.slug);
  const releases = json(join(root, "src/data/releases", `${d.slug}.json`));
  const mirrors = json(join(root, "src/data/mirrors", `${d.slug}.json`));
  const latest = releases?.releases?.[0]?.version ?? "—";
  return `| ${d.name} | ${d.download?.strategy ?? "—"} | ${source ? "✓" : "—"} | ${hostList(releases?.sources) || "—"} | ${latest} | ${mirrors ? `${mirrors.mirrors.length} (${hostList(mirrors.sources)})` : "—"} |`;
});

const table = [
  START,
  "",
  "| 배포판 | 다운로드 전략 | 동기화 모듈 | 릴리스 데이터 출처(호스트) | 현재 최신 | 미러 목록 |",
  "|---|---|---|---|---|---|",
  ...rows,
  "",
  `_${new Date().toISOString().slice(0, 10)} 기준, \`bun run sync:docs\`로 생성._`,
  "",
  END,
].join("\n");

const doc = readFileSync(docPath, "utf8");
const next = doc.includes(START)
  ? doc.replace(new RegExp(`${START}[\\s\\S]*?${END}`), table)
  : `${doc.trimEnd()}\n\n## 배포판별 데이터 출처\n\n${table}\n`;
writeFileSync(docPath, next);
console.log(`docs/data-sources.md: ${rows.length} distros`);
