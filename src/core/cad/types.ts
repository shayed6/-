import { Point2D } from '../survey/coordinates';
import { AreaUnit, DEFAULT_UNIT_PROFILE, LinearUnit, UnitProfile } from '../survey/units';

export type CadEntityType =
  | 'POINT'
  | 'LINE'
  | 'POLYLINE'
  | 'CIRCLE'
  | 'ARC'
  | 'RECTANGLE'
  | 'TEXT';

export type EntityKind =
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'circle'
  | 'arc'
  | 'rectangle'
  | 'point'
  | 'text'
  | 'dimension';

export interface CadLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export const DEFAULT_LAYERS: CadLayer[] = [
  { id: 'map', name: 'Map', color: '#475569', visible: true, locked: false },
  { id: 'boundary', name: 'Boundary', color: '#0F5132', visible: true, locked: false },
  { id: 'plots', name: 'Plots', color: '#15803D', visible: true, locked: false },
  { id: 'dimensions', name: 'Dimensions', color: '#0369A1', visible: true, locked: false },
  { id: 'text', name: 'Text', color: '#1E293B', visible: true, locked: false },
];

export type EntityProperties = Record<string, string | number | boolean | undefined>;

export interface BaseEntity {
  id: string;
  kind: EntityKind;
  type?: CadEntityType;
  layer: string;
  layerId?: string;
  color: string;
  strokeWidth?: number;
  visible?: boolean;
  locked?: boolean;
  properties?: EntityProperties;
  measuredFromRaster?: boolean;
}

export interface LineEntity extends BaseEntity {
  kind: 'line';
  start: Point2D;
  end: Point2D;
  geometry?: { start: Point2D; end: Point2D };
}

export interface PolylineEntity extends BaseEntity {
  kind: 'polyline';
  points: Point2D[];
  closed: boolean;
  geometry?: { points: Point2D[]; closed: boolean };
}

export interface PolygonEntity extends BaseEntity {
  kind: 'polygon';
  points: Point2D[];
  plotNumber?: string;
  ownerName?: string;
  khatian?: string;
  mouza?: string;
  fillColor?: string;
  fillOpacity?: number;
  geometry?: { points: Point2D[] };
}

export interface RectangleEntity extends BaseEntity {
  kind: 'rectangle';
  min: Point2D;
  max: Point2D;
  points: Point2D[];
  geometry?: { min: Point2D; max: Point2D; points: Point2D[] };
}

export interface CircleEntity extends BaseEntity {
  kind: 'circle';
  center: Point2D;
  radiusFt: number;
  geometry?: { center: Point2D; radiusFt: number };
}

export interface ArcEntity extends BaseEntity {
  kind: 'arc';
  center: Point2D;
  radiusFt: number;
  startAngleRad: number;
  endAngleRad: number;
  anticlockwise?: boolean;
  threePoints?: [Point2D, Point2D, Point2D];
  geometry?: {
    center: Point2D;
    radiusFt: number;
    startAngleRad: number;
    endAngleRad: number;
    anticlockwise?: boolean;
  };
}

export interface PointEntity extends BaseEntity {
  kind: 'point';
  position: Point2D;
  marker: 'pillar' | 'cross' | 'dot';
  label?: string;
  geometry?: { position: Point2D };
}

export interface TextEntity extends BaseEntity {
  kind: 'text';
  position: Point2D;
  text: string;
  heightFt: number;
  rotationDeg?: number;
  geometry?: { position: Point2D; text: string; heightFt: number; rotationDeg?: number };
}

export interface DimensionEntity extends BaseEntity {
  kind: 'dimension';
  start: Point2D;
  end: Point2D;
  offsetFt: number;
  dimType: 'aligned' | 'linear' | 'bearing';
  geometry?: { start: Point2D; end: Point2D; offsetFt: number };
}

export type CadEntity =
  | LineEntity
  | PolylineEntity
  | PolygonEntity
  | RectangleEntity
  | CircleEntity
  | ArcEntity
  | PointEntity
  | TextEntity
  | DimensionEntity;

export interface RasterTransform {
  /** World X (feet) of raster pixel (0, 0) */
  tx: number;
  /** World Y (feet) of raster pixel (0, 0) */
  ty: number;
  /** Feet per image pixel */
  scaleFtPerPx: number;
  /** Rotation in radians (counter-clockwise in world space) */
  rotationRad: number;
}

export interface RasterLayer {
  id: string;
  name: string;
  /** Original image data URL kept for saving */
  dataUrl: string;
  /** Optional downscaled display data URL for fast rendering of large photos */
  displayDataUrl?: string;
  widthPx: number;
  heightPx: number;
  transform: RasterTransform;
  opacity: number;
  visible: boolean;
  locked: boolean;
  calibrated: boolean;
  pixelsPerFoot?: number;
  inchesPerMile?: number;
  calibrationMethod?: 'bar' | 'scanner';
  flippedX?: boolean;
}

export interface AlignmentPair {
  id: string;
  baseWorld: Point2D;
  overlayPx: Point2D;
  label?: string;
}

export interface OverlayAlignmentState {
  baseRasterId: string;
  overlayRasterId: string;
  pairs: AlignmentPair[];
  method: 'similarity-2pt' | 'least-squares';
  rmsErrorFt: number;
  maxErrorFt: number;
  residualsFt: number[];
  updatedAt: number;
}

export interface DemarcationRecord {
  id: string;
  createdAt: number;
  baseMapLabel: string;
  overlayMapLabel: string;
  baseDagNo: string;
  overlayDagNo: string;
  basePolygonId?: string;
  overlayPolygonId?: string;
  basePolygon: Point2D[];
  overlayPolygon: Point2D[];
  rmsErrorFt: number;
}

export interface CalculatorTableRow {
  label: string;
  shareText: string;
  sqFt: number;
  shotok: number;
  katha: number;
  bigha: number;
  acre: number;
  sqM: number;
}

export interface CalculatorRecord {
  id: string;
  createdAt: number;
  tool:
    | 'area-sides'
    | 'converter'
    | 'ana-ganda'
    | 'ratio-split'
    | 'my-share'
    | 'hissa'
    | 'tofsil';
  title: string;
  summary: string;
  areaSqFt: number;
  rows?: CalculatorTableRow[];
}

export interface PartitionPartRecord {
  name: string;
  shareLabel: string;
  sqFt: number;
  shotok: number;
  katha: number;
  bigha: number;
  acre: number;
  perimeterFt: number;
  sideLengthsFt: number[];
}

export interface PartitionRecord {
  id: string;
  createdAt: number;
  sourcePlotName: string;
  totalAreaSqFt: number;
  modeLabel: string;
  directionLabel: string;
  parts: PartitionPartRecord[];
}

export interface CadDocument {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  unitProfile: UnitProfile;
  linearUnit: LinearUnit;
  areaUnit: AreaUnit;
  layers?: CadLayer[];
  activeLayerId?: string;
  entities: CadEntity[];
  rasterLayers: RasterLayer[];
  hasRasterMeasurement: boolean;
  overlayAlignment?: OverlayAlignmentState | null;
  demarcationResults?: DemarcationRecord[];
  calculatorRecords?: CalculatorRecord[];
  partitionResults?: PartitionRecord[];
}

export interface Viewport {
  centerX: number; // world feet
  centerY: number; // world feet
  zoomPxPerFt: number; // CSS pixels per foot
}

export function createEmptyDocument(
  name = 'নতুন সার্ভে প্রজেক্ট',
  id = `proj-${Date.now()}`
): CadDocument {
  const now = Date.now();
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    unitProfile: { ...DEFAULT_UNIT_PROFILE },
    linearUnit: 'ft',
    areaUnit: 'shotok',
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    activeLayerId: 'boundary',
    entities: [],
    rasterLayers: [],
    hasRasterMeasurement: false,
  };
}

export function worldToScreen(
  world: Point2D,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number
): Point2D {
  return {
    x: canvasWidth / 2 + (world.x - viewport.centerX) * viewport.zoomPxPerFt,
    y: canvasHeight / 2 - (world.y - viewport.centerY) * viewport.zoomPxPerFt,
  };
}

export function screenToWorld(
  screen: Point2D,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number
): Point2D {
  return {
    x: viewport.centerX + (screen.x - canvasWidth / 2) / viewport.zoomPxPerFt,
    y: viewport.centerY - (screen.y - canvasHeight / 2) / viewport.zoomPxPerFt,
  };
}
