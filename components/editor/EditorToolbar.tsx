import {
  Columns2,
  Crop,
  Maximize2,
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
  hasImageLayer?: boolean;
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

interface ToolbarTool {
  id: EditorTool;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const toolGroups: Array<{ label: string; tools: ToolbarTool[] }> = [
  {
    label: 'Arrange',
    tools: [
      { id: 'select', label: 'Select', shortLabel: 'Select', icon: MousePointer2 },
      { id: 'crop', label: 'Crop', shortLabel: 'Crop', icon: Crop },
      { id: 'adjust', label: 'Adjust', shortLabel: 'Adjust', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Prepare artwork',
    tools: [
      { id: 'enhance', label: 'Enhance resolution', shortLabel: 'Enhance', icon: Maximize2 },
      { id: 'remove-background', label: 'Remove background', shortLabel: 'Cutout', icon: WandSparkles },
      { id: 'trace', label: 'Trace', shortLabel: 'Trace', icon: ScanLine },
    ],
  },
  {
    label: 'Finish and preview',
    tools: [
      { id: 'looks', label: 'Looks', shortLabel: 'Looks', icon: Palette },
      { id: 'product', label: 'Product', shortLabel: 'Product', icon: Shirt },
    ],
  },
];

const toolButtonClass = 'flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:grid md:h-11 md:w-11';

export const EditorToolbar = ({
  tool,
  layerType = null,
  hasImageLayer = false,
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
    className="order-3 flex h-16 min-w-0 items-center justify-start gap-1 overflow-x-auto border-t border-neutral-800 bg-neutral-900 px-2 md:order-none md:h-full md:w-[60px] md:flex-col md:gap-2 md:overflow-visible md:border-r md:border-t-0 md:px-0 md:py-3"
    aria-label="Editor tools"
  >
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
    {toolGroups.map(({ label: groupLabel, tools }, groupIndex) => (
      <div
        key={groupLabel}
        className={`flex shrink-0 items-center gap-1 md:flex-col md:gap-2 ${groupIndex > 0 ? 'md:border-t md:border-neutral-800 md:pt-2' : ''}`}
        role="group"
        aria-label={groupLabel}
      >
        {tools.map(({ id, label, shortLabel, icon: Icon }) => {
          const imageContextTool = id === 'crop' || id === 'adjust' || id === 'enhance' ||
            id === 'remove-background' || id === 'trace';
          if (mode === 'easy' && imageContextTool && !hasImageLayer && layerType !== 'trace') return null;
          const selected = tool === id;
          const productConflict = tool === 'product' &&
            id !== 'select' &&
            id !== 'product';
          const productUnavailable = id === 'product' && !hasProject;
          const imageToolDisabled = !hasImageLayer &&
            (id === 'crop' || id === 'adjust' || id === 'enhance' || id === 'remove-background');
          const traceToolDisabled = id === 'trace' && !hasImageLayer && layerType !== 'trace';
          const disabled = compareOpen || productConflict || productUnavailable ||
            imageToolDisabled || traceToolDisabled;
          const disabledReason = compareOpen
            ? 'editor-compare-disabled-reason'
            : productConflict
              ? 'editor-product-mode-disabled-reason'
              : productUnavailable
                ? 'editor-product-disabled-reason'
                : undefined;
          return (
            <button
              key={id}
              ref={selected ? activeToolButtonRef : undefined}
              type="button"
              className={`${toolButtonClass} ${selected ? 'bg-emerald-500 text-neutral-950 shadow-sm' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400`}
              aria-label={label}
              aria-pressed={selected}
              aria-describedby={disabledReason}
              title={compareOpen
                ? `${label} is unavailable while Compare is open`
                : productConflict
                  ? `${label} is unavailable in Product mode`
                  : productUnavailable
                    ? 'Product is available after importing artwork'
                    : `${groupLabel}: ${label}`}
              disabled={disabled}
              onClick={() => onToolChange(id)}
            >
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none md:sr-only">
                {shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    ))}
    {mode === 'advanced' ? <button
      ref={compareButtonRef}
      type="button"
      className={`${toolButtonClass} ${compareOpen ? 'bg-emerald-500 text-neutral-950 shadow-sm' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400`}
      aria-label="Compare"
      aria-pressed={compareOpen}
      title={variationCount < 2 ? 'Compare requires at least two variations' : compareOpen ? 'Close Compare' : 'Compare'}
      aria-describedby={tool === 'product' ? 'editor-product-mode-disabled-reason' : undefined}
      disabled={variationCount < 2 || tool === 'product'}
      onClick={onToggleCompare}
    >
      <Columns2 aria-hidden="true" size={19} strokeWidth={1.8} />
      <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none md:sr-only">Compare</span>
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
      <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none md:sr-only">Layers</span>
    </button>
  </nav>
);
