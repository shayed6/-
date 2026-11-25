import { describe, expect, it } from 'vitest';
import {
  ANA_PER_WHOLE,
  GANDA_PER_WHOLE,
  KORA_PER_WHOLE,
  KRANTI_PER_WHOLE,
  TIL_PER_WHOLE,
  anaGandaToFraction,
  calcQuadFromSidesAndAngle,
  calcQuadFromSidesAndDiagonal,
  calcRectangleFromSides,
  calcTrapeziumArea,
  calcTriangleFromSides,
  computeHissaDistribution,
  computeMyShareInDag,
  computeRatioSplit,
  computeTofsilDistribution,
  convertAllAreaUnits,
  convertAllLengthUnits,
  convertTraditionalShareUnit,
  exportTofsilCsv,
  fractionToAnaGanda,
  parseShareExpression,
} from '../core/survey/calculator';
import { DEFAULT_UNIT_PROFILE, UnitProfile } from '../core/survey/units';

describe('Offline Land & Share Calculator Core', () => {
  it('computes area from sides for triangle, rectangle, quad+diagonal, quad+angle, and trapezium', () => {
    // 30-40-50 right triangle -> 600 sq ft
    const tri = calcTriangleFromSides(30, 40, 50, 'ft', DEFAULT_UNIT_PROFILE);
    expect(tri.valid).toBe(true);
    expect(tri.areaSqFt).toBeCloseTo(600, 6);
    expect(tri.perimeterFt).toBeCloseTo(120, 6);

    // Invalid triangle inequality
    const badTri = calcTriangleFromSides(10, 15, 30, 'ft', DEFAULT_UNIT_PROFILE);
    expect(badTri.valid).toBe(false);

    // 100 x 50 rectangle -> 5000 sq ft = 11.47842... shotok
    const rect = calcRectangleFromSides(100, 50, 'ft', DEFAULT_UNIT_PROFILE);
    expect(rect.valid).toBe(true);
    expect(rect.areaSqFt).toBeCloseTo(5000, 6);
    expect(rect.breakdown.shotok).toBeCloseTo(5000 / 435.6, 5);

    // 4 sides + diagonal matching 100x50 rectangle
    const diag = Math.hypot(100, 50);
    const quadD = calcQuadFromSidesAndDiagonal(
      100,
      50,
      100,
      50,
      diag,
      'ft',
      DEFAULT_UNIT_PROFILE
    );
    expect(quadD.valid).toBe(true);
    expect(quadD.areaSqFt).toBeCloseTo(5000, 4);

    // 4 sides + 90-deg corner angle matching 100x50 rectangle
    const quadA = calcQuadFromSidesAndAngle(
      100,
      50,
      100,
      50,
      90,
      'ft',
      DEFAULT_UNIT_PROFILE
    );
    expect(quadA.valid).toBe(true);
    expect(quadA.areaSqFt).toBeCloseTo(5000, 4);

    // Trapezium: ((90 + 60) / 2) * 40 = 3000 sq ft
    const trap = calcTrapeziumArea(90, 60, 40, 'ft', DEFAULT_UNIT_PROFILE);
    expect(trap.valid).toBe(true);
    expect(trap.areaSqFt).toBeCloseTo(3000, 6);
  });

  it('converts area, length, and traditional share units honoring Settings unitProfile', () => {
    // 1 bigha = 33 shotok = 14374.8 sq ft (default profile)
    const fromBigha = convertAllAreaUnits(1, 'bigha', DEFAULT_UNIT_PROFILE);
    expect(fromBigha.shotok).toBeCloseTo(33, 6);
    expect(fromBigha.decimal).toBeCloseTo(33, 6);
    expect(fromBigha.sqFt).toBeCloseTo(14374.8, 3);
    expect(fromBigha.katha).toBeCloseTo(14374.8 / 720, 4);

    // Custom profile (e.g. 20 katha = 14400 sq ft -> bighaShotok = 14400 / 435.6)
    const customProfile: UnitProfile = {
      id: 'custom',
      nameBn: 'কাস্টম',
      nameEn: 'Custom',
      kathaSqFt: 720,
      bighaShotok: 14400 / 435.6,
    };
    const customBigha = convertAllAreaUnits(1, 'bigha', customProfile);
    expect(customBigha.sqFt).toBeCloseTo(14400, 3);
    expect(customBigha.katha).toBeCloseTo(20, 5);

    // Length units: 1 chain = 66 ft = 100 link = 44 hat = 22 gaj = 792 inch
    const len = convertAllLengthUnits(1, 'chain');
    expect(len.ft).toBeCloseTo(66, 6);
    expect(len.link).toBeCloseTo(100, 6);
    expect(len.hat).toBeCloseTo(44, 6);
    expect(len.gaj).toBeCloseTo(22, 6);
    expect(len.inch).toBeCloseTo(792, 5);

    // Traditional share conversion: 4 ana = 25% -> 8.25 shotok out of 33 shotok
    const shareRes = convertTraditionalShareUnit(4, 'ana', 33 * 435.6, DEFAULT_UNIT_PROFILE);
    expect(shareRes.fraction).toBeCloseTo(0.25, 6);
    expect(shareRes.percent).toBeCloseTo(25, 6);
    expect(shareRes.ganda).toBeCloseTo(80, 6);
    expect(shareRes.areaBreakdown?.shotok).toBeCloseTo(8.25, 5);
  });

  it('converts Ana-Ganda-Kora-Kranti-Til bidirectionally with exact arithmetic', () => {
    expect(ANA_PER_WHOLE).toBe(16);
    expect(GANDA_PER_WHOLE).toBe(320);
    expect(KORA_PER_WHOLE).toBe(1280);
    expect(KRANTI_PER_WHOLE).toBe(3840);
    expect(TIL_PER_WHOLE).toBe(76800);

    // Whole = 16 ana = 1.0
    const whole = anaGandaToFraction({ ana: 16 });
    expect(whole.valid).toBe(true);
    expect(whole.fraction).toBeCloseTo(1, 10);
    expect(whole.totalTil).toBe(76800);

    // Round-trip: 4 ana 10 ganda 2 kora 1 kranti 10 til
    const sample = { ana: 4, ganda: 10, kora: 2, kranti: 1, til: 10 };
    const toFrac = anaGandaToFraction(sample);
    expect(toFrac.valid).toBe(true);
    const back = fractionToAnaGanda(toFrac.fraction);
    expect(back.parts).toEqual(sample);

    // 1/4 = 4 ana
    const quarter = fractionToAnaGanda(0.25);
    expect(quarter.parts).toEqual({ ana: 4, ganda: 0, kora: 0, kranti: 0, til: 0 });

    // Bengali numeral share expressions
    expect(parseShareExpression('১/৪')).toBeCloseTo(0.25, 8);
    expect(parseShareExpression('২৫%')).toBeCloseTo(0.25, 8);
    expect(parseShareExpression('০.১২৫')).toBeCloseTo(0.125, 8);
  });

  it('computes ratio split and "my share in the dag"', () => {
    // 30 shotok split 3:2:1 -> 15, 10, 5 shotok
    const totalSqFt = 30 * 435.6;
    const split = computeRatioSplit(
      totalSqFt,
      [
        { label: 'করিম', ratio: 3 },
        { label: 'রহিম', ratio: 2 },
        { label: 'সালমা', ratio: 1 },
      ],
      DEFAULT_UNIT_PROFILE
    );
    expect(split.valid).toBe(true);
    expect(split.totalRatio).toBe(6);
    expect(split.items[0].breakdown.shotok).toBeCloseTo(15, 5);
    expect(split.items[1].breakdown.shotok).toBeCloseTo(10, 5);
    expect(split.items[2].breakdown.shotok).toBeCloseTo(5, 5);

    // My share: 1/4 of 40 shotok -> 10 shotok mine, 30 shotok remaining
    const myShare = computeMyShareInDag(40 * 435.6, 0.25, DEFAULT_UNIT_PROFILE);
    expect(myShare.valid).toBe(true);
    expect(myShare.myBreakdown.shotok).toBeCloseTo(10, 5);
    expect(myShare.remainingBreakdown.shotok).toBeCloseTo(30, 5);
    expect(myShare.anaGanda.ana).toBe(4);
  });

  it('validates hissa sums (exact, under, over) and exports Tofsil CSV table', () => {
    const dagSqFt = 32 * 435.6;

    // Exact match: 8 ana + 1/4 + 25% = 1.0 (16 ana)
    const exactHissa = computeHissaDistribution(
      dagSqFt,
      [
        { label: 'A', mode: 'ana-ganda', anaGanda: { ana: 8 } },
        { label: 'B', mode: 'fraction', fractionText: '1/4' },
        { label: 'C', mode: 'percent', percentText: '25' },
      ],
      DEFAULT_UNIT_PROFILE
    );
    expect(exactHissa.valid).toBe(true);
    expect(exactHissa.status).toBe('exact');
    expect(exactHissa.sumBreakdown.shotok).toBeCloseTo(32, 5);

    // Under match: 8 ana + 4 ana = 12 ana -> remaining 8 shotok
    const underHissa = computeHissaDistribution(
      dagSqFt,
      [
        { label: 'A', mode: 'ana-ganda', anaGanda: { ana: 8 } },
        { label: 'B', mode: 'ana-ganda', anaGanda: { ana: 4 } },
      ],
      DEFAULT_UNIT_PROFILE
    );
    expect(underHissa.status).toBe('under');
    expect(underHissa.remainingBreakdown.shotok).toBeCloseTo(8, 5);

    // Over match: 10 ana + 8 ana = 18 ana
    const overHissa = computeHissaDistribution(
      dagSqFt,
      [
        { label: 'A', mode: 'ana-ganda', anaGanda: { ana: 10 } },
        { label: 'B', mode: 'ana-ganda', anaGanda: { ana: 8 } },
      ],
      DEFAULT_UNIT_PROFILE
    );
    expect(overHissa.status).toBe('over');

    // Tofsil distribution + CSV table export
    const tofsil = computeTofsilDistribution(
      48 * 435.6,
      '৫১২',
      '১১৮',
      [
        { name: 'আব্দুল করিম', mode: 'fraction', valueText: '1/2' },
        { name: 'জয়নব বেগম', mode: 'ana-ganda', anaGanda: { ana: 4 } },
        { name: 'মোঃ সাইফুল', mode: 'percent', valueText: '25' },
      ],
      'bn',
      DEFAULT_UNIT_PROFILE
    );
    expect(tofsil.valid).toBe(true);
    expect(tofsil.status).toBe('exact');
    expect(tofsil.rows).toHaveLength(3);
    expect(tofsil.rows[0].shotok).toBeCloseTo(24, 5);
    expect(tofsil.rows[1].shotok).toBeCloseTo(12, 5);
    expect(tofsil.rows[2].shotok).toBeCloseTo(12, 5);

    const csv = exportTofsilCsv(tofsil, 'bn', DEFAULT_UNIT_PROFILE);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('৫১২');
    expect(csv).toContain('আব্দুল করিম');
    expect(csv).toContain('24.0000');
  });
});
