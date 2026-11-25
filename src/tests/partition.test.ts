import { describe, expect, it } from 'vitest';
import {
  normalizePartitionShares,
  parseShareExpression,
  solvePolygonPartition,
  updatePartitionByDragPoint,
} from '../core/cad/partition';
import { polygonAreaSqFt } from '../core/survey/area';
import { SHOTOK_SQFT } from '../core/survey/units';

describe('ভাগবণ্টন (Plot Division) engine', () => {
  it('parses Bengali/English ratios, fractions, and percentages accurately', () => {
    expect(parseShareExpression('1/2')).toBeCloseTo(0.5, 8);
    expect(parseShareExpression('৩/৮')).toBeCloseTo(0.375, 8);
    expect(parseShareExpression('2.5')).toBeCloseTo(2.5, 8);
    expect(parseShareExpression('25%')).toBeCloseTo(25, 8);
    expect(Number.isNaN(parseShareExpression('0'))).toBe(true);
    expect(Number.isNaN(parseShareExpression('-3'))).toBe(true);
  });

  it('splits a 100 x 50 ft rectangle into 2 equal parts of 2500 sq ft each', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const totalArea = polygonAreaSqFt(rect);
    expect(totalArea).toBeCloseTo(5000, 6);

    const shares = normalizePartitionShares('equal', totalArea, { equalCount: 2 }, 'bn');

    // Perpendicular to bottom edge (vertical split at x = 50)
    const resPerp = solvePolygonPartition({
      polygon: rect,
      mode: 'equal',
      shares,
      directionMode: 'perpendicular-edge',
      edgeIndex: 0,
    });
    expect(resPerp).not.toBeNull();
    expect(resPerp!.parts).toHaveLength(2);
    expect(resPerp!.splitLines).toHaveLength(1);
    expect(resPerp!.maxAreaErrorSqFt).toBeLessThan(0.01);
    expect(resPerp!.parts[0].actualAreaSqFt).toBeCloseTo(2500, 4);
    expect(resPerp!.parts[1].actualAreaSqFt).toBeCloseTo(2500, 4);

    // Parallel to bottom edge (horizontal split at y = 25)
    const resPara = solvePolygonPartition({
      polygon: rect,
      mode: 'equal',
      shares,
      directionMode: 'parallel-edge',
      edgeIndex: 0,
    });
    expect(resPara).not.toBeNull();
    expect(resPara!.maxAreaErrorSqFt).toBeLessThan(0.01);
    expect(resPara!.parts[0].actualAreaSqFt).toBeCloseTo(2500, 4);
    expect(resPara!.parts[1].actualAreaSqFt).toBeCloseTo(2500, 4);
    // Each horizontal half is 100 x 25
    expect(resPara!.parts[0].perimeterFt).toBeCloseTo(250, 3);
  });

  it('splits a triangle by ratio 1:2 with error < 0.01 sq ft', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 30, y: 90 },
    ];
    const totalArea = polygonAreaSqFt(tri); // 0.5 * 120 * 90 = 5400 sq ft
    expect(totalArea).toBeCloseTo(5400, 6);

    const shares = normalizePartitionShares(
      'ratio',
      totalArea,
      {
        ratioShares: [
          { id: 'h1', name: 'ওয়ারিশ ১', value: 1, shareLabel: '1' },
          { id: 'h2', name: 'ওয়ারিশ ২', value: 2, shareLabel: '2' },
        ],
      },
      'bn'
    );

    const res = solvePolygonPartition({
      polygon: tri,
      mode: 'ratio',
      shares,
      directionMode: 'parallel-edge',
      edgeIndex: 0,
    });
    expect(res).not.toBeNull();
    expect(res!.parts).toHaveLength(2);
    expect(res!.maxAreaErrorSqFt).toBeLessThan(0.01);
    expect(res!.parts[0].actualAreaSqFt).toBeCloseTo(1800, 3);
    expect(res!.parts[1].actualAreaSqFt).toBeCloseTo(3600, 3);
    expect(res!.parts[0].sideLengthsFt.length).toBeGreaterThanOrEqual(3);
  });

  it('splits an irregular/concave polygon into 3 equal areas with error < 0.01 sq ft', () => {
    // Non-convex L-shaped / irregular 6-vertex survey plot
    const irregular = [
      { x: 0, y: 0 },
      { x: 130, y: 5 },
      { x: 125, y: 48 },
      { x: 68, y: 52 },
      { x: 62, y: 105 },
      { x: -5, y: 95 },
    ];
    const totalArea = polygonAreaSqFt(irregular);
    const expectedEach = totalArea / 3;
    const shares = normalizePartitionShares('equal', totalArea, { equalCount: 3 }, 'bn');

    for (const directionMode of ['parallel-edge', 'perpendicular-edge'] as const) {
      const res = solvePolygonPartition({
        polygon: irregular,
        mode: 'equal',
        shares,
        directionMode,
        edgeIndex: 0,
      });
      expect(res).not.toBeNull();
      expect(res!.parts).toHaveLength(3);
      expect(res!.splitLines).toHaveLength(2);
      expect(res!.maxAreaErrorSqFt).toBeLessThan(0.01);
      for (const part of res!.parts) {
        expect(Math.abs(part.actualAreaSqFt - expectedEach)).toBeLessThan(0.01);
      }
      const sumParts = res!.parts.reduce((s, p) => s + p.actualAreaSqFt, 0);
      expect(sumParts).toBeCloseTo(totalArea, 3);
    }
  });

  it('splits an exact target area (5 shotok) and remainder accurately', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const totalArea = polygonAreaSqFt(rect);
    const targetSqFt = 5 * SHOTOK_SQFT; // 2178 sq ft
    const shares = normalizePartitionShares(
      'exact',
      totalArea,
      {
        exactTargetSqFt: targetSqFt,
        exactFirstName: 'করিম',
        exactRemainderName: 'রহিম',
      },
      'bn'
    );

    const res = solvePolygonPartition({
      polygon: rect,
      mode: 'exact',
      shares,
      directionMode: 'perpendicular-edge',
      edgeIndex: 0,
    });
    expect(res).not.toBeNull();
    expect(res!.maxAreaErrorSqFt).toBeLessThan(0.01);
    expect(res!.parts[0].actualAreaSqFt).toBeCloseTo(2178, 3);
    expect(res!.parts[1].actualAreaSqFt).toBeCloseTo(5000 - 2178, 3);
    expect(res!.parts[0].name).toBe('করিম');
    expect(res!.parts[1].name).toBe('রহিম');
  });

  it('splits an irregular polygon radially from a pivot point by fractional shares (1/2 : 1/3 : 1/6)', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 110, y: 10 },
      { x: 120, y: 80 },
      { x: 55, y: 105 },
      { x: -10, y: 70 },
    ];
    const totalArea = polygonAreaSqFt(poly);
    const shares = normalizePartitionShares(
      'ratio',
      totalArea,
      {
        ratioShares: [
          { id: 'a', name: 'অংশ ১', value: 1 / 2, shareLabel: '1/2' },
          { id: 'b', name: 'অংশ ২', value: 1 / 3, shareLabel: '1/3' },
          { id: 'c', name: 'অংশ ৩', value: 1 / 6, shareLabel: '1/6' },
        ],
      },
      'bn'
    );

    const res = solvePolygonPartition({
      polygon: poly,
      mode: 'ratio',
      shares,
      directionMode: 'radial-point',
      pivotPoint: { x: 50, y: 50 },
    });
    expect(res).not.toBeNull();
    expect(res!.parts).toHaveLength(3);
    expect(res!.maxAreaErrorSqFt).toBeLessThan(0.01);
    expect(res!.parts[0].actualAreaSqFt).toBeCloseTo(totalArea * 0.5, 2);
    expect(res!.parts[1].actualAreaSqFt).toBeCloseTo(totalArea * (1 / 3), 2);
    expect(res!.parts[2].actualAreaSqFt).toBeCloseTo(totalArea * (1 / 6), 2);
  });

  it('recalculates all part areas live when dragging a split line', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const shares = normalizePartitionShares('equal', 5000, { equalCount: 2 }, 'bn');
    const initial = solvePolygonPartition({
      polygon: rect,
      mode: 'equal',
      shares,
      directionMode: 'perpendicular-edge',
      edgeIndex: 0,
    });
    expect(initial).not.toBeNull();

    // Drag vertical split handle from x=50 to x=65 (part 0 -> 3250 sq ft, part 1 -> 1750 sq ft)
    const dragged = updatePartitionByDragPoint(rect, initial!, 0, { x: 65, y: 25 }, shares);
    const totalDragged = dragged.parts.reduce((s, p) => s + p.actualAreaSqFt, 0);
    expect(totalDragged).toBeCloseTo(5000, 4);
    expect(dragged.parts[0].actualAreaSqFt).not.toBeCloseTo(2500, 0);
    const sortedAreas = dragged.parts.map((p) => p.actualAreaSqFt).sort((a, b) => a - b);
    expect(sortedAreas[0]).toBeCloseTo(1750, 2);
    expect(sortedAreas[1]).toBeCloseTo(3250, 2);
  });
});
