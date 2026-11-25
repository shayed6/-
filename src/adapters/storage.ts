import { CadDocument, createEmptyDocument } from '../core/cad/types';
import { DEFAULT_UNIT_PROFILE, UnitProfile } from '../core/survey/units';

const DB_NAME = 'surveycad_db_v1';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_SETTINGS = 'settings';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  entityCount: number;
  rasterCount: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
  language: 'bn' | 'en';
  theme: ThemeMode;
  unitProfile: UnitProfile;
  organizationName: string;
  phoneNumber: string;
  advancedMode: boolean;
  scannerPixelsPerInch: number | null;
  licenseCode: string | null;
}

export interface AllProjectsBackup {
  format: 'surveycad-full-backup';
  version: 1;
  exportedAt: number;
  settings?: AppSettings;
  projects: CadDocument[];
}

const DEFAULT_SETTINGS: AppSettings = {
  language: 'bn',
  theme: 'system',
  unitProfile: DEFAULT_UNIT_PROFILE,
  organizationName: '',
  phoneNumber: '',
  advancedMode: false,
  scannerPixelsPerInch: null,
  licenseCode: null,
};

function normalizeDocument(raw: Partial<CadDocument>): CadDocument | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entities)) {
    return null;
  }
  const fallback = createEmptyDocument(
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Imported Project'
  );
  return {
    ...fallback,
    ...raw,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback.name,
    unitProfile: raw.unitProfile || DEFAULT_UNIT_PROFILE,
    linearUnit: raw.linearUnit || 'ft',
    areaUnit: raw.areaUnit || 'shotok',
    layers:
      Array.isArray(raw.layers) && raw.layers.length > 0 ? raw.layers : fallback.layers,
    activeLayerId: raw.activeLayerId || fallback.activeLayerId,
    entities: raw.entities,
    rasterLayers: Array.isArray(raw.rasterLayers) ? raw.rasterLayers : [],
    hasRasterMeasurement: Boolean(raw.hasRasterMeasurement),
  };
}

export function serializeAllProjectsBackup(
  projects: CadDocument[],
  settings?: AppSettings
): string {
  const payload: AllProjectsBackup = {
    format: 'surveycad-full-backup',
    version: 1,
    exportedAt: Date.now(),
    ...(settings ? { settings } : {}),
    projects,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseAllProjectsBackup(rawJson: string): {
  projects: CadDocument[];
  settings: AppSettings | null;
} {
  const parsed = JSON.parse(rawJson) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup JSON');
  }

  let rawList: Partial<CadDocument>[] = [];
  let restoredSettings: AppSettings | null = null;

  if (Array.isArray(parsed)) {
    rawList = parsed as Partial<CadDocument>[];
  } else {
    const obj = parsed as Record<string, unknown>;
    if (obj.format === 'surveycad-full-backup' && Array.isArray(obj.projects)) {
      rawList = obj.projects as Partial<CadDocument>[];
      if (obj.settings && typeof obj.settings === 'object') {
        restoredSettings = {
          ...DEFAULT_SETTINGS,
          ...(obj.settings as Partial<AppSettings>),
        };
      }
    } else if (Array.isArray(obj.projects)) {
      rawList = obj.projects as Partial<CadDocument>[];
    } else if (obj.document && typeof obj.document === 'object') {
      rawList = [obj.document as Partial<CadDocument>];
    } else if (Array.isArray(obj.entities)) {
      rawList = [obj as unknown as Partial<CadDocument>];
    }
  }

  const projects = rawList
    .map((item) => normalizeDocument(item))
    .filter((d): d is CadDocument => Boolean(d));

  if (projects.length === 0 && (!Array.isArray(rawList) || rawList.length > 0 || !restoredSettings)) {
    // Allow empty projects array only if it's explicitly a valid full-backup envelope
    const isExplicitEmptyFullBackup =
      !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>).format === 'surveycad-full-backup' &&
      Array.isArray((parsed as Record<string, unknown>).projects);
    if (!isExplicitEmptyFullBackup) {
      throw new Error('No valid SurveyCAD projects found in backup file');
    }
  }

  return { projects, settings: restoredSettings };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveProjectToDb(doc: CadDocument): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      tx.objectStore(STORE_PROJECTS).put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try {
      localStorage.setItem(`surveycad_proj_${doc.id}`, JSON.stringify(doc));
    } catch {
      // Ignore quota errors in constrained environments
    }
  }
}

export async function loadProjectFromDb(id: string): Promise<CadDocument | null> {
  try {
    const db = await openDb();
    const res = await new Promise<CadDocument | null>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).get(id);
      req.onsuccess = () => resolve((req.result as CadDocument) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res;
  } catch {
    const raw = localStorage.getItem(`surveycad_proj_${id}`);
    return raw ? (JSON.parse(raw) as CadDocument) : null;
  }
}

export async function loadAllProjectsFromDb(): Promise<CadDocument[]> {
  try {
    const db = await openDb();
    const all = await new Promise<CadDocument[]>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).getAll();
      req.onsuccess = () => resolve((req.result as CadDocument[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    try {
      const docs: CadDocument[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('surveycad_proj_')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw) as CadDocument;
            if (parsed && parsed.id) docs.push(parsed);
          }
        }
      }
      return docs.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }
}

export async function listProjectsFromDb(): Promise<ProjectSummary[]> {
  const all = await loadAllProjectsFromDb();
  return all.map((d) => ({
    id: d.id,
    name: d.name,
    updatedAt: d.updatedAt,
    entityCount: d.entities.length,
    rasterCount: d.rasterLayers.length,
  }));
}

export async function deleteProjectFromDb(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      tx.objectStore(STORE_PROJECTS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    localStorage.removeItem(`surveycad_proj_${id}`);
  }
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const db = await openDb();
    const res = await new Promise<AppSettings | null>((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const req = tx.objectStore(STORE_SETTINGS).get('app_settings');
      req.onsuccess = () => resolve(req.result?.value || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res ? { ...DEFAULT_SETTINGS, ...res } : { ...DEFAULT_SETTINGS };
  } catch {
    const raw = localStorage.getItem('surveycad_settings');
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      tx.objectStore(STORE_SETTINGS).put({ key: 'app_settings', value: settings });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    localStorage.setItem('surveycad_settings', JSON.stringify(settings));
  }
}

export async function exportAllProjectsBackupJson(): Promise<{
  json: string;
  projectCount: number;
}> {
  const [projects, settings] = await Promise.all([
    loadAllProjectsFromDb(),
    loadAppSettings(),
  ]);
  return {
    json: serializeAllProjectsBackup(projects, settings),
    projectCount: projects.length,
  };
}

export async function importAllProjectsBackupJson(rawJson: string): Promise<{
  importedCount: number;
  restoredSettings: AppSettings | null;
}> {
  const { projects, settings } = parseAllProjectsBackup(rawJson);
  for (const proj of projects) {
    await saveProjectToDb(proj);
  }
  if (settings) {
    await saveAppSettings(settings);
  }
  return {
    importedCount: projects.length,
    restoredSettings: settings,
  };
}
