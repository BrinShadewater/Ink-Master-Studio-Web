import {
  Columns2,
  Crop,
  Maximize2,
  Layers,
  MoreHorizontal,
  MousePointer2,
  Palette,
  ScanLine,
  Shirt,
  SlidersHorizontal,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useState, type Ref } from 'react';
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
  basicPreparationTool?: EditorTool;
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

const toolsById = new Map(toolGroups.flatMap(({ tools }) => tools).map((item) => [item.id, item]));
const basicSpecialistTools = new Set<EditorTool>([
  'adjust',
  'enhance',
  'remove-background',
  'trace',
  'looks',
]);
const moreTools = ['adjust', 'enhance', 'remove-background', 'trace', 'looks'] as const;

const toolButtonClass = 'flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:h-14 md:w-[72px]';

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
  basicPreparationTool,
}: EditorToolbarProps) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const activePreparationTool = basicSpecialistTools.has(tool)
    ? tool
    : basicPreparationTool && basicSpecialistTools.has(basicPreparationTool)
      ? basicPreparationTool
      : 'crop';

  const getToolState = (id: EditorTool) => {
    const productUnavailable = id === 'product' && !hasProject;
    const imageToolDisabled = !hasImageLayer &&
      (id === 'crop' || id === 'adjust' || id === 'enhance' || id === 'remove-background');
    const traceToolDisabled = id === 'trace' && !hasImageLayer && layerType !== 'trace';
    const disabled = compareOpen || productUnavailable || imageToolDisabled || traceToolDisabled;
    return {
      disabled,
      disabledReason: compareOpen
        ? 'editor-compare-disabled-reason'
        : productUnavailable
          ? 'editor-product-disabled-reason'
          : undefined,
    };
  };

  const renderToolButton = (
    item: ToolbarTool,
    groupLabel: string,
    primary = false,
  ) => {
    const { id, label, shortLabel, icon: Icon } = item;
    const selected = tool === id;
    const { disabled, disabledReason } = getToolState(id);
    return (
      <button
        key={id}
        ref={selected ? activeToolButtonRef : undefined}
        type="button"
        className={`${toolButtonClass} ${selected ? 'bg-emerald-500 text-neutral-950 shadow-sm' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400`}
        aria-label={label}
        aria-pressed={selected}
        aria-describedby={disabledReason}
        data-primary-tool={primary ? id : undefined}
        title={compareOpen
          ? `${label} is unavailable while Compare is open`
          : id === 'product' && !hasProject
            ? 'Product is available after importing artwork'
            : `${groupLabel}: ${label}`}
        disabled={disabled}
        onClick={() => onToolChange(id)}
      >
        <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
        <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none">
          {shortLabel}
        </span>
      </button>
    );
  };

  const layersButton = (desktopVisible: boolean) => (
    <button
      ref={layersButtonRef}
      type="button"
      className={`${toolButtonClass} text-neutral-400 hover:bg-neutral-800 hover:text-white ${desktopVisible ? '' : 'md:hidden'} disabled:cursor-not-allowed disabled:opacity-35`}
      aria-label="Layers"
      aria-describedby={compareOpen ? 'editor-compare-disabled-reason' : undefined}
      title="Layers"
      disabled={compareOpen}
      onClick={onOpenLayers}
    >
      <Layers aria-hidden="true" size={19} strokeWidth={1.8} />
      <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none">Layers</span>
    </button>
  );

  return (
    <nav
      className="relative order-3 flex h-16 min-w-0 items-center justify-start gap-1 overflow-x-auto border-t border-neutral-800 bg-neutral-900 px-2 md:order-none md:h-full md:w-[88px] md:flex-col md:gap-2 md:overflow-visible md:border-r md:border-t-0 md:px-2 md:py-3"
      aria-label="Editor tools"
    >
      {compareOpen ? (
        <p id="editor-compare-disabled-reason" className="sr-only">
          Editing tools are unavailable while Compare is open.
        </p>
      ) : null}
      {!hasProject ? (
        <p id="editor-product-disabled-reason" className="sr-only">
          Product is available after importing artwork.
        </p>
      ) : null}

      {mode === 'easy' ? (
        <div className="flex shrink-0 items-center gap-1 md:flex-col md:gap-2" role="group" aria-label="Guided workflow">
          {renderToolButton(toolsById.get('select')!, 'Guided workflow', true)}
          {(hasImageLayer || activePreparationTool === 'looks')
            ? renderToolButton(toolsById.get(activePreparationTool)!, 'Guided workflow', true)
            : null}
          {renderToolButton(toolsById.get('product')!, 'Guided workflow', true)}
          {layersButton(true)}
          <div className="relative shrink-0">
            <button
              type="button"
              className={`${toolButtonClass} text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35`}
              aria-label="More tools"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              title="More preparation tools"
              disabled={compareOpen}
              onClick={() => setMoreOpen((current) => !current)}
            >
              <MoreHorizontal aria-hidden="true" size={19} strokeWidth={1.8} />
              <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none">More</span>
            </button>
            {moreOpen ? (
              <div
                className="fixed bottom-16 left-2 z-30 w-56 rounded-lg border border-neutral-700 bg-neutral-900 p-2 shadow-2xl md:absolute md:bottom-auto md:left-full md:top-0 md:ml-2"
                role="menu"
                aria-label="More preparation tools"
              >
                {moreTools.map((id) => {
                  const item = toolsById.get(id)!;
                  const Icon = item.icon;
                  const { disabled } = getToolState(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-35"
                      role="menuitem"
                      aria-label={item.label}
                      disabled={disabled}
                      onClick={() => {
                        setMoreOpen(false);
                        onToolChange(id);
                      }}
                    >
                      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {toolGroups.map(({ label: groupLabel, tools }, groupIndex) => (
            <div
              key={groupLabel}
              className={`flex shrink-0 items-center gap-1 md:flex-col md:gap-2 ${groupIndex > 0 ? 'md:border-t md:border-neutral-800 md:pt-2' : ''}`}
              role="group"
              aria-label={groupLabel}
            >
              {tools.map((item) => renderToolButton(item, groupLabel))}
            </div>
          ))}
          <button
            ref={compareButtonRef}
            type="button"
            className={`${toolButtonClass} ${compareOpen ? 'bg-emerald-500 text-neutral-950 shadow-sm' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400`}
            aria-label="Compare"
            aria-pressed={compareOpen}
            title={variationCount < 2 ? 'Compare requires at least two variations' : compareOpen ? 'Close Compare' : 'Compare'}
            disabled={variationCount < 2}
            onClick={onToggleCompare}
          >
            <Columns2 aria-hidden="true" size={19} strokeWidth={1.8} />
            <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none">Compare</span>
          </button>
          {layersButton(false)}
        </>
      )}
    </nav>
  );
};
