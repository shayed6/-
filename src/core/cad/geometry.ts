import {
  BBox,
  Point2D,
  bboxFromPoints,
  distance2D,
  mergeBBoxes,
  midpoint2D,
  rotatePoint2D,
  scalePoint2D,
} from '../survey/coordinates';
import { polygonAreaSqFt, polygonSignedAreaSqFt } from '../survey/area';
import { isEntityVisible } from './entities';
import { CadDocument, CadEntity, CadLayer, RasterLayer, RasterTransform } from './types';

export type { BBox };
export { mergeBBoxes };

export interface Segment2D {
  a: Point2D;
  b: Point2D;
  entityId: string;
}

const TWO_PI = Math.PI * 2;

export function normalizeAngleRad(rad: number): number {
  const m = rad % TWO_PI;
  return m < 0 ? m + TWO_PI : m;
}

export interface ArcSolveResult {
  center: Point2D;
  radiusFt: number;
  startAngleRad: number;
  endAngleRad: number;
  anticlockwise: boolean;
}

/**
 * Solves a circular arc passing from p1 through p2 to p3 in world coordinates (+Y up).
 * Returns null if the 3 points are collinear or degenerate.
 */
export function arcFromThreePoints(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D
): ArcSolveResult | null {
  const d =
    2 *
    (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-9) return null;

  const p1Sq = p1.x * p1.x + p1.y * p1.y;
  const p2Sq = p2.x * p2.x + p2.y * p2.y;
  const p3Sq = p3.x * p3.x + p3.y * p3.y;

  const cx =
    (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d;
  const cy =
    (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d;

  const center = { x: cx, y: cy };
  const radiusFt = distance2D(center, p1);
  if (!Number.isFinite(radiusFt) || radiusFt < 1e-6) return null;

  const a1 = Math.atan2(p1.y - cy, p1.x - cx);
  const a2 = Math.atan2(p2.y - cy, p2.x - cx);
  const a3 = Math.atan2(p3.y - cy, p3.x - cx);

  const ccw12 = normalizeAngleRad(a2 - a1);
  const ccw13 = normalizeAngleRad(a3 - a1);
  const anticlockwise = ccw12 < ccw13;

  return {
    center,
    radiusFt,
    startAngleRad: a1,
    endAngleRad: a3,
    anticlockwise,
  };
}

export function arcPointAt(
  center: Point2D,
  radiusFt: number,
  angleRad: number
): Point2D {
  return {
    x: center.x + radiusFt * Math.cos(angleRad),
    y: center.y + radiusFt * Math.sin(angleRad),
  };
}

export function arcSweepAngleRad(
  startAngleRad: number,
  endAngleRad: number,
  anticlockwise = true
): number {
  const span = anticlockwise
    ? normalizeAngleRad(endAngleRad - startAngleRad)
    : normalizeAngleRad(startAngleRad - endAngleRad);
  return span < 1e-9 ? TWO_PI : span;
}

export function arcLengthFt(
  radiusFt: number,
  startAngleRad: number,
  endAngleRad: number,
  anticlockwise = true
): number {
  return radiusFt * arcSweepAngleRad(startAngleRad, endAngleRad, anticlockwise);
}

export function arcMidpoint(
  center: Point2D,
  radiusFt: number,
  startAngleRad: number,
  endAngleRad: number,
  anticlockwise = true
): Point2D {
  const sweep = arcSweepAngleRad(startAngleRad, endAngleRad, anticlockwise);
  const midAngle = anticlockwise
    ? startAngleRad + sweep / 2
    : startAngleRad - sweep / 2;
  return arcPointAt(center, radiusFt, midAngle);
}

export function isAngleOnArc(
  angleRad: number,
  startAngleRad: number,
  endAngleRad: number,
  anticlockwise = true
): boolean {
  const sweep = arcSweepAngleRad(startAngleRad, endAngleRad, anticlockwise);
  const delta = anticlockwise
    ? normalizeAngleRad(angleRad - startAngleRad)
    : normalizeAngleRad(startAngleRad - angleRad);
  return delta <= sweep + 1e-9 || Math.abs(delta - TWO_PI) <= 1e-9;
}

export function sampleArcPoints(
  center: Point2D,
  radiusFt: number,
  startAngleRad: number,
  endAngleRad: number,
  anticlockwise = true,
  segments = 32
): Point2D[] {
  const sweep = arcSweepAngleRad(startAngleRad, endAngleRad, anticlockwise);
  const dir = anticlockwise ? 1 : -1;
  const pts: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push(arcPointAt(center, radiusFt, startAngleRad + dir * sweep * t));
  }
  return pts;
}

export function closestPointOnArc(
  p: Point2D,
  center: Point2D,
  radiusFt: number,
  startAngleRad: number,
  endAngleRad: number,
  anticlockwise = true
): Point2D {
  const ang = Math.atan2(p.y - center.y, p.x - center.x);
  if (isAngleOnArc(ang, startAngleRad, endAngleRad, anticlockwise)) {
    return arcPointAt(center, radiusFt, ang);
  }
  const s = arcPointAt(center, radiusFt, startAngleRad);
  const e = arcPointAt(center, radiusFt, endAngleRad);
  return distance2D(p, s) <= distance2D(p, e) ? s : e;
}

export function pointToArcDistance(
  p: Point2D,
  center: Point2D,
  radiusFt: number,
  startAngleRad: number,
  endAngleRad: number,
  anticlockwise = true
): number {
  return distance2D(
    p,
    closestPointOnArc(p, center, radiusFt, startAngleRad, endAngleRad, anticlockwise)
  );
}

export function closestPointOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { ...a };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  return distance2D(p, closestPointOnSegment(p, a, b));
}

/**
 * Computes the perpendicular foot from a point P onto segment A-B.
 * Returns null if the perpendicular projection falls outside [A, B].
 */
export function perpendicularFootOnSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): Point2D | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  const clamped = Math.max(0, Math.min(1, t));
  return { x: a.x + clamped * dx, y: a.y + clamped * dy };
}

export function segmentIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D
): Point2D | null {
  const rX = a2.x - a1.x;
  const rY = a2.y - a1.y;
  const sX = b2.x - b1.x;
  const sY = b2.y - b1.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-10) return null;
  const qpX = b1.x - a1.x;
  const qpY = b1.y - a1.y;
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;
  if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
    return {
      x: a1.x + t * rX,
      y: a1.y + t * rY,
    };
  }
  return null;
}

export function pointInPolygon(p: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getEntityVertices(entity: CadEntity): Point2D[] {
  switch (entity.kind) {
    case 'line':
      return [entity.start, entity.end];
    case 'polyline':
    case 'polygon':
    case 'rectangle':
      return entity.points;
    case 'circle':
      return [
        { x: entity.center.x + entity.radiusFt, y: entity.center.y },
        { x: entity.center.x - entity.radiusFt, y: entity.center.y },
        { x: entity.center.x, y: entity.center.y + entity.radiusFt },
        { x: entity.center.x, y: entity.center.y - entity.radiusFt },
      ];
    case 'arc':
      return [
        arcPointAt(entity.center, entity.radiusFt, entity.startAngleRad),
        arcPointAt(entity.center, entity.radiusFt, entity.endAngleRad),
      ];
    case 'point':
    case 'text':
      return [entity.position];
    case 'dimension':
      return [entity.start, entity.end];
  }
}

export function getEntityCenters(entity: CadEntity): Point2D[] {
  switch (entity.kind) {
    case 'circle':
    case 'arc':
      return [entity.center];
    case 'rectangle':
      return [
        {
          x: (entity.min.x + entity.max.x) / 2,
          y: (entity.min.y + entity.max.y) / 2,
        },
      ];
    case 'polygon': {
      if (entity.points.length === 0) return [];
      const sum = entity.points.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        { x: 0, y: 0 }
      );
      return [{ x: sum.x / entity.points.length, y: sum.y / entity.points.length }];
    }
    default:
      return [];
  }
}

export function getEntitySegments(entity: CadEntity): Segment2D[] {
  const segs: Segment2D[] = [];
  if (entity.kind === 'line') {
    segs.push({ a: entity.start, b: entity.end, entityId: entity.id });
  } else if (entity.kind === 'polyline') {
    for (let i = 0; i < entity.points.length - 1; i++) {
      segs.push({ a: entity.points[i], b: entity.points[i + 1], entityId: entity.id });
    }
    if (entity.closed && entity.points.length > 2) {
      segs.push({
        a: entity.points[entity.points.length - 1],
        b: entity.points[0],
        entityId: entity.id,
      });
    }
  } else if (entity.kind === 'polygon' || entity.kind === 'rectangle') {
    for (let i = 0; i < entity.points.length; i++) {
      segs.push({
        a: entity.points[i],
        b: entity.points[(i + 1) % entity.points.length],
        entityId: entity.id,
      });
    }
  } else if (entity.kind === 'arc') {
    const pts = sampleArcPoints(
      entity.center,
      entity.radiusFt,
      entity.startAngleRad,
      entity.endAngleRad,
      entity.anticlockwise ?? true,
      16
    );
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ a: pts[i], b: pts[i + 1], entityId: entity.id });
    }
  } else if (entity.kind === 'dimension') {
    segs.push({ a: entity.start, b: entity.end, entityId: entity.id });
  }
  return segs;
}

export function getEntityMidpoints(entity: CadEntity): Point2D[] {
  if (entity.kind === 'arc') {
    return [
      arcMidpoint(
        entity.center,
        entity.radiusFt,
        entity.startAngleRad,
        entity.endAngleRad,
        entity.anticlockwise ?? true
      ),
    ];
  }
  return getEntitySegments(entity).map((s) => midpoint2D(s.a, s.b));
}

export function getEntityBBox(entity: CadEntity): BBox | null {
  if (entity.kind === 'circle') {
    return {
      minX: entity.center.x - entity.radiusFt,
      minY: entity.center.y - entity.radiusFt,
      maxX: entity.center.x + entity.radiusFt,
      maxY: entity.center.y + entity.radiusFt,
    };
  }
  if (entity.kind === 'arc') {
    const pts = [
      arcPointAt(entity.center, entity.radiusFt, entity.startAngleRad),
      arcPointAt(entity.center, entity.radiusFt, entity.endAngleRad),
    ];
    for (const card of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      if (
        isAngleOnArc(
          card,
          entity.startAngleRad,
          entity.endAngleRad,
          entity.anticlockwise ?? true
        )
      ) {
        pts.push(arcPointAt(entity.center, entity.radiusFt, card));
      }
    }
    return bboxFromPoints(pts);
  }
  if (entity.kind === 'text') {
    const approxW = Math.max(entity.heightFt * 2, entity.text.length * entity.heightFt * 0.65);
    return {
      minX: entity.position.x - 1,
      minY: entity.position.y - entity.heightFt,
      maxX: entity.position.x + approxW,
      maxY: entity.position.y + entity.heightFt,
    };
  }
  return bboxFromPoints(getEntityVertices(entity));
}

export function bboxesOverlap(a: BBox, b: BBox): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function bboxInsideBox(inner: BBox, outer: BBox): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

function pointInBox(p: Point2D, box: BBox): boolean {
  return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
}

function segmentIntersectsBox(a: Point2D, b: Point2D, box: BBox): boolean {
  if (pointInBox(a, box) || pointInBox(b, box)) return true;
  const c1 = { x: box.minX, y: box.minY };
  const c2 = { x: box.maxX, y: box.minY };
  const c3 = { x: box.maxX, y: box.maxY };
  const c4 = { x: box.minX, y: box.maxY };
  return (
    segmentIntersection(a, b, c1, c2) !== null ||
    segmentIntersection(a, b, c2, c3) !== null ||
    segmentIntersection(a, b, c3, c4) !== null ||
    segmentIntersection(a, b, c4, c1) !== null
  );
}

export function entityIntersectsBox(entity: CadEntity, box: BBox): boolean {
  const eb = getEntityBBox(entity);
  if (!eb || !bboxesOverlap(eb, box)) return false;
  if (bboxInsideBox(eb, box)) return true;

  if (entity.kind === 'point' || entity.kind === 'text') {
    return pointInBox(entity.position, box);
  }
  if (entity.kind === 'circle') {
    const cx = Math.max(box.minX, Math.min(box.maxX, entity.center.x));
    const cy = Math.max(box.minY, Math.min(box.maxY, entity.center.y));
    return distance2D(entity.center, { x: cx, y: cy }) <= entity.radiusFt + 1e-6;
  }
  const segs = getEntitySegments(entity);
  if (segs.some((s) => segmentIntersectsBox(s.a, s.b, box))) return true;
  if (entity.kind === 'polygon' || entity.kind === 'rectangle') {
    const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    if (pointInPolygon(center, entity.points)) return true;
  }
  return false;
}

export function selectEntitiesInBox(
  entities: CadEntity[],
  box: BBox,
  mode: 'window' | 'crossing',
  layers?: CadLayer[]
): CadEntity[] {
  return entities.filter((ent) => {
    if (!isEntityVisible(ent, layers)) return false;
    const eb = getEntityBBox(ent);
    if (!eb) return false;
    return mode === 'window'
      ? bboxInsideBox(eb, box)
      : entityIntersectsBox(ent, box);
  });
}

export function rasterPixelToWorld(px: Point2D, t: RasterTransform): Point2D {
  // Image coordinates have +Y downwards; world coordinates have +Y upwards
  const sx = px.x * t.scaleFtPerPx;
  const sy = -px.y * t.scaleFtPerPx;
  const cos = Math.cos(t.rotationRad);
  const sin = Math.sin(t.rotationRad);
  return {
    x: t.tx + sx * cos - sy * sin,
    y: t.ty + sx * sin + sy * cos,
  };
}

export function worldToRasterPixel(world: Point2D, t: RasterTransform): Point2D {
  const dx = world.x - t.tx;
  const dy = world.y - t.ty;
  const cos = Math.cos(-t.rotationRad);
  const sin = Math.sin(-t.rotationRad);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return {
    x: rx / t.scaleFtPerPx,
    y: -ry / t.scaleFtPerPx,
  };
}

export function getRasterLayerBBox(layer: RasterLayer): BBox | null {
  const corners = [
    rasterPixelToWorld({ x: 0, y: 0 }, layer.transform),
    rasterPixelToWorld({ x: layer.widthPx, y: 0 }, layer.transform),
    rasterPixelToWorld({ x: layer.widthPx, y: layer.heightPx }, layer.transform),
    rasterPixelToWorld({ x: 0, y: layer.heightPx }, layer.transform),
  ];
  return bboxFromPoints(corners);
}

export function getDocumentBBox(doc: CadDocument): BBox | null {
  const entityBoxes = doc.entities.map(getEntityBBox);
  const rasterBoxes = doc.rasterLayers
    .filter((r) => r.visible)
    .map(getRasterLayerBBox);
  return mergeBBoxes([...entityBoxes, ...rasterBoxes]);
}

export function hitTestEntity(
  entity: CadEntity,
  worldPoint: Point2D,
  toleranceFt: number,
  layers?: CadLayer[]
): boolean {
  if (!isEntityVisible(entity, layers)) return false;
  switch (entity.kind) {
    case 'point':
      return distance2D(worldPoint, entity.position) <= toleranceFt * 1.3;
    case 'text':
      return (
        distance2D(worldPoint, entity.position) <=
        Math.max(toleranceFt * 1.5, entity.heightFt * 2)
      );
    case 'circle': {
      const distFromCenter = distance2D(worldPoint, entity.center);
      return (
        Math.abs(distFromCenter - entity.radiusFt) <= toleranceFt ||
        distFromCenter <= toleranceFt
      );
    }
    case 'arc': {
      const d = pointToArcDistance(
        worldPoint,
        entity.center,
        entity.radiusFt,
        entity.startAngleRad,
        entity.endAngleRad,
        entity.anticlockwise ?? true
      );
      return d <= toleranceFt;
    }
    case 'line':
    case 'polyline':
    case 'dimension': {
      const segs = getEntitySegments(entity);
      return segs.some(
        (s) => pointToSegmentDistance(worldPoint, s.a, s.b) <= toleranceFt
      );
    }
    case 'polygon':
    case 'rectangle': {
      const segs = getEntitySegments(entity);
      if (
        segs.some((s) => pointToSegmentDistance(worldPoint, s.a, s.b) <= toleranceFt)
      ) {
        return true;
      }
      return pointInPolygon(worldPoint, entity.points);
    }
  }
}

export function transformEntity(
  entity: CadEntity,
  fn: (p: Point2D) => Point2D,
  scaleFactor = 1,
  angleDeltaRad = 0
): CadEntity {
  switch (entity.kind) {
    case 'line': {
      const start = fn(entity.start);
      const end = fn(entity.end);
      return { ...entity, start, end, geometry: { start, end } };
    }
    case 'polyline': {
      const points = entity.points.map(fn);
      return {
        ...entity,
        points,
        geometry: { points, closed: entity.closed },
      };
    }
    case 'polygon': {
      const points = entity.points.map(fn);
      return { ...entity, points, geometry: { points } };
    }
    case 'rectangle': {
      const points = entity.points.map(fn);
      const b = bboxFromPoints(points) || {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
      };
      const min = { x: b.minX, y: b.minY };
      const max = { x: b.maxX, y: b.maxY };
      return { ...entity, min, max, points, geometry: { min, max, points } };
    }
    case 'circle': {
      const center = fn(entity.center);
      const radiusFt = entity.radiusFt * Math.abs(scaleFactor);
      return {
        ...entity,
        center,
        radiusFt,
        geometry: { center, radiusFt },
      };
    }
    case 'arc': {
      const center = fn(entity.center);
      const radiusFt = entity.radiusFt * Math.abs(scaleFactor);
      const startAngleRad = entity.startAngleRad + angleDeltaRad;
      const endAngleRad = entity.endAngleRad + angleDeltaRad;
      return {
        ...entity,
        center,
        radiusFt,
        startAngleRad,
        endAngleRad,
        threePoints: entity.threePoints
          ? [
              fn(entity.threePoints[0]),
              fn(entity.threePoints[1]),
              fn(entity.threePoints[2]),
            ]
          : undefined,
        geometry: {
          center,
          radiusFt,
          startAngleRad,
          endAngleRad,
          anticlockwise: entity.anticlockwise,
        },
      };
    }
    case 'point': {
      const position = fn(entity.position);
      return { ...entity, position, geometry: { position } };
    }
    case 'text': {
      const position = fn(entity.position);
      const heightFt = entity.heightFt * Math.abs(scaleFactor);
      const rotationDeg =
        (entity.rotationDeg || 0) + (angleDeltaRad * 180) / Math.PI;
      return {
        ...entity,
        position,
        heightFt,
        rotationDeg,
        geometry: {
          position,
          text: entity.text,
          heightFt,
          rotationDeg,
        },
      };
    }
    case 'dimension': {
      const start = fn(entity.start);
      const end = fn(entity.end);
      const offsetFt = entity.offsetFt * Math.abs(scaleFactor);
      return {
        ...entity,
        start,
        end,
        offsetFt,
        geometry: { start, end, offsetFt },
      };
    }
  }
}

export function translateEntity(
  entity: CadEntity,
  dx: number,
  dy: number
): CadEntity {
  return transformEntity(entity, (p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function rotateEntity(
  entity: CadEntity,
  origin: Point2D,
  angleRad: number
): CadEntity {
  return transformEntity(
    entity,
    (p) => rotatePoint2D(p, origin, angleRad),
    1,
    angleRad
  );
}

export function scaleEntity(
  entity: CadEntity,
  origin: Point2D,
  factor: number
): CadEntity {
  return transformEntity(
    entity,
    (p) => scalePoint2D(p, origin, factor),
    factor,
    0
  );
}

/**
 * Offsets a closed polygon outward (positive offsetFt) or inward (negative offsetFt).
 */
export function offsetPolygon(points: Point2D[], offsetFt: number): Point2D[] {
  if (points.length < 3 || Math.abs(offsetFt) < 1e-9)
    return points.map((p) => ({ ...p }));
  const ccw = polygonSignedAreaSqFt(points) >= 0;
  const sign = ccw ? 1 : -1;
  const n = points.length;
  const offsetLines: Array<{ a: Point2D; b: Point2D }> = [];

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = (dy / len) * sign;
    const ny = (-dx / len) * sign;
    offsetLines.push({
      a: { x: p1.x + nx * offsetFt, y: p1.y + ny * offsetFt },
      b: { x: p2.x + nx * offsetFt, y: p2.y + ny * offsetFt },
    });
  }

  if (offsetLines.length < 3) return points.map((p) => ({ ...p }));

  const result: Point2D[] = [];
  for (let i = 0; i < offsetLines.length; i++) {
    const l1 = offsetLines[(i - 1 + offsetLines.length) % offsetLines.length];
    const l2 = offsetLines[i];
    const rX = l1.b.x - l1.a.x;
    const rY = l1.b.y - l1.a.y;
    const sX = l2.b.x - l2.a.x;
    const sY = l2.b.y - l2.a.y;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-9) {
      result.push({ ...l2.a });
    } else {
      const qpX = l2.a.x - l1.a.x;
      const qpY = l2.a.y - l1.a.y;
      const t = (qpX * sY - qpY * sX) / denom;
      result.push({ x: l1.a.x + t * rX, y: l1.a.y + t * rY });
    }
  }
  return result;
}

/**
 * Clips a polygon against the half-plane: dot(p - lineOrigin, normal) >= 0.
 */
export function clipPolygonHalfPlane(
  points: Point2D[],
  lineOrigin: Point2D,
  normal: Point2D
): Point2D[] {
  if (points.length < 3) return [];
  const signedDist = (p: Point2D) =>
    (p.x - lineOrigin.x) * normal.x + (p.y - lineOrigin.y) * normal.y;

  const output: Point2D[] = [];
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const prev = points[(i - 1 + points.length) % points.length];
    const dCurr = signedDist(curr);
    const dPrev = signedDist(prev);
    const currIn = dCurr >= -1e-9;
    const prevIn = dPrev >= -1e-9;

    if (currIn !== prevIn) {
      const t = dPrev / (dPrev - dCurr);
      output.push({
        x: prev.x + t * (curr.x - prev.x),
        y: prev.y + t * (curr.y - prev.y),
      });
    }
    if (currIn) {
      output.push({ ...curr });
    }
  }
  return dedupeClosePoints(output);
}

function dedupeClosePoints(pts: Point2D[], eps = 1e-6): Point2D[] {
  if (pts.length === 0) return [];
  const res: Point2D[] = [];
  for (const p of pts) {
    if (res.length === 0 || distance2D(res[res.length - 1], p) > eps) {
      res.push(p);
    }
  }
  if (res.length > 2 && distance2D(res[0], res[res.length - 1]) <= eps) {
    res.pop();
  }
  return res;
}

/**
 * Splits a polygon by an infinite line passing through A and B.
 */
export function splitPolygonByLine(
  points: Point2D[],
  a: Point2D,
  b: Point2D
): [Point2D[], Point2D[]] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [points, []];
  const normalLeft = { x: -dy / len, y: dx / len };
  const normalRight = { x: dy / len, y: -dx / len };
  return [
    clipPolygonHalfPlane(points, a, normalLeft),
    clipPolygonHalfPlane(points, a, normalRight),
  ];
}

/**
 * Cuts an exact targetAreaSqFt from a polygon using a straight cut line oriented
 * along cutAngleDeg (0 = horizontal East-West cut, 90 = vertical North-South cut).
 */
export function splitPolygonByTargetArea(
  points: Point2D[],
  targetAreaSqFt: number,
  cutAngleDeg = 0
): [Point2D[], Point2D[]] | null {
  const totalArea = polygonAreaSqFt(points);
  if (points.length < 3 || totalArea <= 1e-6) return null;
  if (targetAreaSqFt <= 1e-6 || targetAreaSqFt >= totalArea - 1e-6) return null;

  const rad = (cutAngleDeg * Math.PI) / 180;
  const normal: Point2D = { x: -Math.sin(rad), y: Math.cos(rad) };

  let minProj = Infinity;
  let maxProj = -Infinity;
  for (const p of points) {
    const proj = p.x * normal.x + p.y * normal.y;
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }

  let lo = minProj;
  let hi = maxProj;
  const normalKeep: Point2D = { x: -normal.x, y: -normal.y };

  for (let iter = 0; iter < 54; iter++) {
    const mid = (lo + hi) / 2;
    const origin = { x: normal.x * mid, y: normal.y * mid };
    const piece = clipPolygonHalfPlane(points, origin, normalKeep);
    const area = polygonAreaSqFt(piece);
    if (area < targetAreaSqFt) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const finalD = (lo + hi) / 2;
  const origin = { x: normal.x * finalD, y: normal.y * finalD };
  const pieceA = clipPolygonHalfPlane(points, origin, normalKeep);
  const pieceB = clipPolygonHalfPlane(points, origin, normal);
  if (pieceA.length < 3 || pieceB.length < 3) return null;
  return [pieceA, pieceB];
}

/**
 * Partitions a polygon into N equal-area sub-polygons along cutAngleDeg.
 */
export function partitionPolygonEqualParts(
  points: Point2D[],
  parts: number,
  cutAngleDeg = 0
): Point2D[][] {
  if (parts <= 1 || points.length < 3) return [points];
  const totalArea = polygonAreaSqFt(points);
  const partArea = totalArea / parts;
  const result: Point2D[][] = [];
  let remaining = points;

  for (let i = 0; i < parts - 1; i++) {
    const split = splitPolygonByTargetArea(remaining, partArea, cutAngleDeg);
    if (!split) break;
    result.push(split[0]);
    remaining = split[1];
  }
  if (remaining.length >= 3) {
    result.push(remaining);
  }
  return result;
}

/**
 * Solves a 2-point similarity transform (translation, uniform scale, rotation)
 * mapping two raster pixel coordinates (p1Px, p2Px) to two world points in feet (w1Ft, w2Ft).
 */
export function solveRasterTransformFromTwoPoints(
  p1Px: Point2D,
  p2Px: Point2D,
  w1Ft: Point2D,
  w2Ft: Point2D
): RasterTransform | null {
  const ip1 = { x: p1Px.x, y: -p1Px.y };
  const ip2 = { x: p2Px.x, y: -p2Px.y };
  const dImg = distance2D(ip1, ip2);
  const dWorld = distance2D(w1Ft, w2Ft);
  if (dImg < 1e-6 || dWorld < 1e-6) return null;

  const scaleFtPerPx = dWorld / dImg;
  const imgAngle = Math.atan2(ip2.y - ip1.y, ip2.x - ip1.x);
  const worldAngle = Math.atan2(w2Ft.y - w1Ft.y, w2Ft.x - w1Ft.x);
  const rotationRad = worldAngle - imgAngle;

  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const rx = ip1.x * scaleFtPerPx;
  const ry = ip1.y * scaleFtPerPx;
  const tx = w1Ft.x - (rx * cos - ry * sin);
  const ty = w1Ft.y - (rx * sin + ry * cos);

  return { tx, ty, scaleFtPerPx, rotationRad };
}

export interface AlignmentControlPairInput {
  baseWorld: Point2D;
  overlayPx: Point2D;
}

export interface RasterAlignmentSolveResult {
  transform: RasterTransform;
  method: 'similarity-2pt' | 'least-squares';
  residualsFt: number[];
  rmsErrorFt: number;
  maxErrorFt: number;
  highErrorWarning: boolean;
}

/**
 * Solves a 2D similarity transform (tx, ty, uniform scaleFtPerPx, rotationRad)
 * mapping overlay raster pixel coordinates (overlayPx) to world feet (baseWorld).
 * - For exactly 2 point pairs: uses direct 2-point similarity transform.
 * - For 3 or more point pairs: uses closed-form least-squares 2D Helmert similarity fit.
 * Computes residual per point and RMS error in world feet.
 */
export function solveRasterAlignmentFromPairs(
  pairs: AlignmentControlPairInput[],
  highErrorThresholdFt = 3.0
): RasterAlignmentSolveResult | null {
  if (pairs.length < 2) return null;

  let transform: RasterTransform | null = null;
  let method: 'similarity-2pt' | 'least-squares';

  if (pairs.length === 2) {
    method = 'similarity-2pt';
    transform = solveRasterTransformFromTwoPoints(
      pairs[0].overlayPx,
      pairs[1].overlayPx,
      pairs[0].baseWorld,
      pairs[1].baseWorld
    );
  } else {
    method = 'least-squares';
    const n = pairs.length;
    let sumIx = 0;
    let sumIy = 0;
    let sumWx = 0;
    let sumWy = 0;

    for (const pair of pairs) {
      sumIx += pair.overlayPx.x;
      sumIy += -pair.overlayPx.y;
      sumWx += pair.baseWorld.x;
      sumWy += pair.baseWorld.y;
    }

    const meanIx = sumIx / n;
    const meanIy = sumIy / n;
    const meanWx = sumWx / n;
    const meanWy = sumWy / n;

    let denom = 0;
    let numA = 0;
    let numB = 0;

    for (const pair of pairs) {
      const ux = pair.overlayPx.x - meanIx;
      const uy = -pair.overlayPx.y - meanIy;
      const vx = pair.baseWorld.x - meanWx;
      const vy = pair.baseWorld.y - meanWy;

      denom += ux * ux + uy * uy;
      numA += ux * vx + uy * vy;
      numB += ux * vy - uy * vx;
    }

    if (denom < 1e-12) return null;

    const a = numA / denom;
    const b = numB / denom;
    const scaleFtPerPx = Math.hypot(a, b);
    if (!Number.isFinite(scaleFtPerPx) || scaleFtPerPx < 1e-9) return null;

    const rotationRad = Math.atan2(b, a);
    const tx = meanWx - (a * meanIx - b * meanIy);
    const ty = meanWy - (b * meanIx + a * meanIy);

    transform = { tx, ty, scaleFtPerPx, rotationRad };
  }

  if (!transform) return null;

  const residualsFt = pairs.map((pair) => {
    const mapped = rasterPixelToWorld(pair.overlayPx, transform!);
    return distance2D(mapped, pair.baseWorld);
  });

  const sumSq = residualsFt.reduce((acc, r) => acc + r * r, 0);
  const rmsErrorFt = Math.sqrt(sumSq / residualsFt.length);
  const maxErrorFt = Math.max(...residualsFt);

  return {
    transform,
    method,
    residualsFt,
    rmsErrorFt,
    maxErrorFt,
    highErrorWarning: rmsErrorFt > highErrorThresholdFt || maxErrorFt > highErrorThresholdFt * 1.6,
  };
}

