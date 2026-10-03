/**
 * Progressive enhancement for the download wizard (src/components/DownloadWizard.astro).
 *
 * - Version/edition/arch/format selects cascade from the full release data,
 *   fetched once from /data/releases/<slug>.json on first interaction.
 * - For distros with an official mirror list, the nearest mirrors are ranked
 *   from /api/geo (Vercel edge geolocation) with a timezone fallback, and the
 *   download link points at the chosen mirror + the file's relative path.
 * - The last choice per distro is remembered in localStorage.
 */
import type { Artifact, Release } from "~/lib/data-schemas";
import { type GeoPoint, type MirrorPayload, type RankedMirror, rankMirrors } from "~/lib/mirrors";

interface Labels {
  latest: string;
  lts: string;
  channel: Record<Release["channel"], string>;
  checksum: string;
  checksumMd5: string;
  checksumOther: string;
  auto: string;
  recommended: string;
  recommendedFor: string;
  locating: string;
  distance: string;
  noFiles: string;
  button: string;
}

interface Choice {
  version: string;
  edition: string;
  arch: string;
  format: string;
  mirror?: string;
}

const MAX_MIRRORS = 12;

function storageGet(key: string): Choice | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Choice) : null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: Choice) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

async function locate(): Promise<GeoPoint> {
  try {
    const res = await fetch("/api/geo", { cache: "no-store" });
    if (res.ok) {
      const geo = (await res.json()) as GeoPoint;
      if (geo.cc || geo.lat !== null) return geo;
    }
  } catch {
    /* offline, blocked, or a non-Vercel preview */
  }
  // Fallback: the browser's time zone has an official location (IANA zone1970.tab).
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zones = (await import("~/data/geo/timezones.json")).default as Record<
      string,
      { cc: string; lat: number; lon: number }
    >;
    const zone = zones[tz];
    if (zone) return { cc: zone.cc, lat: zone.lat, lon: zone.lon };
  } catch {
    /* ignore */
  }
  return { cc: null, lat: null, lon: null };
}

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  o.selected = selected;
  return o;
}

function fill(
  select: HTMLSelectElement,
  items: [string, string][],
  wanted: string | undefined,
): string {
  const value = items.some(([v]) => v === wanted) ? (wanted as string) : (items[0]?.[0] ?? "");
  select.replaceChildren(...items.map(([v, label]) => option(v, label, v === value)));
  select.value = value;
  return value;
}

function init(root: HTMLElement) {
  const slug = root.dataset.slug as string;
  const locale = root.dataset.locale ?? "ko";
  const labels = JSON.parse(root.dataset.labels ?? "{}") as Labels;
  const archLabels = JSON.parse(root.dataset.arches ?? "{}") as Record<string, string>;
  const defaults = JSON.parse(root.dataset.default ?? "{}") as Choice;
  const storageKey = `lh-dl-${slug}`;

  const select = (name: string) => root.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
  const versionSel = select("version");
  const editionSel = select("edition");
  const archSel = select("arch");
  const formatSel = select("format");
  const mirrorSel = select("mirror");
  const formatRow = root.querySelector<HTMLElement>("[data-format-row]");
  const download = root.querySelector<HTMLAnchorElement>("[data-download]");
  const sizeEl = root.querySelector<HTMLElement>("[data-size]");
  const fileEl = root.querySelector<HTMLElement>("[data-file]");
  const verify = root.querySelector<HTMLElement>("[data-verify]");
  const checksumEl = root.querySelector<HTMLElement>("[data-checksum]");
  const checksumLabel = root.querySelector<HTMLElement>("[data-checksum-label]");
  const copyBtn = root.querySelector<HTMLElement>("[data-copy-checksum]");
  const mirrorLabel = root.querySelector<HTMLElement>("[data-mirror-label]");
  const links = {
    checksum: root.querySelector<HTMLAnchorElement>("[data-checksum-url]"),
    signature: root.querySelector<HTMLAnchorElement>("[data-signature-url]"),
    torrent: root.querySelector<HTMLAnchorElement>("[data-torrent-url]"),
  };
  if (!versionSel || !editionSel || !archSel || !formatSel || !download) return;

  const bytes = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const formatSize = (n: number | null) => {
    if (!n) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = n;
    let u = 0;
    while (v >= 1000 && u < units.length - 1) {
      v /= 1000;
      u++;
    }
    return ` · ${bytes.format(v)} ${units[u]}`;
  };
  const regionNames = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  })();
  const country = (cc: string | null) => (cc ? (regionNames?.of(cc) ?? cc) : "");

  let releases: Release[] | null = null;
  let loading: Promise<Release[]> | null = null;
  let mirrors: RankedMirror[] = [];
  let current: Artifact | null = null;

  const loadReleases = () => {
    loading ??= fetch(root.dataset.releasesUrl as string)
      .then((r) => r.json() as Promise<Release[]>)
      .then((data) => {
        releases = data;
        return data;
      });
    return loading;
  };

  const versionLabel = (r: Release, i: number) => {
    const tags: string[] = [];
    if (i === 0 && r.channel !== "beta" && r.channel !== "testing") tags.push(labels.latest);
    if (r.channel === "beta" || r.channel === "testing") tags.push(labels.channel[r.channel]);
    if (r.channel === "lts") tags.push(labels.lts);
    const base = r.codename ? `${r.version} “${r.codename}”` : r.version;
    return tags.length ? `${base} (${tags.join(", ")})` : base;
  };

  function href(artifact: Artifact): string {
    const mirror = mirrorSel?.value;
    return mirror && artifact.path ? `${mirror}${artifact.path}` : artifact.url;
  }

  function render(artifact: Artifact | null) {
    current = artifact;
    if (!artifact || !download) {
      download?.setAttribute("aria-disabled", "true");
      if (fileEl) fileEl.textContent = labels.noFiles;
      return;
    }
    download.removeAttribute("aria-disabled");
    download.href = href(artifact);
    if (sizeEl) sizeEl.textContent = formatSize(artifact.size);
    if (fileEl) fileEl.textContent = artifact.file;
    const sum = artifact.checksum;
    if (verify) verify.hidden = !sum;
    if (sum && checksumEl) checksumEl.textContent = sum.value;
    if (sum && copyBtn) copyBtn.dataset.copy = sum.value;
    if (sum && checksumLabel) {
      checksumLabel.textContent =
        sum.type === "sha256"
          ? labels.checksum
          : sum.type === "md5"
            ? labels.checksumMd5
            : `${sum.type.toUpperCase()} ${labels.checksumOther}`;
    }
    for (const [key, url] of [
      ["checksum", sum?.url],
      ["signature", artifact.signatureUrl],
      ["torrent", artifact.torrentUrl],
    ] as const) {
      const a = links[key];
      if (!a) continue;
      a.hidden = !url;
      if (url) a.href = url;
    }
  }

  /** Rebuild dependent selects from the full data, keeping compatible choices. */
  function cascade(wanted: Partial<Choice>) {
    if (!releases || !versionSel || !editionSel || !archSel || !formatSel) return;
    fill(
      versionSel,
      releases.map((r, i) => [r.version, versionLabel(r, i)]),
      wanted.version,
    );
    const release = releases.find((r) => r.version === versionSel.value);
    const editionId = fill(
      editionSel,
      (release?.editions ?? []).map((e) => [e.id, e.name]),
      wanted.edition,
    );
    const edition = release?.editions.find((e) => e.id === editionId);
    const arches = [...new Set(edition?.artifacts.map((a) => a.arch) ?? [])];
    const arch = fill(
      archSel,
      arches.map((a) => [a, archLabels[a] ?? a]),
      wanted.arch,
    );
    const formats = [
      ...new Set(edition?.artifacts.filter((a) => a.arch === arch).map((a) => a.format) ?? []),
    ];
    const format = fill(
      formatSel,
      formats.map((f) => [f, `.${f}`]),
      wanted.format,
    );
    if (formatRow) formatRow.hidden = formats.length < 2;
    render(edition?.artifacts.find((a) => a.arch === arch && a.format === format) ?? null);
  }

  const snapshot = (): Choice => ({
    version: versionSel.value,
    edition: editionSel.value,
    arch: archSel.value,
    format: formatSel.value,
    ...(mirrorSel?.value ? { mirror: mirrorSel.value } : {}),
  });

  async function onChange() {
    await loadReleases();
    cascade(snapshot());
    storageSet(storageKey, snapshot());
  }

  for (const s of [versionSel, editionSel, archSel, formatSel])
    s.addEventListener("change", () => void onChange());

  // Restore a previous choice (only when it differs from the server default).
  const saved = storageGet(storageKey);
  if (
    saved &&
    (saved.version !== defaults.version ||
      saved.edition !== defaults.edition ||
      saved.arch !== defaults.arch ||
      saved.format !== defaults.format)
  ) {
    void loadReleases().then(() => cascade(saved));
  }

  // Nearest-mirror suggestion.
  const mirrorsUrl = root.dataset.mirrors;
  if (mirrorsUrl && mirrorSel && mirrorLabel) {
    const run = async () => {
      const [payload, geo] = await Promise.all([
        fetch(mirrorsUrl).then((r) => r.json() as Promise<MirrorPayload>),
        locate(),
      ]);
      mirrors = rankMirrors(payload, geo).slice(0, MAX_MIRRORS);
      const describe = (m: RankedMirror) =>
        [
          m.n ?? new URL(m.u).hostname,
          country(m.c),
          m.km !== null ? labels.distance.replace("{km}", m.km.toLocaleString(locale)) : "",
        ]
          .filter(Boolean)
          .join(" · ");
      mirrorSel.replaceChildren(
        option("", labels.auto, false),
        ...mirrors.map((m, i) => option(m.u, `${i === 0 ? "★ " : ""}${describe(m)}`, false)),
      );
      const remembered =
        saved?.mirror && mirrors.some((m) => m.u === saved.mirror) ? saved.mirror : undefined;
      const best = mirrors[0];
      mirrorSel.value = remembered ?? best?.u ?? "";
      mirrorSel.hidden = false;
      const place = country(geo.cc);
      mirrorLabel.textContent =
        best && place ? labels.recommendedFor.replace("{place}", place) : labels.recommended;
      if (current) render(current);
    };
    mirrorSel.addEventListener("change", () => {
      if (current) render(current);
      storageSet(storageKey, snapshot());
    });
    const start = () =>
      void run().catch(() => {
        mirrorLabel.textContent = labels.auto;
      });
    if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 2000 });
    else setTimeout(start, 300);
  }
}

for (const root of document.querySelectorAll<HTMLElement>("[data-wizard]")) init(root);
