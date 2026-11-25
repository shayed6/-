import {
  CadEntity,
  RasterLayer,
} from '../core/cad/types';
import { BBox, getRasterLayerBBox, sampleArcPoints } from '../core/cad/geometry';
import {
  PantographPlotLayout,
  PaperOrientation,
  PaperSizeId,
  ScaleRatioConversion,
  computePaperPlotLayout,
} from '../core/survey/scale';
import { formatNumber } from '../core/survey/units';
import { Lang } from '../ui/i18n';
import { base64ToUint8, buildPdfFromJpegs } from './pdf';

export interface PantographRenderOptions {
  projectName: string;
  raster: RasterLayer;
  areaMode: 'whole' | 'window';
  windowBBox?: BBox | null;
  oldScaleText: string;
  newScale: ScaleRatioConversion;
  paperSize: PaperSizeId;
  orientation: PaperOrientation | 'auto';
  fitMode: 'true-scale' | 'fit-to-paper';
  dpi?: number;
  lang: Lang;
  entities?: CadEntity[];
  includeVectors?: boolean;
  orgInfo?: { organizationName?: string; phoneNumber?: string };
}

export interface PantographRenderedSheet {
  canvas: HTMLCanvasElement;
  layout: PantographPlotLayout;
  regionBBox: BBox;
  pxWidth: number;
  pxHeight: number;
  dpi: number;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadOriginalImage(dataUrl: string): Promise<HTMLImageElement> {
  const existing = imageCache.get(dataUrl);
  if (existing) return existing;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load original raster image'));
    img.src = dataUrl;
  });
  imageCache.set(dataUrl, p);
  return p;
}

export function resolvePantographRegionBBox(
  raster: RasterLayer,
  areaMode: 'whole' | 'window',
  windowBBox?: BBox | null
): BBox {
  const full = getRasterLayerBBox(raster) || {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
  };
  if (areaMode !== 'window' || !windowBBox) {
    return full;
  }
  const minX = Math.min(windowBBox.minX, windowBBox.maxX);
  const maxX = Math.max(windowBBox.minX, windowBBox.maxX);
  const minY = Math.min(windowBBox.minY, windowBBox.maxY);
  const maxY = Math.max(windowBBox.minY, windowBBox.maxY);
  if (maxX - minX < 0.5 || maxY - minY < 0.5) {
    return full;
  }
  return { minX, minY, maxX, maxY };
}

function formatScaleBarLabel(scaleBarFt: number, lang: Lang): string {
  const chains = scaleBarFt / 66;
  const isCleanChain = Math.abs(chains - Math.round(chains * 2) / 2) < 1e-4;
  if (isCleanChain && chains >= 0.5) {
    return lang === 'bn'
      ? `${formatNumber(chains, chains % 1 === 0 ? 0 : 1, 'bn')} চেইন (${formatNumber(scaleBarFt, 0, 'bn')} ফু)`
      : `${formatNumber(chains, chains % 1 === 0 ? 0 : 1, 'en')} chain (${formatNumber(scaleBarFt, 0, 'en')} ft)`;
  }
  return lang === 'bn'
    ? `${formatNumber(scaleBarFt, 0, 'bn')} ফুট`
    : `${formatNumber(scaleBarFt, 0, 'en')} ft`;
}

/**
 * Resamples from the original full-resolution raster (`raster.dataUrl`) onto a physical paper canvas
 * at exact `layout.plottedFeetPerInch`, drawing an accurate scale bar, North arrow, and old/new scale notes.
 */
export async function renderPantographSheet(
  opts: PantographRenderOptions
): Promise<PantographRenderedSheet> {
  const dpi = opts.dpi ?? 180;
  const regionBBox = resolvePantographRegionBBox(
    opts.raster,
    opts.areaMode,
    opts.windowBBox
  );
  const regionW = Math.max(1, regionBBox.maxX - regionBBox.minX);
  const regionH = Math.max(1, regionBBox.maxY - regionBBox.minY);

  const layout = computePaperPlotLayout(
    regionW,
    regionH,
    opts.newScale,
    opts.paperSize,
    opts.orientation,
    opts.fitMode
  );

  const pxWidth = Math.max(300, Math.round(layout.paper.widthIn * dpi));
  const pxHeight = Math.max(300, Math.round(layout.paper.heightIn * dpi));

  const canvas = document.createElement('canvas');
  canvas.width = pxWidth;
  canvas.height = pxHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const fontStack =
    '"Noto Sans Bengali", "Hind Siliguri", "DM Sans", system-ui, sans-serif';

  // White paper base
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, pxWidth, pxHeight);

  // Outer drafting border
  const borderPad = Math.round(0.18 * dpi);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = Math.max(1.5, dpi * 0.012);
  ctx.strokeRect(borderPad, borderPad, pxWidth - borderPad * 2, pxHeight - borderPad * 2);

  // Header band inside top margin
  const leftPx = layout.marginsIn.left * dpi;
  const topPx = layout.marginsIn.top * dpi;
  const mapW = layout.printableWidthIn * dpi;
  const mapH = layout.printableHeightIn * dpi;

  ctx.fillStyle = '#0F172A';
  ctx.font = `bold ${Math.round(dpi * 0.14)}px ${fontStack}`;
  const headerTitle =
    opts.lang === 'bn'
      ? `প্যান্টাগ্রাফ রি-প্লট — ${opts.projectName}`
      : `Pantograph Re-Plot — ${opts.projectName}`;
  ctx.fillText(headerTitle, leftPx, Math.round(dpi * 0.42));

  ctx.fillStyle = '#115E59';
  ctx.font = `600 ${Math.round(dpi * 0.105)}px ${fontStack}`;
  ctx.textAlign = 'right';
  ctx.fillText(
    `${layout.paper.label} (${
      layout.paper.orientation === 'landscape'
        ? opts.lang === 'bn'
          ? 'আড়াআড়ি'
          : 'Landscape'
        : opts.lang === 'bn'
        ? 'লম্বা'
        : 'Portrait'
    })`,
    leftPx + mapW,
    Math.round(dpi * 0.42)
  );
  ctx.textAlign = 'left';

  // Printable map frame
  ctx.fillStyle = '#FAFBF8';
  ctx.fillRect(leftPx, topPx, mapW, mapH);
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = Math.max(1.2, dpi * 0.01);
  ctx.strokeRect(leftPx, topPx, mapW, mapH);

  // Load ORIGINAL full-resolution raster image (never downscaled displayDataUrl)
  const origImg = await loadOriginalImage(opts.raster.dataUrl);

  const destPxPerFt = dpi / layout.plottedFeetPerInch;
  const regionCenterX = (regionBBox.minX + regionBBox.maxX) / 2;
  const regionCenterY = (regionBBox.minY + regionBBox.maxY) / 2;
  const mapCenterX = leftPx + mapW / 2;
  const mapCenterY = topPx + mapH / 2;

  const worldToDest = (wx: number, wy: number) => ({
    x: mapCenterX + (wx - regionCenterX) * destPxPerFt,
    y: mapCenterY - (wy - regionCenterY) * destPxPerFt,
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(leftPx, topPx, mapW, mapH);
  ctx.clip();

  // Resample from original image with high-quality filtering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const t = opts.raster.transform;
  const originDest = worldToDest(t.tx, t.ty);
  const scaleRatio = t.scaleFtPerPx * destPxPerFt;

  ctx.save();
  ctx.translate(originDest.x, originDest.y);
  ctx.rotate(-t.rotationRad);
  ctx.drawImage(
    origImg,
    0,
    0,
    opts.raster.widthPx * scaleRatio,
    opts.raster.heightPx * scaleRatio
  );
  ctx.restore();

  // Optional CAD entities inside the cropped window
  if (opts.includeVectors && opts.entities && opts.entities.length > 0) {
    for (const ent of opts.entities) {
      if (ent.visible === false) continue;
      ctx.strokeStyle = ent.color || '#0F5132';
      ctx.lineWidth = Math.max(1.5, dpi * 0.014);
      if (ent.kind === 'line') {
        const a = worldToDest(ent.start.x, ent.start.y);
        const b = worldToDest(ent.end.x, ent.end.y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else if (
        (ent.kind === 'polygon' ||
          ent.kind === 'rectangle' ||
          ent.kind === 'polyline') &&
        ent.points.length >= 2
      ) {
        ctx.beginPath();
        const p0 = worldToDest(ent.points[0].x, ent.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < ent.points.length; i++) {
          const pi = worldToDest(ent.points[i].x, ent.points[i].y);
          ctx.lineTo(pi.x, pi.y);
        }
        if (ent.kind === 'polygon' || ent.kind === 'rectangle' || ent.closed) {
          ctx.closePath();
        }
        ctx.stroke();
      } else if (ent.kind === 'circle') {
        const c = worldToDest(ent.center.x, ent.center.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, ent.radiusFt * destPxPerFt, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ent.kind === 'arc') {
        const pts = sampleArcPoints(
          ent.center,
          ent.radiusFt,
          ent.startAngleRad,
          ent.endAngleRad,
          ent.anticlockwise ?? true,
          32
        );
        if (pts.length >= 2) {
          ctx.beginPath();
          const p0 = worldToDest(pts[0].x, pts[0].y);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < pts.length; i++) {
            const pi = worldToDest(pts[i].x, pts[i].y);
            ctx.lineTo(pi.x, pi.y);
          }
          ctx.stroke();
        }
      }
    }
  }

  ctx.restore(); // remove map clip

  // North arrow inside top-right corner of map frame
  const nRadius = Math.round(dpi * 0.16);
  const nx = leftPx + mapW - nRadius - Math.round(dpi * 0.14);
  const ny = topPx + nRadius + Math.round(dpi * 0.14);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = '#0F5132';
  ctx.lineWidth = Math.max(1, dpi * 0.008);
  ctx.beginPath();
  ctx.arc(nx, ny, nRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0F5132';
  ctx.font = `bold ${Math.round(dpi * 0.11)}px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.lang === 'bn' ? 'উ↑' : 'N↑', nx, ny);
  ctx.restore();

  // Footer Title Block: Exact Scale Bar + Old & New Scale Note + Disclaimer
  const footerTopY = topPx + mapH + Math.round(dpi * 0.14);
  const footerH = pxHeight - borderPad - footerTopY - Math.round(dpi * 0.08);

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(leftPx, footerTopY, mapW, footerH);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = Math.max(1, dpi * 0.008);
  ctx.strokeRect(leftPx, footerTopY, mapW, footerH);

  // Graphic alternating survey scale bar on left side of footer
  const barX = leftPx + Math.round(dpi * 0.16);
  const barY = footerTopY + Math.round(dpi * 0.34);
  const barPxLen = layout.scaleBarLengthIn * dpi;
  const barH = Math.max(6, Math.round(dpi * 0.075));
  const segments = 4;
  const segW = barPxLen / segments;

  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#0F172A' : '#FFFFFF';
    ctx.fillRect(barX + i * segW, barY, segW, barH);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = Math.max(1, dpi * 0.007);
    ctx.strokeRect(barX + i * segW, barY, segW, barH);
  }

  ctx.fillStyle = '#0F172A';
  ctx.font = `bold ${Math.round(dpi * 0.095)}px ${fontStack}`;
  ctx.fillText(
    formatScaleBarLabel(layout.scaleBarFt, opts.lang),
    barX,
    barY - Math.round(dpi * 0.08)
  );
  ctx.font = `${Math.round(dpi * 0.078)}px ${fontStack}`;
  ctx.fillStyle = '#475569';
  ctx.fillText(
    opts.lang === 'bn'
      ? `১″ = ${formatNumber(layout.plottedFeetPerInch, 1, 'bn')} ফুট (১:${formatNumber(Math.round(layout.plottedRfDenominator), 0, 'bn')})`
      : `1″ = ${layout.plottedFeetPerInch.toFixed(1)} ft (1:${Math.round(layout.plottedRfDenominator)})`,
    barX,
    barY + barH + Math.round(dpi * 0.14)
  );

  // Scale Note Box (Old Scale -> New Scale) on right side of footer
  const noteX = leftPx + Math.max(barPxLen + dpi * 0.45, mapW * 0.48);
  const noteY = footerTopY + Math.round(dpi * 0.22);
  ctx.fillStyle = '#0F172A';
  ctx.font = `bold ${Math.round(dpi * 0.095)}px ${fontStack}`;
  const oldLabel =
    opts.lang === 'bn'
      ? `পুরোনো স্কেল: ${opts.oldScaleText}`
      : `Old Scale: ${opts.oldScaleText}`;
  const newLabel =
    opts.lang === 'bn'
      ? `নতুন স্কেল: ${opts.newScale.label}`
      : `New Scale: ${opts.newScale.label}`;
  ctx.fillText(oldLabel, noteX, noteY);
  ctx.fillStyle = '#115E59';
  ctx.fillText(newLabel, noteX, noteY + Math.round(dpi * 0.17));

  if (layout.effectiveFitMode === 'fit-to-paper' && !layout.fitsAtTrueScale) {
    ctx.fillStyle = '#B45309';
    ctx.font = `600 ${Math.round(dpi * 0.078)}px ${fontStack}`;
    ctx.fillText(
      opts.lang === 'bn'
        ? `কাগজে ফিট প্লট: ~${formatNumber(layout.plottedInchesPerMile, 1, 'bn')}″ = ১ মাইল`
        : `Fit-to-page plotted: ~${layout.plottedInchesPerMile.toFixed(1)}″ = 1 mile`,
      noteX,
      noteY + Math.round(dpi * 0.33)
    );
  } else if (opts.orgInfo?.organizationName) {
    ctx.fillStyle = '#475569';
    ctx.font = `${Math.round(dpi * 0.078)}px ${fontStack}`;
    ctx.fillText(
      [opts.orgInfo.organizationName, opts.orgInfo.phoneNumber].filter(Boolean).join(' · '),
      noteX,
      noteY + Math.round(dpi * 0.33)
    );
  }

  // Disclaimer line along bottom of footer
  ctx.fillStyle = '#78350F';
  ctx.font = `${Math.round(dpi * 0.074)}px ${fontStack}`;
  const disc =
    opts.lang === 'bn'
      ? 'নোট: স্ক্যান/ছবি থেকে রি-প্লটকৃত নকশা আনুমানিক; সরেজমিন সার্ভে যাচাই করুন এবং প্রিন্টে "Actual Size (100%)" ব্যবহার করুন।'
      : 'Note: Re-plotted map from scanned image is approximate; verify in field and print PDF at Actual Size (100%).';
  ctx.fillText(disc, barX, footerTopY + footerH - Math.round(dpi * 0.1));

  return {
    canvas,
    layout,
    regionBBox,
    pxWidth,
    pxHeight,
    dpi,
  };
}

export async function exportPantographPngBytes(
  opts: PantographRenderOptions
): Promise<{ bytes: Uint8Array; layout: PantographPlotLayout }> {
  const rendered = await renderPantographSheet({ ...opts, dpi: opts.dpi ?? 200 });
  const blob = await new Promise<Blob>((resolve, reject) => {
    rendered.canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
      'image/png'
    );
  });
  const ab = await blob.arrayBuffer();
  return { bytes: new Uint8Array(ab), layout: rendered.layout };
}

export async function exportPantographPdfBytes(
  opts: PantographRenderOptions
): Promise<{ bytes: Uint8Array; layout: PantographPlotLayout }> {
  const rendered = await renderPantographSheet({ ...opts, dpi: opts.dpi ?? 200 });
  const jpegUrl = rendered.canvas.toDataURL('image/jpeg', 0.93);
  const jpegBytes = base64ToUint8(jpegUrl.split(',')[1]);
  const pdfBytes = buildPdfFromJpegs([
    {
      jpegBytes,
      pxWidth: rendered.pxWidth,
      pxHeight: rendered.pxHeight,
      pageWidthPt: rendered.layout.paper.widthPt,
      pageHeightPt: rendered.layout.paper.heightPt,
    },
  ]);
  return { bytes: pdfBytes, layout: rendered.layout };
}
