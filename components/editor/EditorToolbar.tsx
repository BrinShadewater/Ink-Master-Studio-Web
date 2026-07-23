import { Columns2, Crop, Layers, MousePointer2, Palette, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { Ref } from 'react';
import type { DesignLayer, EditorTool } from '../../editor/model';

export interface EditorToolbarProps {
  tool: EditorTool;
  layerType?: DesignLayer['type'] | null;
  onToolChange: (tool: EditorTool) => void;
  onOpenLayers: () => void;
  layersButtonRef?: Ref<HTMLButtonElement>;
  variationCount?: number;
  compareOpen?: boolean;
  onToggleCompare?: () => void;
  compareButtonRef?: Ref<HTMLButtonElement>;
}

const tools: Array<{ id: EditorTool; label: string; icon: LucideIcon }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { id: 'looks', label: 'Looks', icon: Palette },
];

const toolButtonClass = 'grid h-10 w-10 shrink-0 place-items-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

export const EditorToolbar = ({
  tool,
  layerType = null,
  onToolChange,
  onOpenLayers,
  layersButtonRef,
  variationCount = 0,
  compareOpen = false,
  onToggleCompare,
  compareButtonRef,
}: EditorToolbarProps) => (
  <nav
    className="order-3 flex h-16 min-w-0 items-center justify-center gap-4 border-t border-neutral-800 bg-neutral-900 px-2 md:order-none md:h-full md:w-[52px] md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:px-0 md:py-3"
    aria-label="Editor tools"
  >
    {layerType === 'text' ? (
      <p id="editor-image-tools-disabled-reason" className="sr-only">
        Crop and Adjust are available only for image layers.
      </p>
    ) : null}
    {compareOpen ? (
      <p id="editor-compare-disabled-reason" className="sr-only">
        Editing tools are unavailable while Compare is open.
      </p>
    ) : null}
    {tools.map(({ id, label, icon: Icon }) => {
      const selected = tool === id;
      const imageToolDisabled = layerType === 'text' && (id === 'crop' || id === 'adjust');
      const disabled = compareOpen || imageToolDisabled;
      const disabledReason = compareOpen
        ? 'editor-compare-disabled-reason'
        : imageToolDisabled ? 'editor-image-tools-disabled-reason' : undefined;
      return (
        <button
          key={id}
          type="button"
          className={`${toolButtonClass} ${selected ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400`}
          aria-label={label}
          aria-pressed={selected}
          aria-describedby={disabledReason}
          title={compareOpen ? `${label} is unavailable while Compare is open` : imageToolDisabled ? `${label} is available only for image layers` : label}
          disabled={disabled}
          onClick={() => onToolChange(id)}
        >
          <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
      );
    })}
    <button
      ref={compareButtonRef}
      type="button"
      className={`${toolButtonClass} ${compareOpen ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400`}
      aria-label="Compare"
      aria-pressed={compareOpen}
      title={variationCount < 2 ? 'Compare requires at least two variations' : compareOpen ? 'Close Compare' : 'Compare'}
      disabled={variationCount < 2}
      onClick={onToggleCompare}
    >
      <Columns2 aria-hidden="true" size={19} strokeWidth={1.8} />
    </button>
    <button
      ref={layersButtonRef}
      type="button"
      className={`${toolButtonClass} text-neutral-400 hover:bg-neutral-800 hover:text-white md:hidden`}
      aria-label="Layers"
      aria-describedby={compareOpen ? 'editor-compare-disabled-reason' : undefined}
      title="Layers"
      disabled={compareOpen}
      onClick={onOpenLayers}
    >
      <Layers aria-hidden="true" size={19} strokeWidth={1.8} />
    </button>
  </nav>
);
