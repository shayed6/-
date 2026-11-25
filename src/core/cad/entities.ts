import { Point2D } from '../survey/coordinates';
import {
  ArcEntity,
  CadDocument,
  CadEntity,
  CadEntityType,
  CadLayer,
  CircleEntity,
  DEFAULT_LAYERS,
  DimensionEntity,
  EntityProperties,
  LineEntity,
  PointEntity,
  PolygonEntity,
  PolylineEntity,
  RectangleEntity,
  TextEntity,
} from './types';

export function makeEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getDocumentLayers(doc: Pick<CadDocument, 'layers'>): CadLayer[] {
  return doc.layers && doc.layers.length > 0 ? doc.layers : DEFAULT_LAYERS;
}

export function resolveEntityLayer(
  entity: CadEntity,
  layers: CadLayer[] = DEFAULT_LAYERS
): CadLayer | undefined {
  if (entity.layerId) {
    const byId = layers.find((l) => l.id === entity.layerId);
    if (byId) return byId;
  }
  const lower = (entity.layer || '').toLowerCase();
  return (
    layers.find((l) => l.id === lower || l.name.toLowerCase() === lower) ||
    layers[0]
  );
}

export function isEntityVisible(
  entity: CadEntity,
  layers: CadLayer[] = DEFAULT_LAYERS
): boolean {
  if (entity.visible === false) return false;
  const layer = resolveEntityLayer(entity, layers);
  return layer ? layer.visible : true;
}

export function isEntityLocked(
  entity: CadEntity,
  layers: CadLayer[] = DEFAULT_LAYERS
): boolean {
  if (entity.locked) return true;
  const layer = resolveEntityLayer(entity, layers);
  return layer ? layer.locked : false;
}

export function getEntityDisplayColor(
  entity: CadEntity,
  layers: CadLayer[] = DEFAULT_LAYERS
): string {
  if (entity.color) return entity.color;
  const layer = resolveEntityLayer(entity, layers);
  return layer ? layer.color : '#0F5132';
}

export function getEntityCadType(entity: CadEntity): CadEntityType {
  if (entity.type) return entity.type;
  switch (entity.kind) {
    case 'point':
      return 'POINT';
    case 'line':
    case 'dimension':
      return 'LINE';
    case 'polyline':
    case 'polygon':
      return 'POLYLINE';
    case 'circle':
      return 'CIRCLE';
    case 'arc':
      return 'ARC';
    case 'rectangle':
      return 'RECTANGLE';
    case 'text':
      return 'TEXT';
  }
}

export function createPointEntity(
  position: Point2D,
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
    label?: string;
    marker?: 'pillar' | 'cross' | 'dot';
    properties?: EntityProperties;
  } = {}
): PointEntity {
  const layer = opts.layer || DEFAULT_LAYERS[1];
  return {
    id: opts.id || makeEntityId('pt'),
    kind: 'point',
    type: 'POINT',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color || '#B45309',
    visible: true,
    locked: false,
    position: { ...position },
    marker: opts.marker || 'pillar',
    label: opts.label,
    geometry: { position: { ...position } },
    properties: { marker: opts.marker || 'pillar', label: opts.label, ...opts.properties },
  };
}

export function createLineEntity(
  start: Point2D,
  end: Point2D,
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
    properties?: EntityProperties;
  } = {}
): LineEntity {
  const layer = opts.layer || DEFAULT_LAYERS[1];
  return {
    id: opts.id || makeEntityId('line'),
    kind: 'line',
    type: 'LINE',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color,
    visible: true,
    locked: false,
    start: { ...start },
    end: { ...end },
    geometry: { start: { ...start }, end: { ...end } },
    properties: { ...opts.properties },
  };
}

export function createPolylineEntity(
  points: Point2D[],
  closed = false,
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
    properties?: EntityProperties;
  } = {}
): PolylineEntity {
  const layer = opts.layer || DEFAULT_LAYERS[1];
  const pts = points.map((p) => ({ ...p }));
  return {
    id: opts.id || makeEntityId('pline'),
    kind: 'polyline',
    type: 'POLYLINE',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color,
    visible: true,
    locked: false,
    points: pts,
    closed,
    geometry: { points: pts, closed },
    properties: { closed, ...opts.properties },
  };
}

export function createRectangleEntity(
  a: Point2D,
  b: Point2D,
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
    properties?: EntityProperties;
  } = {}
): RectangleEntity {
  const layer = opts.layer || DEFAULT_LAYERS[1];
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const points: Point2D[] = [
    { x: min.x, y: min.y },
    { x: max.x, y: min.y },
    { x: max.x, y: max.y },
    { x: min.x, y: max.y },
  ];
  return {
    id: opts.id || makeEntityId('rect'),
    kind: 'rectangle',
    type: 'RECTANGLE',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color,
    visible: true,
    locked: false,
    min,
    max,
    points,
    geometry: { min, max, points },
    properties: { ...opts.properties },
  };
}

export function createCircleEntity(
  center: Point2D,
  radiusFt: number,
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
    properties?: EntityProperties;
  } = {}
): CircleEntity {
  const layer = opts.layer || DEFAULT_LAYERS[1];
  return {
    id: opts.id || makeEntityId('circle'),
    kind: 'circle',
    type: 'CIRCLE',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color,
    visible: true,
    locked: false,
    center: { ...center },
    radiusFt,
    geometry: { center: { ...center }, radiusFt },
    properties: { radiusFt, ...opts.properties },
  };
}

export function createArcEntity(
  center: Point2D,
  radiusFt: number,
  startAngleRad: number,
  endAngleRad: number,
  anticlockwise = true,
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
    threePoints?: [Point2D, Point2D, Point2D];
    properties?: EntityProperties;
  } = {}
): ArcEntity {
  const layer = opts.layer || DEFAULT_LAYERS[1];
  return {
    id: opts.id || makeEntityId('arc'),
    kind: 'arc',
    type: 'ARC',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color,
    visible: true,
    locked: false,
    center: { ...center },
    radiusFt,
    startAngleRad,
    endAngleRad,
    anticlockwise,
    threePoints: opts.threePoints,
    geometry: {
      center: { ...center },
      radiusFt,
      startAngleRad,
      endAngleRad,
      anticlockwise,
    },
    properties: { radiusFt, ...opts.properties },
  };
}

export function createTextEntity(
  position: Point2D,
  text: string,
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
    heightFt?: number;
    rotationDeg?: number;
    properties?: EntityProperties;
  } = {}
): TextEntity {
  const layer = opts.layer || DEFAULT_LAYERS[4];
  const heightFt = opts.heightFt ?? 5;
  return {
    id: opts.id || makeEntityId('txt'),
    kind: 'text',
    type: 'TEXT',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color,
    visible: true,
    locked: false,
    position: { ...position },
    text,
    heightFt,
    rotationDeg: opts.rotationDeg,
    geometry: {
      position: { ...position },
      text,
      heightFt,
      rotationDeg: opts.rotationDeg,
    },
    properties: { text, heightFt, ...opts.properties },
  };
}

export function createPolygonEntity(
  points: Point2D[],
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
    plotNumber?: string;
    ownerName?: string;
    measuredFromRaster?: boolean;
    properties?: EntityProperties;
  } = {}
): PolygonEntity {
  const layer = opts.layer || DEFAULT_LAYERS[2];
  const pts = points.map((p) => ({ ...p }));
  return {
    id: opts.id || makeEntityId('poly'),
    kind: 'polygon',
    type: 'POLYLINE',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color,
    visible: true,
    locked: false,
    points: pts,
    plotNumber: opts.plotNumber,
    ownerName: opts.ownerName,
    measuredFromRaster: opts.measuredFromRaster,
    geometry: { points: pts },
    properties: {
      closed: true,
      plotNumber: opts.plotNumber,
      ownerName: opts.ownerName,
      ...opts.properties,
    },
  };
}

export function createDimensionEntity(
  start: Point2D,
  end: Point2D,
  dimType: 'aligned' | 'linear' | 'bearing' = 'aligned',
  opts: {
    id?: string;
    layer?: CadLayer;
    color?: string;
  } = {}
): DimensionEntity {
  const layer = opts.layer || DEFAULT_LAYERS[3];
  return {
    id: opts.id || makeEntityId('dim'),
    kind: 'dimension',
    type: 'LINE',
    layer: layer.name,
    layerId: layer.id,
    color: opts.color || layer.color,
    visible: true,
    locked: false,
    start: { ...start },
    end: { ...end },
    offsetFt: 0,
    dimType,
    geometry: { start: { ...start }, end: { ...end }, offsetFt: 0 },
    properties: { dimType },
  };
}
