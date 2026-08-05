-- 0006 — tell apart "a mirror of this distro" from "a base URL our artifact
-- paths are relative to" (.ai/database.md § "mirrors").
--
-- These were treated as one thing, and they are not. Arch's mirror status JSON
-- publishes mirror roots (https://host/archlinux/), which an artifact path like
-- `iso/2026.08.01/…iso` extends correctly. Fedora's MirrorManager publishes
-- per-repo directories (https://host/fedora/linux/releases/44/Everything/
-- x86_64/os/); nothing extends those, so joining a Fedora artifact path onto
-- one produced a URL that answered 404. Only the Fedora redirector serves those
-- paths, and it is a mirror row too.
--
-- Defaulting to 0 is the safe direction: a mirror is not an artifact base until
-- a source says its base_url is one.

ALTER TABLE mirrors ADD COLUMN serves_artifacts INTEGER NOT NULL DEFAULT 0
  CHECK (serves_artifacts IN (0, 1));

-- artifact_mirrors is derived from the two tables above and is rebuilt by every
-- ingest run, so the rows written under the old assumption are simply dropped
-- rather than migrated.
DELETE FROM artifact_mirrors;
