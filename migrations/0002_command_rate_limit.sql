-- Per-IP fixed-window rate limit for the natural-language command bar
-- (functions/api/command.ts). One row per IP; the window resets in place
-- via the upsert in withinRateLimit(), so this table never grows.
CREATE TABLE IF NOT EXISTS command_rate_limit (
  ip          TEXT PRIMARY KEY,
  windowStart INTEGER NOT NULL,
  count       INTEGER NOT NULL
);
