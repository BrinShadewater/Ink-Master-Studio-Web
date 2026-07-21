import { Crop, MousePointer2, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { EditorTool } from '../../editor/model';

export interface EditorToolbarProps {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}

const tools: Array<{ id: EditorTool; label: string; icon: LucideIcon }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
];

export const EditorToolbar = ({ tool, onToolChange }: EditorToolbarProps) => (
  <nav
    className="order-3 flex h-16 min-w-0 items-center justify-center gap-4 border-t border-neutral-800 bg-neutral-900 px-2 md:order-none md:h-full md:w-[52px] md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:px-0 md:py-3"
    aria-label="Editor tools"
  >
    {tools.map(({ id, label, icon: Icon }) => {
      const selected = tool === id;
      return (
        <button
          key={id}
          type="button"
          className={`grid h-10 w-10 shrink-0 place-items-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${selected ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
          aria-label={label}
          aria-pressed={selected}
          title={label}
          onClick={() => onToolChange(id)}
        >
          <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
      );
    })}
  </nav>
);
