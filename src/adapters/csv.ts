import { CadDocument, PolygonEntity } from '../core/cad/types';
import {
  computeAreaBreakdown,
  computePolygonOverlapMetrics,
  polygonAreaSqFt,
  polygonPerimeterFt,
} from '../core/survey/area';
import { azimuthDegrees, wcbToReducedBearing } from '../core/survey/bearing';
import { distance2D } from '../core/survey/coordinates';
import { fromFeet } from '../core/survey/units';

function csvCell(val: string | number): string {
  const s = String(val);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportDocumentToCsv(
  doc: CadDocument,
  lang: 'bn' | 'en' = 'bn',
  orgInfo?: { organizationName?: string; phoneNumber?: string }
): string {
  const rows: string[] = [];
  const hasRaster = doc.hasRasterMeasurement || doc.rasterLayers.length > 0;

  rows.push([csvCell('SurveyCAD Report'), csvCell(doc.name)].join(','));
  if (orgInfo?.organizationName || orgInfo?.phoneNumber) {
    rows.push(
      [
        csvCell(orgInfo.organizationName || ''),
        csvCell(orgInfo.phoneNumber || ''),
      ].join(',')
    );
  }
  rows.push([csvCell('Unit Profile'), csvCell(lang === 'bn' ? doc.unitProfile.nameBn : doc.unitProfile.nameEn)].join(','));

  if (hasRaster) {
    rows.push(
      [
        csvCell(lang === 'bn' ? 'সতর্কবার্তা' : 'Disclaimer'),
        csvCell(
          lang === 'bn'
            ? 'স্ক্যান করা ম্যাপ/ছবি থেকে মাপা ফলাফল আনুমানিক; চূড়ান্ত আইনি বা দলিলের কাজের জন্য সরেজমিন সার্ভে যাচাই আবশ্যক।'
            : 'Measurements taken from scanned maps/images are approximate; verify with a physical field survey for legal or deed purposes.'
        ),
      ].join(',')
    );
  }
  rows.push('');

  const polygons = doc.entities.filter(
    (e): e is PolygonEntity => e.kind === 'polygon' && e.visible !== false
  );

  rows.push(
    [
      'Plot ID / Dag',
      'Owner',
      'Sq Ft',
      'Sq M',
      'Shotok',
      'Katha',
      'Bigha',
      'Acre',
      'Perimeter (ft)',
      'Perimeter (chain)',
    ]
      .map(csvCell)
      .join(',')
  );

  polygons.forEach((poly, idx) => {
    const areaSqFt = polygonAreaSqFt(poly.points);
    const b = computeAreaBreakdown(areaSqFt, doc.unitProfile);
    const perimFt = polygonPerimeterFt(poly.points, true);
    rows.push(
      [
        poly.plotNumber || `Plot-${idx + 1}`,
        poly.ownerName || '',
        b.sqFt.toFixed(3),
        b.sqM.toFixed(3),
        b.shotok.toFixed(4),
        b.katha.toFixed(4),
        b.bigha.toFixed(4),
        b.acre.toFixed(5),
        perimFt.toFixed(3),
        fromFeet(perimFt, 'chain').toFixed(4),
      ]
        .map(csvCell)
        .join(',')
    );
  });

  if (doc.demarcationResults && doc.demarcationResults.length > 0) {
    rows.push('');
    rows.push(
      csvCell(
        lang === 'bn'
          ? 'ডিমার্কেশন ওভারল্যাপ ফলাফল (সাবেক ও হাল দাগ)'
          : 'Demarcation Overlap Result Table (Base vs Overlay Dag)'
      )
    );
    rows.push(
      [
        'Base Map',
        'Base Dag (Sabek)',
        'Base Area (Shotok)',
        'Overlay Map',
        'Overlay Dag (Hal)',
        'Overlay Area (Shotok)',
        'Overlap Area (Shotok)',
        'Overlap Area (Sq Ft)',
        '% of Base',
        '% of Overlay',
        'Alignment RMS (ft)',
      ]
        .map(csvCell)
        .join(',')
    );
    doc.demarcationResults.forEach((rec) => {
      const m = computePolygonOverlapMetrics(
        rec.basePolygon,
        rec.overlayPolygon,
        doc.unitProfile
      );
      rows.push(
        [
          rec.baseMapLabel,
          rec.baseDagNo,
          m.baseBreakdown.shotok.toFixed(4),
          rec.overlayMapLabel,
          rec.overlayDagNo,
          m.overlayBreakdown.shotok.toFixed(4),
          m.overlapBreakdown.shotok.toFixed(4),
          m.overlapAreaSqFt.toFixed(2),
          `${m.percentOfBase.toFixed(2)}%`,
          `${m.percentOfOverlay.toFixed(2)}%`,
          rec.rmsErrorFt.toFixed(2),
        ]
          .map(csvCell)
          .join(',')
      );
    });
  }

  if (doc.calculatorRecords && doc.calculatorRecords.length > 0) {
    rows.push('');
    rows.push(
      csvCell(
        lang === 'bn'
          ? 'ক্যালকুলেটর ও হিস্যা ফলাফল তালিকা'
          : 'Calculator & Share Distribution Records'
      )
    );
    rows.push(['Title', 'Summary', 'Area (Sq Ft)'].map(csvCell).join(','));
    doc.calculatorRecords.forEach((rec) => {
      rows.push(
        [rec.title, rec.summary, rec.areaSqFt.toFixed(2)].map(csvCell).join(',')
      );
      if (rec.rows && rec.rows.length > 0) {
        rows.push(
          [
            'Name',
            'Share',
            'Shotok',
            'Katha',
            'Bigha',
            'Acre',
            'Sq Ft',
            'Sq M',
          ]
            .map(csvCell)
            .join(',')
        );
        rec.rows.forEach((r) => {
          rows.push(
            [
              r.label,
              r.shareText,
              r.shotok.toFixed(4),
              r.katha.toFixed(4),
              r.bigha.toFixed(4),
              r.acre.toFixed(5),
              r.sqFt.toFixed(2),
              r.sqM.toFixed(2),
            ]
              .map(csvCell)
              .join(',')
          );
        });
      }
    });
  }

  if (doc.partitionResults && doc.partitionResults.length > 0) {
    rows.push('');
    rows.push(
      csvCell(
        lang === 'bn'
          ? 'ভাগবণ্টন (জমি বিভাজন) ফলাফল তালিকা'
          : 'Plot Division (Bhagbonton) Result Table'
      )
    );
    rows.push(
      csvCell(
        lang === 'bn'
          ? 'সতর্কবার্তা: ফলাফল আনুমানিক এবং এটি কোনো আইনি পরামর্শ নয়।'
          : 'Note: Results are approximate and do not constitute legal advice.'
      )
    );
    doc.partitionResults.forEach((rec) => {
      rows.push(
        [
          rec.sourcePlotName,
          rec.modeLabel,
          rec.directionLabel,
          `${rec.totalAreaSqFt.toFixed(2)} sq ft`,
        ]
          .map(csvCell)
          .join(',')
      );
      rows.push(
        [
          'Share Holder',
          'Share',
          'Shotok',
          'Katha',
          'Bigha',
          'Acre',
          'Sq Ft',
          'Perimeter (ft)',
          'Side Lengths (ft)',
        ]
          .map(csvCell)
          .join(',')
      );
      rec.parts.forEach((p) => {
        rows.push(
          [
            p.name,
            p.shareLabel,
            p.shotok.toFixed(4),
            p.katha.toFixed(4),
            p.bigha.toFixed(4),
            p.acre.toFixed(5),
            p.sqFt.toFixed(2),
            p.perimeterFt.toFixed(2),
            p.sideLengthsFt.map((s) => s.toFixed(2)).join(' | '),
          ]
            .map(csvCell)
            .join(',')
        );
      });
    });
  }

  rows.push('');
  rows.push(
    ['Plot', 'Edge', 'Start X (ft)', 'Start Y (ft)', 'End X (ft)', 'End Y (ft)', 'Length (ft)', 'Length (hat)', 'Length (gaj)', 'WCB (deg)', 'Reduced Bearing']
      .map(csvCell)
      .join(',')
  );

  polygons.forEach((poly, idx) => {
    const plotLabel = poly.plotNumber || `Plot-${idx + 1}`;
    for (let i = 0; i < poly.points.length; i++) {
      const a = poly.points[i];
      const b = poly.points[(i + 1) % poly.points.length];
      const len = distance2D(a, b);
      const wcb = azimuthDegrees(a, b);
      const rb = wcbToReducedBearing(wcb);
      rows.push(
        [
          plotLabel,
          `S${i + 1}`,
          a.x.toFixed(3),
          a.y.toFixed(3),
          b.x.toFixed(3),
          b.y.toFixed(3),
          len.toFixed(3),
          fromFeet(len, 'hat').toFixed(3),
          fromFeet(len, 'gaj').toFixed(3),
          wcb.toFixed(2),
          rb.formattedEn,
        ]
          .map(csvCell)
          .join(',')
      );
    }
  });

  // Prepend UTF-8 BOM for Excel Bengali compatibility
  return `\uFEFF${rows.join('\n')}`;
}

