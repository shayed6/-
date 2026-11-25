import { Point2D } from '../survey/coordinates';
import {
  AlignmentControlPairInput,
  BBox,
  getRasterLayerBBox,
  mergeBBoxes,
  rasterPixelToWorld,
  solveRasterAlignmentFromPairs,
  worldToRasterPixel,
} from './geometry';
import { AlignmentPair, RasterLayer, RasterTransform } from './types';

export interface JoinedAlignmentSummary {
  transform: RasterTransform;
  derivedPixelsPerFoot: number;
  rotationDeg: number;
  method: 'similarity-2pt' | 'least-squares';
  rmsErrorFt: number;
  maxErrorFt: number;
  residualsFt: number[];
}

export interface RawRgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Computes the combined world bounding box (feet) covering all provided raster layers.
 */
export function computeJoinedWorldExtent(layers: RasterLayer[]): BBox | null {
  return mergeBBoxes(layers.map((layer) => getRasterLayerBBox(layer)));
}

/**
 * Aligns Sheet B to Sheet A's world coordinate system using similarity transform (2 pairs)
 * or least-squares similarity transform (3+ pairs) along the shared seam edge.
 * Automatically derives Sheet B's pixels-per-foot scale and rotation from Sheet A.
 */
export function alignSheetBToSheetA(
  pairs: AlignmentPair[]
): JoinedAlignmentSummary | null {
  if (pairs.length < 2) return null;
  const input: AlignmentControlPairInput[] = pairs.map((p) => ({
    baseWorld: p.baseWorld,
    overlayPx: p.overlayPx,
  }));
  const solved = solveRasterAlignmentFromPairs(input);
  if (!solved) return null;
  return {
    transform: solved.transform,
    derivedPixelsPerFoot: 1 / Math.max(1e-9, solved.transform.scaleFtPerPx),
    rotationDeg: (solved.transform.rotationRad * 180) / Math.PI,
    method: solved.method,
    rmsErrorFt: solved.rmsErrorFt,
    maxErrorFt: solved.maxErrorFt,
    residualsFt: solved.residualsFt,
  };
}

/**
 * Computes exact pixel & ground resolution metadata for exporting a merged map image.
 */
export function computeJoinedExportGeometry(
  layers: RasterLayer[],
  maxDimensionPx: number
): {
  extent: BBox;
  widthPx: number;
  heightPx: number;
  pxPerFt: number;
} | null {
  const extent = computeJoinedWorldExtent(layers);
  if (!extent) return null;
  const worldW = Math.max(1e-3, extent.maxX - extent.minX);
  const worldH = Math.max(1e-3, extent.maxY - extent.minY);
  const maxWorld = Math.max(worldW, worldH);
  const clampedMaxPx = Math.max(200, Math.min(8192, Math.round(maxDimensionPx)));
  const pxPerFt = clampedMaxPx / maxWorld;
  const widthPx = Math.max(1, Math.round(worldW * pxPerFt));
  const heightPx = Math.max(1, Math.round(worldH * pxPerFt));
  return { extent, widthPx, heightPx, pxPerFt };
}

/**
 * Helper for tests & headless stitching: transforms points inside a RawRgbaImage crop/warp
 * via inverse bilinear sampling.
 */
function sampleBilinearRgba(
  img: RawRgbaImage,
  px: number,
  py: number
): [number, number, number, number] | null {
  if (px < 0 || py < 0 || px > img.width - 1 || py > img.height - 1) {
    return null;
  }
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const fx = px - x0;
  const fy = py - y0;

  const idx = (x: number, y: number) => (y * img.width + x) * 4;
  const i00 = idx(x0, y0);
  const i10 = idx(x1, y0);
  const i01 = idx(x0, y1);
  const i11 = idx(x1, y1);

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  return [
    Math.round(img.data[i00] * w00 + img.data[i10] * w10 + img.data[i01] * w01 + img.data[i11] * w11),
    Math.round(img.data[i00 + 1] * w00 + img.data[i10 + 1] * w10 + img.data[i01 + 1] * w01 + img.data[i11 + 1] * w11),
    Math.round(img.data[i00 + 2] * w00 + img.data[i10 + 2] * w10 + img.data[i01 + 2] * w01 + img.data[i11 + 2] * w11),
    Math.round(img.data[i00 + 3] * w00 + img.data[i10 + 3] * w10 + img.data[i01 + 3] * w01 + img.data[i11 + 3] * w11),
  ];
}

/**
 * Generates a synthetic transformed crop of a source RGBA image using a given RasterTransform.
 * Used to simulate independently scanned/photographed overlapping map halves with known ground truth.
 */
export function warpRegionToSyntheticRaster(
  source: RawRgbaImage,
  sourceTransform: RasterTransform,
  cropWidthPx: number,
  cropHeightPx: number,
  cropTrueTransform: RasterTransform
): RawRgbaImage {
  const data = new Uint8ClampedArray(cropWidthPx * cropHeightPx * 4);
  for (let y = 0; y < cropHeightPx; y++) {
    for (let x = 0; x < cropWidthPx; x++) {
      const world = rasterPixelToWorld({ x, y }, cropTrueTransform);
      const srcPx = worldToRasterPixel(world, sourceTransform);
      const rgba = sampleBilinearRgba(source, srcPx.x, srcPx.y);
      const dstIdx = (y * cropWidthPx + x) * 4;
      if (rgba) {
        data[dstIdx] = rgba[0];
        data[dstIdx + 1] = rgba[1];
        data[dstIdx + 2] = rgba[2];
        data[dstIdx + 3] = rgba[3];
      } else {
        data[dstIdx] = 255;
        data[dstIdx + 1] = 255;
        data[dstIdx + 2] = 255;
        data[dstIdx + 3] = 0;
      }
    }
  }
  return { width: cropWidthPx, height: cropHeightPx, data };
}

/**
 * Stitches multiple aligned RGBA raster layers into a single continuous RGBA canvas in world space.
 * Headless Node-compatible for deterministic verification of map joint stitching.
 */
export function stitchRawRgbaLayers(
  layers: Array<{ rgba: RawRgbaImage; transform: RasterTransform }>,
  extent: BBox,
  outWidthPx: number,
  outHeightPx: number
): RawRgbaImage {
  const data = new Uint8ClampedArray(outWidthPx * outHeightPx * 4);
  // White opaque paper background
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }

  const worldW = Math.max(1e-6, extent.maxX - extent.minX);
  const worldH = Math.max(1e-6, extent.maxY - extent.minY);

  for (let py = 0; py < outHeightPx; py++) {
    const wy = extent.maxY - ((py + 0.5) / outHeightPx) * worldH;
    for (let px = 0; px < outWidthPx; px++) {
      const wx = extent.minX + ((px + 0.5) / outWidthPx) * worldW;
      const worldPt: Point2D = { x: wx, y: wy };
      const dstIdx = (py * outWidthPx + px) * 4;

      for (const layer of layers) {
        const srcPx = worldToRasterPixel(worldPt, layer.transform);
        const rgba = sampleBilinearRgba(layer.rgba, srcPx.x, srcPx.y);
        if (rgba && rgba[3] > 128) {
          data[dstIdx] = rgba[0];
          data[dstIdx + 1] = rgba[1];
          data[dstIdx + 2] = rgba[2];
          data[dstIdx + 3] = 255;
        }
      }
    }
  }

  return { width: outWidthPx, height: outHeightPx, data };
}
