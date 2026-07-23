export type CompareBackground = 'neutral' | 'light' | 'dark';

export const COMPARE_MIN_SELECTION = 2;
export const COMPARE_MAX_SELECTION = 4;
export const COMPARE_MIN_ZOOM = 50;
export const COMPARE_MAX_ZOOM = 150;
export const DEFAULT_COMPARE_ZOOM = 100;

const uniqueProjectOrder = (ids: string[]) => [...new Set(ids)];

export const createCompareSelection = (
  variationIds: string[],
  activeVariationId: string,
): string[] => {
  const order = uniqueProjectOrder(variationIds);
  if (order.length < COMPARE_MIN_SELECTION) return [];

  const activeIndex = order.indexOf(activeVariationId);
  if (activeIndex < 0) return order.slice(0, COMPARE_MIN_SELECTION);
  const siblingIndex = activeIndex < order.length - 1 ? activeIndex + 1 : activeIndex - 1;
  return [order[activeIndex], order[siblingIndex]].sort(
    (left, right) => order.indexOf(left) - order.indexOf(right),
  );
};

export const reconcileCompareSelection = (
  selectedVariationIds: string[],
  variationIds: string[],
  activeVariationId: string,
): string[] => {
  const order = uniqueProjectOrder(variationIds);
  if (order.length < COMPARE_MIN_SELECTION) return [];

  const selected = new Set(selectedVariationIds);
  const valid = order.filter((id) => selected.has(id)).slice(0, COMPARE_MAX_SELECTION);
  if (valid.length >= COMPARE_MIN_SELECTION) return valid;

  const fallback = createCompareSelection(order, activeVariationId);
  for (const id of fallback) {
    if (!valid.includes(id)) valid.push(id);
    if (valid.length === COMPARE_MIN_SELECTION) break;
  }
  if (valid.length >= COMPARE_MIN_SELECTION) {
    return order.filter((id) => valid.includes(id));
  }
  for (const id of order) {
    if (!valid.includes(id)) valid.push(id);
    if (valid.length === COMPARE_MIN_SELECTION) break;
  }
  return order.filter((id) => valid.includes(id));
};

export const toggleCompareVariation = (
  selectedVariationIds: string[],
  variationId: string,
  checked: boolean,
  variationIds: string[],
): string[] => {
  const order = uniqueProjectOrder(variationIds);
  const selected = reconcileCompareSelection(
    selectedVariationIds,
    order,
    selectedVariationIds[0] ?? order[0] ?? '',
  );
  if (!order.includes(variationId) || selected.length < COMPARE_MIN_SELECTION) return selected;

  const selectedSet = new Set(selected);
  if (checked) {
    if (selectedSet.has(variationId) || selectedSet.size >= COMPARE_MAX_SELECTION) return selected;
    selectedSet.add(variationId);
  } else {
    if (!selectedSet.has(variationId) || selectedSet.size <= COMPARE_MIN_SELECTION) return selected;
    selectedSet.delete(variationId);
  }
  return order.filter((id) => selectedSet.has(id));
};

export const normalizeCompareZoom = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_COMPARE_ZOOM;
  return Math.max(COMPARE_MIN_ZOOM, Math.min(COMPARE_MAX_ZOOM, Math.round(value)));
};
