import { ResizeMode } from '../types';

export interface DesignEditSettings {
  designScalePercent?: number;
  designOffsetXPercent?: number;
  designOffsetYPercent?: number;
  designRotationDegrees?: number;
}

export interface DesignPlacementInput {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  resizeMode: ResizeMode;
  allowUpscaling: boolean;
  edit: DesignEditSettings;
}

export interface DesignPlacement {
  drawWidth: number;
  drawHeight: number;
  centerX: number;
  centerY: number;
  rotationRadians: number;
  scale: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const finiteOr = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Number(value) : fallback;

const round = (value: number) => Number(value.toFixed(6));

export const normalizeDesignEditSettings = (edit: DesignEditSettings): Required<DesignEditSettings> => ({
  designScalePercent: clamp(finiteOr(edit.designScalePercent, 100), 10, 300),
  designOffsetXPercent: clamp(finiteOr(edit.designOffsetXPercent, 0), -50, 50),
  designOffsetYPercent: clamp(finiteOr(edit.designOffsetYPercent, 0), -50, 50),
  designRotationDegrees: clamp(finiteOr(edit.designRotationDegrees, 0), -180, 180),
});

export const calculateDesignPlacement = ({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  resizeMode,
  allowUpscaling,
  edit,
}: DesignPlacementInput): DesignPlacement => {
  const normalized = normalizeDesignEditSettings(edit);
  const source = {
    width: Math.max(1, sourceWidth),
    height: Math.max(1, sourceHeight),
  };
  const target = {
    width: Math.max(1, targetWidth),
    height: Math.max(1, targetHeight),
  };
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  let baseScale = resizeMode === ResizeMode.COVER
    ? Math.max(scaleX, scaleY)
    : resizeMode === ResizeMode.STRETCH
      ? 1
      : Math.min(scaleX, scaleY);

  if (resizeMode !== ResizeMode.STRETCH && !allowUpscaling && baseScale > 1) {
    baseScale = 1;
  }

  const userScale = normalized.designScalePercent / 100;
  const scale = resizeMode === ResizeMode.STRETCH ? userScale : baseScale * userScale;
  const drawWidth = resizeMode === ResizeMode.STRETCH
    ? target.width * userScale
    : source.width * scale;
  const drawHeight = resizeMode === ResizeMode.STRETCH
    ? target.height * userScale
    : source.height * scale;

  return {
    drawWidth: Math.round(drawWidth),
    drawHeight: Math.round(drawHeight),
    centerX: Math.round((target.width / 2) + ((normalized.designOffsetXPercent / 100) * target.width)),
    centerY: Math.round((target.height / 2) + ((normalized.designOffsetYPercent / 100) * target.height)),
    rotationRadians: round((normalized.designRotationDegrees * Math.PI) / 180),
    scale: round(scale),
  };
};
