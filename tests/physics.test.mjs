import { test } from "node:test";
import assert from "node:assert/strict";
import {
  solveRoute,
  routeFrame,
  pointAt,
  toVector,
  InputError,
  EARTH_RADIUS_KM as R,
  SURFACE_GRAVITY as g,
} from "../src/physics.mjs";
const a = { lat: -33.9249, lon: 18.4241 },
  b = { lat: 47.3769, lon: 8.5417 };
const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected} (tol ${tolerance})`,
  );
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test("Cape Town–Zurich: physical endpoints, rest-to-rest and shorter time than chord", () => {
  const r = solveRoute({ origin: a, destination: b });
  assert.ok(r.travel_time_seconds > 2100 && r.travel_time_seconds < 2200);
  assert.ok(r.travel_time_seconds < r.straight_tunnel_time_seconds);
  assert.ok(r.max_depth_km > 2800 && r.max_depth_km < 3000);
  assert.ok(
    r.tunnel_distance_km >
      2 * R * Math.sin((r.central_angle_degrees * Math.PI) / 360),
  );
  for (const [p, v] of [
    [r.path[0], toVector(a)],
    [r.path.at(-1), toVector(b)],
  ]) {
    near(distance([p.x, p.y, p.z], v), 0);
    near(p.depth_km, 0);
    near(p.speed_km_s, 0);
  }
});
test("antipodal solution is a diameter and coincides with straight-tunnel time", () => {
  const r = solveRoute({
    origin: { lat: 0, lon: 0 },
    destination: { lat: 0, lon: 180 },
    samples: 101,
  });
  near(r.travel_time_seconds, Math.PI * Math.sqrt((R * 1000) / g));
  near(r.tunnel_distance_km, 2 * R);
  near(r.max_depth_km, R);
  near(r.max_speed_km_s, Math.sqrt(g * R * 1000) / 1000);
  near(Math.hypot(r.path[50].x, r.path[50].y, r.path[50].z), 0);
  for (const p of r.path) {
    near(p.y, 0);
    near(p.z, 0);
  }
});
test("all nonzero straight chords have the same half-period", () => {
  const expected = Math.PI * Math.sqrt((R * 1000) / g);
  for (const lon of [0.00001, 1, 45, 90, 150, 180]) {
    const r = solveRoute({
      origin: { lat: 0, lon: 0 },
      destination: { lat: 0, lon },
      mode: "straight",
      samples: 101,
    });
    near(r.travel_time_seconds, expected);
    near(r.tunnel_distance_km, 2 * R * Math.sin((lon * Math.PI) / 360));
    near(r.max_depth_km, R * (1 - Math.cos((lon * Math.PI) / 360)));
  }
});
test("coincident points and equivalent longitudes have zero duration and distance", () => {
  for (const [origin, destination] of [
    [a, a],
    [
      { lat: 0, lon: -180 },
      { lat: 0, lon: 180 },
    ],
    [
      { lat: 90, lon: -100 },
      { lat: 90, lon: 100 },
    ],
  ]) {
    const r = solveRoute({ origin, destination });
    near(r.travel_time_seconds, 0);
    near(r.tunnel_distance_km, 0);
    near(r.max_speed_km_s, 0);
    assert.ok(r.path.every((p) => Number.isFinite(p.x) && p.speed_km_s < 1e-6));
  }
});
test("near-coincident and near-antipodal calculations are finite and inside sphere", () => {
  for (const destination of [
    { lat: a.lat + 1e-7, lon: a.lon },
    { lat: -a.lat, lon: a.lon - 180 + 1e-7 },
    { lat: 90, lon: 0 },
  ]) {
    const r = solveRoute({ origin: a, destination, samples: 101 });
    assert.ok(r.travel_time_seconds > 0);
    for (const p of r.path) {
      assert.ok(
        [p.x, p.y, p.z, p.speed_km_s, p.depth_km].every(Number.isFinite),
      );
      assert.ok(Math.hypot(p.x, p.y, p.z) <= 1 + 1e-12);
    }
  }
});
test("uniform-time samples satisfy energy conservation and analytic maximum depth", () => {
  const r = solveRoute({ origin: a, destination: b, samples: 101 });
  for (const p of r.path) {
    near(p.elapsed_seconds, p.fraction * r.travel_time_seconds);
    near(
      (p.speed_km_s * 1000) ** 2,
      g * R * 1000 * (1 - p.x ** 2 - p.y ** 2 - p.z ** 2),
      1e-6,
    );
  }
  near(r.path[50].depth_km, r.max_depth_km);
  near(r.path[50].speed_km_s, r.max_speed_km_s);
});
test("analytic tunnel length agrees with independently summed segments", () => {
  for (const mode of ["fastest", "straight"]) {
    const r = solveRoute({ origin: a, destination: b, mode, samples: 1025 });
    const length = r.path
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum +
          R *
            distance([p.x, p.y, p.z], [r.path[i].x, r.path[i].y, r.path[i].z]),
        0,
      );
    near(length, r.tunnel_distance_km, 0.02);
  }
});
test("independent midpoint ds/v integration agrees with analytic travel time", () => {
  for (const mode of ["fastest", "straight"]) {
    const frame = routeFrame(a, b),
      result = solveRoute({ origin: a, destination: b, mode, samples: 2 });
    let time = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const p = pointAt(frame, (i + 0.5) / n, mode),
        left = pointAt(frame, i / n, mode),
        right = pointAt(frame, (i + 1) / n, mode);
      const velocity = Math.sqrt(
        Math.max(0, g * R * 1000 * (1 - p.reduce((s, v) => s + v * v, 0))),
      );
      time += (distance(left, right) * R * 1000) / velocity;
    }
    near(time, result.travel_time_seconds, 0.01);
  }
});
test("reverse journey preserves time, length and reversed geometry", () => {
  const r = solveRoute({ origin: a, destination: b, samples: 101 }),
    s = solveRoute({ origin: b, destination: a, samples: 101 });
  near(r.travel_time_seconds, s.travel_time_seconds);
  near(r.tunnel_distance_km, s.tunnel_distance_km);
  r.path.forEach((p, i) => {
    const q = s.path[100 - i];
    near(distance([p.x, p.y, p.z], [q.x, q.y, q.z]), 0);
  });
});
test("invalid inputs are rejected, including coercion, out-of-range and oversized samples", () => {
  for (const input of [
    null,
    [],
    {},
    { origin: { lat: "1", lon: 0 }, destination: b },
    { origin: { lat: 91, lon: 0 }, destination: b },
    { origin: { lat: 0, lon: NaN }, destination: b },
    { origin: a, destination: b, mode: "magic" },
    { origin: a, destination: b, samples: 1 },
    { origin: a, destination: b, samples: 1026 },
    { origin: a, destination: b, samples: 2.5 },
  ])
    assert.throws(() => solveRoute(input), InputError);
});
