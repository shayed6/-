import { Point2D, distance2D } from '../survey/coordinates';
import { isEntityVisible } from './entities';
import {
  closestPointOnSegment,
  getEntityCenters,
  getEntityMidpoints,
  getEntitySegments,
  getEntityVertices,
  perpendicularFootOnSegment,
  pointToSegmentDistance,
  segmentIntersection,
} from './geometry';
import { CadSpatialIndex } from './spatialIndex';
import { CadEntity, CadLayer } from './types';

export type SnapType =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'intersection'
  | 'perpendicular'
  | 'nearest'
  | 'grid';

export interface SnapConfig {
  enabled: boolean;
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  intersection: boolean;
  perpendicular: boolean;
  nearest: boolean;
  grid: boolean;
  gridStepFt: number;
  tolerancePx: number;
  ortho: boolean;
}

export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  enabled: true,
  endpoint: true,
  midpoint: true,
  center: true,
  intersection: true,
  perpendicular: true,
  nearest: false,
  grid: false,
  gridStepFt: 5,
  tolerancePx: 18,
  ortho: false,
};

export interface SnapResult {
  point: Point2D;
  type: SnapType;
  sourceEntityId?: string;
}

export interface FindSnapOptions {
  fromPoint?: Point2D;
  layers?: CadLayer[];
  spatialIndex?: CadSpatialIndex;
}

export function getSnapToleranceFt(
  tolerancePx: number,
  zoomPxPerFt: number
): number {
  return Math.max(1, tolerancePx) / Math.max(0.05, zoomPxPerFt);
}

export function applyOrthoConstraint(
  point: Point2D,
  anchor: Point2D
): Point2D {
  const dx = Math.abs(point.x - anchor.x);
  const dy = Math.abs(point.y - anchor.y);
  if (dx >= dy) {
    return { x: point.x, y: anchor.y };
  }
  return { x: anchor.x, y: point.y };
}

export function findSnapPoint(
  cursorWorld: Point2D,
  entities: CadEntity[],
  config: SnapConfig,
  toleranceFt: number,
  options: FindSnapOptions = {}
): SnapResult | null {
  if (!config.enabled) return null;

  const candidatesRaw = options.spatialIndex
    ? options.spatialIndex.queryPoint(cursorWorld, toleranceFt)
    : entities;
  const candidates = candidatesRaw.filter((e) =>
    isEntityVisible(e, options.layers)
  );

  let best: SnapResult | null = null;
  let bestDist = toleranceFt;

  // 1. Endpoints (highest priority)
  if (config.endpoint) {
    for (const entity of candidates) {
      for (const v of getEntityVertices(entity)) {
        const d = distance2D(cursorWorld, v);
        if (d <= bestDist) {
          bestDist = d;
          best = { point: { ...v }, type: 'endpoint', sourceEntityId: entity.id };
        }
      }
    }
    if (best) return best;
  }

  // 2. Intersections
  if (config.intersection) {
    const allSegs = candidates.flatMap(getEntitySegments);
    for (let i = 0; i < allSegs.length; i++) {
      for (let j = i + 1; j < allSegs.length; j++) {
        if (allSegs[i].entityId === allSegs[j].entityId) continue;
        const hit = segmentIntersection(
          allSegs[i].a,
          allSegs[i].b,
          allSegs[j].a,
          allSegs[j].b
        );
        if (hit) {
          const d = distance2D(cursorWorld, hit);
          if (d <= bestDist) {
            bestDist = d;
            best = {
              point: hit,
              type: 'intersection',
              sourceEntityId: allSegs[i].entityId,
            };
          }
        }
      }
    }
    if (best) return best;
  }

  // 3. Centers (circles, arcs, rectangles, polygons)
  if (config.center) {
    for (const entity of candidates) {
      for (const c of getEntityCenters(entity)) {
        const d = distance2D(cursorWorld, c);
        if (d <= bestDist) {
          bestDist = d;
          best = { point: { ...c }, type: 'center', sourceEntityId: entity.id };
        }
      }
    }
    if (best) return best;
  }

  // 4. Midpoints
  if (config.midpoint) {
    for (const entity of candidates) {
      for (const m of getEntityMidpoints(entity)) {
        const d = distance2D(cursorWorld, m);
        if (d <= bestDist) {
          bestDist = d;
          best = { point: m, type: 'midpoint', sourceEntityId: entity.id };
        }
      }
    }
    if (best) return best;
  }

  // 5. Perpendicular foot onto segments (from previous anchor point or cursor)
  if (config.perpendicular) {
    const refPoint = options.fromPoint || cursorWorld;
    for (const entity of candidates) {
      for (const seg of getEntitySegments(entity)) {
        const foot = perpendicularFootOnSegment(refPoint, seg.a, seg.b);
        if (foot) {
          const d = distance2D(cursorWorld, foot);
          if (d <= bestDist) {
            bestDist = d;
            best = {
              point: foot,
              type: 'perpendicular',
              sourceEntityId: entity.id,
            };
          }
        }
      }
    }
    if (best) return best;
  }

  // 6. Nearest on segments
  if (config.nearest) {
    for (const entity of candidates) {
      for (const seg of getEntitySegments(entity)) {
        const d = pointToSegmentDistance(cursorWorld, seg.a, seg.b);
        if (d <= bestDist) {
          bestDist = d;
          best = {
            point: closestPointOnSegment(cursorWorld, seg.a, seg.b),
            type: 'nearest',
            sourceEntityId: entity.id,
          };
        }
      }
    }
    if (best) return best;
  }

  // 7. Grid snap
  if (config.grid && config.gridStepFt > 0) {
    const step = config.gridStepFt;
    const gx = Math.round(cursorWorld.x / step) * step;
    const gy = Math.round(cursorWorld.y / step) * step;
    const gp = { x: gx, y: gy };
    if (distance2D(cursorWorld, gp) <= toleranceFt * 1.5) {
      return { point: gp, type: 'grid' };
    }
  }

  return null;
}
