import {
  ArtworkAnalysis,
  EdgeBehavior,
  OutputFormat,
  ProcessingSettings,
  RecipeDefinition,
  RecipeId,
  RecipeRecommendation,
  ShirtColor,
} from '../types';

export const RECIPES: RecipeDefinition[] = [
  { id: 'dark-garment', name: 'Dark Garment Print', description: 'Prepare artwork to read clearly on black and dark shirts.', icon: '◐', outcome: 'Transparent PNG · soft DTG edges' },
  { id: 'light-garment', name: 'Light Garment Print', description: 'Protect dark details and remove light solid backgrounds.', icon: '☀', outcome: 'Transparent PNG · light-shirt proof' },
  { id: 'clean-logo', name: 'Clean Logo', description: 'Keep edges crisp and make limited-color artwork scalable.', icon: '✦', outcome: 'Clean finish · vector-ready' },
  { id: 'vintage-distressed', name: 'Vintage Distressed', description: 'Preserve texture and add a controlled worn-in finish.', icon: '✺', outcome: 'Soft edges · visible grain' },
  { id: 'mockups-only', name: 'Mockups Only', description: 'Keep the source intact and move straight to product previews.', icon: '▣', outcome: 'Original artwork · garment mockups' },
  { id: 'custom', name: 'Custom', description: 'Start neutral and choose every treatment yourself.', icon: '⚙', outcome: 'No automatic treatment' },
];

export const resolveRecipeSettings = (
  recipeId: RecipeId,
  analysis: ArtworkAnalysis | null,
  base: ProcessingSettings,
): ProcessingSettings => {
  const edgeColor = analysis?.edgeBackground.isUniform
    ? analysis.edgeBackground.color
    : null;
  const removeEdge = Boolean(analysis?.edgeBackground.isUniform && !analysis.hasTransparency);

  switch (recipeId) {
    case 'dark-garment':
      return {
        ...base,
        format: OutputFormat.PNG,
        shirtColor: ShirtColor.BLACK,
        preserveTransparency: true,
        bgRemoval: removeEdge,
        bgAutoDetect: !edgeColor,
        bgColorOverride: edgeColor,
        threshold: analysis?.edgeBackground.tone === 'dark' ? 30 : 22,
        edgeBehavior: EdgeBehavior.SOFT,
        edgeFeather: 2,
        vectorize: false,
      };
    case 'light-garment':
      return {
        ...base,
        format: OutputFormat.PNG,
        shirtColor: ShirtColor.WHITE,
        preserveTransparency: true,
        bgRemoval: removeEdge,
        bgAutoDetect: !edgeColor,
        bgColorOverride: edgeColor,
        threshold: analysis?.edgeBackground.tone === 'light' ? 25 : 18,
        edgeBehavior: EdgeBehavior.SOFT,
        edgeFeather: 1,
        vectorize: false,
      };
    case 'clean-logo':
      return {
        ...base,
        format: analysis?.vectorSuitability === 'strong' ? OutputFormat.SVG : OutputFormat.PNG,
        shirtColor: ShirtColor.NONE,
        preserveTransparency: true,
        bgRemoval: removeEdge,
        bgAutoDetect: !edgeColor,
        bgColorOverride: edgeColor,
        edgeBehavior: EdgeBehavior.HARD,
        edgeFeather: 0,
        noise: 0,
        grain: 0,
        sharpness: 18,
        vectorize: analysis?.vectorSuitability === 'strong',
        vectorizeColors: Math.max(2, Math.min(16, analysis?.palette.length ?? 8)),
      };
    case 'vintage-distressed':
      return {
        ...base,
        format: OutputFormat.PNG,
        shirtColor: ShirtColor.BLACK,
        preserveTransparency: true,
        bgRemoval: removeEdge,
        bgAutoDetect: !edgeColor,
        bgColorOverride: edgeColor,
        edgeBehavior: EdgeBehavior.SOFT,
        edgeFeather: 2,
        noise: 12,
        grain: 36,
        sharpness: 0,
        vectorize: false,
      };
    case 'mockups-only':
      return {
        ...base,
        shirtColor: ShirtColor.NONE,
        bgRemoval: false,
        vectorize: false,
        noise: 0,
        grain: 0,
        sharpness: 0,
        edgeFeather: 0,
      };
    case 'custom':
    default:
      return {
        ...base,
        shirtColor: ShirtColor.NONE,
        bgRemoval: false,
        vectorize: false,
        noise: 0,
        grain: 0,
        sharpness: 0,
        edgeFeather: 0,
      };
  }
};

const changeSummary: Record<RecipeId, string[]> = {
  'dark-garment': ['Remove the solid edge background', 'Preserve distressed texture', 'Use soft DTG-ready edges', 'Preview on a dark garment'],
  'light-garment': ['Remove the solid edge background', 'Preserve dark artwork details', 'Use soft print edges', 'Preview on a light garment'],
  'clean-logo': ['Remove any solid edge background', 'Keep edges crisp', 'Disable texture effects', 'Suggest scalable SVG when suitable'],
  'vintage-distressed': ['Preserve the artwork texture', 'Add controlled grain', 'Soften print edges', 'Preview on a dark garment'],
  'mockups-only': ['Keep the source artwork unchanged', 'Skip print treatment', 'Open garment preview tools'],
  custom: ['Start with neutral settings', 'Choose each treatment manually'],
};

export const recommendRecipe = (analysis: ArtworkAnalysis): RecipeRecommendation => {
  if (analysis.hasTransparency && analysis.vectorSuitability === 'strong') {
    return {
      recipeId: 'clean-logo',
      confidence: 0.9,
      reasons: ['The artwork already has transparency.', 'Its limited palette is a strong fit for crisp logo treatment.'],
      alternatives: ['dark-garment', 'custom'],
      proposedChanges: changeSummary['clean-logo'],
    };
  }
  if (analysis.edgeBackground.isUniform && analysis.edgeBackground.tone === 'dark') {
    return {
      recipeId: 'dark-garment',
      confidence: Math.max(0.8, analysis.edgeBackground.confidence),
      reasons: ['A nearly solid dark background was detected around the artwork.', 'Dark details may disappear when previewed on dark garments.'],
      alternatives: ['vintage-distressed', 'custom'],
      proposedChanges: changeSummary['dark-garment'],
    };
  }
  if (analysis.edgeBackground.isUniform && analysis.edgeBackground.tone === 'light') {
    return {
      recipeId: 'light-garment',
      confidence: Math.max(0.8, analysis.edgeBackground.confidence),
      reasons: ['A nearly solid light background was detected around the artwork.', 'The artwork is suitable for a clean light-garment treatment.'],
      alternatives: ['clean-logo', 'custom'],
      proposedChanges: changeSummary['light-garment'],
    };
  }
  if (analysis.vectorSuitability === 'strong') {
    return {
      recipeId: 'clean-logo',
      confidence: 0.72,
      reasons: ['The artwork uses a small, distinct color palette.', 'Crisp treatment should preserve logo-like edges.'],
      alternatives: ['mockups-only', 'custom'],
      proposedChanges: changeSummary['clean-logo'],
    };
  }
  return {
    recipeId: 'custom',
    confidence: 0.55,
    reasons: ['The artwork does not have one obvious production treatment.', 'Starting neutral keeps the original intact.'],
    alternatives: ['mockups-only'],
    proposedChanges: changeSummary.custom,
  };
};

export const getRecipe = (recipeId: RecipeId) =>
  RECIPES.find((recipe) => recipe.id === recipeId) ?? RECIPES[RECIPES.length - 1];
