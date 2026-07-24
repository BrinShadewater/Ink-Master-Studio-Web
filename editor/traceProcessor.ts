import ImageTracer, { type ImageTracerOptions } from 'imagetracerjs';
import type { RgbaFrame } from './backgroundRemovalProcessor';
import { normalizeTraceSettings, type TraceSettings } from './traceModel';

export const MAX_TRACE_EDGE = 1_280;

const round = (value: number) => Number(value.toFixed(2));

export const mapTraceOptions = (value: TraceSettings): ImageTracerOptions => {
  const settings = normalizeTraceSettings(value);
  const threshold = round(10 - settings.detail * 0.099);
  return {
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
