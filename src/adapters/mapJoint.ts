import { CadEntity, RasterLayer } from '../core/cad/types';
import { BBox, sampleArcPoints } from '../core/cad/geometry';
import { computeJoinedExportGeometry } from '../core/cad/mapJointMath';
import { formatNumber } from '../core/survey/units';
import { Lang } from '../ui/i18n';

export type JoinedExportResolution = 'standard' | 'high' | 'ultra';

export interface JoinedMapRenderOptions {
  projectName: string;
  sheetA: RasterLayer;
  sheetB: RasterLayer;
  resolution: JoinedExportResolution;
  includeVectors?: boolean;
  includeAnnotations?: boolean;
  entities?: CadEntity[];
  lang: Lang;
  orgInfo?: { organizationName?: string; phoneNumber?: string };
}

export interface JoinedMapRenderResult {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  extent: BBox;
  pxPerFt: number;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadOriginalRaster(dataUrl: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(dataUrl);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load raster image'));
    img.src = dataUrl;
  });
  imageCache.set(dataUrl, p);
  return p;
}

export function resolutionToMaxDimPx(
  resolution: JoinedExportResolution,
  sheetA: RasterLayer,
  sheetB: RasterLayer
): number {
  if (resolution === 'standard') return 1800;
  if (resolution === 'high') return 3200;
  const combinedHint = Math.max(
    2400,
    Math.min(5400, Math.round((sheetA.widthPx + sheetB.widthPx) * 0.95))
  );
  return combinedHint;
}

/**
 * Renders Sheet A + aligned Sheet B into one seamless, full-resolution stitched image canvas
 * using both original `dataUrl` sources in their shared world coordinate system.
 */
export async function renderJoinedMapCanvas(
  opts: JoinedMapRenderOptions
): Promise<JoinedMapRenderResult> {
  const maxDim = resolutionToMaxDimPx(opts.resolution, opts.sheetA, opts.sheetB);
  const geom = computeJoinedExportGeometry([opts.sheetA, opts.sheetB], maxDim);
  if (!geom) {
    throw new Error('Could not resolve joined map extent');
  }

  const headerPx = opts.includeAnnotations ? Math.round(Math.max(54, geom.heightPx * 0.045)) : 0;
  const footerPx = opts.includeAnnotations ? Math.round(Math.max(56, geom.heightPx * 0.048)) : 0;
  const canvasW = geom.widthPx;
  const canvasH = geom.heightPx + headerPx + footerPx;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const fontStack =
    '"Noto Sans Bengali", "Hind Siliguri", "DM Sans", system-ui, sans-serif';

  // Paper white backdrop
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const [imgA, imgB] = await Promise.all([
    loadOriginalRaster(opts.sheetA.dataUrl),
    loadOriginalRaster(opts.sheetB.dataUrl),
  ]);

  const worldToOut = (wx: number, wy: number) => ({
    x: (wx - geom.extent.minX) * geom.pxPerFt,
    y: headerPx + (geom.extent.maxY - wy) * geom.pxPerFt,
  });

  // Clip strictly to the map region
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, headerPx, geom.widthPx, geom.heightPx);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const drawLayer = (layer: RasterLayer, img: HTMLImageElement) => {
    const t = layer.transform;
    const orig = worldToOut(t.tx, t.ty);
    const ratio = t.scaleFtPerPx * geom.pxPerFt;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(orig.x, orig.y);
    ctx.rotate(-t.rotationRad);
    ctx.drawImage(img, 0, 0, layer.widthPx * ratio, layer.heightPx * ratio);
    ctx.restore();
  };

  drawLayer(opts.sheetA, imgA);
  drawLayer(opts.sheetB, imgB);

  // Draw optional plots & measurements crossing the joined seam
  if (opts.includeVectors && opts.entities && opts.entities.length > 0) {
    const strokeW = Math.max(2, Math.round(canvasW * 0.0018));
    for (const ent of opts.entities) {
      if (ent.visible === false) continue;
      ctx.strokeStyle = ent.color || '#0F5132';
      ctx.lineWidth = strokeW;
      if (ent.kind === 'line') {
        const a = worldToOut(ent.start.x, ent.start.y);
        const b = worldToOut(ent.end.x, ent.end.y);
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
        const p0 = worldToOut(ent.points[0].x, ent.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < ent.points.length; i++) {
          const pi = worldToOut(ent.points[i].x, ent.points[i].y);
          ctx.lineTo(pi.x, pi.y);
        }
        if (ent.kind === 'polygon' || ent.kind === 'rectangle' || ent.closed) {
          ctx.closePath();
        }
        ctx.stroke();
      } else if (ent.kind === 'circle') {
        const c = worldToOut(ent.center.x, ent.center.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, ent.radiusFt * geom.pxPerFt, 0, Math.PI * 2);
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
          const p0 = worldToOut(pts[0].x, pts[0].y);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < pts.length; i++) {
            const pi = worldToOut(pts[i].x, pts[i].y);
            ctx.lineTo(pi.x, pi.y);
          }
          ctx.stroke();
        }
      }
    }
  }

  ctx.restore();

  if (opts.includeAnnotations) {
    // Header bar
    ctx.fillStyle = '#FAFBF8';
    ctx.fillRect(0, 0, canvasW, headerPx);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = Math.max(1, Math.round(headerPx * 0.03));
    ctx.beginPath();
    ctx.moveTo(0, headerPx);
    ctx.lineTo(canvasW, headerPx);
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.font = `bold ${Math.round(headerPx * 0.42)}px ${fontStack}`;
    ctx.textBaseline = 'middle';
    const title =
      opts.lang === 'bn'
        ? `জমি জয়েন্ট (সংযুক্ত নকশা) — ${opts.projectName}`
        : `Joined Map Sheet — ${opts.projectName}`;
    ctx.fillText(title, Math.round(canvasW * 0.025), headerPx / 2);

    ctx.fillStyle = '#B45309';
    ctx.font = `600 ${Math.round(headerPx * 0.34)}px ${fontStack}`;
    ctx.textAlign = 'right';
    ctx.fillText(
      opts.lang === 'bn' ? 'উ ↑' : 'N ↑',
      canvasW - Math.round(canvasW * 0.025),
      headerPx / 2
    );
    ctx.textAlign = 'left';

    // Footer bar with graphic scale bar
    const footY = headerPx + geom.heightPx;
    ctx.fillStyle = '#FAFBF8';
    ctx.fillRect(0, footY, canvasW, footerPx);
    ctx.beginPath();
    ctx.moveTo(0, footY);
    ctx.lineTo(canvasW, footY);
    ctx.stroke();

    const barChoicesFt = [66, 132, 330, 660, 1320, 2640];
    const targetBarPx = canvasW * 0.18;
    let chosenFt = 132;
    let bestDiff = Infinity;
    for (const cFt of barChoicesFt) {
      const px = cFt * geom.pxPerFt;
      const diff = Math.abs(px - targetBarPx);
      if (px >= canvasW * 0.06 && px <= canvasW * 0.35 && diff < bestDiff) {
        bestDiff = diff;
        chosenFt = cFt;
      }
    }
    const barPx = chosenFt * geom.pxPerFt;
    const barX = Math.round(canvasW * 0.025);
    const barH = Math.max(6, Math.round(footerPx * 0.16));
    const barY = footY + Math.round(footerPx * 0.48);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#0F172A' : '#FFFFFF';
      ctx.fillRect(barX + (i * barPx) / 4, barY, barPx / 4, barH);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = Math.max(1, Math.round(footerPx * 0.02));
      ctx.strokeRect(barX + (i * barPx) / 4, barY, barPx / 4, barH);
    }

    ctx.fillStyle = '#0F172A';
    ctx.font = `bold ${Math.round(footerPx * 0.28)}px ${fontStack}`;
    ctx.textBaseline = 'alphabetic';
    const chains = chosenFt / 66;
    ctx.fillText(
      opts.lang === 'bn'
        ? `${formatNumber(chains, 0, 'bn')} চেইন (${formatNumber(chosenFt, 0, 'bn')} ফুট)`
        : `${chains} chain (${chosenFt} ft)`,
      barX,
      barY - Math.round(footerPx * 0.1)
    );

    const noteText = [
      opts.orgInfo?.organizationName,
      opts.lang === 'bn'
        ? 'স্ক্যান ম্যাপ সংযোজন আনুমানিক — সরেজমিন যাচাই করুন'
        : 'Joined scanned map is approximate — verify in field',
    ]
      .filter(Boolean)
      .join(' · ');
    ctx.fillStyle = '#475569';
    ctx.font = `${Math.round(footerPx * 0.25)}px ${fontStack}`;
    ctx.textAlign = 'right';
    ctx.fillText(
      noteText,
      canvasW - Math.round(canvasW * 0.025),
      footY + Math.round(footerPx * 0.62)
    );
    ctx.textAlign = 'left';
  }

  return {
    canvas,
    widthPx: canvasW,
    heightPx: canvasH,
    extent: geom.extent,
    pxPerFt: geom.pxPerFt,
  };
}

export async function exportJoinedMapBytes(
  opts: JoinedMapRenderOptions & { format: 'png' | 'jpeg' }
): Promise<{ bytes: Uint8Array; widthPx: number; heightPx: number }> {
  const rendered = await renderJoinedMapCanvas(opts);
  const mime = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = opts.format === 'jpeg' ? 0.92 : undefined;
  const blob = await new Promise<Blob>((resolve, reject) => {
    rendered.canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image export failed'))),
      mime,
      quality
    );
  });
  const ab = await blob.arrayBuffer();
  return {
    bytes: new Uint8Array(ab),
    widthPx: rendered.widthPx,
    heightPx: rendered.heightPx,
  };
}
