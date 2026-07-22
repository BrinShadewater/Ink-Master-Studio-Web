export const TEXT_FONT_FAMILIES = ['Arial', 'Georgia', 'Impact', 'Trebuchet MS'] as const;
export const TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const;

type TextFontFamily = typeof TEXT_FONT_FAMILIES[number];
type TextAlignment = typeof TEXT_ALIGNMENTS[number];

export interface NormalizedTextStyle {
  fontFamily: TextFontFamily;
  fontSize: number;
  color: string;
  align: TextAlignment;
  letterSpacing: number;
  outlineWidth: number;
  outlineColor: string;
}

interface TextStyleInput {
  fontFamily?: unknown;
  fontSize?: unknown;
  color?: unknown;
  align?: unknown;
  letterSpacing?: unknown;
  outlineWidth?: unknown;
  outlineColor?: unknown;
}

interface TextStyleNumericFallbacks {
  fontSize?: number;
  letterSpacing?: number;
  outlineWidth?: number;
}

const clamp = (value: unknown, minimum: number, maximum: number, fallback: number) =>
  Math.max(minimum, Math.min(maximum,
    typeof value === 'number' && Number.isFinite(value) ? value : fallback));

const normalizeHexColor = (color: unknown, fallback: string): string => {
  const value = typeof color === 'string' ? color.trim() : '';
  const full = /^#?([0-9a-f]{6})$/i.exec(value);
  if (full) return `#${full[1].toLowerCase()}`;
  const short = /^#?([0-9a-f]{3})$/i.exec(value);
  return short ? `#${short[1].split('').map((character) => character.repeat(2)).join('').toLowerCase()}` : fallback;
};

export const normalizeTextContent = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, 500) : 'Text';

export const normalizeTextStyle = (
  style: TextStyleInput,
  fallbacks: TextStyleNumericFallbacks = {},
): NormalizedTextStyle => ({
  fontFamily: TEXT_FONT_FAMILIES.includes(style.fontFamily as TextFontFamily)
    ? style.fontFamily as TextFontFamily : 'Arial',
  fontSize: clamp(style.fontSize, 8, 400, fallbacks.fontSize ?? 8),
  color: normalizeHexColor(style.color, '#000000'),
  align: TEXT_ALIGNMENTS.includes(style.align as TextAlignment)
    ? style.align as TextAlignment : 'left',
  letterSpacing: clamp(style.letterSpacing, -2, 40, fallbacks.letterSpacing ?? -2),
  outlineWidth: clamp(style.outlineWidth, 0, 20, fallbacks.outlineWidth ?? 0),
  outlineColor: normalizeHexColor(style.outlineColor, '#000000'),
});
