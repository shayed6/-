import { describe, expect, it } from 'vitest';
import {
  arcFromThreePoints,
  arcLengthFt,
  arcMidpoint,
  offsetPolygon,
  partitionPolygonEqualParts,
  perpendicularFootOnSegment,
  pointToArcDistance,
  rasterPixelToWorld,
  segmentIntersection,
  selectEntitiesInBox,
  solveRasterTransformFromTwoPoints,
  splitPolygonByTargetArea,
  worldToRasterPixel,
} from '../core/cad/geometry';
import {
  applyOrthoConstraint,
  DEFAULT_SNAP_CONFIG,
  findSnapPoint,
  getSnapToleranceFt,
} from '../core/cad/snapping';
import {
  createArcEntity,
  createCircleEntity,
  createLineEntity,
  createPointEntity,
  createPolylineEntity,
  createRectangleEntity,
  createTextEntity,
  getDocumentLayers,
  isEntityVisible,
} from '../core/cad/entities';
import { createSpatialIndex } from '../core/cad/spatialIndex';
import {
  createHistory,
  dispatchCommand,
  redoHistory,
  undoHistory,
} from '../core/cad/commands';
import { createEmptyDocument, screenToWorld, worldToScreen } from '../core/cad/types';
import { polygonAreaSqFt } from '../core/survey/area';
import { distance2D, midpoint2D } from '../core/survey/coordinates';
import { exportDocumentToDxf, importDxfToEntities } from '../adapters/dxf';
import { exportDocumentToCsv } from '../adapters/csv';
import { parseProjectJson, serializeProjectJson } from '../adapters/nativeJson';
import { generateLicenseCode, validateLicenseCode } from '../access/license';

describe('CAD Geometry, Splitting & Arc Math', () => {
  it('computes distance, midpoint, perpendicular foot, and intersection', () => {
    expect(distance2D({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 8);
    expect(midpoint2D({ x: 2, y: 6 }, { x: 8, y: 10 })).toEqual({ x: 5, y: 8 });

    const foot = perpendicularFootOnSegment(
      { x: 4, y: 5 },
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    );
    expect(foot).toEqual({ x: 4, y: 0 });
    expect(
      perpendicularFootOnSegment({ x: 15, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBeNull();

    const hit = segmentIntersection(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 }
    );
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(5, 6);
    expect(hit!.y).toBeCloseTo(5, 6);
  });

  it('solves 3-point arcs accurately and rejects collinear points', () => {
    const collinear = arcFromThreePoints(
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 }
    );
    expect(collinear).toBeNull();

    // Semicircle on radius 10 centered at (0, 0) from (10, 0) through (0, 10) to (-10, 0)
    const arc = arcFromThreePoints(
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 }
    );
    expect(arc).not.toBeNull();
    expect(arc!.center.x).toBeCloseTo(0, 6);
    expect(arc!.center.y).toBeCloseTo(0, 6);
    expect(arc!.radiusFt).toBeCloseTo(10, 6);
    expect(arc!.anticlockwise).toBe(true);

    const len = arcLengthFt(
      arc!.radiusFt,
      arc!.startAngleRad,
      arc!.endAngleRad,
      arc!.anticlockwise
    );
    expect(len).toBeCloseTo(Math.PI * 10, 5);

    const mid = arcMidpoint(
      arc!.center,
      arc!.radiusFt,
      arc!.startAngleRad,
      arc!.endAngleRad,
      arc!.anticlockwise
    );
    expect(mid.x).toBeCloseTo(0, 5);
    expect(mid.y).toBeCloseTo(10, 5);

    expect(
      pointToArcDistance(
        { x: 0, y: 12 },
        arc!.center,
        arc!.radiusFt,
        arc!.startAngleRad,
        arc!.endAngleRad,
        arc!.anticlockwise
      )
    ).toBeCloseTo(2, 5);
  });

  it('splits a polygon into exact target area and equal N parts, and offsets polygons', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ];
    const split = splitPolygonByTargetArea(rect, 2000, 90);
    expect(split).not.toBeNull();
    expect(polygonAreaSqFt(split![0])).toBeCloseTo(2000, 2);
    expect(polygonAreaSqFt(split![1])).toBeCloseTo(6000, 2);

    const thirds = partitionPolygonEqualParts(rect, 3, 0);
    expect(thirds).toHaveLength(3);
    for (const part of thirds) {
      expect(polygonAreaSqFt(part)).toBeCloseTo(8000 / 3, 2);
    }

    const square = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    const expanded = offsetPolygon(square, 5);
    expect(polygonAreaSqFt(expanded)).toBeCloseTo(900, 4);
  });

  it('solves 2-point raster similarity transform accurately', () => {
    const t = solveRasterTransformFromTwoPoints(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 10, y: 20 },
      { x: 210, y: 20 }
    );
    expect(t).not.toBeNull();
    expect(t!.scaleFtPerPx).toBeCloseTo(2, 6);
    expect(t!.rotationRad).toBeCloseTo(0, 6);
    const roundTrip = worldToRasterPixel(rasterPixelToWorld({ x: 50, y: 25 }, t!), t!);
    expect(roundTrip.x).toBeCloseTo(50, 6);
    expect(roundTrip.y).toBeCloseTo(25, 6);
  });

  it('transforms world <-> screen without mutating world coordinates', () => {
    const vp = { centerX: 50, centerY: 40, zoomPxPerFt: 5 };
    const world = { x: 75, y: 60 };
    const scr = worldToScreen(world, vp, 800, 600);
    const back = screenToWorld(scr, vp, 800, 600);
    expect(back.x).toBeCloseTo(world.x, 8);
    expect(back.y).toBeCloseTo(world.y, 8);
  });
});

describe('Entities, Spatial Index (rbush), Selection & Snapping', () => {
  it('constructs all 7 CAD entity types with standard metadata & geometry fields', () => {
    const pt = createPointEntity({ x: 1, y: 2 });
    const line = createLineEntity({ x: 0, y: 0 }, { x: 10, y: 0 });
    const pline = createPolylineEntity([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
    const rect = createRectangleEntity({ x: 0, y: 0 }, { x: 10, y: 8 });
    const circle = createCircleEntity({ x: 5, y: 5 }, 3);
    const arc = createArcEntity({ x: 0, y: 0 }, 10, 0, Math.PI / 2, true);
    const txt = createTextEntity({ x: 2, y: 3 }, 'দাগ ১০১');

    expect([pt.type, line.type, pline.type, rect.type, circle.type, arc.type, txt.type]).toEqual([
      'POINT',
      'LINE',
      'POLYLINE',
      'RECTANGLE',
      'CIRCLE',
      'ARC',
      'TEXT',
    ]);
    expect(rect.visible).toBe(true);
    expect(rect.locked).toBe(false);
    expect(rect.geometry).toBeDefined();
    expect(rect.properties).toBeDefined();
  });

  it('supports rbush viewport culling and window vs crossing box selection', () => {
    const lInside = createLineEntity({ x: 10, y: 10 }, { x: 20, y: 20 }, { id: 'inside' });
    const lCross = createLineEntity({ x: 0, y: 15 }, { x: 50, y: 15 }, { id: 'cross' });
    const lFar = createLineEntity({ x: 500, y: 500 }, { x: 520, y: 520 }, { id: 'far' });

    const entities = [lInside, lCross, lFar];
    const index = createSpatialIndex(entities);

    // Viewport centered around (20, 20) at 4 px/ft on 400x400 covers [-30..70, -30..70]
    const visibleInView = index.queryViewport(
      { centerX: 20, centerY: 20, zoomPxPerFt: 4 },
      400,
      400,
      0
    );
    expect(visibleInView.map((e) => e.id)).toEqual(['inside', 'cross']);

    const box = { minX: 5, minY: 5, maxX: 25, maxY: 25 };
    const winSel = selectEntitiesInBox(entities, box, 'window');
    expect(winSel.map((e) => e.id)).toEqual(['inside']);

    const crossSel = selectEntitiesInBox(entities, box, 'crossing');
    expect(crossSel.map((e) => e.id)).toEqual(['inside', 'cross']);
  });

  it('snaps to endpoints, intersections, centers, midpoints, perpendiculars & applies Ortho', () => {
    const l1 = createLineEntity({ x: 0, y: 0 }, { x: 10, y: 0 }, { id: 'l1' });
    const l2 = createLineEntity({ x: 5, y: -5 }, { x: 5, y: 5 }, { id: 'l2' });
    const c1 = createCircleEntity({ x: 30, y: 30 }, 8, { id: 'c1' });
    const entities = [l1, l2, c1];
    const idx = createSpatialIndex(entities);

    expect(getSnapToleranceFt(18, 6)).toBeCloseTo(3, 6);
    expect(applyOrthoConstraint({ x: 18, y: 3 }, { x: 10, y: 0 })).toEqual({ x: 18, y: 0 });
    expect(applyOrthoConstraint({ x: 2, y: 15 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 15 });

    const snapEnd = findSnapPoint({ x: 0.4, y: 0.2 }, entities, DEFAULT_SNAP_CONFIG, 1, {
      spatialIndex: idx,
    });
    expect(snapEnd?.type).toBe('endpoint');
    expect(snapEnd?.point).toEqual({ x: 0, y: 0 });

    const snapInter = findSnapPoint({ x: 5.2, y: 0.2 }, entities, DEFAULT_SNAP_CONFIG, 1, {
      spatialIndex: idx,
    });
    expect(snapInter?.type).toBe('intersection');
    expect(snapInter?.point.x).toBeCloseTo(5, 6);

    const snapCtr = findSnapPoint({ x: 30.3, y: 29.8 }, entities, DEFAULT_SNAP_CONFIG, 1, {
      spatialIndex: idx,
    });
    expect(snapCtr?.type).toBe('center');
    expect(snapCtr?.point).toEqual({ x: 30, y: 30 });

    // Disable endpoint/intersection/center/midpoint to verify perpendicular foot from fromPoint
    const perpCfg = {
      ...DEFAULT_SNAP_CONFIG,
      endpoint: false,
      intersection: false,
      center: false,
      midpoint: false,
      perpendicular: true,
    };
    const snapPerp = findSnapPoint({ x: 7.2, y: 0.3 }, entities, perpCfg, 1, {
      fromPoint: { x: 7, y: 12 },
      spatialIndex: idx,
    });
    expect(snapPerp?.type).toBe('perpendicular');
    expect(snapPerp?.point.x).toBeCloseTo(7, 6);
    expect(snapPerp?.point.y).toBeCloseTo(0, 6);
  });
});

describe('Command History (Undo/Redo), Layers & Properties', () => {
  it('supports add, move, edit-property, delete, and layer commands with undo/redo', () => {
    const initial = createEmptyDocument('Test');
    expect(getDocumentLayers(initial)).toHaveLength(5);

    let hist = createHistory(initial);
    const l1 = createLineEntity({ x: 0, y: 0 }, { x: 10, y: 0 }, { id: 'l1' });
    const txt = createTextEntity({ x: 5, y: 5 }, 'পুরাতন', { id: 't1' });

    // 1. Add
    hist = dispatchCommand(hist, {
      type: 'ADD_ENTITIES',
      label: 'Add',
      entities: [l1, txt],
    });
    expect(hist.present.entities).toHaveLength(2);
    expect(initial.entities).toHaveLength(0);

    // 2. Move
    hist = dispatchCommand(hist, {
      type: 'MOVE_ENTITIES',
      label: 'Move',
      ids: ['l1'],
      dx: 10,
      dy: 5,
    });
    const movedLine = hist.present.entities.find((e) => e.id === 'l1');
    expect(movedLine?.kind === 'line' && movedLine.start).toEqual({ x: 10, y: 5 });

    // 3. Edit Properties + Lock
    hist = dispatchCommand(hist, {
      type: 'EDIT_ENTITY_PROPERTIES',
      label: 'Edit Props',
      ids: ['t1'],
      patch: { text: 'নতুন দাগ', color: '#DC2626', locked: true },
    });
    const editedTxt = hist.present.entities.find((e) => e.id === 't1');
    expect(editedTxt?.color).toBe('#DC2626');
    expect(editedTxt?.locked).toBe(true);
    expect(editedTxt?.kind === 'text' && editedTxt.text).toBe('নতুন দাগ');

    // Locked entity resists MOVE_ENTITIES and standard DELETE_ENTITIES
    hist = dispatchCommand(hist, {
      type: 'MOVE_ENTITIES',
      label: 'Try Move Locked',
      ids: ['t1'],
      dx: 50,
      dy: 50,
    });
    const stillLockedTxt = hist.present.entities.find((e) => e.id === 't1');
    expect(stillLockedTxt?.kind === 'text' && stillLockedTxt.position).toEqual({ x: 5, y: 5 });

    hist = dispatchCommand(hist, {
      type: 'DELETE_ENTITIES',
      label: 'Delete',
      ids: ['l1', 't1'],
    });
    expect(hist.present.entities.map((e) => e.id)).toEqual(['t1']);

    // 4. Create & Update Layer visibility/name
    hist = dispatchCommand(hist, {
      type: 'CREATE_LAYER',
      label: 'New Layer',
      layer: { id: 'roads', name: 'Roads', color: '#7C3AED', visible: true, locked: false },
      setActive: true,
    });
    expect(hist.present.activeLayerId).toBe('roads');

    hist = dispatchCommand(hist, {
      type: 'UPDATE_LAYER',
      label: 'Hide Boundary',
      id: 'boundary',
      patch: { visible: false },
    });
    expect(isEntityVisible(l1, hist.present.layers)).toBe(false);

    // Undo restores visibility and entities cleanly
    hist = undoHistory(hist); // undo Hide Boundary
    expect(isEntityVisible(l1, hist.present.layers)).toBe(true);
    hist = undoHistory(hist); // undo Create Layer
    expect(hist.present.layers).toHaveLength(5);
    hist = undoHistory(hist); // undo Delete
    expect(hist.present.entities).toHaveLength(2);
    hist = redoHistory(hist); // redo Delete
    expect(hist.present.entities).toHaveLength(1);
  });
});

describe('Adapters (JSON, DXF, CSV) & License Validation', () => {
  it('round-trips native JSON and DXF', () => {
    const doc = createEmptyDocument('Mouza 45');
    doc.entities.push({
      id: 'p1',
      kind: 'polygon',
      type: 'POLYLINE',
      layer: 'Plots',
      layerId: 'plots',
      color: '#0F5132',
      plotNumber: '45',
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 40 },
        { x: 0, y: 40 },
      ],
    });
    doc.hasRasterMeasurement = true;

    const json = serializeProjectJson(doc);
    const parsed = parseProjectJson(json);
    expect(parsed.name).toBe('Mouza 45');
    expect(parsed.entities).toHaveLength(1);

    const dxf = exportDocumentToDxf(doc);
    expect(dxf).toContain('LWPOLYLINE');
    const dxfEntities = importDxfToEntities(dxf);
    expect(dxfEntities).toHaveLength(1);
    expect(dxfEntities[0].kind).toBe('polygon');

    const csv = exportDocumentToCsv(doc, 'en');
    expect(csv).toContain('approximate');
    expect(csv).toContain('2000.000');
  });

  it('generates and validates offline license codes', () => {
    const code = generateLicenseCode('DHAK', '2026');
    expect(validateLicenseCode(code).active).toBe(true);
    expect(validateLicenseCode('SCAD-FAKE-CODE-0000').active).toBe(false);
  });
});
