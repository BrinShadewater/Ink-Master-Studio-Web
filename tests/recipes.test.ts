import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS } from "../constants";
import { recommendRecipe, resolveRecipeSettings } from "../services/recipes";
import { OutputFormat, ShirtColor } from "../types";

const analysis = {
  width: 4200,
  height: 5100,
  hasTransparency: false,
  transparencyCoverage: 0,
  edgeBackground: {
    isUniform: true,
    color: "#101010",
    tone: "dark" as const,
    confidence: 0.96,
  },
  printQuality: { dpi: 300, status: "good" as const, label: "Print Ready" },
  palette: ["#101010", "#F5F5F5", "#D03040"],
  dominantTone: "dark" as const,
  contrastRisk: { darkGarment: true, lightGarment: false },
  vectorSuitability: "possible" as const,
  warnings: [],
};

test("dark garment recipe maps to useful print defaults", () => {
  const settings = resolveRecipeSettings("dark-garment", analysis, DEFAULT_SETTINGS);

  assert.equal(settings.shirtColor, ShirtColor.BLACK);
  assert.equal(settings.format, OutputFormat.PNG);
  assert.equal(settings.preserveTransparency, true);
  assert.equal(settings.bgRemoval, true);
  assert.equal(settings.bgColorOverride, "#101010");
});

test("mockups-only recipe preserves source artwork treatment", () => {
  const settings = resolveRecipeSettings("mockups-only", analysis, DEFAULT_SETTINGS);

  assert.equal(settings.shirtColor, ShirtColor.NONE);
  assert.equal(settings.bgRemoval, false);
  assert.equal(settings.vectorize, false);
  assert.equal(settings.noise, 0);
  assert.equal(settings.grain, 0);
});

test("recommends dark garment treatment for a uniform dark edge", () => {
  const recommendation = recommendRecipe(analysis);

  assert.equal(recommendation.recipeId, "dark-garment");
  assert.ok(recommendation.confidence >= 0.8);
  assert.ok(recommendation.reasons.some((reason) => reason.includes("dark background")));
  assert.ok(recommendation.proposedChanges.length > 0);
});

test("recommends clean logo for transparent limited-palette artwork", () => {
  const recommendation = recommendRecipe({
    ...analysis,
    hasTransparency: true,
    transparencyCoverage: 0.35,
    edgeBackground: {
      isUniform: false,
      color: "#000000",
      tone: "dark",
      confidence: 0.2,
    },
    palette: ["#111111", "#F5F5F5"],
    vectorSuitability: "strong",
  });

  assert.equal(recommendation.recipeId, "clean-logo");
  assert.ok(recommendation.alternatives.includes("custom"));
});
