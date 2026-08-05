# Database — Cloudflare D1 (SQLite) + KV

## Principles

- D1 is the **source of truth**; KV is cache + counters only (rebuildable).
- Migrations via Wrangler (`apps/api/migrations/NNNN_name.sql`), sequential,
  forward-only; every schema change = new migration + this doc updated in the
  same commit.
- Natural keys where stable (`distros.slug`); integer PKs elsewhere.
- All timestamps are ISO-8601 UTC strings (`TEXT`).
- **Provenance is per value, not per run.** Every table fed by ingestion carries
  `source_url` + `fetched_at`, so any single row can answer "where did this come
  from and when". `ingest_log` records the *run*; it cannot answer that question
  for a row. This is what makes the binding sourcing rule in
  `.ai/data-sources.md` enforceable rather than aspirational.
- **Derived states are never stored.** `eol` is computed from `eol_at < today`
  at read time, so no row silently goes stale as dates pass. See ADR-0019.
- Closed enums carry `CHECK` constraints, so an ingest bug fails at the write
  instead of surfacing as an impossible value on a page.

## D1 schema

Below is the schema as shipped. It is the authority; the migration files in
`apps/api/migrations/` implement it verbatim.

```sql
-- 0001_init.sql
CREATE TABLE distros (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  family        TEXT NOT NULL DEFAULT '',   -- debian|arch|rpm|suse|…; '' until Wikidata fills it
  based_on      TEXT,                       -- parent slug, NULL for roots
  homepage      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','discontinued')),
  logo_path     TEXT NOT NULL,              -- assets/distros/<slug>.svg
  aliases       TEXT NOT NULL DEFAULT '[]', -- JSON array, for search
  source_url    TEXT,
  fetched_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE releases (
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  version       TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'stable'
                CHECK (channel IN ('stable','beta','rolling')),
  lts           INTEGER NOT NULL DEFAULT 0 CHECK (lts IN (0,1)),
  codename      TEXT,
  latest_point  TEXT,                       -- newest point release, e.g. 24.04.3
  released_at   TEXT,
  eol_at        TEXT,
  notes_url     TEXT,
  source_url    TEXT,
  fetched_at    TEXT,
  UNIQUE (distro_id, version)
);

CREATE TABLE editions (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES releases(id),
  name          TEXT NOT NULL,              -- GNOME|KDE|Xfce|minimal|server|…
  desktop       TEXT,                       -- desktop env slug, NULL for server/minimal
  kind          TEXT NOT NULL DEFAULT 'desktop'
                CHECK (kind IN ('desktop','server','minimal','other')),
  UNIQUE (release_id, name)
);

CREATE TABLE artifacts (
  id            INTEGER PRIMARY KEY,
  edition_id    INTEGER NOT NULL REFERENCES editions(id),
  arch          TEXT NOT NULL,              -- x86_64|aarch64|riscv64|…
  format        TEXT NOT NULL
                CHECK (format IN ('iso','torrent','magnet','checksum','signature')),
  path          TEXT NOT NULL,              -- mirror-relative path
  size          INTEGER,
  sha256        TEXT,
  sig_url       TEXT,
  source_url    TEXT,
  fetched_at    TEXT,
  UNIQUE (edition_id, arch, format)
);

CREATE TABLE mirrors (
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER REFERENCES distros(id),  -- mirror networks are per distro
  name          TEXT NOT NULL DEFAULT '',   -- hostname, for display
  country       TEXT NOT NULL DEFAULT '',   -- ISO 3166-1 alpha-2, '' when unpublished
  region        TEXT NOT NULL DEFAULT '',   -- continent/region code
  base_url      TEXT NOT NULL,
  protocol      TEXT NOT NULL DEFAULT 'https'
                CHECK (protocol IN ('https','http','ftp','rsync')),
  sponsor       TEXT,
  healthy       INTEGER NOT NULL DEFAULT 1 CHECK (healthy IN (0,1)),
  -- Is base_url a root that `artifacts.path` extends? Not every mirror row is:
  -- see the note below. Defaults to 0, so a mirror is not an artifact base
  -- until a source says it is (migration 0006).
  serves_artifacts INTEGER NOT NULL DEFAULT 0 CHECK (serves_artifacts IN (0,1)),
  last_checked  TEXT,
  source_url    TEXT,
  fetched_at    TEXT,
  UNIQUE (distro_id, base_url)
);

CREATE TABLE artifact_mirrors (            -- availability of artifact on mirror
  artifact_id   INTEGER NOT NULL REFERENCES artifacts(id),
  mirror_id     INTEGER NOT NULL REFERENCES mirrors(id),
  path_override TEXT,
  available     INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  PRIMARY KEY (artifact_id, mirror_id)
);

-- 0002_taxonomy.sql
CREATE TABLE categories ( id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
                          name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '' );
CREATE TABLE tags       ( id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
                          name TEXT NOT NULL );
CREATE TABLE distro_taxonomy (
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  kind          TEXT NOT NULL CHECK (kind IN ('category','tag','desktop')),
  ref_slug      TEXT NOT NULL,
  PRIMARY KEY (distro_id, kind, ref_slug)
);

-- 0003_rankings_stats.sql
-- Fed by OUR OWN signals only (.ai/data-sources.md § "Ranking signals"), so
-- these tables stay empty until the site has traffic. That is correct, not a
-- gap to fill by hand.
CREATE TABLE rankings (                    -- weekly snapshots
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  period        TEXT NOT NULL CHECK (period IN ('week','month','year','all')),
  snapshot_at   TEXT NOT NULL,
  rank          INTEGER NOT NULL,
  score         REAL NOT NULL,
  UNIQUE (distro_id, period, snapshot_at)
);

CREATE TABLE download_events (             -- flushed KV counters, aggregated
  id            INTEGER PRIMARY KEY,
  artifact_id   INTEGER NOT NULL REFERENCES artifacts(id),
  mirror_id     INTEGER NOT NULL DEFAULT 0,  -- 0 = unattributed; see note below
  day           TEXT NOT NULL,             -- YYYY-MM-DD
  count         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (artifact_id, mirror_id, day)
);

CREATE TABLE hall_of_fame (
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id) UNIQUE,
  rationale     TEXT NOT NULL,             -- editorial, with citations
  sources       TEXT NOT NULL DEFAULT '[]',
  ordering      INTEGER NOT NULL DEFAULT 0
);

-- 0004_content_community.sql
CREATE TABLE content_index (               -- registry of MDX docs in /content
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  doc           TEXT NOT NULL CHECK (doc IN ('description','install','usage')),
  locale        TEXT NOT NULL,             -- BCP-47
  source_urls   TEXT NOT NULL DEFAULT '[]',
  reviewed_at   TEXT,
  UNIQUE (distro_id, doc, locale)
);

CREATE TABLE submissions (                 -- anonymous community writes
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL
                CHECK (kind IN ('suggest','report','feedback','mirror_status')),
  payload       TEXT NOT NULL,             -- JSON
  created_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','reviewed','done','spam'))
);

CREATE TABLE ingest_log (
  id            INTEGER PRIMARY KEY,
  source        TEXT NOT NULL,
  url           TEXT NOT NULL,
  fetched_at    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('ok','error','skipped')),
  changed       INTEGER NOT NULL DEFAULT 0,
  detail        TEXT
);
```

`download_events.mirror_id` is `NOT NULL DEFAULT 0` rather than a nullable FK:
SQLite treats every `NULL` as distinct in a `UNIQUE` constraint, so a nullable
column would let the daily counter flush insert duplicate rows instead of
accumulating into one.

`mirrors.serves_artifacts` exists because "a mirror of this distro" and "a base
URL our artifact paths are relative to" are two different facts, and treating
them as one produced download URLs that 404. Arch's mirror status JSON
publishes mirror **roots** (`https://host/archlinux/`), which a path like
`iso/2026.08.01/…iso` extends. Fedora's MirrorManager publishes per-repo
**directories** (`https://host/fedora/linux/releases/44/Everything/x86_64/os/`),
which nothing extends — Fedora artifact paths are relative to the redirector,
`https://download.fedoraproject.org/`, which is stored as a mirror row of its
own. Only rows with `serves_artifacts = 1` are joined to artifacts or offered
in the picker (ADR-0024).

Retiring a mirror is likewise scoped to `source_url`: a distro can have mirrors
from more than one source, and "absent from the mirrorlist" says nothing about
a row the mirrorlist never wrote.

### Indexes (0005)

```sql
CREATE INDEX idx_releases_distro   ON releases(distro_id, released_at DESC);
CREATE INDEX idx_editions_release  ON editions(release_id);
CREATE INDEX idx_artifacts_edition ON artifacts(edition_id);
CREATE INDEX idx_mirrors_distro    ON mirrors(distro_id, healthy);
CREATE INDEX idx_mirrors_country   ON mirrors(country, healthy);
CREATE INDEX idx_taxonomy_ref      ON distro_taxonomy(kind, ref_slug);
CREATE INDEX idx_rankings_period   ON rankings(period, snapshot_at DESC, rank);
CREATE INDEX idx_dl_events_day     ON download_events(day);
CREATE INDEX idx_distros_family    ON distros(family, status);
```

Search: start with `LIKE` over `name || aliases || summary`; if too slow,
adopt D1 FTS5 virtual table (`distros_fts`) — record as ADR when done.

## KV keyspaces

| Namespace | Key pattern | Value | TTL |
|---|---|---|---|
| `KV_CACHE` | `cache:distros:<gen>:<query-hash>` | list JSON | 5 min |
| `KV_CACHE` | `cache:distro:<slug>:<gen>` | detail JSON | 1 h |
| `KV_CACHE` | `dl:<params-hash>` | DownloadResolution | 24 h |
| `KV_CACHE` | `versions:<source>:<slug>` | upstream fetch cache | 1–6 h per source |
| `KV_CACHE` | `gen:<slug>` | generation counter (bumped by ingest) | none |
| `KV_CACHE` | `rankings:<period>` | ranking snapshot JSON | 10 min |
| `KV_GEO` | `geo:<country>` | locale code | 30 d |
| `KV_RATE` | `rl:<scope>:<ip-hash>:<window>` | counter | window length (60 s) |
| `KV_RATE` | `dlcount:<artifact>:<mirror>:<day>` | click counter | 48 h (flushed daily to D1) |

Rule: anything in KV must be rebuildable from D1 or upstream; losing KV must
never lose data (download counters are flushed to `download_events` daily by
cron before expiry).
