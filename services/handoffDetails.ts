import { ItemType, PlacementLocation, PlacementMeasurement } from '../types';

const PRODUCT_LABELS: Record<ItemType, string> = {
  [ItemType.TSHIRT]: 'T-shirt',
  [ItemType.HOODIE]: 'Hoodie',
  [ItemType.HAT]: 'Hat',
  [ItemType.MUG]: 'Mug',
  [ItemType.TOTE]: 'Tote',
};

const LOCATION_LABELS: Record<PlacementLocation, string> = {
  front: 'front',
  back: 'back',
  'left-chest': 'left chest',
  sleeve: 'sleeve',
};

const inches = (value: number) => (
  Number.isFinite(value)
    ? Number.parseFloat(value.toFixed(2)).toString()
    : '0'
);

export const formatPlacementSummary = (placement: PlacementMeasurement): string => [
  `${placement.presetId || 'custom'} placement`,
  `${PRODUCT_LABELS[placement.itemType]} ${LOCATION_LABELS[placement.location]}`,
  `size ${placement.garmentSize}`,
  `${inches(placement.widthInches)}×${inches(placement.heightInches)} in`,
  `offset ${inches(placement.offsetXInches)} in horizontal, ${inches(placement.offsetYInches)} in from top`,
].join(' · ');

export const formatPrintSizeSummary = (widthInches: number, heightInches: number): string =>
  `${inches(widthInches)}×${inches(heightInches)} in`;
