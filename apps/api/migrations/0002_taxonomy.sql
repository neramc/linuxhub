-- 0002_taxonomy — categories, tags, and the distro↔taxonomy join
-- (.ai/database.md § "D1 schema"). Assignments are editorial and arrive with
-- the Wikidata lineage step; the tables exist so read endpoints can join them
-- from the start rather than growing a second code path later.

CREATE TABLE categories (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE tags (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL
);

CREATE TABLE distro_taxonomy (
  distro_id     INTEGER NOT NULL REFERENCES distros(id),
  kind          TEXT NOT NULL CHECK (kind IN ('category', 'tag', 'desktop')),
  ref_slug      TEXT NOT NULL,
  PRIMARY KEY (distro_id, kind, ref_slug)
);
