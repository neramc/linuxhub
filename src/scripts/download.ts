/**
 * Progressive enhancement for the download wizard (src/components/DownloadWizard.astro).
 *
 * - Version/edition/arch/format selects cascade from the full release data,
 *   fetched from /data/releases/<slug>.json once the visitor points at or
 *   tabs into the wizard (or on the first change).
 * - For every distro with mirror data, the official mirrors are ranked from
 *   /api/geo (Vercel edge geolocation) with a timezone fallback, and the
 *   download link points at the chosen mirror + the file's relative path
 *   (the server's choice keeps its path in data-path, so this needs no
 *   release data). The nearest mirror is chosen, except where the official
 *   link is a redirector or SourceForge (it already picks a nearby server, so
 *   it stays chosen, ADR-0004). Without any location the official server
 *   stays chosen.
 * - The last choice per distro is remembered in localStorage.
 *
 * States (SPEC §14–16): the link never serves anything but the choice the
 * selects show. While a choice waits for the data the button has no link,
 * no file size and no checksum; a fetch that fails or takes 8 s puts the
 * selects back on the choice the link serves and says so, and is tried again
 * on the next change or [Try again] (a failed fetch is never kept). The
 * release data and the mirror list fail apart, each with its own row. Waits
 * the visitor caused are announced once in [data-wizard-status].
 */
import type { Artifact, Release } from "~/lib/data-schemas";
import { formatBytes } from "~/lib/format";
import { type GeoPoint, type MirrorPayload, type RankedMirror, rankMirrors } from "~/lib/mirrors";
import {
  type ChecksumLabels,
  checksumLabel,
  downloadLabel,
  featuredRelease,
  type VersionLabels,
  versionLabel,
} from "~/lib/releases";

interface Labels extends VersionLabels, ChecksumLabels {
  origin: string;
  /** The official link when it is a redirector: "자동으로 가까운 서버". */
  auto: string;
  recommended: string;
  recommendedFor: string;
  locating: string;
  distance: string;
  /** The download.button template, "{format} 받기". */
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
/** Nothing changes on screen for a wait shorter than this (SPEC §14). */
const SLOW_MS = 300;

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

/** JSON from `url`; rejects on an HTTP error and after `ms` (default 8 s). */
async function getJson<T>(url: string, ms = 8000, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

/** The visitor's location; `tz` when it comes from the browser's time zone. */
async function locate(): Promise<GeoPoint & { tz?: true }> {
  try {
    const geo = await getJson<GeoPoint>("/api/geo/", 3000, { cache: "no-store" });
    if (geo.cc || geo.lat !== null) return geo;
  } catch {
    /* offline, blocked, slow, or a non-Vercel preview */
  }
  // Fallback: the browser's time zone has an official location (IANA zone1970.tab).
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zones = (await import("~/data/geo/timezones.json")).default as Record<
      string,
      { cc: string; lat: number; lon: number }
    >;
    const zone = zones[tz];
    if (zone) return { cc: zone.cc, lat: zone.lat, lon: zone.lon, tz: true };
  } catch {
    /* ignore */
  }
  return { cc: null, lat: null, lon: null };
}

function option(value: string, label: string): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

function fill(
  select: HTMLSelectElement,
  items: [string, string][],
  wanted: string | undefined,
): string {
  const value = items.some(([v]) => v === wanted) ? (wanted as string) : (items[0]?.[0] ?? "");
  select.replaceChildren(...items.map(([v, label]) => option(v, label)));
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

  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const select = (name: string) => $<HTMLSelectElement>(`select[name="${name}"]`);
  const versionSel = select("version");
  const editionSel = select("edition");
  const archSel = select("arch");
  const formatSel = select("format");
  const mirrorSel = select("mirror");
  const formatRow = $("[data-format-row]");
  const download = $<HTMLAnchorElement>("[data-download]");
  const labelEl = $("[data-download-label]");
  const fileEl = $("[data-file]");
  const loadingEl = $("[data-loading]");
  const noFilesEl = $("[data-no-files]");
  const verify = $("[data-verify]");
  const checksumEl = $("[data-checksum]");
  const checksumName = $("[data-checksum-label]");
  const copyBtn = $("[data-copy-checksum]");
  const copyStatus = $("[data-copy-status]");
  const errorRow = $("[data-wizard-error]");
  const mirrorLabel = $("[data-mirror-label]");
  const links = {
    checksum: $<HTMLAnchorElement>("[data-checksum-url]"),
    signature: $<HTMLAnchorElement>("[data-signature-url]"),
    torrent: $<HTMLAnchorElement>("[data-torrent-url]"),
  };
  if (!versionSel || !editionSel || !archSel || !formatSel || !download) return;

  // What the server rendered: until the data has loaded, the only choice shown.
  const server = { url: download.getAttribute("href") ?? "", path: root.dataset.path ?? null };
  const serverLabel = labelEl?.textContent ?? "";
  const serverVerify = !verify?.hidden;
  // A live region outside the card, which is aria-busy while it waits.
  const live = root.parentElement?.querySelector("[data-wizard-status]");
  const say = (text = "") => {
    if (live) live.textContent = text.trim();
  };

  // Names of the mirror list's countries, rendered by the server: Intl.DisplayNames
  // here would load the region data on the main thread (a long task on slow phones).
  const countryNames = JSON.parse(root.dataset.countries ?? "{}") as Record<string, string>;
  const country = (cc: string | null) => (cc ? (countryNames[cc] ?? cc) : "");

  let releases: Release[] | null = null;
  let loading: Promise<Release[]> | null = null;
  let slow: number | undefined;
  /** The choice that failed to load and the select changed for it, for [Try again]. */
  let retry: { choice: Choice; select: HTMLSelectElement } | null = null;

  /** The full release data, fetched once; a failed fetch is forgotten. */
  const loadReleases = () =>
    (loading ??= getJson<Release[]>(root.dataset.releasesUrl as string).then(
      (data) => (releases = data),
      (error) => {
        loading = null;
        throw error;
      },
    ));

  function href(artifact: Pick<Artifact, "url" | "path">): string {
    const mirror = mirrorSel?.value;
    return mirror && artifact.path ? `${mirror}${artifact.path}` : artifact.url;
  }

  /** No link to follow (the reason is shown next to the button). */
  function disable() {
    download?.removeAttribute("href");
    download?.setAttribute("aria-disabled", "true");
    if (verify) verify.hidden = true;
    // No size of a file the button no longer offers.
    if (labelEl && formatSel?.value)
      labelEl.textContent = downloadLabel(labels.button, formatSel.value, null);
  }

  /**
   * While a choice waits for the data: no link, no checksum, the card busy;
   * after 300 ms the spinner and its sentence take the file line's place and
   * the sentence is announced.
   */
  function pending(on: boolean) {
    window.clearTimeout(slow);
    if (on) {
      root.setAttribute("aria-busy", "true");
      disable();
      slow = window.setTimeout(() => {
        if (fileEl) fileEl.hidden = true;
        if (loadingEl) loadingEl.hidden = false;
        say(loadingEl?.textContent ?? "");
      }, SLOW_MS);
    } else {
      root.removeAttribute("aria-busy");
      if (loadingEl) loadingEl.hidden = true;
      if (fileEl) fileEl.hidden = false;
      say();
    }
  }

  function render(artifact: Artifact | null) {
    if (fileEl) fileEl.hidden = !artifact;
    if (noFilesEl) noFilesEl.hidden = Boolean(artifact);
    if (!artifact || !download) {
      disable();
      return;
    }
    download.removeAttribute("aria-disabled");
    download.href = href(artifact);
    // The same label as the server renders: "ISO 받기 · 2.3 GB".
    if (labelEl)
      labelEl.textContent = downloadLabel(
        labels.button,
        artifact.format,
        formatBytes(artifact.size, locale),
      );
    if (fileEl) fileEl.textContent = artifact.file;
    const sum = artifact.checksum;
    if (verify) verify.hidden = !sum;
    if (sum && checksumEl) checksumEl.textContent = sum.value;
    if (sum && copyBtn) copyBtn.dataset.copy = sum.value;
    // A failed copy's note was about the previous checksum.
    if (copyStatus) copyStatus.textContent = "";
    if (sum && checksumName) checksumName.textContent = checksumLabel(sum, labels);
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
    const featured = featuredRelease({ releases });
    fill(
      versionSel,
      releases.map((r) => [r.version, versionLabel(r, featured, labels)]),
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

  const apply = (choice: Choice) => {
    versionSel.value = choice.version;
    editionSel.value = choice.edition;
    archSel.value = choice.arch;
    formatSel.value = choice.format;
  };

  async function onChange(changed: HTMLSelectElement) {
    if (errorRow) errorRow.hidden = true;
    if (!releases) pending(true);
    const wanted = snapshot();
    try {
      await loadReleases();
    } catch {
      pending(false);
      // The data never loaded, so nothing but the server's choice was ever
      // shown: the selects go back to it, and so does the link.
      retry = { choice: wanted, select: changed };
      apply(defaults);
      download?.setAttribute("href", href(server));
      download?.removeAttribute("aria-disabled");
      if (labelEl) labelEl.textContent = serverLabel;
      if (verify) verify.hidden = !serverVerify;
      if (errorRow) errorRow.hidden = false;
      return;
    }
    pending(false);
    cascade(snapshot());
    storageSet(storageKey, snapshot());
  }

  /**
   * Points the link at the chosen mirror: the loaded choice, or else the
   * server's (unless a choice is still loading: it reads the mirror itself).
   */
  function relink() {
    if (releases) cascade(snapshot());
    else if (download?.hasAttribute("href")) download.href = href(server);
  }

  for (const s of [versionSel, editionSel, archSel, formatSel])
    s.addEventListener("change", () => void onChange(s));

  // [Try again]: the choice that failed, from the select it was made in
  // (focus moves there before the row hides).
  $("[data-wizard-retry]")?.addEventListener("click", () => {
    if (!retry) return;
    apply(retry.choice);
    retry.select.focus();
    void onChange(retry.select);
  });

  // Intent prefetch: most changes then find the data already there.
  const prefetch = () => void loadReleases().catch(() => {});
  root.addEventListener("pointerover", prefetch, { once: true });
  root.addEventListener("focusin", prefetch, { once: true });

  // Restore a previous choice (only when it differs from the server default).
  const saved = storageGet(storageKey);
  if (
    saved &&
    (saved.version !== defaults.version ||
      saved.edition !== defaults.edition ||
      saved.arch !== defaults.arch ||
      saved.format !== defaults.format)
  ) {
    void loadReleases().then(
      () => cascade(saved),
      () => {
        /* the server default stays */
      },
    );
  }

  // Nearest-mirror suggestion.
  const mirrorsUrl = root.dataset.mirrors;
  const mirrorRow = mirrorSel?.closest("li");
  const spinner = $("[data-mirror-spinner]");
  const geoNote = $("[data-geo-fallback]");
  const mirrorError = $("[data-mirror-error]");
  // A redirector (or SourceForge) already sends visitors to a nearby server.
  const auto = root.dataset.strategy === "redirector" || root.dataset.strategy === "sourceforge";
  const official = auto ? labels.auto : labels.origin;
  if (mirrorsUrl && mirrorSel && mirrorLabel) {
    // Korean and English both group thousands with a comma; toLocaleString would
    // set up ICU number data on the main thread for this one label.
    const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const describe = (m: RankedMirror) => {
      const name = m.n ?? new URL(m.u).hostname;
      return m.km === null ? name : `${name} · ${labels.distance.replace("{km}", grouped(m.km))}`;
    };
    /** `retried`: the visitor asked, so the wait and a failure are announced. */
    const run = async (retried = false) => {
      say();
      const wait = window.setTimeout(() => {
        mirrorRow?.setAttribute("aria-busy", "true");
        if (spinner) spinner.hidden = false;
        mirrorLabel.textContent = labels.locating;
        if (retried) say(labels.locating);
      }, SLOW_MS);
      try {
        // Not tied to the release data: either can fail without the other.
        const [payload, geo] = await Promise.all([getJson<MirrorPayload>(mirrorsUrl), locate()]);
        const mirrors = rankMirrors(payload, geo).slice(0, MAX_MIRRORS);
        // The official server first, then one group per country in ranking
        // order (mirrors without a country stand alone).
        const items: HTMLElement[] = [option("", official)];
        const groups = new Map<string, HTMLOptGroupElement>();
        for (const m of mirrors) {
          const o = option(m.u, describe(m));
          if (!m.c) {
            items.push(o);
            continue;
          }
          let group = groups.get(m.c);
          if (!group) {
            group = document.createElement("optgroup");
            group.label = country(m.c);
            groups.set(m.c, group);
            items.push(group);
          }
          group.append(o);
        }
        mirrorSel.replaceChildren(...items);
        const remembered =
          saved?.mirror && mirrors.some((m) => m.u === saved.mirror) ? saved.mirror : undefined;
        // The top-ranked official mirror (nearest with a location, otherwise
        // the project's own quality order), as before the redesign; a
        // redirector stays chosen unless the visitor picked a mirror before.
        const best = auto ? undefined : mirrors[0];
        mirrorSel.value = remembered ?? best?.u ?? "";
        relink();
        mirrorSel.hidden = false;
        // Named only when the mirror list has the visitor's country.
        const place = geo.cc ? countryNames[geo.cc] : undefined;
        mirrorLabel.textContent = !mirrorSel.value
          ? official
          : best && place
            ? labels.recommendedFor.replace("{place}", place)
            : labels.recommended;
        if (geoNote) geoNote.hidden = !geo.tz;
        if (mirrorError?.contains(document.activeElement)) mirrorSel.focus();
        if (mirrorError) mirrorError.hidden = true;
        say();
      } catch {
        // The link keeps the official server, and the label says so. After
        // [Try again] the row is already shown, so its status is said here.
        mirrorLabel.textContent = official;
        if (retried) say(mirrorError?.querySelector("[role=status]")?.textContent ?? "");
        if (mirrorError) mirrorError.hidden = false;
      } finally {
        window.clearTimeout(wait);
        mirrorRow?.removeAttribute("aria-busy");
        if (spinner) spinner.hidden = true;
      }
    };
    mirrorSel.addEventListener("change", () => {
      // While a choice loads, it picks up the mirror when its data arrives.
      if (!releases && !download.hasAttribute("href")) return;
      relink();
      storageSet(storageKey, snapshot());
    });
    $("[data-mirror-retry]")?.addEventListener("click", () => void run(true));
    const start = () => void run();
    if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 2000 });
    else setTimeout(start, SLOW_MS);
  }
}

for (const root of document.querySelectorAll<HTMLElement>("[data-wizard]")) init(root);
