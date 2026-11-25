import { Point2D } from './coordinates';
import { azimuthDegrees, polarToVector } from './bearing';
import { polygonAreaSqFt } from './area';

export interface TraverseLeg {
  distanceFt: number;
  azimuthDeg: number;
  label?: string;
}

export interface TraverseStation {
  index: number;
  unadjusted: Point2D;
  adjusted: Point2D;
}

export interface TraverseResult {
  stations: TraverseStation[];
  totalLengthFt: number;
  closingErrorX: number;
  closingErrorY: number;
  linearMisclosureFt: number;
  closingAzimuthDeg: number;
  precisionDenominator: number;
  areaSqFt: number;
}

/**
 * Solves an open or closed traverse using the Bowditch (Compass) Rule
 * for closed traverses.
 */
export function solveTraverse(
  legs: TraverseLeg[],
  startPoint: Point2D = { x: 0, y: 0 },
  closed = true
): TraverseResult {
  if (legs.length === 0) {
    return {
      stations: [{ index: 0, unadjusted: startPoint, adjusted: startPoint }],
      totalLengthFt: 0,
      closingErrorX: 0,
      closingErrorY: 0,
      linearMisclosureFt: 0,
      closingAzimuthDeg: 0,
      precisionDenominator: Infinity,
      areaSqFt: 0,
    };
  }

  const unadjusted: Point2D[] = [{ ...startPoint }];
  let totalLengthFt = 0;
  let current = { ...startPoint };

  for (const leg of legs) {
    const delta = polarToVector(leg.distanceFt, leg.azimuthDeg);
    current = { x: current.x + delta.x, y: current.y + delta.y };
    unadjusted.push(current);
    totalLengthFt += Math.abs(leg.distanceFt);
  }

  const end = unadjusted[unadjusted.length - 1];
  const closingErrorX = end.x - startPoint.x;
  const closingErrorY = end.y - startPoint.y;
  const linearMisclosureFt = Math.hypot(closingErrorX, closingErrorY);
  const closingAzimuthDeg = azimuthDegrees(startPoint, end);
  const precisionDenominator =
    linearMisclosureFt > 1e-12 ? totalLengthFt / linearMisclosureFt : Infinity;

  const adjusted: Point2D[] = [{ ...startPoint }];
  if (closed && totalLengthFt > 1e-12) {
    let cumLength = 0;
    for (let i = 0; i < legs.length; i++) {
      cumLength += Math.abs(legs[i].distanceFt);
      const ratio = cumLength / totalLengthFt;
      const p = unadjusted[i + 1];
      adjusted.push({
        x: p.x - closingErrorX * ratio,
        y: p.y - closingErrorY * ratio,
      });
    }
  } else {
    for (let i = 1; i < unadjusted.length; i++) {
      adjusted.push({ ...unadjusted[i] });
    }
  }

  const stations: TraverseStation[] = unadjusted.map((u, idx) => ({
    index: idx,
    unadjusted: u,
    adjusted: adjusted[idx],
  }));

  const polygonPoints = closed && adjusted.length > 3 ? adjusted.slice(0, -1) : adjusted;
  const areaSqFt = polygonPoints.length >= 3 ? polygonAreaSqFt(polygonPoints) : 0;

  return {
    stations,
    totalLengthFt,
    closingErrorX,
    closingErrorY,
    linearMisclosureFt,
    closingAzimuthDeg,
    precisionDenominator,
    areaSqFt,
  };
}
