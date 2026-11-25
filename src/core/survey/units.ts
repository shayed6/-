export type LinearUnit = 'ft' | 'm' | 'chain' | 'link' | 'hat' | 'gaj' | 'inch';
export type AreaUnit = 'sqft' | 'sqm' | 'shotok' | 'katha' | 'bigha' | 'acre';

export interface UnitProfile {
  id: string;
  nameBn: string;
  nameEn: string;
  kathaSqFt: number; // default: 720 sq ft
  bighaShotok: number; // default: 33 shotok (14374.8 sq ft)
}

export const SHOTOK_SQFT = 435.6;
export const ACRE_SHOTOK = 100;
export const ACRE_SQFT = SHOTOK_SQFT * ACRE_SHOTOK; // 43560
export const FT_PER_METER = 1 / 0.3048; // 3.280839895013123
export const SQFT_PER_SQM = FT_PER_METER * FT_PER_METER; // 10.763910416709722
export const CHAIN_FT = 66;
export const LINK_FT = 0.66;
export const HAT_FT = 1.5;
export const GAJ_FT = 3;
export const INCH_FT = 1 / 12;

export const DEFAULT_UNIT_PROFILE: UnitProfile = {
  id: 'bd-standard',
  nameBn: 'বাংলাদেশ আদর্শ (কাঠা = ৭২০ ব.ফু., বিঘা = ৩৩ শতক)',
  nameEn: 'Bangladesh Standard (Katha = 720 sq ft, Bigha = 33 shotok)',
  kathaSqFt: 720,
  bighaShotok: 33,
};

export const PRESET_UNIT_PROFILES: UnitProfile[] = [
  DEFAULT_UNIT_PROFILE,
  {
    id: 'dhaka-20katha',
    nameBn: '২০ কাঠায় ১ বিঘা (কাঠা = ৭২০ ব.ফু., বিঘা = ১৪,৪০০ ব.ফু.)',
    nameEn: '20 Katha Bigha (Katha = 720 sq ft, Bigha = 33.0579 shotok)',
    kathaSqFt: 720,
    bighaShotok: 14400 / SHOTOK_SQFT,
  },
  {
    id: 'local-165',
    nameBn: '১.৬৫ শতকে কাঠা (কাঠা = ৭১৮.৭৪ ব.ফু., বিঘা = ৩৩ শতক)',
    nameEn: '1.65 Shotok Katha (Katha = 718.74 sq ft, Bigha = 33 shotok)',
    kathaSqFt: 1.65 * SHOTOK_SQFT,
    bighaShotok: 33,
  },
];

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

export function toBengaliDigits(input: string | number): string {
  const str = String(input);
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      out += BENGALI_DIGITS[code - 48];
    } else {
      out += ch;
    }
  }
  return out;
}

export function fromBengaliDigits(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const idx = BENGALI_DIGITS.indexOf(ch as (typeof BENGALI_DIGITS)[number]);
    out += idx >= 0 ? String(idx) : ch;
  }
  return out;
}

export function parseLocalizedNumber(input: string): number {
  const normalized = fromBengaliDigits(input).trim().replace(/,/g, '');
  if (!normalized) return NaN;
  return Number(normalized);
}

export function formatNumber(
  value: number,
  decimals = 2,
  lang: 'bn' | 'en' = 'bn'
): string {
  if (!Number.isFinite(value)) return lang === 'bn' ? '০' : '0';
  const fixed = value.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
  return lang === 'bn' ? toBengaliDigits(trimmed) : trimmed;
}

export function linearUnitToFeetFactor(unit: LinearUnit): number {
  switch (unit) {
    case 'ft':
      return 1;
    case 'm':
      return FT_PER_METER;
    case 'chain':
      return CHAIN_FT;
    case 'link':
      return LINK_FT;
    case 'hat':
      return HAT_FT;
    case 'gaj':
      return GAJ_FT;
    case 'inch':
      return INCH_FT;
  }
}

export function toFeet(value: number, fromUnit: LinearUnit): number {
  return value * linearUnitToFeetFactor(fromUnit);
}

export function fromFeet(feet: number, toUnit: LinearUnit): number {
  return feet / linearUnitToFeetFactor(toUnit);
}

export function convertLinear(value: number, from: LinearUnit, to: LinearUnit): number {
  return fromFeet(toFeet(value, from), to);
}

export function bighaSqFt(profile: UnitProfile = DEFAULT_UNIT_PROFILE): number {
  return profile.bighaShotok * SHOTOK_SQFT;
}

export function areaUnitToSqFtFactor(
  unit: AreaUnit,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): number {
  switch (unit) {
    case 'sqft':
      return 1;
    case 'sqm':
      return SQFT_PER_SQM;
    case 'shotok':
      return SHOTOK_SQFT;
    case 'katha':
      return profile.kathaSqFt;
    case 'bigha':
      return bighaSqFt(profile);
    case 'acre':
      return ACRE_SQFT;
  }
}

export function toSqFt(
  value: number,
  fromUnit: AreaUnit,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): number {
  return value * areaUnitToSqFtFactor(fromUnit, profile);
}

export function fromSqFt(
  sqFt: number,
  toUnit: AreaUnit,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): number {
  return sqFt / areaUnitToSqFtFactor(toUnit, profile);
}

export function convertArea(
  value: number,
  from: AreaUnit,
  to: AreaUnit,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): number {
  return fromSqFt(toSqFt(value, from, profile), to, profile);
}

export function getLinearUnitLabel(unit: LinearUnit, lang: 'bn' | 'en'): string {
  const labels: Record<LinearUnit, { bn: string; en: string }> = {
    ft: { bn: 'ফুট', en: 'ft' },
    m: { bn: 'মিটার', en: 'm' },
    chain: { bn: 'চেইন', en: 'chain' },
    link: { bn: 'লিঙ্ক', en: 'link' },
    hat: { bn: 'হাত', en: 'hat' },
    gaj: { bn: 'গজ', en: 'gaj' },
    inch: { bn: 'ইঞ্চি', en: 'in' },
  };
  return labels[unit][lang];
}

export function getAreaUnitLabel(unit: AreaUnit, lang: 'bn' | 'en'): string {
  const labels: Record<AreaUnit, { bn: string; en: string }> = {
    sqft: { bn: 'বর্গফুট', en: 'sq ft' },
    sqm: { bn: 'বর্গমিটার', en: 'sq m' },
    shotok: { bn: 'শতক', en: 'shotok' },
    katha: { bn: 'কাঠা', en: 'katha' },
    bigha: { bn: 'বিঘা', en: 'bigha' },
    acre: { bn: 'একর', en: 'acre' },
  };
  return labels[unit][lang];
}
