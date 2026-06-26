export const normalizeMockupSelection = (
  indices: Iterable<number> | null | undefined,
  maxExclusive = Number.POSITIVE_INFINITY,
): number[] => {
  if (!indices) return [];

  const max = Number.isFinite(maxExclusive) ? maxExclusive : Number.POSITIVE_INFINITY;

  return Array.from(new Set(indices))
    .filter((index) => (
      Number.isInteger(index)
      && index >= 0
      && index < max
    ))
    .sort((a, b) => a - b);
};
