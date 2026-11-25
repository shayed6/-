import { CadDocument, PolygonEntity } from '../core/cad/types';
import { getDocumentBBox, sampleArcPoints } from '../core/cad/geometry';
import {
  computeAreaBreakdown,
  computePolygonOverlapMetrics,
  polygonAreaSqFt,
  polygonPerimeterFt,
} from '../core/survey/area';
import { distance2D } from '../core/survey/coordinates';
import { formatNumber } from '../core/survey/units';

export function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export interface PdfJpegPage {
  jpegBytes: Uint8Array;
  pxWidth: number;
  pxHeight: number;
  pageWidthPt?: number;
  pageHeightPt?: number;
}

/**
 * Wraps one or more JPEG byte arrays into a valid PDF 1.4 document with custom physical page points.
 */
export function buildPdfFromJpegs(pages: PdfJpegPage[]): Uint8Array {
  const defaultPageW = 595;
  const defaultPageH = 842;

  const chunks: Array<string | Uint8Array> = [];
  const offsets: number[] = [0]; // obj 0 unused
  let byteOffset = 0;

  const pushStr = (s: string) => {
    const encoded = new TextEncoder().encode(s);
    chunks.push(encoded);
    byteOffset += encoded.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    byteOffset += b.length;
  };

  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const pageIds = pages.map((_, i) => 3 + i * 3);

  offsets[1] = byteOffset;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  offsets[2] = byteOffset;
  pushStr(
    `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`
  );

  pages.forEach((p, idx) => {
    const pageW = p.pageWidthPt ?? defaultPageW;
    const pageH = p.pageHeightPt ?? defaultPageH;
    const pageObj = 3 + idx * 3;
    const contentObj = 4 + idx * 3;
    const imgObj = 5 + idx * 3;

    const streamStr = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;

    offsets[pageObj] = byteOffset;
    pushStr(
      `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`
    );

    offsets[contentObj] = byteOffset;
    pushStr(
      `${contentObj} 0 obj\n<< /Length ${streamStr.length} >>\nstream\n${streamStr}endstream\nendobj\n`
    );

    offsets[imgObj] = byteOffset;
    pushStr(
      `${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pxWidth} /Height ${p.pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(p.jpegBytes);
    pushStr('\nendstream\nendobj\n');
  });

  const xrefStart = byteOffset;
  const totalObjs = 2 + pages.length * 3;
  pushStr(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjs; id++) {
    pushStr(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  );

  const totalLen = chunks.reduce((acc, c) => acc + (typeof c === 'string' ? c.length : c.length), 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    if (typeof c === 'string') {
      const b = new TextEncoder().encode(c);
      result.set(b, pos);
      pos += b.length;
    } else {
      result.set(c, pos);
      pos += c.length;
    }
  }
  return result;
}

export async function generateSurveyPdfBytes(
  doc: CadDocument,
  lang: 'bn' | 'en' = 'bn',
  orgInfo?: { organizationName?: string; phoneNumber?: string }
): Promise<Uint8Array> {
  // High-resolution A4 canvas (1240 x 1754 px at ~150 DPI)
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const fontStack =
    '"Noto Sans Bengali", "Hind Siliguri", "DM Sans", system-ui, sans-serif';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = '#0F5132';
  ctx.fillRect(0, 0, W, 128);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 36px ${fontStack}`;
  ctx.fillText('SurveyCAD — ' + (lang === 'bn' ? 'জমি পরিমাপ রিপোর্ট' : 'Land Survey Report'), 60, 62);
  ctx.font = `20px ${fontStack}`;
  ctx.fillStyle = '#D1FAE5';
  const dateStr = new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB');
  const orgSuffix = [orgInfo?.organizationName, orgInfo?.phoneNumber].filter(Boolean).join(' · ');
  const subLine = orgSuffix
    ? `${doc.name}  ·  ${dateStr}  ·  ${orgSuffix}`
    : `${doc.name}  ·  ${dateStr}`;
  ctx.fillText(subLine, 60, 102);

  // Drawing preview box
  const mapX = 60;
  const mapY = 160;
  const mapW = W - 120;
  const mapH = 620;
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#FAFBF8';
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  const bbox = getDocumentBBox(doc);
  if (bbox) {
    const bw = Math.max(1, bbox.maxX - bbox.minX);
    const bh = Math.max(1, bbox.maxY - bbox.minY);
    const scale = Math.min((mapW - 100) / bw, (mapH - 100) / bh);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    const toPx = (x: number, y: number) => ({
      x: mapX + mapW / 2 + (x - cx) * scale,
      y: mapY + mapH / 2 - (y - cy) * scale,
    });

    for (const ent of doc.entities) {
      if (ent.visible === false) continue;
      ctx.strokeStyle = ent.color || '#0F5132';
      ctx.lineWidth = 3;
      if (ent.kind === 'line') {
        const a = toPx(ent.start.x, ent.start.y);
        const b = toPx(ent.end.x, ent.end.y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else if (ent.kind === 'polygon' || ent.kind === 'polyline' || ent.kind === 'rectangle') {
        if (ent.points.length >= 2) {
          ctx.beginPath();
          const p0 = toPx(ent.points[0].x, ent.points[0].y);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < ent.points.length; i++) {
            const pi = toPx(ent.points[i].x, ent.points[i].y);
            ctx.lineTo(pi.x, pi.y);
          }
          const isClosed = ent.kind === 'polygon' || ent.kind === 'rectangle' || ent.closed;
          if (isClosed) ctx.closePath();
          if (ent.kind === 'polygon') {
            ctx.fillStyle = (ent.fillColor || '#10B981') + '28';
            ctx.fill();
          }
          ctx.stroke();

          // Edge lengths
          ctx.fillStyle = '#0F172A';
          ctx.font = `16px ${fontStack}`;
          const count = isClosed ? ent.points.length : ent.points.length - 1;
          for (let i = 0; i < count; i++) {
            const pA = ent.points[i];
            const pB = ent.points[(i + 1) % ent.points.length];
            const len = distance2D(pA, pB);
            const mid = toPx((pA.x + pB.x) / 2, (pA.y + pB.y) / 2);
            ctx.fillText(
              `${formatNumber(len, 1, lang)} ${lang === 'bn' ? 'ফু' : 'ft'}`,
              mid.x + 4,
              mid.y - 4
            );
          }
        }
      } else if (ent.kind === 'circle') {
        const c = toPx(ent.center.x, ent.center.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, ent.radiusFt * scale, 0, Math.PI * 2);
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
          const p0 = toPx(pts[0].x, pts[0].y);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < pts.length; i++) {
            const pi = toPx(pts[i].x, pts[i].y);
            ctx.lineTo(pi.x, pi.y);
          }
          ctx.stroke();
        }
      } else if (ent.kind === 'point') {
        const p = toPx(ent.position.x, ent.position.y);
        ctx.fillStyle = '#B45309';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.kind === 'text') {
        const p = toPx(ent.position.x, ent.position.y);
        ctx.fillStyle = ent.color || '#1E293B';
        ctx.font = `600 16px ${fontStack}`;
        ctx.fillText(ent.text, p.x, p.y);
      }
    }

    // Highlight saved Demarcation overlap intersections on the preview sketch
    if (doc.demarcationResults && doc.demarcationResults.length > 0) {
      for (const rec of doc.demarcationResults) {
        const ov = computePolygonOverlapMetrics(
          rec.basePolygon,
          rec.overlayPolygon,
          doc.unitProfile
        );
        for (const ring of ov.overlapRings) {
          if (ring.length < 3) continue;
          ctx.beginPath();
          const p0 = toPx(ring[0].x, ring[0].y);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < ring.length; i++) {
            const pi = toPx(ring[i].x, ring[i].y);
            ctx.lineTo(pi.x, pi.y);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(245, 158, 11, 0.38)';
          ctx.fill();
          ctx.strokeStyle = '#D97706';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }
  }

  // North arrow inside map box
  ctx.fillStyle = '#0F5132';
  ctx.font = `bold 20px ${fontStack}`;
  ctx.fillText('N ↑', mapX + mapW - 60, mapY + 38);

  // Summary Table
  let y = mapY + mapH + 56;
  ctx.fillStyle = '#0F172A';
  ctx.font = `bold 26px ${fontStack}`;
  ctx.fillText(lang === 'bn' ? 'দাগ ও ক্ষেত্রফলের হিসাব' : 'Plot & Area Summary', 60, y);
  y += 24;

  const polygons = doc.entities.filter(
    (e): e is PolygonEntity => e.kind === 'polygon' && e.visible !== false
  );

  if (polygons.length === 0) {
    y += 40;
    ctx.font = `20px ${fontStack}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(
      lang === 'bn' ? 'কোনো বদ্ধ দাগ (পলিগন) পাওয়া যায়নি।' : 'No closed plot polygons found.',
      60,
      y
    );
  } else {
    const maxInlinePlots =
      doc.demarcationResults && doc.demarcationResults.length > 0 ? 4 : 8;
    polygons.slice(0, maxInlinePlots).forEach((poly, idx) => {
      y += 22;
      const areaSqFt = polygonAreaSqFt(poly.points);
      const b = computeAreaBreakdown(areaSqFt, doc.unitProfile);
      const perim = polygonPerimeterFt(poly.points, true);

      ctx.fillStyle = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      ctx.fillRect(60, y, W - 120, 92);
      ctx.strokeStyle = '#E2E8F0';
      ctx.strokeRect(60, y, W - 120, 92);

      ctx.fillStyle = '#0F5132';
      ctx.font = `bold 22px ${fontStack}`;
      const title = `${poly.plotNumber || (lang === 'bn' ? `দাগ ${formatNumber(idx + 1, 0, lang)}` : `Plot ${idx + 1}`)}${poly.ownerName ? ` — ${poly.ownerName}` : ''}`;
      ctx.fillText(title, 80, y + 34);

      ctx.fillStyle = '#1E293B';
      ctx.font = `19px ${fontStack}`;
      const line2 =
        lang === 'bn'
          ? `শতক: ${formatNumber(b.shotok, 3, 'bn')}  |  কাঠা: ${formatNumber(b.katha, 3, 'bn')}  |  বিঘা: ${formatNumber(b.bigha, 4, 'bn')}  |  ব.ফু.: ${formatNumber(b.sqFt, 1, 'bn')}  |  পরিসীমা: ${formatNumber(perim, 1, 'bn')} ফুট`
          : `Shotok: ${formatNumber(b.shotok, 3, 'en')}  |  Katha: ${formatNumber(b.katha, 3, 'en')}  |  Bigha: ${formatNumber(b.bigha, 4, 'en')}  |  Sq Ft: ${formatNumber(b.sqFt, 1, 'en')}  |  Perimeter: ${formatNumber(perim, 1, 'en')} ft`;
      ctx.fillText(line2, 80, y + 72);
      y += 96;
    });
  }

  // Demarcation Overlap Result Table (if present)
  const demRecords = doc.demarcationResults || [];
  const pages: Array<{ jpegBytes: Uint8Array; pxWidth: number; pxHeight: number }> = [];

  const drawFooterOnCanvas = (targetCtx: CanvasRenderingContext2D) => {
    const hasRaster = doc.hasRasterMeasurement || doc.rasterLayers.length > 0;
    targetCtx.fillStyle = hasRaster ? '#FEF3C7' : '#F1F5F9';
    targetCtx.fillRect(60, H - 150, W - 120, 96);
    targetCtx.strokeStyle = hasRaster ? '#F59E0B' : '#CBD5E1';
    targetCtx.strokeRect(60, H - 150, W - 120, 96);

    targetCtx.fillStyle = hasRaster ? '#92400E' : '#334155';
    targetCtx.font = `bold 18px ${fontStack}`;
    const disclaimer = hasRaster
      ? lang === 'bn'
        ? 'সতর্কবার্তা: স্ক্যান করা মৌজা নকশা বা ছবি থেকে পরিমাপকৃত ফলাফল আনুমানিক। চূড়ান্ত আইনি ও দলিল কাজের পূর্বে সরেজমিন সার্ভে যাচাই করুন।'
        : 'Disclaimer: Measurements derived from scanned maps or images are approximate. Verify with a physical ground survey before legal or deed execution.'
      : lang === 'bn'
        ? `ইউনিট প্রোফাইল: ${doc.unitProfile.nameBn}`
        : `Unit Profile: ${doc.unitProfile.nameEn}`;
    targetCtx.fillText(disclaimer.slice(0, 88), 80, H - 108);
    if (disclaimer.length > 88) {
      targetCtx.fillText(disclaimer.slice(88), 80, H - 78);
    }
  };

  if (demRecords.length > 0 && y + 180 < H - 170) {
    y += 30;
    ctx.fillStyle = '#1E3A8A';
    ctx.font = `bold 24px ${fontStack}`;
    ctx.fillText(
      lang === 'bn'
        ? 'ডিমার্কেশন ওভারল্যাপ ফলাফল (সাবেক ও হাল দাগ)'
        : 'Demarcation Overlap Result (Base vs Overlay Dag)',
      60,
      y
    );
    y += 18;

    demRecords.slice(0, 3).forEach((rec, idx) => {
      if (y + 115 > H - 165) return;
      y += 14;
      const ov = computePolygonOverlapMetrics(
        rec.basePolygon,
        rec.overlayPolygon,
        doc.unitProfile
      );
      ctx.fillStyle = idx % 2 === 0 ? '#EFF6FF' : '#FFFFFF';
      ctx.fillRect(60, y, W - 120, 102);
      ctx.strokeStyle = '#93C5FD';
      ctx.strokeRect(60, y, W - 120, 102);

      ctx.fillStyle = '#1E3A8A';
      ctx.font = `bold 21px ${fontStack}`;
      const headerTxt =
        lang === 'bn'
          ? `${rec.baseMapLabel} দাগ ${rec.baseDagNo} (${formatNumber(ov.baseBreakdown.shotok, 2, 'bn')} শতক)  ↔  ${rec.overlayMapLabel} দাগ ${rec.overlayDagNo} (${formatNumber(ov.overlayBreakdown.shotok, 2, 'bn')} শতক)`
          : `${rec.baseMapLabel} Dag ${rec.baseDagNo} (${formatNumber(ov.baseBreakdown.shotok, 2, 'en')} sh)  ↔  ${rec.overlayMapLabel} Dag ${rec.overlayDagNo} (${formatNumber(ov.overlayBreakdown.shotok, 2, 'en')} sh)`;
      ctx.fillText(headerTxt, 80, y + 34);

      ctx.fillStyle = '#0F172A';
      ctx.font = `bold 20px ${fontStack}`;
      const resTxt =
        lang === 'bn'
          ? `মিলিত ওভারল্যাপ: ${formatNumber(ov.overlapBreakdown.shotok, 3, 'bn')} শতক (${formatNumber(ov.overlapAreaSqFt, 1, 'bn')} ব.ফু.)  |  ${rec.baseMapLabel}-এর ${formatNumber(ov.percentOfBase, 1, 'bn')}%  |  ${rec.overlayMapLabel}-এর ${formatNumber(ov.percentOfOverlay, 1, 'bn')}%  |  RMS: ${formatNumber(rec.rmsErrorFt, 2, 'bn')} ফু`
          : `Overlap: ${formatNumber(ov.overlapBreakdown.shotok, 3, 'en')} sh (${formatNumber(ov.overlapAreaSqFt, 1, 'en')} sq ft)  |  ${formatNumber(ov.percentOfBase, 1, 'en')}% of ${rec.baseMapLabel}  |  ${formatNumber(ov.percentOfOverlay, 1, 'en')}% of ${rec.overlayMapLabel}  |  RMS: ${formatNumber(rec.rmsErrorFt, 2, 'en')} ft`;
      ctx.fillText(resTxt, 80, y + 74);
      y += 106;
    });
  }

  drawFooterOnCanvas(ctx);
  const page1Url = canvas.toDataURL('image/jpeg', 0.92);
  pages.push({
    jpegBytes: base64ToUint8(page1Url.split(',')[1]),
    pxWidth: W,
    pxHeight: H,
  });

  // If more demarcation records exist or page 1 was crowded, render dedicated page 2 table
  if (demRecords.length > 0 && (y + 180 >= H - 170 || demRecords.length > 3)) {
    const c2 = document.createElement('canvas');
    c2.width = W;
    c2.height = H;
    const ctx2 = c2.getContext('2d');
    if (ctx2) {
      ctx2.fillStyle = '#FFFFFF';
      ctx2.fillRect(0, 0, W, H);
      ctx2.fillStyle = '#1E3A8A';
      ctx2.fillRect(0, 0, W, 108);
      ctx2.fillStyle = '#FFFFFF';
      ctx2.font = `bold 30px ${fontStack}`;
      ctx2.fillText(
        lang === 'bn'
          ? 'ডিমার্কেশন ওভারল্যাপ তালিকা (সাবেক–হাল দাগ)'
          : 'Demarcation Overlap Result Table',
        60,
        66
      );
      let y2 = 150;
      demRecords.forEach((rec, idx) => {
        if (y2 + 120 > H - 170) return;
        const ov = computePolygonOverlapMetrics(
          rec.basePolygon,
          rec.overlayPolygon,
          doc.unitProfile
        );
        ctx2.fillStyle = idx % 2 === 0 ? '#EFF6FF' : '#F8FAFC';
        ctx2.fillRect(60, y2, W - 120, 106);
        ctx2.strokeStyle = '#93C5FD';
        ctx2.strokeRect(60, y2, W - 120, 106);
        ctx2.fillStyle = '#1E3A8A';
        ctx2.font = `bold 22px ${fontStack}`;
        ctx2.fillText(
          `${rec.baseMapLabel} ${rec.baseDagNo} ↔ ${rec.overlayMapLabel} ${rec.overlayDagNo}`,
          80,
          y2 + 36
        );
        ctx2.fillStyle = '#0F172A';
        ctx2.font = `19px ${fontStack}`;
        ctx2.fillText(
          lang === 'bn'
            ? `ওভারল্যাপ: ${formatNumber(ov.overlapBreakdown.shotok, 3, 'bn')} শতক | ${rec.baseMapLabel}: ${formatNumber(ov.percentOfBase, 1, 'bn')}% | ${rec.overlayMapLabel}: ${formatNumber(ov.percentOfOverlay, 1, 'bn')}% | RMS: ${formatNumber(rec.rmsErrorFt, 2, 'bn')} ফু`
            : `Overlap: ${formatNumber(ov.overlapBreakdown.shotok, 3, 'en')} sh | ${rec.baseMapLabel}: ${formatNumber(ov.percentOfBase, 1, 'en')}% | ${rec.overlayMapLabel}: ${formatNumber(ov.percentOfOverlay, 1, 'en')}% | RMS: ${formatNumber(rec.rmsErrorFt, 2, 'en')} ft`,
          80,
          y2 + 76
        );
        y2 += 120;
      });
      drawFooterOnCanvas(ctx2);
      const page2Url = c2.toDataURL('image/jpeg', 0.92);
      pages.push({
        jpegBytes: base64ToUint8(page2Url.split(',')[1]),
        pxWidth: W,
        pxHeight: H,
      });
    }
  }

  const calcRecords = doc.calculatorRecords || [];
  if (calcRecords.length > 0) {
    const cCalc = document.createElement('canvas');
    cCalc.width = W;
    cCalc.height = H;
    const ctxC = cCalc.getContext('2d');
    if (ctxC) {
      ctxC.fillStyle = '#FFFFFF';
      ctxC.fillRect(0, 0, W, H);
      ctxC.fillStyle = '#0F5132';
      ctxC.fillRect(0, 0, W, 108);
      ctxC.fillStyle = '#FFFFFF';
      ctxC.font = `bold 30px ${fontStack}`;
      ctxC.fillText(
        lang === 'bn'
          ? 'ক্যালকুলেটর ও তফসিল হিসাব তালিকা'
          : 'Calculator & Share Distribution Summary',
        60,
        66
      );
      let yC = 148;
      calcRecords.forEach((rec, idx) => {
        if (yC + 100 > H - 170) return;
        ctxC.fillStyle = idx % 2 === 0 ? '#FAFBF8' : '#FFFFFF';
        ctxC.fillRect(60, yC, W - 120, 82);
        ctxC.strokeStyle = '#CBD5E1';
        ctxC.strokeRect(60, yC, W - 120, 82);

        ctxC.fillStyle = '#0F5132';
        ctxC.font = `bold 21px ${fontStack}`;
        ctxC.fillText(rec.title, 80, yC + 32);

        ctxC.fillStyle = '#1E293B';
        ctxC.font = `18px ${fontStack}`;
        ctxC.fillText(rec.summary, 80, yC + 64);
        yC += 94;

        if (rec.rows && rec.rows.length > 0) {
          rec.rows.slice(0, 8).forEach((row) => {
            if (yC + 44 > H - 170) return;
            ctxC.fillStyle = '#F8FAFC';
            ctxC.fillRect(84, yC, W - 144, 38);
            ctxC.strokeStyle = '#E2E8F0';
            ctxC.strokeRect(84, yC, W - 144, 38);
            ctxC.fillStyle = '#0F172A';
            ctxC.font = `17px ${fontStack}`;
            const line =
              lang === 'bn'
                ? `${row.label} (${row.shareText}): ${formatNumber(row.shotok, 3, 'bn')} শতক | ${formatNumber(row.katha, 3, 'bn')} কাঠা | ${formatNumber(row.sqFt, 1, 'bn')} ব.ফু.`
                : `${row.label} (${row.shareText}): ${formatNumber(row.shotok, 3, 'en')} sh | ${formatNumber(row.katha, 3, 'en')} ka | ${formatNumber(row.sqFt, 1, 'en')} sq ft`;
            ctxC.fillText(line, 100, yC + 25);
            yC += 44;
          });
          yC += 10;
        }
      });
      drawFooterOnCanvas(ctxC);
      const calcUrl = cCalc.toDataURL('image/jpeg', 0.92);
      pages.push({
        jpegBytes: base64ToUint8(calcUrl.split(',')[1]),
        pxWidth: W,
        pxHeight: H,
      });
    }
  }

  const partRecords = doc.partitionResults || [];
  if (partRecords.length > 0) {
    const cPart = document.createElement('canvas');
    cPart.width = W;
    cPart.height = H;
    const ctxP = cPart.getContext('2d');
    if (ctxP) {
      ctxP.fillStyle = '#FFFFFF';
      ctxP.fillRect(0, 0, W, H);
      ctxP.fillStyle = '#0F5132';
      ctxP.fillRect(0, 0, W, 108);
      ctxP.fillStyle = '#FFFFFF';
      ctxP.font = `bold 30px ${fontStack}`;
      ctxP.fillText(
        lang === 'bn'
          ? 'ভাগবণ্টন (জমি বিভাজন) ফলাফল তালিকা'
          : 'Plot Division (Bhagbonton) Summary Table',
        60,
        66
      );

      let yP = 148;
      partRecords.forEach((rec) => {
        if (yP + 110 > H - 170) return;
        ctxP.fillStyle = '#FAFBF8';
        ctxP.fillRect(60, yP, W - 120, 74);
        ctxP.strokeStyle = '#CBD5E1';
        ctxP.strokeRect(60, yP, W - 120, 74);
        ctxP.fillStyle = '#0F5132';
        ctxP.font = `bold 21px ${fontStack}`;
        ctxP.fillText(
          `${rec.sourcePlotName} · ${rec.modeLabel} · ${rec.directionLabel}`,
          80,
          yP + 30
        );
        ctxP.fillStyle = '#475569';
        ctxP.font = `18px ${fontStack}`;
        ctxP.fillText(
          lang === 'bn'
            ? `মোট জমি: ${formatNumber(rec.totalAreaSqFt, 2, 'bn')} ব.ফু. (${formatNumber(rec.totalAreaSqFt / 435.6, 3, 'bn')} শতক)`
            : `Total Area: ${formatNumber(rec.totalAreaSqFt, 2, 'en')} sq ft (${formatNumber(rec.totalAreaSqFt / 435.6, 3, 'en')} shotok)`,
          80,
          yP + 58
        );
        yP += 88;

        rec.parts.slice(0, 12).forEach((row, rIdx) => {
          if (yP + 68 > H - 170) return;
          ctxP.fillStyle = rIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
          ctxP.fillRect(60, yP, W - 120, 62);
          ctxP.strokeStyle = '#E2E8F0';
          ctxP.strokeRect(60, yP, W - 120, 62);

          ctxP.fillStyle = '#0F172A';
          ctxP.font = `bold 18px ${fontStack}`;
          const topLine =
            lang === 'bn'
              ? `${row.name} (${row.shareLabel}): ${formatNumber(row.shotok, 3, 'bn')} শতক | ${formatNumber(row.katha, 3, 'bn')} কাঠা | ${formatNumber(row.sqFt, 2, 'bn')} ব.ফু.`
              : `${row.name} (${row.shareLabel}): ${formatNumber(row.shotok, 3, 'en')} sh | ${formatNumber(row.katha, 3, 'en')} ka | ${formatNumber(row.sqFt, 2, 'en')} sq ft`;
          ctxP.fillText(topLine, 80, yP + 26);

          ctxP.fillStyle = '#475569';
          ctxP.font = `16px ${fontStack}`;
          const sidesStr = row.sideLengthsFt
            .map((s) => formatNumber(s, 1, lang))
            .join(', ');
          ctxP.fillText(
            lang === 'bn'
              ? `বাহু (ফুট): ${sidesStr}  |  পরিসীমা: ${formatNumber(row.perimeterFt, 1, 'bn')} ফু`
              : `Sides (ft): ${sidesStr}  |  Perimeter: ${formatNumber(row.perimeterFt, 1, 'en')} ft`,
            80,
            yP + 50
          );
          yP += 68;
        });
        yP += 14;
      });

      ctxP.fillStyle = '#FEF3C7';
      ctxP.fillRect(60, H - 150, W - 120, 96);
      ctxP.strokeStyle = '#F59E0B';
      ctxP.strokeRect(60, H - 150, W - 120, 96);
      ctxP.fillStyle = '#92400E';
      ctxP.font = `bold 19px ${fontStack}`;
      ctxP.fillText(
        lang === 'bn'
          ? 'নোট: ভাগবণ্টনের এই ফলাফল আনুমানিক এবং এটি কোনো আইনি পরামর্শ নয়।'
          : 'Note: Plot division results are approximate and do not constitute legal advice.',
        80,
        H - 96
      );

      const partUrl = cPart.toDataURL('image/jpeg', 0.92);
      pages.push({
        jpegBytes: base64ToUint8(partUrl.split(',')[1]),
        pxWidth: W,
        pxHeight: H,
      });
    }
  }

  return buildPdfFromJpegs(pages);
}
