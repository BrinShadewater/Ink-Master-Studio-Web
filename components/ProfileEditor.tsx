import React, { useEffect, useRef, useState } from 'react';
import {
  OutputFormat,
  PrintableArea,
  ProductionPackageOptions,
  ProductionProfile,
  ProductionThresholds,
  ProfileValidationError,
} from '../types';
import {
  normalizeProfileUnderbase,
  parseSelectedMockupIndices,
} from '../services/productionProfiles';

interface ProfileEditorProps {
  profile: ProductionProfile;
  validationErrors: ProfileValidationError[];
  onChange: (profile: ProductionProfile) => void;
  onSave: () => void;
  onCancel: () => void;
  saveDisabledReason?: string | null;
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
    <div id={`${fieldId(field)}-error`} role="alert" className="mt-1 space-y-1 text-xs text-rose-300">
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
  field: string;
  label: string;
  checked: boolean;
  errors: ProfileValidationError[];
  onChange: (checked: boolean) => void;
}> = ({ field, label, checked, errors, onChange }) => {
  const invalid = errors.some((error) => error.field === field);
  const id = fieldId(field);
  return (
    <div>
      <label htmlFor={id} className={`flex items-center gap-3 rounded-lg border bg-slate-900/50 px-3 py-2 text-sm text-slate-200 ${invalid ? 'border-rose-500' : 'border-slate-800'}`}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
        />
        {label}
      </label>
      <ErrorMessages field={field} errors={errors} />
    </div>
  );
};

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  profile,
  validationErrors,
  onChange,
  onSave,
  onCancel,
  saveDisabledReason,
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
  const selectedIndicesField = 'defaults.packageOptions.selectedMockupIndices';
  const selectedIndicesKey = JSON.stringify(
    profile.defaults.packageOptions.selectedMockupIndices,
  );
  const emittedSelectedIndices = useRef<number[] | null>(null);
  const [selectedIndicesDraft, setSelectedIndicesDraft] = useState(
    profile.defaults.packageOptions.selectedMockupIndices.join(', '),
  );
  const [selectedIndicesDraftError, setSelectedIndicesDraftError] = useState<string | null>(null);
  useEffect(() => {
    if (
      emittedSelectedIndices.current
      === profile.defaults.packageOptions.selectedMockupIndices
    ) {
      emittedSelectedIndices.current = null;
      return;
    }
    setSelectedIndicesDraft(
      profile.defaults.packageOptions.selectedMockupIndices.join(', '),
    );
    setSelectedIndicesDraftError(null);
  }, [
    profile.id,
    profile.revision,
    profile.defaults.packageOptions.selectedMockupIndices,
    selectedIndicesKey,
  ]);
  const updateSelectedIndicesDraft = (draft: string) => {
    setSelectedIndicesDraft(draft);
    const parsed = parseSelectedMockupIndices(draft);
    if (parsed.success === false) {
      setSelectedIndicesDraftError(parsed.error);
      return;
    }
    setSelectedIndicesDraftError(null);
    emittedSelectedIndices.current = parsed.value;
    updatePackageOption('selectedMockupIndices', parsed.value);
  };
  const hasError = (field: string) =>
    validationErrors.some((error) => error.field === field);
  const describedBy = (field: string) =>
    hasError(field) ? `${fieldId(field)}-error` : undefined;
  const nameInvalid = validationErrors.some((error) => error.field === 'name');
  const canSave = profile.name.trim().length > 0
    && validationErrors.length === 0
    && selectedIndicesDraftError === null
    && !saveDisabledReason;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        <section aria-labelledby="profile-printer-heading" className="space-y-3">
          <h3 id="profile-printer-heading" className="text-sm font-black text-white">Printer and method</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClassName}>
              Profile name
              <input
                id={fieldId('name')}
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
                id={fieldId('printerName')}
                value={profile.printerName}
                aria-invalid={hasError('printerName') || undefined}
                aria-describedby={describedBy('printerName')}
                onChange={(event) => onChange({ ...profile, printerName: event.target.value })}
                className={`${inputClassName} mt-1 ${hasError('printerName') ? 'border-rose-500' : ''}`}
              />
              <ErrorMessages field="printerName" errors={validationErrors} />
            </label>
            <label className={`${labelClassName} sm:col-span-2`}>
              Description
              <textarea
                id={fieldId('description')}
                value={profile.description}
                rows={3}
                aria-invalid={hasError('description') || undefined}
                aria-describedby={describedBy('description')}
                onChange={(event) => onChange({ ...profile, description: event.target.value })}
                className={`${inputClassName} mt-1 resize-y ${hasError('description') ? 'border-rose-500' : ''}`}
              />
              <ErrorMessages field="description" errors={validationErrors} />
            </label>
            <label className={labelClassName}>
              Production method
              <select
                id={fieldId('method')}
                value={profile.method}
                aria-invalid={hasError('method') || undefined}
                aria-describedby={describedBy('method')}
                onChange={(event) => onChange({
                  ...profile,
                  method: event.target.value as ProductionProfile['method'],
                })}
                className={`${inputClassName} mt-1 ${hasError('method') ? 'border-rose-500' : ''}`}
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
            <BooleanInput field="defaults.preserveTransparency" label="Preserve transparency" checked={profile.defaults.preserveTransparency} errors={validationErrors} onChange={(checked) => onChange({ ...profile, defaults: { ...profile.defaults, preserveTransparency: checked } })} />
            <BooleanInput field="defaults.includeUnderbase" label="Include underbase" checked={profile.defaults.includeUnderbase} errors={validationErrors} onChange={(checked) => onChange(normalizeProfileUnderbase(profile, checked))} />
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
                id={fieldId('defaults.format')}
                value={profile.defaults.format}
                aria-invalid={hasError('defaults.format') || undefined}
                aria-describedby={describedBy('defaults.format')}
                onChange={(event) => onChange({
                  ...profile,
                  defaults: {
                    ...profile.defaults,
                    format: event.target.value as OutputFormat,
                  },
                })}
                className={`${inputClassName} mt-1 ${hasError('defaults.format') ? 'border-rose-500' : ''}`}
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
                id={fieldId('defaults.packageOptions.namingPattern')}
                value={profile.defaults.packageOptions.namingPattern}
                aria-invalid={hasError('defaults.packageOptions.namingPattern') || undefined}
                aria-describedby={describedBy('defaults.packageOptions.namingPattern')}
                onChange={(event) => updatePackageOption('namingPattern', event.target.value)}
                className={`${inputClassName} mt-1 ${hasError('defaults.packageOptions.namingPattern') ? 'border-rose-500' : ''}`}
              />
              <ErrorMessages field="defaults.packageOptions.namingPattern" errors={validationErrors} />
            </label>
            <label className={`${labelClassName} sm:col-span-2`}>
              Selected mockup indices
              <input
                id={fieldId(selectedIndicesField)}
                value={selectedIndicesDraft}
                onChange={(event) => updateSelectedIndicesDraft(event.target.value)}
                aria-invalid={hasError(selectedIndicesField) || selectedIndicesDraftError !== null || undefined}
                aria-describedby={[
                  hasError(selectedIndicesField) ? `${fieldId(selectedIndicesField)}-error` : null,
                  selectedIndicesDraftError ? `${fieldId(selectedIndicesField)}-draft-error` : null,
                ].filter(Boolean).join(' ') || undefined}
                className={`${inputClassName} mt-1 ${hasError(selectedIndicesField) || selectedIndicesDraftError ? 'border-rose-500' : ''}`}
                placeholder="1, 2, 6"
              />
              <ErrorMessages field={selectedIndicesField} errors={validationErrors} />
              {selectedIndicesDraftError && (
                <p id={`${fieldId(selectedIndicesField)}-draft-error`} role="alert" className="mt-1 text-xs text-rose-300">
                  {selectedIndicesDraftError}
                </p>
              )}
              {!selectedIndicesDraftError && !hasError(selectedIndicesField) && (
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  Comma-separated whole numbers; leave blank to select none.
                </span>
              )}
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <BooleanInput field="defaults.packageOptions.includePrintMaster" label="Include print master" checked={profile.defaults.packageOptions.includePrintMaster} errors={validationErrors} onChange={(checked) => updatePackageOption('includePrintMaster', checked)} />
            <BooleanInput field="defaults.packageOptions.includeProductionPdf" label="Include production PDF" checked={profile.defaults.packageOptions.includeProductionPdf} errors={validationErrors} onChange={(checked) => updatePackageOption('includeProductionPdf', checked)} />
            <BooleanInput field="defaults.packageOptions.includeMockups" label="Include mockups" checked={profile.defaults.packageOptions.includeMockups} errors={validationErrors} onChange={(checked) => updatePackageOption('includeMockups', checked)} />
            <BooleanInput field="defaults.packageOptions.includeUnderbase" label="Package includes underbase" checked={profile.defaults.packageOptions.includeUnderbase} errors={validationErrors} onChange={(checked) => onChange(normalizeProfileUnderbase(profile, checked))} />
            <BooleanInput field="defaults.packageOptions.includeSummary" label="Include summary" checked={profile.defaults.packageOptions.includeSummary} errors={validationErrors} onChange={(checked) => updatePackageOption('includeSummary', checked)} />
            <BooleanInput field="defaults.packageOptions.includeManifest" label="Include manifest" checked={profile.defaults.packageOptions.includeManifest} errors={validationErrors} onChange={(checked) => updatePackageOption('includeManifest', checked)} />
          </div>
        </section>
      </div>

      <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
        {saveDisabledReason && (
          <p className="self-center text-xs text-slate-500 sm:mr-auto">{saveDisabledReason}</p>
        )}
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300 hover:border-slate-500 hover:text-white">Cancel</button>
        <button type="button" disabled={!canSave} onClick={onSave} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">Save profile</button>
      </footer>
    </div>
  );
};
