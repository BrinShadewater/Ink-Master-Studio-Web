import {
  Columns2,
  Crop,
  Layers,
  MousePointer2,
  Palette,
  ScanLine,
  Shirt,
  SlidersHorizontal,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import type { Ref } from 'react';
import type { DesignLayer, EditorTool } from '../../editor/model';

export interface EditorToolbarProps {
  tool: EditorTool;
  layerType?: DesignLayer['type'] | null;
  hasProject?: boolean;
  onToolChange: (tool: EditorTool) => void;
  onOpenLayers: () => void;
  layersButtonRef?: Ref<HTMLButtonElement>;
  variationCount?: number;
  compareOpen?: boolean;
  onToggleCompare?: () => void;
  compareButtonRef?: Ref<HTMLButtonElement>;
  activeToolButtonRef?: Ref<HTMLButtonElement>;
  mode?: 'easy' | 'advanced';
}

const tools: Array<{ id: EditorTool; label: string; icon: LucideIcon }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { id: 'remove-background', label: 'Remove background', icon: WandSparkles },
  { id: 'trace', label: 'Trace', icon: ScanLine },
  { id: 'looks', label: 'Looks', icon: Palette },
  { id: 'product', label: 'Product', icon: Shirt },
];

const toolButtonClass = 'grid h-10 w-10 shrink-0 place-items-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

export const EditorToolbar = ({
  tool,
  layerType = null,
  hasProject = false,
  onToolChange,
  onOpenLayers,
  layersButtonRef,
  variationCount = 0,
  compareOpen = false,
  onToggleCompare,
  compareButtonRef,
  activeToolButtonRef,
  mode = 'advanced',
}: EditorToolbarProps) => (
  <nav
    className="order-3 flex h-16 min-w-0 items-center justify-center gap-1 border-t border-neutral-800 bg-neutral-900 px-2 md:order-none md:h-full md:w-[52px] md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:px-0 md:py-3"
    aria-label="Editor tools"
  >
    {layerType !== 'image' ? (
      <p id="editor-image-tools-disabled-reason" className="sr-only">
        Crop, Adjust, and Remove background are available only for image layers.
      </p>
    ) : null}
    {layerType !== 'image' && layerType !== 'trace' ? (
      <p id="editor-trace-disabled-reason" className="sr-only">
        Trace is available only for image and trace layers.
      </p>
    ) : null}
    {compareOpen ? (
      <p id="editor-compare-disabled-reason" className="sr-only">
        Editing tools are unavailable while Compare is open.
      </p>
    ) : null}
    {tool === 'product' ? (
      <p id="editor-product-mode-disabled-reason" className="sr-only">
        This command is unavailable in Product mode.
      </p>
    ) : null}
    {!hasProject ? (
      <p id="editor-product-disabled-reason" className="sr-only">
        Product is available after importing artwork.
      </p>
    ) : null}
    {tools.filter(({ id }) => mode === 'advanced' || id !== 'looks').map(({ id, label, icon: Icon }) => {
      const selected = tool === id;
      const productConflict = tool === 'product' &&
        id !== 'select' &&
        id !== 'product';
      const productUnavailable = id === 'product' && !hasProject;
      const imageToolDisabled = layerType !== 'image' &&
        (id === 'crop' || id === 'adjust' || id === 'remove-background');
      const traceToolDisabled = id === 'trace' && layerType !== 'image' && layerType !== 'trace';
      const disabled = compareOpen || productConflict || productUnavailable ||
        imageToolDisabled || traceToolDisabled;
      const disabledReason = compareOpen
        ? 'editor-compare-disabled-reason'
        : productConflict
          ? 'editor-product-mode-disabled-reason'
          : productUnavailable
            ? 'editor-product-disabled-reason'
        : imageToolDisabled
          ? 'editor-image-tools-disabled-reason'
          : traceToolDisabled ? 'editor-trace-disabled-reason' : undefined;
      return (
        <button
          key={id}
          ref={selected ? activeToolButtonRef : undefined}
          type="button"
          className={`${toolButtonClass} ${selected ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400`}
          aria-label={label}
          aria-pressed={selected}
          aria-describedby={disabledReason}
          title={compareOpen
            ? `${label} is unavailable while Compare is open`
            : productConflict
              ? `${label} is unavailable in Product mode`
              : productUnavailable
                ? 'Product is available after importing artwork'
            : imageToolDisabled
              ? `${label} is available only for image layers`
              : traceToolDisabled ? 'Trace is available only for image and trace layers' : label}
          disabled={disabled}
          onClick={() => onToolChange(id)}
        >
          <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
      );
    })}
    {mode === 'advanced' ? <button
      ref={compareButtonRef}
      type="button"
      className={`${toolButtonClass} ${compareOpen ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400`}
      aria-label="Compare"
      aria-pressed={compareOpen}
      title={variationCount < 2 ? 'Compare requires at least two variations' : compareOpen ? 'Close Compare' : 'Compare'}
      aria-describedby={tool === 'product' ? 'editor-product-mode-disabled-reason' : undefined}
      disabled={variationCount < 2 || tool === 'product'}
      onClick={onToggleCompare}
    >
      <Columns2 aria-hidden="true" size={19} strokeWidth={1.8} />
    </button> : null}
    <button
      ref={layersButtonRef}
      type="button"
      className={`${toolButtonClass} text-neutral-400 hover:bg-neutral-800 hover:text-white md:hidden`}
      aria-label="Layers"
      aria-describedby={compareOpen
        ? 'editor-compare-disabled-reason'
        : tool === 'product' ? 'editor-product-mode-disabled-reason' : undefined}
      title="Layers"
      disabled={compareOpen || tool === 'product'}
      onClick={onOpenLayers}
    >
      <Layers aria-hidden="true" size={19} strokeWidth={1.8} />
    </button>
  </nav>
);
