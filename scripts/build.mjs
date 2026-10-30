import { build } from "esbuild";
import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  outfile: "app.js",
  format: "iife",
  minify: true,
  sourcemap: false,
  target: ["es2022"],
  loader: { ".jpg": "dataurl" },
  legalComments: "eof",
});
await mkdir("dist", { recursive: true });
for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "favicon.svg",
  "openapi.json",
])
  await cp(file, `dist/${file}`);
await writeFile("dist/.nojekyll", "");
// A single-file edition is convenient to share or open without adjacent assets.
const [html, css, js, favicon, spec] = await Promise.all(
  ["index.html", "styles.css", "app.js", "favicon.svg", "openapi.json"].map(
    (file) => readFile(file, "utf8"),
  ),
);
const standalone = html
  .replace(
    '<link rel="stylesheet" href="./styles.css" />',
    () => `<style>${css}</style>`,
  )
  .replace('<script src="./app.js" defer></script>', "")
  .replace(
    'href="./favicon.svg"',
    () => `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`,
  )
  .replace(
    'href="./openapi.json"',
    () => `href="data:application/json,${encodeURIComponent(spec)}"`,
  )
  .replace('class="brand" href="./index.html"', 'class="brand" href="#"')
  .replace(
    "</body>",
    () =>
      `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>\n</body>`,
  );
await writeFile("through-earth.html", standalone);
await writeFile("dist/through-earth.html", standalone);
console.log(
  "Built app.js, standalone through-earth.html and dist/. Ready for local use or GitHub Pages.",
);
