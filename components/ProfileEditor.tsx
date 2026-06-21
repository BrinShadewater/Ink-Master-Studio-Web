import React from 'react';
import {
  OutputFormat,
  PrintableArea,
  ProductionPackageOptions,
  ProductionProfile,
  ProductionThresholds,
  ProfileValidationError,
} from '../types';

interface ProfileEditorProps {
  profile: ProductionProfile;
  validationErrors: ProfileValidationError[];
  onChange: (profile: ProductionProfile) => void;
  onSave: () => void;
  onCancel: () => void;
}

const inputClassName =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500';
const labelClassName = 'block text-xs font-bold text-slate-300';

const fieldId = (field: string) => `profile-${field.replace(/[^a-zA-Z0-9]+/g, '-')}`;

const readableArea = (key: string) => {
  const [product, location] = key.split(':');
  const products: Record<string, string> = {
    TSHIRT: 'T-shirt',
    HOODIE: 'Hoodie',
    HAT: 'Hat',
    MUG: 'Mug',
    TOTE: 'Tote',
  };
  const locations: Record<string, string> = {
    front: 'Front',
    back: 'Back',
    'left-chest': 'Left chest',
    sleeve: 'Sleeve',
  };
  return `${products[product] ?? product} / ${locations[location] ?? location}`;
};

const ErrorMessages: React.FC<{
  field: string;
  errors: ProfileValidationError[];
}> = ({ field, errors }) => {
  const matches = errors.filter((error) => error.field === field);
  if (matches.length === 0) return null;
  return (
    <div id={`${fieldId(field)}-error`} className="mt-1 space-y-1 text-xs text-rose-300">
      {matches.map((error, index) => (
        <p key={`${error.field}-${index}`}>{error.message}</p>
      ))}
    </div>
  );
};

const NumericInput: React.FC<{
  field: string;
  label: string;
  value: number;
  errors: ProfileValidationError[];
  onChange: (value: number) => void;
}> = ({ field, label, value, errors, onChange }) => {
  const invalid = errors.some((error) => error.field === field);
  return (
    <label className={labelClassName}>
      {label}
      <input
        id={fieldId(field)}
        type="number"
        step="any"
        value={Number.isNaN(value) ? '' : value}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${fieldId(field)}-error` : undefined}
        onChange={(event) => onChange(
          event.target.value === '' ? Number.NaN : Number(event.target.value),
        )}
        className={`${inputClassName} mt-1 ${invalid ? 'border-rose-500' : ''}`}
      />
      <ErrorMessages field={field} errors={errors} />
    </label>
  );
};

const BooleanInput: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
    />
    {label}
  </label>
);

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  profile,
  validationErrors,
  onChange,
  onSave,
  onCancel,
}) => {
  const updateThreshold = (
    field: keyof ProductionThresholds,
    value: number,
  ) => onChange({
    ...profile,
    thresholds: { ...profile.thresholds, [field]: value },
  });
  const updateArea = (
    key: string,
    field: keyof PrintableArea,
    value: number,
  ) => onChange({
    ...profile,
    printableAreas: {
      ...profile.printableAreas,
      [key]: { ...profile.printableAreas[key], [field]: value },
    },
  });
  const updatePackageOption = <K extends keyof ProductionPackageOptions>(
    field: K,
    value: ProductionPackageOptions[K],
  ) => onChange({
    ...profile,
    defaults: {
      ...profile.defaults,
      packageOptions: {
        ...profile.defaults.packageOptions,
        [field]: value,
      },
    },
  });
  const nameInvalid = validationErrors.some((error) => error.field === 'name');
  const canSave = profile.name.trim().length > 0 && validationErrors.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        <section aria-labelledby="profile-printer-heading" className="space-y-3">
          <h3 id="profile-printer-heading" className="text-sm font-black text-white">Printer and method</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClassName}>
              Profile name
              <input
                value={profile.name}
                aria-invalid={nameInvalid || undefined}
                aria-describedby={nameInvalid ? `${fieldId('name')}-error` : undefined}
                onChange={(event) => onChange({ ...profile, name: event.target.value })}
                className={`${inputClassName} mt-1 ${nameInvalid ? 'border-rose-500' : ''}`}
              />
              <ErrorMessages field="name" errors={validationErrors} />
            </label>
            <label className={labelClassName}>
              Printer name
              <input
                value={profile.printerName}
                onChange={(event) => onChange({ ...profile, printerName: event.target.value })}
                className={`${inputClassName} mt-1`}
              />
              <ErrorMessages field="printerName" errors={validationErrors} />
            </label>
            <label className={`${labelClassName} sm:col-span-2`}>
              Description
              <textarea
                value={profile.description}
                rows={3}
                onChange={(event) => onChange({ ...profile, description: event.target.value })}
                className={`${inputClassName} mt-1 resize-y`}
              />
              <ErrorMessages field="description" errors={validationErrors} />
            </label>
            <label className={labelClassName}>
              Production method
              <select
                value={profile.method}
                onChange={(event) => onChange({
                  ...profile,
                  method: event.target.value as ProductionProfile['method'],
                })}
                className={`${inputClassName} mt-1`}
              >
                <option value="DTG">DTG</option>
                <option value="DTF">DTF</option>
              </select>
              <ErrorMessages field="method" errors={validationErrors} />
            </label>
          </div>
        </section>

        <section aria-labelledby="profile-thresholds-heading" className="space-y-3 border-t border-slate-800 pt-5">
          <h3 id="profile-thresholds-heading" className="text-sm font-black text-white">Production thresholds</h3>
          <ErrorMessages field="thresholds" errors={validationErrors} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumericInput field="thresholds.targetDpi" label="Target DPI" value={profile.thresholds.targetDpi} errors={validationErrors} onChange={(value) => updateThreshold('targetDpi', value)} />
            <NumericInput field="thresholds.warningDpi" label="Warning DPI" value={profile.thresholds.warningDpi} errors={validationErrors} onChange={(value) => updateThreshold('warningDpi', value)} />
            <NumericInput field="thresholds.criticalDpi" label="Critical DPI" value={profile.thresholds.criticalDpi} errors={validationErrors} onChange={(value) => updateThreshold('criticalDpi', value)} />
            <NumericInput field="thresholds.significantUpscaleRatio" label="Significant upscale ratio" value={profile.thresholds.significantUpscaleRatio} errors={validationErrors} onChange={(value) => updateThreshold('significantUpscaleRatio', value)} />
            <NumericInput field="thresholds.extremeUpscaleRatio" label="Extreme upscale ratio" value={profile.thresholds.extremeUpscaleRatio} errors={validationErrors} onChange={(value) => updateThreshold('extremeUpscaleRatio', value)} />
          </div>
        </section>

        <section aria-labelledby="profile-areas-heading" className="space-y-3 border-t border-slate-800 pt-5">
          <div>
            <h3 id="profile-areas-heading" className="text-sm font-black text-white">Printable areas</h3>
            <p className="mt-1 text-xs text-slate-500">Physical platen size and preview bounds for every product location.</p>
          </div>
          <ErrorMessages field="printableAreas" errors={validationErrors} />
          <div className="space-y-3">
            {Object.keys(profile.printableAreas)
              .sort((left, right) => left.localeCompare(right))
              .map((key) => {
                const area = profile.printableAreas[key];
                const rowField = `printableAreas.${key}`;
                return (
                  <fieldset key={key} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                    <legend className="px-1 text-xs font-black text-slate-200">{readableArea(key)}</legend>
                    <ErrorMessages field={rowField} errors={validationErrors} />
                    <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <NumericInput field={`${rowField}.widthInches`} label="Width (inches)" value={area.widthInches} errors={validationErrors} onChange={(value) => updateArea(key, 'widthInches', value)} />
                      <NumericInput field={`${rowField}.heightInches`} label="Height (inches)" value={area.heightInches} errors={validationErrors} onChange={(value) => updateArea(key, 'heightInches', value)} />
                      <NumericInput field={`${rowField}.xPercent`} label="Preview X (%)" value={area.xPercent} errors={validationErrors} onChange={(value) => updateArea(key, 'xPercent', value)} />
                      <NumericInput field={`${rowField}.yPercent`} label="Preview Y (%)" value={area.yPercent} errors={validationErrors} onChange={(value) => updateArea(key, 'yPercent', value)} />
                      <NumericInput field={`${rowField}.widthPercent`} label="Preview width (%)" value={area.widthPercent} errors={validationErrors} onChange={(value) => updateArea(key, 'widthPercent', value)} />
                      <NumericInput field={`${rowField}.heightPercent`} label="Preview height (%)" value={area.heightPercent} errors={validationErrors} onChange={(value) => updateArea(key, 'heightPercent', value)} />
                    </div>
                  </fieldset>
                );
              })}
          </div>
        </section>

        <section aria-labelledby="profile-output-heading" className="space-y-3 border-t border-slate-800 pt-5">
          <h3 id="profile-output-heading" className="text-sm font-black text-white">Artwork defaults</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <BooleanInput label="Preserve transparency" checked={profile.defaults.preserveTransparency} onChange={(checked) => onChange({ ...profile, defaults: { ...profile.defaults, preserveTransparency: checked } })} />
            <BooleanInput label="Include underbase" checked={profile.defaults.includeUnderbase} onChange={(checked) => onChange({ ...profile, defaults: { ...profile.defaults, includeUnderbase: checked } })} />
          </div>
        </section>

        <section aria-labelledby="profile-package-heading" className="space-y-3 border-t border-slate-800 pt-5">
          <h3 id="profile-package-heading" className="text-sm font-black text-white">Output and package defaults</h3>
          <ErrorMessages field="defaults" errors={validationErrors} />
          <ErrorMessages field="defaults.packageOptions" errors={validationErrors} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClassName}>
              Default format
              <select
                value={profile.defaults.format}
                onChange={(event) => onChange({
                  ...profile,
                  defaults: {
                    ...profile.defaults,
                    format: event.target.value as OutputFormat,
                  },
                })}
                className={`${inputClassName} mt-1`}
              >
                {Object.values(OutputFormat).map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
              <ErrorMessages field="defaults.format" errors={validationErrors} />
            </label>
            <label className={labelClassName}>
              Naming pattern
              <input
                value={profile.defaults.packageOptions.namingPattern}
                onChange={(event) => updatePackageOption('namingPattern', event.target.value)}
                className={`${inputClassName} mt-1`}
              />
              <ErrorMessages field="defaults.packageOptions.namingPattern" errors={validationErrors} />
            </label>
            <label className={`${labelClassName} sm:col-span-2`}>
              Selected mockup indices
              <input
                value={profile.defaults.packageOptions.selectedMockupIndices.join(', ')}
                onChange={(event) => updatePackageOption(
                  'selectedMockupIndices',
                  event.target.value === ''
                    ? []
                    : event.target.value.split(',').map((value) => Number(value.trim())),
                )}
                aria-invalid={validationErrors.some((error) => error.field === 'defaults.packageOptions.selectedMockupIndices') || undefined}
                aria-describedby={validationErrors.some((error) => error.field === 'defaults.packageOptions.selectedMockupIndices') ? `${fieldId('defaults.packageOptions.selectedMockupIndices')}-error` : undefined}
                className={`${inputClassName} mt-1`}
                placeholder="1, 2, 6"
              />
              <ErrorMessages field="defaults.packageOptions.selectedMockupIndices" errors={validationErrors} />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <BooleanInput label="Include print master" checked={profile.defaults.packageOptions.includePrintMaster} onChange={(checked) => updatePackageOption('includePrintMaster', checked)} />
            <BooleanInput label="Include production PDF" checked={profile.defaults.packageOptions.includeProductionPdf} onChange={(checked) => updatePackageOption('includeProductionPdf', checked)} />
            <BooleanInput label="Include mockups" checked={profile.defaults.packageOptions.includeMockups} onChange={(checked) => updatePackageOption('includeMockups', checked)} />
            <BooleanInput label="Package includes underbase" checked={profile.defaults.packageOptions.includeUnderbase} onChange={(checked) => updatePackageOption('includeUnderbase', checked)} />
            <BooleanInput label="Include summary" checked={profile.defaults.packageOptions.includeSummary} onChange={(checked) => updatePackageOption('includeSummary', checked)} />
            <BooleanInput label="Include manifest" checked={profile.defaults.packageOptions.includeManifest} onChange={(checked) => updatePackageOption('includeManifest', checked)} />
          </div>
        </section>
      </div>

      <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300 hover:border-slate-500 hover:text-white">Cancel</button>
        <button type="button" disabled={!canSave} onClick={onSave} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">Save profile</button>
      </footer>
    </div>
  );
};
