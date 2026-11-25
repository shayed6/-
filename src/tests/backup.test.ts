import { describe, expect, it } from 'vitest';
import {
  AppSettings,
  parseAllProjectsBackup,
  serializeAllProjectsBackup,
} from '../adapters/storage';
import { serializeProjectJson } from '../adapters/nativeJson';
import { createEmptyDocument } from '../core/cad/types';
import { createPolygonEntity } from '../core/cad/entities';
import { DEFAULT_UNIT_PROFILE } from '../core/survey/units';

describe('Offline Backup Serialization & Restore', () => {
  it('round-trips multiple projects and app settings in a full backup bundle', () => {
    const doc1 = createEmptyDocument('মৌজা ক — দাগ ১০১');
    doc1.entities.push(
      createPolygonEntity(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ]
      )
    );

    const doc2 = createEmptyDocument('মৌজা খ — দাগ ২০২');
    const settings: AppSettings = {
      language: 'bn',
      theme: 'dark',
      unitProfile: DEFAULT_UNIT_PROFILE,
      organizationName: 'ডিজিটাল সার্ভে অফিস',
      phoneNumber: '01700000000',
      advancedMode: true,
      scannerPixelsPerInch: 300,
      licenseCode: null,
    };

    const json = serializeAllProjectsBackup([doc1, doc2], settings);
    const parsed = parseAllProjectsBackup(json);

    expect(parsed.projects).toHaveLength(2);
    expect(parsed.projects[0].name).toBe('মৌজা ক — দাগ ১০১');
    expect(parsed.projects[0].entities).toHaveLength(1);
    expect(parsed.projects[1].name).toBe('মৌজা খ — দাগ ২০২');
    expect(parsed.settings?.organizationName).toBe('ডিজিটাল সার্ভে অফিস');
    expect(parsed.settings?.advancedMode).toBe(true);
  });

  it('gracefully imports a single-project JSON envelope into backup restore', () => {
    const single = createEmptyDocument('Single Plot Export');
    const raw = serializeProjectJson(single);
    const parsed = parseAllProjectsBackup(raw);

    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].name).toBe('Single Plot Export');
    expect(parsed.settings).toBeNull();
  });

  it('rejects invalid non-project JSON payloads', () => {
    expect(() => parseAllProjectsBackup('{"foo": "bar"}')).toThrow();
    expect(() => parseAllProjectsBackup('not-json')).toThrow();
  });
});
