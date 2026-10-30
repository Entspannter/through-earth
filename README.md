# through.

A cinematic gravity-tunnel explorer. The default journey is **Cape Town → Zurich**.

**[Open the live app](https://entspannter.github.io/through-earth/)** · [GitHub repository](https://github.com/Entspannter/through-earth)

The interface is plain **HTML, CSS, and a locally bundled JavaScript file**. It works offline by opening `index.html`, and can be hosted from a GitHub Pages repository subfolder. It uses no CDN, online geocoder, analytics, API key, or external font request.

## Run it

Open [`through-earth.html`](through-earth.html) for the **single-file edition**, or [`index.html`](index.html) with its adjacent assets. Both include Three.js and the Earth texture, so **no installation or server is needed for the app**.

For the optional REST API, install Node.js 22+ and run:

```sh
npm ci
npm start
```

Open **http://localhost:4173**. To preview on a phone on the same Wi-Fi network:

```sh
HOST=0.0.0.0 npm start
```

Open `http://<your-computer-LAN-IP>:4173` on the phone. The server normally binds only to loopback; the `HOST` override is an explicit opt-in to LAN access.

## Explore

- Drag with a mouse or one finger to orbit. Scroll or pinch to zoom.
- Choose departure and arrival from 37 places, or enter **any latitude,longitude**.
- Launch the journey, pause, scrub, restart, and change playback speed.
- Switch between the cutaway and globe views; hide/show the surface reference arc.
- Compare the **lime gravity curve** and **cyan direct chord** on the same Earth, with both distances and gravity-powered travel times shown. The direct path is visible by default and can be toggled from the legend.
- Follow the capsule with the tracking camera, or expand the explorer.
- Compare the fastest curved tunnel with a straight gravity tunnel.
- Read the model assumptions and run an API example inside the app.

The layout puts the globe first on phones, uses touch targets, and adapts to narrow screens. Motion is paused initially for `prefers-reduced-motion`. If WebGL is unavailable, a 2D cross-section preserves the calculator and physically timed playback; 3D camera controls need WebGL.

The default animation compresses one physical journey into **22 seconds**, with speeds 0.5×, 1×, 2×, and 4×. The timeline always shows **physical travel time**. Capsule positions are sampled in elapsed time, rather than evenly along tunnel length.

## GitHub Pages

The GitHub repository publishes this static app from **`main` → `/(root)`** with GitHub Pages. Changes pushed to `main` are republished automatically.

The root contains the ready-to-serve `index.html`, `styles.css`, `app.js`, `favicon.svg`, `openapi.json`, and `.nojekyll`. All asset links are relative. Alternatively, deploy the contents of `dist/`, produced by `npm run build`.

[GitHub Pages hosts static HTML, CSS, and JavaScript](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). The calculator and **browser API** work there. HTTP REST endpoints require a separate server; they cannot run on GitHub Pages itself. No REST server is needed for any of the route calculations or animations in the static app.

## APIs

### Browser API — available everywhere

```js
const route = ThroughEarth.calculate({
  origin: { lat: -33.9249, lon: 18.4241, name: "Cape Town" },
  destination: { lat: 47.3769, lon: 8.5417, name: "Zurich" },
  mode: "fastest",
  samples: 241,
});

console.log(route.travel_time_seconds);
console.log(route.path);
ThroughEarth.searchLocations("Zurich");
```

`window.ThroughEarth` exposes `calculate`, `searchLocations`, the location catalogue, and model metadata. `window.throughJourney` exposes a read-only snapshot of the current visualization.

### REST API — included Node server

```sh
curl 'http://localhost:4173/api/v1/route?from=cape-town&to=zurich&mode=fastest&samples=241'

curl 'http://localhost:4173/api/v1/route' \
  -H 'Content-Type: application/json' \
  --data '{"origin":{"lat":-33.9249,"lon":18.4241},"destination":{"lat":47.3769,"lon":8.5417},"mode":"fastest","samples":241}'
```

| Endpoint                        | Purpose                           |
| ------------------------------- | --------------------------------- |
| `GET /api/v1/route?from=…&to=…` | Coordinates or built-in city IDs  |
| `POST /api/v1/route`            | Coordinate objects as JSON        |
| `GET /api/v1/locations?q=…`     | Diacritic-insensitive city search |
| `GET /api/v1/health`            | Readiness and model version       |
| `GET /openapi.json`             | OpenAPI 3.1 specification         |

Both calculation APIs use the same source module. All speeds are **km/s**, distances **km**, and times **seconds**. Path samples are evenly spaced in **time** and include both endpoints. Cartesian path coordinates are normalized to Earth radius: x points through 0°N, 0°E; y points north; z points through 0°N, 90°W.

`mode` is `fastest` or `straight`. `samples` is an integer from 2 to 1025. Invalid input returns HTTP 400. JSON POST bodies have a 32 KiB limit; unsupported content types return 415. Read-only API endpoints provide CORS headers. The static server uses an explicit file allowlist and never serves `.git`, source files, or local configuration.

## Physics

This solves the **gravity brachistochrone in a uniform-density sphere**, not the shortest geometric path or an unconstrained powered journey. Those are different optimization problems.

Assumptions: Earth radius **R = 6,371 km**, surface gravity **g = 9.80665 m/s²**, spherical shape, uniform density, no rotation, no drag or friction, no propulsion, ideal guide forces that do no work, and release/arrival at rest at the surface. Geological layers in the cutaway are visual context only. They do not alter the gravitational field.

For angular separation θ ∈ [0, π] in radians:

```text
Fastest time          T = √[ (R/g) θ(2π − θ) ]
Maximum depth         d = R θ/π
Fastest tunnel length L = 2R θ(2π − θ)/π²
Straight-tunnel time  T = π √(R/g), for distinct endpoints
Velocity at radius r  v = √[ (g/R)(R² − r²) ]
```

Use consistent units in the equations. The fastest curve is a hypocycloid with rolling-circle radius `b = R θ/(2π)`. Its parameter grows linearly in physical time, providing exact animation timing without endpoint-singular numerical integration. The antipodal limit is a diameter; coincident points are explicitly zero-duration journeys. Arbitrary and nearly antipodal coordinate pairs are handled without unstable division by sin θ.

Actual Earth density is not uniform. A more realistic density profile changes both travel time and the optimal tunnel. Rotation, excavation, pressure, thermal conditions, and construction feasibility are beyond this model.

Reference: [Alexander R. Klotz, The Gravity Tunnel in a Non-Uniform Earth, American Journal of Physics 83, 231 (2015)](https://arxiv.org/abs/1308.1342), [doi:10.1119/1.4898780](https://doi.org/10.1119/1.4898780).

## Development and validation

```sh
npm ci
npm run build       # bundle app.js and produce dist/
npm run check       # syntax checks and physics/API tests
npm start
```

After modifying `src/`, rebuild to update the root `app.js`, standalone `through-earth.html`, and deployable `dist/`. Keep the prebuilt root `app.js` in the eventual commit to support deployment without a build step. No Python environment is used or needed.

Tests cover energy conservation, analytic/numerical path-length agreement, independent midpoint integration of ds/v, the antipodal and coincident limits, near-degenerate coordinates, reverse-route symmetry, invalid inputs, REST/browser-engine equivalence, CORS, request limits, and route accessibility. Test results and remaining browser verification limits are recorded in `VALIDATION.md`.

## Project structure

```text
index.html            Semantic UI and dialogs
styles.css            Responsive, touch-friendly layout
app.js                Prebuilt offline bundle (includes Earth texture)
through-earth.html    Generated single-file edition, including all assets
src/app.js            Interaction and browser API
src/globe.js          Three.js rendering, cutaway, capsule and camera
src/physics.mjs       Exact uniform-density gravity-tunnel solver
src/locations.mjs     Built-in places and coordinate parsing
server.mjs            Optional Node REST API and static server
openapi.json          Machine-readable HTTP API contract
scripts/build.mjs     Reproducible bundler and static packaging
tests/                Physics and API verification
dist/                 Generated static publication folder (ignored)
```

## Credits

Three.js (MIT license) provides rendering and orbit controls. The 2048 × 1024 Earth texture is NASA Earth Observatory’s [Blue Marble land/ocean/ice map](https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/land_ocean_ice_2048.jpg), from [the official Blue Marble collection](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/). It is embedded into the bundle (about 270 KB before base64 encoding) to keep phone downloads and texture memory modest. No third-party JavaScript or images load at runtime.
