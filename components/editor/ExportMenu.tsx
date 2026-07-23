import { Download, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type {
  DesignVariation,
  EditorAsset,
} from '../../editor/model';
import {
  buildSvgMaster,
  getSvgExportEligibility,
} from '../../editor/svgExport';
import { useAccessibleDialog } from '../useAccessibleDialog';

export interface ExportMenuProps {
  open: boolean;
  projectName: string;
  variation: DesignVariation | null;
  assetsById: Record<string, EditorAsset>;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export const sanitizeSvgFilenamePart = (value: string, fallback: string) => {
  const normalized = value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
  return normalized || fallback;
};

export const createSvgMasterFilename = (
  projectName: string,
  variationName: string,
) => `${sanitizeSvgFilenamePart(projectName, 'design')}-${sanitizeSvgFilenamePart(
  variationName,
  'variation',
)}.svg`;

export const downloadSvgMaster = async (
  projectName: string,
  variation: DesignVariation,
  assetsById: Record<string, EditorAsset>,
) => {
  const markup = await buildSvgMaster(variation, assetsById);
  const blob = new Blob([markup], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = createSvgMasterFilename(projectName, variation.name);
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const ExportMenu = ({
  open,
  projectName,
  variation,
  assetsById,
  returnFocusRef,
  onClose,
}: ExportMenuProps) => {
  const [status, setStatus] = useState<'idle' | 'building' | 'failed'>('idle');
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useAccessibleDialog({
    open,
    onClose,
    initialFocusRef: closeRef,
    returnFocusRef,
  });
  const eligibility = variation
    ? getSvgExportEligibility(variation, assetsById)
    : {
      eligible: false,
      blockers: [{ layerId: null, message: 'Open a design before exporting SVG.' }],
    };

  useEffect(() => {
    if (!open) return;
    setStatus('idle');
  }, [open]);

  if (!open) return null;

  const download = async () => {
    if (!variation || !eligibility.eligible || status === 'building') return;
    setStatus('building');
    try {
      await downloadSvgMaster(projectName, variation, assetsById);
      setStatus('idle');
      onClose();
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/65 p-3 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-export-title"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="w-full max-w-sm border border-neutral-700 bg-neutral-900 shadow-2xl"
      >
        <header className="flex h-12 items-center justify-between border-b border-neutral-800 px-4">
          <h2 id="editor-export-title" className="text-sm font-semibold text-neutral-100">
            Export
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="grid h-8 w-8 place-items-center text-neutral-400 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Close export"
            title="Close export"
            onClick={onClose}
          >
            <X aria-hidden="true" size={17} />
          </button>
        </header>
        <div className="grid gap-4 p-4">
          {eligibility.blockers.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-neutral-300">SVG needs attention</p>
              <ul className="mt-2 grid gap-2 text-xs leading-5 text-amber-200">
                {eligibility.blockers.map((blocker, index) => (
                  <li key={`${blocker.layerId ?? 'variation'}-${index}`}>{blocker.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs leading-5 text-neutral-400">
              Vector paths and editable text on a 1000 by 1000 design surface.
            </p>
          )}
          {status === 'failed' ? (
            <p className="text-xs text-red-300" role="alert">
              SVG export failed. Check the trace layers and try again.
            </p>
          ) : null}
          <button
            type="button"
            className="flex h-10 items-center justify-center gap-2 bg-emerald-500 px-4 text-xs font-semibold text-neutral-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!eligibility.eligible || status === 'building'}
            onClick={() => { void download(); }}
          >
            <Download aria-hidden="true" size={16} />
            {status === 'building' ? 'Building SVG...' : 'Download SVG'}
          </button>
        </div>
      </section>
    </div>
  );
};
