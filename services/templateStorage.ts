import { createStudioJob, touchStudioJob } from './jobModel';
import { placementVariantKey } from './placement';
import { describeSelectedMockups, normalizeMockupSelection, PRODUCTION_MOCKUPS } from './mockups';
import { ShopTemplate, StudioJob } from '../types';

const STORAGE_KEY = 'inkmaster_shop_templates_v1';
const now = () => Date.now();
const createId = () => `template_${now()}_${Math.random().toString(36).slice(2, 9)}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

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

export const loadTemplates = () =>
  typeof localStorage === 'undefined' ? [] : migrateTemplates(localStorage.getItem(STORAGE_KEY));

export const saveTemplates = (templates: ShopTemplate[]) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
};
