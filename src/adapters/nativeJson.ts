import { CadDocument, createEmptyDocument } from '../core/cad/types';
import { DEFAULT_UNIT_PROFILE } from '../core/survey/units';

export interface SurveyCadJsonEnvelope {
  format: 'SurveyCAD';
  version: 1;
  exportedAt: string;
  document: CadDocument;
}

export function serializeProjectJson(doc: CadDocument): string {
  const envelope: SurveyCadJsonEnvelope = {
    format: 'SurveyCAD',
    version: 1,
    exportedAt: new Date().toISOString(),
    document: doc,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseProjectJson(raw: string): CadDocument {
  const parsed = JSON.parse(raw) as Partial<SurveyCadJsonEnvelope> | Partial<CadDocument>;
  const docCandidate =
    parsed && typeof parsed === 'object' && 'document' in parsed && parsed.document
      ? (parsed.document as Partial<CadDocument>)
      : (parsed as Partial<CadDocument>);

  if (!docCandidate || typeof docCandidate !== 'object' || !Array.isArray(docCandidate.entities)) {
    throw new Error('Invalid SurveyCAD project file');
  }

  const fallback = createEmptyDocument(docCandidate.name || 'Imported Project');
  return {
    ...fallback,
    ...docCandidate,
    id: docCandidate.id || fallback.id,
    name: docCandidate.name || fallback.name,
    unitProfile: docCandidate.unitProfile || DEFAULT_UNIT_PROFILE,
    linearUnit: docCandidate.linearUnit || 'ft',
    areaUnit: docCandidate.areaUnit || 'shotok',
    layers: Array.isArray(docCandidate.layers) && docCandidate.layers.length > 0 ? docCandidate.layers : fallback.layers,
    activeLayerId: docCandidate.activeLayerId || fallback.activeLayerId,
    entities: docCandidate.entities,
    rasterLayers: Array.isArray(docCandidate.rasterLayers) ? docCandidate.rasterLayers : [],
    hasRasterMeasurement: Boolean(docCandidate.hasRasterMeasurement),
  };
}
