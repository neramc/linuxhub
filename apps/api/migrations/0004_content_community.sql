-- 0004_content_community — the MDX registry, community submissions, and the
-- ingest audit trail (.ai/database.md § "D1 schema").

CREATE TABLE content_index (                     -- registry of MDX docs in /content
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  doc           TEXT NOT NULL CHECK (doc IN ('description', 'install', 'usage')),
  locale        TEXT NOT NULL,                   -- BCP-47
  source_urls   TEXT NOT NULL DEFAULT '[]',      -- JSON array, from frontmatter
  reviewed_at   TEXT,
  UNIQUE (distro_id, doc, locale)
);

CREATE TABLE submissions (                       -- anonymous community writes
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL
                CHECK (kind IN ('suggest', 'report', 'feedback', 'mirror_status')),
  payload       TEXT NOT NULL,                   -- opaque JSON, rendered escaped
  created_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'reviewed', 'done', 'spam'))
);

-- One row per source per run: what was fetched, when, and whether it changed
-- anything. Per-value provenance lives on the ingested rows themselves.
CREATE TABLE ingest_log (
  id            INTEGER PRIMARY KEY,
  source        TEXT NOT NULL,
  url           TEXT NOT NULL,
  fetched_at    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  changed       INTEGER NOT NULL DEFAULT 0,
  detail        TEXT
);
