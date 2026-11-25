import { LinearUnit, toFeet } from './units';

export const FEET_PER_MILE = 5280;
export const DEFAULT_SCALE_CHECK_TOLERANCE_PERCENT = 3;

export interface BarCalibrationResult {
  pixelDistance: number;
  realDistanceFt: number;
  pixelsPerFoot: number;
  scaleFtPerPx: number;
}

export interface ScaleCheckResult {
  measuredFt: number;
  expectedFt: number;
  errorFt: number;
  absErrorFt: number;
  errorPercent: number;
  passed: boolean;
}

/**
 * Computes pixels-per-foot and feet-per-pixel from a measured pixel span
 * and a known ground distance in any supported linear unit.
 */
export function computeScaleFromBar(
  pixelDistance: number,
  knownValue: number,
  unit: LinearUnit
): BarCalibrationResult | null {
  if (!Number.isFinite(pixelDistance) || pixelDistance <= 1e-9) return null;
  if (!Number.isFinite(knownValue) || knownValue <= 0) return null;
  const realDistanceFt = toFeet(knownValue, unit);
  if (!Number.isFinite(realDistanceFt) || realDistanceFt <= 1e-9) return null;

  const pixelsPerFoot = pixelDistance / realDistanceFt;
  const scaleFtPerPx = realDistanceFt / pixelDistance;
  return {
    pixelDistance,
    realDistanceFt,
    pixelsPerFoot,
    scaleFtPerPx,
  };
}

/**
 * Given a calibrated map's pixelsPerFoot and its nominal scale ("1 mile = N inches"),
 * computes the scanner resolution in pixels-per-inch on paper.
 *
 * Derivation:
 *   N inches on paper = 5280 feet on ground
 *   1 inch on paper = (5280 / N) feet on ground
 *   pixelsPerInch = pixelsPerFoot * (5280 / N)
 */
export function computePixelsPerInch(
  pixelsPerFoot: number,
  inchesPerMile: number
): number | null {
  if (!Number.isFinite(pixelsPerFoot) || pixelsPerFoot <= 0) return null;
  if (!Number.isFinite(inchesPerMile) || inchesPerMile <= 0) return null;
  return pixelsPerFoot * (FEET_PER_MILE / inchesPerMile);
}

/**
 * Given a stored scanner pixelsPerInch and a map's nominal scale ("1 mile = N inches"),
 * computes pixelsPerFoot and scaleFtPerPx for that map.
 */
export function computePixelsPerFootFromMapScale(
  pixelsPerInch: number,
  inchesPerMile: number
): { pixelsPerFoot: number; scaleFtPerPx: number } | null {
  if (!Number.isFinite(pixelsPerInch) || pixelsPerInch <= 0) return null;
  if (!Number.isFinite(inchesPerMile) || inchesPerMile <= 0) return null;
  const feetPerInch = FEET_PER_MILE / inchesPerMile;
  const pixelsPerFoot = pixelsPerInch / feetPerInch;
  return {
    pixelsPerFoot,
    scaleFtPerPx: 1 / pixelsPerFoot,
  };
}

/**
 * Evaluates a scale check measurement against an expected real distance.
 * Error > 3% fails (red warning); <= 3% passes (green confirmation).
 */
export function checkScaleAccuracy(
  measuredFt: number,
  expectedFt: number,
  tolerancePercent = DEFAULT_SCALE_CHECK_TOLERANCE_PERCENT
): ScaleCheckResult | null {
  if (!Number.isFinite(measuredFt) || measuredFt < 0) return null;
  if (!Number.isFinite(expectedFt) || expectedFt <= 1e-9) return null;
  const errorFt = measuredFt - expectedFt;
  const absErrorFt = Math.abs(errorFt);
  const errorPercent = (absErrorFt / expectedFt) * 100;
  return {
    measuredFt,
    expectedFt,
    errorFt,
    absErrorFt,
    errorPercent,
    passed: errorPercent <= tolerancePercent + 1e-9,
  };
}

export const INCHES_PER_FOOT = 12;
export const INCHES_PER_MILE = FEET_PER_MILE * INCHES_PER_FOOT; // 63,360 inches
export const MM_PER_INCH = 25.4;

export type MapScaleSpec =
  | { kind: 'inchesPerMile'; inchesPerMile: number }
  | { kind: 'rf'; denominator: number };

export interface ScaleRatioConversion {
  inchesPerMile: number;
  rfDenominator: number;
  /** Dimensionless representative fraction = inchesPerMile / 63360 = 1 / rfDenominator */
  ratioFraction: number;
  feetPerInchOnPaper: number;
  label: string;
}

export interface PantographScalePlan {
  source: ScaleRatioConversion;
  target: ScaleRatioConversion;
  /** Linear paper multiplier = target.inchesPerMile / source.inchesPerMile */
  paperScaleRatio: number;
  /** Area multiplier on paper = paperScaleRatio^2 */
  paperAreaRatio: number;
  mode: 'enlarge' | 'reduce' | 'same';
}

export type PaperSizeId = 'a4' | 'a3' | 'letter' | 'legal';
export type PaperOrientation = 'portrait' | 'landscape';

export interface PaperDimensions {
  id: PaperSizeId;
  label: string;
  orientation: PaperOrientation;
  widthMm: number;
  heightMm: number;
  widthIn: number;
  heightIn: number;
  widthPt: number;
  heightPt: number;
}

export interface PantographPlotLayout {
  paper: PaperDimensions;
  marginsIn: { top: number; right: number; bottom: number; left: number };
  printableWidthIn: number;
  printableHeightIn: number;
  requiredWidthIn: number;
  requiredHeightIn: number;
  fitsAtTrueScale: boolean;
  effectiveFitMode: 'true-scale' | 'fit-to-paper';
  plottedFeetPerInch: number;
  plottedInchesPerMile: number;
  plottedRfDenominator: number;
  scaleBarFt: number;
  scaleBarLengthIn: number;
}

/**
 * Converts "N inches = 1 mile" into representative fraction denominator M (as in 1:M).
 * Since 1 mile = 63,360 inches, M = 63360 / N (e.g. 16"/mile -> 3960, 32"/mile -> 1980).
 */
export function inchesPerMileToRfDenominator(inchesPerMile: number): number | null {
  if (!Number.isFinite(inchesPerMile) || inchesPerMile <= 0) return null;
  return INCHES_PER_MILE / inchesPerMile;
}

/**
 * Converts "N inches = 1 mile" into a dimensionless ratio (N / 63360 = 1 / M).
 */
export function inchesPerMileToRatio(inchesPerMile: number): number | null {
  if (!Number.isFinite(inchesPerMile) || inchesPerMile <= 0) return null;
  return inchesPerMile / INCHES_PER_MILE;
}

/**
 * Converts a representative fraction 1:M into equivalent inches per mile (63360 / M).
 */
export function rfDenominatorToInchesPerMile(denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return INCHES_PER_MILE / denominator;
}

/**
 * Resolves any MapScaleSpec ("1 mile = N inches" or "1:N") into complete scale metrics.
 */
export function resolveMapScaleSpec(spec: MapScaleSpec): ScaleRatioConversion | null {
  if (spec.kind === 'inchesPerMile') {
    const ipm = spec.inchesPerMile;
    if (!Number.isFinite(ipm) || ipm <= 0) return null;
    const rfDenominator = INCHES_PER_MILE / ipm;
    const feetPerInchOnPaper = FEET_PER_MILE / ipm;
    const rfRounded = Math.round(rfDenominator * 100) / 100;
    const ipmRounded = Math.round(ipm * 100) / 100;
    return {
      inchesPerMile: ipm,
      rfDenominator,
      ratioFraction: ipm / INCHES_PER_MILE,
      feetPerInchOnPaper,
      label: `${ipmRounded}″ = 1 mile (1:${rfRounded})`,
    };
  }

  const denom = spec.denominator;
  if (!Number.isFinite(denom) || denom <= 0) return null;
  const ipm = INCHES_PER_MILE / denom;
  const feetPerInchOnPaper = denom / INCHES_PER_FOOT;
  const rfRounded = Math.round(denom * 100) / 100;
  const ipmRounded = Math.round(ipm * 100) / 100;
  return {
    inchesPerMile: ipm,
    rfDenominator: denom,
    ratioFraction: 1 / denom,
    feetPerInchOnPaper,
    label: `1:${rfRounded} (${ipmRounded}″ = 1 mile)`,
  };
}

/**
 * Computes the paper scaling ratio when re-plotting from sourceScale to targetScale.
 * Example: 16"/mile (1:3960) -> 32"/mile (1:1980) gives paperScaleRatio = 2.0 (2x enlargement).
 */
export function computePantographScalePlan(
  sourceSpec: MapScaleSpec,
  targetSpec: MapScaleSpec
): PantographScalePlan | null {
  const source = resolveMapScaleSpec(sourceSpec);
  const target = resolveMapScaleSpec(targetSpec);
  if (!source || !target) return null;

  const paperScaleRatio = target.inchesPerMile / source.inchesPerMile;
  const paperAreaRatio = paperScaleRatio * paperScaleRatio;
  const mode =
    Math.abs(paperScaleRatio - 1) < 1e-6
      ? 'same'
      : paperScaleRatio > 1
      ? 'enlarge'
      : 'reduce';

  return {
    source,
    target,
    paperScaleRatio,
    paperAreaRatio,
    mode,
  };
}

const PAPER_PORTRAIT_MM: Record<PaperSizeId, { label: string; w: number; h: number }> = {
  a4: { label: 'A4', w: 210, h: 297 },
  a3: { label: 'A3', w: 297, h: 420 },
  letter: { label: 'Letter', w: 215.9, h: 279.4 },
  legal: { label: 'Legal', w: 215.9, h: 355.6 },
};

export function getPaperDimensions(
  size: PaperSizeId,
  orientation: PaperOrientation = 'portrait'
): PaperDimensions {
  const base = PAPER_PORTRAIT_MM[size];
  const widthMm = orientation === 'portrait' ? base.w : base.h;
  const heightMm = orientation === 'portrait' ? base.h : base.w;
  const widthIn = widthMm / MM_PER_INCH;
  const heightIn = heightMm / MM_PER_INCH;
  return {
    id: size,
    label: base.label,
    orientation,
    widthMm,
    heightMm,
    widthIn,
    heightIn,
    widthPt: widthIn * 72,
    heightPt: heightIn * 72,
  };
}

const NICE_SCALE_BAR_FT = [
  16.5,
  33,
  66,
  132,
  198,
  264,
  330,
  660,
  1320,
  1980,
  2640,
  3960,
  5280,
  10560,
];

function chooseNiceScaleBarFt(
  plottedFeetPerInch: number,
  printableWidthIn: number
): { scaleBarFt: number; scaleBarLengthIn: number } {
  const minIn = Math.min(0.9, printableWidthIn * 0.16);
  const maxIn = Math.min(3.6, printableWidthIn * 0.5);
  const targetIn = (minIn + maxIn) / 2;

  let bestFt = 66;
  let bestDiff = Infinity;
  for (const candidateFt of NICE_SCALE_BAR_FT) {
    const lenIn = candidateFt / plottedFeetPerInch;
    if (lenIn >= minIn && lenIn <= maxIn) {
      const diff = Math.abs(lenIn - targetIn);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestFt = candidateFt;
      }
    }
  }
  if (bestDiff === Infinity) {
    const roughFt = plottedFeetPerInch * targetIn;
    bestFt = Math.max(10, Math.round(roughFt / 10) * 10);
  }
  return {
    scaleBarFt: bestFt,
    scaleBarLengthIn: bestFt / plottedFeetPerInch,
  };
}

/**
 * Computes exact physical layout on a chosen paper size for a ground region (in feet)
 * at the desired target scale. Always returns a geometrically exact scaleBarFt + scaleBarLengthIn.
 */
export function computePaperPlotLayout(
  regionWidthFt: number,
  regionHeightFt: number,
  targetScale: ScaleRatioConversion,
  paperSize: PaperSizeId,
  orientation: PaperOrientation | 'auto' = 'auto',
  fitMode: 'true-scale' | 'fit-to-paper' = 'true-scale'
): PantographPlotLayout {
  const safeW = Math.max(1e-3, regionWidthFt);
  const safeH = Math.max(1e-3, regionHeightFt);
  const resolvedOrientation: PaperOrientation =
    orientation === 'auto'
      ? safeW > safeH * 1.08
        ? 'landscape'
        : 'portrait'
      : orientation;

  const paper = getPaperDimensions(paperSize, resolvedOrientation);
  const marginsIn = { top: 0.55, right: 0.45, bottom: 1.35, left: 0.45 };
  const printableWidthIn = Math.max(2, paper.widthIn - marginsIn.left - marginsIn.right);
  const printableHeightIn = Math.max(2, paper.heightIn - marginsIn.top - marginsIn.bottom);

  const requiredWidthIn = safeW / targetScale.feetPerInchOnPaper;
  const requiredHeightIn = safeH / targetScale.feetPerInchOnPaper;
  const fitsAtTrueScale =
    requiredWidthIn <= printableWidthIn + 1e-6 &&
    requiredHeightIn <= printableHeightIn + 1e-6;

  const effectiveFitMode: 'true-scale' | 'fit-to-paper' =
    fitsAtTrueScale ? 'true-scale' : fitMode;

  const plottedFeetPerInch =
    effectiveFitMode === 'fit-to-paper'
      ? Math.max(safeW / printableWidthIn, safeH / printableHeightIn)
      : targetScale.feetPerInchOnPaper;

  const plottedRfDenominator = plottedFeetPerInch * INCHES_PER_FOOT;
  const plottedInchesPerMile = INCHES_PER_MILE / plottedRfDenominator;

  const { scaleBarFt, scaleBarLengthIn } = chooseNiceScaleBarFt(
    plottedFeetPerInch,
    printableWidthIn
  );

  return {
    paper,
    marginsIn,
    printableWidthIn,
    printableHeightIn,
    requiredWidthIn,
    requiredHeightIn,
    fitsAtTrueScale,
    effectiveFitMode,
    plottedFeetPerInch,
    plottedInchesPerMile,
    plottedRfDenominator,
    scaleBarFt,
    scaleBarLengthIn,
  };
}

