export interface LicenseStatus {
  active: boolean;
  tier: 'community' | 'pro';
  code: string | null;
  holderHint?: string;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function computeChecksumSegment(seg1: string, seg2: string): string {
  const input = `SCAD:${seg1}:${seg2}:BD`;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  const unsigned = h1 >>> 0;
  let out = '';
  let v = unsigned;
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[v % ALPHABET.length];
    v = Math.floor(v / ALPHABET.length) + i * 7;
  }
  return out;
}

export function generateLicenseCode(seg1: string, seg2: string): string {
  const clean1 = seg1.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, 'X');
  const clean2 = seg2.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, 'X');
  const check = computeChecksumSegment(clean1, clean2);
  return `SCAD-${clean1}-${clean2}-${check}`;
}

export function validateLicenseCode(rawCode: string): LicenseStatus {
  const normalized = rawCode.trim().toUpperCase();
  const match = /^SCAD-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(normalized);
  if (!match) {
    return { active: false, tier: 'community', code: null };
  }
  const [, seg1, seg2, seg3] = match;
  const expected = computeChecksumSegment(seg1, seg2);
  if (seg3 !== expected) {
    return { active: false, tier: 'community', code: null };
  }
  return {
    active: true,
    tier: 'pro',
    code: normalized,
    holderHint: `${seg1}-${seg2}`,
  };
}
