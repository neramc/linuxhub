-- 0005_indexes — read-path indexes (.ai/database.md § "Indexes (0005)").
-- Search stays on LIKE over name/aliases/summary for now; adopting D1 FTS5 is
-- an ADR-worthy change, recorded when the LIKE plan actually gets slow.

CREATE INDEX idx_releases_distro   ON releases(distro_id, released_at DESC);
CREATE INDEX idx_editions_release  ON editions(release_id);
CREATE INDEX idx_artifacts_edition ON artifacts(edition_id);
CREATE INDEX idx_mirrors_distro    ON mirrors(distro_id, healthy);
CREATE INDEX idx_mirrors_country   ON mirrors(country, healthy);
CREATE INDEX idx_taxonomy_ref      ON distro_taxonomy(kind, ref_slug);
CREATE INDEX idx_rankings_period   ON rankings(period, snapshot_at DESC, rank);
CREATE INDEX idx_dl_events_day     ON download_events(day);
CREATE INDEX idx_distros_family    ON distros(family, status);
