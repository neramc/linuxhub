-- 0003_rankings_stats — popularity snapshots, aggregated download counters,
-- and the Hall of Fame (.ai/database.md § "D1 schema").
--
-- Everything here is fed by OUR OWN signals only: download clicks and views
-- counted in KV and flushed into download_events, then scored into rankings by
-- the weekly cron. Third-party popularity charts are a forbidden source
-- (.ai/data-sources.md § "Ranking signals"), so these tables stay empty until
-- the site has traffic — which is correct, not a gap to fill by hand.

CREATE TABLE rankings (                          -- periodic snapshots
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  period        TEXT NOT NULL CHECK (period IN ('week', 'month', 'year', 'all')),
  snapshot_at   TEXT NOT NULL,
  rank          INTEGER NOT NULL,
  score         REAL NOT NULL,
  UNIQUE (distro_id, period, snapshot_at)
);

CREATE TABLE download_events (                   -- flushed KV counters, aggregated
  id            INTEGER PRIMARY KEY,
  artifact_id   INTEGER NOT NULL REFERENCES artifacts(id),
  -- 0 means "mirror not attributed". A nullable column cannot carry the UNIQUE
  -- below, because SQLite treats every NULL as distinct and the daily flush
  -- would insert duplicates instead of accumulating.
  mirror_id     INTEGER NOT NULL DEFAULT 0,
  day           TEXT NOT NULL,                   -- YYYY-MM-DD
  count         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (artifact_id, mirror_id, day)
);

CREATE TABLE hall_of_fame (
  id            INTEGER PRIMARY KEY,
  distro_id     INTEGER NOT NULL REFERENCES distros(id) UNIQUE,
  rationale     TEXT NOT NULL,                   -- editorial, with citations
  sources       TEXT NOT NULL DEFAULT '[]',      -- JSON array of source URLs
  ordering      INTEGER NOT NULL DEFAULT 0
);
