import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("production build includes compiled Tailwind styles", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const assetNames = await readdir(new URL("../dist/assets/", import.meta.url));
  const cssAsset = assetNames.find((name) => name.endsWith(".css"));

  assert.ok(cssAsset, "expected Vite to emit a CSS asset");
  assert.match(html, /<link[^>]+rel="stylesheet"[^>]+\.css/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);

  const css = await readFile(new URL(`../dist/assets/${cssAsset}`, import.meta.url), "utf8");
  assert.match(css, /\.bg-slate-950/);
  assert.match(css, /\.text-slate-200/);
});
