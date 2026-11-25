import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CadDocument,
  CadEntity,
  Viewport,
  screenToWorld,
  worldToScreen,
} from '../core/cad/types';
import { getDocumentLayers, isEntityLocked, isEntityVisible } from '../core/cad/entities';
import {
  BBox,
  arcFromThreePoints,
  arcLengthFt,
  arcSweepAngleRad,
  getEntityVertices,
  hitTestEntity,
  sampleArcPoints,
  selectEntitiesInBox,
  translateEntity,
} from '../core/cad/geometry';
import {
  SnapConfig,
  SnapResult,
  SnapType,
  applyOrthoConstraint,
  findSnapPoint,
  getSnapToleranceFt,
} from '../core/cad/snapping';
import { createSpatialIndex } from '../core/cad/spatialIndex';
import { computeAreaBreakdown, polygonAreaSqFt } from '../core/survey/area';
import {
  azimuthDegrees,
  interiorAngleDegrees,
  wcbToReducedBearing,
} from '../core/survey/bearing';
import { Point2D, distance2D, midpoint2D } from '../core/survey/coordinates';
import { polygonCentroid } from '../core/survey/area';
import {
  formatNumber,
  fromFeet,
  fromSqFt,
  getAreaUnitLabel,
  getLinearUnitLabel,
} from '../core/survey/units';
import { Lang } from './i18n';

export type ActiveTool =
  | 'select'
  | 'box-select'
  | 'pan'
  | 'draw-polygon'
  | 'draw-polyline'
  | 'draw-line'
  | 'draw-rect'
  | 'draw-circle'
  | 'draw-arc'
  | 'draw-point'
  | 'draw-text'
  | 'draw-dim'
  | 'measure-dist'
  | 'measure-path'
  | 'measure-area'
  | 'measure-angle'
  | 'measure-coord'
  | 'pick-point'
  | 'pantograph-window';

export interface PickedPin {
  point: Point2D;
  label: string;
  color?: string;
}

export interface PartitionSplitLineOverlay {
  index: number;
  segments: Array<{ a: Point2D; b: Point2D }>;
  handlePoint: Point2D;
  label?: string;
}

export interface PartitionCanvasOverlay {
  parts: Array<{
    rings: Point2D[][];
    color: string;
    label: string;
    subLabel: string;
    centroid: Point2D;
  }>;
  splitLines: PartitionSplitLineOverlay[];
  chosenEdge?: { a: Point2D; b: Point2D; label?: string } | null;
  pivotPoint?: Point2D | null;
  interactive?: boolean;
}

interface CadCanvasProps {
  doc: CadDocument;
  viewport: Viewport;
  onViewportChange: (next: Viewport) => void;
  activeTool: ActiveTool;
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  snapConfig: SnapConfig;
  lang: Lang;
  draftPoints: Point2D[];
  onDraftPointsChange: (pts: Point2D[]) => void;
  onCommitLine: (a: Point2D, b: Point2D) => void;
  onCommitRect: (a: Point2D, b: Point2D) => void;
  onCommitCircle: (center: Point2D, radiusFt: number) => void;
  onCommitArc?: (p1: Point2D, p2: Point2D, p3: Point2D) => void;
  onCommitPolygon: (pts: Point2D[], isMeasureOnly?: boolean) => void;
  onCommitPolyline: (pts: Point2D[]) => void;
  onCommitPoint: (p: Point2D) => void;
  onCommitTextRequest: (p: Point2D) => void;
  onCommitDimension: (a: Point2D, b: Point2D) => void;
  onMoveEntity: (id: string, nextEntity: CadEntity) => void;
  onMoveEntities?: (ids: string[], dxFt: number, dyFt: number) => void;
  onPickPoint?: (p: Point2D) => void;
  onMeasureAngle?: (armA: Point2D, vertex: Point2D, armB: Point2D) => void;
  onPickCoord?: (p: Point2D) => void;
  measurementPreview?: { mode: 'area' | 'distance'; points: Point2D[] } | null;
  anglePreview?: { armA: Point2D; vertex: Point2D; armB: Point2D } | null;
  overlapRings?: Point2D[][];
  alignmentVectors?: Array<{ from: Point2D; to: Point2D; label: string }>;
  pantographWindow?: BBox | null;
  onCommitPantographWindow?: (bbox: BBox) => void;
  partitionOverlay?: PartitionCanvasOverlay | null;
  onDragPartitionSplitLine?: (splitIndex: number, worldPt: Point2D) => void;
  pickedPins?: PickedPin[];
  selectedRasterId?: string | null;
  onMoveRaster?: (rasterId: string, dxFt: number, dyFt: number) => void;
  isDark?: boolean;
}

const FONT_STACK =
  '"Noto Sans Bengali", "Hind Siliguri", "DM Sans", system-ui, sans-serif';

function getSnapLabel(type: SnapType, lang: Lang): string {
  const bn: Record<SnapType, string> = {
    endpoint: 'প্রান্ত',
    midpoint: 'মধ্য',
    center: 'কেন্দ্র',
    intersection: 'ছেদ',
    perpendicular: 'লম্ব',
    nearest: 'নিকট',
    grid: 'গ্রিড',
  };
  const en: Record<SnapType, string> = {
    endpoint: 'End',
    midpoint: 'Mid',
    center: 'Ctr',
    intersection: 'Int',
    perpendicular: 'Perp',
    nearest: 'Near',
    grid: 'Grid',
  };
  return lang === 'bn' ? bn[type] : en[type];
}

export const CadCanvas: React.FC<CadCanvasProps> = ({
  doc,
  viewport,
  onViewportChange,
  activeTool,
  selectedIds,
  onSelectIds,
  snapConfig,
  lang,
  draftPoints,
  onDraftPointsChange,
  onCommitLine,
  onCommitRect,
  onCommitCircle,
  onCommitArc,
  onCommitPolygon,
  onCommitPolyline,
  onCommitPoint,
  onCommitTextRequest,
  onCommitDimension,
  onMoveEntity,
  onMoveEntities,
  onPickPoint,
  onMeasureAngle,
  onPickCoord,
  measurementPreview,
  anglePreview,
  overlapRings = [],
  alignmentVectors = [],
  pantographWindow = null,
  onCommitPantographWindow,
  partitionOverlay = null,
  onDragPartitionSplitLine,
  pickedPins = [],
  selectedRasterId,
  onMoveRaster,
  isDark = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [cursorScreen, setCursorScreen] = useState<Point2D | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [activeSnap, setActiveSnap] = useState<SnapResult | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);

  const [selectionBox, setSelectionBox] = useState<{
    startScreen: Point2D;
    endScreen: Point2D;
    startWorld: Point2D;
    endWorld: Point2D;
  } | null>(null);

  const layers = useMemo(() => getDocumentLayers(doc), [doc]);
  const spatialIndex = useMemo(
    () => createSpatialIndex(doc.entities),
    [doc.entities]
  );

  // Cache decoded HTMLImageElement instances by raster layer id + display url
  const imgCacheRef = useRef<Map<string, { url: string; img: HTMLImageElement }>>(
    new Map()
  );
  const [, setImgTick] = useState(0);

  useEffect(() => {
    for (const layer of doc.rasterLayers) {
      const renderSrc = layer.displayDataUrl || layer.dataUrl;
      const existing = imgCacheRef.current.get(layer.id);
      if (!existing || existing.url !== renderSrc) {
        const img = new Image();
        img.onload = () => setImgTick((t) => t + 1);
        img.src = renderSrc;
        imgCacheRef.current.set(layer.id, { url: renderSrc, img });
      }
    }
  }, [doc.rasterLayers]);

  // ResizeObserver for crisp high-DPI rendering
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(100, Math.floor(entry.contentRect.width));
        const h = Math.max(100, Math.floor(entry.contentRect.height));
        setSize({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pointer & gesture state
  const pointersRef = useRef<Map<number, Point2D>>(new Map());
  const pinchStateRef = useRef<{
    dist: number;
    mid: Point2D;
    viewport: Viewport;
  } | null>(null);
  const dragStateRef = useRef<{
    mode:
      | 'pan'
      | 'move-entity'
      | 'move-raster'
      | 'box-select'
      | 'drag-partition-line'
      | 'none';
    startScreen: Point2D;
    startWorld: Point2D;
    startViewport: Viewport;
    moved: boolean;
    originalEntity?: CadEntity;
    previewEntity?: CadEntity;
    rasterLastWorld?: Point2D;
    partitionSplitIndex?: number;
  } | null>(null);

  const [dragPreviewEntity, setDragPreviewEntity] = useState<CadEntity | null>(null);

  const getLocalPoint = (clientX: number, clientY: number): Point2D => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const resolveWorldWithSnap = (
    screenPt: Point2D
  ): { world: Point2D; snap: SnapResult | null } => {
    const rawWorld = screenToWorld(screenPt, viewport, size.width, size.height);
    const tolFt = getSnapToleranceFt(snapConfig.tolerancePx || 18, viewport.zoomPxPerFt);
    const isSelectOrPan =
      activeTool === 'pan' || activeTool === 'select' || activeTool === 'box-select';
    const fromPoint =
      draftPoints.length > 0 ? draftPoints[draftPoints.length - 1] : undefined;

    const snap = isSelectOrPan
      ? null
      : findSnapPoint(rawWorld, doc.entities, snapConfig, tolFt, {
          fromPoint,
          layers,
          spatialIndex,
        });

    let world = snap ? snap.point : rawWorld;
    if (!isSelectOrPan && !snap && snapConfig.ortho && fromPoint) {
      world = applyOrthoConstraint(rawWorld, fromPoint);
    }

    return { world, snap };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getLocalPoint(e.clientX, e.clientY);
    pointersRef.current.set(e.pointerId, pt);

    // Two-finger pinch-zoom & pan
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = distance2D(pts[0], pts[1]);
      const mid = midpoint2D(pts[0], pts[1]);
      pinchStateRef.current = { dist, mid, viewport: { ...viewport } };
      dragStateRef.current = null;
      setSelectionBox(null);
      return;
    }

    if (pointersRef.current.size > 2) return;

    const isMiddleOrRightPan = e.button === 1 || e.button === 2;
    const { world, snap } = resolveWorldWithSnap(pt);
    setCursorScreen(pt);
    setCursorWorld(world);
    setActiveSnap(snap);

    if (
      !isMiddleOrRightPan &&
      partitionOverlay?.interactive &&
      onDragPartitionSplitLine &&
      (activeTool === 'select' || activeTool === 'pan')
    ) {
      let bestIdx = -1;
      let bestDistPx = Infinity;
      for (const line of partitionOverlay.splitLines) {
        const hs = worldToScreen(line.handlePoint, viewport, size.width, size.height);
        const dHandle = distance2D(pt, hs);
        if (dHandle <= 30 && dHandle < bestDistPx) {
          bestDistPx = dHandle;
          bestIdx = line.index;
        }
        for (const seg of line.segments) {
          const sa = worldToScreen(seg.a, viewport, size.width, size.height);
          const sb = worldToScreen(seg.b, viewport, size.width, size.height);
          const dx = sb.x - sa.x;
          const dy = sb.y - sa.y;
          const lenSq = dx * dx + dy * dy;
          const u =
            lenSq > 1e-6
              ? Math.max(0, Math.min(1, ((pt.x - sa.x) * dx + (pt.y - sa.y) * dy) / lenSq))
              : 0;
          const projPt = { x: sa.x + u * dx, y: sa.y + u * dy };
          const dSeg = distance2D(pt, projPt);
          if (dSeg <= 20 && dSeg < bestDistPx) {
            bestDistPx = dSeg;
            bestIdx = line.index;
          }
        }
      }
      if (bestIdx >= 0) {
        dragStateRef.current = {
          mode: 'drag-partition-line',
          partitionSplitIndex: bestIdx,
          startScreen: pt,
          startWorld: world,
          startViewport: { ...viewport },
          moved: false,
        };
        return;
      }
    }

    if (activeTool === 'pan' || isMiddleOrRightPan) {
      dragStateRef.current = {
        mode: 'pan',
        startScreen: pt,
        startWorld: world,
        startViewport: { ...viewport },
        moved: false,
      };
      return;
    }

    // Box selection (explicit tool or Shift+Drag in select mode)
    if (activeTool === 'box-select' || (activeTool === 'select' && e.shiftKey)) {
      dragStateRef.current = {
        mode: 'box-select',
        startScreen: pt,
        startWorld: world,
        startViewport: { ...viewport },
        moved: false,
      };
      setSelectionBox({
        startScreen: pt,
        endScreen: pt,
        startWorld: world,
        endWorld: world,
      });
      return;
    }

    if (activeTool === 'select') {
      const tolFt = 20 / viewport.zoomPxPerFt;
      const nearby = spatialIndex.queryPoint(world, tolFt * 2);
      const hit = [...nearby]
        .reverse()
        .find((ent) => hitTestEntity(ent, world, tolFt, layers));

      if (hit) {
        onSelectIds([hit.id]);
        const locked = isEntityLocked(hit, layers);
        dragStateRef.current = {
          mode: locked ? 'pan' : 'move-entity',
          startScreen: pt,
          startWorld: world,
          startViewport: { ...viewport },
          moved: false,
          originalEntity: hit,
          previewEntity: hit,
        };
      } else if (selectedRasterId && onMoveRaster) {
        onSelectIds([]);
        dragStateRef.current = {
          mode: 'move-raster',
          startScreen: pt,
          startWorld: world,
          startViewport: { ...viewport },
          moved: false,
          rasterLastWorld: world,
        };
      } else {
        onSelectIds([]);
        dragStateRef.current = {
          mode: 'pan',
          startScreen: pt,
          startWorld: world,
          startViewport: { ...viewport },
          moved: false,
        };
      }
      return;
    }

    setIsPlacing(true);
    dragStateRef.current = {
      mode: 'none',
      startScreen: pt,
      startWorld: world,
      startViewport: { ...viewport },
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getLocalPoint(e.clientX, e.clientY);
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, pt);
    }

    // Pinch-zoom & two-finger pan
    if (pointersRef.current.size === 2 && pinchStateRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const newDist = Math.max(10, distance2D(pts[0], pts[1]));
      const newMid = midpoint2D(pts[0], pts[1]);
      const prev = pinchStateRef.current;

      const scaleFactor = newDist / Math.max(10, prev.dist);
      const nextZoom = Math.max(0.15, Math.min(200, prev.viewport.zoomPxPerFt * scaleFactor));

      const anchorWorld = screenToWorld(prev.mid, prev.viewport, size.width, size.height);
      const nextCenterX = anchorWorld.x - (newMid.x - size.width / 2) / nextZoom;
      const nextCenterY = anchorWorld.y + (newMid.y - size.height / 2) / nextZoom;

      onViewportChange({
        centerX: nextCenterX,
        centerY: nextCenterY,
        zoomPxPerFt: nextZoom,
      });
      return;
    }

    const { world, snap } = resolveWorldWithSnap(pt);
    setCursorScreen(pt);
    setCursorWorld(world);
    setActiveSnap(snap);

    const drag = dragStateRef.current;
    if (!drag) return;

    const movedDistPx = distance2D(pt, drag.startScreen);
    if (movedDistPx > 4) drag.moved = true;

    if (drag.mode === 'box-select') {
      setSelectionBox({
        startScreen: drag.startScreen,
        endScreen: pt,
        startWorld: drag.startWorld,
        endWorld: world,
      });
    } else if (drag.mode === 'pan') {
      const dxPx = pt.x - drag.startScreen.x;
      const dyPx = pt.y - drag.startScreen.y;
      onViewportChange({
        ...drag.startViewport,
        centerX: drag.startViewport.centerX - dxPx / drag.startViewport.zoomPxPerFt,
        centerY: drag.startViewport.centerY + dyPx / drag.startViewport.zoomPxPerFt,
      });
    } else if (drag.mode === 'move-entity' && drag.originalEntity && drag.moved) {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      const movedEnt = translateEntity(drag.originalEntity, dx, dy);
      drag.previewEntity = movedEnt;
      setDragPreviewEntity(movedEnt);
    } else if (
      drag.mode === 'none' &&
      activeTool === 'pantograph-window' &&
      draftPoints.length === 0 &&
      drag.moved
    ) {
      setSelectionBox({
        startScreen: drag.startScreen,
        endScreen: pt,
        startWorld: drag.startWorld,
        endWorld: world,
      });
    } else if (
      drag.mode === 'drag-partition-line' &&
      drag.partitionSplitIndex !== undefined &&
      onDragPartitionSplitLine
    ) {
      onDragPartitionSplitLine(drag.partitionSplitIndex, world);
    } else if (
      drag.mode === 'move-raster' &&
      selectedRasterId &&
      onMoveRaster &&
      drag.rasterLastWorld
    ) {
      const dx = world.x - drag.rasterLastWorld.x;
      const dy = world.y - drag.rasterLastWorld.y;
      if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
        onMoveRaster(selectedRasterId, dx, dy);
        drag.rasterLastWorld = world;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const wasMultiTouch = pointersRef.current.size >= 2;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }

    const drag = dragStateRef.current;
    dragStateRef.current = null;
    setIsPlacing(false);

    if (wasMultiTouch) {
      setSelectionBox(null);
      return;
    }

    if (drag?.mode === 'box-select') {
      const pt = getLocalPoint(e.clientX, e.clientY);
      const { world } = resolveWorldWithSnap(pt);
      if (drag.moved) {
        const box = {
          minX: Math.min(drag.startWorld.x, world.x),
          minY: Math.min(drag.startWorld.y, world.y),
          maxX: Math.max(drag.startWorld.x, world.x),
          maxY: Math.max(drag.startWorld.y, world.y),
        };
        const mode = pt.x >= drag.startScreen.x ? 'window' : 'crossing';
        const candidates = spatialIndex.queryBBox(box);
        const matched = selectEntitiesInBox(candidates, box, mode, layers);
        onSelectIds(matched.map((ent) => ent.id));
      } else {
        // Short tap inside box-select behaves like tap select
        const tolFt = 20 / viewport.zoomPxPerFt;
        const nearby = spatialIndex.queryPoint(world, tolFt * 2);
        const hit = [...nearby]
          .reverse()
          .find((ent) => hitTestEntity(ent, world, tolFt, layers));
        onSelectIds(hit ? [hit.id] : []);
      }
      setSelectionBox(null);
      return;
    }

    if (drag?.mode === 'move-entity' && drag.moved && drag.originalEntity) {
      const pt = getLocalPoint(e.clientX, e.clientY);
      const { world } = resolveWorldWithSnap(pt);
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      if (onMoveEntities) {
        onMoveEntities([drag.originalEntity.id], dx, dy);
      } else if (drag.previewEntity) {
        onMoveEntity(drag.originalEntity.id, drag.previewEntity);
      }
      setDragPreviewEntity(null);
      return;
    }
    setDragPreviewEntity(null);

    if (!drag) return;
    if (drag.mode !== 'none' && drag.moved) return;

    const pt = getLocalPoint(e.clientX, e.clientY);
    const { world } = resolveWorldWithSnap(pt);

    if (activeTool === 'pantograph-window') {
      setSelectionBox(null);
      if (drag.moved && draftPoints.length === 0) {
        const wFt = Math.abs(world.x - drag.startWorld.x);
        const hFt = Math.abs(world.y - drag.startWorld.y);
        if (wFt >= 1 && hFt >= 1 && onCommitPantographWindow) {
          onCommitPantographWindow({
            minX: Math.min(drag.startWorld.x, world.x),
            minY: Math.min(drag.startWorld.y, world.y),
            maxX: Math.max(drag.startWorld.x, world.x),
            maxY: Math.max(drag.startWorld.y, world.y),
          });
        }
        onDraftPointsChange([]);
        return;
      }
      if (draftPoints.length === 0) {
        onDraftPointsChange([world]);
      } else {
        const first = draftPoints[0];
        if (
          Math.abs(world.x - first.x) >= 1 &&
          Math.abs(world.y - first.y) >= 1 &&
          onCommitPantographWindow
        ) {
          onCommitPantographWindow({
            minX: Math.min(first.x, world.x),
            minY: Math.min(first.y, world.y),
            maxX: Math.max(first.x, world.x),
            maxY: Math.max(first.y, world.y),
          });
        }
        onDraftPointsChange([]);
      }
      return;
    }

    if (activeTool === 'pick-point' && onPickPoint) {
      onPickPoint(world);
      return;
    }

    if (activeTool === 'measure-coord' && onPickCoord) {
      onPickCoord(world);
      return;
    }

    if (activeTool === 'draw-point') {
      onCommitPoint(world);
      return;
    }

    if (activeTool === 'draw-text') {
      onCommitTextRequest(world);
      return;
    }

    if (
      activeTool === 'draw-line' ||
      activeTool === 'draw-rect' ||
      activeTool === 'draw-circle' ||
      activeTool === 'draw-dim' ||
      activeTool === 'measure-dist'
    ) {
      if (draftPoints.length === 0) {
        onDraftPointsChange([world]);
      } else {
        const first = draftPoints[0];
        if (distance2D(first, world) > 1e-4) {
          if (activeTool === 'draw-line') onCommitLine(first, world);
          else if (activeTool === 'draw-rect') onCommitRect(first, world);
          else if (activeTool === 'draw-circle')
            onCommitCircle(first, distance2D(first, world));
          else if (activeTool === 'draw-dim') onCommitDimension(first, world);
          else if (activeTool === 'measure-dist') onCommitDimension(first, world);
        }
        onDraftPointsChange([]);
      }
      return;
    }

    if (activeTool === 'measure-angle') {
      if (draftPoints.length < 2) {
        onDraftPointsChange([...draftPoints, world]);
      } else {
        const [armA, vertex] = draftPoints;
        if (onMeasureAngle) {
          onMeasureAngle(armA, vertex, world);
        }
        onDraftPointsChange([]);
      }
      return;
    }

    if (activeTool === 'draw-arc') {
      if (draftPoints.length < 2) {
        onDraftPointsChange([...draftPoints, world]);
      } else {
        const [p1, p2] = draftPoints;
        if (onCommitArc) {
          onCommitArc(p1, p2, world);
        }
        onDraftPointsChange([]);
      }
      return;
    }

    if (
      activeTool === 'draw-polygon' ||
      activeTool === 'draw-polyline' ||
      activeTool === 'measure-area' ||
      activeTool === 'measure-path'
    ) {
      if (
        (activeTool === 'draw-polygon' || activeTool === 'measure-area') &&
        draftPoints.length >= 3
      ) {
        const firstScreen = worldToScreen(
          draftPoints[0],
          viewport,
          size.width,
          size.height
        );
        if (distance2D(pt, firstScreen) <= 22) {
          onCommitPolygon(draftPoints, activeTool === 'measure-area');
          onDraftPointsChange([]);
          return;
        }
      }
      onDraftPointsChange([...draftPoints, world]);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const pt = getLocalPoint(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    const nextZoom = Math.max(0.15, Math.min(200, viewport.zoomPxPerFt * factor));
    const anchorWorld = screenToWorld(pt, viewport, size.width, size.height);
    const nextCenterX = anchorWorld.x - (pt.x - size.width / 2) / nextZoom;
    const nextCenterY = anchorWorld.y + (pt.y - size.height / 2) / nextZoom;
    onViewportChange({
      centerX: nextCenterX,
      centerY: nextCenterY,
      zoomPxPerFt: nextZoom,
    });
  };

  // Main Canvas 2D Render Loop (with R-tree viewport culling)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Drafting paper background
    ctx.fillStyle = isDark ? '#0B1220' : '#FAFBF8';
    ctx.fillRect(0, 0, size.width, size.height);

    // 2. Adaptive world-space grid (feet)
    const targetGridPx = 64;
    const rawStepFt = targetGridPx / viewport.zoomPxPerFt;
    const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const gridStepFt =
      niceSteps.find((s) => s >= rawStepFt) || niceSteps[niceSteps.length - 1];

    const topLeftWorld = screenToWorld({ x: 0, y: 0 }, viewport, size.width, size.height);
    const botRightWorld = screenToWorld(
      { x: size.width, y: size.height },
      viewport,
      size.width,
      size.height
    );

    const startX = Math.floor(topLeftWorld.x / gridStepFt) * gridStepFt;
    const endX = Math.ceil(botRightWorld.x / gridStepFt) * gridStepFt;
    const startY = Math.floor(botRightWorld.y / gridStepFt) * gridStepFt;
    const endY = Math.ceil(topLeftWorld.y / gridStepFt) * gridStepFt;

    ctx.lineWidth = 1;
    for (let x = startX; x <= endX; x += gridStepFt) {
      const sx = worldToScreen({ x, y: 0 }, viewport, size.width, size.height).x;
      ctx.strokeStyle =
        Math.abs(x) < 1e-6
          ? isDark
            ? '#475569'
            : '#CBD5E1'
          : isDark
          ? '#1E293B'
          : '#ECEFE9';
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, size.height);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridStepFt) {
      const sy = worldToScreen({ x: 0, y }, viewport, size.width, size.height).y;
      ctx.strokeStyle =
        Math.abs(y) < 1e-6
          ? isDark
            ? '#475569'
            : '#CBD5E1'
          : isDark
          ? '#1E293B'
          : '#ECEFE9';
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(size.width, sy);
      ctx.stroke();
    }

    // 3. Raster reference layers
    for (const layer of doc.rasterLayers) {
      if (!layer.visible) continue;
      const cached = imgCacheRef.current.get(layer.id);
      if (!cached || !cached.img.complete) continue;
      const originScreen = worldToScreen(
        { x: layer.transform.tx, y: layer.transform.ty },
        viewport,
        size.width,
        size.height
      );
      const scalePx = layer.transform.scaleFtPerPx * viewport.zoomPxPerFt;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate(originScreen.x, originScreen.y);
      ctx.rotate(-layer.transform.rotationRad);
      ctx.drawImage(
        cached.img,
        0,
        0,
        layer.widthPx * scalePx,
        layer.heightPx * scalePx
      );
      if (selectedRasterId === layer.id) {
        ctx.strokeStyle = '#B45309';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(0, 0, layer.widthPx * scalePx, layer.heightPx * scalePx);
      }
      ctx.restore();
    }

    // Helper to draw pill badge label in screen space
    const drawBadge = (screenPt: Point2D, text: string, bg = '#0F5132', fg = '#FFFFFF') => {
      ctx.save();
      ctx.font = `600 11px ${FONT_STACK}`;
      const m = ctx.measureText(text);
      const padX = 6;
      const h = 18;
      ctx.fillStyle = bg;
      ctx.fillRect(screenPt.x - m.width / 2 - padX, screenPt.y - h / 2, m.width + padX * 2, h);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, screenPt.x, screenPt.y);
      ctx.restore();
    };

    // Helper to draw edge dimension label (with optional angle)
    const drawEdgeLabel = (
      a: Point2D,
      b: Point2D,
      color = '#1E293B',
      showAngle = false
    ) => {
      const sa = worldToScreen(a, viewport, size.width, size.height);
      const sb = worldToScreen(b, viewport, size.width, size.height);
      const segPx = distance2D(sa, sb);
      if (segPx < 34) return;
      const distFt = distance2D(a, b);
      const val = fromFeet(distFt, doc.linearUnit);
      let label = `${formatNumber(val, 1, lang)} ${getLinearUnitLabel(doc.linearUnit, lang)}`;
      if (showAngle) {
        const ang = azimuthDegrees(a, b);
        label += ` · ${formatNumber(ang, 1, lang)}°`;
      }
      const mid = midpoint2D(sa, sb);
      let angle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

      ctx.save();
      ctx.translate(mid.x, mid.y);
      ctx.rotate(angle);
      ctx.font = `600 11px ${FONT_STACK}`;
      const metrics = ctx.measureText(label);
      const padX = 5;
      ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(250, 251, 248, 0.92)';
      ctx.fillRect(-metrics.width / 2 - padX, -18, metrics.width + padX * 2, 16);
      ctx.fillStyle = isDark ? '#E2E8F0' : color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, -10);
      ctx.restore();
    };

    // 4. Entities (culled to viewport via R-tree)
    const culledEntities = spatialIndex.queryViewport(
      viewport,
      size.width,
      size.height,
      80
    );
    const renderEntities = culledEntities.map((e) =>
      dragPreviewEntity && e.id === dragPreviewEntity.id ? dragPreviewEntity : e
    );

    for (const ent of renderEntities) {
      if (!isEntityVisible(ent, layers)) continue;
      const isSelected = selectedIds.includes(ent.id);
      const stroke = isSelected ? '#B45309' : ent.color || '#0F5132';

      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isSelected ? 3 : ent.strokeWidth || 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (ent.kind === 'line') {
        const a = worldToScreen(ent.start, viewport, size.width, size.height);
        const b = worldToScreen(ent.end, viewport, size.width, size.height);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (isSelected) drawEdgeLabel(ent.start, ent.end, '#B45309', true);
      } else if (ent.kind === 'polyline') {
        if (ent.points.length >= 2) {
          ctx.beginPath();
          const p0 = worldToScreen(ent.points[0], viewport, size.width, size.height);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < ent.points.length; i++) {
            const pi = worldToScreen(ent.points[i], viewport, size.width, size.height);
            ctx.lineTo(pi.x, pi.y);
          }
          if (ent.closed) ctx.closePath();
          ctx.stroke();
          for (let i = 0; i < ent.points.length - 1; i++) {
            drawEdgeLabel(ent.points[i], ent.points[i + 1], '#334155');
          }
        }
      } else if (ent.kind === 'polygon' || ent.kind === 'rectangle') {
        if (ent.points.length >= 3) {
          ctx.beginPath();
          const p0 = worldToScreen(ent.points[0], viewport, size.width, size.height);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < ent.points.length; i++) {
            const pi = worldToScreen(ent.points[i], viewport, size.width, size.height);
            ctx.lineTo(pi.x, pi.y);
          }
          ctx.closePath();
          const baseFill =
            ent.kind === 'polygon' ? ent.fillColor || '#10B981' : ent.color || '#0F5132';
          ctx.fillStyle = isSelected ? 'rgba(180, 83, 9, 0.16)' : `${baseFill}22`;
          ctx.fill();
          ctx.stroke();

          for (let i = 0; i < ent.points.length; i++) {
            drawEdgeLabel(
              ent.points[i],
              ent.points[(i + 1) % ent.points.length],
              isSelected ? '#92400E' : '#1E293B'
            );
          }

          for (const v of ent.points) {
            const sv = worldToScreen(v, viewport, size.width, size.height);
            ctx.fillStyle = isSelected ? '#B45309' : stroke;
            ctx.beginPath();
            ctx.arc(sv.x, sv.y, isSelected ? 4.5 : 3, 0, Math.PI * 2);
            ctx.fill();
          }

          const centroid = polygonCentroid(ent.points);
          const sc = worldToScreen(centroid, viewport, size.width, size.height);
          const areaSqFt = polygonAreaSqFt(ent.points);
          const areaVal = fromSqFt(areaSqFt, doc.areaUnit, doc.unitProfile);
          const title =
            ent.kind === 'polygon' && ent.plotNumber
              ? `${lang === 'bn' ? 'দাগ' : 'Plot'} ${ent.plotNumber}`
              : '';
          const areaLine = `${formatNumber(areaVal, 2, lang)} ${getAreaUnitLabel(
            doc.areaUnit,
            lang
          )}`;

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (title) {
            ctx.font = `700 12px ${FONT_STACK}`;
            ctx.fillStyle = isDark ? '#F1F5F9' : '#0F172A';
            ctx.fillText(title, sc.x, sc.y - 8);
            ctx.font = `600 12px ${FONT_STACK}`;
            ctx.fillStyle = isDark ? '#34D399' : '#0F5132';
            ctx.fillText(areaLine, sc.x, sc.y + 8);
          } else {
            ctx.font = `700 12px ${FONT_STACK}`;
            ctx.fillStyle = isDark ? '#34D399' : '#0F5132';
            ctx.fillText(areaLine, sc.x, sc.y);
          }
        }
      } else if (ent.kind === 'circle') {
        const c = worldToScreen(ent.center, viewport, size.width, size.height);
        const rPx = ent.radiusFt * viewport.zoomPxPerFt;
        ctx.beginPath();
        ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 81, 50, 0.08)';
        ctx.fill();
        ctx.stroke();
        if (isSelected) {
          drawBadge(
            c,
            `R = ${formatNumber(fromFeet(ent.radiusFt, doc.linearUnit), 1, lang)} ${getLinearUnitLabel(doc.linearUnit, lang)}`,
            '#B45309'
          );
        }
      } else if (ent.kind === 'arc') {
        const pts = sampleArcPoints(
          ent.center,
          ent.radiusFt,
          ent.startAngleRad,
          ent.endAngleRad,
          ent.anticlockwise ?? true,
          36
        );
        if (pts.length >= 2) {
          ctx.beginPath();
          const p0 = worldToScreen(pts[0], viewport, size.width, size.height);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < pts.length; i++) {
            const pi = worldToScreen(pts[i], viewport, size.width, size.height);
            ctx.lineTo(pi.x, pi.y);
          }
          ctx.stroke();
          if (isSelected) {
            const len = arcLengthFt(
              ent.radiusFt,
              ent.startAngleRad,
              ent.endAngleRad,
              ent.anticlockwise ?? true
            );
            const sc = worldToScreen(ent.center, viewport, size.width, size.height);
            drawBadge(
              sc,
              `R=${formatNumber(ent.radiusFt, 1, lang)} · L=${formatNumber(len, 1, lang)}`,
              '#B45309'
            );
          }
        }
      } else if (ent.kind === 'point') {
        const p = worldToScreen(ent.position, viewport, size.width, size.height);
        ctx.fillStyle = stroke;
        if (ent.marker === 'pillar') {
          ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (ent.label) {
          ctx.font = `600 11px ${FONT_STACK}`;
          ctx.fillStyle = isDark ? '#F1F5F9' : '#1E293B';
          ctx.fillText(ent.label, p.x + 8, p.y - 6);
        }
      } else if (ent.kind === 'text') {
        const p = worldToScreen(ent.position, viewport, size.width, size.height);
        const pxSize = Math.max(11, Math.min(36, ent.heightFt * viewport.zoomPxPerFt));
        ctx.save();
        ctx.translate(p.x, p.y);
        if (ent.rotationDeg) ctx.rotate((-ent.rotationDeg * Math.PI) / 180);
        ctx.font = `600 ${pxSize}px ${FONT_STACK}`;
        ctx.fillStyle = isDark && stroke === '#1E293B' ? '#E2E8F0' : stroke;
        ctx.fillText(ent.text, 0, 0);
        ctx.restore();
      } else if (ent.kind === 'dimension') {
        const a = worldToScreen(ent.start, viewport, size.width, size.height);
        const b = worldToScreen(ent.end, viewport, size.width, size.height);
        ctx.strokeStyle = isSelected ? '#B45309' : stroke || '#0369A1';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const distFt = distance2D(ent.start, ent.end);
        const val = fromFeet(distFt, doc.linearUnit);
        const mid = midpoint2D(a, b);
        let text = `${formatNumber(val, 2, lang)} ${getLinearUnitLabel(doc.linearUnit, lang)}`;
        if (ent.dimType === 'bearing') {
          const wcb = azimuthDegrees(ent.start, ent.end);
          const rb = wcbToReducedBearing(wcb);
          text = `${text} · ${lang === 'bn' ? rb.formattedBn : rb.formattedEn}`;
        }
        drawBadge(mid, text, isSelected ? '#B45309' : '#0369A1', '#FFFFFF');
      }

      if (isSelected) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#B45309';
        ctx.lineWidth = 2;
        for (const v of getEntityVertices(ent)) {
          const sv = worldToScreen(v, viewport, size.width, size.height);
          ctx.fillRect(sv.x - 4, sv.y - 4, 8, 8);
          ctx.strokeRect(sv.x - 4, sv.y - 4, 8, 8);
        }
      }

      ctx.restore();
    }

    // 5. Live Draft Preview with Length / Angle / Area / Radius Labels
    if (draftPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#0F5132';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 5]);
      const screenPts = draftPoints.map((p) =>
        worldToScreen(p, viewport, size.width, size.height)
      );
      const liveEnd = cursorWorld
        ? worldToScreen(cursorWorld, viewport, size.width, size.height)
        : null;

      if (
        (activeTool === 'draw-rect' || activeTool === 'pantograph-window') &&
        liveEnd &&
        cursorWorld
      ) {
        const p0 = screenPts[0];
        const rx = Math.min(p0.x, liveEnd.x);
        const ry = Math.min(p0.y, liveEnd.y);
        const rw = Math.abs(liveEnd.x - p0.x);
        const rh = Math.abs(liveEnd.y - p0.y);
        const boxColor = activeTool === 'pantograph-window' ? '#0D9488' : '#0F5132';
        ctx.strokeStyle = boxColor;
        ctx.strokeRect(rx, ry, rw, rh);
        const wFt = Math.abs(cursorWorld.x - draftPoints[0].x);
        const hFt = Math.abs(cursorWorld.y - draftPoints[0].y);
        const areaB = computeAreaBreakdown(wFt * hFt, doc.unitProfile);
        drawBadge(
          { x: rx + rw / 2, y: ry + rh / 2 },
          `${formatNumber(wFt, 1, lang)} × ${formatNumber(hFt, 1, lang)} ft (${formatNumber(areaB.shotok, 2, lang)} ${lang === 'bn' ? 'শতক' : 'sh'})`,
          boxColor
        );
      } else if (activeTool === 'draw-circle' && liveEnd && cursorWorld) {
        const p0 = screenPts[0];
        const r = distance2D(p0, liveEnd);
        const rFt = distance2D(draftPoints[0], cursorWorld);
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(liveEnd.x, liveEnd.y);
        ctx.stroke();
        const mid = midpoint2D(p0, liveEnd);
        drawBadge(
          mid,
          `R = ${formatNumber(fromFeet(rFt, doc.linearUnit), 2, lang)} ${getLinearUnitLabel(doc.linearUnit, lang)}`,
          '#0F5132'
        );
      } else if (activeTool === 'draw-arc' && cursorWorld) {
        if (draftPoints.length === 1 && liveEnd) {
          ctx.beginPath();
          ctx.moveTo(screenPts[0].x, screenPts[0].y);
          ctx.lineTo(liveEnd.x, liveEnd.y);
          ctx.stroke();
          drawEdgeLabel(draftPoints[0], cursorWorld, '#0F5132', true);
        } else if (draftPoints.length === 2) {
          const solved = arcFromThreePoints(
            draftPoints[0],
            draftPoints[1],
            cursorWorld
          );
          if (solved) {
            const pts = sampleArcPoints(
              solved.center,
              solved.radiusFt,
              solved.startAngleRad,
              solved.endAngleRad,
              solved.anticlockwise,
              36
            );
            ctx.beginPath();
            const a0 = worldToScreen(pts[0], viewport, size.width, size.height);
            ctx.moveTo(a0.x, a0.y);
            for (let i = 1; i < pts.length; i++) {
              const ai = worldToScreen(pts[i], viewport, size.width, size.height);
              ctx.lineTo(ai.x, ai.y);
            }
            ctx.stroke();

            const cScr = worldToScreen(solved.center, viewport, size.width, size.height);
            ctx.strokeStyle = '#94A3B8';
            ctx.beginPath();
            ctx.moveTo(cScr.x, cScr.y);
            ctx.lineTo(liveEnd!.x, liveEnd!.y);
            ctx.stroke();

            const sweepDeg =
              (arcSweepAngleRad(
                solved.startAngleRad,
                solved.endAngleRad,
                solved.anticlockwise
              ) *
                180) /
              Math.PI;
            const lenFt = arcLengthFt(
              solved.radiusFt,
              solved.startAngleRad,
              solved.endAngleRad,
              solved.anticlockwise
            );
            drawBadge(
              { x: liveEnd!.x, y: liveEnd!.y - 24 },
              `R=${formatNumber(solved.radiusFt, 1, lang)} · ${formatNumber(sweepDeg, 0, lang)}° · L=${formatNumber(lenFt, 1, lang)}`,
              '#0F5132'
            );
          } else if (liveEnd) {
            ctx.beginPath();
            ctx.moveTo(screenPts[0].x, screenPts[0].y);
            ctx.lineTo(screenPts[1].x, screenPts[1].y);
            ctx.lineTo(liveEnd.x, liveEnd.y);
            ctx.stroke();
          }
        }
      } else if (activeTool === 'measure-angle' && cursorWorld) {
        ctx.strokeStyle = '#7C3AED';
        if (draftPoints.length === 1 && liveEnd) {
          ctx.beginPath();
          ctx.moveTo(screenPts[0].x, screenPts[0].y);
          ctx.lineTo(liveEnd.x, liveEnd.y);
          ctx.stroke();
          drawEdgeLabel(draftPoints[0], cursorWorld, '#7C3AED', false);
        } else if (draftPoints.length >= 2 && liveEnd) {
          const [armA, vertex] = draftPoints;
          const sA = screenPts[0];
          const sV = screenPts[1];
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(sA.x, sA.y);
          ctx.lineTo(sV.x, sV.y);
          ctx.lineTo(liveEnd.x, liveEnd.y);
          ctx.stroke();

          const deg = interiorAngleDegrees(armA, vertex, cursorWorld);
          const a1 = Math.atan2(sA.y - sV.y, sA.x - sV.x);
          const a2 = Math.atan2(liveEnd.y - sV.y, liveEnd.x - sV.x);
          let diff = a2 - a1;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          ctx.beginPath();
          ctx.arc(sV.x, sV.y, 26, a1, a1 + diff, diff < 0);
          ctx.stroke();
          drawBadge(
            { x: sV.x, y: sV.y - 34 },
            `${formatNumber(deg, 1, lang)}°`,
            '#7C3AED'
          );
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(screenPts[0].x, screenPts[0].y);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }
        if (liveEnd) ctx.lineTo(liveEnd.x, liveEnd.y);
        if (
          (activeTool === 'draw-polygon' || activeTool === 'measure-area') &&
          screenPts.length >= 3 &&
          liveEnd
        ) {
          ctx.lineTo(screenPts[0].x, screenPts[0].y);
        }
        ctx.stroke();

        // Edge labels on placed segments during corner tapping
        for (let i = 0; i < draftPoints.length - 1; i++) {
          drawEdgeLabel(draftPoints[i], draftPoints[i + 1], '#0F5132', false);
        }
        if (cursorWorld) {
          const last = draftPoints[draftPoints.length - 1];
          drawEdgeLabel(last, cursorWorld, '#0F5132', true);
        }
      }

      ctx.setLineDash([]);
      for (let i = 0; i < screenPts.length; i++) {
        ctx.fillStyle = i === 0 ? '#B45309' : '#0F5132';
        ctx.beginPath();
        ctx.arc(screenPts[i].x, screenPts[i].y, i === 0 ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 5a. Saved/Finished Temporary Wizard Measurement & Angle Previews
    if (measurementPreview && measurementPreview.points.length >= 2) {
      ctx.save();
      const spts = measurementPreview.points.map((p) =>
        worldToScreen(p, viewport, size.width, size.height)
      );
      ctx.strokeStyle = '#0F5132';
      ctx.fillStyle = 'rgba(15, 81, 50, 0.16)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(spts[0].x, spts[0].y);
      for (let i = 1; i < spts.length; i++) {
        ctx.lineTo(spts[i].x, spts[i].y);
      }
      if (measurementPreview.mode === 'area' && spts.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      const edgeCount =
        measurementPreview.mode === 'area' ? spts.length : spts.length - 1;
      for (let i = 0; i < edgeCount; i++) {
        drawEdgeLabel(
          measurementPreview.points[i],
          measurementPreview.points[(i + 1) % measurementPreview.points.length],
          '#0F5132',
          false
        );
      }
      for (const sp of spts) {
        ctx.fillStyle = '#B45309';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (anglePreview) {
      ctx.save();
      const sA = worldToScreen(anglePreview.armA, viewport, size.width, size.height);
      const sV = worldToScreen(anglePreview.vertex, viewport, size.width, size.height);
      const sB = worldToScreen(anglePreview.armB, viewport, size.width, size.height);
      ctx.strokeStyle = '#7C3AED';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(sA.x, sA.y);
      ctx.lineTo(sV.x, sV.y);
      ctx.lineTo(sB.x, sB.y);
      ctx.stroke();
      const deg = interiorAngleDegrees(
        anglePreview.armA,
        anglePreview.vertex,
        anglePreview.armB
      );
      const a1 = Math.atan2(sA.y - sV.y, sA.x - sV.x);
      const a2 = Math.atan2(sB.y - sV.y, sB.x - sV.x);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ctx.beginPath();
      ctx.arc(sV.x, sV.y, 26, a1, a1 + diff, diff < 0);
      ctx.stroke();
      drawBadge({ x: sV.x, y: sV.y - 34 }, `${formatNumber(deg, 1, lang)}°`, '#7C3AED');
      ctx.restore();
    }

    // 5b. Window / Crossing Selection Box Overlay (also Pantograph drag preview)
    if (selectionBox) {
      const isPantographDrag = activeTool === 'pantograph-window';
      const isWindow = selectionBox.endScreen.x >= selectionBox.startScreen.x;
      const x = Math.min(selectionBox.startScreen.x, selectionBox.endScreen.x);
      const y = Math.min(selectionBox.startScreen.y, selectionBox.endScreen.y);
      const w = Math.abs(selectionBox.endScreen.x - selectionBox.startScreen.x);
      const h = Math.abs(selectionBox.endScreen.y - selectionBox.startScreen.y);

      ctx.save();
      ctx.fillStyle = isPantographDrag
        ? 'rgba(13, 148, 136, 0.16)'
        : isWindow
        ? 'rgba(37, 99, 235, 0.14)'
        : 'rgba(22, 163, 74, 0.14)';
      ctx.strokeStyle = isPantographDrag ? '#0D9488' : isWindow ? '#2563EB' : '#16A34A';
      ctx.lineWidth = 2.2;
      if (!isWindow || isPantographDrag) ctx.setLineDash([6, 4]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      if (w > 24 && h > 18) {
        drawBadge(
          { x: x + w / 2, y: y - 12 },
          isPantographDrag
            ? lang === 'bn'
              ? 'প্যান্টাগ্রাফ উইন্ডো'
              : 'Pantograph Window'
            : isWindow
            ? lang === 'bn'
              ? 'উইন্ডো (সম্পূর্ণ ভিতরের)'
              : 'Window (Inside)'
            : lang === 'bn'
            ? 'ক্রসিং (স্পর্শসহ)'
            : 'Crossing (Touching)',
          isPantographDrag ? '#0D9488' : isWindow ? '#2563EB' : '#16A34A'
        );
      }
      ctx.restore();
    }

    // 5c. Demarcation Overlap Intersection Highlight & Alignment Residual Vectors
    if (overlapRings.length > 0) {
      ctx.save();
      for (const ring of overlapRings) {
        if (ring.length < 3) continue;
        ctx.beginPath();
        const p0 = worldToScreen(ring[0], viewport, size.width, size.height);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < ring.length; i++) {
          const pi = worldToScreen(ring[i], viewport, size.width, size.height);
          ctx.lineTo(pi.x, pi.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.34)';
        ctx.fill();
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 4]);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (alignmentVectors.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      for (const vec of alignmentVectors) {
        const sFrom = worldToScreen(vec.from, viewport, size.width, size.height);
        const sTo = worldToScreen(vec.to, viewport, size.width, size.height);
        ctx.beginPath();
        ctx.moveTo(sFrom.x, sFrom.y);
        ctx.lineTo(sTo.x, sTo.y);
        ctx.stroke();
        if (distance2D(sFrom, sTo) > 8) {
          drawBadge(midpoint2D(sFrom, sTo), vec.label, '#DC2626', '#FFFFFF');
        }
      }
      ctx.restore();
    }

    // 5d. Committed Pantograph Re-plot Crop Window
    if (pantographWindow) {
      const tl = worldToScreen(
        { x: pantographWindow.minX, y: pantographWindow.maxY },
        viewport,
        size.width,
        size.height
      );
      const br = worldToScreen(
        { x: pantographWindow.maxX, y: pantographWindow.minY },
        viewport,
        size.width,
        size.height
      );
      const rx = Math.min(tl.x, br.x);
      const ry = Math.min(tl.y, br.y);
      const rw = Math.abs(br.x - tl.x);
      const rh = Math.abs(br.y - tl.y);
      ctx.save();
      ctx.fillStyle = 'rgba(13, 148, 136, 0.14)';
      ctx.strokeStyle = '#0D9488';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([8, 5]);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      const wFt = Math.abs(pantographWindow.maxX - pantographWindow.minX);
      const hFt = Math.abs(pantographWindow.maxY - pantographWindow.minY);
      drawBadge(
        { x: rx + rw / 2, y: Math.max(20, ry - 14) },
        `${lang === 'bn' ? 'রি-প্লট উইন্ডো' : 'Crop Window'}: ${formatNumber(
          wFt,
          1,
          lang
        )} × ${formatNumber(hFt, 1, lang)} ${lang === 'bn' ? 'ফু' : 'ft'}`,
        '#0F766E'
      );
      ctx.restore();
    }

    // 5e. Plot Division (ভাগবণ্টন) Live Preview Overlay & Draggable Split Handles
    if (partitionOverlay) {
      ctx.save();
      for (const part of partitionOverlay.parts) {
        for (const ring of part.rings) {
          if (ring.length < 3) continue;
          ctx.beginPath();
          const p0 = worldToScreen(ring[0], viewport, size.width, size.height);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < ring.length; i++) {
            const pi = worldToScreen(ring[i], viewport, size.width, size.height);
            ctx.lineTo(pi.x, pi.y);
          }
          ctx.closePath();
          ctx.fillStyle = `${part.color}33`;
          ctx.fill();
          ctx.strokeStyle = part.color;
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
        const cScr = worldToScreen(part.centroid, viewport, size.width, size.height);
        drawBadge(
          { x: cScr.x, y: cScr.y - 8 },
          part.label,
          part.color,
          '#FFFFFF'
        );
        if (part.subLabel) {
          drawBadge(
            { x: cScr.x, y: cScr.y + 12 },
            part.subLabel,
            isDark ? '#0F172A' : '#FFFFFF',
            isDark ? '#E2E8F0' : '#141A17'
          );
        }
      }

      if (partitionOverlay.chosenEdge) {
        const ea = worldToScreen(partitionOverlay.chosenEdge.a, viewport, size.width, size.height);
        const eb = worldToScreen(partitionOverlay.chosenEdge.b, viewport, size.width, size.height);
        ctx.strokeStyle = '#1D4ED8';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(ea.x, ea.y);
        ctx.lineTo(eb.x, eb.y);
        ctx.stroke();
        if (partitionOverlay.chosenEdge.label) {
          drawBadge(
            midpoint2D(ea, eb),
            partitionOverlay.chosenEdge.label,
            '#1D4ED8',
            '#FFFFFF'
          );
        }
      }

      if (partitionOverlay.pivotPoint) {
        const ps = worldToScreen(partitionOverlay.pivotPoint, viewport, size.width, size.height);
        ctx.strokeStyle = '#7C3AED';
        ctx.fillStyle = '#7C3AED';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const line of partitionOverlay.splitLines) {
        ctx.strokeStyle = '#DC2626';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        for (const seg of line.segments) {
          const sa = worldToScreen(seg.a, viewport, size.width, size.height);
          const sb = worldToScreen(seg.b, viewport, size.width, size.height);
          ctx.beginPath();
          ctx.moveTo(sa.x, sa.y);
          ctx.lineTo(sb.x, sb.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        if (partitionOverlay.interactive) {
          const hs = worldToScreen(line.handlePoint, viewport, size.width, size.height);
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(hs.x, hs.y, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#DC2626';
          ctx.beginPath();
          ctx.arc(hs.x, hs.y, 4.5, 0, Math.PI * 2);
          ctx.fill();

          if (line.label) {
            drawBadge({ x: hs.x, y: hs.y - 22 }, line.label, '#DC2626', '#FFFFFF');
          }
        }
      }
      ctx.restore();
    }

    // 6. Picked calibration / tie-point pins
    for (const pin of pickedPins) {
      const sp = worldToScreen(pin.point, viewport, size.width, size.height);
      ctx.save();
      ctx.strokeStyle = pin.color || '#DC2626';
      ctx.fillStyle = pin.color || '#DC2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sp.x - 12, sp.y);
      ctx.lineTo(sp.x + 12, sp.y);
      ctx.moveTo(sp.x, sp.y - 12);
      ctx.lineTo(sp.x, sp.y + 12);
      ctx.stroke();
      ctx.font = `700 12px ${FONT_STACK}`;
      ctx.fillText(pin.label, sp.x + 10, sp.y - 10);
      ctx.restore();
    }

    // 7. Distinct Visible Snap Marker
    if (activeSnap) {
      const sp = worldToScreen(activeSnap.point, viewport, size.width, size.height);
      ctx.save();
      ctx.lineWidth = 2.2;
      if (activeSnap.type === 'endpoint') {
        ctx.strokeStyle = '#D97706';
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.fillRect(sp.x - 6, sp.y - 6, 12, 12);
        ctx.strokeRect(sp.x - 6, sp.y - 6, 12, 12);
      } else if (activeSnap.type === 'midpoint') {
        ctx.strokeStyle = '#059669';
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - 7);
        ctx.lineTo(sp.x + 7, sp.y + 6);
        ctx.lineTo(sp.x - 7, sp.y + 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (activeSnap.type === 'center') {
        ctx.strokeStyle = '#7C3AED';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#7C3AED';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (activeSnap.type === 'intersection') {
        ctx.strokeStyle = '#DC2626';
        ctx.beginPath();
        ctx.moveTo(sp.x - 6, sp.y - 6);
        ctx.lineTo(sp.x + 6, sp.y + 6);
        ctx.moveTo(sp.x + 6, sp.y - 6);
        ctx.lineTo(sp.x - 6, sp.y + 6);
        ctx.stroke();
      } else if (activeSnap.type === 'perpendicular') {
        ctx.strokeStyle = '#0369A1';
        ctx.beginPath();
        ctx.moveTo(sp.x - 6, sp.y - 6);
        ctx.lineTo(sp.x - 6, sp.y + 6);
        ctx.lineTo(sp.x + 6, sp.y + 6);
        ctx.stroke();
        ctx.strokeRect(sp.x - 6, sp.y, 6, 6);
      } else {
        ctx.strokeStyle = '#D97706';
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - 7);
        ctx.lineTo(sp.x + 7, sp.y);
        ctx.lineTo(sp.x, sp.y + 7);
        ctx.lineTo(sp.x - 7, sp.y);
        ctx.closePath();
        ctx.stroke();
      }
      drawBadge(
        { x: sp.x + 22, y: sp.y - 16 },
        getSnapLabel(activeSnap.type, lang),
        '#1E293B',
        '#FFFFFF'
      );
      ctx.restore();
    }

    // 8. Scale bar (bottom-left) & North indicator (top-right)
    const barWorldFt = gridStepFt;
    const barPx = barWorldFt * viewport.zoomPxPerFt;
    if (barPx >= 32 && barPx <= 180) {
      const bx = 16;
      const by = size.height - 20;
      ctx.save();
      ctx.strokeStyle = isDark ? '#94A3B8' : '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by - 5);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + barPx, by);
      ctx.lineTo(bx + barPx, by - 5);
      ctx.stroke();
      ctx.font = `600 11px ${FONT_STACK}`;
      ctx.fillStyle = isDark ? '#CBD5E1' : '#334155';
      const val = fromFeet(barWorldFt, doc.linearUnit);
      ctx.fillText(
        `${formatNumber(val, 1, lang)} ${getLinearUnitLabel(doc.linearUnit, lang)}`,
        bx,
        by - 9
      );
      ctx.restore();
    }

    // North arrow (top-right, below SnapBar)
    ctx.save();
    const nx = size.width - 28;
    const ny = 70;
    ctx.fillStyle = isDark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.88)';
    ctx.strokeStyle = isDark ? '#334155' : '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(nx, ny, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isDark ? '#34D399' : '#0F5132';
    ctx.font = `700 12px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lang === 'bn' ? 'উ↑' : 'N↑', nx, ny);
    ctx.restore();

    // 9. Precision Magnifier Loupe while placing a point
    const isPointPlacementMode =
      activeTool !== 'select' && activeTool !== 'box-select' && activeTool !== 'pan';
    if (
      isPointPlacementMode &&
      (isPlacing || activeTool === 'pick-point') &&
      cursorScreen &&
      cursorWorld
    ) {
      const loupeR = 56;
      const loupeZoom = viewport.zoomPxPerFt * 2.5;
      const lx = Math.max(
        loupeR + 10,
        Math.min(size.width - loupeR - 10, cursorScreen.x)
      );
      const ly =
        cursorScreen.y > loupeR * 2 + 24
          ? cursorScreen.y - (loupeR + 40)
          : cursorScreen.y + (loupeR + 40);

      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = isDark ? '#0B1220' : '#FAFBF8';
      ctx.beginPath();
      ctx.arc(lx, ly, loupeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(lx, ly, loupeR, 0, Math.PI * 2);
      ctx.clip();

      const loupeToScreen = (w: Point2D): Point2D => ({
        x: lx + (w.x - cursorWorld.x) * loupeZoom,
        y: ly - (w.y - cursorWorld.y) * loupeZoom,
      });

      // Render raster layers inside loupe
      for (const layer of doc.rasterLayers) {
        if (!layer.visible) continue;
        const cached = imgCacheRef.current.get(layer.id);
        if (!cached || !cached.img.complete) continue;
        const org = loupeToScreen({ x: layer.transform.tx, y: layer.transform.ty });
        const sc = layer.transform.scaleFtPerPx * loupeZoom;
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.translate(org.x, org.y);
        ctx.rotate(-layer.transform.rotationRad);
        ctx.drawImage(cached.img, 0, 0, layer.widthPx * sc, layer.heightPx * sc);
        ctx.restore();
      }

      // Render entities inside loupe
      for (const ent of renderEntities) {
        if (!isEntityVisible(ent, layers)) continue;
        ctx.strokeStyle = ent.color || '#0F5132';
        ctx.lineWidth = 2;
        if (ent.kind === 'line') {
          const a = loupeToScreen(ent.start);
          const b = loupeToScreen(ent.end);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else if (
          (ent.kind === 'polygon' ||
            ent.kind === 'polyline' ||
            ent.kind === 'rectangle') &&
          ent.points.length >= 2
        ) {
          ctx.beginPath();
          const p0 = loupeToScreen(ent.points[0]);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < ent.points.length; i++) {
            const pi = loupeToScreen(ent.points[i]);
            ctx.lineTo(pi.x, pi.y);
          }
          if (ent.kind === 'polygon' || ent.kind === 'rectangle' || ent.closed)
            ctx.closePath();
          ctx.stroke();
        } else if (ent.kind === 'circle') {
          const c = loupeToScreen(ent.center);
          ctx.beginPath();
          ctx.arc(c.x, c.y, ent.radiusFt * loupeZoom, 0, Math.PI * 2);
          ctx.stroke();
        } else if (ent.kind === 'arc') {
          const pts = sampleArcPoints(
            ent.center,
            ent.radiusFt,
            ent.startAngleRad,
            ent.endAngleRad,
            ent.anticlockwise ?? true,
            24
          );
          if (pts.length >= 2) {
            ctx.beginPath();
            const p0 = loupeToScreen(pts[0]);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < pts.length; i++) {
              const pi = loupeToScreen(pts[i]);
              ctx.lineTo(pi.x, pi.y);
            }
            ctx.stroke();
          }
        }
      }

      // Render picked pins inside loupe
      for (const pin of pickedPins) {
        const sp = loupeToScreen(pin.point);
        ctx.strokeStyle = pin.color || '#DC2626';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Precision Crosshair at loupe center
      ctx.strokeStyle = activeSnap ? '#D97706' : '#DC2626';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lx - 18, ly);
      ctx.lineTo(lx + 18, ly);
      ctx.moveTo(lx, ly - 18);
      ctx.lineTo(lx, ly + 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();

      ctx.save();
      ctx.strokeStyle = activeSnap ? '#D97706' : '#0F5132';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lx, ly, loupeR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [
    doc,
    layers,
    spatialIndex,
    viewport,
    size,
    selectedIds,
    draftPoints,
    cursorWorld,
    cursorScreen,
    activeSnap,
    activeTool,
    pickedPins,
    selectedRasterId,
    dragPreviewEntity,
    selectionBox,
    measurementPreview,
    anglePreview,
    overlapRings,
    alignmentVectors,
    pantographWindow,
    lang,
    isDark,
    isPlacing,
  ]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="block h-full w-full touch-none cursor-crosshair"
      />
      {cursorWorld && (
        <div className="pointer-events-none absolute left-3 bottom-3 rounded-lg bg-white/90 dark:bg-slate-900/90 px-2.5 py-1 text-[11px] font-mono-num text-[#334155] dark:text-slate-200 border border-[#D4DBD6] dark:border-slate-700 shadow-xs">
          X: {formatNumber(cursorWorld.x, 1, lang)} · Y: {formatNumber(cursorWorld.y, 1, lang)}{' '}
          {lang === 'bn' ? 'ফু' : 'ft'}
        </div>
      )}
    </div>
  );
};
