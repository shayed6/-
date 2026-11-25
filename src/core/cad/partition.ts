import * as polygonClippingNs from 'polygon-clipping';
import { computeAreaBreakdown, polygonAreaSqFt, polygonCentroid, polygonPerimeterFt } from '../survey/area';
import { Point2D, bboxFromPoints, distance2D } from '../survey/coordinates';
import { DEFAULT_UNIT_PROFILE, UnitProfile } from '../survey/units';

const polygonClipping =
  (polygonClippingNs as unknown as { default?: typeof polygonClippingNs }).default ||
  polygonClippingNs;

export type PartitionDivideMode = 'equal' | 'ratio' | 'exact';

export type PartitionDirectionMode =
  | 'parallel-edge'
  | 'perpendicular-edge'
  | 'radial-point';

export interface PartitionShareInput {
  id: string;
  name: string;
  /** Numeric weight or fraction value (for 'ratio') or targetSqFt (for 'exact') */
  value: number;
  /** Optional display label (e.g., "১/৩" or "২") */
  shareLabel?: string;
}

export interface NormalizedPartitionShare {
  id: string;
  name: string;
  fraction: number;
  targetAreaSqFt: number;
  shareLabel: string;
  color: string;
}

export interface PartitionSplitLineInfo {
  index: number;
  segments: Array<{ a: Point2D; b: Point2D }>;
  handlePoint: Point2D;
  /** Normal projection distance in ft (linear) or sweep angle in deg (radial) */
  positionValue: number;
}

export interface PartitionPartResult {
  id: string;
  name: string;
  shareLabel: string;
  color: string;
  targetAreaSqFt: number;
  actualAreaSqFt: number;
  areaErrorSqFt: number;
  fraction: number;
  percent: number;
  /** Primary outer boundary ring (largest component if concave cut splits into multiple islands) */
  primaryRing: Point2D[];
  /** All component outer rings belonging to this share */
  rings: Point2D[][];
  sideLengthsFt: number[];
  perimeterFt: number;
  centroid: Point2D;
}

export interface PartitionComputationResult {
  mode: PartitionDivideMode;
  directionMode: PartitionDirectionMode;
  totalAreaSqFt: number;
  cutAngleDeg: number;
  pivotPoint: Point2D | null;
  radialStartAngleDeg: number;
  minLinearProj: number;
  maxLinearProj: number;
  /** Cut positions: normal offset in ft (linear) or cumulative sweep degrees in (0, 360) (radial) */
  cutPositions: number[];
  splitLines: PartitionSplitLineInfo[];
  parts: PartitionPartResult[];
  maxAreaErrorSqFt: number;
}

export const PARTITION_SHARE_COLORS = [
  '#0F5132',
  '#1D4ED8',
  '#B45309',
  '#7C3AED',
  '#0F766E',
  '#BE123C',
  '#0369A1',
  '#4D7C0F',
];

const BENGALI_TO_ASCII: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
  '٫': '.',
  '।' : '.',
};

function toAsciiDigits(raw: string): string {
  return raw.replace(/[০-৯٫।]/g, (ch) => BENGALI_TO_ASCII[ch] ?? ch).trim();
}

/**
 * Parses a ratio, decimal, percentage, or fraction expression (supports Bengali digits).
 * Examples: "2", "1.5", "1/3", "৩/৮", "25%"
 */
export function parseShareExpression(raw: string): number {
  const s = toAsciiDigits(raw).replace(/\s+/g, '');
  if (!s) return NaN;

  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length !== 2) return NaN;
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num <= 0) {
      return NaN;
    }
    return num / den;
  }

  if (s.endsWith('%')) {
    const pct = Number(s.slice(0, -1));
    return Number.isFinite(pct) && pct > 0 ? pct : NaN;
  }

  const val = Number(s);
  return Number.isFinite(val) && val > 0 ? val : NaN;
}

function toClosedClippingPoly(pts: Point2D[]): polygonClippingNs.Polygon {
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

function extractRingsAndArea(multi: polygonClippingNs.MultiPolygon): {
  rings: Point2D[][];
  primaryRing: Point2D[];
  areaSqFt: number;
} {
  const rings: Point2D[][] = [];
  let totalArea = 0;
  let primaryRing: Point2D[] = [];
  let bestArea = -1;

  for (const poly of multi) {
    if (!poly || poly.length === 0) continue;
    const outer = ringToPoints(poly[0]);
    if (outer.length < 3) continue;
    let a = polygonAreaSqFt(outer);
    for (let h = 1; h < poly.length; h++) {
      a -= polygonAreaSqFt(ringToPoints(poly[h]));
    }
    if (a > 1e-8) {
      totalArea += a;
      rings.push(outer);
      if (a > bestArea) {
        bestArea = a;
        primaryRing = outer;
      }
    }
  }

  return { rings, primaryRing, areaSqFt: totalArea };
}

function clipWithStripBand(
  subject: polygonClippingNs.Polygon,
  normal: Point2D,
  tangent: Point2D,
  dMin: number,
  dMax: number,
  spanExtent: number
): polygonClippingNs.MultiPolygon {
  if (dMax - dMin <= 1e-10) return [];
  const p1: Point2D = {
    x: normal.x * dMin - tangent.x * spanExtent,
    y: normal.y * dMin - tangent.y * spanExtent,
  };
  const p2: Point2D = {
    x: normal.x * dMin + tangent.x * spanExtent,
    y: normal.y * dMin + tangent.y * spanExtent,
  };
  const p3: Point2D = {
    x: normal.x * dMax + tangent.x * spanExtent,
    y: normal.y * dMax + tangent.y * spanExtent,
  };
  const p4: Point2D = {
    x: normal.x * dMax - tangent.x * spanExtent,
    y: normal.y * dMax - tangent.y * spanExtent,
  };
  const band = toClosedClippingPoly([p1, p2, p3, p4]);
  return polygonClipping.intersection(subject, band);
}

/**
 * Finds all line segments where the infinite line (x . normal = d) passes inside the polygon.
 */
export function extractLinearSplitSegments(
  polygon: Point2D[],
  normal: Point2D,
  tangent: Point2D,
  d: number
): Array<{ a: Point2D; b: Point2D }> {
  const n = polygon.length;
  if (n < 3) return [];

  const origin: Point2D = { x: normal.x * d, y: normal.y * d };
  const tHits: number[] = [];

  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const da = a.x * normal.x + a.y * normal.y - d;
    const db = b.x * normal.x + b.y * normal.y - d;

    if ((da <= 0 && db > 0) || (db <= 0 && da > 0)) {
      const denom = da - db;
      if (Math.abs(denom) > 1e-12) {
        const u = da / denom;
        const ix = a.x + u * (b.x - a.x);
        const iy = a.y + u * (b.y - a.y);
        const t = (ix - origin.x) * tangent.x + (iy - origin.y) * tangent.y;
        tHits.push(t);
      }
    }
  }

  tHits.sort((x, y) => x - y);
  const segs: Array<{ a: Point2D; b: Point2D }> = [];
  for (let i = 0; i + 1 < tHits.length; i += 2) {
    const t0 = tHits[i];
    const t1 = tHits[i + 1];
    if (t1 - t0 > 1e-6) {
      segs.push({
        a: { x: origin.x + tangent.x * t0, y: origin.y + tangent.y * t0 },
        b: { x: origin.x + tangent.x * t1, y: origin.y + tangent.y * t1 },
      });
    }
  }
  return segs;
}

/**
 * Builds a convex-fan MultiPolygon sector from `pivot` covering [startRad, startRad + sweepRad].
 * Subdivided into <= 60-degree wedges so polygon-clipping always receives simple convex polygons.
 */
function buildRadialSectorMultiPolygon(
  pivot: Point2D,
  startRad: number,
  sweepRad: number,
  radius: number
): polygonClippingNs.MultiPolygon {
  const clamped = Math.max(0, Math.min(Math.PI * 2, sweepRad));
  if (clamped <= 1e-9) return [];

  const maxStep = Math.PI / 3; // 60 degrees
  const steps = Math.max(1, Math.ceil(clamped / maxStep));
  const delta = clamped / steps;
  const polys: polygonClippingNs.Polygon[] = [];

  for (let i = 0; i < steps; i++) {
    const a0 = startRad + i * delta;
    const a1 = startRad + (i + 1) * delta;
    const p1: Point2D = {
      x: pivot.x + Math.cos(a0) * radius,
      y: pivot.y + Math.sin(a0) * radius,
    };
    const p2: Point2D = {
      x: pivot.x + Math.cos(a1) * radius,
      y: pivot.y + Math.sin(a1) * radius,
    };
    polys.push(toClosedClippingPoly([pivot, p1, p2]));
  }
  return polys;
}

/**
 * Extracts ray segment(s) from `pivot` along `angleRad` inside `polygon`.
 */
export function extractRadialRaySegments(
  polygon: Point2D[],
  pivot: Point2D,
  angleRad: number,
  maxRadius: number
): Array<{ a: Point2D; b: Point2D }> {
  const dir: Point2D = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const perp: Point2D = { x: -dir.y, y: dir.x };
  const sHits: number[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const pa = (a.x - pivot.x) * perp.x + (a.y - pivot.y) * perp.y;
    const pb = (b.x - pivot.x) * perp.x + (b.y - pivot.y) * perp.y;

    if ((pa <= 0 && pb > 0) || (pb <= 0 && pa > 0)) {
      const denom = pa - pb;
      if (Math.abs(denom) > 1e-12) {
        const u = pa / denom;
        const ix = a.x + u * (b.x - a.x);
        const iy = a.y + u * (b.y - a.y);
        const s = (ix - pivot.x) * dir.x + (iy - pivot.y) * dir.y;
        if (s >= -1e-6) {
          sHits.push(Math.max(0, s));
        }
      }
    }
  }

  sHits.sort((x, y) => x - y);
  // Check if pivot itself is strictly inside (odd number of positive hits)
  const segs: Array<{ a: Point2D; b: Point2D }> = [];
  if (sHits.length % 2 === 1) {
    const end0 = sHits[0];
    if (end0 > 1e-6) {
      segs.push({
        a: { ...pivot },
        b: { x: pivot.x + dir.x * end0, y: pivot.y + dir.y * end0 },
      });
    }
    for (let i = 1; i + 1 < sHits.length; i += 2) {
      const s0 = sHits[i];
      const s1 = sHits[i + 1];
      if (s1 - s0 > 1e-6) {
        segs.push({
          a: { x: pivot.x + dir.x * s0, y: pivot.y + dir.y * s0 },
          b: { x: pivot.x + dir.x * s1, y: pivot.y + dir.y * s1 },
        });
      }
    }
  } else {
    for (let i = 0; i + 1 < sHits.length; i += 2) {
      const s0 = sHits[i];
      const s1 = sHits[i + 1];
      if (s1 - s0 > 1e-6) {
        segs.push({
          a: { x: pivot.x + dir.x * s0, y: pivot.y + dir.y * s0 },
          b: { x: pivot.x + dir.x * s1, y: pivot.y + dir.y * s1 },
        });
      }
    }
  }

  if (segs.length === 0 && maxRadius > 0) {
    segs.push({
      a: { ...pivot },
      b: { x: pivot.x + dir.x * (maxRadius * 0.25), y: pivot.y + dir.y * (maxRadius * 0.25) },
    });
  }
  return segs;
}

export function normalizePartitionShares(
  mode: PartitionDivideMode,
  totalAreaSqFt: number,
  opts: {
    equalCount?: number;
    ratioShares?: PartitionShareInput[];
    exactTargetSqFt?: number;
    exactFirstName?: string;
    exactRemainderName?: string;
    names?: string[];
  },
  lang: 'bn' | 'en' = 'bn'
): NormalizedPartitionShare[] {
  if (totalAreaSqFt <= 1e-6) return [];

  if (mode === 'equal') {
    const count = Math.max(2, Math.min(20, Math.round(opts.equalCount || 2)));
    const eachArea = totalAreaSqFt / count;
    return Array.from({ length: count }, (_, idx) => ({
      id: `share-${idx + 1}`,
      name:
        opts.names?.[idx]?.trim() ||
        (lang === 'bn' ? `অংশ ${idx + 1}` : `Share ${idx + 1}`),
      fraction: 1 / count,
      targetAreaSqFt: eachArea,
      shareLabel: `1/${count}`,
      color: PARTITION_SHARE_COLORS[idx % PARTITION_SHARE_COLORS.length],
    }));
  }

  if (mode === 'exact') {
    const t = opts.exactTargetSqFt || 0;
    if (!(t > 1e-4 && t < totalAreaSqFt - 1e-4)) {
      return [];
    }
    const rem = totalAreaSqFt - t;
    return [
      {
        id: 'share-1',
        name:
          opts.exactFirstName?.trim() ||
          (lang === 'bn' ? 'নির্দিষ্ট অংশ' : 'Target Share'),
        fraction: t / totalAreaSqFt,
        targetAreaSqFt: t,
        shareLabel: `${((t / totalAreaSqFt) * 100).toFixed(1)}%`,
        color: PARTITION_SHARE_COLORS[0],
      },
      {
        id: 'share-2',
        name:
          opts.exactRemainderName?.trim() ||
          (lang === 'bn' ? 'অবশিষ্ট অংশ' : 'Remaining Share'),
        fraction: rem / totalAreaSqFt,
        targetAreaSqFt: rem,
        shareLabel: `${((rem / totalAreaSqFt) * 100).toFixed(1)}%`,
        color: PARTITION_SHARE_COLORS[1],
      },
    ];
  }

  // 'ratio' mode
  const raw = (opts.ratioShares || []).filter((s) => Number.isFinite(s.value) && s.value > 0);
  if (raw.length < 2) return [];
  const totalWeight = raw.reduce((acc, s) => acc + s.value, 0);
  if (totalWeight <= 1e-12) return [];

  return raw.map((s, idx) => {
    const fraction = s.value / totalWeight;
    return {
      id: s.id || `share-${idx + 1}`,
      name:
        s.name.trim() ||
        (lang === 'bn' ? `অংশীদার ${idx + 1}` : `Heir ${idx + 1}`),
      fraction,
      targetAreaSqFt: totalAreaSqFt * fraction,
      shareLabel: s.shareLabel || String(Number(s.value.toFixed(4))),
      color: PARTITION_SHARE_COLORS[idx % PARTITION_SHARE_COLORS.length],
    };
  });
}

export function computeEdgeCutAngleDeg(
  polygon: Point2D[],
  edgeIndex: number,
  directionMode: 'parallel-edge' | 'perpendicular-edge',
  flip = false
): number {
  if (polygon.length < 2) return 0;
  const idx = ((edgeIndex % polygon.length) + polygon.length) % polygon.length;
  const a = polygon[idx];
  const b = polygon[(idx + 1) % polygon.length];
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (directionMode === 'perpendicular-edge') {
    deg += 90;
  }
  if (flip) {
    deg += 180;
  }
  return ((deg % 360) + 360) % 360;
}

function buildPartSideLengths(ring: Point2D[]): number[] {
  if (ring.length < 2) return [];
  const lens: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    lens.push(distance2D(ring[i], ring[(i + 1) % ring.length]));
  }
  return lens;
}

/**
 * Auto-selects a clean radial sweep start angle so a radial cut starting at angle `0`
 * enters the polygon interior immediately if `pivot` is outside or on a vertex.
 */
export function suggestRadialStartAngleDeg(polygon: Point2D[], pivot: Point2D): number {
  if (polygon.length < 3) return 0;

  // If pivot coincides closely with a vertex, start along the outgoing CCW edge
  for (let i = 0; i < polygon.length; i++) {
    if (distance2D(polygon[i], pivot) < 1e-4) {
      const next = polygon[(i + 1) % polygon.length];
      const prev = polygon[(i - 1 + polygon.length) % polygon.length];
      const aNext = Math.atan2(next.y - pivot.y, next.x - pivot.x);
      const aPrev = Math.atan2(prev.y - pivot.y, prev.x - pivot.x);
      const ccwSpan = ((aNext - aPrev) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      // Pick whichever of aPrev or aNext enters interior via CCW sweep
      const start = ccwSpan <= Math.PI ? aPrev : aNext;
      return (((start * 180) / Math.PI) % 360 + 360) % 360;
    }
  }

  // Otherwise start opposite the centroid direction so [0, 360] enters symmetrically
  const c = polygonCentroid(polygon);
  const toCentroid = Math.atan2(c.y - pivot.y, c.x - pivot.x);
  const oppositeDeg = (((toCentroid + Math.PI) * 180) / Math.PI + 360) % 360;
  return oppositeDeg;
}

export function recomputePartitionFromLinearOffsets(
  polygon: Point2D[],
  mode: PartitionDivideMode,
  directionMode: 'parallel-edge' | 'perpendicular-edge',
  cutAngleDeg: number,
  cutOffsets: number[],
  shares: NormalizedPartitionShare[]
): PartitionComputationResult {
  const totalAreaSqFt = polygonAreaSqFt(polygon);
  const bbox = bboxFromPoints(polygon) || { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const maxDim = Math.max(100, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
  const spanExtent = maxDim * 12;

  const rad = (cutAngleDeg * Math.PI) / 180;
  const normal: Point2D = { x: -Math.sin(rad), y: Math.cos(rad) };
  const tangent: Point2D = { x: Math.cos(rad), y: Math.sin(rad) };

  let minProj = Infinity;
  let maxProj = -Infinity;
  for (const p of polygon) {
    const proj = p.x * normal.x + p.y * normal.y;
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }

  const subject = toClosedClippingPoly(polygon);
  const bounds = [minProj - 1, ...cutOffsets, maxProj + 1];
  const parts: PartitionPartResult[] = [];

  for (let i = 0; i < shares.length; i++) {
    const share = shares[i];
    const d0 = bounds[i];
    const d1 = bounds[i + 1];
    const clipped = clipWithStripBand(subject, normal, tangent, d0, d1, spanExtent);
    const { rings, primaryRing, areaSqFt } = extractRingsAndArea(clipped);
    const centroid =
      primaryRing.length >= 3 ? polygonCentroid(primaryRing) : polygonCentroid(polygon);

    parts.push({
      id: share.id,
      name: share.name,
      shareLabel: share.shareLabel,
      color: share.color,
      targetAreaSqFt: share.targetAreaSqFt,
      actualAreaSqFt: areaSqFt,
      areaErrorSqFt: areaSqFt - share.targetAreaSqFt,
      fraction: totalAreaSqFt > 1e-9 ? areaSqFt / totalAreaSqFt : 0,
      percent: totalAreaSqFt > 1e-9 ? (areaSqFt / totalAreaSqFt) * 100 : 0,
      primaryRing,
      rings,
      sideLengthsFt: buildPartSideLengths(primaryRing),
      perimeterFt: primaryRing.length >= 3 ? polygonPerimeterFt(primaryRing, true) : 0,
      centroid,
    });
  }

  const splitLines: PartitionSplitLineInfo[] = cutOffsets.map((d, idx) => {
    const segments = extractLinearSplitSegments(polygon, normal, tangent, d);
    const primarySeg = segments[0];
    const handlePoint: Point2D = primarySeg
      ? {
          x: (primarySeg.a.x + primarySeg.b.x) / 2,
          y: (primarySeg.a.y + primarySeg.b.y) / 2,
        }
      : {
          x: normal.x * d,
          y: normal.y * d,
        };
    return {
      index: idx,
      segments,
      handlePoint,
      positionValue: d,
    };
  });

  const maxAreaErrorSqFt = parts.reduce(
    (mx, p) => Math.max(mx, Math.abs(p.areaErrorSqFt)),
    0
  );

  return {
    mode,
    directionMode,
    totalAreaSqFt,
    cutAngleDeg,
    pivotPoint: null,
    radialStartAngleDeg: 0,
    minLinearProj: minProj,
    maxLinearProj: maxProj,
    cutPositions: [...cutOffsets],
    splitLines,
    parts,
    maxAreaErrorSqFt,
  };
}

export function recomputePartitionFromRadialAngles(
  polygon: Point2D[],
  mode: PartitionDivideMode,
  pivot: Point2D,
  startAngleDeg: number,
  sweepAnglesDeg: number[],
  shares: NormalizedPartitionShare[]
): PartitionComputationResult {
  const totalAreaSqFt = polygonAreaSqFt(polygon);
  const bbox = bboxFromPoints([...polygon, pivot]) || {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
  };
  const radius = Math.max(100, Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)) * 12;

  const subject = toClosedClippingPoly(polygon);
  const bounds = [0, ...sweepAnglesDeg, 360];
  const parts: PartitionPartResult[] = [];

  for (let i = 0; i < shares.length; i++) {
    const share = shares[i];
    const a0Deg = startAngleDeg + bounds[i];
    const sweep = Math.max(0, bounds[i + 1] - bounds[i]);
    const sector = buildRadialSectorMultiPolygon(
      pivot,
      (a0Deg * Math.PI) / 180,
      (sweep * Math.PI) / 180,
      radius
    );
    const clipped = sector.length > 0 ? polygonClipping.intersection(subject, sector) : [];
    const { rings, primaryRing, areaSqFt } = extractRingsAndArea(clipped);
    const centroid =
      primaryRing.length >= 3 ? polygonCentroid(primaryRing) : { ...pivot };

    parts.push({
      id: share.id,
      name: share.name,
      shareLabel: share.shareLabel,
      color: share.color,
      targetAreaSqFt: share.targetAreaSqFt,
      actualAreaSqFt: areaSqFt,
      areaErrorSqFt: areaSqFt - share.targetAreaSqFt,
      fraction: totalAreaSqFt > 1e-9 ? areaSqFt / totalAreaSqFt : 0,
      percent: totalAreaSqFt > 1e-9 ? (areaSqFt / totalAreaSqFt) * 100 : 0,
      primaryRing,
      rings,
      sideLengthsFt: buildPartSideLengths(primaryRing),
      perimeterFt: primaryRing.length >= 3 ? polygonPerimeterFt(primaryRing, true) : 0,
      centroid,
    });
  }

  const splitLines: PartitionSplitLineInfo[] = sweepAnglesDeg.map((sweepDeg, idx) => {
    const angleRad = ((startAngleDeg + sweepDeg) * Math.PI) / 180;
    const segments = extractRadialRaySegments(polygon, pivot, angleRad, radius / 12);
    const primarySeg = segments[0];
    const handlePoint: Point2D = primarySeg
      ? {
          x: primarySeg.a.x + (primarySeg.b.x - primarySeg.a.x) * 0.55,
          y: primarySeg.a.y + (primarySeg.b.y - primarySeg.a.y) * 0.55,
        }
      : {
          x: pivot.x + Math.cos(angleRad) * 20,
          y: pivot.y + Math.sin(angleRad) * 20,
        };
    return {
      index: idx,
      segments,
      handlePoint,
      positionValue: sweepDeg,
    };
  });

  const maxAreaErrorSqFt = parts.reduce(
    (mx, p) => Math.max(mx, Math.abs(p.areaErrorSqFt)),
    0
  );

  return {
    mode,
    directionMode: 'radial-point',
    totalAreaSqFt,
    cutAngleDeg: 0,
    pivotPoint: { ...pivot },
    radialStartAngleDeg: startAngleDeg,
    minLinearProj: 0,
    maxLinearProj: 360,
    cutPositions: [...sweepAnglesDeg],
    splitLines,
    parts,
    maxAreaErrorSqFt,
  };
}

/**
 * Solves exact dividing lines for ANY-shape polygon (convex, concave, irregular)
 * using 60-step bisection paired with Martinez-Rueda `polygon-clipping` boolean intersection.
 */
export function solvePolygonPartition(params: {
  polygon: Point2D[];
  mode: PartitionDivideMode;
  shares: NormalizedPartitionShare[];
  directionMode: PartitionDirectionMode;
  edgeIndex?: number;
  flipDirection?: boolean;
  customCutAngleDeg?: number;
  pivotPoint?: Point2D;
  radialStartAngleDeg?: number;
}): PartitionComputationResult | null {
  const { polygon, mode, shares, directionMode } = params;
  if (polygon.length < 3 || shares.length < 2) return null;

  const totalArea = polygonAreaSqFt(polygon);
  if (totalArea <= 1e-6) return null;

  const bbox = bboxFromPoints(polygon) || { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const subject = toClosedClippingPoly(polygon);

  if (directionMode === 'radial-point') {
    const pivot = params.pivotPoint || polygonCentroid(polygon);
    const startAngleDeg =
      params.radialStartAngleDeg !== undefined
        ? params.radialStartAngleDeg
        : suggestRadialStartAngleDeg(polygon, pivot);
    const startRad = (startAngleDeg * Math.PI) / 180;
    const radBox = bboxFromPoints([...polygon, pivot]) || bbox;
    const radius =
      Math.max(100, Math.hypot(radBox.maxX - radBox.minX, radBox.maxY - radBox.minY)) * 12;

    const sweepAnglesDeg: number[] = [];
    let cumulative = 0;

    for (let i = 0; i < shares.length - 1; i++) {
      cumulative += shares[i].targetAreaSqFt;
      let lo = i > 0 ? sweepAnglesDeg[i - 1] : 0;
      let hi = 360;

      for (let iter = 0; iter < 60; iter++) {
        const mid = (lo + hi) / 2;
        const sector = buildRadialSectorMultiPolygon(
          pivot,
          startRad,
          (mid * Math.PI) / 180,
          radius
        );
        const clipped = sector.length > 0 ? polygonClipping.intersection(subject, sector) : [];
        const { areaSqFt } = extractRingsAndArea(clipped);
        if (areaSqFt < cumulative) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      sweepAnglesDeg.push((lo + hi) / 2);
    }

    return recomputePartitionFromRadialAngles(
      polygon,
      mode,
      pivot,
      startAngleDeg,
      sweepAnglesDeg,
      shares
    );
  }

  // Linear cut ('parallel-edge' or 'perpendicular-edge')
  const cutAngleDeg =
    params.customCutAngleDeg !== undefined
      ? params.customCutAngleDeg
      : computeEdgeCutAngleDeg(
          polygon,
          params.edgeIndex || 0,
          directionMode,
          Boolean(params.flipDirection)
        );

  const rad = (cutAngleDeg * Math.PI) / 180;
  const normal: Point2D = { x: -Math.sin(rad), y: Math.cos(rad) };
  const tangent: Point2D = { x: Math.cos(rad), y: Math.sin(rad) };

  let minProj = Infinity;
  let maxProj = -Infinity;
  for (const p of polygon) {
    const proj = p.x * normal.x + p.y * normal.y;
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }

  const maxDim = Math.max(100, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
  const spanExtent = maxDim * 12;

  const cutOffsets: number[] = [];
  let cumulative = 0;

  for (let i = 0; i < shares.length - 1; i++) {
    cumulative += shares[i].targetAreaSqFt;
    let lo = i > 0 ? cutOffsets[i - 1] : minProj;
    let hi = maxProj;

    for (let iter = 0; iter < 60; iter++) {
      const mid = (lo + hi) / 2;
      const clipped = clipWithStripBand(
        subject,
        normal,
        tangent,
        minProj - 1,
        mid,
        spanExtent
      );
      const { areaSqFt } = extractRingsAndArea(clipped);
      if (areaSqFt < cumulative) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    cutOffsets.push((lo + hi) / 2);
  }

  return recomputePartitionFromLinearOffsets(
    polygon,
    mode,
    directionMode,
    cutAngleDeg,
    cutOffsets,
    shares
  );
}

/**
 * Updates cut line `splitIndex` live from a pointer world coordinate `(worldPt)` during dragging.
 */
export function updatePartitionByDragPoint(
  polygon: Point2D[],
  current: PartitionComputationResult,
  splitIndex: number,
  worldPt: Point2D,
  shares: NormalizedPartitionShare[]
): PartitionComputationResult {
  if (splitIndex < 0 || splitIndex >= current.cutPositions.length) {
    return current;
  }

  if (current.directionMode === 'radial-point' && current.pivotPoint) {
    const pivot = current.pivotPoint;
    const rawDeg =
      ((Math.atan2(worldPt.y - pivot.y, worldPt.x - pivot.x) * 180) / Math.PI -
        current.radialStartAngleDeg +
        720) %
      360;

    const minBound = (splitIndex > 0 ? current.cutPositions[splitIndex - 1] : 0) + 1.5;
    const maxBound =
      (splitIndex + 1 < current.cutPositions.length
        ? current.cutPositions[splitIndex + 1]
        : 360) - 1.5;

    if (minBound >= maxBound) return current;

    // Handle wrap-around smoothly if pointer slightly crosses 0/360 near boundaries
    let clamped = rawDeg;
    if (clamped < minBound && Math.abs(clamped + 360 - maxBound) < Math.abs(clamped - minBound)) {
      clamped = maxBound;
    }
    clamped = Math.max(minBound, Math.min(maxBound, clamped));

    const nextAngles = [...current.cutPositions];
    nextAngles[splitIndex] = clamped;
    return recomputePartitionFromRadialAngles(
      polygon,
      current.mode,
      pivot,
      current.radialStartAngleDeg,
      nextAngles,
      shares
    );
  }

  // Linear drag
  const rad = (current.cutAngleDeg * Math.PI) / 180;
  const normal: Point2D = { x: -Math.sin(rad), y: Math.cos(rad) };
  const proj = worldPt.x * normal.x + worldPt.y * normal.y;
  const span = Math.max(0.5, current.maxLinearProj - current.minLinearProj);
  const pad = Math.min(0.5, span * 0.02);

  const minBound =
    (splitIndex > 0 ? current.cutPositions[splitIndex - 1] : current.minLinearProj) + pad;
  const maxBound =
    (splitIndex + 1 < current.cutPositions.length
      ? current.cutPositions[splitIndex + 1]
      : current.maxLinearProj) - pad;

  if (minBound >= maxBound) return current;

  const nextOffsets = [...current.cutPositions];
  nextOffsets[splitIndex] = Math.max(minBound, Math.min(maxBound, proj));
  return recomputePartitionFromLinearOffsets(
    polygon,
    current.mode,
    current.directionMode === 'perpendicular-edge' ? 'perpendicular-edge' : 'parallel-edge',
    current.cutAngleDeg,
    nextOffsets,
    shares
  );
}

export function formatPartitionPartMetrics(
  part: PartitionPartResult,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
) {
  return computeAreaBreakdown(part.actualAreaSqFt, profile);
}
