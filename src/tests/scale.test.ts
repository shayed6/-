import { describe, expect, it } from 'vitest';
import {
  FEET_PER_MILE,
  INCHES_PER_MILE,
  checkScaleAccuracy,
  computePantographScalePlan,
  computePaperPlotLayout,
  computePixelsPerFootFromMapScale,
  computePixelsPerInch,
  computeScaleFromBar,
  getPaperDimensions,
  inchesPerMileToRatio,
  inchesPerMileToRfDenominator,
  resolveMapScaleSpec,
  rfDenominatorToInchesPerMile,
} from '../core/survey/scale';

describe('Raster map scale math', () => {
  it('computes pixels-per-foot from bar distance in chain chips and linear units', () => {
    // 1 chain = 66 ft -> 660 px => 10 px/ft
    const c1 = computeScaleFromBar(660, 1, 'chain');
    expect(c1).not.toBeNull();
    expect(c1!.realDistanceFt).toBeCloseTo(66, 6);
    expect(c1!.pixelsPerFoot).toBeCloseTo(10, 6);
    expect(c1!.scaleFtPerPx).toBeCloseTo(0.1, 6);

    // 2 chain = 132 ft -> 660 px => 5 px/ft
    const c2 = computeScaleFromBar(660, 2, 'chain');
    expect(c2!.realDistanceFt).toBeCloseTo(132, 6);
    expect(c2!.pixelsPerFoot).toBeCloseTo(5, 6);

    // 5 chain = 330 ft; 10 chain = 660 ft
    expect(computeScaleFromBar(1650, 5, 'chain')!.pixelsPerFoot).toBeCloseTo(5, 6);
    expect(computeScaleFromBar(3300, 10, 'chain')!.pixelsPerFoot).toBeCloseTo(5, 6);

    // hat (1.5 ft), gaj (3 ft), m (3.28084 ft), ft
    expect(computeScaleFromBar(150, 10, 'hat')!.realDistanceFt).toBeCloseTo(15, 6);
    expect(computeScaleFromBar(150, 10, 'hat')!.pixelsPerFoot).toBeCloseTo(10, 6);
    expect(computeScaleFromBar(300, 10, 'gaj')!.realDistanceFt).toBeCloseTo(30, 6);
    expect(computeScaleFromBar(300, 10, 'gaj')!.pixelsPerFoot).toBeCloseTo(10, 6);

    const meters = computeScaleFromBar(100, 10, 'm');
    expect(meters!.realDistanceFt).toBeCloseTo(32.8084, 3);
    expect(meters!.pixelsPerFoot).toBeCloseTo(100 / 32.8084, 3);

    expect(computeScaleFromBar(200, 50, 'ft')!.pixelsPerFoot).toBeCloseTo(4, 6);
  });

  it('rejects zero or negative values in scale computations', () => {
    expect(computeScaleFromBar(0, 1, 'chain')).toBeNull();
    expect(computeScaleFromBar(100, 0, 'chain')).toBeNull();
    expect(computeScaleFromBar(-50, 2, 'ft')).toBeNull();
    expect(computePixelsPerInch(0, 16)).toBeNull();
    expect(computePixelsPerInch(1, 0)).toBeNull();
    expect(computePixelsPerFootFromMapScale(0, 16)).toBeNull();
    expect(computePixelsPerFootFromMapScale(300, -16)).toBeNull();
  });

  it('computes scanner pixels-per-inch and round-trips across 16, 32, and 64 inches/mile', () => {
    // Example: 16 inches = 1 mile (5280 ft -> 1 inch = 330 ft).
    // At 330 px/inch scanner resolution, pixelsPerFoot should equal 1 px/ft.
    const ppi16 = computePixelsPerInch(1, 16);
    expect(ppi16).toBeCloseTo(FEET_PER_MILE / 16, 6); // 330 px/inch

    // Now scan a 32 inches = 1 mile map on the same 330 px/inch scanner:
    // 1 inch = 165 ft -> pixelsPerFoot = 330 / 165 = 2 px/ft.
    const map32 = computePixelsPerFootFromMapScale(ppi16!, 32);
    expect(map32).not.toBeNull();
    expect(map32!.pixelsPerFoot).toBeCloseTo(2, 6);
    expect(map32!.scaleFtPerPx).toBeCloseTo(0.5, 6);

    // 64 inches = 1 mile on same scanner -> 4 px/ft
    const map64 = computePixelsPerFootFromMapScale(ppi16!, 64);
    expect(map64!.pixelsPerFoot).toBeCloseTo(4, 6);
  });

  it('checks scale accuracy with 3% tolerance threshold', () => {
    // Exact match
    const exact = checkScaleAccuracy(66, 66);
    expect(exact!.passed).toBe(true);
    expect(exact!.errorPercent).toBeCloseTo(0, 6);

    // Exactly 3% error -> passes
    const atLimit = checkScaleAccuracy(67.98, 66);
    expect(atLimit!.errorPercent).toBeCloseTo(3, 4);
    expect(atLimit!.passed).toBe(true);

    // > 3% error -> fails (red warning)
    const tooHigh = checkScaleAccuracy(68.5, 66);
    expect(tooHigh!.errorPercent).toBeGreaterThan(3);
    expect(tooHigh!.passed).toBe(false);

    const tooLow = checkScaleAccuracy(127, 132); // ~3.79% short
    expect(tooLow!.errorPercent).toBeGreaterThan(3);
    expect(tooLow!.passed).toBe(false);
    expect(tooLow!.errorFt).toBeCloseTo(-5, 6);
  });
});

describe('Pantograph scale conversion & paper layout math', () => {
  it('converts inches-per-mile to RF denominator & ratio using 1 mile = 63,360 inches', () => {
    expect(INCHES_PER_MILE).toBe(63360);

    // Standard Bangladesh mouza map scales
    expect(inchesPerMileToRfDenominator(16)).toBeCloseTo(3960, 8);
    expect(inchesPerMileToRfDenominator(32)).toBeCloseTo(1980, 8);
    expect(inchesPerMileToRfDenominator(64)).toBeCloseTo(990, 8);
    expect(inchesPerMileToRfDenominator(80)).toBeCloseTo(792, 8);

    expect(inchesPerMileToRatio(16)).toBeCloseTo(1 / 3960, 10);
    expect(inchesPerMileToRatio(32)).toBeCloseTo(1 / 1980, 10);

    // Round-trip RF denominator -> inches per mile
    expect(rfDenominatorToInchesPerMile(3960)).toBeCloseTo(16, 8);
    expect(rfDenominatorToInchesPerMile(1980)).toBeCloseTo(32, 8);
    expect(rfDenominatorToInchesPerMile(990)).toBeCloseTo(64, 8);
    expect(rfDenominatorToInchesPerMile(1000)).toBeCloseTo(63.36, 6);

    expect(inchesPerMileToRfDenominator(0)).toBeNull();
    expect(inchesPerMileToRatio(-5)).toBeNull();
    expect(rfDenominatorToInchesPerMile(0)).toBeNull();
  });

  it('resolves MapScaleSpec for both inchesPerMile and 1:N representative fractions', () => {
    const s16 = resolveMapScaleSpec({ kind: 'inchesPerMile', inchesPerMile: 16 });
    expect(s16).not.toBeNull();
    expect(s16!.rfDenominator).toBeCloseTo(3960, 6);
    expect(s16!.feetPerInchOnPaper).toBeCloseTo(330, 6);
    expect(s16!.ratioFraction).toBeCloseTo(1 / 3960, 10);

    const rf1000 = resolveMapScaleSpec({ kind: 'rf', denominator: 1000 });
    expect(rf1000).not.toBeNull();
    expect(rf1000!.inchesPerMile).toBeCloseTo(63.36, 6);
    expect(rf1000!.feetPerInchOnPaper).toBeCloseTo(1000 / 12, 6);
  });

  it('computes Pantograph scale plans (enlarge, reduce, same) between arbitrary scales', () => {
    // 16" = 1 mile -> 32" = 1 mile is 2x linear enlargement (4x paper area)
    const enlargePlan = computePantographScalePlan(
      { kind: 'inchesPerMile', inchesPerMile: 16 },
      { kind: 'inchesPerMile', inchesPerMile: 32 }
    );
    expect(enlargePlan).not.toBeNull();
    expect(enlargePlan!.paperScaleRatio).toBeCloseTo(2, 6);
    expect(enlargePlan!.paperAreaRatio).toBeCloseTo(4, 6);
    expect(enlargePlan!.mode).toBe('enlarge');

    // 32" = 1 mile -> 16" = 1 mile is 0.5x linear reduction (0.25x area)
    const reducePlan = computePantographScalePlan(
      { kind: 'inchesPerMile', inchesPerMile: 32 },
      { kind: 'inchesPerMile', inchesPerMile: 16 }
    );
    expect(reducePlan!.paperScaleRatio).toBeCloseTo(0.5, 6);
    expect(reducePlan!.paperAreaRatio).toBeCloseTo(0.25, 6);
    expect(reducePlan!.mode).toBe('reduce');

    // 16" = 1 mile (1:3960) -> 1:1000 RF
    const mixedPlan = computePantographScalePlan(
      { kind: 'inchesPerMile', inchesPerMile: 16 },
      { kind: 'rf', denominator: 1000 }
    );
    expect(mixedPlan!.paperScaleRatio).toBeCloseTo(3.96, 6);
    expect(mixedPlan!.mode).toBe('enlarge');

    // Equal scale expressed in different notations (16"/mi == 1:3960)
    const samePlan = computePantographScalePlan(
      { kind: 'inchesPerMile', inchesPerMile: 16 },
      { kind: 'rf', denominator: 3960 }
    );
    expect(samePlan!.paperScaleRatio).toBeCloseTo(1, 6);
    expect(samePlan!.mode).toBe('same');
  });

  it('computes paper dimensions and geometrically consistent plot layouts & scale bars', () => {
    const a4 = getPaperDimensions('a4', 'portrait');
    expect(a4.widthMm).toBe(210);
    expect(a4.heightMm).toBe(297);
    expect(a4.widthPt).toBeCloseTo((210 / 25.4) * 72, 4);

    const a3Land = getPaperDimensions('a3', 'landscape');
    expect(a3Land.widthMm).toBe(420);
    expect(a3Land.heightMm).toBe(297);

    const target32 = resolveMapScaleSpec({ kind: 'inchesPerMile', inchesPerMile: 32 })!;
    // 660 ft x 440 ft region at 32"/mi (165 ft/inch) -> needs 4.0" x 2.67" -> fits A4 landscape!
    const smallFit = computePaperPlotLayout(660, 440, target32, 'a4', 'auto', 'true-scale');
    expect(smallFit.paper.orientation).toBe('landscape');
    expect(smallFit.fitsAtTrueScale).toBe(true);
    expect(smallFit.effectiveFitMode).toBe('true-scale');
    expect(smallFit.plottedFeetPerInch).toBeCloseTo(165, 6);
    expect(smallFit.scaleBarLengthIn * smallFit.plottedFeetPerInch).toBeCloseTo(
      smallFit.scaleBarFt,
      6
    );

    // 3000 ft x 2000 ft at 32"/mi -> needs 18.18" x 12.12" -> exceeds A4 printable area
    const largeTrue = computePaperPlotLayout(3000, 2000, target32, 'a4', 'auto', 'true-scale');
    expect(largeTrue.fitsAtTrueScale).toBe(false);
    expect(largeTrue.effectiveFitMode).toBe('true-scale');
    expect(largeTrue.plottedFeetPerInch).toBeCloseTo(165, 6);

    // When fit-to-paper is chosen, plottedFeetPerInch increases so scale bar matches printed width
    const largeFit = computePaperPlotLayout(3000, 2000, target32, 'a4', 'auto', 'fit-to-paper');
    expect(largeFit.fitsAtTrueScale).toBe(false);
    expect(largeFit.effectiveFitMode).toBe('fit-to-paper');
    expect(largeFit.plottedFeetPerInch).toBeGreaterThan(165);
    expect(largeFit.scaleBarLengthIn * largeFit.plottedFeetPerInch).toBeCloseTo(
      largeFit.scaleBarFt,
      6
    );
  });
});

