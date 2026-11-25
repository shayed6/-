import { describe, expect, it } from 'vitest';
import {
  rasterPixelToWorld,
  solveRasterAlignmentFromPairs,
  worldToRasterPixel,
} from '../core/cad/geometry';
import {
  RasterTransform,
  createEmptyDocument,
} from '../core/cad/types';
import { computePolygonOverlapMetrics } from '../core/survey/area';
import { DEFAULT_UNIT_PROFILE } from '../core/survey/units';
import { parseProjectJson, serializeProjectJson } from '../adapters/nativeJson';
import { exportDocumentToCsv } from '../adapters/csv';

describe('Demarcation CS–RS Map Alignment & Overlap', () => {
  it('recovers exact similarity transform from 2 tie points on a synthetic rotated & scaled map', () => {
    const groundTruth: RasterTransform = {
      tx: 125.5,
      ty: -42.25,
      scaleFtPerPx: 0.42,
      rotationRad: (23.5 * Math.PI) / 180,
    };

    const px1 = { x: 100, y: 150 };
    const px2 = { x: 820, y: 540 };
    const w1 = rasterPixelToWorld(px1, groundTruth);
    const w2 = rasterPixelToWorld(px2, groundTruth);

    const solved = solveRasterAlignmentFromPairs([
      { baseWorld: w1, overlayPx: px1 },
      { baseWorld: w2, overlayPx: px2 },
    ]);

    expect(solved).not.toBeNull();
    expect(solved!.method).toBe('similarity-2pt');
    expect(solved!.transform.tx).toBeCloseTo(groundTruth.tx, 6);
    expect(solved!.transform.ty).toBeCloseTo(groundTruth.ty, 6);
    expect(solved!.transform.scaleFtPerPx).toBeCloseTo(groundTruth.scaleFtPerPx, 6);
    expect(solved!.transform.rotationRad).toBeCloseTo(groundTruth.rotationRad, 6);
    expect(solved!.residualsFt[0]).toBeCloseTo(0, 6);
    expect(solved!.residualsFt[1]).toBeCloseTo(0, 6);
    expect(solved!.rmsErrorFt).toBeCloseTo(0, 6);
    expect(solved!.highErrorWarning).toBe(false);
  });

  it('recovers exact least-squares alignment for 3+ pairs on a rotated & scaled synthetic map', () => {
    const groundTruth: RasterTransform = {
      tx: 200,
      ty: 150,
      scaleFtPerPx: 0.25,
      rotationRad: (-37 * Math.PI) / 180,
    };

    const pixels = [
      { x: 50, y: 60 },
      { x: 650, y: 80 },
      { x: 620, y: 520 },
      { x: 80, y: 490 },
    ];

    const pairs = pixels.map((px) => ({
      overlayPx: px,
      baseWorld: rasterPixelToWorld(px, groundTruth),
    }));

    const solved = solveRasterAlignmentFromPairs(pairs);
    expect(solved).not.toBeNull();
    expect(solved!.method).toBe('least-squares');
    expect(solved!.transform.tx).toBeCloseTo(groundTruth.tx, 6);
    expect(solved!.transform.ty).toBeCloseTo(groundTruth.ty, 6);
    expect(solved!.transform.scaleFtPerPx).toBeCloseTo(groundTruth.scaleFtPerPx, 6);
    expect(solved!.transform.rotationRad).toBeCloseTo(groundTruth.rotationRad, 6);
    expect(solved!.rmsErrorFt).toBeCloseTo(0, 6);
    expect(solved!.highErrorWarning).toBe(false);

    // Round-trip an arbitrary point through the recovered transform
    const testPx = { x: 333, y: 277 };
    const mapped = rasterPixelToWorld(testPx, solved!.transform);
    const expected = rasterPixelToWorld(testPx, groundTruth);
    expect(mapped.x).toBeCloseTo(expected.x, 6);
    expect(mapped.y).toBeCloseTo(expected.y, 6);
    const backPx = worldToRasterPixel(mapped, solved!.transform);
    expect(backPx.x).toBeCloseTo(testPx.x, 6);
    expect(backPx.y).toBeCloseTo(testPx.y, 6);
  });

  it('computes per-point residuals, RMS error, and triggers highErrorWarning on distorted maps', () => {
    const truth: RasterTransform = {
      tx: 0,
      ty: 0,
      scaleFtPerPx: 0.5,
      rotationRad: (15 * Math.PI) / 180,
    };
    const pixels = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 400 },
      { x: 0, y: 400 },
    ];

    // Small distortion (< 1 ft) stays below high-error threshold
    const lowNoisePairs = pixels.map((px, idx) => {
      const w = rasterPixelToWorld(px, truth);
      return {
        overlayPx: px,
        baseWorld: idx === 2 ? { x: w.x + 0.6, y: w.y } : w,
      };
    });
    const lowRes = solveRasterAlignmentFromPairs(lowNoisePairs, 3.0);
    expect(lowRes).not.toBeNull();
    expect(lowRes!.rmsErrorFt).toBeGreaterThan(0);
    expect(lowRes!.rmsErrorFt).toBeLessThan(1.0);
    expect(lowRes!.highErrorWarning).toBe(false);

    // Large mismatch (+12 ft on one control point) triggers highErrorWarning
    const highNoisePairs = pixels.map((px, idx) => {
      const w = rasterPixelToWorld(px, truth);
      return {
        overlayPx: px,
        baseWorld: idx === 2 ? { x: w.x + 12, y: w.y } : w,
      };
    });
    const highRes = solveRasterAlignmentFromPairs(highNoisePairs, 3.0);
    expect(highRes).not.toBeNull();
    expect(highRes!.residualsFt).toHaveLength(4);
    const expectedRms = Math.sqrt(
      highRes!.residualsFt.reduce((a, r) => a + r * r, 0) / 4
    );
    expect(highRes!.rmsErrorFt).toBeCloseTo(expectedRms, 6);
    expect(highRes!.rmsErrorFt).toBeGreaterThan(3.0);
    expect(highRes!.highErrorWarning).toBe(true);
  });

  it('computes exact overlap area in shotok and percentage for partial, rotated, concave, and disjoint polygons', () => {
    // 1. Partial overlap of two 100x66 rectangles (100x66 = 6600 sq ft each, overlap = 66x66 = 4356 sq ft = 10 shotok)
    const csRect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 66 },
      { x: 0, y: 66 },
    ];
    const rsRect = [
      { x: 34, y: 0 },
      { x: 134, y: 0 },
      { x: 134, y: 66 },
      { x: 34, y: 66 },
    ];
    const partial = computePolygonOverlapMetrics(csRect, rsRect, DEFAULT_UNIT_PROFILE);
    expect(partial.overlapAreaSqFt).toBeCloseTo(4356, 4);
    expect(partial.overlapBreakdown.shotok).toBeCloseTo(10, 4);
    expect(partial.percentOfBase).toBeCloseTo(66, 4);
    expect(partial.percentOfOverlay).toBeCloseTo(66, 4);
    expect(partial.overlapRings).toHaveLength(1);

    // 2. Rotated RS diamond completely inside larger CS square
    const bigCs = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ];
    const rotatedRs = [
      { x: 100, y: 50 },
      { x: 150, y: 100 },
      { x: 100, y: 150 },
      { x: 50, y: 100 },
    ]; // Side = sqrt(2500+2500) = sqrt(5000), Area = 5000 sq ft
    const inside = computePolygonOverlapMetrics(bigCs, rotatedRs, DEFAULT_UNIT_PROFILE);
    expect(inside.overlapAreaSqFt).toBeCloseTo(5000, 4);
    expect(inside.percentOfOverlay).toBeCloseTo(100, 4);
    expect(inside.percentOfBase).toBeCloseTo(12.5, 4);

    // 3. Concave L-shaped CS plot overlapping RS square
    const lShapeCs = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 100 },
    ]; // Area = 7500 sq ft
    const rsCorner = [
      { x: 25, y: 25 },
      { x: 100, y: 25 },
      { x: 100, y: 100 },
      { x: 25, y: 100 },
    ]; // Area = 5625 sq ft
    // Overlap = [25..100, 25..50] (75*25=1875) + [25..50, 50..100] (25*50=1250) = 3125 sq ft
    const concave = computePolygonOverlapMetrics(lShapeCs, rsCorner, DEFAULT_UNIT_PROFILE);
    expect(concave.overlapAreaSqFt).toBeCloseTo(3125, 4);
    expect(concave.overlapBreakdown.shotok).toBeCloseTo(3125 / 435.6, 4);
    expect(concave.percentOfBase).toBeCloseTo((3125 / 7500) * 100, 3);
    expect(concave.percentOfOverlay).toBeCloseTo((3125 / 5625) * 100, 3);

    // 4. Disjoint polygons
    const farRs = [
      { x: 500, y: 500 },
      { x: 600, y: 500 },
      { x: 600, y: 600 },
      { x: 500, y: 600 },
    ];
    const disjoint = computePolygonOverlapMetrics(csRect, farRs, DEFAULT_UNIT_PROFILE);
    expect(disjoint.overlapAreaSqFt).toBe(0);
    expect(disjoint.percentOfBase).toBe(0);
    expect(disjoint.percentOfOverlay).toBe(0);
    expect(disjoint.overlapRings).toHaveLength(0);
  });

  it('persists overlayAlignment & demarcationResults in JSON and exports overlap result table to CSV', () => {
    const doc = createEmptyDocument('CS-RS Demarcation Test');
    doc.hasRasterMeasurement = true;
    doc.overlayAlignment = {
      baseRasterId: 'r-cs',
      overlayRasterId: 'r-rs',
      pairs: [
        { id: 'p1', baseWorld: { x: 0, y: 0 }, overlayPx: { x: 10, y: 20 } },
        { id: 'p2', baseWorld: { x: 100, y: 0 }, overlayPx: { x: 210, y: 20 } },
        { id: 'p3', baseWorld: { x: 100, y: 100 }, overlayPx: { x: 210, y: -180 } },
      ],
      method: 'least-squares',
      rmsErrorFt: 0.45,
      maxErrorFt: 0.62,
      residualsFt: [0.2, 0.3, 0.62],
      updatedAt: 1700000000000,
    };
    doc.demarcationResults = [
      {
        id: 'dem-1',
        createdAt: 1700000005000,
        baseMapLabel: 'CS (সাবেক)',
        overlayMapLabel: 'RS (হাল)',
        baseDagNo: '101',
        overlayDagNo: '254',
        basePolygon: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 66 },
          { x: 0, y: 66 },
        ],
        overlayPolygon: [
          { x: 34, y: 0 },
          { x: 134, y: 0 },
          { x: 134, y: 66 },
          { x: 34, y: 66 },
        ],
        rmsErrorFt: 0.45,
      },
    ];

    const json = serializeProjectJson(doc);
    const restored = parseProjectJson(json);
    expect(restored.overlayAlignment?.method).toBe('least-squares');
    expect(restored.overlayAlignment?.pairs).toHaveLength(3);
    expect(restored.demarcationResults).toHaveLength(1);
    expect(restored.demarcationResults![0].baseDagNo).toBe('101');
    expect(restored.demarcationResults![0].overlayDagNo).toBe('254');

    const csvEn = exportDocumentToCsv(restored, 'en');
    expect(csvEn).toContain('Demarcation Overlap Result Table');
    expect(csvEn).toContain('101');
    expect(csvEn).toContain('254');
    expect(csvEn).toContain('10.0000'); // 4356 sq ft = 10.0000 shotok
    expect(csvEn).toContain('66.00%');
  });
});
