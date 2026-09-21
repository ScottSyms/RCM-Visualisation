-- Persistent, deduplicated RCM acquisition archive (planned + past).
-- Upserted by scripts/data/archive.ts on every `npm run data` run; see
-- that file for the merge/dedup strategy. Apply with:
--   wrangler d1 migrations apply rcm-acquisitions --remote

CREATE TABLE IF NOT EXISTS acquisitions (
  id          TEXT PRIMARY KEY,   -- `${kind}-${OBJECTID}`, stable per source record
  kind        TEXT NOT NULL,      -- 'planned' | 'past'
  satid       TEXT NOT NULL,
  beam        TEXT NOT NULL,
  beamId      TEXT NOT NULL,
  pol         TEXT NOT NULL,
  polType     TEXT NOT NULL,
  ccd         TEXT NOT NULL,
  product     TEXT NOT NULL,
  radarMode   TEXT NOT NULL,
  startMs     INTEGER NOT NULL,
  endMs       INTEGER NOT NULL,
  footprint   TEXT NOT NULL,      -- JSON-encoded LonLat[][]
  centroidLon REAL,
  centroidLat REAL,
  updatedAt   INTEGER NOT NULL    -- ms epoch of the last ingest run that saw this record
);

CREATE INDEX IF NOT EXISTS idx_acquisitions_kind_start ON acquisitions (kind, startMs);
CREATE INDEX IF NOT EXISTS idx_acquisitions_kind_end ON acquisitions (kind, endMs);
