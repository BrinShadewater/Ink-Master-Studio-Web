import { useCallback, useEffect, useRef, useState } from 'react';
import type { RgbaFrame } from '../../editor/backgroundRemovalProcessor';
import type { DecodedImageEntry } from '../../editor/decodedImages';
import {
  buildCanvasFilter,
  getCroppedSourceRect,
  type Size,
} from '../../editor/geometry';
import type { EditorCommand } from '../../editor/history';
import {
  createImagePrepFingerprint,
  createTraceSourceFingerprint,
} from '../../editor/imagePrepModel';
import {
  createEditorAsset,
  createEditorId,
  type EditorAsset,
  type EditorProject,
  type ImageLayer,
  type TraceLayer,
} from '../../editor/model';
import {
  TraceCoordinator,
  type TraceOutcome,
} from '../../editor/traceCoordinator';
import {
  recolorSafeTraceDocument,
  sanitizeTraceSvg,
  serializeSafeTraceDocument,
} from '../../editor/traceSanitizer';
import {
  createDefaultTraceSettings,
  createTraceFingerprint,
  normalizeTraceSettings,
  serializeTraceInput,
  type SafeTraceDocument,
  type TraceSettings,
} from '../../editor/traceModel';
import type { GeneratedAssetCommand } from '../../editor/useEditorWorkspace';

const MAX_TRACE_EDGE = 1_280;

export interface TraceWorkflow {
  status: 'idle' | 'processing' | 'ready' | 'failed';
  error: string | null;
  stale: boolean;
  canGenerate: boolean;
  settings: TraceSettings;
  updateSettings: (settings: TraceSettings, historyGroup?: string) => void;
  endSettingsEdit: () => void;
  generate: () => void;
  retry: () => void;
}

export interface UseTraceWorkflowOptions {
  project: EditorProject | null;
  variationId: string | null;
  sourceLayer: ImageLayer | null;
  traceLayer: TraceLayer | null;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: TraceCoordinator | null;
  dispatch: (command: EditorCommand) => void;
  commitGeneratedAsset: (
    asset: EditorAsset,
    command: GeneratedAssetCommand,
  ) => Promise<boolean>;
}

interface TraceFrameInput {
  frame: RgbaFrame;
  sourceFrame: TraceLayer['sourceFrame'];
}

const isUsableSize = ({ width, height }: Size) =>
  Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;

export const hasCurrentPreparedTraceInput = (source: ImageLayer) =>
  !source.backgroundRemoval.enabled ||
  Boolean(
    source.backgroundRemoval.preparedAssetId &&
    source.backgroundRemoval.inputFingerprint === createImagePrepFingerprint(source)
  );

export const hasSameTraceGeometrySettings = (
  left: TraceSettings,
  right: TraceSettings,
) => serializeTraceInput({ ...left, palette: [] }) ===
  serializeTraceInput({ ...right, palette: [] });

export const composeTraceFrame = (
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  imageSize: Size,
  sourceSize: Size,
  sourceLayer: ImageLayer,
  prepared: boolean,
): TraceFrameInput => {
  const sourceRect = prepared
    ? { x: 0, y: 0, width: imageSize.width, height: imageSize.height }
    : getCroppedSourceRect(sourceSize, sourceLayer.crop);
  if (!isUsableSize(sourceRect)) throw new Error('Could not prepare trace input.');
  const scale = Math.min(1, MAX_TRACE_EDGE / Math.max(sourceRect.width, sourceRect.height));
  const width = Math.max(1, Math.round(sourceRect.width * scale));
  const height = Math.max(1, Math.round(sourceRect.height * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', {
    alpha: true,
    colorSpace: 'srgb',
    willReadFrequently: true,
  });
  if (!context) throw new Error('Could not prepare trace input.');
  context.clearRect(0, 0, width, height);
  context.filter = prepared ? 'none' : buildCanvasFilter(sourceLayer.adjustments);
  context.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    width,
    height,
  );
  const imageData = context.getImageData(0, 0, width, height);
  return {
    frame: {
      width,
      height,
      pixels: new Uint8ClampedArray(imageData.data),
    },
    sourceFrame: {
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      crop: structuredClone(sourceLayer.crop),
    },
  };
};

export const useTraceWorkflow = ({
  project,
  variationId,
  sourceLayer,
  traceLayer,
  assetsById,
  imagesById,
  coordinator,
  dispatch,
  commitGeneratedAsset,
}: UseTraceWorkflowOptions): TraceWorkflow => {
  const [draftSettings, setDraftSettings] = useState(createDefaultTraceSettings);
  const [status, setStatus] = useState<TraceWorkflow['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteReuseRef = useRef<{
    layerId: string;
    sourceFingerprint: string;
  } | null>(null);
  const currentRef = useRef({
    project,
    variationId,
    sourceLayer,
    traceLayer,
    assetsById,
    imagesById,
    draftSettings,
  });
  currentRef.current = {
    project,
    variationId,
    sourceLayer,
    traceLayer,
    assetsById,
    imagesById,
    draftSettings,
  };

  const settings = traceLayer?.settings ?? draftSettings;
  const sourceFingerprint = sourceLayer
    ? createTraceSourceFingerprint(sourceLayer)
    : '';
  const stale = Boolean(
    traceLayer &&
    (
      !traceLayer.svgAssetId ||
      !assetsById[traceLayer.svgAssetId] ||
      traceLayer.sourceFingerprint !== sourceFingerprint
    )
  );
  const inputAssetId = sourceLayer?.backgroundRemoval.enabled
    ? sourceLayer.backgroundRemoval.preparedAssetId
    : sourceLayer?.assetId ?? null;
  const canGenerate = Boolean(
    project &&
    variationId &&
    sourceLayer &&
    coordinator &&
    inputAssetId &&
    hasCurrentPreparedTraceInput(sourceLayer) &&
    assetsById[inputAssetId] &&
    imagesById[inputAssetId]
  );
  const authorityId = traceLayer?.id ?? (sourceLayer ? `trace-create:${sourceLayer.id}` : '');
  const failedRef = useRef<{
    authorityId: string;
    traceFingerprint: string;
    coordinatorRetry: boolean;
  } | null>(null);

  useEffect(() => {
    setDraftSettings(createDefaultTraceSettings());
    setStatus('idle');
    setError(null);
  }, [sourceLayer?.id, traceLayer?.id]);

  useEffect(() => () => {
    if (authorityId) coordinator?.clearLayer(authorityId);
  }, [authorityId, coordinator]);

  const updateSettings = useCallback((
    nextSettings: TraceSettings,
    historyGroup?: string,
  ) => {
    const normalized = normalizeTraceSettings(nextSettings);
    const currentTrace = currentRef.current.traceLayer;
    if (currentTrace) {
      const priorReuse = paletteReuseRef.current;
      const sourceFingerprintForReuse = currentTrace.sourceFingerprint ||
        (
          priorReuse?.layerId === currentTrace.id
            ? priorReuse.sourceFingerprint
            : ''
        );
      paletteReuseRef.current =
        currentTrace.svgAssetId &&
        sourceFingerprintForReuse &&
        hasSameTraceGeometrySettings(currentTrace.settings, normalized)
          ? {
            layerId: currentTrace.id,
            sourceFingerprint: sourceFingerprintForReuse,
          }
          : null;
      dispatch({
        type: 'set-trace-settings',
        layerId: currentTrace.id,
        settings: normalized,
        historyGroup,
      });
    } else {
      setDraftSettings(normalized);
    }
  }, [dispatch]);

  const run = useCallback(async (retry: boolean) => {
    const current = currentRef.current;
    const currentProject = current.project;
    const source = current.sourceLayer;
    const activeCoordinator = coordinator;
    const activeSettings = current.traceLayer?.settings ?? current.draftSettings;
    if (!currentProject || !current.variationId || !source || !activeCoordinator) return;
    const prepared = source.backgroundRemoval.enabled;
    if (!hasCurrentPreparedTraceInput(source)) return;
    const assetId = prepared
      ? source.backgroundRemoval.preparedAssetId
      : source.assetId;
    if (!assetId) return;
    const asset = current.assetsById[assetId];
    const decoded = current.imagesById[assetId];
    const sourceAsset = current.assetsById[source.assetId];
    if (!asset || !decoded || !sourceAsset) return;

    const expectedSourceFingerprint = createTraceSourceFingerprint(source);
    const expectedTraceFingerprint = createTraceFingerprint(
      expectedSourceFingerprint,
      activeSettings,
    );
    const geometryFingerprint = createTraceFingerprint(
      expectedSourceFingerprint,
      { ...activeSettings, palette: [] },
    );
    const currentAuthorityId = current.traceLayer?.id ?? `trace-create:${source.id}`;
    setStatus('processing');
    setError(null);

    try {
      canvasRef.current ??= document.createElement('canvas');
      const input = composeTraceFrame(
        canvasRef.current,
        decoded.image,
        asset,
        sourceAsset,
        source,
        prepared,
      );
      let traceDocument: SafeTraceDocument;
      const paletteReuse = current.traceLayer?.svgAssetId &&
        paletteReuseRef.current?.layerId === current.traceLayer.id &&
        paletteReuseRef.current.sourceFingerprint === expectedSourceFingerprint
        ? current.assetsById[current.traceLayer.svgAssetId]
        : null;
      if (paletteReuse) {
        traceDocument = recolorSafeTraceDocument(
          sanitizeTraceSvg(await paletteReuse.blob.text()),
          activeSettings.palette,
        );
      } else {
        let outcome: TraceOutcome;
        if (
          retry &&
          failedRef.current?.coordinatorRetry &&
          failedRef.current.authorityId === currentAuthorityId &&
          failedRef.current.traceFingerprint === expectedTraceFingerprint
        ) {
          outcome = await activeCoordinator.retry(currentAuthorityId);
        } else {
          outcome = await activeCoordinator.trace({
            layerId: currentAuthorityId,
            traceFingerprint: expectedTraceFingerprint,
            geometryFingerprint,
            frame: input.frame,
            settings: activeSettings,
          });
        }
        if (outcome.status === 'stale') return;
        if (outcome.status === 'failed') {
          failedRef.current = {
            authorityId: currentAuthorityId,
            traceFingerprint: expectedTraceFingerprint,
            coordinatorRetry: true,
          };
          setStatus('failed');
          setError(outcome.message);
          return;
        }
        traceDocument = outcome.document;
      }

      const latest = currentRef.current;
      const latestSettings = latest.traceLayer?.settings ?? latest.draftSettings;
      if (
        latest.project?.id !== currentProject.id ||
        latest.variationId !== current.variationId ||
        latest.sourceLayer?.id !== source.id ||
        createTraceSourceFingerprint(latest.sourceLayer) !== expectedSourceFingerprint ||
        createTraceFingerprint(expectedSourceFingerprint, latestSettings) !== expectedTraceFingerprint
      ) return;

      const markup = serializeSafeTraceDocument(traceDocument);
      const blob = new Blob([markup], { type: 'image/svg+xml' });
      const generated = createEditorAsset(currentProject.id, blob, {
        name: `${source.name || 'Image'} trace.svg`,
        width: traceDocument.width,
        height: traceDocument.height,
      }, { role: 'trace-svg' });
      const command: GeneratedAssetCommand = current.traceLayer
        ? {
          type: 'publish-trace-result',
          layerId: current.traceLayer.id,
          expectedSourceFingerprint,
          expectedTraceFingerprint,
          svgAssetId: generated.id,
          palette: activeSettings.palette,
        }
        : {
          type: 'add-trace-layer',
          sourceLayerId: source.id,
          layer: {
            id: createEditorId('layer'),
            type: 'trace',
            name: `${source.name || 'Image'} trace`,
            sourceLayerId: source.id,
            svgAssetId: generated.id,
            visible: true,
            opacity: source.opacity,
            transform: structuredClone(source.transform),
            settings: structuredClone(activeSettings),
            sourceFingerprint: expectedSourceFingerprint,
            sourceFrame: input.sourceFrame,
          },
        };
      const committed = await commitGeneratedAsset(generated, command);
      if (!committed) return;
      failedRef.current = null;
      paletteReuseRef.current = null;
      setStatus('ready');
      setError(null);
    } catch {
      failedRef.current = {
        authorityId: currentAuthorityId,
        traceFingerprint: expectedTraceFingerprint,
        coordinatorRetry: false,
      };
      setStatus('failed');
      setError('Vector trace failed.');
    }
  }, [commitGeneratedAsset, coordinator]);

  return {
    status,
    error,
    stale,
    canGenerate,
    settings,
    updateSettings,
    endSettingsEdit: () => dispatch({ type: 'end-history-group' }),
    generate: () => { void run(false); },
    retry: () => { void run(true); },
  };
};
