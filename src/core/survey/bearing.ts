import { Point2D, distance2D } from './coordinates';
import { toBengaliDigits } from './units';

export type Quadrant = 'NE' | 'SE' | 'SW' | 'NW';

export interface ReducedBearing {
  quadrant: Quadrant;
  angleDeg: number;
  formattedEn: string;
  formattedBn: string;
}

export function normalizeAzimuth(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/**
 * Computes Whole Circle Bearing (0 deg = North/+Y, 90 deg = East/+X)
 * from world coordinates in feet.
 */
export function azimuthDegrees(from: Point2D, to: Point2D): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 1e-12) return 0;
  const rad = Math.atan2(dx, dy);
  return normalizeAzimuth((rad * 180) / Math.PI);
}

export function polarToVector(distanceFt: number, azimuthDeg: number): Point2D {
  const rad = (normalizeAzimuth(azimuthDeg) * Math.PI) / 180;
  return {
    x: distanceFt * Math.sin(rad),
    y: distanceFt * Math.cos(rad),
  };
}

export function vectorToPolar(from: Point2D, to: Point2D): { distanceFt: number; azimuthDeg: number } {
  return {
    distanceFt: distance2D(from, to),
    azimuthDeg: azimuthDegrees(from, to),
  };
}

export function toDMS(deg: number): { d: number; m: number; s: number } {
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  const remMin = (abs - d) * 60;
  let m = Math.floor(remMin);
  let s = Math.round((remMin - m) * 60);
  if (s === 60) {
    s = 0;
    m += 1;
  }
  if (m === 60) {
    m = 0;
    d += 1;
  }
  return { d, m, s };
}

export function formatDMS(deg: number, lang: 'bn' | 'en' = 'bn'): string {
  const { d, m, s } = toDMS(normalizeAzimuth(deg));
  const text = `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
  return lang === 'bn' ? toBengaliDigits(text) : text;
}

export function wcbToReducedBearing(wcbDeg: number): ReducedBearing {
  const w = normalizeAzimuth(wcbDeg);
  let quadrant: Quadrant = 'NE';
  let angleDeg = w;

  if (w >= 0 && w <= 90) {
    quadrant = 'NE';
    angleDeg = w;
  } else if (w > 90 && w <= 180) {
    quadrant = 'SE';
    angleDeg = 180 - w;
  } else if (w > 180 && w < 270) {
    quadrant = 'SW';
    angleDeg = w - 180;
  } else {
    quadrant = 'NW';
    angleDeg = 360 - w;
  }

  const dmsEn = formatDMS(angleDeg, 'en');
  const dmsBn = formatDMS(angleDeg, 'bn');
  const dirBn: Record<Quadrant, [string, string]> = {
    NE: ['উ.', 'পূ.'],
    SE: ['দ.', 'পূ.'],
    SW: ['দ.', 'প.'],
    NW: ['উ.', 'প.'],
  };
  const [ns, ew] = dirBn[quadrant];
  return {
    quadrant,
    angleDeg,
    formattedEn: `${quadrant[0]} ${dmsEn} ${quadrant[1]}`,
    formattedBn: `${ns} ${dmsBn} ${ew}`,
  };
}

export function interiorAngleDegrees(prev: Point2D, vertex: Point2D, next: Point2D): number {
  const v1x = prev.x - vertex.x;
  const v1y = prev.y - vertex.y;
  const v2x = next.x - vertex.x;
  const v2y = next.y - vertex.y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 < 1e-12 || mag2 < 1e-12) return 0;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function angleBetweenPointsDegrees(
  armA: Point2D,
  vertex: Point2D,
  armB: Point2D
): number {
  return interiorAngleDegrees(armA, vertex, armB);
}

/**
 * Computes standard CAD polar angle in degrees counterclockwise from +X (East).
 * 0° = East (+X), 45° = NE, 90° = North (+Y), 180° = West (-X), 270° = South (-Y).
 */
export function segmentAngleDegrees(from: Point2D, to: Point2D): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 1e-12) return 0;
  return normalizeAzimuth((Math.atan2(dy, dx) * 180) / Math.PI);
}

export interface ThreePointAngleResult {
  includedDeg: number;
  reflexDeg: number;
  armALengthFt: number;
  armBLengthFt: number;
  azimuthADeg: number;
  azimuthBDeg: number;
}

export function measureThreePointAngle(
  armA: Point2D,
  vertex: Point2D,
  armB: Point2D
): ThreePointAngleResult {
  const includedDeg = interiorAngleDegrees(armA, vertex, armB);
  return {
    includedDeg,
    reflexDeg: 360 - includedDeg,
    armALengthFt: distance2D(vertex, armA),
    armBLengthFt: distance2D(vertex, armB),
    azimuthADeg: azimuthDegrees(vertex, armA),
    azimuthBDeg: azimuthDegrees(vertex, armB),
  };
}

export interface CoordinateDeltaResult {
  dxFt: number;
  dyFt: number;
  distanceFt: number;
  azimuthDeg: number;
  cadAngleDeg: number;
  reducedBearing: ReducedBearing;
}

export function coordinateDelta(
  from: Point2D,
  to: Point2D
): CoordinateDeltaResult {
  const dxFt = to.x - from.x;
  const dyFt = to.y - from.y;
  const az = azimuthDegrees(from, to);
  return {
    dxFt,
    dyFt,
    distanceFt: Math.hypot(dxFt, dyFt),
    azimuthDeg: az,
    cadAngleDeg: segmentAngleDegrees(from, to),
    reducedBearing: wcbToReducedBearing(az),
  };
}

export function polygonCornerAnglesDegrees(points: Point2D[]): number[] {
  if (points.length < 3) return [];
  const angles: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    angles.push(interiorAngleDegrees(prev, curr, next));
  }
  return angles;
}
