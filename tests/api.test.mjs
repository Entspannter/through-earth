import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../server.mjs";
const request = (path, options) =>
  handleRequest(new Request(`http://localhost${path}`, options));

test("GET route accepts city IDs and returns the documented units and CORS", async () => {
  const response = await request(
    "/api/v1/route?from=cape-town&to=zurich&samples=101",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const r = await response.json();
  assert.equal(r.path.length, 101);
  assert.equal(r.origin.name, "Cape Town");
  assert.equal(r.destination.name, "Zurich");
  assert.equal(r.model.id, "uniform-density-v1");
});
test("POST and GET return the same calculation", async () => {
  const get = await (
    await request(
      "/api/v1/route?from=-33.9249,18.4241&to=47.3769,8.5417&mode=straight&samples=2",
    )
  ).json();
  const post = await (
    await request("/api/v1/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        origin: { lat: -33.9249, lon: 18.4241 },
        destination: { lat: 47.3769, lon: 8.5417 },
        mode: "straight",
        samples: 2,
      }),
    })
  ).json();
  assert.equal(get.travel_time_seconds, post.travel_time_seconds);
  assert.deepEqual(get.path, post.path);
});
test("health and diacritic-insensitive location search work", async () => {
  assert.equal((await (await request("/api/v1/health")).json()).status, "ok");
  const r = await (await request("/api/v1/locations?q=dusseldorf")).json();
  assert.equal(r.locations[0].name, "Düsseldorf");
});
test("invalid coordinates, query parameters and sample counts yield useful 400 responses", async () => {
  for (const query of [
    "",
    "?from=foo&to=zurich",
    "?from=0,181&to=zurich",
    "?from=,0&to=zurich",
    "?from=0,0&to=zurich&samples=NaN",
    "?from=0,0&to=zurich&samples=1026",
    "?from=0,0&to=zurich&mode=hyperdrive",
    "?from=0,0&from=1,1&to=zurich",
  ]) {
    const r = await request(`/api/v1/route${query}`);
    assert.equal(r.status, 400, query);
    assert.ok((await r.json()).error.length > 5);
  }
});
test("malformed JSON, wrong content type and too-large bodies are rejected", async () => {
  assert.equal(
    (
      await request("/api/v1/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{broken",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/v1/route", { method: "POST", body: "{}" })).status,
    415,
  );
  assert.equal(
    (
      await request("/api/v1/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oversize: "x".repeat(33000) }),
      })
    ).status,
    400,
  );
});
test("OPTIONS, unknown paths and unsupported methods return expected statuses", async () => {
  assert.equal(
    (await request("/api/v1/route", { method: "OPTIONS" })).status,
    204,
  );
  assert.equal((await request("/api/v1/missing")).status, 404);
  assert.equal(
    (await request("/api/v1/route", { method: "DELETE" })).status,
    405,
  );
  assert.equal((await request("/.git/config")).status, 404);
});
