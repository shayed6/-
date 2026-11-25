import * as polygonClippingNs from 'polygon-clipping';
import { Point2D, distance2D } from './coordinates';
import { azimuthDegrees } from './bearing';
import {
  DEFAULT_UNIT_PROFILE,
  UnitProfile,
  fromSqFt,
} from './units';

type PolygonClippingModule = typeof polygonClippingNs;
const polygonClipping: PolygonClippingModule =
  (polygonClippingNs as unknown as { default?: PolygonClippingModule }).default ??
  polygonClippingNs;

export interface AreaBreakdown {
  sqFt: number;
  sqM: number;
  shotok: number;
  katha: number;
  bigha: number;
  acre: number;
}

export function polygonSignedAreaSqFt(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return sum / 2;
}

export function polygonAreaSqFt(points: Point2D[]): number {
  return Math.abs(polygonSignedAreaSqFt(points));
}

export function polygonPerimeterFt(points: Point2D[], closed = true): number {
  if (points.length < 2) return 0;
  let total = 0;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    total += distance2D(points[i], points[(i + 1) % points.length]);
  }
  return total;
}

export function polygonCentroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    let sx = 0;
    let sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / points.length, y: sy / points.length };
  }
  const signedArea = polygonSignedAreaSqFt(points);
  if (Math.abs(signedArea) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / points.length, y: sy / points.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const cross = p1.x * p2.y - p2.x * p1.y;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }
  return {
    x: cx / (6 * signedArea),
    y: cy / (6 * signedArea),
  };
}

export function heronAreaSqFt(a: number, b: number, c: number): number | null {
  if (a <= 0 || b <= 0 || c <= 0) return null;
  if (a + b <= c || a + c <= b || b + c <= a) return null;
  const s = (a + b + c) / 2;
  const under = s * (s - a) * (s - b) * (s - c);
  return under <= 0 ? null : Math.sqrt(under);
}

/**
 * Given base points A, B with distance AB = baseLen, solves third point C
 * such that AC = sideAC, BC = sideBC. Returns null if triangle inequality fails.
 */
export function solveTriangleThirdPoint(
  a: Point2D,
  b: Point2D,
  sideAC: number,
  sideBC: number,
  side: 'left' | 'right' = 'left'
): Point2D | null {
  const d = distance2D(a, b);
  if (d < 1e-9 || sideAC <= 0 || sideBC <= 0) return null;
  if (d + sideAC <= sideBC || d + sideBC <= sideAC || sideAC + sideBC <= d) {
    return null;
  }
  const ex = (b.x - a.x) / d;
  const ey = (b.y - a.y) / d;
  const x = (sideAC * sideAC - sideBC * sideBC + d * d) / (2 * d);
  const hSq = Math.max(0, sideAC * sideAC - x * x);
  const h = Math.sqrt(hSq);
  const nx = side === 'left' ? -ey : ey;
  const ny = side === 'left' ? ex : -ex;
  return {
    x: a.x + ex * x + nx * h,
    y: a.y + ey * x + ny * h,
  };
}

/**
 * Builds a quadrilateral in world coordinates (ft) from 4 sides (AB, BC, CD, DA)
 * and one diagonal (AC). Returns null if either triangle is invalid.
 */
export function buildQuadFromSidesAndDiagonal(
  ab: number,
  bc: number,
  cd: number,
  da: number,
  diagAC: number,
  origin: Point2D = { x: 0, y: 0 }
): Point2D[] | null {
  if (ab <= 0 || bc <= 0 || cd <= 0 || da <= 0 || diagAC <= 0) return null;
  const pA: Point2D = { x: origin.x, y: origin.y };
  const pB: Point2D = { x: origin.x + ab, y: origin.y };
  const pC = solveTriangleThirdPoint(pA, pB, diagAC, bc, 'left');
  if (!pC) return null;
  const pD = solveTriangleThirdPoint(pA, pC, da, cd, 'left');
  if (!pD) return null;
  return [pA, pB, pC, pD];
}

export function computeAreaBreakdown(
  sqFt: number,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): AreaBreakdown {
  return {
    sqFt,
    sqM: fromSqFt(sqFt, 'sqm', profile),
    shotok: fromSqFt(sqFt, 'shotok', profile),
    katha: fromSqFt(sqFt, 'katha', profile),
    bigha: fromSqFt(sqFt, 'bigha', profile),
    acre: fromSqFt(sqFt, 'acre', profile),
  };
}

export interface PolygonMeasurementSummary {
  areaSqFt: number;
  perimeterFt: number;
  segmentLengthsFt: number[];
  breakdown: AreaBreakdown;
  centroid: Point2D;
}

/**
 * Pure measurement recomputed strictly from vertex geometry and unit profile.
 */
export function measurePolygonFromGeometry(
  points: Point2D[],
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): PolygonMeasurementSummary {
  const areaSqFt = polygonAreaSqFt(points);
  const segmentLengthsFt: number[] = [];
  if (points.length >= 2) {
    for (let i = 0; i < points.length; i++) {
      segmentLengthsFt.push(distance2D(points[i], points[(i + 1) % points.length]));
    }
  }
  const perimeterFt = segmentLengthsFt.reduce((acc, v) => acc + v, 0);
  return {
    areaSqFt,
    perimeterFt,
    segmentLengthsFt,
    breakdown: computeAreaBreakdown(areaSqFt, profile),
    centroid: polygonCentroid(points),
  };
}

export interface PolylineMeasurementSummary {
  totalDistanceFt: number;
  segmentLengthsFt: number[];
  bearingsDeg: number[];
  netDisplacementFt: number;
}

/**
 * Pure distance & bearing measurement recomputed strictly from polyline geometry.
 */
export function measurePolylineFromGeometry(
  points: Point2D[]
): PolylineMeasurementSummary {
  const segmentLengthsFt: number[] = [];
  const bearingsDeg: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segmentLengthsFt.push(distance2D(points[i], points[i + 1]));
    bearingsDeg.push(azimuthDegrees(points[i], points[i + 1]));
  }
  const totalDistanceFt = segmentLengthsFt.reduce((acc, v) => acc + v, 0);
  const netDisplacementFt =
    points.length >= 2 ? distance2D(points[0], points[points.length - 1]) : 0;
  return {
    totalDistanceFt,
    segmentLengthsFt,
    bearingsDeg,
    netDisplacementFt,
  };
}

export interface PolygonOverlapResult {
  baseAreaSqFt: number;
  baseBreakdown: AreaBreakdown;
  overlayAreaSqFt: number;
  overlayBreakdown: AreaBreakdown;
  overlapAreaSqFt: number;
  overlapBreakdown: AreaBreakdown;
  percentOfBase: number;
  percentOfOverlay: number;
  /** Exterior intersection polygon rings for canvas/report highlighting */
  overlapRings: Point2D[][];
}

function toClosedClippingPolygon(pts: Point2D[]): polygonClippingNs.Polygon {
  const ring: polygonClippingNs.Ring = pts.map((p) => [p.x, p.y]);
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }
  return [ring];
}

function ringToPoints(ring: polygonClippingNs.Ring): Point2D[] {
  if (ring.length <= 1) return ring.map(([x, y]) => ({ x, y }));
  const first = ring[0];
  const last = ring[ring.length - 1];
  const trimmed =
    first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
  return trimmed.map(([x, y]) => ({ x, y }));
}

/**
 * Computes robust intersection & overlap area between two polygons (e.g. CS/সাবেক and RS/হাল dag)
 * using the `polygon-clipping` Martinez-Rueda boolean library.
 */
export function computePolygonOverlapMetrics(
  basePolyPts: Point2D[],
  overlayPolyPts: Point2D[],
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): PolygonOverlapResult {
  const baseAreaSqFt = polygonAreaSqFt(basePolyPts);
  const overlayAreaSqFt = polygonAreaSqFt(overlayPolyPts);

  let overlapAreaSqFt = 0;
  const overlapRings: Point2D[][] = [];

  if (basePolyPts.length >= 3 && overlayPolyPts.length >= 3) {
    const clipped = polygonClipping.intersection(
      toClosedClippingPolygon(basePolyPts),
      toClosedClippingPolygon(overlayPolyPts)
    );
    for (const poly of clipped) {
      if (poly.length === 0) continue;
      const outerPts = ringToPoints(poly[0]);
      let polyArea = polygonAreaSqFt(outerPts);
      for (let h = 1; h < poly.length; h++) {
        polyArea -= polygonAreaSqFt(ringToPoints(poly[h]));
      }
      if (polyArea > 1e-6) {
        overlapAreaSqFt += polyArea;
        overlapRings.push(outerPts);
      }
    }
  }

  const percentOfBase =
    baseAreaSqFt > 1e-9 ? Math.min(100, (overlapAreaSqFt / baseAreaSqFt) * 100) : 0;
  const percentOfOverlay =
    overlayAreaSqFt > 1e-9
      ? Math.min(100, (overlapAreaSqFt / overlayAreaSqFt) * 100)
      : 0;

  return {
    baseAreaSqFt,
    baseBreakdown: computeAreaBreakdown(baseAreaSqFt, profile),
    overlayAreaSqFt,
    overlayBreakdown: computeAreaBreakdown(overlayAreaSqFt, profile),
    overlapAreaSqFt,
    overlapBreakdown: computeAreaBreakdown(overlapAreaSqFt, profile),
    percentOfBase,
    percentOfOverlay,
    overlapRings,
  };
}

