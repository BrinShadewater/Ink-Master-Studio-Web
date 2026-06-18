import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS } from "../constants";
import { migrateStoredRecipes } from "../services/recipeStorage";

test("migrates legacy presets into user recipes", () => {
  const result = migrateStoredRecipes(
    JSON.stringify([
      {
        id: "old-1",
        name: "My dark shirt",
        description: "Works for my shop",
        createdAt: 123,
        settings: { ...DEFAULT_SETTINGS, threshold: 44 },
      },
    ]),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].source, "user");
  assert.equal(result[0].settings.threshold, 44);
});

test("fills missing legacy settings from current defaults", () => {
  const result = migrateStoredRecipes(
    JSON.stringify([
      {
        id: "partial",
        name: "Partial",
        description: "",
        createdAt: 123,
        settings: { threshold: 55 },
      },
    ]),
  );

  assert.equal(result[0].settings.threshold, 55);
  assert.equal(result[0].settings.preserveTransparency, DEFAULT_SETTINGS.preserveTransparency);
});

test("returns an empty list for malformed or absent storage", () => {
  assert.deepEqual(migrateStoredRecipes(null), []);
  assert.deepEqual(migrateStoredRecipes("{bad json"), []);
  assert.deepEqual(migrateStoredRecipes(JSON.stringify({ nope: true })), []);
});
