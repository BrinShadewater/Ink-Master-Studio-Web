import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createDefaultBackgroundRemoval } from '../editor/imagePrepModel';
import { createDefaultLook } from '../editor/lookModel';
import type { VariationLook } from '../editor/lookModel';
import type {
  DesignVariation,
  EditorAsset,
  ImageLayer,
  TextLayer,
  TraceLayer,
} from '../editor/model';
import {
  buildSvgMaster,
  getSvgExportEligibility,
  validateSvgMaster,
  type XmlPlatform,
} from '../editor/svgExport';
import { createDefaultTraceSettings } from '../editor/traceModel';

const xml = {
  DOMParser,
  XMLSerializer,
} as unknown as XmlPlatform;

const transform = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
};

const imageLayer: ImageLayer = {
  id: 'image-a',
  type: 'image',
  name: 'Image A',
  assetId: 'source',
  visible: false,
  opacity: 1,
  transform,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  adjustments: { brightness: 0, contrast: 0, saturation: 0 },
  backgroundRemoval: createDefaultBackgroundRemoval(),
};

const traceLayer: TraceLayer = {
  id: 'trace-a',
  type: 'trace',
  name: 'Trace A',
  sourceLayerId: imageLayer.id,
  svgAssetId: 'trace-asset',
  visible: true,
  opacity: 0.75,
  transform: { ...transform, x: 0.4, rotation: 15, flipX: true },
  settings: createDefaultTraceSettings(),
  sourceFingerprint: 'source-current',
  sourceFrame: {
    sourceWidth: 800,
    sourceHeight: 400,
    crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
  },
};

const textLayer: TextLayer = {
  id: 'text-a',
  type: 'text',
  name: 'Text A',
  visible: true,
  opacity: 0.8,
  transform: { ...transform, y: 0.7, scale: 1.2, flipY: true },
  text: 'First <line>\nSecond & line',
  fontFamily: 'Georgia',
  fontSize: 72,
  color: '#112233',
  align: 'center',
  letterSpacing: 3,
  outlineWidth: 2,
  outlineColor: '#ffffff',
};

const variation = (
  layers = [imageLayer, traceLayer, textLayer] as Array<ImageLayer | TraceLayer | TextLayer>,
  look: VariationLook = createDefaultLook('original'),
): DesignVariation => ({
  id: 'variation-export',
  name: 'Vector',
  layers,
  selectedLayerId: traceLayer.id,
  look,
});

const traceAsset = (
  markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g transform="translate(2 3)"><path d="M0 0 L200 0 L200 100 Z" fill="#123456"/></g></svg>',
): EditorAsset => ({
  id: 'trace-asset',
  projectId: 'project-export',
  name: 'trace.svg',
  mimeType: 'image/svg+xml',
  width: 200,
  height: 100,
  createdAt: 1,
  blob: new Blob([markup], { type: 'image/svg+xml' }),
  role: 'trace-svg',
});

test('reports stable SVG export blockers in variation and layer order', () => {
  const raster = variation([{ ...imageLayer, visible: true }]);
  assert.deepEqual(getSvgExportEligibility(raster, {}), {
    eligible: false,
    blockers: [
      { layerId: 'image-a', message: 'Hide or trace Image A before exporting SVG.' },
      { layerId: null, message: 'Show at least one trace or text layer before exporting SVG.' },
    ],
  });
  assert.deepEqual(getSvgExportEligibility(
    variation([traceLayer], createDefaultLook('monochrome')),
    {},
  ), {
    eligible: false,
    blockers: [
      { layerId: null, message: "Set this variation's Look to Original before exporting SVG." },
      { layerId: 'trace-a', message: 'Update Trace A before exporting SVG.' },
      { layerId: null, message: 'Show at least one trace or text layer before exporting SVG.' },
    ],
  });
  assert.deepEqual(getSvgExportEligibility(variation(), {
    'trace-asset': traceAsset(),
  }), { eligible: true, blockers: [] });
});

test('builds a standalone ordered trace and editable text SVG without raster nodes', async () => {
  const markup = await buildSvgMaster(variation(), {
    'trace-asset': traceAsset(),
  }, xml);
  const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  assert.equal(root.getAttribute('viewBox'), '0 0 1000 1000');
  assert.equal(root.getElementsByTagName('image').length, 0);
  assert.equal(root.getElementsByTagName('path').length, 1);
  assert.equal(root.getElementsByTagName('text').length, 1);
  assert.equal(root.getElementsByTagName('tspan').length, 2);
  const groups = Array.from(root.getElementsByTagName('g'));
  assert.deepEqual(groups.map((group) => group.getAttribute('data-layer-id')), [
    'trace-a',
    'text-a',
  ]);
  assert.match(groups[0].getAttribute('transform') ?? '', /translate\(400 500\).*rotate\(15\).*scale\(-1 1\)/);
  const text = root.getElementsByTagName('text')[0];
  assert.equal(text.getAttribute('font-family'), 'Georgia, sans-serif');
  assert.equal(text.getAttribute('text-anchor'), 'middle');
  assert.equal(text.getAttribute('letter-spacing'), '3');
  assert.equal(text.textContent, 'First <line>Second & line');
  assert.equal(await buildSvgMaster(variation(), {
    'trace-asset': traceAsset(),
  }, xml), markup);
});

test('rejects hostile stored traces and unsafe or empty completed masters', async () => {
  await assert.rejects(
    buildSvgMaster(variation([traceLayer]), {
      'trace-asset': traceAsset(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><path d="M0 0 L1 1 Z" fill="#000"/></svg>',
      ),
    }, xml),
    /safe SVG master|Trace output is unsafe/,
  );
  for (const markup of [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><image href="data:image/png;base64,x"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="M0 0Z" fill="url(http://bad)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><g transform="translate(Infinity 0)"><path d="M0 0Z" fill="#000"/></g></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"></svg>',
  ]) {
    assert.throws(() => validateSvgMaster(markup, xml), /safe SVG master/);
  }
});
