import { CalculatorTableRow } from '../cad/types';
import {
  AreaBreakdown,
  buildQuadFromSidesAndDiagonal,
  computeAreaBreakdown,
  heronAreaSqFt,
  polygonAreaSqFt,
  polygonPerimeterFt,
  solveTriangleThirdPoint,
} from './area';
import { Point2D, distance2D } from './coordinates';
import {
  ACRE_SQFT,
  CHAIN_FT,
  DEFAULT_UNIT_PROFILE,
  FT_PER_METER,
  GAJ_FT,
  HAT_FT,
  INCH_FT,
  LINK_FT,
  SHOTOK_SQFT,
  SQFT_PER_SQM,
  UnitProfile,
  bighaSqFt,
  parseLocalizedNumber,
} from './units';

/* -------------------------------------------------------------------------- */
/*  Traditional Bengali Land Share Constants (আনা–গণ্ডা–কড়া–ক্রান্তি–তিল)      */
/* -------------------------------------------------------------------------- */

export const ANA_PER_WHOLE = 16;
export const GANDA_PER_ANA = 20;
export const KORA_PER_GANDA = 4;
export const KRANTI_PER_KORA = 3;
export const TIL_PER_KRANTI = 20;

export const GANDA_PER_WHOLE = ANA_PER_WHOLE * GANDA_PER_ANA; // 320
export const KORA_PER_WHOLE = GANDA_PER_WHOLE * KORA_PER_GANDA; // 1,280
export const KRANTI_PER_WHOLE = KORA_PER_WHOLE * KRANTI_PER_KORA; // 3,840
export const TIL_PER_WHOLE = KRANTI_PER_WHOLE * TIL_PER_KRANTI; // 76,800

export type CalculatorLinearUnit = 'ft' | 'm' | 'chain' | 'link' | 'hat' | 'gaj' | 'inch';
export type CalculatorAreaUnit =
  | 'shotok'
  | 'decimal'
  | 'katha'
  | 'bigha'
  | 'acre'
  | 'sqft'
  | 'sqm';
export type TraditionalShareUnit = 'ana' | 'ganda' | 'kora' | 'kranti' | 'til';

export interface AnaGandaParts {
  ana: number;
  ganda: number;
  kora: number;
  kranti: number;
  til: number;
}

export interface GeometryAreaResult {
  valid: boolean;
  errorBn?: string;
  errorEn?: string;
  areaSqFt: number;
  perimeterFt: number;
  breakdown: AreaBreakdown;
  points: Point2D[];
}

function linearFactorFt(unit: CalculatorLinearUnit): number {
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

export function calcToFeet(value: number, unit: CalculatorLinearUnit): number {
  return value * linearFactorFt(unit);
}

export function calcFromFeet(feet: number, unit: CalculatorLinearUnit): number {
  return feet / linearFactorFt(unit);
}

export function calcAreaToSqFt(
  value: number,
  unit: CalculatorAreaUnit,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): number {
  switch (unit) {
    case 'sqft':
      return value;
    case 'sqm':
      return value * SQFT_PER_SQM;
    case 'shotok':
    case 'decimal':
      return value * SHOTOK_SQFT;
    case 'katha':
      return value * profile.kathaSqFt;
    case 'bigha':
      return value * bighaSqFt(profile);
    case 'acre':
      return value * ACRE_SQFT;
  }
}

export function calcAreaFromSqFt(
  sqFt: number,
  unit: CalculatorAreaUnit,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): number {
  switch (unit) {
    case 'sqft':
      return sqFt;
    case 'sqm':
      return sqFt / SQFT_PER_SQM;
    case 'shotok':
    case 'decimal':
      return sqFt / SHOTOK_SQFT;
    case 'katha':
      return sqFt / profile.kathaSqFt;
    case 'bigha':
      return sqFt / bighaSqFt(profile);
    case 'acre':
      return sqFt / ACRE_SQFT;
  }
}

/* -------------------------------------------------------------------------- */
/*  Tool 1: Area from Sides (Triangle, Quad+Diag, Quad+Angle, Rect, Trapezium)*/
/* -------------------------------------------------------------------------- */

export function calcTriangleFromSides(
  aInput: number,
  bInput: number,
  cInput: number,
  unit: CalculatorLinearUnit = 'ft',
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): GeometryAreaResult {
  const a = calcToFeet(aInput, unit);
  const b = calcToFeet(bInput, unit);
  const c = calcToFeet(cInput, unit);
  const areaSqFt = heronAreaSqFt(a, b, c);
  if (areaSqFt === null) {
    return {
      valid: false,
      errorBn: 'বাহু তিনটি দিয়ে বৈধ ত্রিভুজ গঠিত হয় না (যেকোনো দুই বাহুর যোগফল তৃতীয় বাহুর চেয়ে বড় হতে হবে)।',
      errorEn: 'Invalid triangle: sum of any two sides must exceed the third side.',
      areaSqFt: 0,
      perimeterFt: 0,
      breakdown: computeAreaBreakdown(0, profile),
      points: [],
    };
  }
  const pA: Point2D = { x: 0, y: 0 };
  const pB: Point2D = { x: a, y: 0 };
  const pC = solveTriangleThirdPoint(pA, pB, c, b, 'left');
  const points = pC ? [pA, pB, pC] : [];
  const perimeterFt = a + b + c;
  return {
    valid: true,
    areaSqFt,
    perimeterFt,
    breakdown: computeAreaBreakdown(areaSqFt, profile),
    points,
  };
}

export function calcRectangleFromSides(
  lengthInput: number,
  widthInput: number,
  unit: CalculatorLinearUnit = 'ft',
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): GeometryAreaResult {
  const l = calcToFeet(lengthInput, unit);
  const w = calcToFeet(widthInput, unit);
  if (!Number.isFinite(l) || !Number.isFinite(w) || l <= 0 || w <= 0) {
    return {
      valid: false,
      errorBn: 'দৈর্ঘ্য ও প্রস্থ শূন্যের চেয়ে বড় হতে হবে।',
      errorEn: 'Length and width must be positive numbers.',
      areaSqFt: 0,
      perimeterFt: 0,
      breakdown: computeAreaBreakdown(0, profile),
      points: [],
    };
  }
  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: l, y: 0 },
    { x: l, y: w },
    { x: 0, y: w },
  ];
  const areaSqFt = l * w;
  const perimeterFt = 2 * (l + w);
  return {
    valid: true,
    areaSqFt,
    perimeterFt,
    breakdown: computeAreaBreakdown(areaSqFt, profile),
    points,
  };
}

export function calcQuadFromSidesAndDiagonal(
  abInput: number,
  bcInput: number,
  cdInput: number,
  daInput: number,
  diagACInput: number,
  unit: CalculatorLinearUnit = 'ft',
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): GeometryAreaResult {
  const ab = calcToFeet(abInput, unit);
  const bc = calcToFeet(bcInput, unit);
  const cd = calcToFeet(cdInput, unit);
  const da = calcToFeet(daInput, unit);
  const diagAC = calcToFeet(diagACInput, unit);

  const pts = buildQuadFromSidesAndDiagonal(ab, bc, cd, da, diagAC);
  if (!pts) {
    return {
      valid: false,
      errorBn: 'প্রদত্ত ৪ বাহু ও কর্ণ দিয়ে বৈধ চতুর্ভুজ গঠিত হয়নি। কর্ণের মাপ দুই ত্রিভুজের বাহুর সাথে মেলে না।',
      errorEn: 'Invalid quadrilateral: diagonal does not close both triangles.',
      areaSqFt: 0,
      perimeterFt: 0,
      breakdown: computeAreaBreakdown(0, profile),
      points: [],
    };
  }
  const area1 = heronAreaSqFt(ab, bc, diagAC) ?? 0;
  const area2 = heronAreaSqFt(cd, da, diagAC) ?? 0;
  const areaSqFt = area1 + area2;
  const perimeterFt = ab + bc + cd + da;
  return {
    valid: true,
    areaSqFt,
    perimeterFt,
    breakdown: computeAreaBreakdown(areaSqFt, profile),
    points: pts,
  };
}

export function calcQuadFromSidesAndAngle(
  abInput: number,
  bcInput: number,
  cdInput: number,
  daInput: number,
  angleDegA: number,
  unit: CalculatorLinearUnit = 'ft',
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): GeometryAreaResult {
  const ab = calcToFeet(abInput, unit);
  const bc = calcToFeet(bcInput, unit);
  const cd = calcToFeet(cdInput, unit);
  const da = calcToFeet(daInput, unit);

  if (
    !Number.isFinite(ab) ||
    !Number.isFinite(bc) ||
    !Number.isFinite(cd) ||
    !Number.isFinite(da) ||
    ab <= 0 ||
    bc <= 0 ||
    cd <= 0 ||
    da <= 0 ||
    !Number.isFinite(angleDegA) ||
    angleDegA <= 1 ||
    angleDegA >= 179
  ) {
    return {
      valid: false,
      errorBn: '৪টি বাহু ধনাত্মক এবং কোণ ১° থেকে ১৭৯°-এর মধ্যে হতে হবে।',
      errorEn: 'All 4 sides must be positive and the included angle between 1° and 179°.',
      areaSqFt: 0,
      perimeterFt: 0,
      breakdown: computeAreaBreakdown(0, profile),
      points: [],
    };
  }

  const rad = (angleDegA * Math.PI) / 180;
  const pA: Point2D = { x: 0, y: 0 };
  const pB: Point2D = { x: ab, y: 0 };
  const pD: Point2D = { x: da * Math.cos(rad), y: da * Math.sin(rad) };
  const diagBD = distance2D(pB, pD);

  // Place C on the opposite side ('right' of vector B -> D since A is on 'left' of B -> D)
  const pC = solveTriangleThirdPoint(pB, pD, bc, cd, 'right');
  if (!pC) {
    return {
      valid: false,
      errorBn: 'প্রদত্ত কোণ ও বিপরীত দুই বাহু (BC, CD) দিয়ে চতুর্ভুজটি সম্পূর্ণ হয়নি।',
      errorEn: 'Opposite sides BC and CD cannot close across the solved diagonal.',
      areaSqFt: 0,
      perimeterFt: 0,
      breakdown: computeAreaBreakdown(0, profile),
      points: [],
    };
  }

  const points = [pA, pB, pC, pD];
  const areaSqFt =
    (heronAreaSqFt(ab, da, diagBD) ?? 0) + (heronAreaSqFt(bc, cd, diagBD) ?? 0);
  const perimeterFt = polygonPerimeterFt(points, true);

  return {
    valid: true,
    areaSqFt: areaSqFt > 0 ? areaSqFt : polygonAreaSqFt(points),
    perimeterFt,
    breakdown: computeAreaBreakdown(areaSqFt, profile),
    points,
  };
}

export function calcTrapeziumArea(
  parallelAInput: number,
  parallelBInput: number,
  heightInput: number,
  unit: CalculatorLinearUnit = 'ft',
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): GeometryAreaResult {
  const a = calcToFeet(parallelAInput, unit);
  const b = calcToFeet(parallelBInput, unit);
  const h = calcToFeet(heightInput, unit);
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(h) ||
    a <= 0 ||
    b <= 0 ||
    h <= 0
  ) {
    return {
      valid: false,
      errorBn: 'সমান্তরাল দুই বাহু ও লম্ব উচ্চতা শূন্যের চেয়ে বড় হতে হবে।',
      errorEn: 'Both parallel sides and height must be positive.',
      areaSqFt: 0,
      perimeterFt: 0,
      breakdown: computeAreaBreakdown(0, profile),
      points: [],
    };
  }
  const dx = (a - b) / 2;
  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: a, y: 0 },
    { x: a - dx, y: h },
    { x: dx, y: h },
  ];
  const areaSqFt = ((a + b) / 2) * h;
  const perimeterFt = polygonPerimeterFt(points, true);
  return {
    valid: true,
    areaSqFt,
    perimeterFt,
    breakdown: computeAreaBreakdown(areaSqFt, profile),
    points,
  };
}

/* -------------------------------------------------------------------------- */
/*  Tool 2: All-in-One Unit Converter (Area + Length + Traditional Share)     */
/* -------------------------------------------------------------------------- */

export interface AllAreaConversionResult {
  sqFt: number;
  sqM: number;
  shotok: number;
  decimal: number;
  katha: number;
  bigha: number;
  acre: number;
}

export function convertAllAreaUnits(
  value: number,
  fromUnit: CalculatorAreaUnit,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): AllAreaConversionResult {
  const sqFt = Math.max(0, calcAreaToSqFt(value, fromUnit, profile));
  return {
    sqFt,
    sqM: calcAreaFromSqFt(sqFt, 'sqm', profile),
    shotok: calcAreaFromSqFt(sqFt, 'shotok', profile),
    decimal: calcAreaFromSqFt(sqFt, 'decimal', profile),
    katha: calcAreaFromSqFt(sqFt, 'katha', profile),
    bigha: calcAreaFromSqFt(sqFt, 'bigha', profile),
    acre: calcAreaFromSqFt(sqFt, 'acre', profile),
  };
}

export interface AllLengthConversionResult {
  ft: number;
  m: number;
  chain: number;
  link: number;
  hat: number;
  gaj: number;
  inch: number;
}

export function convertAllLengthUnits(
  value: number,
  fromUnit: CalculatorLinearUnit
): AllLengthConversionResult {
  const ft = Math.max(0, calcToFeet(value, fromUnit));
  return {
    ft,
    m: calcFromFeet(ft, 'm'),
    chain: calcFromFeet(ft, 'chain'),
    link: calcFromFeet(ft, 'link'),
    hat: calcFromFeet(ft, 'hat'),
    gaj: calcFromFeet(ft, 'gaj'),
    inch: calcFromFeet(ft, 'inch'),
  };
}

export interface TraditionalShareConversionResult {
  fraction: number;
  percent: number;
  ana: number;
  ganda: number;
  kora: number;
  kranti: number;
  til: number;
  normalizedParts: AnaGandaParts;
  areaBreakdown: AllAreaConversionResult | null;
}

export function traditionalShareUnitToFraction(
  value: number,
  unit: TraditionalShareUnit
): number {
  switch (unit) {
    case 'ana':
      return value / ANA_PER_WHOLE;
    case 'ganda':
      return value / GANDA_PER_WHOLE;
    case 'kora':
      return value / KORA_PER_WHOLE;
    case 'kranti':
      return value / KRANTI_PER_WHOLE;
    case 'til':
      return value / TIL_PER_WHOLE;
  }
}

export function convertTraditionalShareUnit(
  value: number,
  fromUnit: TraditionalShareUnit,
  basePlotSqFt = 0,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): TraditionalShareConversionResult {
  const safe = Number.isFinite(value) && value >= 0 ? value : 0;
  const fraction = traditionalShareUnitToFraction(safe, fromUnit);
  const clamped = Math.min(1, fraction);
  const normalizedParts = fractionToAnaGanda(clamped).parts;
  return {
    fraction,
    percent: fraction * 100,
    ana: fraction * ANA_PER_WHOLE,
    ganda: fraction * GANDA_PER_WHOLE,
    kora: fraction * KORA_PER_WHOLE,
    kranti: fraction * KRANTI_PER_WHOLE,
    til: fraction * TIL_PER_WHOLE,
    normalizedParts,
    areaBreakdown:
      basePlotSqFt > 0
        ? convertAllAreaUnits(basePlotSqFt * fraction, 'sqft', profile)
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Tool 3: Ana-Ganda-Kora-Kranti-Til <-> Fraction Converter                  */
/* -------------------------------------------------------------------------- */

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export interface AnaGandaToFractionResult {
  valid: boolean;
  errorBn?: string;
  errorEn?: string;
  totalTil: number;
  fraction: number;
  percent: number;
  simplifiedFraction: string;
}

export function anaGandaToFraction(
  parts: Partial<AnaGandaParts>
): AnaGandaToFractionResult {
  const ana = Number(parts.ana ?? 0);
  const ganda = Number(parts.ganda ?? 0);
  const kora = Number(parts.kora ?? 0);
  const kranti = Number(parts.kranti ?? 0);
  const til = Number(parts.til ?? 0);

  if (
    !Number.isFinite(ana) ||
    !Number.isFinite(ganda) ||
    !Number.isFinite(kora) ||
    !Number.isFinite(kranti) ||
    !Number.isFinite(til) ||
    ana < 0 ||
    ganda < 0 ||
    kora < 0 ||
    kranti < 0 ||
    til < 0
  ) {
    return {
      valid: false,
      errorBn: 'আনা, গণ্ডা, কড়া, ক্রান্তি বা তিল ঋণাত্মক হতে পারবে না।',
      errorEn: 'Ana, ganda, kora, kranti and til must be non-negative.',
      totalTil: 0,
      fraction: 0,
      percent: 0,
      simplifiedFraction: '0/1',
    };
  }

  const totalTil =
    ana * (GANDA_PER_ANA * KORA_PER_GANDA * KRANTI_PER_KORA * TIL_PER_KRANTI) +
    ganda * (KORA_PER_GANDA * KRANTI_PER_KORA * TIL_PER_KRANTI) +
    kora * (KRANTI_PER_KORA * TIL_PER_KRANTI) +
    kranti * TIL_PER_KRANTI +
    til;

  const fraction = totalTil / TIL_PER_WHOLE;
  const roundedTil = Math.round(totalTil);
  let simplifiedFraction = '0/1';
  if (Math.abs(totalTil - roundedTil) < 1e-9 && roundedTil > 0) {
    const d = gcd(roundedTil, TIL_PER_WHOLE);
    simplifiedFraction = `${roundedTil / d}/${TIL_PER_WHOLE / d}`;
  } else if (fraction > 0) {
    simplifiedFraction = fraction.toFixed(6).replace(/\.?0+$/, '');
  }

  return {
    valid: true,
    totalTil,
    fraction,
    percent: fraction * 100,
    simplifiedFraction,
  };
}

export interface FractionToAnaGandaResult {
  parts: AnaGandaParts;
  exactTil: number;
  roundedTil: number;
  reconstructedFraction: number;
  residualTil: number;
}

export function fractionToAnaGanda(fractionInput: number): FractionToAnaGandaResult {
  const safe = Number.isFinite(fractionInput) ? Math.max(0, fractionInput) : 0;
  const exactTil = safe * TIL_PER_WHOLE;
  const roundedTil = Math.round(exactTil);
  let rem = roundedTil;

  const anaFactor = GANDA_PER_ANA * KORA_PER_GANDA * KRANTI_PER_KORA * TIL_PER_KRANTI; // 4800
  const gandaFactor = KORA_PER_GANDA * KRANTI_PER_KORA * TIL_PER_KRANTI; // 240
  const koraFactor = KRANTI_PER_KORA * TIL_PER_KRANTI; // 60

  const ana = Math.floor(rem / anaFactor);
  rem -= ana * anaFactor;
  const ganda = Math.floor(rem / gandaFactor);
  rem -= ganda * gandaFactor;
  const kora = Math.floor(rem / koraFactor);
  rem -= kora * koraFactor;
  const kranti = Math.floor(rem / TIL_PER_KRANTI);
  rem -= kranti * TIL_PER_KRANTI;
  const til = rem;

  return {
    parts: { ana, ganda, kora, kranti, til },
    exactTil,
    roundedTil,
    reconstructedFraction: roundedTil / TIL_PER_WHOLE,
    residualTil: exactTil - roundedTil,
  };
}

export function formatAnaGandaText(
  parts: AnaGandaParts,
  lang: 'bn' | 'en' = 'bn'
): string {
  const segs: string[] = [];
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const numStr = (n: number) => {
    const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
    if (lang !== 'bn') return s;
    return s.replace(/[0-9]/g, (d) => bnDigits[Number(d)]);
  };

  if (parts.ana > 0) segs.push(`${numStr(parts.ana)} ${lang === 'bn' ? 'আনা' : 'ana'}`);
  if (parts.ganda > 0)
    segs.push(`${numStr(parts.ganda)} ${lang === 'bn' ? 'গণ্ডা' : 'ganda'}`);
  if (parts.kora > 0) segs.push(`${numStr(parts.kora)} ${lang === 'bn' ? 'কড়া' : 'kora'}`);
  if (parts.kranti > 0)
    segs.push(`${numStr(parts.kranti)} ${lang === 'bn' ? 'ক্রান্তি' : 'kranti'}`);
  if (parts.til > 0 || segs.length === 0)
    segs.push(`${numStr(parts.til)} ${lang === 'bn' ? 'তিল' : 'til'}`);
  return segs.join(' ');
}

/**
 * Parses fraction/decimal/percentage strings with English or Bengali numerals:
 * e.g. "1/4", "১/৮", "25%", "0.125" -> numeric fraction (0.25, 0.125, etc.)
 */
export function parseShareExpression(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.endsWith('%')) {
    const val = parseLocalizedNumber(trimmed.slice(0, -1));
    return Number.isFinite(val) && val >= 0 ? val / 100 : null;
  }

  if (trimmed.includes('/')) {
    const [numStr, denStr, ...rest] = trimmed.split('/');
    if (rest.length > 0) return null;
    const num = parseLocalizedNumber(numStr);
    const den = parseLocalizedNumber(denStr);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num < 0) {
      return null;
    }
    return num / den;
  }

  const val = parseLocalizedNumber(trimmed);
  return Number.isFinite(val) && val >= 0 ? val : null;
}

/* -------------------------------------------------------------------------- */
/*  Tool 4: Ratio Split                                                       */
/* -------------------------------------------------------------------------- */

export interface RatioSplitItem {
  label: string;
  ratio: number;
  fraction: number;
  percent: number;
  areaSqFt: number;
  breakdown: AreaBreakdown;
  anaGanda: AnaGandaParts;
}

export interface RatioSplitResult {
  valid: boolean;
  errorBn?: string;
  errorEn?: string;
  totalRatio: number;
  totalAreaSqFt: number;
  items: RatioSplitItem[];
}

export function computeRatioSplit(
  totalAreaSqFt: number,
  entries: Array<{ label: string; ratio: number }>,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): RatioSplitResult {
  if (!Number.isFinite(totalAreaSqFt) || totalAreaSqFt <= 0) {
    return {
      valid: false,
      errorBn: 'মোট জমির পরিমাণ শূন্যের চেয়ে বড় হতে হবে।',
      errorEn: 'Total area must be greater than zero.',
      totalRatio: 0,
      totalAreaSqFt: 0,
      items: [],
    };
  }
  const clean = entries.filter((e) => Number.isFinite(e.ratio) && e.ratio > 0);
  const totalRatio = clean.reduce((acc, e) => acc + e.ratio, 0);
  if (clean.length === 0 || totalRatio <= 0) {
    return {
      valid: false,
      errorBn: 'অন্তত একটি সঠিক অনুপাত (শূন্যের বেশি) দিন।',
      errorEn: 'Enter at least one positive ratio.',
      totalRatio: 0,
      totalAreaSqFt,
      items: [],
    };
  }
  const items: RatioSplitItem[] = clean.map((e, idx) => {
    const fraction = e.ratio / totalRatio;
    const areaSqFt = totalAreaSqFt * fraction;
    return {
      label: e.label.trim() || `#${idx + 1}`,
      ratio: e.ratio,
      fraction,
      percent: fraction * 100,
      areaSqFt,
      breakdown: computeAreaBreakdown(areaSqFt, profile),
      anaGanda: fractionToAnaGanda(fraction).parts,
    };
  });
  return {
    valid: true,
    totalRatio,
    totalAreaSqFt,
    items,
  };
}

/* -------------------------------------------------------------------------- */
/*  Tool 5: "My Share in the Dag" (দাগে আমার অংশ)                             */
/* -------------------------------------------------------------------------- */

export interface MyShareInDagResult {
  valid: boolean;
  errorBn?: string;
  errorEn?: string;
  totalDagSqFt: number;
  shareFraction: number;
  sharePercent: number;
  anaGanda: AnaGandaParts;
  myAreaSqFt: number;
  myBreakdown: AreaBreakdown;
  remainingSqFt: number;
  remainingBreakdown: AreaBreakdown;
}

export function computeMyShareInDag(
  totalDagSqFt: number,
  shareFraction: number,
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): MyShareInDagResult {
  if (!Number.isFinite(totalDagSqFt) || totalDagSqFt <= 0) {
    return {
      valid: false,
      errorBn: 'মোট দাগের জমি শূন্যের চেয়ে বড় হতে হবে।',
      errorEn: 'Total dag area must be positive.',
      totalDagSqFt: 0,
      shareFraction: 0,
      sharePercent: 0,
      anaGanda: { ana: 0, ganda: 0, kora: 0, kranti: 0, til: 0 },
      myAreaSqFt: 0,
      myBreakdown: computeAreaBreakdown(0, profile),
      remainingSqFt: 0,
      remainingBreakdown: computeAreaBreakdown(0, profile),
    };
  }
  if (!Number.isFinite(shareFraction) || shareFraction < 0 || shareFraction > 1 + 1e-9) {
    return {
      valid: false,
      errorBn: 'অংশের মান ০ থেকে ১ (বা ১৬ আনা / ১০০%)-এর মধ্যে হতে হবে।',
      errorEn: 'Share must be between 0 and 1 (or 16 ana / 100%).',
      totalDagSqFt,
      shareFraction: 0,
      sharePercent: 0,
      anaGanda: { ana: 0, ganda: 0, kora: 0, kranti: 0, til: 0 },
      myAreaSqFt: 0,
      myBreakdown: computeAreaBreakdown(0, profile),
      remainingSqFt: totalDagSqFt,
      remainingBreakdown: computeAreaBreakdown(totalDagSqFt, profile),
    };
  }

  const clampedFrac = Math.min(1, shareFraction);
  const myAreaSqFt = totalDagSqFt * clampedFrac;
  const remainingSqFt = Math.max(0, totalDagSqFt - myAreaSqFt);

  return {
    valid: true,
    totalDagSqFt,
    shareFraction: clampedFrac,
    sharePercent: clampedFrac * 100,
    anaGanda: fractionToAnaGanda(clampedFrac).parts,
    myAreaSqFt,
    myBreakdown: computeAreaBreakdown(myAreaSqFt, profile),
    remainingSqFt,
    remainingBreakdown: computeAreaBreakdown(remainingSqFt, profile),
  };
}

/* -------------------------------------------------------------------------- */
/*  Tool 6: Hissa Calculator (হিস্যা ও মোট অংশ যাচাই)                        */
/* -------------------------------------------------------------------------- */

export interface HissaEntryInput {
  label: string;
  mode: 'fraction' | 'ana-ganda' | 'percent';
  fractionText?: string;
  percentText?: string;
  anaGanda?: Partial<AnaGandaParts>;
}

export interface HissaItemResult {
  label: string;
  fraction: number;
  percent: number;
  anaGanda: AnaGandaParts;
  areaSqFt: number;
  breakdown: AreaBreakdown;
}

export interface HissaDistributionResult {
  valid: boolean;
  errorBn?: string;
  errorEn?: string;
  totalDagSqFt: number;
  items: HissaItemResult[];
  sumFraction: number;
  sumPercent: number;
  sumAnaGanda: AnaGandaParts;
  sumAreaSqFt: number;
  sumBreakdown: AreaBreakdown;
  remainingFraction: number;
  remainingAreaSqFt: number;
  remainingBreakdown: AreaBreakdown;
  status: 'exact' | 'under' | 'over';
}

export function computeHissaDistribution(
  totalDagSqFt: number,
  entries: HissaEntryInput[],
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): HissaDistributionResult {
  if (!Number.isFinite(totalDagSqFt) || totalDagSqFt <= 0) {
    return {
      valid: false,
      errorBn: 'মোট দাগের পরিমাণ শূন্যের চেয়ে বড় হতে হবে।',
      errorEn: 'Total dag area must be positive.',
      totalDagSqFt: 0,
      items: [],
      sumFraction: 0,
      sumPercent: 0,
      sumAnaGanda: { ana: 0, ganda: 0, kora: 0, kranti: 0, til: 0 },
      sumAreaSqFt: 0,
      sumBreakdown: computeAreaBreakdown(0, profile),
      remainingFraction: 0,
      remainingAreaSqFt: 0,
      remainingBreakdown: computeAreaBreakdown(0, profile),
      status: 'under',
    };
  }

  const items: HissaItemResult[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    let fraction = 0;
    if (entry.mode === 'ana-ganda') {
      const conv = anaGandaToFraction(entry.anaGanda || {});
      if (!conv.valid) {
        return {
          valid: false,
          errorBn: conv.errorBn,
          errorEn: conv.errorEn,
          totalDagSqFt,
          items: [],
          sumFraction: 0,
          sumPercent: 0,
          sumAnaGanda: { ana: 0, ganda: 0, kora: 0, kranti: 0, til: 0 },
          sumAreaSqFt: 0,
          sumBreakdown: computeAreaBreakdown(0, profile),
          remainingFraction: 0,
          remainingAreaSqFt: 0,
          remainingBreakdown: computeAreaBreakdown(0, profile),
          status: 'under',
        };
      }
      fraction = conv.fraction;
    } else if (entry.mode === 'percent') {
      const pct = parseLocalizedNumber(entry.percentText || '0');
      fraction = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 0;
    } else {
      const parsed = parseShareExpression(entry.fractionText || '0');
      if (parsed === null) {
        return {
          valid: false,
          errorBn: `"${entry.label || `#${i + 1}`}" এর অংশ সঠিক ফরম্যাটে নেই (যেমন ১/৪ বা ০.২৫ লিখুন)।`,
          errorEn: `Invalid share format for "${entry.label || `#${i + 1}`}".`,
          totalDagSqFt,
          items: [],
          sumFraction: 0,
          sumPercent: 0,
          sumAnaGanda: { ana: 0, ganda: 0, kora: 0, kranti: 0, til: 0 },
          sumAreaSqFt: 0,
          sumBreakdown: computeAreaBreakdown(0, profile),
          remainingFraction: 0,
          remainingAreaSqFt: 0,
          remainingBreakdown: computeAreaBreakdown(0, profile),
          status: 'under',
        };
      }
      fraction = parsed;
    }

    const areaSqFt = totalDagSqFt * fraction;
    items.push({
      label: entry.label.trim() || `#${i + 1}`,
      fraction,
      percent: fraction * 100,
      anaGanda: fractionToAnaGanda(fraction).parts,
      areaSqFt,
      breakdown: computeAreaBreakdown(areaSqFt, profile),
    });
  }

  const sumFraction = items.reduce((acc, it) => acc + it.fraction, 0);
  const sumAreaSqFt = totalDagSqFt * sumFraction;
  const remainingFraction = 1 - sumFraction;
  const remainingAreaSqFt = totalDagSqFt * remainingFraction;
  const status: 'exact' | 'under' | 'over' =
    Math.abs(remainingFraction) <= 1e-5
      ? 'exact'
      : remainingFraction > 0
      ? 'under'
      : 'over';

  return {
    valid: true,
    totalDagSqFt,
    items,
    sumFraction,
    sumPercent: sumFraction * 100,
    sumAnaGanda: fractionToAnaGanda(sumFraction).parts,
    sumAreaSqFt,
    sumBreakdown: computeAreaBreakdown(sumAreaSqFt, profile),
    remainingFraction,
    remainingAreaSqFt,
    remainingBreakdown: computeAreaBreakdown(Math.abs(remainingAreaSqFt), profile),
    status,
  };
}

/* -------------------------------------------------------------------------- */
/*  Tool 7: Tofsil Distribution & CSV Export (তফসিল বণ্টন)                     */
/* -------------------------------------------------------------------------- */

export interface TofsilPersonInput {
  name: string;
  mode: 'fraction' | 'ana-ganda' | 'ratio' | 'percent';
  valueText?: string;
  anaGanda?: Partial<AnaGandaParts>;
}

export interface TofsilDistributionResult {
  valid: boolean;
  errorBn?: string;
  errorEn?: string;
  dagNo: string;
  khatianNo: string;
  totalAreaSqFt: number;
  totalBreakdown: AreaBreakdown;
  rows: CalculatorTableRow[];
  allocatedSqFt: number;
  remainingSqFt: number;
  status: 'exact' | 'under' | 'over';
}

export function computeTofsilDistribution(
  totalAreaSqFt: number,
  dagNo: string,
  khatianNo: string,
  people: TofsilPersonInput[],
  lang: 'bn' | 'en' = 'bn',
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): TofsilDistributionResult {
  if (!Number.isFinite(totalAreaSqFt) || totalAreaSqFt <= 0) {
    return {
      valid: false,
      errorBn: 'তফসিলের মোট জমি শূন্যের চেয়ে বড় হতে হবে।',
      errorEn: 'Total Tofsil area must be positive.',
      dagNo,
      khatianNo,
      totalAreaSqFt: 0,
      totalBreakdown: computeAreaBreakdown(0, profile),
      rows: [],
      allocatedSqFt: 0,
      remainingSqFt: 0,
      status: 'under',
    };
  }

  if (people.length === 0) {
    return {
      valid: false,
      errorBn: 'অন্তত একজন শরিক/প্রাপকের নাম দিন।',
      errorEn: 'Add at least one person.',
      dagNo,
      khatianNo,
      totalAreaSqFt,
      totalBreakdown: computeAreaBreakdown(totalAreaSqFt, profile),
      rows: [],
      allocatedSqFt: 0,
      remainingSqFt: totalAreaSqFt,
      status: 'under',
    };
  }

  const allRatios = people.every((p) => p.mode === 'ratio');
  const ratioSum = allRatios
    ? people.reduce(
        (acc, p) => acc + Math.max(0, parseLocalizedNumber(p.valueText || '0') || 0),
        0
      )
    : 0;

  if (allRatios && ratioSum <= 0) {
    return {
      valid: false,
      errorBn: 'অনুপাতের মান শূন্যের বেশি দিন।',
      errorEn: 'Enter positive ratio weights.',
      dagNo,
      khatianNo,
      totalAreaSqFt,
      totalBreakdown: computeAreaBreakdown(totalAreaSqFt, profile),
      rows: [],
      allocatedSqFt: 0,
      remainingSqFt: totalAreaSqFt,
      status: 'under',
    };
  }

  const rows: CalculatorTableRow[] = [];
  let sumFrac = 0;

  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    let frac = 0;
    let shareText = '';

    if (p.mode === 'ratio') {
      const r = Math.max(0, parseLocalizedNumber(p.valueText || '0') || 0);
      const denom = allRatios ? ratioSum : Math.max(1, ratioSum || 1);
      frac = r / denom;
      shareText = `${r} (${(frac * 100).toFixed(2)}%)`;
    } else if (p.mode === 'ana-ganda') {
      const conv = anaGandaToFraction(p.anaGanda || {});
      frac = conv.valid ? conv.fraction : 0;
      shareText = formatAnaGandaText(fractionToAnaGanda(frac).parts, lang);
    } else if (p.mode === 'percent') {
      const pct = parseLocalizedNumber(p.valueText || '0');
      frac = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 0;
      shareText = `${(frac * 100).toFixed(2)}%`;
    } else {
      const parsed = parseShareExpression(p.valueText || '0');
      frac = parsed ?? 0;
      shareText = `${p.valueText?.trim() || '0'} (${formatAnaGandaText(
        fractionToAnaGanda(frac).parts,
        lang
      )})`;
    }

    sumFrac += frac;
    const sqFt = totalAreaSqFt * frac;
    const b = computeAreaBreakdown(sqFt, profile);
    rows.push({
      label: p.name.trim() || (lang === 'bn' ? `ব্যক্তি ${i + 1}` : `Person ${i + 1}`),
      shareText,
      sqFt: b.sqFt,
      shotok: b.shotok,
      katha: b.katha,
      bigha: b.bigha,
      acre: b.acre,
      sqM: b.sqM,
    });
  }

  const allocatedSqFt = totalAreaSqFt * sumFrac;
  const remainingSqFt = totalAreaSqFt - allocatedSqFt;
  const status: 'exact' | 'under' | 'over' =
    Math.abs(1 - sumFrac) <= 1e-5 ? 'exact' : sumFrac < 1 ? 'under' : 'over';

  return {
    valid: true,
    dagNo,
    khatianNo,
    totalAreaSqFt,
    totalBreakdown: computeAreaBreakdown(totalAreaSqFt, profile),
    rows,
    allocatedSqFt,
    remainingSqFt,
    status,
  };
}

function csvEsc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportTofsilCsv(
  result: TofsilDistributionResult,
  lang: 'bn' | 'en' = 'bn',
  profile: UnitProfile = DEFAULT_UNIT_PROFILE
): string {
  const lines: string[] = [];
  lines.push(
    [
      csvEsc(lang === 'bn' ? 'SurveyCAD তফসিল বণ্টন তালিকা' : 'SurveyCAD Tofsil Distribution'),
      csvEsc(
        `${lang === 'bn' ? 'দাগ' : 'Dag'}: ${result.dagNo || '-'} | ${
          lang === 'bn' ? 'খতিয়ান' : 'Khatian'
        }: ${result.khatianNo || '-'}`
      ),
    ].join(',')
  );
  lines.push(
    [
      csvEsc(lang === 'bn' ? 'ইউনিট প্রোফাইল' : 'Unit Profile'),
      csvEsc(lang === 'bn' ? profile.nameBn : profile.nameEn),
    ].join(',')
  );
  lines.push(
    [
      csvEsc(lang === 'bn' ? 'সতর্কবার্তা' : 'Disclaimer'),
      csvEsc(
        lang === 'bn'
          ? 'ফলাফল আনুমানিক হিসাবের জন্য; চূড়ান্ত আইনি বা দলিলের পরামর্শ নয়।'
          : 'Results are approximate calculations and do not constitute legal advice.'
      ),
    ].join(',')
  );
  lines.push('');

  lines.push(
    [
      lang === 'bn' ? 'নাম / শরিক' : 'Person / Recipient',
      lang === 'bn' ? 'অংশ' : 'Share',
      lang === 'bn' ? 'শতক' : 'Shotok',
      lang === 'bn' ? 'কাঠা' : 'Katha',
      lang === 'bn' ? 'বিঘা' : 'Bigha',
      lang === 'bn' ? 'একর' : 'Acre',
      lang === 'bn' ? 'বর্গফুট' : 'Sq Ft',
      lang === 'bn' ? 'বর্গমিটার' : 'Sq M',
    ]
      .map(csvEsc)
      .join(',')
  );

  for (const r of result.rows) {
    lines.push(
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
        .map(csvEsc)
        .join(',')
    );
  }

  lines.push('');
  const tb = result.totalBreakdown;
  lines.push(
    [
      lang === 'bn' ? 'মোট তফসিল জমি' : 'Total Area',
      '100%',
      tb.shotok.toFixed(4),
      tb.katha.toFixed(4),
      tb.bigha.toFixed(4),
      tb.acre.toFixed(5),
      tb.sqFt.toFixed(2),
      tb.sqM.toFixed(2),
    ]
      .map(csvEsc)
      .join(',')
  );

  return `\uFEFF${lines.join('\n')}`;
}
