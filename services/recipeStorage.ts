import { DEFAULT_SETTINGS } from '../constants';
import { ProcessingSettings, UserRecipe } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const migrateStoredRecipes = (raw: string | null): UserRecipe[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): UserRecipe[] => {
      if (!isRecord(entry) || !isRecord(entry.settings) || typeof entry.name !== 'string') {
        return [];
      }
      return [{
        id: typeof entry.id === 'string' ? entry.id : `recipe_${Date.now()}`,
        name: entry.name,
        description: typeof entry.description === 'string' ? entry.description : '',
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
        source: 'user',
        settings: {
          ...DEFAULT_SETTINGS,
          ...(entry.settings as Partial<ProcessingSettings>),
        },
      }];
    });
  } catch {
    return [];
  }
};
