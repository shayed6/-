import { RasterLayer } from '../core/cad/types';
import { Point2D } from '../core/survey/coordinates';

export const MAX_RASTER_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_DISPLAY_DIM_PX = 2048;

export interface LoadedImageResult {
  name: string;
  dataUrl: string;
  displayDataUrl?: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
}

function createDownscaledDisplayCopy(
  img: HTMLImageElement,
  origW: number,
  origH: number,
  mimeHint: string
): string | undefined {
  const maxDim = Math.max(origW, origH);
  if (maxDim <= MAX_DISPLAY_DIM_PX || typeof document === 'undefined') {
    return undefined;
  }
  const ratio = MAX_DISPLAY_DIM_PX / maxDim;
  const targetW = Math.max(1, Math.round(origW * ratio));
  const targetH = Math.max(1, Math.round(origH * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(img, 0, 0, targetW, targetH);
  const outMime = mimeHint === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvas.toDataURL(outMime, 0.88);
}

export function loadImageFile(file: File): Promise<LoadedImageResult> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_RASTER_FILE_BYTES) {
      reject(new Error('FILE_TOO_LARGE'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const widthPx = img.naturalWidth || img.width || 1000;
        const heightPx = img.naturalHeight || img.height || 1000;
        const displayDataUrl = createDownscaledDisplayCopy(
          img,
          widthPx,
          heightPx,
          file.type
        );
        resolve({
          name: file.name,
          dataUrl,
          displayDataUrl,
          widthPx,
          heightPx,
          sizeBytes: file.size,
        });
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function createRasterLayerFromImage(
  loaded: LoadedImageResult,
  centerWorldFt: Point2D = { x: 0, y: 0 },
  initialWidthFt = 200
): RasterLayer {
  const scaleFtPerPx = initialWidthFt / Math.max(1, loaded.widthPx);
  const halfW = (loaded.widthPx * scaleFtPerPx) / 2;
  const halfH = (loaded.heightPx * scaleFtPerPx) / 2;
  return {
    id: `raster-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: loaded.name,
    dataUrl: loaded.dataUrl,
    displayDataUrl: loaded.displayDataUrl,
    widthPx: loaded.widthPx,
    heightPx: loaded.heightPx,
    transform: {
      tx: centerWorldFt.x - halfW,
      ty: centerWorldFt.y + halfH,
      scaleFtPerPx,
      rotationRad: 0,
    },
    opacity: 0.78,
    visible: true,
    locked: false,
    calibrated: false,
    pixelsPerFoot: 1 / scaleFtPerPx,
  };
}

/**
 * Pure pixel-coordinate mirror across vertical axis for an image of width `widthPx`.
 */
export function flipPixelX(px: Point2D, widthPx: number): Point2D {
  return { x: widthPx - px.x, y: px.y };
}

/**
 * Horizontally flips a RasterLayer's original image (`dataUrl`) and display copy
 * at full resolution, returning a new RasterLayer with `flippedX` toggled.
 */
export async function flipRasterImageHorizontal(
  layer: RasterLayer
): Promise<RasterLayer> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas unavailable');
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load raster for flip'));
    el.src = layer.dataUrl;
  });

  const w = Math.max(1, layer.widthPx || img.naturalWidth || img.width);
  const h = Math.max(1, layer.heightPx || img.naturalHeight || img.height);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();

  const flippedDataUrl = canvas.toDataURL('image/png');
  const displayDataUrl = await new Promise<string | undefined>((resolve) => {
    const maxDim = Math.max(w, h);
    if (maxDim <= MAX_DISPLAY_DIM_PX) {
      resolve(undefined);
      return;
    }
    const ratio = MAX_DISPLAY_DIM_PX / maxDim;
    const targetW = Math.max(1, Math.round(w * ratio));
    const targetH = Math.max(1, Math.round(h * ratio));
    const dCanvas = document.createElement('canvas');
    dCanvas.width = targetW;
    dCanvas.height = targetH;
    const dCtx = dCanvas.getContext('2d');
    if (!dCtx) {
      resolve(undefined);
      return;
    }
    dCtx.drawImage(canvas, 0, 0, targetW, targetH);
    resolve(dCanvas.toDataURL('image/png'));
  });

  return {
    ...layer,
    dataUrl: flippedDataUrl,
    displayDataUrl,
    widthPx: w,
    heightPx: h,
    flippedX: !layer.flippedX,
  };
}

