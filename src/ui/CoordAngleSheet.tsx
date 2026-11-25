import React, { useState } from 'react';
import { Compass, Crosshair, MapPin, Plus, RotateCcw, X } from 'lucide-react';
import {
  coordinateDelta,
  formatDMS,
  measureThreePointAngle,
  polarToVector,
} from '../core/survey/bearing';
import { Point2D } from '../core/survey/coordinates';
import {
  LinearUnit,
  formatNumber,
  fromFeet,
  getLinearUnitLabel,
  parseLocalizedNumber,
  toFeet,
} from '../core/survey/units';
import { BottomSheet } from './BottomSheet';
import { Lang } from './i18n';

interface CoordAngleSheetProps {
  open: boolean;
  initialTab: 'coord' | 'angle';
  lang: Lang;
  linearUnit: LinearUnit;
  pickedCoords: Point2D[];
  anglePoints: { armA: Point2D; vertex: Point2D; armB: Point2D } | null;
  onStartPickCoord: () => void;
  onStartMeasureAngle: () => void;
  onClearCoords: () => void;
  onClearAngle: () => void;
  onPlotPoint: (p: Point2D, label?: string) => void;
  onPlotLine: (a: Point2D, b: Point2D) => void;
  onStampAngleLabel: (vertex: Point2D, label: string) => void;
  onClose: () => void;
}

export const CoordAngleSheet: React.FC<CoordAngleSheetProps> = ({
  open,
  initialTab,
  lang,
  linearUnit,
  pickedCoords,
  anglePoints,
  onStartPickCoord,
  onStartMeasureAngle,
  onClearCoords,
  onClearAngle,
  onPlotPoint,
  onPlotLine,
  onStampAngleLabel,
  onClose,
}) => {
  const [tab, setTab] = useState<'coord' | 'angle'>(initialTab);
  const [xInput, setXInput] = useState('0');
  const [yInput, setYInput] = useState('0');
  const [inputUnit, setInputUnit] = useState<LinearUnit>('ft');
  const [polarDist, setPolarDist] = useState('50');
  const [polarAz, setPolarAz] = useState('45');

  React.useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const latestCoord =
    pickedCoords.length > 0 ? pickedCoords[pickedCoords.length - 1] : null;
  const prevCoord =
    pickedCoords.length >= 2 ? pickedCoords[pickedCoords.length - 2] : null;
  const delta =
    prevCoord && latestCoord ? coordinateDelta(prevCoord, latestCoord) : null;

  const angleMetrics = anglePoints
    ? measureThreePointAngle(anglePoints.armA, anglePoints.vertex, anglePoints.armB)
    : null;

  return (
    <BottomSheet
      open={open}
      title={
        lang === 'bn' ? 'কোণ ও স্থানাঙ্ক টুল' : 'Angle & Coordinate Tools'
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#F1F3EE] dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setTab('coord')}
            className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
              tab === 'coord'
                ? 'bg-[#0F5132] dark:bg-emerald-600 text-white'
                : 'text-[#4A5550] dark:text-slate-300'
            }`}
          >
            {lang === 'bn' ? 'স্থানাঙ্ক (X, Y)' : 'Coordinates (X, Y)'}
          </button>
          <button
            type="button"
            onClick={() => setTab('angle')}
            className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
              tab === 'angle'
                ? 'bg-[#7C3AED] text-white'
                : 'text-[#4A5550] dark:text-slate-300'
            }`}
          >
            {lang === 'bn' ? 'কোণ মাপুন (°)' : 'Angle Tool (°)'}
          </button>
        </div>

        {tab === 'coord' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onStartPickCoord();
                  onClose();
                }}
                className="flex-1 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-3 text-xs font-bold text-white"
              >
                <Crosshair className="h-4 w-4" />
                <span>
                  {lang === 'bn'
                    ? 'ক্যানভাসে বিন্দু ট্যাপ করে স্থানাঙ্ক দেখুন'
                    : 'Tap Canvas to Read Coordinate'}
                </span>
              </button>
              {pickedCoords.length > 0 && (
                <button
                  type="button"
                  onClick={onClearCoords}
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-[#D4DBD6] dark:border-slate-700"
                  aria-label="Clear"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>

            {latestCoord && (
              <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-3 text-xs tabular-nums space-y-1.5">
                <div className="font-bold text-[#0F5132] dark:text-emerald-400">
                  {lang === 'bn' ? 'সর্বশেষ নির্বাচিত বিন্দু:' : 'Latest Picked Point:'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    X (East):{' '}
                    <strong>
                      {formatNumber(fromFeet(latestCoord.x, linearUnit), 3, lang)}{' '}
                      {getLinearUnitLabel(linearUnit, lang)}
                    </strong>
                  </div>
                  <div>
                    Y (North):{' '}
                    <strong>
                      {formatNumber(fromFeet(latestCoord.y, linearUnit), 3, lang)}{' '}
                      {getLinearUnitLabel(linearUnit, lang)}
                    </strong>
                  </div>
                </div>
                <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                  ({formatNumber(latestCoord.x, 3, lang)} ft,{' '}
                  {formatNumber(latestCoord.y, 3, lang)} ft ·{' '}
                  {formatNumber(fromFeet(latestCoord.x, 'm'), 3, lang)} m,{' '}
                  {formatNumber(fromFeet(latestCoord.y, 'm'), 3, lang)} m)
                </div>

                {delta && (
                  <div className="mt-2 border-t border-[#E5E9E4] dark:border-slate-700 pt-2 space-y-1">
                    <div className="font-semibold text-[#141A17] dark:text-slate-200">
                      {lang === 'bn'
                        ? 'আগের বিন্দু থেকে পার্থক্য (Δ):'
                        : 'Delta from Previous Point:'}
                    </div>
                    <div>
                      ΔX: {formatNumber(delta.dxFt, 2, lang)} ft · ΔY:{' '}
                      {formatNumber(delta.dyFt, 2, lang)} ft ·{' '}
                      {lang === 'bn' ? 'দূরত্ব:' : 'Dist:'}{' '}
                      <strong>{formatNumber(delta.distanceFt, 2, lang)} ft</strong>
                    </div>
                    <div>
                      {lang === 'bn' ? 'বেয়ারিং (WCB):' : 'Azimuth (WCB):'}{' '}
                      <strong>{formatNumber(delta.azimuthDeg, 2, lang)}°</strong> (
                      {lang === 'bn'
                        ? delta.reducedBearing.formattedBn
                        : delta.reducedBearing.formattedEn}
                      ) · CAD ∠ {formatNumber(delta.cadAngleDeg, 2, lang)}°
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Direct Coordinate (X, Y) Entry */}
            <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">
                  {lang === 'bn'
                    ? 'স্থানাঙ্ক (X, Y) দিয়ে খুঁটি/বিন্দু বসান'
                    : 'Plot Point by Coordinates (X, Y)'}
                </span>
                <select
                  value={inputUnit}
                  onChange={(e) => setInputUnit(e.target.value as LinearUnit)}
                  className="min-h-[32px] rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs"
                >
                  {(['ft', 'm', 'chain', 'hat', 'gaj'] as LinearUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {getLinearUnitLabel(u, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={xInput}
                  onChange={(e) => setXInput(e.target.value)}
                  placeholder="X"
                  className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={yInput}
                  onChange={(e) => setYInput(e.target.value)}
                  placeholder="Y"
                  className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                />
                <button
                  type="button"
                  onClick={() => {
                    const x = toFeet(parseLocalizedNumber(xInput), inputUnit);
                    const y = toFeet(parseLocalizedNumber(yInput), inputUnit);
                    if (Number.isFinite(x) && Number.isFinite(y)) {
                      onPlotPoint({ x, y });
                    }
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-[#0F5132] px-3 text-xs font-bold text-white"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{lang === 'bn' ? 'বসান' : 'Plot'}</span>
                </button>
              </div>
            </div>

            {/* Polar Offset Entry from Latest Point */}
            <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 p-3 space-y-2">
              <div className="text-xs font-bold">
                {lang === 'bn'
                  ? 'দূরত্ব ও কোণ (পোলার) থেকে পরবর্তী বিন্দু'
                  : 'Polar Step (Distance + Bearing °)'}
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={polarDist}
                  onChange={(e) => setPolarDist(e.target.value)}
                  placeholder={lang === 'bn' ? 'দূরত্ব (ফু)' : 'Dist (ft)'}
                  className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={polarAz}
                  onChange={(e) => setPolarAz(e.target.value)}
                  placeholder={lang === 'bn' ? 'বেয়ারিং (°)' : 'Azimuth (°)'}
                  className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                />
                <button
                  type="button"
                  onClick={() => {
                    const d = toFeet(parseLocalizedNumber(polarDist), inputUnit);
                    const az = parseLocalizedNumber(polarAz);
                    if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(az)) return;
                    const base = latestCoord || { x: 0, y: 0 };
                    const vec = polarToVector(d, az);
                    const target = { x: base.x + vec.x, y: base.y + vec.y };
                    onPlotLine(base, target);
                    onPlotPoint(target);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-[#0369A1] px-3 text-xs font-bold text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{lang === 'bn' ? 'লাইন' : 'Draw'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onStartMeasureAngle();
                  onClose();
                }}
                className="flex-1 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#7C3AED] px-3 text-xs font-bold text-white"
              >
                <Compass className="h-4 w-4" />
                <span>
                  {lang === 'bn'
                    ? 'ক্যানভাসে ৩ বিন্দু ট্যাপ করে কোণ মাপুন'
                    : 'Tap 3 Points on Canvas to Measure Angle'}
                </span>
              </button>
              {angleMetrics && (
                <button
                  type="button"
                  onClick={onClearAngle}
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-[#D4DBD6] dark:border-slate-700"
                  aria-label="Clear angle"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <p className="text-xs text-[#4A5550] dark:text-slate-400">
              {lang === 'bn'
                ? '১ম প্রান্ত -> মাঝের কোণার বিন্দু -> ২য় প্রান্ত ট্যাপ করলে উভয় বাহুর ভেতরের কোণ ও ডিগ্রি দেখাবে।'
                : 'Tap Arm 1 -> Vertex -> Arm 2 to compute exact included angle, DMS, and arm bearings.'}
            </p>

            {angleMetrics && anglePoints ? (
              <div className="rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-3 text-xs tabular-nums space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-900 dark:text-purple-200">
                    {lang === 'bn' ? 'অন্তর্ভুক্ত কোণ:' : 'Included Angle:'}
                  </span>
                  <span className="text-lg font-bold text-purple-700 dark:text-purple-300">
                    {formatNumber(angleMetrics.includedDeg, 2, lang)}° (
                    {formatDMS(angleMetrics.includedDeg, lang)})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    {lang === 'bn' ? 'প্রবৃদ্ধ কোণ:' : 'Reflex:'}{' '}
                    <strong>{formatNumber(angleMetrics.reflexDeg, 2, lang)}°</strong>
                  </div>
                  <div>
                    {lang === 'bn' ? '১ম / ২য় বাহু:' : 'Arms:'}{' '}
                    <strong>
                      {formatNumber(angleMetrics.armALengthFt, 1, lang)} /{' '}
                      {formatNumber(angleMetrics.armBLengthFt, 1, lang)} ft
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onStampAngleLabel(
                      anglePoints.vertex,
                      `${formatNumber(angleMetrics.includedDeg, 1, lang)}°`
                    )
                  }
                  className="w-full min-h-[38px] rounded-xl bg-[#7C3AED] text-xs font-bold text-white"
                >
                  {lang === 'bn'
                    ? 'ক্যানভাসে কোণ টেক্সট বসান'
                    : 'Place Angle Label on Canvas'}
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 p-4 text-center text-xs text-[#64748B]">
                {lang === 'bn'
                  ? 'এখনো কোনো ৩-বিন্দু কোণ মাপা হয়নি'
                  : 'No 3-point angle measured yet'}
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
