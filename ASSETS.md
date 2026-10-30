# Retained asset sources

## Earth texture

- Retained at `public/earth-day.jpg` and embedded in the prebuilt JavaScript bundle.
- NASA Earth Observatory, Blue Marble (2002), land/ocean/ice, 2048 × 1024.
- Direct source: https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/land_ocean_ice_2048.jpg
- Collection and credits: https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/
- The downloaded image is retained without file edits. Three.js applies lighting when displaying the globe.

## Three.js

- `three` 0.180.0, including OrbitControls, bundled locally.
- MIT license; the distribution’s license notice is retained by esbuild in `app.js`.
- https://github.com/mrdoob/three.js

All icons are authored inline SVG. Stars, geological cross-sections, glow textures, and the capsule are generated at runtime. There are no runtime CDN assets or font downloads.
