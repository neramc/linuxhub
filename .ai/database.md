# Database — Cloudflare D1 (SQLite) + KV

## Principles

- D1 is the **source of truth**; KV is cache + counters only (rebuildable).
- Migrations via Wrangler (`apps/api/migrations/NNNN_name.sql`), sequential,
  forward-only; every schema change = new migration + this doc updated in the
  same commit.
- Natural keys where stable (`distros.slug`); integer PKs elsewhere.
- All timestamps are ISO-8601 UTC strings (`TEXT`).

## D1 schema

```sql
-- 0001_core.sql
CREATE TABLE distros (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  family        TEXT NOT NULL,              -- debian|arch|rpm|suse|gentoo|slackware|independent|…
  based_on      TEXT,                       -- parent slug, NULL for roots
  homepage      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',  -- active|discontinued
  logo_path     TEXT NOT NULL,              -- assets/distros/<slug>.svg
  aliases       TEXT NOT NULL DEFAULT '[]', -- JSON array, for search
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE releases (
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  version       TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'stable',  -- stable|lts|beta|rolling
  released_at   TEXT,
  eol_at        TEXT,
  notes_url     TEXT,
  UNIQUE (distro_id, version)
);

CREATE TABLE editions (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES releases(id),
  name          TEXT NOT NULL,              -- GNOME|KDE|Xfce|minimal|server|…
  desktop       TEXT,                       -- desktop env slug, NULL for server/minimal
  kind          TEXT NOT NULL DEFAULT 'desktop',  -- desktop|server|minimal|other
  UNIQUE (release_id, name)
);

CREATE TABLE artifacts (
  id            INTEGER PRIMARY KEY,
  edition_id    INTEGER NOT NULL REFERENCES editions(id),
  arch          TEXT NOT NULL,              -- x86_64|aarch64|riscv64|…
  format        TEXT NOT NULL,              -- iso|torrent|magnet|checksum|signature
  path          TEXT NOT NULL,              -- mirror-relative path
  size          INTEGER,
  sha256        TEXT,
  sig_url       TEXT,
  UNIQUE (edition_id, arch, format)
);

CREATE TABLE mirrors (
  id            INTEGER PRIMARY KEY,
  country       TEXT NOT NULL,              -- ISO 3166-1 alpha-2
  region        TEXT NOT NULL,              -- continent/region code
  base_url      TEXT NOT NULL UNIQUE,
  protocol      TEXT NOT NULL DEFAULT 'https',
  sponsor       TEXT,
  healthy       INTEGER NOT NULL DEFAULT 1,
  last_checked  TEXT
);

CREATE TABLE artifact_mirrors (            -- availability of artifact on mirror
  artifact_id   INTEGER NOT NULL REFERENCES artifacts(id),
  mirror_id     INTEGER NOT NULL REFERENCES mirrors(id),
  path_override TEXT,
  available     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (artifact_id, mirror_id)
);

-- 0002_taxonomy.sql
CREATE TABLE categories ( id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
                          name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '' );
CREATE TABLE tags       ( id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
                          name TEXT NOT NULL );
CREATE TABLE distro_taxonomy (
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  kind          TEXT NOT NULL,              -- category|tag|desktop
  ref_slug      TEXT NOT NULL,
  PRIMARY KEY (distro_id, kind, ref_slug)
);

-- 0003_rankings_stats.sql
CREATE TABLE rankings (                    -- weekly snapshots
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  period        TEXT NOT NULL,             -- week|month|year|all
  snapshot_at   TEXT NOT NULL,
  rank          INTEGER NOT NULL,
  score         REAL NOT NULL,
  UNIQUE (distro_id, period, snapshot_at)
);

CREATE TABLE download_events (             -- flushed KV counters, aggregated
  id            INTEGER PRIMARY KEY,
  artifact_id   INTEGER NOT NULL REFERENCES artifacts(id),
  mirror_id     INTEGER REFERENCES mirrors(id),
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
  doc           TEXT NOT NULL,             -- description|install|usage
  locale        TEXT NOT NULL,             -- BCP-47
  source_urls   TEXT NOT NULL DEFAULT '[]',
  reviewed_at   TEXT,
  UNIQUE (distro_id, doc, locale)
);

CREATE TABLE submissions (                 -- anonymous community writes
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL,             -- suggest|report|feedback|mirror_status
  payload       TEXT NOT NULL,             -- JSON
  created_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new'  -- new|reviewed|done|spam
);

CREATE TABLE ingest_log (
  id            INTEGER PRIMARY KEY,
  source        TEXT NOT NULL,
  url           TEXT NOT NULL,
  fetched_at    TEXT NOT NULL,
  status        TEXT NOT NULL,             -- ok|error|skipped
  changed       INTEGER NOT NULL DEFAULT 0,
  detail        TEXT
);
```

### Indexes (0005)

```sql
CREATE INDEX idx_releases_distro   ON releases(distro_id, released_at DESC);
CREATE INDEX idx_editions_release  ON editions(release_id);
CREATE INDEX idx_artifacts_edition ON artifacts(edition_id);
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
