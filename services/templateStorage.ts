import { createStudioJob, touchStudioJob } from './jobModel';
import { placementVariantKey } from './placement';
import { describeSelectedMockups, normalizeMockupSelection, PRODUCTION_MOCKUPS } from './mockups';
import { AppliedTemplateStatus, ShopTemplate, StudioJob } from '../types';

const STORAGE_KEY = 'inkmaster_shop_templates_v1';
const now = () => Date.now();
const createId = () => `template_${now()}_${Math.random().toString(36).slice(2, 9)}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export interface TemplateImportResult {
  templates: ShopTemplate[];
  added: number;
  replaced: number;
  renamed: number;
  skipped: number;
}

export const createTemplateFromJob = (
  job: StudioJob,
  name: string,
  description: string,
): ShopTemplate => {
  const timestamp = now();
  const placement = job.placements[job.activePlacementKey];
  return {
    schemaVersion: 1,
    id: createId(),
    name: name.trim() || 'Untitled template',
    description: description.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    recipeId: job.selectedRecipeId,
    itemType: job.settings.itemType,
    settings: { ...job.settings, colorReplacements: [...job.settings.colorReplacements] },
    printSpecification: { ...job.printSpecification },
    placement: { ...placement },
    packageOptions: {
      ...job.packageOptions,
      selectedMockupIndices: [...job.packageOptions.selectedMockupIndices],
    },
    proofBranding: { ...job.proofBranding },
  };
};

export const applyTemplateToJob = (job: StudioJob, template: ShopTemplate): StudioJob => {
  const placement = {
    ...template.placement,
    itemType: template.itemType,
  };
  const key = placementVariantKey(placement.itemType, placement.location, placement.garmentSize);
  return touchStudioJob({
    ...job,
    selectedRecipeId: template.recipeId,
    settings: {
      ...template.settings,
      itemType: template.itemType,
      colorReplacements: [...template.settings.colorReplacements],
    },
    printSpecification: { ...template.printSpecification },
    placements: { ...job.placements, [key]: placement },
    activePlacementKey: key,
    packageOptions: {
      ...template.packageOptions,
      selectedMockupIndices: [...template.packageOptions.selectedMockupIndices],
    },
    proofBranding: { ...template.proofBranding },
    appliedTemplate: {
      id: template.id,
      name: template.name,
      appliedAt: now(),
    },
  });
};

export const describeTemplate = (template: ShopTemplate) => ({
  recipe: template.recipeId ?? 'custom',
  product: template.itemType,
  printSize: `${template.printSpecification.widthInches}×${template.printSpecification.heightInches} in ${template.printSpecification.method}`,
  placement: `${template.placement.presetId} · ${template.placement.widthInches}×${template.placement.heightInches} in · ${template.placement.location}`,
  output: `${template.settings.format}${template.settings.preserveTransparency ? ' · transparent' : ''}`,
  namingPattern: template.packageOptions.namingPattern,
  mockups: describeSelectedMockups(template.packageOptions.selectedMockupIndices),
  packageContents: [
    template.packageOptions.includePrintMaster ? 'print master' : null,
    template.packageOptions.includeProductionPdf ? 'spec PDF' : null,
    template.packageOptions.includeMockups ? 'mockups' : null,
    template.packageOptions.includeUnderbase ? 'underbase' : null,
    template.packageOptions.includeSummary ? 'summary' : null,
    template.packageOptions.includeManifest ? 'manifest' : null,
  ].filter((entry): entry is string => Boolean(entry)).join(', ') || 'none',
  proofBranding: template.proofBranding.shopName || 'InkMaster Studio',
});

export const describeTemplateChanges = (
  job: StudioJob,
  template: ShopTemplate,
) => {
  const activePlacement = job.placements[job.activePlacementKey];
  const jobMockups = normalizeMockupSelection(job.packageOptions.selectedMockupIndices, PRODUCTION_MOCKUPS.length).join(',');
  const templateMockups = normalizeMockupSelection(template.packageOptions.selectedMockupIndices, PRODUCTION_MOCKUPS.length).join(',');
  return [
    job.selectedRecipeId !== template.recipeId ? 'recipe' : null,
    job.settings.itemType !== template.itemType ? 'product' : null,
    job.settings.format !== template.settings.format || job.settings.preserveTransparency !== template.settings.preserveTransparency ? 'output' : null,
    job.printSpecification.widthInches !== template.printSpecification.widthInches
      || job.printSpecification.heightInches !== template.printSpecification.heightInches
      || job.printSpecification.method !== template.printSpecification.method
      ? 'print size'
      : null,
    !activePlacement
      || activePlacement.presetId !== template.placement.presetId
      || activePlacement.location !== template.placement.location
      || activePlacement.widthInches !== template.placement.widthInches
      || activePlacement.heightInches !== template.placement.heightInches
      ? 'placement'
      : null,
    job.packageOptions.namingPattern !== template.packageOptions.namingPattern ? 'naming' : null,
    job.packageOptions.includePrintMaster !== template.packageOptions.includePrintMaster
      || job.packageOptions.includeProductionPdf !== template.packageOptions.includeProductionPdf
      || job.packageOptions.includeMockups !== template.packageOptions.includeMockups
      || job.packageOptions.includeUnderbase !== template.packageOptions.includeUnderbase
      || job.packageOptions.includeSummary !== template.packageOptions.includeSummary
      || job.packageOptions.includeManifest !== template.packageOptions.includeManifest
      ? 'package contents'
      : null,
    jobMockups !== templateMockups ? 'mockup colors' : null,
    job.proofBranding.shopName !== template.proofBranding.shopName
      || job.proofBranding.contactLine !== template.proofBranding.contactLine
      || job.proofBranding.footerNote !== template.proofBranding.footerNote
      ? 'proof branding'
      : null,
  ].filter((entry): entry is string => Boolean(entry));
};

export const getAppliedTemplateStatus = (
  job: StudioJob | null,
  templates: ShopTemplate[],
): AppliedTemplateStatus => {
  if (!job?.appliedTemplate) {
    return {
      appliedTemplate: null,
      status: 'none',
      changes: [],
    };
  }
  const template = templates.find((candidate) => candidate.id === job.appliedTemplate?.id);
  if (!template) {
    return {
      appliedTemplate: job.appliedTemplate,
      status: 'missing',
      changes: ['template missing from library'],
    };
  }
  const changes = describeTemplateChanges(job, template);
  return {
    appliedTemplate: job.appliedTemplate,
    status: changes.length ? 'drifted' : 'matches',
    changes,
  };
};

const normalizeTemplate = (value: unknown): ShopTemplate | null => {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.settings)) return null;
  const base = createTemplateFromJob(createStudioJob('Template base'), value.name, typeof value.description === 'string' ? value.description : '');
  const printSpecification = isRecord(value.printSpecification) ? value.printSpecification : {};
  const placement = isRecord(value.placement) ? value.placement : {};
  const packageOptions = isRecord(value.packageOptions) ? value.packageOptions : {};
  const proofBranding = isRecord(value.proofBranding) ? value.proofBranding : {};
  return {
    ...base,
    id: typeof value.id === 'string' ? value.id : base.id,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : base.createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : base.updatedAt,
    recipeId: typeof value.recipeId === 'string' ? value.recipeId as ShopTemplate['recipeId'] : null,
    itemType: typeof value.itemType === 'string' ? value.itemType as ShopTemplate['itemType'] : base.itemType,
    settings: {
      ...base.settings,
      ...value.settings,
      colorReplacements: Array.isArray(value.settings.colorReplacements)
        ? value.settings.colorReplacements as ShopTemplate['settings']['colorReplacements']
        : [],
    },
    printSpecification: { ...base.printSpecification, ...printSpecification },
    placement: { ...base.placement, ...placement },
    packageOptions: {
      ...base.packageOptions,
      ...packageOptions,
      selectedMockupIndices: Array.isArray(packageOptions.selectedMockupIndices)
        ? packageOptions.selectedMockupIndices.filter((index): index is number => Number.isInteger(index))
        : base.packageOptions.selectedMockupIndices,
    },
    proofBranding: { ...base.proofBranding, ...proofBranding },
  };
};

export const migrateTemplates = (raw: string | null): ShopTemplate[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.templates) ? parsed.templates : [];
    return list.flatMap((entry) => {
      const normalized = normalizeTemplate(entry);
      return normalized ? [normalized] : [];
    });
  } catch {
    return [];
  }
};

export const exportTemplates = (templates: ShopTemplate[]) =>
  JSON.stringify({ format: 'inkmaster-templates', schemaVersion: 1, templates }, null, 2);

export const importTemplates = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.format !== 'inkmaster-templates' || parsed.schemaVersion !== 1) {
      return [];
    }
    return migrateTemplates(JSON.stringify(parsed));
  } catch {
    return [];
  }
};

const nextTemplateName = (name: string, usedNames: Set<string>, suffix: string) => {
  if (!usedNames.has(name.toLowerCase())) return name;

  let copy = 2;
  let candidate = `${name} (${suffix})`;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${name} (${suffix} ${copy})`;
    copy += 1;
  }
  return candidate;
};

export const duplicateTemplate = (
  template: ShopTemplate,
  existing: ShopTemplate[],
  requestedName = `${template.name} Copy`,
): ShopTemplate => {
  const timestamp = now();
  const trimmedName = requestedName.trim() || `${template.name} Copy`;
  const usedNames = new Set(existing.map((entry) => entry.name.toLowerCase()));
  return {
    ...template,
    id: createId(),
    name: nextTemplateName(trimmedName, usedNames, 'Copy'),
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: {
      ...template.settings,
      colorReplacements: template.settings.colorReplacements.map((replacement) => ({ ...replacement })),
    },
    printSpecification: { ...template.printSpecification },
    placement: { ...template.placement },
    packageOptions: {
      ...template.packageOptions,
      selectedMockupIndices: [...template.packageOptions.selectedMockupIndices],
    },
    proofBranding: { ...template.proofBranding },
  };
};

export const renameTemplate = (
  template: ShopTemplate,
  existing: ShopTemplate[],
  requestedName: string,
): ShopTemplate => {
  const trimmedName = requestedName.trim();
  if (!trimmedName || trimmedName === template.name) return template;
  const usedNames = new Set(
    existing
      .filter((entry) => entry.id !== template.id)
      .map((entry) => entry.name.toLowerCase()),
  );
  return {
    ...template,
    name: nextTemplateName(trimmedName, usedNames, 'Renamed'),
    updatedAt: now(),
  };
};

export const mergeImportedTemplates = (
  existing: ShopTemplate[],
  imported: ShopTemplate[],
): TemplateImportResult => {
  const existingById = new Map(existing.map((template) => [template.id, template]));
  const originalExistingNames = new Set(existing.map((template) => template.name.toLowerCase()));
  const importedById = new Map<string, ShopTemplate>();
  let skipped = 0;

  for (const template of imported) {
    if (importedById.has(template.id)) {
      skipped += 1;
      continue;
    }
    importedById.set(template.id, template);
  }

  const usedNames = new Set(existing.map((template) => template.name.toLowerCase()));
  const mergedImports: ShopTemplate[] = [];
  let added = 0;
  let replaced = 0;
  let renamed = 0;

  for (const template of importedById.values()) {
    const replacesExisting = existingById.has(template.id);
    if (replacesExisting) {
      replaced += 1;
      usedNames.delete(existingById.get(template.id)!.name.toLowerCase());
    } else {
      added += 1;
    }

    const nextName = nextTemplateName(
      template.name,
      replacesExisting ? usedNames : new Set([...usedNames, ...originalExistingNames]),
      'Imported',
    );
    if (nextName !== template.name) renamed += 1;
    usedNames.add(nextName.toLowerCase());
    mergedImports.push({
      ...template,
      name: nextName,
      updatedAt: now(),
    });
  }

  const importedIds = new Set(mergedImports.map((template) => template.id));
  return {
    templates: [
      ...mergedImports,
      ...existing.filter((template) => !importedIds.has(template.id)),
    ],
    added,
    replaced,
    renamed,
    skipped,
  };
};

export const loadTemplates = () =>
  typeof localStorage === 'undefined' ? [] : migrateTemplates(localStorage.getItem(STORAGE_KEY));

export const saveTemplates = (templates: ShopTemplate[]) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
};
