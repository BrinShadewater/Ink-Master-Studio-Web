import React from 'react';
import { PlacementMeasurement } from '../types';
import { PLACEMENT_PRESETS, validatePlacement } from '../services/placement';

interface PlacementPanelProps {
  placement: PlacementMeasurement;
  onChange: (placement: PlacementMeasurement) => void;
}

export const PlacementPanel: React.FC<PlacementPanelProps> = ({ placement, onChange }) => {
  const validation = validatePlacement(placement);
  const update = (key: keyof PlacementMeasurement, value: string | number) =>
    onChange({ ...placement, presetId: 'custom', [key]: value });
  const numberField = (label: string, key: 'widthInches' | 'heightInches' | 'offsetXInches' | 'offsetYInches') => (
    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
      {label}
      <input type="number" step="0.25" value={placement[key]} onChange={(event) => update(key, Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white" />
    </label>
  );

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-sm font-bold text-slate-100">Measured placement</h3>
      <p className="mt-1 text-xs text-slate-500">Dimensions and offsets are stored in inches for this garment variant.</p>
      <select
        aria-label="Placement preset"
        value={placement.presetId}
        onChange={(event) => {
          const preset = PLACEMENT_PRESETS.find((candidate) => candidate.id === event.target.value);
          if (preset) {
            const { id: _id, name: _name, description: _description, ...measurement } = preset;
            onChange(measurement);
          }
        }}
        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
      >
        {placement.presetId === 'custom' && <option value="custom">Custom placement</option>}
        {PLACEMENT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {numberField('Width (in)', 'widthInches')}
        {numberField('Height (in)', 'heightInches')}
        {numberField('Horizontal offset', 'offsetXInches')}
        {numberField('Top offset', 'offsetYInches')}
      </div>
      {!validation.valid && <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[10px] text-rose-200">{validation.errors.join(' ')}</div>}
      {validation.valid && <p className="mt-3 text-[10px] font-bold text-emerald-400">Placement fits the calibrated printable area.</p>}
    </section>
  );
};
