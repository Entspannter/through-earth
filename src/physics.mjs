/** Exact gravity brachistochrone in a non-rotating, uniform-density sphere.
 * Units: kilometres, seconds; Cartesian positions normalized to Earth radius.
 * Hypocycloid parameter is proportional to elapsed physical time.
 */
export const EARTH_RADIUS_KM = 6371;
export const SURFACE_GRAVITY = 9.80665;
export const MODEL = Object.freeze({
  id: "uniform-density-v1",
  radius_km: EARTH_RADIUS_KM,
  surface_gravity_m_s2: SURFACE_GRAVITY,
  assumptions: [
    "Spherical, non-rotating Earth with uniform density",
    "Evacuated tunnel; no friction, drag, propulsion or speed limit",
    "Released from rest; ideal guide forces do no work",
    "Geological layers are visual context, not a density model",
  ],
  reference: "https://doi.org/10.1119/1.4898780",
});

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

export function validatePoint(value, name = "point") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError(`${name} must contain lat and lon.`);
  const { lat, lon } = value;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90)
    throw new InputError(`${name}.lat must be a number between -90 and 90.`);
  if (
    typeof lon !== "number" ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180
  )
    throw new InputError(`${name}.lon must be a number between -180 and 180.`);
  if (
    value.name !== undefined &&
    (typeof value.name !== "string" || value.name.length > 120)
  )
    throw new InputError(
      `${name}.name must be a string of at most 120 characters.`,
    );
  return { lat, lon, ...(value.name ? { name: value.name } : {}) };
}

export function toVector({ lat, lon }) {
  const a = (lat * Math.PI) / 180,
    b = (lon * Math.PI) / 180;
  return [Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b)];
}
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const magnitude = (a) => Math.hypot(...a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function routeFrame(origin, destination) {
  const a = toVector(origin),
    b = toVector(destination);
  const c = a.map((v, i) => v - b[i]);
  // atan2 remains stable for both tiny separations and antipodes.
  const cross = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const theta = Math.atan2(magnitude(cross), clamp(dot(a, b), -1, 1));
  let tangent = b.map((v, i) => v - dot(a, b) * a[i]);
  if (magnitude(tangent) < 1e-10) {
    const ref = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    tangent = ref.map((v, i) => v - dot(ref, a) * a[i]);
  }
  const n = magnitude(tangent);
  return {
    a,
    b,
    tangent: tangent.map((v) => v / n),
    theta,
    coincident: magnitude(c) < 1e-12,
  };
}

export function pointAt(frame, fraction, mode = "fastest") {
  const f = clamp(fraction, 0, 1),
    { a, b, tangent, theta } = frame;
  if (frame.coincident || f === 0) return [...a];
  if (f === 1) return [...b];
  if (mode === "straight") {
    const t = (1 - Math.cos(Math.PI * f)) / 2;
    return a.map((v, i) => v * (1 - t) + b[i] * t);
  }
  const q = theta / (2 * Math.PI);
  const u = theta * f,
    v = (2 * Math.PI - theta) * f;
  const x = (1 - q) * Math.cos(u) + q * Math.cos(v);
  const y = (1 - q) * Math.sin(u) - q * Math.sin(v);
  return a.map((v, i) => v * x + tangent[i] * y);
}

export function surfaceAt(frame, fraction) {
  const t = frame.theta * fraction;
  return frame.a.map(
    (v, i) => v * Math.cos(t) + frame.tangent[i] * Math.sin(t),
  );
}

export function solveRoute(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new InputError("Expected a JSON object.");
  const origin = validatePoint(input.origin, "origin");
  const destination = validatePoint(input.destination, "destination");
  const mode = input.mode ?? "fastest";
  if (!["fastest", "straight"].includes(mode))
    throw new InputError("mode must be fastest or straight.");
  const samples = input.samples ?? 241;
  if (!Number.isInteger(samples) || samples < 2 || samples > 1025)
    throw new InputError("samples must be an integer between 2 and 1025.");
  const frame = routeFrame(origin, destination);
  const theta = frame.theta,
    same = frame.coincident;
  const baseTime =
    Math.PI * Math.sqrt((EARTH_RADIUS_KM * 1000) / SURFACE_GRAVITY);
  const minRadius =
    mode === "fastest" ? 1 - theta / Math.PI : Math.cos(theta / 2);
  const time = same
    ? 0
    : mode === "fastest"
      ? Math.sqrt(
          ((EARTH_RADIUS_KM * 1000) / SURFACE_GRAVITY) *
            theta *
            (2 * Math.PI - theta),
        )
      : baseTime;
  const distance = same
    ? 0
    : mode === "fastest"
      ? (2 * EARTH_RADIUS_KM * theta * (2 * Math.PI - theta)) / Math.PI ** 2
      : 2 * EARTH_RADIUS_KM * Math.sin(theta / 2);
  const speed = same
    ? 0
    : Math.sqrt(
        SURFACE_GRAVITY *
          EARTH_RADIUS_KM *
          1000 *
          Math.max(0, 1 - minRadius ** 2),
      ) / 1000;
  const path = Array.from({ length: samples }, (_, i) => {
    const f = i / (samples - 1),
      xyz = pointAt(frame, f, mode),
      r = clamp(magnitude(xyz), 0, 1);
    return {
      fraction: f,
      elapsed_seconds: f * time,
      x: xyz[0],
      y: xyz[1],
      z: xyz[2],
      depth_km: Math.max(0, EARTH_RADIUS_KM * (1 - r)),
      speed_km_s:
        i === 0 || i === samples - 1
          ? 0
          : Math.sqrt(
              Math.max(
                0,
                SURFACE_GRAVITY * EARTH_RADIUS_KM * 1000 * (1 - r * r),
              ),
            ) / 1000,
    };
  });
  return {
    origin,
    destination,
    mode,
    model: MODEL,
    central_angle_degrees: (theta * 180) / Math.PI,
    travel_time_seconds: time,
    tunnel_distance_km: distance,
    surface_distance_km: theta * EARTH_RADIUS_KM,
    max_depth_km: same ? 0 : EARTH_RADIUS_KM * (1 - minRadius),
    max_speed_km_s: speed,
    straight_tunnel_time_seconds: same ? 0 : baseTime,
    savings_vs_straight_seconds: same ? 0 : baseTime - time,
    path_coordinate_system:
      "Earth-centered, Earth-radius units: x=(0N,0E), y=north pole, z=(0N,90W)",
    path_sampling: "Uniform elapsed time, including both surface endpoints",
    path,
  };
}
