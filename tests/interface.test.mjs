/** DOM smoke tests, not visual/browser/device tests.
 * WebGL is intentionally absent, exercising the usable 2D fallback.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { Window } from "happy-dom";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const bundle = await build({
  entryPoints: [new URL("../src/app.js", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "iife",
  loader: { ".jpg": "dataurl" },
  outfile: new URL("../app.js", import.meta.url).pathname,
  minify: true,
  target: ["es2022"],
  legalComments: "eof",
  logLevel: "silent",
});
const code = bundle.outputFiles[0].text;

function mount({ reducedMotion = false } = {}) {
  const strokes = [];
  // Evaluate only this repository's authored bundle; no remote scripts are loaded.
  const window = new Window({
    url: "file:///offline/through-earth/index.html",
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
  window.requestAnimationFrame = () => 1;
  window.console.warn = () => {};
  window.console.error = () => {};
  window.matchMedia = () => ({
    matches: reducedMotion,
    addEventListener() {},
    removeEventListener() {},
  });
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== "2d") return null;
    let path = [];
    return {
      setTransform() {},
      clearRect() {},
      beginPath() {
        path = [];
      },
      arc() {},
      fill() {},
      moveTo(x, y) {
        path.push([x, y]);
      },
      lineTo(x, y) {
        path.push([x, y]);
      },
      stroke() {
        strokes.push({ color: this.strokeStyle, points: [...path] });
      },
      setLineDash() {},
    };
  };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 356,
    bottom: 410,
    width: 356,
    height: 410,
  });
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event("close"));
  };
  window.document.write(html);
  window.eval(code);
  return {
    window,
    document: window.document,
    strokes,
    dispose: () => window.happyDOM.abort(),
  };
}

test("offline entry initializes Cape Town → Zurich, browser API and usable fallback", async () => {
  const { window, document, dispose } = mount();
  try {
    assert.equal(window.throughJourney.origin.name, "Cape Town");
    assert.equal(window.throughJourney.destination.name, "Zurich");
    assert.equal(window.throughJourney.renderer, "2d");
    assert.equal(
      document.getElementById("tunnel-distance").textContent,
      "8,948",
    );
    assert.equal(document.getElementById("max-depth").textContent, "2,895");
    assert.equal(
      window.ThroughEarth.calculate({
        origin: { lat: 0, lon: 0 },
        destination: { lat: 0, lon: 180 },
      }).max_depth_km,
      6371,
    );
  } finally {
    await dispose();
  }
});
test("city search, coordinate input, swap, and launch update the real journey state", async () => {
  const { window, document, dispose } = mount();
  const search = document.getElementById("location-search");
  try {
    document.getElementById("destination-button").click();
    assert.ok(document.getElementById("location-dialog").open);
    search.value = "Tokyo";
    search.dispatchEvent(new window.Event("input"));
    document.querySelector(".location-option").click();
    document
      .getElementById("route-form")
      .dispatchEvent(new window.Event("submit", { cancelable: true }));
    assert.equal(window.throughJourney.destination.name, "Tokyo");
    document.getElementById("swap-button").click();
    document
      .getElementById("route-form")
      .dispatchEvent(new window.Event("submit", { cancelable: true }));
    assert.equal(window.throughJourney.origin.name, "Tokyo");
    assert.equal(window.throughJourney.destination.name, "Cape Town");
    document.getElementById("destination-button").click();
    search.value = "46.948, 7.447";
    search.dispatchEvent(new window.Event("input"));
    document.querySelector(".location-option").click();
    document
      .getElementById("route-form")
      .dispatchEvent(new window.Event("submit", { cancelable: true }));
    assert.equal(window.throughJourney.destination.lat, 46.948);
    assert.equal(window.throughJourney.destination.lon, 7.447);
  } finally {
    await dispose();
  }
});
test("mode switch, scrubbing and reduced-motion preference affect playback", async () => {
  const { window, document, dispose } = mount({ reducedMotion: true });
  try {
    assert.equal(window.throughJourney.playing, false);
    document.querySelector('[data-mode="straight"]').click();
    assert.equal(window.throughJourney.mode, "straight");
    assert.ok(
      Math.abs(window.throughJourney.travel_time_seconds - 2532.1727886761964) <
        1e-8,
    );
    const input = document.getElementById("progress");
    input.value = "500";
    input.dispatchEvent(new window.Event("input"));
    assert.equal(window.throughJourney.progress, 0.5);
    assert.equal(
      document.getElementById("timeline-status").textContent,
      "DEEPEST POINT",
    );
    document.getElementById("play-button").click();
    assert.equal(window.throughJourney.playing, true);
    document.getElementById("speed-button").click();
    assert.equal(document.getElementById("speed-button").textContent, "2×");
  } finally {
    await dispose();
  }
});
test("direct path is visible by default and compares distances across route changes", async () => {
  const { window, document, strokes, dispose } = mount();
  const toggle = document.getElementById("direct-button");
  try {
    assert.equal(window.throughJourney.showDirect, true);
    assert.equal(toggle.getAttribute("aria-pressed"), "true");
    const direct = window.ThroughEarth.calculate({
      origin: window.throughJourney.origin,
      destination: window.throughJourney.destination,
      mode: "straight",
      samples: 2,
    });
    assert.equal(
      document.getElementById("direct-distance").textContent,
      `${Math.round(direct.tunnel_distance_km).toLocaleString("en-US")} km`,
    );
    assert.equal(
      document.getElementById("fastest-distance").textContent,
      "8,948 km",
    );
    const scrubber = document.getElementById("progress");
    scrubber.value = "500";
    scrubber.dispatchEvent(new window.Event("input"));
    assert.ok(
      strokes.some((s) => s.color === "#c0ff87" && s.points.length > 2),
    );
    assert.equal(strokes.find((s) => s.color === "#7bdbff").points.length, 2);
    strokes.length = 0;
    toggle.click();
    assert.equal(window.throughJourney.showDirect, false);
    assert.ok(!strokes.some((s) => s.color === "#7bdbff"));
    document.querySelector('[data-preset="tokyo,sydney"]').click();
    assert.equal(window.throughJourney.showDirect, false);
    document.querySelector('[data-mode="straight"]').click();
    assert.equal(window.throughJourney.showDirect, true);
    assert.equal(toggle.disabled, true);
    document.querySelector('[data-mode="fastest"]').click();
    assert.equal(toggle.disabled, false);
    document.querySelector('[data-preset="north-pole,south-pole"]').click();
    assert.equal(
      document.getElementById("direct-distance").textContent,
      document.getElementById("fastest-distance").textContent,
    );
    assert.match(
      document.getElementById("distance-note").textContent,
      /coincide/,
    );
  } finally {
    await dispose();
  }
});
test("root HTML uses relative assets, bundled script and unique element targets", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!html.includes('type="module"'));
  assert.ok(html.includes('src="./app.js"'));
  assert.ok(html.includes('href="./styles.css"'));
  assert.ok(!/https?:\/\/(?:unpkg|cdn|fonts)/.test(html));
});

test("prebuilt bundle and single-file edition match the authored source", async () => {
  const actual = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.ok(actual === code, "Browser bundle is stale. Run npm run build.");
  const standalone = await readFile(
    new URL("../through-earth.html", import.meta.url),
    "utf8",
  );
  assert.ok(!standalone.includes('src="./app.js"'));
  assert.ok(!standalone.includes('href="./styles.css"'));
  assert.ok(standalone.includes('href="data:image/svg+xml,'));
  assert.ok(standalone.includes('href="data:application/json,'));
  assert.ok(
    standalone.indexOf("<script>") > standalone.indexOf('id="globe-stage"'),
  );
  assert.ok(standalone.includes(code.replace(/<\/script/gi, "<\\/script")));
});
