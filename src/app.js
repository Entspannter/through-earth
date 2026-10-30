import { EarthScene } from "./globe.js";
import {
  solveRoute,
  routeFrame,
  pointAt,
  surfaceAt,
  MODEL,
  EARTH_RADIUS_KM,
  SURFACE_GRAVITY,
} from "./physics.mjs";
import { LOCATIONS, searchLocations, parseLocation } from "./locations.mjs";

const $ = (id) => document.getElementById(id);
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const byId = (id) => LOCATIONS.find((p) => p.id === id);
const state = {
  origin: byId("cape-town"),
  destination: byId("zurich"),
  mode: "fastest",
};
const number = (n, decimals = 0) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
const clock = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const flag = (code) =>
  code === "XY"
    ? "⌖"
    : code === "NP" || code === "SP"
      ? "◎"
      : [...code]
          .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
          .join("");
const coordinates = (p) =>
  `${Math.abs(p.lat).toFixed(4)}° ${p.lat < 0 ? "S" : "N"} · ${Math.abs(p.lon).toFixed(4)}° ${p.lon < 0 ? "W" : "E"}`;
const safe = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let route,
  scene,
  selecting = "origin",
  previousFocus,
  toastTimer,
  apiAvailable = false,
  lastPlaying;

window.ThroughEarth = Object.freeze({
  calculate: solveRoute,
  searchLocations,
  locations: LOCATIONS,
  model: MODEL,
  version: "1.0.0",
});

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2700);
}
async function copy(text) {
  try {
    if (navigator.clipboard && window.isSecureContext)
      await navigator.clipboard.writeText(text);
    else {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.cssText = "position:fixed;left:-10000px";
      document.body.append(input);
      input.select();
      const success = document.execCommand("copy");
      input.remove();
      if (!success) throw new Error("Clipboard unavailable");
    }
    toast("Copied to clipboard");
  } catch {
    toast("Clipboard unavailable. Select the text to copy it.");
  }
}

function updatePlaces() {
  for (const key of ["origin", "destination"]) {
    const p = state[key];
    $(`${key}-name`).textContent = p.name;
    $(`${key}-country`).textContent = p.country;
    $(`${key}-flag`).textContent = flag(p.code);
    $(`${key}-coordinates`).textContent = coordinates(p);
  }
}
function markDirty() {
  updatePlaces();
  $("form-hint").textContent = "New destination? Your next journey is ready.";
  $("form-hint").classList.add("dirty");
  $("launch-label").textContent = "Calculate new route";
}

function updateFrame({ fraction, playing, depth }) {
  if (!route) return;
  $("elapsed-time").textContent = clock(fraction * route.travel_time_seconds);
  $("progress").value = String(Math.round(fraction * 1000));
  $("progress").style.setProperty("--progress", `${fraction * 100}%`);
  $("live-depth").textContent = number(depth);
  $("depth-caption").textContent =
    depth > 5150
      ? "Through the inner core"
      : depth > 2890
        ? "Through the outer core"
        : depth > 35
          ? "Inside the mantle"
          : fraction >= 0.999
            ? "Welcome to the other side"
            : "Just below the surface";
  $("timeline-status").textContent =
    fraction >= 0.999
      ? "ARRIVED"
      : Math.abs(fraction - 0.5) < 0.025
        ? "DEEPEST POINT"
        : fraction < 0.5
          ? "DESCENDING"
          : "ASCENDING";
  if (lastPlaying !== playing) {
    $("play-button").innerHTML = icon(playing ? "pause" : "play");
    $("play-button").setAttribute(
      "aria-label",
      playing ? "Pause journey" : "Play journey",
    );
    lastPlaying = playing;
  }
}

function calculate(announce = false) {
  route = solveRoute({
    origin: state.origin,
    destination: state.destination,
    mode: state.mode,
    samples: 321,
  });
  $("form-hint").textContent = "Powered by gravity. Fueled by curiosity.";
  $("form-hint").classList.remove("dirty");
  $("launch-label").textContent = "Launch journey";
  updatePlaces();
  const sec = Math.round(route.travel_time_seconds),
    minutes = Math.floor(sec / 60),
    seconds = sec % 60;
  $("travel-time").innerHTML =
    `<span>${minutes}</span><small>m</small><span>${String(seconds).padStart(2, "0")}</span><small>s</small>`;
  const savings = Math.round(route.savings_vs_straight_seconds);
  $("savings").innerHTML =
    icon("speed") +
    `<span>${route.travel_time_seconds === 0 ? "You’re already at your destination" : savings > 0 ? `${Math.floor(savings / 60)}m ${savings % 60}s faster than a straight tunnel` : state.mode === "straight" ? "The shortest tunnel through Earth" : "A straight path through the center"}</span>`;
  const fastest =
    state.mode === "fastest"
      ? route
      : solveRoute({
          origin: state.origin,
          destination: state.destination,
          mode: "fastest",
          samples: 2,
        });
  $("fastest-time").textContent = clock(fastest.travel_time_seconds);
  $("straight-time").textContent = clock(route.straight_tunnel_time_seconds);
  $("compare-fast").style.width =
    `${route.straight_tunnel_time_seconds ? (fastest.travel_time_seconds / route.straight_tunnel_time_seconds) * 100 : 0}%`;
  $("tunnel-distance").textContent = number(route.tunnel_distance_km);
  $("max-depth").textContent = number(route.max_depth_km);
  $("max-speed").textContent = number(route.max_speed_km_s, 2);
  $("surface-distance").textContent = number(route.surface_distance_km);
  $("distance-note").textContent =
    state.mode === "fastest"
      ? "Following a gravity-optimized curve"
      : "The direct chord between your places";
  $("layer-note").textContent =
    route.max_depth_km > 5150
      ? "Reaching the inner core"
      : route.max_depth_km > 2890
        ? "Reaching the outer core"
        : route.max_depth_km > 35
          ? "Deep into the mantle"
          : "Within the crust";
  $("duration-time").textContent = clock(route.travel_time_seconds);
  $("origin-marker").querySelector("strong").textContent = route.origin.name;
  $("destination-marker").querySelector("strong").textContent =
    route.destination.name;
  const request = `/api/v1/route?from=${state.origin.lat},${state.origin.lon}&to=${state.destination.lat},${state.destination.lon}&mode=${state.mode}&samples=241`;
  $("api-request").textContent = `curl "http://localhost:4173${request}"`;
  scene?.setRoute(route);
  if (scene) {
    scene.playing = route.travel_time_seconds > 0 && !scene.reducedMotion;
    $("camera-button").setAttribute("aria-pressed", "false");
  }
  updateFrame({ fraction: 0, playing: scene?.playing ?? false, depth: 0 });
  if (announce)
    toast(
      route.travel_time_seconds === 0
        ? "You’re already there. Choose two different points."
        : `${route.origin.name} → ${route.destination.name}. Let’s go.`,
    );
}

function openDialog(dialog) {
  previousFocus = document.activeElement;
  if (!dialog.open) {
    dialog.showModal();
    document.body.style.overflow = "hidden";
  }
  if (dialog.id === "api-dialog") checkApi();
}
function closeDialog(dialog) {
  dialog.close();
  document.body.style.overflow = "";
  previousFocus?.focus();
}
document
  .querySelectorAll("[data-open]")
  .forEach((button) =>
    button.addEventListener("click", () => openDialog($(button.dataset.open))),
  );
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog
    .querySelector("[data-close]")
    ?.addEventListener("click", () => closeDialog(dialog));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        closeDialog(dialog);
    }
  });
  dialog.addEventListener("close", () => {
    document.body.style.overflow = "";
    for (const key of ["origin", "destination"])
      $(`${key}-button`).setAttribute("aria-expanded", "false");
  });
});

function chooseLocation(p) {
  state[selecting] = p;
  markDirty();
  closeDialog($("location-dialog"));
}
function renderLocations() {
  const query = $("location-search").value.trim(),
    matches = searchLocations(query).slice(0, 40);
  const custom = query.includes(",") ? parseLocation(query) : null;
  if (custom?.code === "XY") matches.unshift(custom);
  const container = $("location-results");
  container.replaceChildren();
  if (!matches.length) {
    container.innerHTML =
      '<p class="no-results">No matching city.<br>Try another name, or enter coordinates as <strong>latitude, longitude</strong>.<br>Latitude: −90 to 90 · Longitude: −180 to 180.</p>';
    return;
  }
  for (const p of matches) {
    const button = document.createElement("button");
    button.className = "location-option";
    button.type = "button";
    button.setAttribute("role", "listitem");
    button.innerHTML = `<span class="flag">${safe(flag(p.code))}</span><div><strong>${safe(p.name)}</strong><small>${safe(p.country)}</small></div><span class="option-coordinates">${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}°</span>${state[selecting].id === p.id ? icon("check") : ""}`;
    button.addEventListener("click", () => chooseLocation(p));
    container.append(button);
  }
}
for (const key of ["origin", "destination"])
  $(`${key}-button`).addEventListener("click", () => {
    selecting = key;
    $("location-type").textContent =
      key === "origin" ? "CHOOSE DEPARTURE" : "CHOOSE ARRIVAL";
    $("location-search").value = "";
    renderLocations();
    openDialog($("location-dialog"));
    $(`${key}-button`).setAttribute("aria-expanded", "true");
    $("location-search").focus();
  });
$("location-search").addEventListener("input", renderLocations);
$("location-search").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    $("location-results").querySelector("button")?.focus();
  }
  if (e.key === "Enter") {
    e.preventDefault();
    $("location-results").querySelector("button")?.click();
  }
});
$("location-results").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const buttons = [...$("location-results").querySelectorAll("button")],
      at = buttons.indexOf(document.activeElement);
    buttons[
      (at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
    ]?.focus();
  }
});
$("coordinate-example").addEventListener("click", () => {
  $("location-search").value = "46.948, 7.447";
  renderLocations();
  $("location-search").focus();
});
$("swap-button").addEventListener("click", () => {
  [state.origin, state.destination] = [state.destination, state.origin];
  markDirty();
});
document.querySelectorAll("[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((b) => {
      b.classList.toggle("selected", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    calculate(false);
  }),
);
$("route-form").addEventListener("submit", (e) => {
  e.preventDefault();
  calculate(true);
});
document.querySelectorAll("[data-preset]").forEach((button) =>
  button.addEventListener("click", () => {
    const [a, b] = button.dataset.preset.split(",");
    state.origin = byId(a);
    state.destination = byId(b);
    calculate(true);
  }),
);
$("explorer-nav").addEventListener("click", () =>
  document
    .querySelector(".explorer")
    .scrollIntoView({ behavior: "smooth", block: "start" }),
);

function setCutaway(value) {
  scene?.setCutaway(value);
  $("cutaway-button").classList.toggle("selected", value);
  $("globe-button").classList.toggle("selected", !value);
  $("cutaway-button").setAttribute("aria-pressed", String(value));
  $("globe-button").setAttribute("aria-pressed", String(!value));
}
$("cutaway-button").addEventListener("click", () => setCutaway(true));
$("globe-button").addEventListener("click", () => setCutaway(false));
$("play-button").addEventListener("click", () => {
  if (!scene) return;
  scene.playing = !scene.playing;
  if (scene.progress >= 1) scene.setProgress(0);
  updateFrame({
    fraction: scene.progress,
    playing: scene.playing,
    depth: Math.max(
      0,
      (1 -
        Math.hypot(
          ...pointAt(
            routeFrame(route.origin, route.destination),
            scene.progress,
            route.mode,
          ),
        )) *
        EARTH_RADIUS_KM,
    ),
  });
});
$("restart-button").addEventListener("click", () => {
  scene?.setProgress(0);
  if (scene) scene.playing = true;
});
$("progress").addEventListener("input", (e) => {
  if (scene) {
    scene.playing = false;
    scene.setProgress(Number(e.target.value) / 1000);
  }
});
const speeds = [1, 2, 4, 0.5];
let speedIndex = 0;
$("speed-button").addEventListener("click", () => {
  speedIndex = (speedIndex + 1) % speeds.length;
  const speed = speeds[speedIndex];
  $("speed-button").textContent = `${speed}×`;
  $("speed-button").setAttribute(
    "aria-label",
    `Animation speed ${speed} times. Click to change.`,
  );
  if (scene) scene.playbackSeconds = 22 / speed;
});
$("surface-button").addEventListener("click", () => {
  const visible = $("surface-button").getAttribute("aria-pressed") !== "true";
  $("surface-button").setAttribute("aria-pressed", String(visible));
  scene?.setSurface(visible);
});
$("reset-view").addEventListener("click", () => {
  scene?.resetView();
  $("camera-button").setAttribute("aria-pressed", "false");
});
$("zoom-in").addEventListener("click", () => scene?.zoom(0.87));
$("zoom-out").addEventListener("click", () => scene?.zoom(1.15));
$("camera-button").addEventListener("click", () => {
  const enabled = $("camera-button").getAttribute("aria-pressed") !== "true";
  $("camera-button").setAttribute("aria-pressed", String(enabled));
  scene?.setFlyThrough(enabled);
  if (enabled) toast("Following your capsule through Earth");
});
$("fullscreen-button").addEventListener("click", async () => {
  const explorer = document.querySelector(".explorer");
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (explorer.classList.contains("expanded")) {
      explorer.classList.remove("expanded");
      document.body.style.overflow = "";
    } else if (explorer.requestFullscreen) {
      await explorer.requestFullscreen();
    } else {
      explorer.classList.add("expanded");
      document.body.style.overflow = "hidden";
    }
  } catch {
    explorer.classList.toggle("expanded");
    document.body.style.overflow = explorer.classList.contains("expanded")
      ? "hidden"
      : "";
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelector(".explorer").classList.remove("expanded");
    if (!document.querySelector("dialog[open]"))
      document.body.style.overflow = "";
  }
  if (
    e.code === "Space" &&
    !document.querySelector("dialog[open]") &&
    !["INPUT", "BUTTON", "TEXTAREA"].includes(document.activeElement?.tagName)
  ) {
    e.preventDefault();
    $("play-button").click();
  }
});

async function checkApi() {
  apiAvailable = false;
  if (location.protocol !== "file:") {
    try {
      const response = await fetch("./api/v1/health", {
        signal: AbortSignal.timeout(1800),
      });
      const health = await response.json();
      apiAvailable =
        response.ok && health.status === "ok" && health.model === MODEL.id;
    } catch {}
  }
  $("api-status").classList.toggle("offline", !apiAvailable);
  $("api-status").querySelector("span:last-child").textContent = apiAvailable
    ? "REST API connected · Browser engine ready"
    : "Browser API ready · REST API available with npm start";
}
function routePreview(result) {
  const { path, ...summary } = result;
  return {
    ...summary,
    path: [
      path[0],
      { note: `${path.length - 2} intermediate samples` },
      path[path.length - 1],
    ],
  };
}
$("copy-request").addEventListener("click", () =>
  copy($("api-request").textContent),
);
$("copy-json").addEventListener("click", () =>
  copy(JSON.stringify(route, null, 2)),
);
$("try-api").addEventListener("click", async () => {
  $("api-response").textContent = "Calculating…";
  try {
    let result;
    if (apiAvailable) {
      const response = await fetch(
        `./api/v1/route?from=${route.origin.lat},${route.origin.lon}&to=${route.destination.lat},${route.destination.lon}&mode=${route.mode}&samples=241`,
        { signal: AbortSignal.timeout(5000) },
      );
      result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "API request failed.");
    } else
      result = solveRoute({
        origin: route.origin,
        destination: route.destination,
        mode: route.mode,
        samples: 241,
      });
    $("api-response").textContent =
      `${apiAvailable ? "// HTTP 200 · REST API" : "// Browser API · identical calculation engine"}\n${JSON.stringify(routePreview(result), null, 2)}`;
  } catch (error) {
    $("api-response").textContent = `Request failed: ${error.message}`;
  }
});

/** Graceful fallback: the calculator and time-correct playback still work without WebGL. */
class SectionFallback {
  constructor(container, onFrame) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "fallback-canvas";
    container.prepend(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.onFrame = onFrame;
    this.progress = 0;
    this.playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.reducedMotion = !this.playing;
    this.playbackSeconds = 22;
    this.showSurface = true;
    this.zoomScale = 1;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.last = performance.now();
    this.tick(this.last);
    toast("Showing a 2D cutaway. WebGL is unavailable on this browser.");
  }
  resize() {
    const b = this.canvas.parentElement.getBoundingClientRect();
    this.w = b.width;
    this.h = b.height;
    this.canvas.width = b.width * devicePixelRatio;
    this.canvas.height = b.height * devicePixelRatio;
    this.canvas.style.width = `${b.width}px`;
    this.canvas.style.height = `${b.height}px`;
  }
  setRoute(r) {
    this.route = r;
    this.frame = routeFrame(r.origin, r.destination);
    this.progress = 0;
  }
  setProgress(f) {
    this.progress = f;
    this.draw();
  }
  setCutaway() {}
  setSurface(v) {
    this.showSurface = v;
  }
  resetView() {
    this.zoomScale = 1;
    this.draw();
  }
  setFlyThrough() {
    toast("The tracking camera needs WebGL. The journey still plays in 2D.");
  }
  zoom(delta) {
    this.zoomScale = Math.max(0.7, Math.min(1.35, this.zoomScale / delta));
    this.draw();
  }
  draw() {
    if (!this.route) return;
    const c = this.ctx,
      w = this.w,
      h = this.h,
      r = Math.min(w * 0.35, h * 0.37) * this.zoomScale,
      cx = w / 2,
      cy = h * 0.48;
    c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    c.clearRect(0, 0, w, h);
    for (const [q, color] of [
      [1, "#204949"],
      [0.985, "#61331e"],
      [0.5462, "#c8722c"],
      [0.1916, "#ffdf8e"],
    ]) {
      c.beginPath();
      c.arc(cx, cy, r * q, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
    }
    const theta = this.frame.theta;
    if (this.showSurface) {
      c.beginPath();
      const start = -Math.PI / 2 - theta / 2;
      for (let i = 0; i <= 100; i++) {
        const a = start + (theta * i) / 100,
          x = cx + r * 1.025 * Math.cos(a),
          y = cy + r * 1.025 * Math.sin(a);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.setLineDash([4, 4]);
      c.strokeStyle = "#85a3b2";
      c.lineWidth = 1;
      c.stroke();
      c.setLineDash([]);
    }
    const project = (f) => {
      const p = pointAt(this.frame, f, this.route.mode);
      const x = p.reduce((s, v, i) => s + v * this.frame.a[i], 0),
        y = p.reduce((s, v, i) => s + v * this.frame.tangent[i], 0);
      const a = -Math.PI / 2 - theta / 2;
      return [
        cx + r * (x * Math.cos(a) - y * Math.sin(a)),
        cy + r * (x * Math.sin(a) + y * Math.cos(a)),
      ];
    };
    c.beginPath();
    for (let i = 0; i <= 200; i++) {
      const [x, y] = project(i / 200);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.strokeStyle = "#c0ff87";
    c.lineWidth = 2;
    c.shadowColor = "#c0ff87";
    c.shadowBlur = 12;
    c.stroke();
    const [x, y] = project(Math.min(1, this.progress));
    c.beginPath();
    c.arc(x, y, 4, 0, Math.PI * 2);
    c.fillStyle = "#efffce";
    c.fill();
    c.shadowBlur = 0;
    const end = [project(0), project(1)];
    for (let i = 0; i < 2; i++) {
      const el = i ? $("destination-marker") : $("origin-marker");
      el.style.left = `${end[i][0]}px`;
      el.style.top = `${end[i][1]}px`;
      const left = end[i][0] > w - 140;
      el.classList.toggle("anchor-left", left);
      el.style.transform = left
        ? "translate(calc(-100% - 13px),-50%)"
        : "translate(13px,-50%)";
    }
    this.onFrame({
      fraction: Math.min(1, this.progress),
      playing: this.playing,
      depth: Math.max(
        0,
        (1 -
          Math.hypot(
            ...pointAt(this.frame, Math.min(1, this.progress), this.route.mode),
          )) *
          EARTH_RADIUS_KM,
      ),
    });
  }
  tick(t) {
    const dt = Math.min((t - this.last) / 1000, 0.05);
    this.last = t;
    if (!document.hidden) {
      if (this.playing && this.route?.travel_time_seconds) {
        this.progress += dt / this.playbackSeconds;
        if (this.progress > 1.075) this.progress = 0;
      }
      this.draw();
    }
    requestAnimationFrame((t) => this.tick(t));
  }
}

updatePlaces();
try {
  scene = new EarthScene(
    $("globe-stage"),
    [$("origin-marker"), $("destination-marker")],
    updateFrame,
  );
} catch (error) {
  console.warn("3D renderer unavailable; using 2D fallback.", error);
  scene = new SectionFallback($("globe-stage"), updateFrame);
  for (const id of ["globe-button", "camera-button"]) {
    $(id).disabled = true;
    $(id).title = "This camera view needs WebGL.";
  }
  document.querySelector(".orbit-hint").textContent = "2D cutaway view";
  $("globe-stage").setAttribute(
    "aria-label",
    "2D Earth cross-section with an animated gravity tunnel.",
  );
}
calculate();
requestAnimationFrame(() => $("scene-loading").classList.add("loaded"));

// Compact, inspectable state for integrations and accessible QA; no network calls.
Object.defineProperty(window, "throughJourney", {
  get: () => ({
    origin: route.origin,
    destination: route.destination,
    mode: route.mode,
    progress: Math.min(1, scene?.progress ?? 0),
    playing: scene?.playing ?? false,
    renderer: scene instanceof EarthScene ? "webgl" : "2d",
    travel_time_seconds: route.travel_time_seconds,
  }),
});
