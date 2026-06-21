import { createStudioJob, touchStudioJob } from './jobModel';
import { placementVariantKey } from './placement';
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
