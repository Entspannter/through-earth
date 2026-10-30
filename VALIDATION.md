# Validation

The implementation uses one solver for the browser and the Node API.

## Automated checks

On 2026-10-30, `npm run build` and `npm run check` passed: **21 tests, 0 failures**. HTTP smoke checks also confirmed static assets, health metadata and a real streamed JSON POST request to the running Node server. The generated browser bundle matches the authored source and the standalone HTML embeds its script, styles, texture, favicon and OpenAPI download.

Run `npm run check`. Physics/API tests exercise:

- Surface endpoints and zero endpoint speeds.
- The analytical antipodal diameter, travel time, depth and peak speed.
- Distance-independent straight-tunnel travel times in the specified model.
- Identical locations, equivalent ±180° longitudes and polar coordinate degeneracy.
- Very close and nearly antipodal pairs with finite, bounded paths.
- Conservation of mechanical energy for uniformly timed samples.
- Analytic path length against independent segment sums (tolerance 0.02 km).
- Analytic travel time against independent midpoint ds/v integration (tolerance 0.01 s).
- Reverse-journey time, distance and geometry symmetry.
- Out-of-range coordinates, numeric coercion, unknown modes and invalid sample counts.
- GET/POST equivalence, city search and model-health metadata.
- CORS preflight, unsupported HTTP methods and missing endpoints.
- Malformed/oversized JSON and incorrect content types.
- Static-file allowlisting against `.git` access.

DOM smoke tests also exercise the file-origin startup, Cape Town → Zurich default, browser API, fallback renderer, city and coordinate picker, departure/arrival swap, route launch, mode switch, timeline scrubbing, playback speed and reduced-motion preference. These use a DOM emulator with a mocked 2D canvas; they do not verify rendering or browser/device behavior.

## Browser/device verification

Pending: visual inspection, phone interaction and direct-file loading in a browser. Local browser access was disabled in the execution environment during the initial implementation. Code and HTTP checks cannot establish visual quality or actual device frame rate.

## Interpretation

These checks verify implementation against the uniform-density model. They do not validate an engineering concept or demonstrate accuracy for Earth’s real internal density profile.
