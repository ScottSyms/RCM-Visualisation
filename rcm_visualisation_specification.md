# RADARSAT Constellation Mission — Interactive Mission Visualisation Specification

**Document status:** Draft implementation specification  
**Version:** 0.1  
**Date:** 2026-08-18  
**Primary renderer:** CesiumJS  
**Primary purpose:** Visually communicate how the three RADARSAT Constellation Mission (RCM) satellites move around Earth and execute planned and historical SAR acquisitions.

---

## 1. Product vision

Build a cinematic, scientifically credible, time-aware 3D visualisation of the RADARSAT Constellation Mission.

The application should make a non-specialist understand, within seconds:

1. there are three RCM spacecraft moving in a coordinated constellation;
2. RCM is a **side-looking synthetic aperture radar (SAR)** mission rather than a nadir-looking optical camera;
3. acquisitions occur as finite strips/footprints on the Earth;
4. different acquisitions occur at different times, locations, beam modes and look geometries;
5. the constellation repeatedly builds coverage over Canada, its maritime approaches and other areas of interest.

The experience should resemble a high-end mission-control visualisation or a modern Earth-observation digital twin, **not a conventional GIS viewer with a globe added behind it**.

The visual design must prioritize motion, depth, lighting, acquisition geometry and temporal storytelling while retaining access to precise metadata.

---

## 2. Authoritative source context

The Government of Canada publishes the RCM acquisition-plan dataset in several forms, including:

- OGC WMS;
- Esri REST MapServer;
- KML;
- CSV;
- Shapefile;
- File Geodatabase;
- archived historical acquisition files.

The supplied WMS endpoint is:

```text
https://maps-cartes.services.geo.ca:443/server_serveur/services/CSA/radarsat_constellation_mission_plan_en/MapServer/WmsServer
```

The catalogue advertises the WMS with EPSG:3978 and also exposes the corresponding Esri REST service:

```text
https://maps-cartes.services.geo.ca/server_serveur/rest/services/CSA/radarsat_constellation_mission_plan_en/MapServer
```

Current planned-acquisition KML:

```text
https://ftp.maps.canada.ca/pub/csa_asc/Space-technology_Technologie-spatiale/radarsat_constellation_mission_plan/radarsat_constellation_mission_planned.kml
```

Current past-acquisition KML:

```text
https://ftp.maps.canada.ca/pub/csa_asc/Space-technology_Technologie-spatiale/radarsat_constellation_mission_plan/radarsat_constellation_mission_past.kml
```

Current planned-acquisition CSV:

```text
https://ftp.maps.canada.ca/pub/csa_asc/Space-technology_Technologie-spatiale/radarsat_constellation_mission_plan/radarsat_constellation_mission_planned.csv
```

Current past-acquisition CSV:

```text
https://ftp.maps.canada.ca/pub/csa_asc/Space-technology_Technologie-spatiale/radarsat_constellation_mission_plan/radarsat_constellation_mission_past.csv
```

Government catalogue record:

```text
https://app.geo.ca/en-ca/map-browser/record/d2a5bf2b-064c-4baf-b69e-0986ae6922cf
```

Canadian Space Agency technical characteristics:

```text
https://www.asc-csa.gc.ca/eng/satellites/radarsat/technical-features/characteristics.asp
```

### 2.1 Source-handling principle

The **WMS is an authoritative visual/reference layer**, but it should not be the sole source used to drive the interactive acquisition animation.

For interactive footprints, picking, filtering and time-aware animation, the implementation should prefer vector data in this order:

1. Esri REST feature/query output if the service exposes usable feature geometry and attributes;
2. KML;
3. File Geodatabase or Shapefile processed server-side;
4. CSV if it contains sufficient geometry or identifiers to join against another geometry source;
5. WMS as display-only fallback.

The application must retain a direct WMS toggle so that users can compare the application's rendered acquisition geometry with the Government of Canada service.

### 2.2 Projection constraint

The catalogue advertises the WMS in **EPSG:3978**. Cesium's globe is WGS84-centric.

Therefore:

- do not assume the WMS can be consumed directly as a standard Web Mercator tile layer;
- validate the WMS `GetCapabilities` response and supported CRS list;
- if the WMS cannot serve a Cesium-compatible CRS, display the equivalent ArcGIS REST layer or route WMS imagery through a server-side reprojection/tile proxy;
- normalize interactive vector acquisition geometry to **EPSG:4326 / WGS84 longitude-latitude** before delivery to the browser.

This is a release-blocking integration test.

---

## 3. Mission facts that should shape the visualisation

The application should visually preserve the following mission characteristics:

- RCM consists of three identical Earth-observation satellites.
- The constellation operates at approximately 600 km altitude.
- The three spacecraft are equally spaced, approximately 32 minutes apart.
- The spacecraft use C-band SAR.
- RCM is side-looking.
- RCM supports multiple imaging modes with substantially different swath widths and incidence angles.
- Published CSA characteristics list swaths ranging from narrow high-resolution/spotlight acquisitions to broad low-resolution acquisitions, including widths up to hundreds of kilometres.
- The mission is designed for broad regular monitoring, particularly of Canada and its maritime approaches.

These facts should influence animation and geometry. They should not merely appear in an information panel.

---

# 4. Core experience

## 4.1 Opening scene

The application opens directly into the 3D scene.

Initial composition:

- black/deep-space background;
- Earth occupies approximately 55–70% of viewport height;
- camera begins above the North Atlantic / North America at an oblique angle;
- Canada is visible but the globe is not centred in a conventional map projection;
- atmospheric limb is visible;
- the sun direction creates a clear terminator;
- stars are subtle and do not compete with data;
- labels are initially absent.

Within the first 1.5 seconds:

- the Earth resolves from soft to sharp;
- three thin orbital traces emerge;
- the three RCM spacecraft become visible;
- one upcoming acquisition footprint appears faintly ahead of the nearest spacecraft.

Within the next 2–4 seconds:

- the camera eases toward that spacecraft;
- the planned footprint gains definition;
- the SAR beam curtain becomes visible;
- the satellite sweeps the footprint;
- the footprint transitions from planned to acquired.

The opening animation must be skippable by any user interaction.

## 4.2 Primary visual metaphor: “painting the Earth”

An acquisition is represented as a temporal process, not a static polygon.

At time `t < acquisition.start`:

- footprint outline visible;
- translucent interior at low opacity;
- small directional marker indicates acquisition direction;
- no SAR beam.

As acquisition approaches:

- footprint subtly brightens;
- satellite-to-ground geometry becomes visible;
- optional 1–2 second pulse announces acquisition start.

During acquisition:

- a side-looking translucent SAR sheet extends from the spacecraft toward the active cross-track acquisition line;
- a bright but narrow leading edge moves along the footprint;
- the portion already collected fills behind the leading edge;
- the future portion remains faint;
- a very subtle emissive afterglow persists briefly after the sweep.

After acquisition:

- beam disappears rapidly;
- footprint remains as a completed acquisition;
- completed footprint fades toward the historical style according to the selected temporal window.

The effect should look like radar energy sweeping across the Earth, while avoiding the false implication of a visible optical cone.

---

# 5. Visual art direction

## 5.1 Overall aesthetic

Keywords:

**cinematic / orbital / precise / Canadian / technical / restrained / luminous / atmospheric / high-contrast**

Avoid:

- generic neon “cyber” styling;
- bright blue GIS basemaps;
- thick country boundaries;
- permanent labels everywhere;
- opaque acquisition polygons;
- oversized satellite icons;
- exaggerated sci-fi laser beams;
- excessive bloom;
- animated effects with no data meaning.

The scene should remain visually quiet until an acquisition happens.

## 5.2 Colour system

Recommended starting palette:

```css
:root {
  --space:              #02050A;
  --panel:              #071018E6;
  --panel-border:       #193141;
  --text-primary:       #F3F8FA;
  --text-secondary:     #91A6B2;

  --planned:            #53C8FF;
  --planned-fill:       #53C8FF26;

  --active:             #F4E66A;
  --active-core:        #FFF8BD;
  --active-beam:        #80E5FF;

  --complete:           #37D6A1;
  --historical:         #6B8090;

  --orbit-default:      #9DB7C833;
  --ground-track:       #7ED8FF55;

  --rcm-1:              #7DD3FC;
  --rcm-2:              #A7F3D0;
  --rcm-3:              #C4B5FD;

  --warning:            #FFB454;
  --error:              #FF6B6B;
}
```

Satellite-specific colours should be used sparingly:

- spacecraft marker;
- short local orbit trail;
- timeline row;
- selected-acquisition satellite identifier.

The acquisition-status colours should dominate the acquisition geometry.

## 5.3 Earth rendering

Target visual treatment:

- natural-colour imagery, significantly darkened;
- oceans near navy/black rather than saturated blue;
- reduced basemap saturation;
- slight increase in contrast;
- physically plausible sun illumination;
- visible atmosphere with restrained blue scattering;
- night side very dark;
- optional low-level city lights only on night side;
- subtle cloud layer if it does not obscure acquisition footprints.

Acquisition graphics must remain readable over snow, sea ice, desert and urban imagery.

### Recommended imagery post-processing starting point

- brightness: `0.55–0.70`
- saturation: `0.35–0.55`
- contrast: `1.10–1.25`
- gamma: tuned per imagery provider

These values are art-direction defaults, not fixed requirements.

## 5.4 Bloom and glow

Glow is reserved for:

1. active SAR sweep edge;
2. selected spacecraft;
3. selected acquisition;
4. horizon/atmosphere.

Historical polygons should never glow.

Maximum bloom should remain subtle enough that acquisition boundaries remain geometrically legible.

---

# 6. Scene layers

The visualisation consists of the following logical layers, from bottom to top.

## L0 — Earth

- globe ellipsoid;
- imagery;
- optional terrain;
- atmosphere;
- sun/lighting;
- optional cloud shell.

## L1 — Reference geography

Shown contextually and scale-dependently:

- national borders;
- coastlines;
- selected place labels;
- Arctic region labels;
- no road network in default mission view.

Fade boundaries as camera altitude rises.

## L2 — Government WMS reference

Optional, off by default after vector parity is proven.

Purpose:

- source verification;
- analyst comparison;
- fallback rendering.

UI label:

`Government acquisition layer`

## L3 — Vector acquisition footprints

Render planned and historical acquisitions as actual polygons.

Requirements:

- WGS84 geometry;
- antimeridian-safe;
- polar-safe;
- stable at oblique camera angles;
- pickable;
- filterable;
- styleable by status, beam mode, satellite and date.

## L4 — Ground track

For each satellite:

- previous 10–20 minutes: visible short trail;
- next 20–40 minutes: faint projected trail;
- full orbit: hidden by default.

Never show all historical tracks simultaneously in the default scene.

## L5 — Orbit arc

A thin elevated polyline following satellite ephemeris.

Default opacity low.

When a satellite is selected, its orbit arc increases slightly in prominence while the other two fade.

## L6 — SAR acquisition beam

Temporary 3D geometry displayed only around active or selected acquisitions.

See Section 10.

## L7 — Spacecraft

Three time-dynamic 3D models.

Each spacecraft has:

- physically scaled position;
- visually exaggerated model scale as required for visibility;
- orientation derived from orbital velocity and nadir;
- subtle rim light;
- optional small identifier plate;
- no giant billboard in close-follow mode.

## L8 — Labels and annotations

Screen-space HTML/SVG overlay or Cesium labels.

Use sparingly.

---

# 7. Camera modes

## 7.1 Free Globe

Default exploration mode.

User can:

- orbit;
- pan;
- zoom;
- select footprint;
- select satellite;
- scrub time.

Camera inertia should feel smooth and substantial.

## 7.2 Constellation

Frames the Earth and all three spacecraft where geometry permits.

The camera should choose a view that communicates spacing rather than forcing all satellites onto screen at all times.

Shows:

- three spacecraft;
- orbit plane;
- selected time;
- active/planned acquisitions within configurable horizon.

## 7.3 Follow Satellite

Camera tracks a selected RCM spacecraft.

Default composition:

- satellite in upper third;
- Earth horizon in lower half;
- velocity direction biased toward screen centre;
- upcoming footprint visible below/ahead where possible.

Camera must not rigidly lock to the model. Use damped pursuit.

Recommended camera smoothing:

```text
position damping:     0.90–0.97
orientation damping:  0.88–0.95
```

Exact implementation may use exponential interpolation independent of frame rate.

## 7.4 Acquisition View

Selecting an acquisition starts a cinematic `flyTo`.

Camera target is the footprint centroid or acquisition midpoint.

Sequence:

1. fly to 2,000–5,000 km context view;
2. tilt until Earth curvature is visible;
3. frame acquisition polygon;
4. include approaching spacecraft if temporally relevant;
5. settle into a tracking composition.

If user presses **Play acquisition**, scene time jumps to a configurable pre-roll, e.g. `start - 30 s`.

## 7.5 Ground Observer

Optional phase-2 view.

Camera is near the surface looking toward the spacecraft.

Purpose:

- dramatize off-nadir SAR geometry;
- explain incidence angle;
- support outreach/education.

Not required for MVP.

## 7.6 Canada Coverage

Camera frames Canada and adjacent waters.

Spacecraft models reduce in visual prominence.

Acquisition accumulation becomes primary.

Preset time windows:

- 1 hour
- 6 hours
- 24 hours
- 4 days
- 12 days
- custom

---

# 8. Time model

A single authoritative `MissionClock` drives:

- spacecraft positions;
- spacecraft orientation;
- acquisition state;
- SAR sweep;
- timeline;
- WMS/vector temporal filters if supported;
- camera event choreography.

## 8.1 Playback controls

Required:

- pause/play;
- jump backward;
- jump forward;
- return to current real-world time;
- speed control;
- scrub timeline.

Recommended speed presets:

```text
1×
10×
60×
300×
1800×
```

At high speed:

- disable expensive transient particles;
- reduce beam-animation sampling;
- preserve acquisition state transitions.

## 8.2 Time display

Primary display:

```text
2026-08-18 14:42:18 UTC
```

Secondary/local display may be user-configurable.

All underlying event logic uses UTC.

## 8.3 Acquisition state machine

```text
HISTORICAL
    ^
    |
COMPLETED <--- ACTIVE <--- IMMINENT <--- PLANNED
```

Suggested logic:

```text
PLANNED:
  now < start - imminentWindow

IMMINENT:
  start - imminentWindow <= now < start

ACTIVE:
  start <= now <= end

COMPLETED:
  end < now AND acquisition is inside current recent-history window

HISTORICAL:
  acquisition is older than recent-history window
```

Default `imminentWindow = 15 min`.

---

# 9. Satellite ephemeris

## 9.1 Input

The application accepts authoritative ephemeris supplied separately from the Government acquisition-plan feed.

Supported canonical input after normalization:

```ts
type EphemerisSample = {
  satelliteId: "RCM-1" | "RCM-2" | "RCM-3";
  timeUtc: string;       // ISO 8601
  x: number;             // metres
  y: number;
  z: number;
  frame: "ITRF" | "ECEF";
};
```

If source ephemeris is provided as latitude/longitude/altitude, normalize it during ingest.

## 9.2 Browser representation

Preferred:

- `SampledPositionProperty`, or
- generated CZML.

CZML is preferred when mission data is preprocessed server-side and distributed as static/time-window packages.

## 9.3 Interpolation

Requirements:

- no visually perceptible angular stepping at 60 fps;
- interpolation must not materially distort the orbit;
- source data remains authoritative;
- interpolation algorithm and sample spacing documented.

Start with:

- source samples at native cadence;
- Lagrange or Hermite interpolation only after validation;
- visual position error target `< 250 m` at normal playback;
- tighter accuracy if source cadence permits.

The application must expose a debug mode showing source sample points versus interpolated position.

## 9.4 Spacecraft orientation

Derive a local frame from:

- position vector;
- velocity vector;
- nadir direction.

Conceptually:

```text
nadir   = normalize(-position)
forward = normalize(velocity)
right   = normalize(cross(forward, nadir))
up      = normalize(cross(right, forward))
```

Apply a model-specific correction quaternion so the glTF model's local axes match this frame.

The orientation system must support later replacement with attitude telemetry if available.

---

# 10. SAR acquisition geometry

This is the signature visual feature.

## 10.1 Scientific constraint

RCM is side-looking SAR.

The visualisation must not depict a symmetric nadir cone.

The beam should appear as a thin oblique sheet/volume linking the spacecraft to the active ground swath.

## 10.2 Ground footprint authority

The published acquisition polygon is authoritative for the displayed ground acquisition footprint.

Do not fabricate footprint dimensions if authoritative geometry is present.

## 10.3 Acquisition progress

The ground polygon must be divided into temporal progress segments.

Recommended preprocessing algorithm:

1. determine approximate along-track direction from ephemeris around acquisition midpoint;
2. project polygon into a local tangent-plane coordinate system;
3. compute scalar distance of polygon vertices along the along-track axis;
4. divide acquisition extent into `N` progress slices;
5. clip polygon against each slice;
6. return ordered sub-polygons;
7. activate slices according to acquisition progress.

Recommended:

```text
N = 48 to 96
```

Use fewer slices on low-power devices or at high playback speeds.

This approach is more robust than attempting to modify complex polygon topology every animation frame.

## 10.4 Active progress

```ts
progress = clamp(
  (missionTime - startTime) / (endTime - startTime),
  0,
  1
);
```

Displayed slices:

```ts
completedSliceCount = floor(progress * sliceCount);
```

The active leading edge is the boundary between completed and future slices.

## 10.5 SAR curtain

Construct a transient 3D quadrilateral or narrow mesh between:

- satellite position;
- left edge of active ground swath;
- right edge of active ground swath.

Visual treatment:

- double-sided translucent material;
- vertical/diagonal opacity gradient;
- brightest near the active ground edge;
- faint procedural scan texture;
- soft additive blending;
- no opaque surface.

Recommended opacity:

```text
average: 0.06–0.14
edge:    0.25–0.50
```

## 10.6 Beam width

Where metadata provides beam mode/incidence information, use it to improve the display.

Where it does not:

- derive active cross-track endpoints directly from the authoritative acquisition footprint;
- visually connect spacecraft to the footprint;
- label the geometry as schematic if exact instantaneous beam geometry cannot be reconstructed.

Accuracy must never be implied where it is not available.

## 10.7 Look direction

If look direction can be reliably derived from:

- acquisition metadata;
- ephemeris;
- footprint position relative to ground track;

then display:

```text
LEFT LOOK
```

or

```text
RIGHT LOOK
```

in the acquisition detail panel.

If it cannot be reliably determined, omit the label.

---

# 11. Acquisition data model

Normalized client model:

```ts
type AcquisitionStatus =
  | "planned"
  | "imminent"
  | "active"
  | "completed"
  | "historical";

type Acquisition = {
  id: string;

  source: {
    provider: "Government of Canada";
    datasetId: "d2a5bf2b-064c-4baf-b69e-0986ae6922cf";
    sourceType: "arcgis-rest" | "kml" | "csv" | "fgdb" | "wms";
    sourceRecordId?: string;
  };

  satelliteId?: "RCM-1" | "RCM-2" | "RCM-3";

  startTimeUtc?: string;
  endTimeUtc?: string;

  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;

  beamMode?: string;
  polarization?: string;
  resolutionMeters?: number;
  swathWidthKm?: number;
  orbitDirection?: "ascending" | "descending";
  lookDirection?: "left" | "right";

  rawProperties: Record<string, unknown>;
};
```

### 11.1 Field-mapping rule

Do not hard-code assumed source field names until the live service/schema has been inspected.

Create a declarative mapping layer:

```ts
type AcquisitionFieldMap = {
  id: string[];
  satelliteId: string[];
  startTime: string[];
  endTime: string[];
  beamMode: string[];
  polarization: string[];
  orbitDirection: string[];
  lookDirection: string[];
};
```

Each property is an ordered list of candidate field names.

At ingestion:

1. inspect schema;
2. resolve matching fields;
3. log mapping;
4. fail gracefully when optional fields are absent;
5. retain all original properties.

---

# 12. Government WMS integration

## 12.1 Capabilities discovery

On application startup or server refresh:

```text
SERVICE=WMS
VERSION=1.3.0
REQUEST=GetCapabilities
```

Parse:

- service title;
- layer names;
- styles;
- CRS list;
- bounding boxes;
- dimensions;
- queryability;
- GetFeatureInfo support.

Cache capabilities server-side with a configurable TTL.

## 12.2 WMS use cases

Use WMS for:

- user-verifiable authoritative overlay;
- visual parity testing;
- fallback display;
- debugging source differences.

Do not depend on WMS pixels for:

- polygon picking;
- along-track acquisition animation;
- acquisition status calculation;
- beam geometry.

## 12.3 CRS handling

If WMS supports a Cesium-compatible output CRS, consume it directly.

If it does not:

**preferred option:** use the equivalent Esri REST MapServer directly;

**fallback:** server-side reproject/tile the WMS response to a Cesium-compatible tiling scheme.

Do not reproject WMS raster tiles in JavaScript on every frame.

## 12.4 CORS

During technical spike, verify:

- `Access-Control-Allow-Origin`;
- tile/image readability in WebGL;
- GetCapabilities fetch;
- GetFeatureInfo fetch if used.

If CORS is unsuitable, proxy only the required Government endpoints through the application backend.

---

# 13. Vector acquisition ingestion

## 13.1 Preferred runtime path

```text
Government source
      |
      v
Ingestion adapter
      |
      +--> source schema snapshot
      |
      +--> normalized GeoJSON/WGS84
      |
      +--> temporal metadata
      |
      +--> acquisition progress slices
      |
      v
cache/CDN/API
      |
      v
Cesium client
```

## 13.2 Refresh cadence

The catalogue states that future acquisition plans are published on a recurring schedule and may change without notice.

Therefore:

- poll source metadata at a low operational cadence, not every client session;
- refresh current plan server-side;
- version every fetched plan;
- retain previous plan version long enough to identify additions/removals/changes;
- mark changed planned acquisitions rather than silently replacing them where feasible.

Suggested production refresh:

```text
every 6 hours
```

This is an implementation default, not a statement about Government publication frequency.

## 13.3 Cache identity

Cache normalized records by:

```text
source dataset id
+ source version timestamp
+ source record identifier
+ geometry hash
```

---

# 14. Spacecraft model

## 14.1 Asset

Use a detailed RCM glTF/GLB model where licensing permits.

Requirements:

- recognizable SAR antenna;
- solar panels;
- bus detail;
- physically based materials;
- moderate polygon count;
- LOD support if required;
- compressed textures.

## 14.2 Scale

The spacecraft cannot be rendered at strict physical scale and remain visible at normal globe distances.

Use view-dependent visual scaling.

Rules:

- close view: near-physical apparent scale;
- medium view: smoothly increase apparent scale;
- global view: transition to a minimal luminous marker.

Never let the model become hundreds of kilometres wide in a way that overlaps the acquisition geometry.

## 14.3 Marker transition

At long range:

```text
3D model -> small luminous point + short label
```

At close range:

```text
point -> full glTF model
```

Crossfade over distance range.

---

# 15. Orbit and ground-track styling

## 15.1 Orbit

Default:

- width: 1–1.5 px;
- opacity: 0.12–0.25;
- no animated dashes;
- full orbit hidden unless selected or in Constellation view.

Selected:

- width: 2 px;
- slightly brighter;
- only one complete orbital arc emphasized.

## 15.2 Ground track

Past segment:

- solid/fading;
- 10–20 minute trail.

Future segment:

- dotted or opacity-modulated;
- 20–40 minute look-ahead.

The visual should make direction obvious without adding arrows every few kilometres.

---

# 16. Acquisition footprint styling

## Planned

```text
outline:      planned blue
fill alpha:   0.05–0.10
edge width:   1 px
glow:         none
```

## Imminent

```text
outline:      brighter planned blue
fill alpha:   0.10–0.16
pulse:        very slow, max 1 cycle / 2 s
```

## Active

```text
future area:       planned style
completed area:    active/completed luminous fill
leading edge:      brightest element in scene
SAR curtain:       visible
```

## Completed

```text
fill:          green/teal
fill alpha:    0.12–0.22
outline:       subtle
glow:          decays within 2–4 s
```

## Historical

```text
fill alpha:    0.03–0.08
outline:       desaturated
```

At high polygon density, automatically reduce historical opacity.

---

# 17. UI composition

The UI should resemble an instrument overlay, not a desktop GIS.

## 17.1 Default layout

```text
┌──────────────────────────────────────────────────────────────┐
│ RCM                           2026-08-18 14:42:18 UTC        │
│                                                              │
│                                                              │
│                        3D GLOBE                              │
│                                                              │
│                                                              │
│                                          ┌────────────────┐  │
│                                          │ Acquisition    │  │
│                                          │ RCM-2          │  │
│                                          │ SC50M...       │  │
│                                          │ 14:42–14:43Z   │  │
│                                          └────────────────┘  │
│                                                              │
│  [Globe] [Constellation] [Follow] [Coverage]                 │
├──────────────────────────────────────────────────────────────┤
│ RCM-1 ────────[████]──────────────────[███]───────────────  │
│ RCM-2 ─────────────────[████████]──────────────────────────  │
│ RCM-3 ───[██]──────────────────────────────[████]──────────  │
│          ◀   ▶    1× 10× 60×          ━━━━━●━━━━━━━━       │
└──────────────────────────────────────────────────────────────┘
```

## 17.2 Top bar

Contains only:

- product/mission name;
- UTC time;
- data freshness indicator;
- layer/settings button.

## 17.3 Acquisition card

Appears on selection.

Fields, when available:

- satellite;
- start;
- end;
- status;
- beam mode;
- polarization;
- resolution;
- orbit direction;
- look direction;
- source;
- source-plan version.

No empty placeholder rows.

## 17.4 Satellite card

On satellite selection:

- satellite identifier;
- altitude;
- speed;
- latitude/longitude of sub-satellite point;
- next acquisition;
- time to next acquisition.

Derived values must be labelled as derived where appropriate.

---

# 18. Timeline

The timeline is a primary navigation device, not a minor widget.

## 18.1 Rows

One row per spacecraft:

```text
RCM-1
RCM-2
RCM-3
```

Acquisitions rendered as blocks.

Width corresponds to acquisition duration.

## 18.2 Interaction

- click block -> select acquisition;
- double click -> play acquisition;
- hover -> compact tooltip;
- drag ruler -> scrub mission time;
- mouse wheel / pinch -> timeline zoom;
- shift-wheel or drag -> pan timeline.

## 18.3 Linking

All timeline and globe selection is bidirectional:

```text
timeline selection -> globe selection
globe selection    -> timeline selection
```

---

# 19. Cinematic transitions

## 19.1 Principles

Transitions should:

- preserve spatial orientation;
- ease rather than snap;
- use Earth curvature;
- avoid motion sickness;
- terminate immediately when user manually controls camera.

## 19.2 Fly-to durations

Suggested:

```text
global -> continent:       1.8–2.8 s
continent -> acquisition:  1.2–2.0 s
satellite follow attach:   0.8–1.5 s
```

No mandatory transition longer than 3 seconds.

## 19.3 Selected acquisition playback

Sequence:

```text
T-30 s   camera settles
T-10 s   footprint strengthens
T-3 s    beam geometry begins to appear
T0       sweep begins
T+...    acquisition paints forward
Tend     beam decays
Tend+2s  completed footprint settles
```

The camera may subtly drift rather than remain static.

---

# 20. Search and discovery

Provide a command/search box opened with `/` or `⌘K / Ctrl-K`.

Search:

- acquisition ID;
- satellite;
- date/time;
- beam mode;
- place name;
- coordinates.

Search result action:

- move clock if necessary;
- fly camera;
- select corresponding entity.

---

# 21. Filters

Keep filters in a compact drawer.

Possible filters:

- planned / completed / historical;
- RCM-1 / RCM-2 / RCM-3;
- date range;
- beam mode;
- polarization;
- ascending / descending;
- spatial area;
- active only.

Changing filters should not reset camera or time.

---

# 22. Coverage mode

Coverage mode answers:

**“What has RCM collected over this time interval?”**

Rather than displaying thousands of independent polygon outlines:

1. progressively accumulate footprints;
2. reduce edge prominence;
3. use opacity/intensity to indicate repeated coverage;
4. optionally produce a coverage-count raster or GPU accumulation texture.

Modes:

```text
Footprints
Coverage count
Most recent acquisition
Satellite contribution
```

The count display should use a perceptually ordered ramp and a clear legend.

---

# 23. Scale-dependent rendering

## Global view

Show:

- satellites as markers;
- broad planned acquisitions;
- active acquisition;
- minimal labels.

Hide:

- small footprint labels;
- detailed country boundaries;
- minor historical acquisitions.

## Regional view

Show:

- individual polygons;
- local ground track;
- acquisition metadata;
- spacecraft model if visible.

## Local view

Show:

- detailed footprint geometry;
- optional terrain;
- SAR sheet;
- look direction;
- acquisition progression.

Use `DistanceDisplayCondition` or equivalent logic.

---

# 24. Performance requirements

Target hardware:

- modern desktop browser;
- Apple Silicon Mac;
- recent Windows workstation with integrated or discrete GPU.

## 24.1 Frame-rate targets

```text
desktop target:          60 fps
acceptable heavy scene:  45 fps
minimum supported:       30 fps
```

Measured at 1920×1080 with a representative 24-hour acquisition window.

## 24.2 Frame budget

At 60 fps:

```text
16.7 ms total
```

Do not rebuild all acquisition entities every frame.

## 24.3 Rendering strategy

Use high-level Cesium Entities for:

- initial prototype;
- selection state;
- limited numbers of objects.

Move dense/static acquisition rendering to:

- batched primitives;
- geometry instances;
- custom primitives/shaders;

when profiling demonstrates need.

## 24.4 Data windowing

Client should not load the entire historical archive by default.

Default:

```text
history:   24 h
future:    full current published plan
```

Additional history loads on demand.

## 24.5 Worker use

Perform these tasks off the main UI thread where practical:

- KML parsing;
- geometry normalization;
- polygon slicing;
- spatial indexing;
- large filter operations.

---

# 25. Precision and coordinate handling

Requirements:

- UTC everywhere internally;
- WGS84 normalized vector geometry;
- antimeridian-safe polygons;
- correct polar rendering;
- no longitude wrap artifacts;
- ephemeris reference frame documented;
- acquisition time field timezone documented.

Do not treat naive date strings as local browser time.

---

# 26. Data-quality behaviour

The visualisation must visibly distinguish:

- source data;
- derived data;
- unavailable data.

If the acquisition source lacks an end time:

- do not invent an exact acquisition duration;
- use a source-derived or configurable fallback only if explicitly enabled;
- mark it as estimated.

If satellite identity is absent:

- still render footprint;
- do not randomly assign one of the three spacecraft.

If vector geometry is unavailable:

- show WMS footprint layer;
- disable sweep animation for that acquisition;
- explain why in diagnostics.

If the Government plan changes:

- update the plan version;
- optionally mark changed records.

---

# 27. Diagnostics mode

A hidden/developer diagnostics panel should expose:

- renderer fps;
- Cesium scene statistics;
- current MissionClock;
- ephemeris source cadence;
- interpolated satellite position;
- nearest raw ephemeris samples;
- acquisition source record;
- normalized geometry;
- WMS layer/style;
- plan refresh timestamp;
- source schema mapping;
- active sweep progress;
- number of visible polygons/primitives.

Keyboard shortcut suggestion:

```text
Ctrl/Cmd + Shift + D
```

---

# 28. Accessibility and input

Despite the visual emphasis:

- every acquisition must be reachable from the timeline/list without 3D picking;
- keyboard navigation required for primary controls;
- colour must not be the only indicator of status;
- selected status uses outline/shape as well as colour;
- UI text contrast must meet WCAG AA where practical;
- reduced-motion preference disables cinematic fly-throughs and pulses;
- screen reader labels provided for playback controls and acquisition metadata.

---

# 29. Responsive behaviour

## Desktop

Full experience.

## Tablet

- reduced side panels;
- bottom timeline collapsible;
- simplified labels.

## Mobile

Not a primary target for MVP.

If supported:

- single satellite follow;
- reduced effects;
- simplified timeline;
- no dense coverage mode.

---

# 30. Proposed implementation stack

## Front end

```text
TypeScript
CesiumJS
Svelte 5 + Vite (recommended UI shell)
Web Workers
glTF / GLB
```

Equivalent React/Vue shell is acceptable if required; CesiumJS remains the renderer.

## Server / preprocessing

Any implementation language is acceptable.

Responsibilities:

- fetch Government acquisition sources;
- cache `GetCapabilities`;
- normalize vector geometry;
- reproject to WGS84;
- map source schema;
- create acquisition slices;
- validate ephemeris;
- generate CZML or compact binary/JSON time series;
- optionally proxy WMS/REST to address CORS;
- expose data-version metadata.

A Rust service is a good fit for high-throughput preprocessing but is not required by this specification.

---

# 31. Suggested application modules

```text
src/
  app/
    App.svelte

  mission/
    MissionClock.ts
    MissionController.ts
    types.ts

  ephemeris/
    EphemerisLoader.ts
    SatelliteEntity.ts
    Orientation.ts

  acquisitions/
    AcquisitionSource.ts
    AcquisitionNormalizer.ts
    AcquisitionState.ts
    AcquisitionRenderer.ts
    AcquisitionSweep.ts
    AcquisitionPicker.ts

  sources/
    WmsSource.ts
    ArcGisSource.ts
    KmlSource.ts

  cesium/
    ViewerFactory.ts
    CameraController.ts
    EarthStyle.ts
    SceneEffects.ts

  timeline/
    Timeline.svelte
    TimelineModel.ts

  ui/
    AcquisitionCard.svelte
    SatelliteCard.svelte
    LayerDrawer.svelte
    Search.svelte

  workers/
    geometry.worker.ts
    kml.worker.ts
```

---

# 32. Source adapter interface

```ts
interface AcquisitionSource {
  id: string;

  inspect(): Promise<SourceInspection>;

  loadWindow(args: {
    startUtc: string;
    endUtc: string;
  }): Promise<RawAcquisition[]>;

  normalize(
    sourceRecord: RawAcquisition
  ): Promise<Acquisition>;
}
```

`inspect()` returns:

```ts
type SourceInspection = {
  serviceVersion?: string;
  layers?: string[];
  crs?: string[];
  fields?: Array<{
    name: string;
    type: string;
  }>;
  lastModified?: string;
};
```

---

# 33. Visualisation configuration

A configuration object should drive art-direction tuning without recompilation.

Example:

```yaml
scene:
  imageryBrightness: 0.62
  imagerySaturation: 0.45
  imageryContrast: 1.16
  atmosphere: true
  stars: true
  clouds: false

clock:
  initialMode: now
  imminentWindowSeconds: 900
  playbackSpeeds: [1, 10, 60, 300, 1800]

orbit:
  pastTrailSeconds: 900
  futureTrailSeconds: 1800
  defaultOpacity: 0.18

acquisitions:
  historyWindowHours: 24
  sliceCount: 64
  plannedOpacity: 0.08
  completeOpacity: 0.18
  historicalOpacity: 0.05

beam:
  enabled: true
  baseOpacity: 0.10
  edgeOpacity: 0.38
  fadeInSeconds: 3
  fadeOutSeconds: 2.5

camera:
  cinematicTransitions: true
  acquisitionPrerollSeconds: 30
```

---

# 34. Startup data flow

```text
Browser loads
    |
    v
Load application config
    |
    +----> initialize Cesium scene
    |
    +----> load satellite ephemeris window
    |
    +----> load normalized acquisition plan
    |
    +----> fetch source/version metadata
    |
    v
Initialize MissionClock
    |
    v
Create RCM spacecraft entities
    |
    v
Create acquisition primitives
    |
    v
Build timeline
    |
    v
Select nearest/upcoming acquisition
    |
    v
Run optional opening cinematic
```

Initial rendering should not block on the Government WMS.

WMS may load after the primary vector scene.

---

# 35. Graceful degradation

If 3D model fails:

```text
render satellite marker
```

If acquisition vectors fail:

```text
render Government WMS if available
```

If WMS fails:

```text
continue with cached/normalized vector plan
```

If ephemeris fails:

```text
show acquisition map without spacecraft animation
display data-source warning
```

No single optional visual source should blank the whole application.

---

# 36. Security and resilience

- treat external KML/CSV/XML as untrusted input;
- set payload size limits;
- sanitize metadata displayed as HTML;
- time out source requests;
- cache last known-good acquisition plan;
- record source retrieval timestamp;
- do not execute KML embedded script/content;
- restrict backend proxy to an allowlist of configured Government endpoints.

---

# 37. Telemetry

Optional application telemetry should measure:

- scene load time;
- time to first globe;
- time to first spacecraft;
- time to first acquisition;
- average fps;
- source failures;
- WMS/REST response time;
- geometry-processing time;
- selection-to-fly completion time.

No sensitive user geolocation is required for the core application.

---

# 38. MVP scope

The first release must include:

1. cinematic Cesium globe;
2. three RCM satellite trajectories from supplied ephemeris;
3. spacecraft markers or glTF models;
4. orbit/ground-track styling;
5. current Government planned and recent acquisition footprints;
6. WMS reference toggle;
7. time scrubber and playback speed;
8. satellite selection;
9. acquisition selection;
10. Acquisition View;
11. Follow Satellite view;
12. active SAR sweep / “paint the Earth” animation;
13. timeline rows for RCM-1/2/3 where satellite identity is available;
14. acquisition metadata card;
15. source/version diagnostics;
16. high-quality Earth/atmosphere art direction.

---

# 39. Phase 2

Candidates:

- coverage accumulation mode;
- archived acquisition browser;
- side-by-side WMS/vector comparison;
- actual RCM imagery thumbnails/products from EODMS where licensing/access permits;
- terrain-aware near-surface view;
- beam-mode-specific incidence geometry;
- polar projection inset;
- current sunlight/eclipsing state;
- ground-station visibility/downlink;
- AIS overlays for maritime storytelling;
- story-mode presets for ice monitoring, disaster response and ship surveillance;
- export still image/video;
- guided public-facing narrative mode.

---

# 40. Acceptance criteria

## 40.1 Visual

A release candidate passes only if:

- Earth looks cinematic rather than like a default GIS globe;
- active acquisition is the strongest visual element;
- RCM satellites remain visible without absurd scale;
- orbit lines do not clutter the globe;
- active SAR beam is visibly side-looking;
- a completed footprint clearly appears to have been “painted” behind the spacecraft;
- planned/current/historical acquisitions are visually distinguishable;
- UI occupies less than approximately 25% of the viewport in default state;
- user can hide almost all UI for presentation/fullscreen mode.

## 40.2 Data

- supplied ephemeris drives satellite location;
- acquisition geometry agrees with Government source;
- WMS reference layer can be compared against vector rendering;
- all normalized times are UTC;
- no acquisition is assigned to a spacecraft without source or defensible derived evidence;
- source plan timestamp/version is visible in diagnostics.

## 40.3 Interaction

- selecting satellite highlights its local orbit path;
- selecting acquisition flies to it;
- double-clicking acquisition begins acquisition playback;
- timeline scrub updates satellite positions immediately;
- timeline and globe selections remain synchronized;
- manual camera input cancels cinematic camera motion.

## 40.4 Performance

On representative desktop hardware:

- initial usable globe visible within 2 seconds on warm cache;
- spacecraft visible within 3 seconds on warm cache;
- target 60 fps in normal mission view;
- no sustained main-thread stall greater than 100 ms while scrubbing;
- 24-hour acquisition window remains interactively navigable.

## 40.5 Failure

- WMS outage does not disable ephemeris visualisation;
- acquisition vector outage does not crash the scene;
- ephemeris error produces explicit diagnostic state;
- last-known-good plan can be used when configured.

---

# 41. Technical spike / proof-of-concept sequence

Before building the full UI, implement the following vertical slice.

## Spike 1 — Government source

1. retrieve WMS `GetCapabilities`;
2. record layer names, styles and CRS;
3. inspect Esri REST service;
4. retrieve one planned acquisition polygon;
5. normalize it to WGS84;
6. render it on Cesium;
7. toggle the WMS/REST reference over it;
8. verify positional parity.

**Exit condition:** acquisition geometry aligns acceptably at Canada, Arctic and antimeridian test locations.

## Spike 2 — Ephemeris

1. ingest one RCM satellite ephemeris;
2. animate it with MissionClock;
3. derive orientation;
4. draw ground track;
5. add Follow Satellite camera.

**Exit condition:** smooth orbital motion at 1× and 60×.

## Spike 3 — Acquisition sweep

1. select one acquisition with valid timing;
2. slice its polygon;
3. compute progress;
4. animate completed slices;
5. construct SAR curtain from spacecraft to active strip;
6. add glow/bloom;
7. tune camera.

**Exit condition:** a viewer immediately understands that the moving satellite is collecting the ground strip.

## Spike 4 — Three-satellite mission view

1. load all three ephemerides;
2. show constellation;
3. populate timeline;
4. connect planned acquisitions;
5. test 6-hour and 24-hour playback.

**Exit condition:** constellation operations remain readable without clutter.

---

# 42. Definition of “visually stunning”

This requirement is intentionally testable.

The application is not considered visually complete merely because it uses a 3D globe.

It should achieve the following:

### Depth
Earth curvature, atmosphere, orbit altitude and side-looking geometry are immediately legible.

### Motion
Spacecraft, ground track, acquisition sweep and camera motion create a coherent sense of orbital movement.

### Restraint
Most of the scene is dark and quiet. Illumination appears where the mission is doing something.

### Precision
Acquisition polygons remain crisp and attached to real geography.

### Focus
At any instant there should be a clear visual hierarchy:

```text
1. active acquisition
2. selected spacecraft/acquisition
3. Earth
4. nearby planned acquisitions
5. orbit context
6. UI
```

### Transition quality
Flying from globe scale to acquisition scale should feel continuous and spatially understandable.

### Presentation mode
At any time the user can press a single control to hide analytical UI and obtain a clean cinematic mission visual suitable for a large display or screen recording.

---

# 43. Presentation mode

Keyboard shortcut:

```text
P
```

Hides:

- panels;
- diagnostics;
- search;
- filters;
- detailed metadata.

Retains only:

- optional mission title;
- UTC clock;
- minimal playback control;
- active acquisition annotation.

Optional **Auto Director** mode can cycle:

```text
Constellation
   ->
Follow next acquiring satellite
   ->
Acquisition view
   ->
wide Earth reveal
   ->
next event
```

Auto Director must never invent events; it only navigates known acquisitions.

---

# 44. Final recommended product character

The correct mental model is:

> **RCM mission control meets an Earth-observation documentary visualisation.**

Not:

> a WMS map wrapped onto a globe.

The Government acquisition service supplies authoritative mission-plan geography. The ephemeris supplies orbital truth. Cesium supplies the 3D Earth and time-aware rendering. The application's differentiating layer is the temporal, side-looking SAR acquisition visualisation that connects those two datasets into a coherent story.

The signature moment should always be the same:

**an RCM spacecraft approaches, the radar geometry reaches sideways toward Earth, a planned strip comes alive, and the satellite visibly paints the acquisition across the planet.**

---

## Appendix A — Primary external references

Government of Canada RCM acquisition-plan catalogue:

```text
https://app.geo.ca/en-ca/map-browser/record/d2a5bf2b-064c-4baf-b69e-0986ae6922cf
```

Supplied WMS:

```text
https://maps-cartes.services.geo.ca:443/server_serveur/services/CSA/radarsat_constellation_mission_plan_en/MapServer/WmsServer
```

Government Esri REST service:

```text
https://maps-cartes.services.geo.ca/server_serveur/rest/services/CSA/radarsat_constellation_mission_plan_en/MapServer
```

Canadian Space Agency RCM:

```text
https://www.asc-csa.gc.ca/eng/satellites/radarsat/
```

Canadian Space Agency technical characteristics:

```text
https://www.asc-csa.gc.ca/eng/satellites/radarsat/technical-features/characteristics.asp
```

Cesium imagery / WMS documentation:

```text
https://cesium.com/learn/cesiumjs-learn/cesiumjs-imagery/
```

Cesium camera documentation:

```text
https://cesium.com/learn/cesiumjs-learn/cesiumjs-camera/
```

Cesium Sandcastle / CZML examples:

```text
https://cesium.com/learn/cesiumjs-sandcastle/
```

---

## Appendix B — Decisions requiring validation during Spike 1

The following should **not** be guessed in implementation:

- exact WMS layer names;
- exact WMS styles;
- complete WMS CRS list;
- Esri MapServer layer IDs;
- exact source field names;
- exact satellite identifier field;
- exact acquisition start/end fields;
- whether source geometry crosses the antimeridian;
- whether all acquisitions contain satellite identity;
- whether all acquisition records include beam mode;
- whether browser-direct Government endpoints provide suitable CORS;
- whether exact instantaneous radar beam geometry can be reconstructed from public fields.

The application architecture is intentionally designed so these values are discovered and mapped without changing the core renderer.
