import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TShirtExportCoordinator, createBrowserTShirtExportWorker } from '../../editor/tshirtExportCoordinator';
import { createTShirtExportReceipt, parsePngFile, validateTShirtPng, type TShirtExportReceipt } from '../../editor/pngFile';
import { createTShirtExportFingerprint, getTShirtExportPreset, type TShirtExportPresetId } from '../../editor/tshirtExportModel';
import { createTShirtPngExportSnapshot } from '../../editor/tshirtExportSnapshot';
import type { EditorAsset, DesignVariation } from '../../editor/model';
import type { ProductPlacement } from '../../editor/productModel';
import type { TShirtExportStage } from '../../editor/tshirtExportProtocol';

export type TShirtPngExportState =
  | { status: 'idle' }
  | { status: 'capturing' }
  | { status: 'rendering'; stage: TShirtExportStage; progress: number }
  | { status: 'validating' }
  | { status: 'ready'; blob: Blob; url: string; receipt: TShirtExportReceipt }
  | { status: 'failed'; message: string };

interface Input {
  presetId: TShirtExportPresetId;
  variation: DesignVariation;
  placement: ProductPlacement;
  assetsById: Record<string, EditorAsset>;
}

export const useTShirtPngExport = (input: Input) => {
  const [state, setState] = useState<TShirtPngExportState>({ status: 'idle' });
  const generation = useRef(0);
  const url = useRef<string | null>(null);
  const coordinator = useRef<TShirtExportCoordinator | null>(null);
  if (!coordinator.current) {
    coordinator.current = new TShirtExportCoordinator(createBrowserTShirtExportWorker, {
      onProgress: ({ stage, progress }) => setState({ status: 'rendering', stage, progress }),
    });
  }
  const fingerprint = useMemo(() => {
    try { return createTShirtExportFingerprint(input); } catch { return null; }
  }, [input]);
  const clear = useCallback(() => {
    generation.current += 1;
    coordinator.current?.cancel();
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setState({ status: 'idle' });
  }, []);

  useEffect(() => clear, [clear]);
  useEffect(() => { clear(); }, [fingerprint]);

  const generate = useCallback(async () => {
    if (!fingerprint) return setState({ status: 'failed', message: 'Export artwork is incomplete.' });
    const request = generation.current + 1;
    generation.current = request;
    setState({ status: 'capturing' });
    try {
      const snapshot = await createTShirtPngExportSnapshot({ ...input, fingerprint, requestId: request });
      if (generation.current !== request) return;
      const outcome = await coordinator.current!.render(snapshot);
      if (generation.current !== request) return;
      if (outcome.status !== 'ready') {
        return setState({ status: 'failed', message: outcome.status === 'failed' ? outcome.message : 'PNG generation was cancelled.' });
      }
      setState({ status: 'validating' });
      const parsed = parsePngFile(outcome.pngBytes);
      const preset = getTShirtExportPreset(input.presetId);
      const validation = validateTShirtPng(parsed, preset, outcome.metadata, fingerprint);
      if (!validation.valid) return setState({ status: 'failed', message: validation.blockers[0] ?? 'PNG validation failed.' });
      const blob = new Blob([outcome.pngBytes], { type: 'image/png' });
      const nextUrl = URL.createObjectURL(blob);
      if (generation.current !== request) { URL.revokeObjectURL(nextUrl); return; }
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = nextUrl;
      setState({ status: 'ready', blob, url: nextUrl, receipt: createTShirtExportReceipt(parsed, preset, outcome.metadata, fingerprint) });
    } catch {
      if (generation.current === request) setState({ status: 'failed', message: 'Could not create the print file.' });
    }
  }, [fingerprint, input]);
  return { state, generate, cancel: clear, fingerprint };
};
