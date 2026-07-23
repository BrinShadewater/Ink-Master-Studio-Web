import ImageTracer, { type ImageTracerOptions } from 'imagetracerjs';
import type { RgbaFrame } from './backgroundRemovalProcessor';
import { normalizeTraceSettings, type TraceSettings } from './traceModel';

const MAX_TRACE_EDGE = 1_280;

const round = (value: number) => Number(value.toFixed(2));

const hexToPaletteColor = (color: string) => ({
  r: Number.parseInt(color.slice(1, 3), 16),
  g: Number.parseInt(color.slice(3, 5), 16),
  b: Number.parseInt(color.slice(5, 7), 16),
  a: 255,
});

export const mapTraceOptions = (value: TraceSettings): ImageTracerOptions => {
  const settings = normalizeTraceSettings(value);
  const threshold = round(10 - settings.detail * 0.099);
  const options: ImageTracerOptions = {
    numberofcolors: settings.colors,
    ltres: threshold,
    qtres: threshold,
    pathomit: Math.max(0, Math.round(12 - settings.smoothing / 5)),
    blurradius: settings.blur,
    colorsampling: 2,
    viewbox: true,
    strokewidth: 1,
    desc: false,
  };
  if (settings.palette.length > 0) {
    options.pal = settings.palette.map(hexToPaletteColor);
  }
  return options;
};

export const traceRgbaFrame = (
  frame: RgbaFrame,
  settings: TraceSettings,
): string => {
  if (
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1 ||
    Math.max(frame.width, frame.height) > MAX_TRACE_EDGE ||
    !(frame.pixels instanceof Uint8ClampedArray) ||
    frame.pixels.length !== frame.width * frame.height * 4
  ) throw new Error('Invalid trace frame.');

  return ImageTracer.imagedataToSVG({
    width: frame.width,
    height: frame.height,
    data: new Uint8ClampedArray(frame.pixels),
  }, mapTraceOptions(settings));
};
