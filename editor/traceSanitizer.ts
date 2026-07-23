import { normalizeHexColor } from './imagePrepModel';
import type { SafeTraceDocument, SafeTracePath } from './traceModel';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const UNSAFE_ERROR = 'Trace output is unsafe.';
const NUMBER_SOURCE = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';
const NUMBER_PATTERN = new RegExp(`^${NUMBER_SOURCE}$`, 'i');
const PATH_TOKEN_PATTERN = new RegExp(`[MLQCZ]|${NUMBER_SOURCE}`, 'gi');
const TRANSFORM_PATTERN = new RegExp(
  `(matrix|translate|rotate|scale)\\(\\s*(${NUMBER_SOURCE}(?:[\\s,]+${NUMBER_SOURCE})*)\\s*\\)`,
  'gi',
);

export interface TraceXmlPlatform {
  DOMParser: new () => DOMParser;
  XMLSerializer: new () => XMLSerializer;
}

const unsafe = (): never => {
  throw new Error(UNSAFE_ERROR);
};

const finiteNumber = (value: string): number => {
  if (!NUMBER_PATTERN.test(value.trim())) return unsafe();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : unsafe();
};

const normalizeColor = (value: string): string => {
  const hex = normalizeHexColor(value);
  if (hex) return hex;
  const rgb = value.trim().match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
  );
  if (!rgb) return unsafe();
  const channels = rgb.slice(1).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return unsafe();
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const normalizePathData = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return unsafe();
  const tokens = trimmed.match(PATH_TOKEN_PATTERN) ?? [];
  const residue = trimmed.replace(PATH_TOKEN_PATTERN, '').replace(/[\s,]+/g, '');
  if (residue || tokens.length === 0 || !tokens.some((token) => /^[MLQCZ]$/i.test(token))) {
    return unsafe();
  }
  for (const token of tokens) {
    if (/^[MLQCZ]$/i.test(token)) continue;
    finiteNumber(token);
  }
  return trimmed;
};

const normalizeTransform = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return unsafe();
  const normalized: string[] = [];
  let consumed = '';
  for (const match of trimmed.matchAll(TRANSFORM_PATTERN)) {
    consumed += match[0];
    const name = match[1].toLowerCase();
    const values = match[2].split(/[\s,]+/).filter(Boolean).map(finiteNumber);
    const validCount =
      (name === 'matrix' && values.length === 6) ||
      (name === 'translate' && (values.length === 1 || values.length === 2)) ||
      (name === 'rotate' && (values.length === 1 || values.length === 3)) ||
      (name === 'scale' && (values.length === 1 || values.length === 2));
    if (!validCount) return unsafe();
    normalized.push(`${name}(${values.join(' ')})`);
  }
  const residue = trimmed
    .replace(TRANSFORM_PATTERN, '')
    .replace(/\s+/g, '');
  if (residue || !consumed || normalized.length === 0) return unsafe();
  return normalized.join(' ');
};

const attributesOf = (element: Element) =>
  Array.from({ length: element.attributes.length }, (_, index) => element.attributes.item(index)!)
    .filter(Boolean);

const ensureAllowedAttributes = (element: Element, allowed: ReadonlySet<string>) => {
  for (const attribute of attributesOf(element)) {
    if (!allowed.has(attribute.name)) return unsafe();
  }
};

const parsePath = (element: Element, parentTransform: string | null): SafeTracePath => {
  ensureAllowedAttributes(element, new Set([
    'd',
    'fill',
    'stroke',
    'stroke-width',
    'opacity',
    'transform',
  ]));
  const fillValue = element.getAttribute('fill');
  if (!fillValue) return unsafe();
  const localTransform = element.hasAttribute('transform')
    ? normalizeTransform(element.getAttribute('transform')!)
    : null;
  const stroke = element.hasAttribute('stroke')
    ? normalizeColor(element.getAttribute('stroke')!)
    : null;
  const strokeWidth = element.hasAttribute('stroke-width')
    ? finiteNumber(element.getAttribute('stroke-width')!)
    : 0;
  const opacity = element.hasAttribute('opacity')
    ? finiteNumber(element.getAttribute('opacity')!)
    : 1;
  if (strokeWidth < 0 || opacity < 0 || opacity > 1) return unsafe();
  return {
    d: normalizePathData(element.getAttribute('d') ?? ''),
    fill: normalizeColor(fillValue),
    stroke,
    strokeWidth,
    opacity,
    transform: [parentTransform, localTransform].filter(Boolean).join(' ') || null,
  };
};

const collectPaths = (
  parent: Element,
  inheritedTransform: string | null,
  paths: SafeTracePath[],
) => {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 3 && !(child.nodeValue ?? '').trim()) continue;
    if (child.nodeType !== 1) return unsafe();
    const element = child as Element;
    if (element.namespaceURI && element.namespaceURI !== SVG_NAMESPACE) return unsafe();
    const name = element.localName || element.nodeName;
    if (name === 'path') {
      paths.push(parsePath(element, inheritedTransform));
      continue;
    }
    if (name !== 'g') return unsafe();
    ensureAllowedAttributes(element, new Set(['transform']));
    const localTransform = element.hasAttribute('transform')
      ? normalizeTransform(element.getAttribute('transform')!)
      : null;
    const composed = [inheritedTransform, localTransform].filter(Boolean).join(' ') || null;
    collectPaths(element, composed, paths);
  }
};

export const sanitizeTraceSvg = (
  markup: string,
  platform: TraceXmlPlatform = {
    DOMParser: globalThis.DOMParser,
    XMLSerializer: globalThis.XMLSerializer,
  },
): SafeTraceDocument => {
  if (typeof markup !== 'string' || !markup.trim() || !platform.DOMParser) return unsafe();
  const parsed = new platform.DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root || (root.localName || root.nodeName) !== 'svg') return unsafe();
  if (root.namespaceURI && root.namespaceURI !== SVG_NAMESPACE) return unsafe();
  ensureAllowedAttributes(root, new Set([
    'xmlns',
    'version',
    'width',
    'height',
    'viewBox',
    'desc',
  ]));
  const viewBox = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(finiteNumber);
  if (viewBox.length !== 4 || viewBox[2] <= 0 || viewBox[3] <= 0) return unsafe();
  const paths: SafeTracePath[] = [];
  collectPaths(root, null, paths);
  if (paths.length === 0) return unsafe();
  return { width: viewBox[2], height: viewBox[3], paths };
};

export const serializeSafeTraceDocument = (
  value: SafeTraceDocument,
  platform: TraceXmlPlatform = {
    DOMParser: globalThis.DOMParser,
    XMLSerializer: globalThis.XMLSerializer,
  },
): string => {
  if (
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    !Array.isArray(value.paths) ||
    value.paths.length === 0
  ) return unsafe();
  const parsed = new platform.DOMParser().parseFromString(
    `<svg xmlns="${SVG_NAMESPACE}"/>`,
    'image/svg+xml',
  );
  const root = parsed.documentElement;
  root.setAttribute('viewBox', `0 0 ${value.width} ${value.height}`);
  root.setAttribute('width', String(value.width));
  root.setAttribute('height', String(value.height));
  for (const candidate of value.paths) {
    const path = parsePathLike(candidate);
    const element = parsed.createElementNS(SVG_NAMESPACE, 'path');
    element.setAttribute('d', path.d);
    element.setAttribute('fill', path.fill);
    if (path.stroke) element.setAttribute('stroke', path.stroke);
    if (path.strokeWidth !== 0) element.setAttribute('stroke-width', String(path.strokeWidth));
    if (path.opacity !== 1) element.setAttribute('opacity', String(path.opacity));
    if (path.transform) element.setAttribute('transform', path.transform);
    root.appendChild(element);
  }
  return new platform.XMLSerializer().serializeToString(parsed);
};

const parsePathLike = (value: SafeTracePath): SafeTracePath => {
  const strokeWidth = Number(value.strokeWidth);
  const opacity = Number(value.opacity);
  if (!Number.isFinite(strokeWidth) || strokeWidth < 0 ||
    !Number.isFinite(opacity) || opacity < 0 || opacity > 1) return unsafe();
  return {
    d: normalizePathData(String(value.d)),
    fill: normalizeColor(String(value.fill)),
    stroke: value.stroke === null ? null : normalizeColor(String(value.stroke)),
    strokeWidth,
    opacity,
    transform: value.transform === null ? null : normalizeTransform(String(value.transform)),
  };
};

export const recolorSafeTraceDocument = (
  document: SafeTraceDocument,
  palette: string[],
): SafeTraceDocument => {
  const swatches = palette
    .map(normalizeHexColor)
    .filter((color): color is string => color !== null);
  if (swatches.length === 0) return structuredClone(document);
  const sourceColors = [...new Set(document.paths.map(({ fill }) => fill))];
  const replacements = new Map(sourceColors.map((color, index) => [
    color,
    swatches[Math.min(index, swatches.length - 1)],
  ]));
  return {
    width: document.width,
    height: document.height,
    paths: document.paths.map((path) => ({
      ...path,
      fill: replacements.get(path.fill) ?? path.fill,
      stroke: path.stroke ? replacements.get(path.stroke) ?? path.stroke : null,
    })),
  };
};
