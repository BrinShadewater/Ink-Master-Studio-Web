import { CANONICAL_DESIGN_SIZE } from './canonicalSurface';
import { getTraceLayerDrawRect } from './geometry';
import type {
  DesignLayer,
  DesignVariation,
  EditorAsset,
  TextLayer,
  TraceLayer,
} from './model';
import {
  sanitizeTraceSvg,
  type TraceXmlPlatform,
} from './traceSanitizer';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const EXPORT_ERROR = 'Could not create a safe SVG master.';
const NUMBER_SOURCE = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';
const TRANSFORM_PATTERN = new RegExp(
  `(matrix|translate|rotate|scale)\\(\\s*(${NUMBER_SOURCE}(?:[\\s,]+${NUMBER_SOURCE})*)\\s*\\)`,
  'gi',
);

export interface XmlPlatform extends TraceXmlPlatform {}

export interface SvgExportEligibility {
  eligible: boolean;
  blockers: Array<{ layerId: string | null; message: string }>;
}

const fail = (): never => {
  throw new Error(EXPORT_ERROR);
};

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return fail();
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

const layerLabel = (layer: DesignLayer) =>
  layer.name.trim() || (layer.type === 'image' ? 'Image' : layer.type === 'trace' ? 'Trace' : 'Text');

export const getSvgExportEligibility = (
  variation: DesignVariation,
  assetsById: Record<string, EditorAsset>,
): SvgExportEligibility => {
  const blockers: SvgExportEligibility['blockers'] = [];
  let visibleVectorContent = 0;
  if (variation.look.id !== 'original') {
    blockers.push({
      layerId: null,
      message: "Set this variation's Look to Original before exporting SVG.",
    });
  }
  for (const layer of variation.layers) {
    if (!layer.visible) continue;
    if (layer.type === 'image') {
      blockers.push({
        layerId: layer.id,
        message: `Hide or trace ${layerLabel(layer)} before exporting SVG.`,
      });
      continue;
    }
    if (layer.type === 'trace') {
      const asset = layer.svgAssetId ? assetsById[layer.svgAssetId] : null;
      if (
        !asset ||
        asset.role !== 'trace-svg' ||
        asset.mimeType !== 'image/svg+xml'
      ) {
        blockers.push({
          layerId: layer.id,
          message: `Update ${layerLabel(layer)} before exporting SVG.`,
        });
      } else {
        visibleVectorContent += 1;
      }
      continue;
    }
    if (layer.text.trim().length > 0) visibleVectorContent += 1;
  }
  if (visibleVectorContent === 0) {
    blockers.push({
      layerId: null,
      message: 'Show at least one trace or text layer before exporting SVG.',
    });
  }
  return { eligible: blockers.length === 0, blockers };
};

const createElement = (document: Document, name: string) =>
  document.createElementNS(SVG_NAMESPACE, name);

const traceLayerTransform = (
  layer: TraceLayer,
  documentWidth: number,
  documentHeight: number,
) => {
  const rect = getTraceLayerDrawRect(
    layer.sourceFrame,
    CANONICAL_DESIGN_SIZE,
    layer.transform,
  );
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return [
    `translate(${formatNumber(centerX)} ${formatNumber(centerY)})`,
    `rotate(${formatNumber(layer.transform.rotation)})`,
    `scale(${layer.transform.flipX ? -1 : 1} ${layer.transform.flipY ? -1 : 1})`,
    `translate(${formatNumber(-rect.width / 2)} ${formatNumber(-rect.height / 2)})`,
    `scale(${formatNumber(rect.width / documentWidth)} ${formatNumber(rect.height / documentHeight)})`,
  ].join(' ');
};

const appendTraceLayer = async (
  root: Element,
  layer: TraceLayer,
  asset: EditorAsset,
  xml: XmlPlatform,
) => {
  const safe = sanitizeTraceSvg(await asset.blob.text(), xml);
  const group = createElement(root.ownerDocument!, 'g');
  group.setAttribute('data-layer-id', layer.id);
  group.setAttribute('opacity', formatNumber(layer.opacity));
  group.setAttribute(
    'transform',
    traceLayerTransform(layer, safe.width, safe.height),
  );
  for (const path of safe.paths) {
    const element = createElement(root.ownerDocument!, 'path');
    element.setAttribute('d', path.d);
    element.setAttribute('fill', path.fill);
    if (path.stroke) element.setAttribute('stroke', path.stroke);
    if (path.strokeWidth > 0) {
      element.setAttribute('stroke-width', formatNumber(path.strokeWidth));
    }
    if (path.opacity !== 1) element.setAttribute('opacity', formatNumber(path.opacity));
    if (path.transform) element.setAttribute('transform', path.transform);
    group.appendChild(element);
  }
  root.appendChild(group);
};

const estimateLineWidth = (line: string, layer: TextLayer) => {
  const characters = Array.from(line);
  if (characters.length === 0) return 0;
  return characters.length * layer.fontSize * 0.6 +
    Math.max(0, characters.length - 1) * layer.letterSpacing;
};

const textLayerTransform = (layer: TextLayer) => [
  `translate(${formatNumber(layer.transform.x * CANONICAL_DESIGN_SIZE.width)} ${formatNumber(layer.transform.y * CANONICAL_DESIGN_SIZE.height)})`,
  `rotate(${formatNumber(layer.transform.rotation)})`,
  `scale(${formatNumber((layer.transform.flipX ? -1 : 1) * layer.transform.scale)} ${formatNumber((layer.transform.flipY ? -1 : 1) * layer.transform.scale)})`,
].join(' ');

const appendTextLayer = (
  root: Element,
  layer: TextLayer,
) => {
  const document = root.ownerDocument!;
  const group = createElement(document, 'g');
  group.setAttribute('data-layer-id', layer.id);
  group.setAttribute('opacity', formatNumber(layer.opacity));
  group.setAttribute('transform', textLayerTransform(layer));
  const text = createElement(document, 'text');
  const fontFamily = layer.fontFamily.includes(' ')
    ? `'${layer.fontFamily}'`
    : layer.fontFamily;
  text.setAttribute('font-family', `${fontFamily}, sans-serif`);
  text.setAttribute('font-size', formatNumber(layer.fontSize));
  text.setAttribute('fill', layer.color);
  text.setAttribute('letter-spacing', formatNumber(layer.letterSpacing));
  text.setAttribute(
    'text-anchor',
    layer.align === 'center' ? 'middle' : layer.align === 'right' ? 'end' : 'start',
  );
  text.setAttributeNS(XML_NAMESPACE, 'xml:space', 'preserve');
  if (layer.outlineWidth > 0) {
    text.setAttribute('stroke', layer.outlineColor);
    text.setAttribute('stroke-width', formatNumber(layer.outlineWidth));
  }
  const lines = layer.text.split('\n');
  const lineHeight = layer.fontSize * 1.2;
  const contentHeight = lines.length * lineHeight;
  const blockWidth = Math.max(0, ...lines.map((line) => estimateLineWidth(line, layer)));
  const x = layer.align === 'center'
    ? 0
    : layer.align === 'right' ? blockWidth / 2 : -blockWidth / 2;
  lines.forEach((line, index) => {
    const tspan = createElement(document, 'tspan');
    tspan.setAttribute('x', formatNumber(x));
    tspan.setAttribute(
      'y',
      formatNumber(-contentHeight / 2 + lineHeight * index + layer.fontSize),
    );
    tspan.appendChild(document.createTextNode(line));
    text.appendChild(tspan);
  });
  group.appendChild(text);
  root.appendChild(group);
};

const allowedAttributes: Record<string, ReadonlySet<string>> = {
  svg: new Set(['xmlns', 'version', 'viewBox']),
  g: new Set(['data-layer-id', 'opacity', 'transform']),
  path: new Set(['d', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform']),
  text: new Set([
    'font-family',
    'font-size',
    'fill',
    'letter-spacing',
    'text-anchor',
    'stroke',
    'stroke-width',
    'xml:space',
  ]),
  tspan: new Set(['x', 'y']),
};

const finiteTransform = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  let count = 0;
  for (const match of trimmed.matchAll(TRANSFORM_PATTERN)) {
    count += 1;
    const values = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.some((candidate) => !Number.isFinite(candidate))) return false;
  }
  return count > 0 && trimmed.replace(TRANSFORM_PATTERN, '').replace(/\s+/g, '') === '';
};

const validateElement = (element: Element, content: { vector: boolean }) => {
  const name = element.localName || element.nodeName;
  const allowed = allowedAttributes[name];
  if (!allowed) return fail();
  for (const attribute of Array.from({ length: element.attributes.length }, (_, index) =>
    element.attributes.item(index)!)) {
    if (
      !allowed.has(attribute.name) ||
      /^on/i.test(attribute.name) ||
      (
        attribute.name !== 'xmlns' &&
        /(?:url\(|data:|https?:|javascript:)/i.test(attribute.value)
      )
    ) return fail();
    if (
      ['opacity', 'font-size', 'letter-spacing', 'stroke-width', 'x', 'y'].includes(attribute.name) &&
      !Number.isFinite(Number(attribute.value))
    ) return fail();
    if (attribute.name === 'opacity') {
      const opacity = Number(attribute.value);
      if (opacity < 0 || opacity > 1) return fail();
    }
    if (attribute.name === 'transform' && !finiteTransform(attribute.value)) return fail();
  }
  if (name === 'path' && element.getAttribute('d')?.trim()) content.vector = true;
  if (name === 'text' && (element.textContent ?? '').trim().length > 0) content.vector = true;
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1) validateElement(child as Element, content);
    else if (
      child.nodeType !== 3 ||
      (name !== 'text' && name !== 'tspan' && (child.nodeValue ?? '').trim())
    ) return fail();
  }
};

export const validateSvgMaster = (
  markup: string,
  xml: XmlPlatform = {
    DOMParser: globalThis.DOMParser,
    XMLSerializer: globalThis.XMLSerializer,
  },
): string => {
  if (!markup.trim() || !xml.DOMParser || !xml.XMLSerializer) return fail();
  const document = new xml.DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = document.documentElement;
  if (
    !root ||
    (root.localName || root.nodeName) !== 'svg' ||
    (root.namespaceURI && root.namespaceURI !== SVG_NAMESPACE) ||
    root.getAttribute('viewBox') !== '0 0 1000 1000'
  ) return fail();
  const content = { vector: false };
  validateElement(root, content);
  if (!content.vector) return fail();
  return new xml.XMLSerializer().serializeToString(root);
};

export const buildSvgMaster = async (
  variation: DesignVariation,
  assetsById: Record<string, EditorAsset>,
  xml: XmlPlatform = {
    DOMParser: globalThis.DOMParser,
    XMLSerializer: globalThis.XMLSerializer,
  },
): Promise<string> => {
  const eligibility = getSvgExportEligibility(variation, assetsById);
  if (!eligibility.eligible || !xml.DOMParser || !xml.XMLSerializer) return fail();
  const document = new xml.DOMParser().parseFromString(
    `<svg xmlns="${SVG_NAMESPACE}"/>`,
    'image/svg+xml',
  );
  const root = document.documentElement;
  root.setAttribute('viewBox', '0 0 1000 1000');
  root.setAttribute('version', '1.1');
  for (const layer of variation.layers) {
    if (!layer.visible) continue;
    if (layer.type === 'trace' && layer.svgAssetId) {
      await appendTraceLayer(root, layer, assetsById[layer.svgAssetId], xml);
    } else if (layer.type === 'text' && layer.text.trim().length > 0) {
      appendTextLayer(root, layer);
    }
  }
  return validateSvgMaster(
    new xml.XMLSerializer().serializeToString(root),
    xml,
  );
};
