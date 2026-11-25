import { describe, expect, it } from 'vitest';
import { flipPixelX } from '../adapters/image';
import {
  rasterPixelToWorld,
  worldToRasterPixel,
} from '../core/cad/geometry';
import {
  RawRgbaImage,
  alignSheetBToSheetA,
  computeJoinedExportGeometry,
  computeJoinedWorldExtent,
  stitchRawRgbaLayers,
  warpRegionToSyntheticRaster,
} from '../core/cad/mapJointMath';
import { AlignmentPair, RasterLayer, RasterTransform } from '../core/cad/types';

function makeKnownSurveyMapImage(width = 240, height = 160): RawRgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Smooth continuous gradient + crisp cadastral parcel grid & diagonal road
      let r = Math.round(40 + (x / width) * 180);
      let g = Math.round(60 + (y / height) * 160);
      let b = Math.round(180 - (x / width) * 110);

      // Parcel boundary lines every 40 px
      if (x % 40 <= 1 || y % 40 <= 1) {
        r = 15;
        g = 81;
        b = 50;
      }
      // Diagonal mauza road crossing x=120 seam cleanly
      if (Math.abs(y - (0.4 * x + 30)) <= 2.2) {
        r = 180;
        g = 83;
        b = 9;
      }

      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('Map Joint (জমি জয়েন্ট) & Demarcation Flip', () => {
  it('aligns two synthetic cropped halves (rotated + scaled Sheet B) and stitches pixels accurately', () => {
    // Ground-truth full map: 240x160 px at 1 ft/px -> world X:[0..240], Y:[0..160]
    const fullImg = makeKnownSurveyMapImage(240, 160);
    const fullTransform: RasterTransform = {
      tx: 0,
      ty: 160,
      scaleFtPerPx: 1,
      rotationRad: 0,
    };

    // Sheet A covers left half + 20 ft overlap: world X:[0..140], Y:[0..160], 1 ft/px
    const sheetATransform: RasterTransform = {
      tx: 0,
      ty: 160,
      scaleFtPerPx: 1,
      rotationRad: 0,
    };
    const sheetARgba = warpRegionToSyntheticRaster(
      fullImg,
      fullTransform,
      140,
      160,
      sheetATransform
    );

    // Sheet B covers right half + seam overlap, scanned at different scale (1.25 ft/px -> 0.8 px/ft)
    // and rotated +14 degrees clockwise/ccw in world coordinates
    const trueRotRad = (14 * Math.PI) / 180;
    const sheetBTrueTransform: RasterTransform = {
      tx: 105,
      ty: 155,
      scaleFtPerPx: 1.25,
      rotationRad: trueRotRad,
    };
    const sheetBRgba = warpRegionToSyntheticRaster(
      fullImg,
      fullTransform,
      120,
      140,
      sheetBTrueTransform
    );

    // Pick 3 shared-edge landmark points along the seam (around x = 115..135 ft)
    const seamWorldLandmarks = [
      { x: 118, y: 120 },
      { x: 125, y: 80 },
      { x: 132, y: 40 },
    ];

    // Convert ground-truth seam points into Sheet B local pixel coords
    const pairs: AlignmentPair[] = seamWorldLandmarks.map((w, idx) => ({
      id: `pair-${idx + 1}`,
      baseWorld: w,
      overlayPx: worldToRasterPixel(w, sheetBTrueTransform),
      label: `P${idx + 1}`,
    }));

    const aligned = alignSheetBToSheetA(pairs);
    expect(aligned).not.toBeNull();
    if (!aligned) return;

    expect(aligned.method).toBe('least-squares');
    expect(aligned.rmsErrorFt).toBeLessThan(0.05);
    expect(aligned.derivedPixelsPerFoot).toBeCloseTo(1 / 1.25, 4);
    expect(aligned.rotationDeg).toBeCloseTo(14, 3);
    expect(aligned.transform.tx).toBeCloseTo(sheetBTrueTransform.tx, 3);
    expect(aligned.transform.ty).toBeCloseTo(sheetBTrueTransform.ty, 3);

    // Build mock RasterLayers to verify joined world extent & export dimensions
    const mockLayerA: RasterLayer = {
      id: 'sheet-a',
      name: 'Sheet A',
      dataUrl: '',
      widthPx: sheetARgba.width,
      heightPx: sheetARgba.height,
      transform: sheetATransform,
      opacity: 1,
      visible: true,
      locked: true,
      calibrated: true,
    };
    const mockLayerB: RasterLayer = {
      id: 'sheet-b',
      name: 'Sheet B',
      dataUrl: '',
      widthPx: sheetBRgba.width,
      heightPx: sheetBRgba.height,
      transform: aligned.transform,
      opacity: 1,
      visible: true,
      locked: true,
      calibrated: true,
    };

    const extent = computeJoinedWorldExtent([mockLayerA, mockLayerB]);
    expect(extent).not.toBeNull();
    if (!extent) return;
    expect(extent.minX).toBeLessThanOrEqual(0.01);
    expect(extent.maxX).toBeGreaterThan(220);

    const exportGeom = computeJoinedExportGeometry([mockLayerA, mockLayerB], 1200);
    expect(exportGeom).not.toBeNull();
    expect(exportGeom!.widthPx).toBeGreaterThan(100);
    expect(exportGeom!.heightPx).toBeGreaterThan(100);

    // Stitch Sheet A + Sheet B across the original fullImg domain [0..240, 0..160]
    const stitched = stitchRawRgbaLayers(
      [
        { rgba: sheetARgba, transform: sheetATransform },
        { rgba: sheetBRgba, transform: aligned.transform },
      ],
      { minX: 0, minY: 0, maxX: 240, maxY: 160 },
      240,
      160
    );

    // Compare interior pixels on Sheet A (x=60,y=80), Seam (x=122,y=79), and Sheet B (x=190,y=90)
    const sampleCheckPts = [
      { x: 60, y: 80 }, // purely on Sheet A
      { x: 122, y: 80 }, // shared seam region
      { x: 185, y: 90 }, // purely on Sheet B (via solved similarity transform!)
    ];
    for (const pt of sampleCheckPts) {
      const idx = (pt.y * 240 + pt.x) * 4;
      const dr = Math.abs(stitched.data[idx] - fullImg.data[idx]);
      const dg = Math.abs(stitched.data[idx + 1] - fullImg.data[idx + 1]);
      const db = Math.abs(stitched.data[idx + 2] - fullImg.data[idx + 2]);
      expect(dr).toBeLessThanOrEqual(12);
      expect(dg).toBeLessThanOrEqual(12);
      expect(db).toBeLessThanOrEqual(12);
    }

    // Confirm world coordinate continuity across the seam
    const bCornerWorld = rasterPixelToWorld({ x: 60, y: 60 }, aligned.transform);
    const bCornerExpected = rasterPixelToWorld({ x: 60, y: 60 }, sheetBTrueTransform);
    expect(bCornerWorld.x).toBeCloseTo(bCornerExpected.x, 3);
    expect(bCornerWorld.y).toBeCloseTo(bCornerExpected.y, 3);
  });

  it('mirrors pixel coordinates symmetrically across vertical axis with flipPixelX', () => {
    const width = 1000;
    const p = { x: 230, y: 410 };
    const flipped = flipPixelX(p, width);
    expect(flipped).toEqual({ x: 770, y: 410 });
    expect(flipPixelX(flipped, width)).toEqual(p);
  });
});
