import RBush from 'rbush';
import { BBox, Point2D } from '../survey/coordinates';
import { getEntityBBox } from './geometry';
import { CadEntity, Viewport, screenToWorld } from './types';

export interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  entity: CadEntity;
}

export class CadSpatialIndex {
  private tree = new RBush<SpatialItem>();
  private orderMap = new Map<string, number>();

  rebuild(entities: CadEntity[]): void {
    this.tree.clear();
    this.orderMap.clear();
    const items: SpatialItem[] = [];
    entities.forEach((entity, idx) => {
      this.orderMap.set(entity.id, idx);
      const bbox = getEntityBBox(entity);
      if (!bbox) return;
      items.push({
        minX: bbox.minX,
        minY: bbox.minY,
        maxX: bbox.maxX,
        maxY: bbox.maxY,
        id: entity.id,
        entity,
      });
    });
    if (items.length > 0) {
      this.tree.load(items);
    }
  }

  queryBBox(bbox: BBox): CadEntity[] {
    const hits = this.tree.search(bbox);
    hits.sort(
      (a, b) => (this.orderMap.get(a.id) ?? 0) - (this.orderMap.get(b.id) ?? 0)
    );
    return hits.map((h) => h.entity);
  }

  queryPoint(point: Point2D, radiusFt: number): CadEntity[] {
    return this.queryBBox({
      minX: point.x - radiusFt,
      minY: point.y - radiusFt,
      maxX: point.x + radiusFt,
      maxY: point.y + radiusFt,
    });
  }

  queryViewport(
    viewport: Viewport,
    canvasWidthPx: number,
    canvasHeightPx: number,
    padPx = 48
  ): CadEntity[] {
    const topLeft = screenToWorld(
      { x: -padPx, y: -padPx },
      viewport,
      canvasWidthPx,
      canvasHeightPx
    );
    const bottomRight = screenToWorld(
      { x: canvasWidthPx + padPx, y: canvasHeightPx + padPx },
      viewport,
      canvasWidthPx,
      canvasHeightPx
    );
    return this.queryBBox({
      minX: Math.min(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxX: Math.max(topLeft.x, bottomRight.x),
      maxY: Math.max(topLeft.y, bottomRight.y),
    });
  }
}

export function createSpatialIndex(entities: CadEntity[]): CadSpatialIndex {
  const index = new CadSpatialIndex();
  index.rebuild(entities);
  return index;
}
