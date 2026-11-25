import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  RotateCcw,
  Ruler,
  ScanLine,
  ShieldAlert,
  X,
} from 'lucide-react';
import { RasterLayer } from '../core/cad/types';
import {
  rasterPixelToWorld,
  solveRasterTransformFromTwoPoints,
  worldToRasterPixel,
} from '../core/cad/geometry';
import { Point2D, distance2D } from '../core/survey/coordinates';
import {
  checkScaleAccuracy,
  computePixelsPerFootFromMapScale,
  computePixelsPerInch,
  computeScaleFromBar,
} from '../core/survey/scale';
import {
  LinearUnit,
  formatNumber,
  getLinearUnitLabel,
  parseLocalizedNumber,
  toFeet,
} from '../core/survey/units';
import { Lang } from './i18n';

export type RasterScaleTab = 'calibrate' | 'check' | 'mapscale';

interface RasterScaleSheetProps {
  open: boolean;
  tab: RasterScaleTab;
  onTabChange: (tab: RasterScaleTab) => void;
  lang: Lang;
  rasterLayers: RasterLayer[];
  selectedRasterId: string | null;
  onSelectRasterId: (id: string) => void;
  pickedPoints: Point2D[];
  onClearPickedPoints: () => void;
  onAttachRasterFile: (file: File) => Promise<RasterLayer | null>;
  onUpdateRaster: (layer: RasterLayer) => void;
  scannerPixelsPerInch: number | null;
  onSaveScannerPpi: (ppi: number | null) => void;
  onStartPicking: () => void;
  onFinishCalibrationDraw?: () => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

const CHAIN_CHIPS = [1, 2, 5, 10] as const;
const CALIBRATION_UNITS: LinearUnit[] = ['chain', 'ft', 'hat', 'gaj', 'm'];
const MAP_SCALE_CHIPS = [16, 32, 64] as const;

export const RasterScaleSheet: React.FC<RasterScaleSheetProps> = ({
  open,
  tab,
  onTabChange,
  lang,
  rasterLayers,
  selectedRasterId,
  onSelectRasterId,
  pickedPoints,
  onClearPickedPoints,
  onAttachRasterFile,
  onUpdateRaster,
  scannerPixelsPerInch,
  onSaveScannerPpi,
  onStartPicking,
  onFinishCalibrationDraw,
  onToast,
  onClose,
}) => {
  const [minimized, setMinimized] = useState(false);

  // Calibrate tab state
  const [calValue, setCalValue] = useState('1');
  const [calUnit, setCalUnit] = useState<LinearUnit>('chain');
  const [saveScannerDpi, setSaveScannerDpi] = useState(false);
  const [calInchesPerMile, setCalInchesPerMile] = useState('16');
  const [calError, setCalError] = useState('');

  // Scale check tab state
  const [checkValue, setCheckValue] = useState('1');
  const [checkUnit, setCheckUnit] = useState<LinearUnit>('chain');

  // Map-scale mode state
  const [mapInchesPerMile, setMapInchesPerMile] = useState('16');
  const [mapScaleError, setMapScaleError] = useState('');

  const targetLayer = useMemo(
    () =>
      rasterLayers.find((r) => r.id === selectedRasterId) ||
      rasterLayers[rasterLayers.length - 1] ||
      null,
    [rasterLayers, selectedRasterId]
  );

  // Use first two picked points for calibration/check
  const p1 = pickedPoints[0] || null;
  const p2 = pickedPoints[1] || null;
  const hasTwoPoints = Boolean(p1 && p2);

  const calMetrics = useMemo(() => {
    if (!targetLayer || !p1 || !p2) return null;
    const px1 = worldToRasterPixel(p1, targetLayer.transform);
    const px2 = worldToRasterPixel(p2, targetLayer.transform);
    const pixelDist = distance2D(px1, px2);
    const val = parseLocalizedNumber(calValue);
    const barRes = computeScaleFromBar(pixelDist, val, calUnit);
    return { px1, px2, pixelDist, barRes };
  }, [targetLayer, p1, p2, calValue, calUnit]);

  const checkResult = useMemo(() => {
    if (!p1 || !p2) return null;
    const measuredFt = distance2D(p1, p2);
    const val = parseLocalizedNumber(checkValue);
    const expectedFt = toFeet(val, checkUnit);
    return checkScaleAccuracy(measuredFt, expectedFt, 3);
  }, [p1, p2, checkValue, checkUnit]);

  if (!open) return null;

  const handleApplyBarCalibration = () => {
    setCalError('');
    if (!targetLayer || !p1 || !p2 || !calMetrics?.barRes) {
      setCalError(
        lang === 'bn'
          ? 'প্রথমে ম্যাপে ২টি বিন্দু ট্যাপ করুন এবং সঠিক দূরত্ব লিখুন।'
          : 'Tap 2 points on the map and enter a valid positive distance.'
      );
      return;
    }

    const { px1, px2, barRes } = calMetrics;
    const curWorldDist = distance2D(p1, p2);
    if (curWorldDist < 1e-9) {
      setCalError(
        lang === 'bn'
          ? 'বিন্দু দুটি খুব কাছাকাছি — অনুগ্রহ করে আলাদা ২টি প্রান্ত ট্যাপ করুন।'
          : 'Picked points are too close together.'
      );
      return;
    }

    const dirX = (p2.x - p1.x) / curWorldDist;
    const dirY = (p2.y - p1.y) / curWorldDist;
    const w2Target: Point2D = {
      x: p1.x + dirX * barRes.realDistanceFt,
      y: p1.y + dirY * barRes.realDistanceFt,
    };

    const nextTransform = solveRasterTransformFromTwoPoints(px1, px2, p1, w2Target);
    if (!nextTransform) {
      setCalError(
        lang === 'bn' ? 'স্কেল হিসাব করা যায়নি।' : 'Could not solve raster transform.'
      );
      return;
    }

    let savedInchesPerMile: number | undefined = targetLayer.inchesPerMile;
    if (saveScannerDpi) {
      const n = parseLocalizedNumber(calInchesPerMile);
      const ppi = computePixelsPerInch(barRes.pixelsPerFoot, n);
      if (!ppi) {
        setCalError(
          lang === 'bn'
            ? 'স্ক্যানার সংরক্ষণের জন্য "১ মাইল = N ইঞ্চি" মান ০-এর বড় দিন।'
            : 'Enter a valid N > 0 for "1 mile = N inches".'
        );
        return;
      }
      savedInchesPerMile = n;
      onSaveScannerPpi(ppi);
    }

    onUpdateRaster({
      ...targetLayer,
      transform: nextTransform,
      calibrated: true,
      pixelsPerFoot: barRes.pixelsPerFoot,
      inchesPerMile: savedInchesPerMile,
      calibrationMethod: 'bar',
    });

    onClearPickedPoints();
    onToast(
      lang === 'bn'
        ? `স্কেল সেট হয়েছে (${formatNumber(barRes.pixelsPerFoot, 2, lang)} px/ft)`
        : `Scale calibrated (${barRes.pixelsPerFoot.toFixed(2)} px/ft)`
    );
  };

  const handleApplyMapScale = () => {
    setMapScaleError('');
    if (!targetLayer) {
      setMapScaleError(
        lang === 'bn' ? 'প্রথমে একটি ম্যাপ ছবি খুলুন।' : 'Open a map image first.'
      );
      return;
    }
    if (!scannerPixelsPerInch || scannerPixelsPerInch <= 0) {
      setMapScaleError(
        lang === 'bn'
          ? 'আগে ১টি ম্যাপে "স্কেল বার" দিয়ে ক্যালিব্রেশন করে স্ক্যানার সংরক্ষণ করুন।'
          : 'Calibrate one map by scale bar and save scanner DPI first.'
      );
      return;
    }

    const n = parseLocalizedNumber(mapInchesPerMile);
    const scaleRes = computePixelsPerFootFromMapScale(scannerPixelsPerInch, n);
    if (!scaleRes) {
      setMapScaleError(
        lang === 'bn'
          ? '"১ মাইল = N ইঞ্চি" এর সঠিক মান লিখুন (যেমন ১৬ বা ৩২)।'
          : 'Enter a valid positive value for N (e.g., 16 or 32).'
      );
      return;
    }

    // Keep the center of the raster stationary in world coordinates
    const pxCenter: Point2D = {
      x: targetLayer.widthPx / 2,
      y: targetLayer.heightPx / 2,
    };
    const worldCenter = rasterPixelToWorld(pxCenter, targetLayer.transform);
    const sx = pxCenter.x * scaleRes.scaleFtPerPx;
    const sy = -pxCenter.y * scaleRes.scaleFtPerPx;
    const cos = Math.cos(targetLayer.transform.rotationRad);
    const sin = Math.sin(targetLayer.transform.rotationRad);
    const nextTx = worldCenter.x - (sx * cos - sy * sin);
    const nextTy = worldCenter.y - (sx * sin + sy * cos);

    onUpdateRaster({
      ...targetLayer,
      transform: {
        ...targetLayer.transform,
        tx: nextTx,
        ty: nextTy,
        scaleFtPerPx: scaleRes.scaleFtPerPx,
      },
      calibrated: true,
      pixelsPerFoot: scaleRes.pixelsPerFoot,
      inchesPerMile: n,
      calibrationMethod: 'scanner',
    });

    // Automatically open Scale Check and prepare 2-point picking
    setCheckValue('1');
    setCheckUnit('chain');
    onClearPickedPoints();
    onStartPicking();
    onTabChange('check');
    onToast(
      lang === 'bn'
        ? `১ মাইল = ${formatNumber(n, 0, lang)}″ প্রয়োগ হয়েছে — এবার স্কেল বার যাচাই করুন`
        : `Applied 1 mile = ${n}" — now check the scale bar`
    );
  };

  const tabTitles: Record<RasterScaleTab, string> = {
    calibrate: lang === 'bn' ? 'স্কেল বার' : 'Calibrate Bar',
    check: lang === 'bn' ? 'স্কেল যাচাই' : 'Scale Check',
    mapscale: lang === 'bn' ? '১ মাইল = N″' : '1 Mile = N″',
  };

  if (minimized) {
    return (
      <div className="pointer-events-auto fixed bottom-12 left-3 right-3 z-30 mx-auto flex max-w-md items-center justify-between gap-2 rounded-2xl border border-[#0F5132]/40 dark:border-emerald-500/40 bg-white/95 dark:bg-slate-900/95 px-3.5 py-2 shadow-xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Ruler className="h-4 w-4 shrink-0 text-[#0F5132] dark:text-emerald-400" />
          <div className="min-w-0">
            <div className="truncate text-xs font-bold">
              {tabTitles[tab]} ·{' '}
              {lang === 'bn'
                ? `বিন্দু ${formatNumber(Math.min(2, pickedPoints.length), 0, lang)}/২`
                : `Points ${Math.min(2, pickedPoints.length)}/2`}
            </div>
            <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
              {lang === 'bn'
                ? 'ম্যাপে ট্যাপ করুন, বিস্তারিত খুলতে এখানে চাপুন'
                : 'Tap map points, tap here to expand'}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F5132]/10 text-[#0F5132] dark:text-emerald-400"
          aria-label="Expand"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4A5550] dark:text-slate-400"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-xl rounded-t-3xl border-t border-x border-[#D4DBD6] dark:border-slate-700 bg-white/96 dark:bg-slate-900/96 backdrop-blur-md shadow-2xl pb-safe">
      <div className="mx-auto my-2 h-1.5 w-10 rounded-full bg-[#CBD5E1] dark:bg-slate-700" />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#E5E9E4] dark:border-slate-800 px-4 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Ruler className="h-4 w-4 shrink-0 text-[#0F5132] dark:text-emerald-400" />
          <h2 className="truncate text-sm font-bold text-[#141A17] dark:text-slate-100">
            {lang === 'bn' ? 'ম্যাপ স্কেল ও যাচাই' : 'Map Scale & Check'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2 text-[11px] font-semibold text-[#4A5550] dark:text-slate-300"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            <span>{lang === 'bn' ? 'ম্যাপ দেখুন' : 'Collapse'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#4A5550] dark:text-slate-300 hover:bg-[#EAECE7] dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="grid grid-cols-3 gap-1.5 border-b border-[#E5E9E4] dark:border-slate-800 px-4 py-2">
        {(['calibrate', 'check', 'mapscale'] as RasterScaleTab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onTabChange(id);
              if (id === 'calibrate' || id === 'check') {
                onStartPicking();
              }
            }}
            className={`min-h-[38px] rounded-xl px-2 text-xs font-bold transition-colors ${
              tab === id
                ? 'bg-[#0F5132] dark:bg-emerald-600 text-white'
                : 'bg-[#F1F3EE] dark:bg-slate-800 text-[#4A5550] dark:text-slate-300'
            }`}
          >
            {tabTitles[id]}
          </button>
        ))}
      </div>

      <div className="max-h-[48vh] overflow-y-auto px-4 py-3 space-y-3 text-[#141A17] dark:text-slate-100">
        {/* Map File / Camera Row & Active Map Selector */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2.5 text-xs font-semibold hover:border-[#0F5132]">
              <ImagePlus className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'JPG / PNG খুলুন' : 'Open JPG / PNG'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (!f) return;
                  const l = await onAttachRasterFile(f);
                  if (l) {
                    onSelectRasterId(l.id);
                    onClearPickedPoints();
                    onStartPicking();
                  }
                }}
              />
            </label>

            <label className="flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2.5 text-xs font-semibold hover:border-[#0F5132]">
              <Camera className="h-4 w-4 text-[#B45309] dark:text-amber-400" />
              <span>{lang === 'bn' ? 'ক্যামেরা ছবি' : 'Camera Photo'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (!f) return;
                  const l = await onAttachRasterFile(f);
                  if (l) {
                    onSelectRasterId(l.id);
                    onClearPickedPoints();
                    onTabChange('calibrate');
                    onStartPicking();
                  }
                }}
              />
            </label>
          </div>

          {rasterLayers.length > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/60 px-3 py-1.5 text-xs">
              {rasterLayers.length > 1 ? (
                <select
                  value={targetLayer?.id || ''}
                  onChange={(e) => onSelectRasterId(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                >
                  {rasterLayers.map((r) => (
                    <option key={r.id} value={r.id} className="dark:bg-slate-900">
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="truncate font-semibold">{targetLayer?.name}</span>
              )}
              {targetLayer?.calibrated && targetLayer.pixelsPerFoot ? (
                <span className="shrink-0 rounded-lg bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[11px] font-semibold text-[#0F5132] dark:text-emerald-300 tabular-nums">
                  {formatNumber(targetLayer.pixelsPerFoot, 2, lang)} px/ft
                </span>
              ) : (
                <span className="shrink-0 rounded-lg bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  {lang === 'bn' ? 'স্কেল সেট নেই' : 'Uncalibrated'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* No raster yet prompt */}
        {!targetLayer ? (
          <p className="rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 p-4 text-center text-xs text-[#4A5550] dark:text-slate-400">
            {lang === 'bn'
              ? 'সর্বোচ্চ ২০ মেগাবাইট পর্যন্ত JPG বা PNG মৌজা ম্যাপ খুলুন অথবা ক্যামেরায় ছবি তুলুন।'
              : 'Open a JPG/PNG mouza map (up to 20 MB) or capture a photo with the camera.'}
          </p>
        ) : (
          <>
            {/* -------------------- TAB 1: BAR CALIBRATION -------------------- */}
            {tab === 'calibrate' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[#FAFBF8] dark:bg-slate-800 border border-[#E5E9E4] dark:border-slate-700 px-3 py-2 text-xs">
                  <span>
                    {lang === 'bn'
                      ? `স্কেল বারের ২ প্রান্তে ট্যাপ করুন (${formatNumber(
                          Math.min(2, pickedPoints.length),
                          0,
                          lang
                        )}/২)`
                      : `Tap 2 points on known distance (${Math.min(2, pickedPoints.length)}/2)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearPickedPoints();
                      onStartPicking();
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-[#0F5132] dark:text-emerald-400"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'রিসেট' : 'Reset'}</span>
                  </button>
                </div>

                {/* Preset Chain Chips (1, 2, 5, 10 chain) */}
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-[#4A5550] dark:text-slate-400">
                    {lang === 'bn' ? 'দ্রুত চেইন মাপ বেছে নিন:' : 'Quick Chain Chips:'}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CHAIN_CHIPS.map((c) => {
                      const active =
                        calUnit === 'chain' && parseLocalizedNumber(calValue) === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setCalValue(String(c));
                            setCalUnit('chain');
                          }}
                          className={`min-h-[38px] rounded-xl border text-xs font-bold tabular-nums ${
                            active
                              ? 'border-[#0F5132] bg-[#0F5132] text-white'
                              : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
                          }`}
                        >
                          {formatNumber(c, 0, lang)}{' '}
                          {lang === 'bn' ? 'চেইন' : 'ch'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Distance + Unit (ft, hat, gaj, m, chain) */}
                <div className="grid grid-cols-[1fr_115px] gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={calValue}
                    onChange={(e) => setCalValue(e.target.value)}
                    placeholder={lang === 'bn' ? 'দূরত্ব' : 'Distance'}
                    className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                  />
                  <select
                    value={calUnit}
                    onChange={(e) => setCalUnit(e.target.value as LinearUnit)}
                    className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold"
                  >
                    {CALIBRATION_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {getLinearUnitLabel(u, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live Pixel & Pixels-per-foot preview */}
                {hasTwoPoints && calMetrics?.barRes && (
                  <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 px-3 py-2 text-xs tabular-nums flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {lang === 'bn' ? 'ছবির দূরত্ব:' : 'Image span:'}{' '}
                      <strong>{formatNumber(calMetrics.pixelDist, 1, lang)} px</strong>
                    </span>
                    <span className="text-[#0F5132] dark:text-emerald-400 font-bold">
                      {formatNumber(calMetrics.barRes.pixelsPerFoot, 2, lang)} px/ft
                    </span>
                  </div>
                )}

                {/* Optional: Save Scanner Pixels-Per-Inch for Map-Scale Mode */}
                <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 p-2.5 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveScannerDpi}
                      onChange={(e) => setSaveScannerDpi(e.target.checked)}
                      className="h-4 w-4 accent-[#0F5132]"
                    />
                    <span>
                      {lang === 'bn'
                        ? 'স্ক্যানারের DPI সেভ করুন (১ মাইল = N ইঞ্চি)'
                        : 'Save scanner pixels/inch for future maps'}
                    </span>
                  </label>
                  {saveScannerDpi && (
                    <div className="flex items-center gap-2">
                      {MAP_SCALE_CHIPS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setCalInchesPerMile(String(n))}
                          className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-bold tabular-nums ${
                            parseLocalizedNumber(calInchesPerMile) === n
                              ? 'border-[#0F5132] bg-[#0F5132]/15 text-[#0F5132] dark:text-emerald-300'
                              : 'border-[#D4DBD6] dark:border-slate-700'
                          }`}
                        >
                          {formatNumber(n, 0, lang)}″
                        </button>
                      ))}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={calInchesPerMile}
                        onChange={(e) => setCalInchesPerMile(e.target.value)}
                        className="w-20 min-h-[34px] rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-mono-num"
                      />
                    </div>
                  )}
                </div>

                {calError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{calError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!hasTwoPoints}
                    onClick={handleApplyBarCalibration}
                    className="flex-1 min-h-[44px] rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {lang === 'bn' ? 'স্কেল সেট করুন' : 'Apply Bar Scale'}
                  </button>
                  {onFinishCalibrationDraw && targetLayer.calibrated && (
                    <button
                      type="button"
                      onClick={() => {
                        onFinishCalibrationDraw();
                        onClose();
                      }}
                      className="min-h-[44px] rounded-xl border border-[#0F5132] px-3 text-xs font-bold text-[#0F5132] dark:text-emerald-400"
                    >
                      {lang === 'bn' ? 'দাগ আঁকুন' : 'Trace Plot'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* -------------------- TAB 2: SCALE CHECK (>3% WARNING / GREEN PASS) -------------------- */}
            {tab === 'check' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[#FAFBF8] dark:bg-slate-800 border border-[#E5E9E4] dark:border-slate-700 px-3 py-2 text-xs">
                  <span>
                    {lang === 'bn'
                      ? `স্কেল বারের ২ প্রান্তে ট্যাপ করুন (${formatNumber(
                          Math.min(2, pickedPoints.length),
                          0,
                          lang
                        )}/২)`
                      : `Tap both ends of the scale bar (${Math.min(2, pickedPoints.length)}/2)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearPickedPoints();
                      onStartPicking();
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-[#0F5132] dark:text-emerald-400"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'রিসেট' : 'Reset'}</span>
                  </button>
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-[#4A5550] dark:text-slate-400">
                    {lang === 'bn' ? 'স্কেল বারের আসল চেইন মান:' : 'Real Scale Bar Length:'}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CHAIN_CHIPS.map((c) => {
                      const active =
                        checkUnit === 'chain' && parseLocalizedNumber(checkValue) === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setCheckValue(String(c));
                            setCheckUnit('chain');
                          }}
                          className={`min-h-[38px] rounded-xl border text-xs font-bold tabular-nums ${
                            active
                              ? 'border-[#0F5132] bg-[#0F5132] text-white'
                              : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
                          }`}
                        >
                          {formatNumber(c, 0, lang)}{' '}
                          {lang === 'bn' ? 'চেইন' : 'ch'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_115px] gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={checkValue}
                    onChange={(e) => setCheckValue(e.target.value)}
                    className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                  />
                  <select
                    value={checkUnit}
                    onChange={(e) => setCheckUnit(e.target.value as LinearUnit)}
                    className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold"
                  >
                    {CALIBRATION_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {getLinearUnitLabel(u, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live Scale Check Result Card */}
                {checkResult ? (
                  checkResult.passed ? (
                    <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 p-3 text-xs text-emerald-950 dark:text-emerald-100 space-y-1.5 tabular-nums">
                      <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>
                          {lang === 'bn'
                            ? 'স্কেল যাচাই সফল (ত্রুটি ৩%-এর মধ্যে)'
                            : 'Scale Verified (Within 3% Tolerance)'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          {lang === 'bn' ? 'মাপকৃত:' : 'Measured:'}{' '}
                          <strong>{formatNumber(checkResult.measuredFt, 2, lang)} ft</strong> (
                          {formatNumber(checkResult.measuredFt / 66, 3, lang)}{' '}
                          {lang === 'bn' ? 'চেইন' : 'ch'})
                        </div>
                        <div>
                          {lang === 'bn' ? 'প্রত্যাশিত:' : 'Expected:'}{' '}
                          <strong>{formatNumber(checkResult.expectedFt, 2, lang)} ft</strong> (
                          {formatNumber(checkResult.expectedFt / 66, 3, lang)}{' '}
                          {lang === 'bn' ? 'চেইন' : 'ch'})
                        </div>
                      </div>
                      <div className="font-semibold">
                        {lang === 'bn' ? 'ত্রুটির হার:' : 'Error:'}{' '}
                        {formatNumber(checkResult.errorPercent, 2, lang)}%
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-950/50 p-3 text-xs text-red-950 dark:text-red-100 space-y-2 tabular-nums">
                      <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>
                          {lang === 'bn'
                            ? 'সতর্কতা: স্কেল ত্রুটি ৩%-এর বেশি!'
                            : 'Warning: Scale Error Exceeds 3%!'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          {lang === 'bn' ? 'মাপকৃত:' : 'Measured:'}{' '}
                          <strong>{formatNumber(checkResult.measuredFt, 2, lang)} ft</strong> (
                          {formatNumber(checkResult.measuredFt / 66, 3, lang)}{' '}
                          {lang === 'bn' ? 'চেইন' : 'ch'})
                        </div>
                        <div>
                          {lang === 'bn' ? 'প্রত্যাশিত:' : 'Expected:'}{' '}
                          <strong>{formatNumber(checkResult.expectedFt, 2, lang)} ft</strong> (
                          {formatNumber(checkResult.expectedFt / 66, 3, lang)}{' '}
                          {lang === 'bn' ? 'চেইন' : 'ch'})
                        </div>
                      </div>
                      <div className="font-bold text-red-700 dark:text-red-300">
                        {lang === 'bn' ? 'ত্রুটি:' : 'Error:'}{' '}
                        {formatNumber(checkResult.errorPercent, 2, lang)}% (
                        {formatNumber(checkResult.absErrorFt, 2, lang)}{' '}
                        {lang === 'bn' ? 'ফুট পার্থক্য' : 'ft difference'})
                      </div>
                      <p className="leading-relaxed text-[11px] text-red-900 dark:text-red-200">
                        {lang === 'bn'
                          ? 'কীভাবে ঠিক করবেন: "স্কেল বার" ট্যাবে গিয়ে স্কেল বারের দুই প্রান্তে আবার ট্যাপ করে সঠিক চেইন মান দিয়ে ক্যালিব্রেট করুন। স্ক্যানার স্কেল ব্যবহার করলে সঠিক "১ মাইল = N ইঞ্চি" মান পরীক্ষা করুন (ফোনের ছবির জন্য প্রতিবার বার ক্যালিব্রেশন করুন)।'
                          : 'How to fix: Switch to "Calibrate Bar", tap both ends of the scale bar and apply the exact chain value. If using Map-Scale mode, verify the N inches/mile value (for phone photos, always use Bar Calibration).'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCalValue(checkValue);
                          setCalUnit(checkUnit);
                          onTabChange('calibrate');
                        }}
                        className="w-full min-h-[38px] rounded-xl bg-red-600 text-xs font-bold text-white"
                      >
                        {lang === 'bn'
                          ? 'বার ক্যালিব্রেশনে ঠিক করুন'
                          : 'Fix with Bar Calibration'}
                      </button>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-[#4A5550] dark:text-slate-400">
                    {lang === 'bn'
                      ? 'উপরের ক্যানভাসে স্কেল বারের শুরু ও শেষ প্রান্তে ২টি বিন্দু ট্যাপ করুন।'
                      : 'Tap both endpoints of the scale bar on the canvas above.'}
                  </p>
                )}
              </div>
            )}

            {/* -------------------- TAB 3: MAP-SCALE MODE (1 MILE = N INCHES) -------------------- */}
            {tab === 'mapscale' && (
              <div className="space-y-3">
                {/* Phone photo warning */}
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                  <span>
                    {lang === 'bn'
                      ? 'ফোনের ক্যামেরায় তোলা ছবিতে দূরত্ব ও কোণ বদলে যায়—তাই ফোনের ছবির ক্ষেত্রে প্রতিবার "স্কেল বার" ক্যালিব্রেশন প্রয়োজন। একই স্ক্যানার সেটিংসে স্ক্যান করা ম্যাপে কেবল "১ মাইল = N ইঞ্চি" সরাসরি কাজ করে।'
                      : 'Phone camera photos vary in distance and angle, so phone photos require bar calibration every time. Direct "1 mile = N inches" only works for maps scanned with the same scanner settings.'}
                  </span>
                </div>

                {/* Stored scanner status */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-3 py-2 text-xs tabular-nums">
                  <div className="flex items-center gap-2 min-w-0">
                    <ScanLine className="h-4 w-4 shrink-0 text-[#0F5132] dark:text-emerald-400" />
                    <span className="truncate">
                      {scannerPixelsPerInch
                        ? lang === 'bn'
                          ? `সংরক্ষিত স্ক্যানার: ${formatNumber(
                              scannerPixelsPerInch,
                              1,
                              lang
                            )} px/inch`
                          : `Saved Scanner: ${scannerPixelsPerInch.toFixed(1)} px/inch`
                        : lang === 'bn'
                        ? 'এখনো কোনো স্ক্যানার রেজল্যুশন সেভ করা হয়নি'
                        : 'No scanner pixels-per-inch saved yet'}
                    </span>
                  </div>
                  {scannerPixelsPerInch && (
                    <button
                      type="button"
                      onClick={() => onSaveScannerPpi(null)}
                      className="shrink-0 text-[11px] font-semibold text-red-600 dark:text-red-400 underline"
                    >
                      {lang === 'bn' ? 'মুছুন' : 'Clear'}
                    </button>
                  )}
                </div>

                {!scannerPixelsPerInch ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSaveScannerDpi(true);
                      onTabChange('calibrate');
                      onStartPicking();
                    }}
                    className="w-full min-h-[44px] rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-4 text-xs font-bold text-white"
                  >
                    {lang === 'bn'
                      ? 'প্রথমে ১ বার স্কেল বার ক্যালিব্রেট করে স্ক্যানার সেভ করুন'
                      : 'Calibrate 1 Map by Bar & Save Scanner DPI'}
                  </button>
                ) : (
                  <>
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold text-[#4A5550] dark:text-slate-400">
                        {lang === 'bn'
                          ? 'ম্যাপের স্কেল: ১ মাইল = N ইঞ্চি'
                          : 'Map Scale: 1 mile = N inches'}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {MAP_SCALE_CHIPS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setMapInchesPerMile(String(n))}
                            className={`min-h-[38px] rounded-xl border text-xs font-bold tabular-nums ${
                              parseLocalizedNumber(mapInchesPerMile) === n
                                ? 'border-[#0F5132] bg-[#0F5132] text-white'
                                : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
                            }`}
                          >
                            {formatNumber(n, 0, lang)}″ = {lang === 'bn' ? '১ মাইল' : '1 mi'}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold whitespace-nowrap">
                          {lang === 'bn' ? '১ মাইল =' : '1 mile ='}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={mapInchesPerMile}
                          onChange={(e) => setMapInchesPerMile(e.target.value)}
                          className="flex-1 min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                        />
                        <span className="text-xs font-semibold">
                          {lang === 'bn' ? 'ইঞ্চি' : 'inches'}
                        </span>
                      </div>
                    </div>

                    {mapScaleError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{mapScaleError}</p>
                    )}

                    <button
                      type="button"
                      onClick={handleApplyMapScale}
                      className="w-full min-h-[44px] rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-4 text-xs font-bold text-white"
                    >
                      {lang === 'bn'
                        ? 'প্রয়োগ করুন ও স্কেল যাচাই খুলুন'
                        : 'Apply Scale & Open Scale Check'}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
