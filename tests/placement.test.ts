import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PLACEMENT,
  PLACEMENT_PRESETS,
  applyPlacementPreset,
  combinePreflightFindings,
  createPlacementPreflightFinding,
  ensurePlacementForProduct,
  getPrintableArea,
  mockupPercentToPlacement,
  placementToMockupPercent,
  placementVariantKey,
  storePlacementVariant,
  validatePlacement,
} from '../services/placement';
import {
  createProductionProfile,
  printableAreaKey,
} from '../services/productionProfiles';
import { ItemType, PlacementMeasurement, ProductionProfile } from '../types';

const standardProfile = () => createProductionProfile('Standard DTG');

const smallPlatenProfile = (): ProductionProfile => {
  const profile = standardProfile();
  profile.name = 'Small platen';
  profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')] = {
    widthInches: 10,
    heightInches: 12,
    xPercent: 30,
    yPercent: 18,
    widthPercent: 40,
    heightPercent: 52,
  };
  return profile;
};

test('ships the required DTG placement presets', () => {
  const ids = PLACEMENT_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids, [
    'full-front',
    'center-chest',
    'left-chest',
    'full-back',
    'sleeve',
    'youth',
    'oversized',
  ]);
});

test('creates stable variant keys for product, location, and garment size', () => {
  assert.equal(placementVariantKey(ItemType.TSHIRT, 'front', 'L'), 'TSHIRT:front:L');
});

test('rejects placement dimensions outside the Standard profile printable area', () => {
  const result = validatePlacement({
    ...DEFAULT_PLACEMENT,
    widthInches: 20,
  }, standardProfile());

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('width')));
});

test('converts inch placement into Standard profile calibrated mockup percentages', () => {
  const percent = placementToMockupPercent({
    ...DEFAULT_PLACEMENT,
    widthInches: 12,
    heightInches: 14,
    offsetXInches: 0,
    offsetYInches: 2,
  }, standardProfile());

  assert.ok(percent.width > 20 && percent.width < 60);
  assert.ok(percent.height > 20 && percent.height < 70);
  assert.ok(Math.abs(percent.x + percent.width / 2 - 50) < 0.001);
  assert.ok(percent.y > 10);
});

test('uses a custom profile platen for validation and preview calibration', () => {
  const profile = smallPlatenProfile();

  const invalid = validatePlacement({
    ...DEFAULT_PLACEMENT,
    widthInches: 12,
    heightInches: 10,
    offsetYInches: 0,
  }, profile);
  const percent = placementToMockupPercent({
    ...DEFAULT_PLACEMENT,
    widthInches: 8,
    heightInches: 6,
    offsetYInches: 0,
  }, profile);

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes('10')));
  assert.equal(percent.width, 32);
  assert.ok(percent.width < 40);
  assert.equal(percent.x, 34);
  assert.equal(percent.y, 18);
});

test('uses location-specific areas for the same item type', () => {
  const profile = standardProfile();
  profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'left-chest')] = {
    widthInches: 4,
    heightInches: 5,
    xPercent: 58,
    yPercent: 24,
    widthPercent: 16,
    heightPercent: 20,
  };
  const front = { ...DEFAULT_PLACEMENT, widthInches: 5, heightInches: 4, offsetYInches: 0 };
  const leftChest = { ...front, location: 'left-chest' as const };

  assert.equal(validatePlacement(front, profile).valid, true);
  assert.equal(validatePlacement(leftChest, profile).valid, false);
  assert.notDeepEqual(
    placementToMockupPercent(front, profile),
    placementToMockupPercent({ ...leftChest, widthInches: 4 }, profile),
  );
});

test('reports unsupported product and placement for missing profile areas', () => {
  const profile = standardProfile();
  delete profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')];

  assert.equal(getPrintableArea(ItemType.TSHIRT, 'front', profile), undefined);
  assert.deepEqual(validatePlacement(DEFAULT_PLACEMENT, profile), {
    valid: false,
    errors: ['The selected profile does not support this product and placement.'],
  });
  assert.throws(
    () => placementToMockupPercent(DEFAULT_PLACEMENT, profile),
    /Unsupported product and placement for the applied profile\./,
  );
  assert.throws(
    () => mockupPercentToPlacement(
      { x: 30, y: 20, width: 20, height: 20 },
      DEFAULT_PLACEMENT,
      profile,
    ),
    /Unsupported product and placement for the applied profile\./,
  );
});

test('returns a printable area clone that cannot mutate profile data', () => {
  const profile = smallPlatenProfile();
  const area = getPrintableArea(ItemType.TSHIRT, 'front', profile);
  assert.ok(area);

  area.widthInches = 999;

  assert.equal(
    profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')].widthInches,
    10,
  );
});

test('rejects non-finite placement values and non-positive dimensions', () => {
  const profile = standardProfile();
  const cases: Array<[keyof PlacementMeasurement, number]> = [
    ['widthInches', Number.NaN],
    ['heightInches', Number.POSITIVE_INFINITY],
    ['offsetXInches', Number.NEGATIVE_INFINITY],
    ['offsetYInches', Number.NaN],
    ['widthInches', 0],
    ['heightInches', -1],
  ];

  for (const [key, value] of cases) {
    const result = validatePlacement({ ...DEFAULT_PLACEMENT, [key]: value }, profile);
    assert.equal(result.valid, false, `${key}=${value} must be invalid`);
  }
});

test('accepts exact printable offset boundaries and rejects values beyond them', () => {
  const profile = smallPlatenProfile();
  const exact = {
    ...DEFAULT_PLACEMENT,
    widthInches: 8,
    heightInches: 10,
    offsetXInches: 1,
    offsetYInches: 2,
  };

  assert.equal(validatePlacement(exact, profile).valid, true);
  assert.equal(validatePlacement({ ...exact, offsetXInches: 1.01 }, profile).valid, false);
  assert.equal(validatePlacement({ ...exact, offsetYInches: -0.01 }, profile).valid, false);
  assert.equal(validatePlacement({ ...exact, offsetYInches: 2.01 }, profile).valid, false);
});

test('round-trips calibrated preview percentages within two-decimal placement behavior', () => {
  const profile = smallPlatenProfile();
  const placement: PlacementMeasurement = {
    ...DEFAULT_PLACEMENT,
    widthInches: 8.25,
    heightInches: 7.5,
    offsetXInches: -0.5,
    offsetYInches: 1.25,
  };

  const roundTrip = mockupPercentToPlacement(
    placementToMockupPercent(placement, profile),
    placement,
    profile,
  );

  assert.deepEqual(roundTrip, { ...placement, presetId: 'custom' });
});

test('creates a deterministic critical placement finding with profile context', () => {
  const profile = smallPlatenProfile();
  const finding = createPlacementPreflightFinding({
    ...DEFAULT_PLACEMENT,
    widthInches: 12,
  }, profile);

  assert.equal(finding?.id, 'placement-area');
  assert.equal(finding?.severity, 'critical');
  assert.equal(finding?.title, 'Placement exceeds printable area');
  assert.match(finding?.message ?? '', /Small platen/);
  assert.match(finding?.message ?? '', /10 × 12 in/);
  assert.match(finding?.action ?? '', /reduce dimensions\/offset/i);
  assert.equal(createPlacementPreflightFinding({
    ...DEFAULT_PLACEMENT,
    widthInches: 8,
    heightInches: 8,
    offsetYInches: 0,
  }, profile), null);
});

test('combines placement and artwork findings without duplicate ids', () => {
  const placementFinding = createPlacementPreflightFinding({
    ...DEFAULT_PLACEMENT,
    widthInches: 12,
  }, smallPlatenProfile());
  assert.ok(placementFinding);

  const combined = combinePreflightFindings([
    { ...placementFinding, message: 'stale placement result' },
    {
      id: 'resolution',
      severity: 'pass',
      title: 'Resolution is ready',
      message: 'Ready.',
      action: 'No action needed.',
    },
  ], placementFinding);

  assert.deepEqual(combined.map((finding) => finding.id), ['resolution', 'placement-area']);
  assert.match(combined[1].message, /Small platen/);
});

test('synchronizes a T-shirt placement to a safe HAT variant', () => {
  const profile = standardProfile();
  const placements = {
    [placementVariantKey(ItemType.TSHIRT, 'front', 'L')]: DEFAULT_PLACEMENT,
  };

  const synchronized = ensurePlacementForProduct(
    placements,
    placementVariantKey(ItemType.TSHIRT, 'front', 'L'),
    ItemType.HAT,
    profile,
  );

  assert.equal(synchronized.activePlacementKey, placementVariantKey(ItemType.HAT, 'front', 'L'));
  assert.equal(synchronized.placement.itemType, ItemType.HAT);
  assert.equal(synchronized.placement.location, 'front');
  assert.equal(validatePlacement(synchronized.placement, profile).valid, true);
  assert.deepEqual(placements, {
    [placementVariantKey(ItemType.TSHIRT, 'front', 'L')]: DEFAULT_PLACEMENT,
  });
});

test('reuses an existing matching product placement variant', () => {
  const profile = standardProfile();
  const hatPlacement: PlacementMeasurement = {
    ...DEFAULT_PLACEMENT,
    itemType: ItemType.HAT,
    widthInches: 4,
    heightInches: 2,
    offsetYInches: 0.25,
  };
  const hatKey = placementVariantKey(ItemType.HAT, 'front', 'L');
  const placements = {
    [placementVariantKey(ItemType.TSHIRT, 'front', 'L')]: DEFAULT_PLACEMENT,
    [hatKey]: hatPlacement,
  };

  const synchronized = ensurePlacementForProduct(
    placements,
    placementVariantKey(ItemType.TSHIRT, 'front', 'L'),
    ItemType.HAT,
    profile,
  );

  assert.equal(synchronized.activePlacementKey, hatKey);
  assert.deepEqual(synchronized.placement, hatPlacement);
  assert.notEqual(synchronized.placements, placements);
});

test('falls back to front when the current location is unsupported by the product profile', () => {
  const profile = standardProfile();
  delete profile.printableAreas[printableAreaKey(ItemType.HAT, 'left-chest')];
  const leftChest: PlacementMeasurement = {
    ...DEFAULT_PLACEMENT,
    location: 'left-chest',
    widthInches: 4,
    heightInches: 4,
  };
  const sourceKey = placementVariantKey(ItemType.TSHIRT, 'left-chest', 'L');

  const synchronized = ensurePlacementForProduct(
    { [sourceKey]: leftChest },
    sourceKey,
    ItemType.HAT,
    profile,
  );

  assert.equal(synchronized.placement.location, 'front');
  assert.equal(validatePlacement(synchronized.placement, profile).valid, true);
});

test('applies a preset without replacing the current product', () => {
  const profile = standardProfile();
  const current: PlacementMeasurement = {
    ...DEFAULT_PLACEMENT,
    itemType: ItemType.HAT,
    widthInches: 4,
    heightInches: 2,
    offsetYInches: 0,
  };
  const preset = PLACEMENT_PRESETS.find((candidate) => candidate.id === 'left-chest');
  assert.ok(preset);

  const applied = applyPlacementPreset(preset, current, profile);
  const stored = storePlacementVariant({}, applied);

  assert.equal(applied.itemType, ItemType.HAT);
  assert.equal(stored.activePlacementKey, placementVariantKey(ItemType.HAT, 'left-chest', 'L'));
  assert.deepEqual(stored.placements[stored.activePlacementKey], applied);
  assert.equal(validatePlacement(applied, profile).valid, true);
});

test('conversion functions reject non-finite geometry before calculating percentages', () => {
  const profile = standardProfile();

  assert.throws(
    () => placementToMockupPercent(
      { ...DEFAULT_PLACEMENT, widthInches: Number.NaN },
      profile,
    ),
    /finite numeric values/i,
  );
  assert.throws(
    () => mockupPercentToPlacement(
      { x: 10, y: 10, width: Number.POSITIVE_INFINITY, height: 20 },
      DEFAULT_PLACEMENT,
      profile,
    ),
    /finite numeric values/i,
  );
});
