import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BackgroundRemovalCoordinator,
  BackgroundRemovalOutcome,
} from '../../editor/backgroundRemovalCoordinator';
import { samplePickedColor } from '../../editor/backgroundRemovalProcessor';
import type { DecodedImageEntry } from '../../editor/decodedImages';
import type { EditorCommand } from '../../editor/history';
import {
  createImagePrepFingerprint,
  normalizeCleanupCorrectionDocument,
  type CleanupCorrectionDocument,
  type CleanupStroke,
  type NormalizedPoint,
} from '../../editor/imagePrepModel';
import {
  composeImagePrepInput,
  encodeRgbaPng,
} from '../../editor/imagePrepInput';
import {
  createEditorAsset,
  type EditorAsset,
  type EditorProject,
  type ImageLayer,
} from '../../editor/model';
import type { GeneratedAssetCommand } from '../../editor/useEditorWorkspace';

const EMPTY_CORRECTIONS: CleanupCorrectionDocument = { schemaVersion: 1, strokes: [] };
const CORRECTION_MIME = 'application/vnd.inkmaster.cleanup+json';

export interface BackgroundRemovalWorkflow {
  status: 'idle' | 'processing' | 'ready' | 'failed';
  error: string | null;
  retry: () => void;
  pickColor: (point: NormalizedPoint) => void;
  commitStroke: (stroke: CleanupStroke) => Promise<void>;
  clearCorrections: () => Promise<void>;
}

export interface UseBackgroundRemovalWorkflowOptions {
  project: EditorProject | null;
  variationId: string | null;
  layer: ImageLayer | null;
  assetsById: Record<string, EditorAsset>;
  sourceImage: DecodedImageEntry | null;
  coordinator: BackgroundRemovalCoordinator | null;
  dispatch: (command: EditorCommand) => void;
  commitGeneratedAsset: (
    asset: EditorAsset,
    command: GeneratedAssetCommand,
  ) => Promise<boolean>;
}

const readCorrections = async (
  layer: ImageLayer,
  assetsById: Record<string, EditorAsset>,
): Promise<CleanupCorrectionDocument> => {
  const correctionAssetId = layer.backgroundRemoval.correctionAssetId;
  if (!correctionAssetId) return EMPTY_CORRECTIONS;
  const asset = assetsById[correctionAssetId];
  if (!asset) return EMPTY_CORRECTIONS;
  try {
    return normalizeCleanupCorrectionDocument(JSON.parse(await asset.blob.text()));
  } catch {
    return EMPTY_CORRECTIONS;
  }
};

export const useBackgroundRemovalWorkflow = ({
  project,
  variationId,
  layer,
  assetsById,
  sourceImage,
  coordinator,
  dispatch,
  commitGeneratedAsset,
}: UseBackgroundRemovalWorkflowOptions): BackgroundRemovalWorkflow => {
  const [status, setStatus] = useState<BackgroundRemovalWorkflow['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const compositionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const encodingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const assetsRef = useRef(assetsById);
  const layerRef = useRef(layer);
  assetsRef.current = assetsById;
  layerRef.current = layer;

  const surfaceId = project && variationId && layer
    ? `background:${project.id}:${variationId}:${layer.id}`
    : 'background:inactive';
  const inputFingerprint = layer ? createImagePrepFingerprint(layer) : '';
  const lastFailedFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !project ||
      !variationId ||
      !layer ||
      !sourceImage ||
      !coordinator ||
      !layer.backgroundRemoval.enabled
    ) {
      if (coordinator) coordinator.clearSurface(surfaceId);
      setStatus('idle');
      setError(null);
      return undefined;
    }
    if (
      layer.backgroundRemoval.inputFingerprint === inputFingerprint &&
      layer.backgroundRemoval.preparedAssetId &&
      assetsRef.current[layer.backgroundRemoval.preparedAssetId]
    ) {
      coordinator.clearSurface(surfaceId);
      setStatus('ready');
      setError(null);
      return undefined;
    }

    compositionCanvasRef.current ??= document.createElement('canvas');
    encodingCanvasRef.current ??= document.createElement('canvas');
    let active = true;
    const projectId = project.id;
    const layerId = layer.id;
    const sourceAssetId = layer.assetId;
    setStatus('processing');
    setError(null);

    void (async () => {
      const corrections = await readCorrections(layer, assetsRef.current);
      if (!active) return;
      const composed = composeImagePrepInput(
        compositionCanvasRef.current!,
        sourceImage.image,
        { width: assetsRef.current[sourceAssetId].width, height: assetsRef.current[sourceAssetId].height },
        layer,
        layer.backgroundRemoval.correctionAssetId ?? '',
      );
      const shouldRetry = lastFailedFingerprintRef.current === composed.inputFingerprint &&
        retryGeneration > 0;
      const outcome = shouldRetry
        ? await coordinator.retry(surfaceId)
        : await coordinator.render({
          surfaceId,
          inputFingerprint: composed.inputFingerprint,
          frame: composed.frame,
          settings: layer.backgroundRemoval,
          corrections,
        });
      if (!active || outcome.status === 'stale') return;
      if (outcome.status === 'failed') {
        lastFailedFingerprintRef.current = outcome.inputFingerprint;
        setStatus('failed');
        setError(outcome.message);
        return;
      }
      const blob = await encodeRgbaPng(encodingCanvasRef.current!, outcome.frame);
      if (
        !active ||
        project.id !== projectId ||
        layer.id !== layerId ||
        layer.assetId !== sourceAssetId ||
        outcome.inputFingerprint !== composed.inputFingerprint
      ) return;
      const asset = createEditorAsset(projectId, blob, {
        name: `${layer.name || 'Image'} prepared.png`,
        width: outcome.frame.width,
        height: outcome.frame.height,
      }, { role: 'prepared-image' });
      const committed = await commitGeneratedAsset(asset, {
        type: 'publish-background-result',
        layerId,
        expectedInputFingerprint: composed.inputFingerprint,
        preparedAssetId: asset.id,
      });
      if (!active) return;
      if (committed) {
        lastFailedFingerprintRef.current = null;
        setStatus('ready');
        setError(null);
      }
    })().catch(() => {
      if (!active) return;
      lastFailedFingerprintRef.current = inputFingerprint;
      setStatus('failed');
      setError('Background removal failed.');
    });

    return () => {
      active = false;
    };
  }, [
    coordinator,
    inputFingerprint,
    layer?.assetId,
    layer?.backgroundRemoval.enabled,
    project?.id,
    retryGeneration,
    sourceImage,
    surfaceId,
    variationId,
  ]);

  useEffect(() => () => {
    coordinator?.clearSurface(surfaceId);
  }, [coordinator, surfaceId]);

  const pickColor = useCallback((point: NormalizedPoint) => {
    const currentLayer = layerRef.current;
    if (!project || !currentLayer || !sourceImage) return;
    const sourceAsset = assetsRef.current[currentLayer.assetId];
    if (!sourceAsset) return;
    compositionCanvasRef.current ??= document.createElement('canvas');
    const composed = composeImagePrepInput(
      compositionCanvasRef.current,
      sourceImage.image,
      { width: sourceAsset.width, height: sourceAsset.height },
      currentLayer,
      currentLayer.backgroundRemoval.correctionAssetId ?? '',
    );
    dispatch({
      type: 'set-background-removal',
      layerId: currentLayer.id,
      settings: {
        ...currentLayer.backgroundRemoval,
        enabled: true,
        mode: 'picked',
        pickedColor: samplePickedColor(composed.frame, point),
        pickedPoint: point,
      },
    });
  }, [dispatch, project, sourceImage]);

  const commitStroke = useCallback(async (stroke: CleanupStroke) => {
    const currentLayer = layerRef.current;
    if (!project || !currentLayer) return;
    const current = await readCorrections(currentLayer, assetsRef.current);
    const corrections = normalizeCleanupCorrectionDocument({
      schemaVersion: 1,
      strokes: [...current.strokes, stroke],
    });
    const blob = new Blob([JSON.stringify(corrections)], { type: CORRECTION_MIME });
    const sourceAsset = assetsRef.current[currentLayer.assetId];
    const asset = createEditorAsset(project.id, blob, {
      name: `${currentLayer.name || 'Image'} corrections.json`,
      width: sourceAsset?.width ?? 1,
      height: sourceAsset?.height ?? 1,
    }, { role: 'cleanup-corrections' });
    await commitGeneratedAsset(asset, {
      type: 'set-background-removal',
      layerId: currentLayer.id,
      settings: {
        ...currentLayer.backgroundRemoval,
        enabled: true,
        correctionAssetId: asset.id,
      },
    });
  }, [commitGeneratedAsset, project]);

  const clearCorrections = useCallback(async () => {
    const currentLayer = layerRef.current;
    if (!currentLayer?.backgroundRemoval.correctionAssetId) return;
    dispatch({
      type: 'set-background-removal',
      layerId: currentLayer.id,
      settings: {
        ...currentLayer.backgroundRemoval,
        correctionAssetId: null,
      },
    });
  }, [dispatch]);

  return {
    status,
    error,
    retry: () => setRetryGeneration((current) => current + 1),
    pickColor,
    commitStroke,
    clearCorrections,
  };
};
