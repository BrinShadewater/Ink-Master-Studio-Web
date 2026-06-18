import assert from "node:assert/strict";
import test from "node:test";

import { analyzePixelData } from "../services/artworkAnalysis";

const pixels = (
  width: number,
  height: number,
  color: [number, number, number, number],
) => new Uint8ClampedArray(Array.from({ length: width * height }, () => color).flat());

test("detects meaningful transparency coverage", () => {
  const data = pixels(4, 4, [20, 20, 20, 255]);
  for (let i = 0; i < 4; i += 1) data[i * 4 + 3] = 0;

  const analysis = analyzePixelData(data, 4, 4, 1200, 1200);

  assert.equal(analysis.hasTransparency, true);
  assert.equal(analysis.transparencyCoverage, 0.25);
});

test("detects a uniform light edge background", () => {
  const data = pixels(5, 5, [255, 255, 255, 255]);
  const center = (2 * 5 + 2) * 4;
  data.set([25, 35, 55, 255], center);

  const analysis = analyzePixelData(data, 5, 5, 4200, 5100);

  assert.equal(analysis.edgeBackground.isUniform, true);
  assert.equal(analysis.edgeBackground.tone, "light");
  assert.match(analysis.edgeBackground.color, /^#[A-F0-9]{6}$/);
});

test("flags low resolution artwork for a full-front print", () => {
  const analysis = analyzePixelData(
    pixels(3, 3, [80, 100, 120, 255]),
    3,
    3,
    900,
    900,
  );

  assert.equal(analysis.printQuality.status, "poor");
  assert.ok(analysis.warnings.some((warning) => warning.includes("resolution")));
});

test("identifies limited-palette artwork as vector suitable", () => {
  const data = pixels(4, 4, [0, 0, 0, 255]);
  for (let i = 0; i < 8; i += 1) {
    const offset = i * 4;
    data.set([255, 255, 255, 255], offset);
  }

  const analysis = analyzePixelData(data, 4, 4, 4200, 5100);

  assert.equal(analysis.palette.length, 2);
  assert.equal(analysis.vectorSuitability, "strong");
});
