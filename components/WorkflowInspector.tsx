import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArtworkAnalysis,
  EdgeBehavior,
  ExportHistoryEntry,
  OutputFormat,
  ProcessingSettings,
  RecipeId,
  RecipeRecommendation,
  ShirtColor,
  UserRecipe,
  WorkspaceStage,
} from '../types';
import { getRecipe, RECIPES } from '../services/recipes';
import { migrateStoredRecipes } from '../services/recipeStorage';

const STAGES: Array<{ id: WorkspaceStage; label: string; short: string }> = [
  { id: 'goal', label: 'Goal', short: 'Choose the result' },
  { id: 'prepare', label: 'Prepare', short: 'Clean the artwork' },
  { id: 'preview', label: 'Preview', short: 'Check the product' },
  { id: 'export', label: 'Export', short: 'Download files' },
];

const STORAGE_KEY = 'inkmaster_presets';

interface WorkflowInspectorProps {
  stage: WorkspaceStage;
  selectedRecipeId: RecipeId | null;
  analysis: ArtworkAnalysis | null;
  recommendation: RecipeRecommendation | null;
  settings: ProcessingSettings;
  palette: string[];
  exportHistory: ExportHistoryEntry[];
  hasProcessedResult: boolean;
  lowResolutionAcknowledged: boolean;
  isEyedropperMode: boolean;
  onStageChange: (stage: WorkspaceStage) => void;
  onApplyRecipe: (recipeId: RecipeId, settings?: ProcessingSettings) => void;
  onSettingsChange: (settings: ProcessingSettings, commit: boolean) => void;
  onToggleEyedropper: () => void;
  onGenerateUnderbase: (format: 'PNG' | 'SVG' | 'JPG') => void;
  onDownloadPrintFile: () => void;
  onDownloadPdf: () => void;
  onDownloadMockups: () => void;
  onAcknowledgeLowResolution: (value: boolean) => void;
}

const Toggle: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-indigo-500' : 'bg-slate-700'}`}
  >
    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
  </button>
);

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="mb-3">
      <h3 className="text-sm font-bold text-slate-100">{title}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
    </div>
    {children}
  </section>
);

const Segmented: React.FC<{
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => (
  <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-950/50 p-1">
    {options.map((option) => (
      <button
        type="button"
        key={option.value}
        onClick={() => onChange(option.value)}
        className={`rounded-md px-2 py-2 text-[11px] font-bold transition ${value === option.value ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const WorkflowInspector: React.FC<WorkflowInspectorProps> = (props) => {
  const {
    stage,
    selectedRecipeId,
    analysis,
    recommendation,
    settings,
    palette,
    exportHistory,
    hasProcessedResult,
    lowResolutionAcknowledged,
    isEyedropperMode,
    onStageChange,
    onApplyRecipe,
    onSettingsChange,
    onToggleEyedropper,
    onGenerateUnderbase,
    onDownloadPrintFile,
    onDownloadPdf,
    onDownloadMockups,
    onAcknowledgeLowResolution,
  } = props;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [userRecipes, setUserRecipes] = useState<UserRecipe[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const migrated = migrateStoredRecipes(localStorage.getItem(STORAGE_KEY));
    setUserRecipes(migrated);
  }, []);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [stage]);

  const selectedRecipe = selectedRecipeId ? getRecipe(selectedRecipeId) : null;
  const stageIndex = STAGES.findIndex((entry) => entry.id === stage);
  const update = <K extends keyof ProcessingSettings>(key: K, value: ProcessingSettings[K], commit = true) =>
    onSettingsChange({ ...settings, [key]: value }, commit);

  const finishMode = settings.grain >= 20 ? 'distressed' : settings.edgeBehavior === EdgeBehavior.SOFT ? 'soft' : 'clean';
  const changes = useMemo(() => recommendation?.proposedChanges ?? [], [recommendation]);

  const saveRecipe = () => {
    if (!recipeName.trim()) return;
    const recipe: UserRecipe = {
      id: `preset_${Date.now()}`,
      name: recipeName.trim(),
      description: selectedRecipe ? `Based on ${selectedRecipe.name}` : 'Custom Ink Master treatment',
      createdAt: Date.now(),
      source: 'user',
      settings: { ...settings },
    };
    const next = [recipe, ...userRecipes];
    setUserRecipes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRecipeName('');
    setSaveOpen(false);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-t border-slate-800 bg-slate-950 lg:border-r lg:border-t-0">
      <nav className="grid flex-none grid-cols-4 border-b border-slate-800 px-2 py-2 lg:grid-cols-1 lg:gap-1 lg:p-3">
        {STAGES.map((entry, index) => (
          <button
            type="button"
            key={entry.id}
            onClick={() => onStageChange(entry.id)}
            className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition lg:px-3 ${stage === entry.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/30' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200'}`}
          >
            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-[10px] font-black ${stage === entry.id ? 'bg-white/15' : index < stageIndex ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-900'}`}>
              {index < stageIndex ? '✓' : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-bold lg:text-xs">{entry.label}</span>
              <span className={`hidden truncate text-[10px] lg:block ${stage === entry.id ? 'text-indigo-100/70' : 'text-slate-600'}`}>{entry.short}</span>
            </span>
          </button>
        ))}
      </nav>

      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5">
        {stage === 'goal' && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">What are you making?</p>
              <h2 className="mt-1 text-xl font-black text-white">Choose the result, not the machinery.</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Ink Master will set up the technical details. You can refine everything later.</p>
            </div>

            {recommendation && (
              <section className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4 shadow-lg shadow-indigo-950/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Recommended</p>
                    <h3 className="mt-1 text-base font-black text-white">{getRecipe(recommendation.recipeId).name}</h3>
                  </div>
                  <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-[10px] font-bold text-indigo-200">{Math.round(recommendation.confidence * 100)}% match</span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {recommendation.reasons.map((reason) => <li key={reason} className="flex gap-2 text-xs leading-relaxed text-slate-300"><span className="text-indigo-400">•</span>{reason}</li>)}
                </ul>
                <details className="mt-3 text-xs text-slate-400">
                  <summary className="cursor-pointer font-semibold text-indigo-300">What will change?</summary>
                  <ul className="mt-2 space-y-1 pl-3">{changes.map((change) => <li key={change}>— {change}</li>)}</ul>
                </details>
                <button type="button" onClick={() => onApplyRecipe(recommendation.recipeId)} className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-500">
                  Apply recommended setup
                </button>
              </section>
            )}

            <div className="grid grid-cols-2 gap-2">
              {RECIPES.map((recipe) => (
                <button
                  type="button"
                  key={recipe.id}
                  onClick={() => onApplyRecipe(recipe.id)}
                  className={`min-h-28 rounded-xl border p-3 text-left transition ${selectedRecipeId === recipe.id ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30' : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900'}`}
                >
                  <span className="text-lg text-indigo-300">{recipe.icon}</span>
                  <span className="mt-2 block text-xs font-black text-slate-100">{recipe.name}</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{recipe.outcome}</span>
                </button>
              ))}
            </div>

            {userRecipes.length > 0 && (
              <Section title="My Recipes" description="Your existing presets have been kept and translated into this workflow.">
                <div className="space-y-2">
                  {userRecipes.map((recipe) => (
                    <button type="button" key={recipe.id} onClick={() => onApplyRecipe('custom', recipe.settings)} className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left hover:border-indigo-500/50">
                      <span>
                        <span className="block text-xs font-bold text-slate-200">{recipe.name}</span>
                        <span className="block text-[10px] text-slate-500">{recipe.description || 'Saved treatment'}</span>
                      </span>
                      <span className="text-[10px] font-bold text-indigo-300">Apply</span>
                    </button>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {stage === 'prepare' && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Prepare</p>
              <h2 className="mt-1 text-xl font-black text-white">Make the artwork print-friendly.</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Only the decisions that affect this artwork are shown here.</p>
            </div>

            <Section title="Background" description="Remove a solid border color while protecting the artwork inside it.">
              <Segmented
                value={settings.bgRemoval ? 'remove' : 'keep'}
                options={[{ value: 'keep', label: 'Keep as-is' }, { value: 'remove', label: 'Remove solid' }, { value: 'refine', label: 'Refine' }]}
                onChange={(value) => {
                  if (value === 'keep') update('bgRemoval', false);
                  if (value === 'remove') onSettingsChange({ ...settings, bgRemoval: true, bgAutoDetect: true, bgColorOverride: null }, true);
                  if (value === 'refine') { update('bgRemoval', true); setAdvancedOpen(true); }
                }}
              />
              {analysis?.edgeBackground.isUniform && (
                <p className="mt-2 text-[10px] text-emerald-400">Solid {analysis.edgeBackground.tone} edge detected: {analysis.edgeBackground.color}</p>
              )}
            </Section>

            <Section title="Garment treatment" description="Choose where the design needs to remain readable.">
              <Segmented
                value={settings.shirtColor}
                options={[{ value: ShirtColor.NONE, label: 'No knockout' }, { value: ShirtColor.BLACK, label: 'Dark garment' }, { value: ShirtColor.WHITE, label: 'Light garment' }]}
                onChange={(value) => update('shirtColor', value as ShirtColor)}
              />
            </Section>

            <Section title="Finish" description="Use one clear treatment. Fine controls remain available below.">
              <Segmented
                value={finishMode}
                options={[{ value: 'clean', label: 'Clean' }, { value: 'soft', label: 'Soft' }, { value: 'distressed', label: 'Distressed' }]}
                onChange={(value) => {
                  if (value === 'clean') onSettingsChange({ ...settings, edgeBehavior: EdgeBehavior.HARD, edgeFeather: 0, grain: 0, noise: 0, sharpness: 15 }, true);
                  if (value === 'soft') onSettingsChange({ ...settings, edgeBehavior: EdgeBehavior.SOFT, edgeFeather: 2, grain: 0, noise: 0, sharpness: 0 }, true);
                  if (value === 'distressed') onSettingsChange({ ...settings, edgeBehavior: EdgeBehavior.SOFT, edgeFeather: 2, grain: 36, noise: 12, sharpness: 0 }, true);
                }}
              />
              {finishMode === 'distressed' && (
                <label className="mt-3 block text-xs text-slate-400">
                  Distress intensity <span className="float-right font-mono text-indigo-300">{settings.grain}%</span>
                  <input type="range" min="10" max="80" value={settings.grain} onChange={(event) => update('grain', Number(event.target.value), false)} onMouseUp={() => update('grain', settings.grain)} className="mt-2 w-full accent-indigo-500" />
                </label>
              )}
            </Section>

            <Section title="Color" description="Pick a color from the artwork, then choose its replacement.">
              <button type="button" onClick={onToggleEyedropper} className={`w-full rounded-lg border px-3 py-2.5 text-xs font-bold transition ${isEyedropperMode ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200' : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-indigo-500'}`}>
                {isEyedropperMode ? 'Click a color on the artwork…' : 'Replace a color'}
              </button>
              {palette.length > 0 && <div className="mt-3 flex gap-2">{palette.map((color) => <span key={color} className="h-6 w-6 rounded-full border border-slate-600" style={{ backgroundColor: color }} title={color} />)}</div>}
            </Section>

            <Section title="Make scalable" description="Best for logos and limited-color artwork.">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-200">Trace artwork to SVG</p>
                  <p className="text-[10px] text-slate-500">{analysis?.vectorSuitability === 'strong' ? 'Strong fit for this artwork' : 'Use when crisp paths matter more than texture'}</p>
                </div>
                <Toggle checked={settings.vectorize} onChange={() => onSettingsChange({ ...settings, vectorize: !settings.vectorize, format: !settings.vectorize ? OutputFormat.SVG : OutputFormat.PNG }, true)} label="Make scalable" />
              </div>
            </Section>

            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs font-bold text-slate-300 hover:border-slate-700">
              Advanced controls <span aria-hidden>{advancedOpen ? '−' : '+'}</span>
            </button>
            {advancedOpen && (
              <Section title="Technical controls" description="Fine-tune only when the simplified treatment needs correction.">
                <div className="space-y-4">
                  {[
                    ['Background tolerance', 'bgRemovalTolerance', settings.bgRemovalTolerance, 0, 100],
                    ['Knockout sensitivity', 'threshold', settings.threshold, 0, 100],
                    ['Edge softness', 'edgeFeather', settings.edgeFeather, 0, 20],
                    ['Sharpness', 'sharpness', settings.sharpness, 0, 100],
                    ['Fine noise', 'noise', settings.noise, 0, 100],
                    ['Grain', 'grain', settings.grain, 0, 100],
                  ].map(([label, key, value, min, max]) => (
                    <label key={String(key)} className="block text-xs text-slate-400">
                      {label} <span className="float-right font-mono text-indigo-300">{value}</span>
                      <input type="range" min={Number(min)} max={Number(max)} value={Number(value)} onChange={(event) => update(key as keyof ProcessingSettings, Number(event.target.value) as never, false)} onMouseUp={() => update(key as keyof ProcessingSettings, settings[key as keyof ProcessingSettings] as never)} className="mt-2 w-full accent-indigo-500" />
                    </label>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Preview</p>
              <h2 className="mt-1 text-xl font-black text-white">Check it where it will live.</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Switch the canvas between artwork and garment views. Check light and dark colors before exporting.</p>
            </div>
            <Section title="Print readiness">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-slate-100">{analysis?.printQuality.dpi ?? '—'} DPI</p>
                  <p className={`text-xs ${analysis?.printQuality.status === 'good' ? 'text-emerald-400' : analysis?.printQuality.status === 'low' ? 'text-amber-400' : 'text-rose-400'}`}>{analysis?.printQuality.label ?? 'Analyzing artwork'}</p>
                </div>
                <span className={`h-3 w-3 rounded-full ${analysis?.printQuality.status === 'good' ? 'bg-emerald-400' : analysis?.printQuality.status === 'low' ? 'bg-amber-400' : 'bg-rose-400'}`} />
              </div>
            </Section>
            <Section title="Review checklist">
              <ul className="space-y-2 text-xs text-slate-400">
                <li>✓ Check the design on both light and dark garments.</li>
                <li>✓ Use Before/After to inspect removed backgrounds and texture.</li>
                <li>✓ Make sure fine details remain visible at normal print size.</li>
              </ul>
            </Section>
            <Section title="Active setup">
              <p className="text-xs font-bold text-slate-200">{selectedRecipe?.name ?? 'Custom treatment'}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{selectedRecipe?.description ?? 'Your current settings are being used.'}</p>
            </Section>
          </div>
        )}

        {stage === 'export' && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Export</p>
              <h2 className="mt-1 text-xl font-black text-white">Take the right file, not every file.</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Your selected treatment is summarized before download.</p>
            </div>
            <Section title="Output format">
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-slate-700 bg-slate-950/50 p-1">
                {Object.values(OutputFormat).map((format) => (
                  <button type="button" key={format} disabled={settings.vectorize && format !== OutputFormat.SVG} onClick={() => update('format', format)} className={`rounded-md py-2 text-[10px] font-black transition ${settings.format === format ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25'}`}>{format}</button>
                ))}
              </div>
              {settings.format !== OutputFormat.JPG && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-300">Transparent background</span>
                  <Toggle checked={settings.preserveTransparency} onChange={() => update('preserveTransparency', !settings.preserveTransparency)} label="Transparent background" />
                </div>
              )}
            </Section>

            {analysis?.printQuality.status !== 'good' && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-xs font-bold text-amber-300">Resolution warning</p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-100/70">{analysis?.warnings[0] ?? 'This file may appear soft at a large print size.'}</p>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] text-slate-300">
                  <input type="checkbox" checked={lowResolutionAcknowledged} onChange={(event) => onAcknowledgeLowResolution(event.target.checked)} className="mt-0.5 accent-indigo-500" />
                  I understand and want to export the production file.
                </label>
              </section>
            )}

            <Section title="Downloads" description={`${settings.format} · 4200×5100 print master · ${selectedRecipe?.name ?? 'Custom treatment'}`}>
              <div className="space-y-2">
                <button type="button" disabled={!hasProcessedResult || (analysis?.printQuality.status !== 'good' && !lowResolutionAcknowledged)} onClick={onDownloadPrintFile} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-xs font-black text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
                  Download print file
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={!hasProcessedResult} onClick={onDownloadPdf} className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-xs font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30">Production PDF</button>
                  <button type="button" disabled={!hasProcessedResult} onClick={onDownloadMockups} className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-xs font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30">Mockup set</button>
                </div>
              </div>
            </Section>

            {settings.shirtColor === ShirtColor.BLACK && (
              <Section title="White underbase" description="Optional silhouette layer for dark-garment DTG production.">
                <div className="grid grid-cols-3 gap-2">{(['PNG', 'SVG', 'JPG'] as const).map((format) => <button type="button" key={format} disabled={!hasProcessedResult} onClick={() => onGenerateUnderbase(format)} className="rounded-lg border border-slate-700 py-2 text-[10px] font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30">{format}</button>)}</div>
              </Section>
            )}

            {exportHistory.length > 0 && (
              <Section title="Recent exports">
                <div className="space-y-2">{exportHistory.slice(0, 3).map((entry) => <a key={entry.id} href={entry.url} download={entry.filename} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-300 hover:border-indigo-500"><span className="truncate">{entry.filename}</span><span className="text-indigo-300">Again</span></a>)}</div>
              </Section>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              {!saveOpen ? (
                <button type="button" onClick={() => setSaveOpen(true)} className="w-full text-xs font-bold text-slate-400 hover:text-white">Save current setup as My Recipe</button>
              ) : (
                <div className="flex gap-2">
                  <input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} placeholder="Recipe name" maxLength={30} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
                  <button type="button" onClick={saveRecipe} disabled={!recipeName.trim()} className="rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-30">Save</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-none items-center gap-2 border-t border-slate-800 bg-slate-950 p-3 lg:p-4">
        <button type="button" disabled={stageIndex === 0} onClick={() => onStageChange(STAGES[Math.max(0, stageIndex - 1)].id)} className="rounded-lg border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-25">
          Back
        </button>
        <button type="button" disabled={stageIndex === STAGES.length - 1} onClick={() => onStageChange(STAGES[Math.min(STAGES.length - 1, stageIndex + 1)].id)} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500">
          {stage === 'goal' ? 'Continue to prepare' : stage === 'prepare' ? 'Preview result' : stage === 'preview' ? 'Continue to export' : 'Ready to download'}
        </button>
      </footer>
    </aside>
  );
};
