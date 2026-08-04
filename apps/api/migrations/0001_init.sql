-- 0001_init — core catalog tables (.ai/database.md § "D1 schema").
--
-- Conventions that hold across every migration here:
--   * all timestamps are ISO-8601 UTC strings (TEXT);
--   * natural keys where stable (distros.slug), integer PKs elsewhere;
--   * CHECK constraints spell out the closed enums, so an ingest bug fails at
--     the write instead of surfacing as an impossible value on a page;
--   * source_url + fetched_at travel with every ingested row — the binding
--     provenance rule in .ai/data-sources.md is per value, not per run
--     (ingest_log in 0004 records the run).

CREATE TABLE distros (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  -- Empty until the Wikidata lineage step; never hand-typed.
  family        TEXT NOT NULL DEFAULT '',
  based_on      TEXT,                            -- parent slug, NULL for roots
  homepage      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'discontinued')),
  logo_path     TEXT NOT NULL,                   -- assets/distros/<slug>.svg
  aliases       TEXT NOT NULL DEFAULT '[]',      -- JSON array, for search
  source_url    TEXT,
  fetched_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE releases (
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  version       TEXT NOT NULL,
  -- 'eol' is NOT a channel: it is derived from eol_at < today at read time,
  -- so a row never goes quietly stale. 'lts' is a flag, because upstream
  -- (endoflife.date) reports it as one — a cycle is stable *and* LTS.
  channel       TEXT NOT NULL DEFAULT 'stable'
                CHECK (channel IN ('stable', 'beta', 'rolling')),
  lts           INTEGER NOT NULL DEFAULT 0 CHECK (lts IN (0, 1)),
  codename      TEXT,
  latest_point  TEXT,                            -- newest point release, e.g. 24.04.3
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
  name          TEXT NOT NULL,                   -- GNOME|KDE|Xfce|minimal|server|…
  desktop       TEXT,                            -- desktop env slug, NULL for server/minimal
  kind          TEXT NOT NULL DEFAULT 'desktop'
                CHECK (kind IN ('desktop', 'server', 'minimal', 'other')),
  UNIQUE (release_id, name)
);

CREATE TABLE artifacts (
  id            INTEGER PRIMARY KEY,
  edition_id    INTEGER NOT NULL REFERENCES editions(id),
  arch          TEXT NOT NULL,                   -- x86_64|aarch64|riscv64|…
  format        TEXT NOT NULL
                CHECK (format IN ('iso', 'torrent', 'magnet', 'checksum', 'signature')),
  path          TEXT NOT NULL,                   -- mirror-relative path
  size          INTEGER,
  sha256        TEXT,
  sig_url       TEXT,
  source_url    TEXT,
  fetched_at    TEXT,
  UNIQUE (edition_id, arch, format)
);

CREATE TABLE mirrors (
  id            INTEGER PRIMARY KEY,
  -- Mirror networks are per distro: archlinux.org's mirrors are not Fedora's,
  -- and a mirror exists before any artifact is known to sit on it.
  distro_id     INTEGER REFERENCES distros(id),
  name          TEXT NOT NULL DEFAULT '',        -- hostname, for display
  country       TEXT NOT NULL DEFAULT '',        -- ISO 3166-1 alpha-2, '' when unpublished
  region        TEXT NOT NULL DEFAULT '',        -- continent/region code
  base_url      TEXT NOT NULL,
  protocol      TEXT NOT NULL DEFAULT 'https'
                CHECK (protocol IN ('https', 'http', 'ftp', 'rsync')),
  sponsor       TEXT,
  healthy       INTEGER NOT NULL DEFAULT 1 CHECK (healthy IN (0, 1)),
  last_checked  TEXT,
  source_url    TEXT,
  fetched_at    TEXT,
  UNIQUE (distro_id, base_url)
);

CREATE TABLE artifact_mirrors (                  -- availability of artifact on mirror
  artifact_id   INTEGER NOT NULL REFERENCES artifacts(id),
  mirror_id     INTEGER NOT NULL REFERENCES mirrors(id),
  path_override TEXT,
  available     INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  PRIMARY KEY (artifact_id, mirror_id)
);
