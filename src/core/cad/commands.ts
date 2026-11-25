import { AreaUnit, LinearUnit, UnitProfile } from '../survey/units';
import { getDocumentLayers, isEntityLocked } from './entities';
import { translateEntity } from './geometry';
import {
  CadDocument,
  CadEntity,
  CadLayer,
  CalculatorRecord,
  DEFAULT_LAYERS,
  DemarcationRecord,
  EntityProperties,
  OverlayAlignmentState,
  PartitionRecord,
  RasterLayer,
} from './types';

export interface EditEntityPropertiesPatch {
  layerId?: string;
  layer?: string;
  color?: string;
  visible?: boolean;
  locked?: boolean;
  text?: string;
  heightFt?: number;
  label?: string;
  plotNumber?: string;
  ownerName?: string;
  properties?: EntityProperties;
}

export type CadCommand =
  | {
      type: 'ADD_ENTITIES';
      label: string;
      entities: CadEntity[];
      markRasterMeasurement?: boolean;
    }
  | {
      type: 'UPDATE_ENTITY';
      label: string;
      id: string;
      next: CadEntity;
    }
  | {
      type: 'MOVE_ENTITIES';
      label: string;
      ids: string[];
      dx: number;
      dy: number;
    }
  | {
      type: 'EDIT_ENTITY_PROPERTIES';
      label: string;
      ids: string[];
      patch: EditEntityPropertiesPatch;
    }
  | {
      type: 'DELETE_ENTITIES';
      label: string;
      ids: string[];
      allowLocked?: boolean;
    }
  | {
      type: 'REPLACE_ENTITIES';
      label: string;
      removeIds: string[];
      addEntities: CadEntity[];
      markRasterMeasurement?: boolean;
    }
  | {
      type: 'CREATE_LAYER';
      label: string;
      layer: CadLayer;
      setActive?: boolean;
    }
  | {
      type: 'UPDATE_LAYER';
      label: string;
      id: string;
      patch: Partial<CadLayer>;
    }
  | {
      type: 'DELETE_LAYER';
      label: string;
      id: string;
      reassignLayerId?: string;
    }
  | {
      type: 'SET_ACTIVE_LAYER';
      label: string;
      layerId: string;
    }
  | {
      type: 'ADD_RASTER_LAYER';
      label: string;
      layer: RasterLayer;
    }
  | {
      type: 'UPDATE_RASTER_LAYER';
      label: string;
      id: string;
      next: RasterLayer;
    }
  | {
      type: 'DELETE_RASTER_LAYER';
      label: string;
      id: string;
    }
  | {
      type: 'UPDATE_DOCUMENT_META';
      label: string;
      patch: {
        name?: string;
        unitProfile?: UnitProfile;
        linearUnit?: LinearUnit;
        areaUnit?: AreaUnit;
        hasRasterMeasurement?: boolean;
        overlayAlignment?: OverlayAlignmentState | null;
        demarcationResults?: DemarcationRecord[];
        calculatorRecords?: CalculatorRecord[];
        partitionResults?: PartitionRecord[];
      };
    };

export interface HistoryState {
  present: CadDocument;
  past: CadDocument[];
  future: CadDocument[];
}

const MAX_HISTORY = 100;

export function createHistory(initial: CadDocument): HistoryState {
  return {
    present: initial,
    past: [],
    future: [],
  };
}

export function applyCommandToDocument(
  doc: CadDocument,
  cmd: CadCommand
): CadDocument {
  const now = Date.now();
  const layers = getDocumentLayers(doc);

  switch (cmd.type) {
    case 'ADD_ENTITIES': {
      const anyRaster =
        cmd.markRasterMeasurement ||
        cmd.entities.some((e) => e.measuredFromRaster);
      return {
        ...doc,
        updatedAt: now,
        hasRasterMeasurement: doc.hasRasterMeasurement || anyRaster,
        entities: [...doc.entities, ...cmd.entities],
      };
    }
    case 'UPDATE_ENTITY':
      return {
        ...doc,
        updatedAt: now,
        entities: doc.entities.map((e) => (e.id === cmd.id ? cmd.next : e)),
      };
    case 'MOVE_ENTITIES': {
      const idSet = new Set(cmd.ids);
      return {
        ...doc,
        updatedAt: now,
        entities: doc.entities.map((e) => {
          if (!idSet.has(e.id) || isEntityLocked(e, layers)) return e;
          return translateEntity(e, cmd.dx, cmd.dy);
        }),
      };
    }
    case 'EDIT_ENTITY_PROPERTIES': {
      const idSet = new Set(cmd.ids);
      const targetLayer = cmd.patch.layerId
        ? layers.find((l) => l.id === cmd.patch.layerId)
        : undefined;
      return {
        ...doc,
        updatedAt: now,
        entities: doc.entities.map((e) => {
          if (!idSet.has(e.id)) return e;
          const nextBase: CadEntity = {
            ...e,
            layerId: cmd.patch.layerId ?? e.layerId,
            layer: targetLayer?.name ?? cmd.patch.layer ?? e.layer,
            color: cmd.patch.color ?? e.color,
            visible: cmd.patch.visible ?? e.visible,
            locked: cmd.patch.locked ?? e.locked,
            properties: cmd.patch.properties
              ? { ...e.properties, ...cmd.patch.properties }
              : e.properties,
          };
          if (nextBase.kind === 'text') {
            const nextText = cmd.patch.text ?? nextBase.text;
            const nextH = cmd.patch.heightFt ?? nextBase.heightFt;
            return {
              ...nextBase,
              text: nextText,
              heightFt: nextH,
              geometry: {
                position: nextBase.position,
                text: nextText,
                heightFt: nextH,
                rotationDeg: nextBase.rotationDeg,
              },
            };
          }
          if (nextBase.kind === 'point' && cmd.patch.label !== undefined) {
            return { ...nextBase, label: cmd.patch.label };
          }
          if (nextBase.kind === 'polygon') {
            return {
              ...nextBase,
              plotNumber:
                cmd.patch.plotNumber !== undefined
                  ? cmd.patch.plotNumber
                  : nextBase.plotNumber,
              ownerName:
                cmd.patch.ownerName !== undefined
                  ? cmd.patch.ownerName
                  : nextBase.ownerName,
            };
          }
          return nextBase;
        }),
      };
    }
    case 'DELETE_ENTITIES': {
      const idSet = new Set(cmd.ids);
      return {
        ...doc,
        updatedAt: now,
        entities: doc.entities.filter(
          (e) => !idSet.has(e.id) || (!cmd.allowLocked && isEntityLocked(e, layers))
        ),
      };
    }
    case 'REPLACE_ENTITIES': {
      const removeSet = new Set(cmd.removeIds);
      const anyRaster =
        cmd.markRasterMeasurement ||
        cmd.addEntities.some((e) => e.measuredFromRaster);
      return {
        ...doc,
        updatedAt: now,
        hasRasterMeasurement: doc.hasRasterMeasurement || anyRaster,
        entities: [
          ...doc.entities.filter((e) => !removeSet.has(e.id)),
          ...cmd.addEntities,
        ],
      };
    }
    case 'CREATE_LAYER': {
      const exists = layers.some((l) => l.id === cmd.layer.id);
      const nextLayers = exists ? layers : [...layers, cmd.layer];
      return {
        ...doc,
        updatedAt: now,
        layers: nextLayers,
        activeLayerId: cmd.setActive ? cmd.layer.id : doc.activeLayerId || nextLayers[0].id,
      };
    }
    case 'UPDATE_LAYER': {
      const prevLayer = layers.find((l) => l.id === cmd.id);
      const nextLayers = layers.map((l) =>
        l.id === cmd.id ? { ...l, ...cmd.patch } : l
      );
      const renamedName = cmd.patch.name;
      const nextEntities =
        renamedName && prevLayer && renamedName !== prevLayer.name
          ? doc.entities.map((e) =>
              e.layerId === cmd.id || e.layer === prevLayer.name
                ? { ...e, layer: renamedName, layerId: cmd.id }
                : e
            )
          : doc.entities;
      return {
        ...doc,
        updatedAt: now,
        layers: nextLayers,
        entities: nextEntities,
      };
    }
    case 'DELETE_LAYER': {
      if (layers.length <= 1) return doc;
      const remaining = layers.filter((l) => l.id !== cmd.id);
      const fallback =
        remaining.find((l) => l.id === cmd.reassignLayerId) ||
        remaining[0] ||
        DEFAULT_LAYERS[0];
      return {
        ...doc,
        updatedAt: now,
        layers: remaining,
        activeLayerId:
          doc.activeLayerId === cmd.id ? fallback.id : doc.activeLayerId,
        entities: doc.entities.map((e) =>
          e.layerId === cmd.id
            ? { ...e, layerId: fallback.id, layer: fallback.name }
            : e
        ),
      };
    }
    case 'SET_ACTIVE_LAYER':
      return {
        ...doc,
        updatedAt: now,
        layers,
        activeLayerId: cmd.layerId,
      };
    case 'ADD_RASTER_LAYER':
      return {
        ...doc,
        updatedAt: now,
        hasRasterMeasurement: true,
        rasterLayers: [...doc.rasterLayers, cmd.layer],
      };
    case 'UPDATE_RASTER_LAYER':
      return {
        ...doc,
        updatedAt: now,
        rasterLayers: doc.rasterLayers.map((r) =>
          r.id === cmd.id ? cmd.next : r
        ),
      };
    case 'DELETE_RASTER_LAYER':
      return {
        ...doc,
        updatedAt: now,
        rasterLayers: doc.rasterLayers.filter((r) => r.id !== cmd.id),
      };
    case 'UPDATE_DOCUMENT_META':
      return {
        ...doc,
        updatedAt: now,
        ...cmd.patch,
      };
  }
}

export function dispatchCommand(
  history: HistoryState,
  cmd: CadCommand
): HistoryState {
  const nextDoc = applyCommandToDocument(history.present, cmd);
  const nextPast = [...history.past, history.present];
  if (nextPast.length > MAX_HISTORY) {
    nextPast.shift();
  }
  return {
    present: nextDoc,
    past: nextPast,
    future: [],
  };
}

export function undoHistory(history: HistoryState): HistoryState {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  const nextPast = history.past.slice(0, -1);
  return {
    present: previous,
    past: nextPast,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: HistoryState): HistoryState {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  const nextFuture = history.future.slice(1);
  return {
    present: next,
    past: [...history.past, history.present],
    future: nextFuture,
  };
}
