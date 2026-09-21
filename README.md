# RCM Visualisation

An interactive 3D visualisation of the RADARSAT Constellation Mission (RCM), built with Svelte, CesiumJS, and satellite.js. It combines current orbital elements with the Government of Canada acquisition plan to show the three RCM spacecraft, planned imaging footprints, historical coverage, and active SAR acquisitions over time.

This is an independent visualisation and is not an official product of the Canadian Space Agency or the Government of Canada.

## Demo

<video src="images/rcm_gif_sm.mp4" controls muted loop playsinline width="100%"></video>

[Watch the RCM Visualisation demo (MP4)](images/rcm_gif_sm.mp4)

## Features

- SGP4 propagation for RCM-1, RCM-2, and RCM-3
- Time-aware planned and active acquisition footprints
- Animated, side-looking SAR acquisition sweeps (concurrent multi-satellite)
- Three-hour retention for planned footprints and highlighted selections
- Satellite trails and optional ground tracks
- Searchable acquisition metadata
- Natural-language command bar (`/` or ⌘K/Ctrl+K) for satellite selection, layer toggles, camera mode, and playback/time control
- Timeline scrubbing and playback from 1x to 1200x
- Overview, follow, fly-to, and satellite camera modes
- Satellite view with:
  - RCM-1/RCM-2/RCM-3 selection
  - 500 km view-height adjustments from 500 km to 3,000 km
  - 3,000 km default view height
  - upcoming footprints for the selected satellite over a 100-minute horizon

The satellite-view composition is schematic. It uses orbital velocity and nadir to maintain a stable trailing perspective; it does not represent measured spacecraft attitude or an authoritative sensor field-of-view envelope.

## Data Sources

- [Government of Canada RCM mission plan](https://maps-cartes.services.geo.ca/server_serveur/rest/services/CSA/radarsat_constellation_mission_plan_en/MapServer)
- [CelesTrak GP element data](https://celestrak.org/NORAD/elements/gp.php)
- [NASA Blue Marble Next Generation](https://earthobservatory.nasa.gov/features/BlueMarble)
- [Natural Earth](https://www.naturalearthdata.com/)

The ingestion pipeline generates browser-ready JSON in `public/data/`. Generated mission data and the copied Cesium runtime are excluded from Git.

## Requirements

- Node.js 22.12 or newer
- npm
- A browser with WebGL support
- Network access during data generation

## Local Development

```bash
git clone https://github.com/ScottSyms/RCM-Visualisation.git
cd RCM-Visualisation
npm ci
npm run data
npm run dev
```

Vite serves the application at `http://localhost:5173` by default.

To open the visualisation at a specific UTC playback timestamp, provide an ISO-8601
`start` query parameter. To bound playback, also provide `end`. Invalid values
use the generated mission defaults, out-of-window values are clamped, and
`end < start` is clamped to `start`.

```text
http://localhost:5173/?start=2026-09-08T16:49:00Z&end=2026-09-09T00:00:00Z
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run data` | Fetch and normalize current RCM acquisition and orbital data |
| `npm run assets` | Refresh bundled Earth and geography assets |
| `npm run dev` | Copy the Cesium runtime and start the development server |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | Run Svelte and TypeScript checks |

## Acquisition Archive (D1)

The Government service only serves a rolling window of past acquisitions
(-200d/+7d as fetched today). `npm run data` merges every run's fetch into a
persistent, deduplicated archive in [Cloudflare D1](https://developers.cloudflare.com/d1/)
(dedup key: the acquisition's stable `id`), so acquisitions the source stops
serving stay in `past.points.json` instead of disappearing on the next build.
See [scripts/data/archive.ts](scripts/data/archive.ts).

This is optional — without it, `npm run data` behaves exactly as before
(each run publishes only its own fetch window).

One-time setup:

```bash
npx wrangler d1 create rcm-acquisitions
```

Paste the returned `database_id` into `wrangler.toml`, then apply the schema:

```bash
npm run db:migrate
```

Set these before running `npm run data` (locally, in CI, and in the Cloudflare
Pages build environment) to enable archiving:

| Variable | Source |
| --- | --- |
| `CF_ACCOUNT_ID` | Cloudflare dashboard → Account Home → Account ID |
| `CF_D1_DATABASE_ID` | Output of `wrangler d1 create`, or `wrangler.toml` |
| `CF_API_TOKEN` | A Cloudflare API token scoped to **D1: Edit** for this account |

By default, `past.points.json` publishes the trailing `archivePublishWindowDays`
(365 days) of the archive; the archive itself retains everything indefinitely.
Tune this in [scripts/data/constants.ts](scripts/data/constants.ts).

## Command Bar (Workers AI)

Press `/` or ⌘K/Ctrl+K to open a natural-language command bar — e.g. *"follow
RCM-2"*, *"hide historical coverage"*, *"jump forward 6 hours"*, *"speed
300x"*. A Cloudflare Pages Function ([functions/api/command.ts](functions/api/command.ts))
sends the query to Workers AI (`@cf/meta/llama-3.1-8b-instruct-fp8`, JSON mode)
and maps the response onto a **closed set** of actions the client already
knows how to execute — [src/mission/types.ts](src/mission/types.ts)'s
`CommandIntent`. The model can select a satellite, toggle a layer, change
camera mode, or move the clock; it cannot invent an acquisition id or free-form
state, and every field is re-validated server-side regardless of what the
model returned (`toCommandIntent`). Finding a specific acquisition by
description (e.g. "the next pass over Hudson Bay") is intentionally out of
scope for now — use the **Browse** panel's table for that.

Requires no setup beyond the `[ai]` binding already in `wrangler.toml` —
Workers AI is available on every Cloudflare account. Requests are rate-limited
per IP (8/minute) using the same D1 database as the acquisition archive
([migrations/0002_command_rate_limit.sql](migrations/0002_command_rate_limit.sql)),
since the AI free tier is shared across every visitor to a public page.

`npm run dev` alone does not serve `/api/command` (Vite has no Pages Functions
support) — the command bar degrades gracefully to an error message in that
case. To exercise it locally, run Vite and Wrangler side by side:

```bash
npm run dev              # terminal 1 — Vite on :5173
npm run dev:functions    # terminal 2 — wrangler pages dev, proxies :5173, serves on :8788
```

then open `http://localhost:8788`.

## Production Build

Generate current mission data before building:

```bash
npm ci
npm run data
npm run build
```

The deployable static site is written to `dist/`. No application server, database, or API keys are required — the [D1 acquisition archive](#acquisition-archive-d1) is optional and only affects how much acquisition history `npm run data` publishes.

### Cloudflare Pages

Use the following settings:

```text
Production branch: main
Build command: npm run data && npm run build
Build output directory: dist
Node version: 22.12.0 or newer
```

The pipeline publishes the lightweight `past.points.json` derivative instead of the unused full historical-footprint archive, keeping every output file below Cloudflare Pages' 25 MiB per-file limit.

Mission data is refreshed whenever a new deployment runs. Use a scheduled deployment or build hook if the hosted visualisation should refresh automatically.

To accumulate acquisition history across deployments instead of publishing only each build's fetch window, add `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, and `CF_API_TOKEN` as Pages build environment variables — see [Acquisition Archive (D1)](#acquisition-archive-d1).

## User Guide

See the full interface guide with annotated screenshots in [USER_GUIDE.md](USER_GUIDE.md).

## Controls

- Press `/` or ⌘K/Ctrl+K for the natural-language command bar (see [Command Bar (Workers AI)](#command-bar-workers-ai)).
- Use the timeline to play, pause, change speed, or seek.
- Enter a UTC timestamp (`YYYY-MM-DD` + `HH:mm:ss` 24h) and select **Go** to seek; use **Copy** beside it to copy a shareable `?start=` + `?end=` link. Set the **End** date/time and select **Set end** to bound the playback window (`end` is clamped to `>= start`).
- On phones, use the **Browse** and **Info** edge handles to expand the acquisition and detail drawers.
- The phone timeline starts collapsed; use the bottom arrow to reveal or hide the full playback controls.
- Click a satellite point/label on the globe to select it and open its card, then choose **Follow** to track it.
- Select **Globe** for the overview camera.
- Select an acquisition (on the globe or in **Browse → Acquisitions**) and choose **Satellite view** for the wide trailing perspective.
- In Satellite view, use the satellite selector and `-` / `+` controls to change spacecraft and view height.
- Select **Satellite** in the timeline or **Exit view** in the acquisition card to leave Satellite view.
- Enable planned footprints, historical coverage, and ground tracks from the layer drawer.

## Architecture

- `src/mission/` coordinates mission time, selection, filters, and scene state; `CommandExecutor.ts` applies AI command-bar intents.
- `src/cesium/` owns the viewer, camera modes, Earth styling, and acquisition rendering.
- `src/ephemeris/` converts TLE data into time-aware Cesium satellite entities.
- `src/ui/Search.svelte` is the natural-language command bar (⌘K/`/`).
- `functions/api/command.ts` is the Cloudflare Pages Function backing the command bar (Workers AI).
- `scripts/data/` fetches, normalizes, and packages mission data; `scripts/data/archive.ts` merges each run into the optional D1 acquisition archive.
- `tests/` covers orbital, geometry, ingestion, camera, and command-bar dispatch/validation.

## Testing

```bash
npm test
npm run typecheck
npm run build
```

## License

Licensed under the [MIT License](LICENSE).

Data and imagery remain subject to their respective source terms and attribution requirements.
