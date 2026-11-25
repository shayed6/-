import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UNIT_PROFILE,
  convertArea,
  convertLinear,
  formatNumber,
  fromBengaliDigits,
  fromSqFt,
  parseLocalizedNumber,
  toBengaliDigits,
  toFeet,
  toSqFt,
} from '../core/survey/units';
import {
  buildQuadFromSidesAndDiagonal,
  computeAreaBreakdown,
  heronAreaSqFt,
  measurePolygonFromGeometry,
  measurePolylineFromGeometry,
  polygonAreaSqFt,
  polygonCentroid,
  polygonPerimeterFt,
} from '../core/survey/area';
import {
  angleBetweenPointsDegrees,
  azimuthDegrees,
  coordinateDelta,
  formatDMS,
  interiorAngleDegrees,
  measureThreePointAngle,
  polygonCornerAnglesDegrees,
  segmentAngleDegrees,
  wcbToReducedBearing,
} from '../core/survey/bearing';
import { solveTraverse } from '../core/survey/traverse';

describe('Survey Units & Bengali Numerals', () => {
  it('converts shotok, katha, bigha, acre, sq ft, and sq m accurately', () => {
    expect(toSqFt(1, 'shotok')).toBeCloseTo(435.6, 6);
    expect(toSqFt(1, 'katha', DEFAULT_UNIT_PROFILE)).toBeCloseTo(720, 6);
    expect(toSqFt(1, 'bigha', DEFAULT_UNIT_PROFILE)).toBeCloseTo(33 * 435.6, 6);
    expect(toSqFt(1, 'acre')).toBeCloseTo(43560, 6);
    expect(fromSqFt(43560, 'shotok')).toBeCloseTo(100, 6);
    expect(convertArea(100, 'shotok', 'acre')).toBeCloseTo(1, 6);
    expect(convertArea(1, 'bigha', 'shotok', DEFAULT_UNIT_PROFILE)).toBeCloseTo(33, 6);
    expect(convertArea(1, 'sqft', 'sqm')).toBeCloseTo(0.09290304, 6);
  });

  it('supports custom katha and bigha unit profiles', () => {
    const custom = {
      id: 'custom',
      nameBn: 'কাস্টম',
      nameEn: 'Custom',
      kathaSqFt: 1440,
      bighaShotok: 20,
    };
    expect(fromSqFt(1440, 'katha', custom)).toBeCloseTo(1, 6);
    expect(fromSqFt(20 * 435.6, 'bigha', custom)).toBeCloseTo(1, 6);
  });

  it('converts chain, hat, gaj, meter, and feet', () => {
    expect(toFeet(1, 'chain')).toBeCloseTo(66, 6);
    expect(toFeet(1, 'hat')).toBeCloseTo(1.5, 6);
    expect(toFeet(1, 'gaj')).toBeCloseTo(3, 6);
    expect(convertLinear(2, 'gaj', 'hat')).toBeCloseTo(4, 6);
    expect(convertLinear(1, 'chain', 'gaj')).toBeCloseTo(22, 6);
  });

  it('converts Bengali and English digits cleanly', () => {
    expect(toBengaliDigits('123.45')).toBe('১২৩.৪৫');
    expect(fromBengaliDigits('৪৩৫.৬০')).toBe('435.60');
    expect(parseLocalizedNumber('১২৫.৫')).toBeCloseTo(125.5, 6);
    expect(formatNumber(43.56, 2, 'bn')).toBe('৪৩.৫৬');
  });
});

describe('Survey Area & Triangulation', () => {
  it('measures a 100 ft x 50 ft rectangle as 5000 sq ft = 11.478 shotok with full breakdown & perimeter', () => {
    const rect100x50 = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    expect(polygonAreaSqFt(rect100x50)).toBeCloseTo(5000, 6);
    const measured = measurePolygonFromGeometry(rect100x50, DEFAULT_UNIT_PROFILE);
    expect(measured.areaSqFt).toBeCloseTo(5000, 6);
    expect(measured.breakdown.shotok).toBeCloseTo(11.47842, 3);
    expect(Number(measured.breakdown.shotok.toFixed(3))).toBe(11.478);
    expect(measured.breakdown.katha).toBeCloseTo(5000 / 720, 6);
    expect(measured.breakdown.bigha).toBeCloseTo(5000 / (33 * 435.6), 6);
    expect(measured.breakdown.acre).toBeCloseTo(5000 / 43560, 6);
    expect(measured.breakdown.sqM).toBeCloseTo(5000 * 0.09290304, 6);
    expect(measured.perimeterFt).toBeCloseTo(300, 6);
    expect(measured.segmentLengthsFt).toEqual([100, 50, 100, 50]);
  });

  it('measures a 30-40-50 right triangle accurately (600 sq ft, 120 ft perimeter, 90° angle)', () => {
    expect(heronAreaSqFt(30, 40, 50)).toBeCloseTo(600, 6);
    expect(heronAreaSqFt(10, 20, 50)).toBeNull();

    const tri304050 = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 0, y: 30 },
    ];
    const measured = measurePolygonFromGeometry(tri304050, DEFAULT_UNIT_PROFILE);
    expect(measured.areaSqFt).toBeCloseTo(600, 6);
    expect(measured.perimeterFt).toBeCloseTo(120, 6);
    expect(measured.breakdown.shotok).toBeCloseTo(600 / 435.6, 6);
    expect(interiorAngleDegrees(tri304050[1], tri304050[0], tri304050[2])).toBeCloseTo(90, 6);
  });

  it('computes irregular polygon area accurately via the shoelace formula', () => {
    // Concave irregular pentagon (L-shaped + slanted roof):
    // Decompose:
    //   Base 60x30 = 1800 sq ft
    //   Left wing x in [0,20], y in [30,60] = 600 sq ft
    //   Slanted top triangle (0,60)-(20,60)-(20,80) = 0.5*20*20 = 200 sq ft
    // Total exact area = 2600 sq ft
    const irregular = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 30 },
      { x: 20, y: 30 },
      { x: 20, y: 80 },
      { x: 0, y: 60 },
    ];
    expect(polygonAreaSqFt(irregular)).toBeCloseTo(2600, 6);
    expect(polygonAreaSqFt([...irregular].reverse())).toBeCloseTo(2600, 6);

    const measured = measurePolygonFromGeometry(irregular, DEFAULT_UNIT_PROFILE);
    expect(measured.areaSqFt).toBeCloseTo(2600, 6);
    expect(measured.breakdown.shotok).toBeCloseTo(2600 / 435.6, 6);

    // Also verifies dynamic recomputation when geometry vertices mutate/move
    const modified = irregular.map((p, i) => (i === 1 ? { x: 80, y: p.y } : p));
    expect(measurePolygonFromGeometry(modified, DEFAULT_UNIT_PROFILE).areaSqFt).toBeGreaterThan(2600);
  });

  it('computes Shoelace polygon area, perimeter, centroid, and polyline distances', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 66, y: 0 },
      { x: 66, y: 66 },
      { x: 0, y: 66 },
    ];
    expect(polygonAreaSqFt(rect)).toBeCloseTo(4356, 6);
    expect(polygonPerimeterFt(rect, true)).toBeCloseTo(264, 6);
    expect(polygonCentroid(rect)).toEqual({ x: 33, y: 33 });

    const breakdown = computeAreaBreakdown(4356, DEFAULT_UNIT_PROFILE);
    expect(breakdown.shotok).toBeCloseTo(10, 6);
    expect(breakdown.acre).toBeCloseTo(0.1, 6);

    const distSummary = measurePolylineFromGeometry([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 },
    ]);
    expect(distSummary.totalDistanceFt).toBeCloseTo(70, 6);
    expect(distSummary.netDisplacementFt).toBeCloseTo(50, 6);
    expect(distSummary.bearingsDeg[0]).toBeCloseTo(90, 6);
    expect(distSummary.bearingsDeg[1]).toBeCloseTo(0, 6);
  });

  it('builds quadrilateral from 4 sides and diagonal', () => {
    const pts = buildQuadFromSidesAndDiagonal(60, 45, 60, 45, 75);
    expect(pts).not.toBeNull();
    expect(polygonAreaSqFt(pts!)).toBeCloseTo(2700, 3);
  });
});

describe('Bearings, Angles (90° & 45°), Coordinates & Traverse Solver', () => {
  it('computes exact 90° and 45° angles, 3-point metrics, and coordinate deltas', () => {
    // 90 degrees
    expect(interiorAngleDegrees({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 6);
    expect(angleBetweenPointsDegrees({ x: 0, y: 50 }, { x: 0, y: 0 }, { x: 50, y: 0 })).toBeCloseTo(90, 6);
    const angle90 = measureThreePointAngle({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 });
    expect(angle90.includedDeg).toBeCloseTo(90, 6);
    expect(angle90.reflexDeg).toBeCloseTo(270, 6);

    // 45 degrees
    expect(interiorAngleDegrees({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45, 6);
    expect(segmentAngleDegrees({ x: 0, y: 0 }, { x: 25, y: 25 })).toBeCloseTo(45, 6);
    const angle45 = measureThreePointAngle({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 20 });
    expect(angle45.includedDeg).toBeCloseTo(45, 6);
    expect(angle45.reflexDeg).toBeCloseTo(315, 6);

    // Corner angles of a right triangle with 45° + 45° + 90°
    const cornerAngles = polygonCornerAnglesDegrees([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 0, y: 50 },
    ]);
    expect(cornerAngles[0]).toBeCloseTo(90, 6);
    expect(cornerAngles[1]).toBeCloseTo(45, 6);
    expect(cornerAngles[2]).toBeCloseTo(45, 6);

    const delta = coordinateDelta({ x: 10, y: 20 }, { x: 40, y: 50 });
    expect(delta.dxFt).toBeCloseTo(30, 6);
    expect(delta.dyFt).toBeCloseTo(30, 6);
    expect(delta.azimuthDeg).toBeCloseTo(45, 6);
    expect(delta.cadAngleDeg).toBeCloseTo(45, 6);
  });

  it('computes WCB azimuth and reduced bearings', () => {
    expect(azimuthDegrees({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0, 6);
    expect(azimuthDegrees({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90, 6);
    expect(azimuthDegrees({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(180, 6);
    expect(azimuthDegrees({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270, 6);

    const rb = wcbToReducedBearing(135);
    expect(rb.quadrant).toBe('SE');
    expect(rb.angleDeg).toBeCloseTo(45, 6);
    expect(formatDMS(45.5, 'en')).toBe(`45°30′00″`);
  });

  it('solves closed traverse and applies Bowditch adjustment', () => {
    const res = solveTraverse(
      [
        { distanceFt: 100, azimuthDeg: 90 },
        { distanceFt: 50, azimuthDeg: 0 },
        { distanceFt: 100, azimuthDeg: 270 },
        { distanceFt: 50, azimuthDeg: 180 },
      ],
      { x: 0, y: 0 },
      true
    );
    expect(res.linearMisclosureFt).toBeCloseTo(0, 6);
    expect(res.areaSqFt).toBeCloseTo(5000, 4);

    // Traverse with misclosure adjusts end back to start
    const misclosed = solveTraverse(
      [
        { distanceFt: 100, azimuthDeg: 90 },
        { distanceFt: 50, azimuthDeg: 0 },
        { distanceFt: 98, azimuthDeg: 270 },
        { distanceFt: 50, azimuthDeg: 180 },
      ],
      { x: 0, y: 0 },
      true
    );
    expect(misclosed.linearMisclosureFt).toBeCloseTo(2, 6);
    const last = misclosed.stations[misclosed.stations.length - 1].adjusted;
    expect(last.x).toBeCloseTo(0, 6);
    expect(last.y).toBeCloseTo(0, 6);
  });
});

