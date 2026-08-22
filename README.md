# RCM Visualisation

An interactive 3D visualisation of the RADARSAT Constellation Mission (RCM), built with Svelte, CesiumJS, and satellite.js. It combines current orbital elements with the Government of Canada acquisition plan to show the three RCM spacecraft, planned imaging footprints, historical coverage, and active SAR acquisitions over time.

This is an independent visualisation and is not an official product of the Canadian Space Agency or the Government of Canada.

## Features

- SGP4 propagation for RCM-1, RCM-2, and RCM-3
- Time-aware planned and active acquisition footprints
- Animated, side-looking SAR acquisition sweeps
- Six-hour completed-acquisition highlighting
- Satellite trails and optional ground tracks
- Searchable acquisition metadata
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

## Production Build

Generate current mission data before building:

```bash
npm ci
npm run data
npm run build
```

The deployable static site is written to `dist/`. No application server, database, or API keys are required.

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

## Controls

- Use the timeline to play, pause, change speed, or seek.
- Select **Globe** for the overview camera.
- Select a satellite and choose **Follow** to track it closely.
- Select an acquisition and choose **Satellite view** for the wide trailing perspective.
- In Satellite view, use the satellite selector and `-` / `+` controls to change spacecraft and view height.
- Select **Satellite** in the timeline or **Exit view** in the acquisition card to leave Satellite view.
- Enable planned footprints, historical coverage, and ground tracks from the layer drawer.

## Architecture

- `src/mission/` coordinates mission time, selection, filters, and scene state.
- `src/cesium/` owns the viewer, camera modes, Earth styling, and acquisition rendering.
- `src/ephemeris/` converts TLE data into time-aware Cesium satellite entities.
- `scripts/data/` fetches, normalizes, and packages mission data.
- `tests/` covers orbital, geometry, ingestion, and camera calculations.

## Testing

```bash
npm test
npm run typecheck
npm run build
```

## License

Licensed under the [MIT License](LICENSE).

Data and imagery remain subject to their respective source terms and attribution requirements.
