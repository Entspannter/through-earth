import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { solveRoute, InputError, MODEL } from "./src/physics.mjs";
import { parseLocation, searchLocations } from "./src/locations.mjs";

const ROOT = new URL("./", import.meta.url);
const API_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...API_HEADERS, ...extra },
  });

async function boundedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Expected a JSON request body.");
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32768) {
        await reader.cancel();
        throw new InputError("Request body must be at most 32 KiB.");
      }
      parts.push(value);
    }
    const all = new Uint8Array(length);
    let offset = 0;
    for (const chunk of parts) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(all));
    } catch {
      throw new InputError("Request body must be valid JSON.");
    }
  } finally {
    reader.releaseLock();
  }
}

export async function handleRequest(request) {
  const url = new URL(request.url),
    path = url.pathname.replace(/\/$/, "");
  if (path.startsWith("/api/")) {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: API_HEADERS });
    try {
      if (path === "/api/v1/health") {
        if (request.method !== "GET")
          return json({ error: "Method not allowed." }, 405, {
            allow: "GET, OPTIONS",
          });
        return json({ status: "ok", version: "1.0.0", model: MODEL.id });
      }
      if (path === "/api/v1/locations") {
        if (request.method !== "GET")
          return json({ error: "Method not allowed." }, 405, {
            allow: "GET, OPTIONS",
          });
        return json({
          locations: searchLocations(url.searchParams.get("q") ?? ""),
        });
      }
      if (path === "/api/v1/route") {
        let input;
        if (request.method === "GET") {
          const from = url.searchParams.get("from"),
            to = url.searchParams.get("to");
          if (!from || !to)
            throw new InputError(
              "Provide from and to as city IDs or latitude,longitude pairs.",
            );
          for (const key of ["from", "to", "mode", "samples"])
            if (url.searchParams.getAll(key).length > 1)
              throw new InputError(`${key} must appear only once.`);
          const origin = parseLocation(from),
            destination = parseLocation(to);
          if (!origin || !destination)
            throw new InputError(
              "Unknown city or invalid coordinates. Use a city ID or latitude,longitude in valid ranges.",
            );
          const samples = url.searchParams.has("samples")
            ? Number(url.searchParams.get("samples"))
            : 241;
          input = {
            origin,
            destination,
            mode: url.searchParams.get("mode") ?? "fastest",
            samples,
          };
        } else if (request.method === "POST") {
          if (
            !request.headers
              .get("content-type")
              ?.toLowerCase()
              .startsWith("application/json")
          )
            return json({ error: "Use Content-Type: application/json." }, 415);
          input = await boundedBody(request);
        } else
          return json({ error: "Method not allowed." }, 405, {
            allow: "GET, POST, OPTIONS",
          });
        return json(solveRoute(input));
      }
      return json({ error: "Endpoint not found. See /openapi.json." }, 404);
    } catch (error) {
      if (error instanceof InputError)
        return json({ error: error.message }, 400);
      console.error("API error:", error);
      return json({ error: "Internal server error." }, 500);
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  const files = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/through-earth.html": ["through-earth.html", "text/html; charset=utf-8"],
    "/styles.css": ["styles.css", "text/css; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/favicon.svg": ["favicon.svg", "image/svg+xml"],
    "/openapi.json": ["openapi.json", "application/json; charset=utf-8"],
  };
  const file = files[url.pathname];
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(new URL(file[0], ROOT));
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": file[1],
        "x-content-type-options": "nosniff",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response("Build missing. Run npm run build first.", {
      status: 503,
    });
  }
}

export function startServer({
  port = Number(process.env.PORT ?? 4173),
  host = process.env.HOST ?? "127.0.0.1",
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("PORT must be between 0 and 65535.");
  const server = http.createServer(async (req, res) => {
    try {
      const body = ["GET", "HEAD"].includes(req.method)
        ? undefined
        : Readable.toWeb(req);
      const request = new Request(
        new URL(req.url, `http://${req.headers.host ?? "localhost"}`),
        {
          method: req.method,
          headers: req.headers,
          body,
          ...(body ? { duplex: "half" } : {}),
        },
      );
      const response = await handleRequest(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body)
        for await (const chunk of response.body) res.write(chunk);
      res.end();
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end("Request failed.");
    }
  });
  server.listen(port, host, () =>
    console.log(
      `through · http://${host}:${server.address().port}\nREST API · /api/v1/route · OpenAPI · /openapi.json`,
    ),
  );
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startServer();
