import { useCallback, useRef, useState } from 'react';
import type { DecodedImageEntry } from '../../editor/decodedImages';
import type { EditorCommand } from '../../editor/history';
import { createEditorAsset, type EditorProject, type ImageLayer } from '../../editor/model';
import type { GeneratedAssetCommand } from '../../editor/useEditorWorkspace';

const MAX_ENHANCED_EDGE = 8_192;

export interface ResolutionWorkflow {
  status: 'idle' | 'processing' | 'failed';
  error: string | null;
  beforeAssetId: string | null;
  enhance: (scale: 2 | 4) => Promise<void>;
}

export const useResolutionWorkflow = ({
  project,
  layer,
  sourceImage,
  sourceSize,
  dispatch,
  commitGeneratedAsset,
}: {
  project: EditorProject | null;
  layer: ImageLayer | null;
  sourceImage: DecodedImageEntry | null;
  sourceSize: { width: number; height: number } | null;
  dispatch: (command: EditorCommand) => void;
  commitGeneratedAsset: (asset: ReturnType<typeof createEditorAsset>, command: GeneratedAssetCommand) => Promise<boolean>;
}): ResolutionWorkflow => {
  const [status, setStatus] = useState<ResolutionWorkflow['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [beforeAssetId, setBeforeAssetId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const enhance = useCallback(async (scale: 2 | 4) => {
    if (!project || !layer || !sourceImage || !sourceSize || status === 'processing') return;
    setStatus('processing');
    setError(null);
    try {
      const source = sourceImage.image;
      const ratio = Math.min(scale, MAX_ENHANCED_EDGE / Math.max(sourceSize.width, sourceSize.height));
      const width = Math.max(1, Math.round(sourceSize.width * ratio));
      const height = Math.max(1, Math.round(sourceSize.height * ratio));
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Canvas rendering is unavailable.');
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('Could not encode enhanced artwork.')),
        'image/png',
      ));
      const asset = createEditorAsset(project.id, blob, {
        name: `${layer.name.replace(/\.[^.]+$/, '') || 'Artwork'} ${scale}x.png`,
        width,
        height,
      }, { role: 'enhanced-image' });
      const committed = await commitGeneratedAsset(asset, {
        type: 'replace-image-asset',
        layerId: layer.id,
        assetId: asset.id,
        historyGroup: 'enhance-resolution',
      });
      if (!committed) return;
      setBeforeAssetId(layer.assetId);
      dispatch({ type: 'end-history-group' });
      setStatus('idle');
    } catch (reason) {
      setStatus('failed');
      setError(reason instanceof Error ? reason.message : 'Resolution enhancement failed.');
    }
  }, [commitGeneratedAsset, dispatch, layer, project, sourceImage, sourceSize, status]);

  return { status, error, beforeAssetId, enhance };
};
