import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Crop,
  Download,
  FileImage,
  FileText,
  ImagePlus,
  Maximize2,
  MousePointerClick,
  RotateCcw,
  Ruler,
  Undo2,
} from 'lucide-react';
import { CadDocument, RasterLayer } from '../core/cad/types';
import {
  BBox,
  getRasterLayerBBox,
  rasterPixelToWorld,
  solveRasterTransformFromTwoPoints,
  worldToRasterPixel,
} from '../core/cad/geometry';
import { Point2D, distance2D } from '../core/survey/coordinates';
import {
  MapScaleSpec,
  PantographPlotLayout,
  PaperOrientation,
  PaperSizeId,
  computePantographScalePlan,
  computePixelsPerFootFromMapScale,
  computePixelsPerInch,
  computeScaleFromBar,
  resolveMapScaleSpec,
} from '../core/survey/scale';
import {
  LinearUnit,
  formatNumber,
  getLinearUnitLabel,
  parseLocalizedNumber,
} from '../core/survey/units';
import {
  PantographRenderOptions,
  renderPantographSheet,
  resolvePantographRegionBBox,
} from '../adapters/pantograph';
import { ActiveTool } from './CadCanvas';
import { WizardFramework } from './WizardFramework';
import { Lang, getTranslations } from './i18n';

export interface PantographSessionProps {
  rasterId: string | null;
  onRasterIdChange: (id: string | null) => void;
  oldScaleInputMode: 'inchesPerMile' | 'rf' | 'barOnly';
  onOldScaleInputModeChange: (m: 'inchesPerMile' | 'rf' | 'barOnly') => void;
  oldInchesPerMile: string;
  onOldInchesPerMileChange: (v: string) => void;
  oldRfDenominator: string;
  onOldRfDenominatorChange: (v: string) => void;
  newScaleInputMode: 'inchesPerMile' | 'rf';
  onNewScaleInputModeChange: (m: 'inchesPerMile' | 'rf') => void;
  newInchesPerMile: string;
  onNewInchesPerMileChange: (v: string) => void;
  newRfDenominator: string;
  onNewRfDenominatorChange: (v: string) => void;
  areaMode: 'whole' | 'window';
  onAreaModeChange: (m: 'whole' | 'window') => void;
  windowBBox: BBox | null;
  onClearWindowBBox: () => void;
  paperSize: PaperSizeId;
  onPaperSizeChange: (s: PaperSizeId) => void;
  orientation: PaperOrientation | 'auto';
  onOrientationChange: (o: PaperOrientation | 'auto') => void;
  fitMode: 'true-scale' | 'fit-to-paper';
  onFitModeChange: (m: 'true-scale' | 'fit-to-paper') => void;
  includeVectors: boolean;
  onIncludeVectorsChange: (v: boolean) => void;
  onExportPng: (opts: PantographRenderOptions) => Promise<void>;
  onExportPdf: (opts: PantographRenderOptions) => Promise<void>;
  isExporting: boolean;
}

interface PantographWizardProps {
  doc: CadDocument;
  lang: Lang;
  step: number;
  onStepChange: (step: number) => void;
  pickedPoints: Point2D[];
  onClearPickedPoints: () => void;
  onSetTool: (tool: ActiveTool) => void;
  onAttachRasterFile: (file: File) => Promise<RasterLayer | null>;
  onUpdateRaster: (layer: RasterLayer) => void;
  scannerPixelsPerInch: number | null;
  onSaveScannerPpi?: (ppi: number | null) => void;
  orgInfo?: { organizationName?: string; phoneNumber?: string };
  session: PantographSessionProps;
  onJumpToWorkspace: () => void;
  onClose: () => void;
}

const CHAIN_CHIPS = [1, 2, 5, 10];
const IPM_PRESETS = [16, 32, 64, 80];
const RF_PRESETS = [3960, 1980, 1000, 500];

export const PantographWizard: React.FC<PantographWizardProps> = ({
  doc,
  lang,
  step,
  onStepChange,
  pickedPoints,
  onClearPickedPoints,
  onSetTool,
  onAttachRasterFile,
  onUpdateRaster,
  scannerPixelsPerInch,
  onSaveScannerPpi,
  orgInfo,
  session,
  onJumpToWorkspace,
  onClose,
}) => {
  const t = getTranslations(lang);

  // Step 1 local UI state for scale bar calibration & scanner map-scale
  const [calMethod, setCalMethod] = useState<'bar' | 'mapScale'>('bar');
  const [barValue, setBarValue] = useState('1');
  const [barUnit, setBarUnit] = useState<LinearUnit>('chain');
  const [saveScannerCheck, setSaveScannerCheck] = useState(false);
  const [calStatusMsg, setCalStatusMsg] = useState<string | null>(null);
  const [calErrorMsg, setCalErrorMsg] = useState('');

  // Step 4 preview render state
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewLayout, setPreviewLayout] = useState<PantographPlotLayout | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const activeRaster = useMemo(() => {
    return (
      doc.rasterLayers.find((r) => r.id === session.rasterId) ||
      doc.rasterLayers[0] ||
      null
    );
  }, [doc.rasterLayers, session.rasterId]);

  const parsedOldIpm = parseLocalizedNumber(session.oldInchesPerMile) ?? 16;
  const parsedOldRf = parseLocalizedNumber(session.oldRfDenominator) ?? 3960;
  const parsedNewIpm = parseLocalizedNumber(session.newInchesPerMile) ?? 32;
  const parsedNewRf = parseLocalizedNumber(session.newRfDenominator) ?? 1980;

  const oldScaleSpec: MapScaleSpec | null = useMemo(() => {
    if (session.oldScaleInputMode === 'inchesPerMile' && parsedOldIpm > 0) {
      return { kind: 'inchesPerMile', inchesPerMile: parsedOldIpm };
    }
    if (session.oldScaleInputMode === 'rf' && parsedOldRf > 0) {
      return { kind: 'rf', denominator: parsedOldRf };
    }
    return null;
  }, [parsedOldIpm, parsedOldRf, session.oldScaleInputMode]);

  const oldScaleResolved = useMemo(
    () => (oldScaleSpec ? resolveMapScaleSpec(oldScaleSpec) : null),
    [oldScaleSpec]
  );

  const newScaleSpec: MapScaleSpec | null = useMemo(() => {
    if (session.newScaleInputMode === 'inchesPerMile' && parsedNewIpm > 0) {
      return { kind: 'inchesPerMile', inchesPerMile: parsedNewIpm };
    }
    if (session.newScaleInputMode === 'rf' && parsedNewRf > 0) {
      return { kind: 'rf', denominator: parsedNewRf };
    }
    return null;
  }, [parsedNewIpm, parsedNewRf, session.newScaleInputMode]);

  const newScaleResolved = useMemo(
    () => (newScaleSpec ? resolveMapScaleSpec(newScaleSpec) : null),
    [newScaleSpec]
  );

  const scalePlan = useMemo(() => {
    if (!oldScaleSpec || !newScaleSpec) return null;
    return computePantographScalePlan(oldScaleSpec, newScaleSpec);
  }, [oldScaleSpec, newScaleSpec]);

  const oldScaleDisplayText = useMemo(() => {
    if (oldScaleResolved) return oldScaleResolved.label;
    if (activeRaster?.calibrated) {
      const pxPerFt = 1 / activeRaster.transform.scaleFtPerPx;
      return lang === 'bn'
        ? `স্কেল বার (${formatNumber(pxPerFt, 2, 'bn')} px/ফুট)`
        : `Scale bar (${pxPerFt.toFixed(2)} px/ft)`;
    }
    return lang === 'bn' ? 'অনির্ধারিত' : 'Calibrated map';
  }, [activeRaster, lang, oldScaleResolved]);

  const regionBBox = useMemo(() => {
    if (!activeRaster) return null;
    return resolvePantographRegionBBox(
      activeRaster,
      session.areaMode,
      session.windowBBox
    );
  }, [activeRaster, session.areaMode, session.windowBBox]);

  const renderOptions: PantographRenderOptions | null = useMemo(() => {
    if (!activeRaster || !newScaleResolved) return null;
    return {
      projectName: doc.name,
      raster: activeRaster,
      areaMode: session.areaMode,
      windowBBox: session.windowBBox,
      oldScaleText: oldScaleDisplayText,
      newScale: newScaleResolved,
      paperSize: session.paperSize,
      orientation: session.orientation,
      fitMode: session.fitMode,
      lang,
      entities: doc.entities,
      includeVectors: session.includeVectors,
      orgInfo,
    };
  }, [
    activeRaster,
    doc.entities,
    doc.name,
    lang,
    newScaleResolved,
    oldScaleDisplayText,
    orgInfo,
    session.areaMode,
    session.fitMode,
    session.includeVectors,
    session.orientation,
    session.paperSize,
    session.windowBBox,
  ]);

  // Render preview asynchronously whenever user enters Step 4 or Step 5 or adjusts sheet options
  useEffect(() => {
    if ((step !== 4 && step !== 5) || !renderOptions) return;
    let cancelled = false;
    setPreviewBusy(true);
    setPreviewError(null);
    renderPantographSheet({ ...renderOptions, dpi: 96 })
      .then((res) => {
        if (cancelled) return;
        setPreviewLayout(res.layout);
        setPreviewDataUrl(res.canvas.toDataURL('image/png'));
        setPreviewBusy(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewBusy(false);
        setPreviewError(
          err instanceof Error
            ? err.message
            : lang === 'bn'
            ? 'প্রিভিউ তৈরি করা যায়নি'
            : 'Failed to render preview'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [lang, renderOptions, step]);

  const handleUploadFile = async (file: File) => {
    setCalErrorMsg('');
    setCalStatusMsg(null);
    const layer = await onAttachRasterFile(file);
    if (layer) {
      session.onRasterIdChange(layer.id);
      session.onClearWindowBBox();
      onClearPickedPoints();
    }
  };

  const applyBarCalibration = () => {
    setCalErrorMsg('');
    setCalStatusMsg(null);
    if (!activeRaster) {
      setCalErrorMsg(
        lang === 'bn' ? 'প্রথমে একটি ম্যাপ ছবি খুলুন।' : 'Please open a map image first.'
      );
      return;
    }
    if (pickedPoints.length < 2) {
      setCalErrorMsg(
        lang === 'bn'
          ? 'ক্যানভাসে স্কেল বারের ২ প্রান্ত ট্যাপ করুন।'
          : 'Tap both ends of the scale bar on canvas first.'
      );
      return;
    }
    const val = parseLocalizedNumber(barValue);
    if (!val || val <= 0) {
      setCalErrorMsg(
        lang === 'bn' ? 'সঠিক দূরত্ব লিখুন।' : 'Enter a valid positive distance.'
      );
      return;
    }

    const p0 = pickedPoints[pickedPoints.length - 2];
    const p1 = pickedPoints[pickedPoints.length - 1];
    const currentDistFt = distance2D(p0, p1);
    const pixelDistance = currentDistFt / activeRaster.transform.scaleFtPerPx;
    const cal = computeScaleFromBar(pixelDistance, val, barUnit);
    if (!cal) {
      setCalErrorMsg(
        lang === 'bn'
          ? 'বিন্দু দুটি খুব কাছাকাছি — আবার দূরত্ব মেপে ট্যাপ করুন।'
          : 'Selected points are too close together.'
      );
      return;
    }

    const p0Pixel = worldToRasterPixel(p0, activeRaster.transform);
    const p1Pixel = worldToRasterPixel(p1, activeRaster.transform);

    const midW = {
      x: (p0.x + p1.x) / 2,
      y: (p0.y + p1.y) / 2,
    };
    const factor = cal.realDistanceFt / Math.max(1e-9, currentDistFt);
    const targetA = {
      x: midW.x + (p0.x - midW.x) * factor,
      y: midW.y + (p0.y - midW.y) * factor,
    };
    const targetB = {
      x: midW.x + (p1.x - midW.x) * factor,
      y: midW.y + (p1.y - midW.y) * factor,
    };
    const nextTransform = solveRasterTransformFromTwoPoints(
      p0Pixel,
      p1Pixel,
      targetA,
      targetB
    );

    const updatedLayer: RasterLayer = {
      ...activeRaster,
      transform: {
        ...activeRaster.transform,
        scaleFtPerPx: nextTransform?.scaleFtPerPx ?? cal.scaleFtPerPx,
        tx: nextTransform?.tx ?? activeRaster.transform.tx,
        ty: nextTransform?.ty ?? activeRaster.transform.ty,
      },
      calibrated: true,
    };
    onUpdateRaster(updatedLayer);

    if (saveScannerCheck && onSaveScannerPpi) {
      const ipm =
        session.oldScaleInputMode === 'inchesPerMile'
          ? parsedOldIpm
          : session.oldScaleInputMode === 'rf' && parsedOldRf > 0
          ? 63360 / parsedOldRf
          : 16;
      const ppi = computePixelsPerInch(cal.pixelsPerFoot, ipm);
      if (ppi) onSaveScannerPpi(ppi);
    }

    onClearPickedPoints();
    onSetTool('select');
    setCalStatusMsg(
      lang === 'bn'
        ? `স্কেল সেট হয়েছে: ${formatNumber(cal.pixelsPerFoot, 2, 'bn')} px/ফুট (${formatNumber(val, 2, 'bn')} ${getLinearUnitLabel(barUnit, 'bn')})`
        : `Scale calibrated: ${cal.pixelsPerFoot.toFixed(2)} px/ft (${val} ${getLinearUnitLabel(barUnit, 'en')})`
    );
  };

  const applyMapScaleDirect = (ipmValue: number) => {
    setCalErrorMsg('');
    setCalStatusMsg(null);
    if (!activeRaster) {
      setCalErrorMsg(
        lang === 'bn' ? 'প্রথমে একটি ম্যাপ ছবি খুলুন।' : 'Please open a map image first.'
      );
      return;
    }
    if (!scannerPixelsPerInch || scannerPixelsPerInch <= 0) {
      setCalErrorMsg(
        lang === 'bn'
          ? 'আগে একটি স্ক্যান ম্যাপে স্কেল বার ক্যালিব্রেট করে স্ক্যানার DPI সেভ করুন।'
          : 'Calibrate one scanned map via Scale Bar and save scanner PPI first.'
      );
      return;
    }
    const res = computePixelsPerFootFromMapScale(scannerPixelsPerInch, ipmValue);
    if (!res) {
      setCalErrorMsg(
        lang === 'bn' ? 'সঠিক স্কেল মান দিন।' : 'Invalid scale value.'
      );
      return;
    }

    const oldMid = rasterPixelToWorld(
      { x: activeRaster.widthPx / 2, y: activeRaster.heightPx / 2 },
      activeRaster.transform
    );
    const cosR = Math.cos(activeRaster.transform.rotationRad);
    const sinR = Math.sin(activeRaster.transform.rotationRad);
    const hw = (activeRaster.widthPx / 2) * res.scaleFtPerPx;
    const hh = -(activeRaster.heightPx / 2) * res.scaleFtPerPx;
    const tx = oldMid.x - (hw * cosR - hh * sinR);
    const ty = oldMid.y - (hw * sinR + hh * cosR);

    onUpdateRaster({
      ...activeRaster,
      transform: {
        ...activeRaster.transform,
        scaleFtPerPx: res.scaleFtPerPx,
        tx,
        ty,
      },
      calibrated: true,
    });
    session.onOldScaleInputModeChange('inchesPerMile');
    session.onOldInchesPerMileChange(String(ipmValue));
    setCalStatusMsg(
      lang === 'bn'
        ? `১ মাইল = ${formatNumber(ipmValue, 0, 'bn')}″ (${formatNumber(res.pixelsPerFoot, 2, 'bn')} px/ফুট) প্রয়োগ হয়েছে`
        : `Applied 1 mile = ${ipmValue}″ (${res.pixelsPerFoot.toFixed(2)} px/ft)`
    );
  };

  let instruction = '';
  let hint = '';
  let canGoNext = true;
  let nextLabel: string | undefined;
  let onBack: (() => void) | undefined;
  let onNext: (() => void) | undefined;
  let body: React.ReactNode = null;

  if (step === 1) {
    instruction =
      lang === 'bn'
        ? 'ম্যাপ ছবি খুলুন এবং তার বর্তমান (পুরোনো) স্কেল সেট করুন'
        : 'Open a map image and set its current scale';
    hint =
      lang === 'bn'
        ? 'ফোনে তোলা ছবি হলে স্কেল বারের ২ প্রান্ত ট্যাপ করুন। একই স্ক্যানারে স্ক্যান হলে "১ মাইল = N″" ট্যাব ব্যবহার করতে পারেন।'
        : 'For camera photos, calibrate with the 2-point scale bar. Scanned maps with saved DPI can apply 1 mile = N inches directly.';
    canGoNext = Boolean(activeRaster && activeRaster.calibrated);
    onNext = () => {
      onSetTool('select');
      onStepChange(2);
    };

    const barPixelDist =
      activeRaster && pickedPoints.length >= 2
        ? distance2D(
            pickedPoints[pickedPoints.length - 2],
            pickedPoints[pickedPoints.length - 1]
          ) / activeRaster.transform.scaleFtPerPx
        : null;

    body = (
      <div className="space-y-3">
        {/* Upload Gallery / Camera */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#115E59] px-3 text-xs font-semibold text-white">
            <ImagePlus className="h-4 w-4" />
            <span>{lang === 'bn' ? 'গ্যালারি থেকে ম্যাপ' : 'Open Map File'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadFile(f);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#115E59] bg-[#115E59]/8 dark:bg-teal-950/30 px-3 text-xs font-semibold text-[#115E59] dark:text-teal-300">
            <Camera className="h-4 w-4" />
            <span>{lang === 'bn' ? 'ক্যামেরা দিয়ে তুলুন' : 'Take Photo'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadFile(f);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        {/* Select existing raster if multiple */}
        {doc.rasterLayers.length > 1 && (
          <select
            value={activeRaster?.id || ''}
            onChange={(e) => session.onRasterIdChange(e.target.value)}
            className="w-full min-h-[38px] rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-medium"
          >
            {doc.rasterLayers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.widthPx}×{r.heightPx} px)
              </option>
            ))}
          </select>
        )}

        {activeRaster && (
          <div className="space-y-2.5">
            {/* Status strip */}
            <div
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                activeRaster.calibrated
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                  : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
              }`}
            >
              <span className="truncate font-semibold flex items-center gap-1.5">
                {activeRaster.calibrated ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{activeRaster.name}</span>
              </span>
              <span className="shrink-0 font-mono-num tabular-nums">
                {activeRaster.calibrated
                  ? `${formatNumber(1 / activeRaster.transform.scaleFtPerPx, 2, lang)} px/ft`
                  : lang === 'bn'
                  ? 'স্কেল বাকি'
                  : 'Uncalibrated'}
              </span>
            </div>

            {/* Calibration Method Tabs */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#EAECE7] dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setCalMethod('bar')}
                className={`min-h-[36px] rounded-lg text-xs font-semibold ${
                  calMethod === 'bar'
                    ? 'bg-white dark:bg-slate-900 text-[#115E59] dark:text-teal-300 shadow-sm'
                    : 'text-[#4A5550] dark:text-slate-400'
                }`}
              >
                {lang === 'bn' ? 'স্কেল বার দিয়ে' : 'Scale Bar (2 pts)'}
              </button>
              <button
                type="button"
                onClick={() => setCalMethod('mapScale')}
                className={`min-h-[36px] rounded-lg text-xs font-semibold ${
                  calMethod === 'mapScale'
                    ? 'bg-white dark:bg-slate-900 text-[#115E59] dark:text-teal-300 shadow-sm'
                    : 'text-[#4A5550] dark:text-slate-400'
                }`}
              >
                {lang === 'bn' ? '১ মাইল = N ইঞ্চি' : '1 mile = N inches'}
              </button>
            </div>

            {calMethod === 'bar' ? (
              <div className="space-y-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearPickedPoints();
                      onSetTool('pick-point');
                      onJumpToWorkspace();
                    }}
                    className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] px-3 text-xs font-semibold text-white"
                  >
                    <MousePointerClick className="h-4 w-4" />
                    <span>
                      {lang === 'bn'
                        ? `স্কেল বারে ২ প্রান্ত ট্যাপ করুন (${formatNumber(Math.min(2, pickedPoints.length), 0, lang)}/২)`
                        : `Tap 2 Scale Bar Ends (${Math.min(2, pickedPoints.length)}/2)`}
                    </span>
                  </button>
                  {pickedPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearPickedPoints}
                      aria-label={t.actions.cancel}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {barPixelDist !== null && (
                  <p className="text-[11px] font-medium text-[#115E59] dark:text-teal-300 tabular-nums">
                    {lang === 'bn'
                      ? `নির্বাচিত স্প্যান: ${formatNumber(barPixelDist, 1, 'bn')} পিক্সেল`
                      : `Selected span: ${barPixelDist.toFixed(1)} px`}
                  </p>
                )}

                {/* Quick Chain Chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {CHAIN_CHIPS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        setBarValue(String(ch));
                        setBarUnit('chain');
                      }}
                      className={`min-h-[32px] rounded-lg border px-2.5 text-xs font-semibold tabular-nums ${
                        barUnit === 'chain' && parseLocalizedNumber(barValue) === ch
                          ? 'border-[#115E59] bg-[#115E59] text-white'
                          : 'border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      {formatNumber(ch, 0, lang)} {lang === 'bn' ? 'চেইন' : 'ch'}
                    </button>
                  ))}
                </div>

                {/* Custom distance & unit */}
                <div className="grid grid-cols-5 gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={barValue}
                    onChange={(e) => setBarValue(e.target.value)}
                    placeholder="1"
                    className="col-span-2 min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-sm font-mono-num"
                  />
                  <select
                    value={barUnit}
                    onChange={(e) => setBarUnit(e.target.value as LinearUnit)}
                    className="col-span-2 min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                  >
                    {(['chain', 'ft', 'hat', 'gaj', 'm'] as LinearUnit[]).map((u) => (
                      <option key={u} value={u}>
                        {getLinearUnitLabel(u, lang)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyBarCalibration}
                    disabled={pickedPoints.length < 2}
                    className="col-span-1 min-h-[38px] rounded-xl bg-[#115E59] px-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {lang === 'bn' ? 'সেট' : 'Set'}
                  </button>
                </div>

                {/* Save scanner PPI option */}
                <label className="flex items-center gap-2 text-[11px] text-[#4A5550] dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={saveScannerCheck}
                    onChange={(e) => setSaveScannerCheck(e.target.checked)}
                    className="h-4 w-4 accent-[#115E59]"
                  />
                  <span>
                    {lang === 'bn'
                      ? 'স্ক্যান করা ম্যাপ হলে স্ক্যানার DPI সংরক্ষণ করুন'
                      : 'Save scanner DPI if this is a scanned map'}
                  </span>
                </label>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-2.5">
                {scannerPixelsPerInch ? (
                  <>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium tabular-nums">
                      {lang === 'bn'
                        ? `সংরক্ষিত স্ক্যানার রেজোলিউশন: ${formatNumber(scannerPixelsPerInch, 1, 'bn')} px/ইঞ্চি`
                        : `Saved scanner resolution: ${scannerPixelsPerInch.toFixed(1)} px/inch`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[16, 32, 64].map((ipm) => (
                        <button
                          key={ipm}
                          type="button"
                          onClick={() => applyMapScaleDirect(ipm)}
                          className="min-h-[36px] rounded-xl border border-[#115E59]/40 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-[#115E59] dark:text-teal-300"
                        >
                          {formatNumber(ipm, 0, lang)}″ = {lang === 'bn' ? '১ মাইল' : '1 mile'}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                    {lang === 'bn'
                      ? 'মোবাইল ক্যামেরায় তোলা ছবির জন্য প্রতিবার স্কেল বার দিয়ে মাপ সেট করতে হয়। স্ক্যানার ব্যবহার করলে একবার স্কেল বার ট্যাবে "স্ক্যানার DPI সংরক্ষণ করুন" টিক দিয়ে সেভ করুন।'
                      : 'Phone photos always require Scale Bar calibration. For flatbed scanners, calibrate once on the Scale Bar tab with "Save scanner DPI" checked.'}
                  </p>
                )}
              </div>
            )}

            {/* Nominal Source Map Scale Note Selector */}
            <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#141A17] dark:text-slate-200">
                  {lang === 'bn' ? 'বর্তমান (পুরোনো) নকশার স্কেল নোট' : 'Original Map Scale Note'}
                </span>
                <div className="flex gap-1">
                  {(['inchesPerMile', 'rf', 'barOnly'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => session.onOldScaleInputModeChange(m)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        session.oldScaleInputMode === m
                          ? 'bg-[#115E59] text-white'
                          : 'bg-[#EAECE7] dark:bg-slate-800 text-[#4A5550] dark:text-slate-300'
                      }`}
                    >
                      {m === 'inchesPerMile'
                        ? lang === 'bn'
                          ? 'ইঞ্চি/মাইল'
                          : '″/mile'
                        : m === 'rf'
                        ? '1:N'
                        : lang === 'bn'
                        ? 'শুধু বার'
                        : 'Bar only'}
                    </button>
                  ))}
                </div>
              </div>

              {session.oldScaleInputMode === 'inchesPerMile' && (
                <div className="flex items-center gap-1.5">
                  {[16, 32, 64].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => session.onOldInchesPerMileChange(String(v))}
                      className={`min-h-[32px] rounded-lg border px-2 text-xs font-semibold tabular-nums ${
                        parsedOldIpm === v
                          ? 'border-[#115E59] bg-[#115E59]/12 text-[#115E59] dark:text-teal-300'
                          : 'border-[#D4DBD6] dark:border-slate-700'
                      }`}
                    >
                      {formatNumber(v, 0, lang)}″
                    </button>
                  ))}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={session.oldInchesPerMile}
                    onChange={(e) => session.onOldInchesPerMileChange(e.target.value)}
                    className="w-20 min-h-[32px] rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-transparent px-2 text-xs font-mono-num"
                    aria-label="Original inches per mile"
                  />
                  <span className="text-[11px] text-[#4A5550] dark:text-slate-400">
                    {lang === 'bn' ? '″ = ১ মাইল' : '″ = 1 mi'}
                  </span>
                </div>
              )}

              {session.oldScaleInputMode === 'rf' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">1 :</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={session.oldRfDenominator}
                    onChange={(e) => session.onOldRfDenominatorChange(e.target.value)}
                    className="flex-1 min-h-[32px] rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-transparent px-2.5 text-xs font-mono-num"
                    placeholder="3960"
                  />
                  {oldScaleResolved && (
                    <span className="text-[11px] text-[#4A5550] dark:text-slate-400 tabular-nums">
                      ({formatNumber(oldScaleResolved.inchesPerMile, 1, lang)}″/mi)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {calStatusMsg && (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {calStatusMsg}
          </p>
        )}
        {calErrorMsg && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            {calErrorMsg}
          </p>
        )}
      </div>
    );
  } else if (step === 2) {
    instruction =
      lang === 'bn'
        ? 'নতুন যে স্কেলে রি-প্লট করতে চান তা লিখুন বা বাছুন'
        : 'Enter the target scale for re-plotting';
    hint =
      lang === 'bn'
        ? 'উদাহরণ: ১৬″ = ১ মাইল (১:৩৯৬০) থেকে ৩২″ = ১ মাইল (১:১৯৮০) করলে নকশা ২× বড় হয়ে যাবে।'
        : 'Example: Going from 16″ = 1 mile (1:3960) to 32″ = 1 mile (1:1980) enlarges the map 2.0× on paper.';
    onBack = () => onStepChange(1);
    canGoNext = Boolean(newScaleResolved);
    onNext = () => onStepChange(3);

    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => session.onNewScaleInputModeChange('inchesPerMile')}
            className={`min-h-[40px] rounded-xl border text-xs font-semibold ${
              session.newScaleInputMode === 'inchesPerMile'
                ? 'border-[#115E59] bg-[#115E59] text-white'
                : 'border-[#D4DBD6] dark:border-slate-700'
            }`}
          >
            {lang === 'bn' ? '১ মাইল = N ইঞ্চি' : 'N inches = 1 mile'}
          </button>
          <button
            type="button"
            onClick={() => session.onNewScaleInputModeChange('rf')}
            className={`min-h-[40px] rounded-xl border text-xs font-semibold ${
              session.newScaleInputMode === 'rf'
                ? 'border-[#115E59] bg-[#115E59] text-white'
                : 'border-[#D4DBD6] dark:border-slate-700'
            }`}
          >
            {lang === 'bn' ? 'অনুপাত (১:N)' : 'Ratio (1:N)'}
          </button>
        </div>

        {session.newScaleInputMode === 'inchesPerMile' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {IPM_PRESETS.map((ipm) => (
                <button
                  key={ipm}
                  type="button"
                  onClick={() => session.onNewInchesPerMileChange(String(ipm))}
                  className={`min-h-[38px] rounded-xl border text-xs font-semibold tabular-nums ${
                    parsedNewIpm === ipm
                      ? 'border-[#115E59] bg-[#115E59]/12 text-[#115E59] dark:text-teal-300'
                      : 'border-[#D4DBD6] dark:border-slate-700'
                  }`}
                >
                  {formatNumber(ipm, 0, lang)}″
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#4A5550] dark:text-slate-300">
                {lang === 'bn' ? '১ মাইল =' : '1 mile ='}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={session.newInchesPerMile}
                onChange={(e) => session.onNewInchesPerMileChange(e.target.value)}
                className="flex-1 min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
              />
              <span className="text-xs font-semibold text-[#4A5550] dark:text-slate-300">
                {lang === 'bn' ? 'ইঞ্চি' : 'inches'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {RF_PRESETS.map((denom) => (
                <button
                  key={denom}
                  type="button"
                  onClick={() => session.onNewRfDenominatorChange(String(denom))}
                  className={`min-h-[38px] rounded-xl border text-xs font-semibold tabular-nums ${
                    parsedNewRf === denom
                      ? 'border-[#115E59] bg-[#115E59]/12 text-[#115E59] dark:text-teal-300'
                      : 'border-[#D4DBD6] dark:border-slate-700'
                  }`}
                >
                  1:{formatNumber(denom, 0, lang)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">1 :</span>
              <input
                type="text"
                inputMode="decimal"
                value={session.newRfDenominator}
                onChange={(e) => session.onNewRfDenominatorChange(e.target.value)}
                className="flex-1 min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
              />
            </div>
          </div>
        )}

        {/* Conversion summary readout */}
        {newScaleResolved && (
          <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/80 p-3 space-y-1.5 text-xs tabular-nums">
            <div className="flex items-center justify-between">
              <span className="text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'নতুন স্কেল অনুপাত:' : 'Target Scale:'}
              </span>
              <strong className="text-[#115E59] dark:text-teal-300">
                1:{formatNumber(Math.round(newScaleResolved.rfDenominator), 0, lang)} (
                {formatNumber(newScaleResolved.inchesPerMile, 1, lang)}″ ={' '}
                {lang === 'bn' ? '১ মাইল' : '1 mi'})
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'কাগজে ১ ইঞ্চি =' : '1 inch on paper ='}
              </span>
              <strong>
                {formatNumber(newScaleResolved.feetPerInchOnPaper, 2, lang)}{' '}
                {lang === 'bn' ? 'ফুট' : 'ft'} (
                {formatNumber(newScaleResolved.feetPerInchOnPaper / 66, 2, lang)}{' '}
                {lang === 'bn' ? 'চেইন' : 'ch'})
              </strong>
            </div>
            {scalePlan && (
              <div className="pt-1 border-t border-[#E5E9E4] dark:border-slate-700 flex items-center justify-between">
                <span className="text-[#4A5550] dark:text-slate-400 flex items-center gap-1">
                  <span>{oldScaleDisplayText}</span>
                  <ArrowRight className="h-3 w-3" />
                </span>
                <strong
                  className={
                    scalePlan.mode === 'enlarge'
                      ? 'text-[#0F5132] dark:text-emerald-400'
                      : scalePlan.mode === 'reduce'
                      ? 'text-[#B45309] dark:text-amber-400'
                      : ''
                  }
                >
                  {formatNumber(scalePlan.paperScaleRatio, 2, lang)}×{' '}
                  {scalePlan.mode === 'enlarge'
                    ? lang === 'bn'
                      ? 'বড়'
                      : 'Enlarge'
                    : scalePlan.mode === 'reduce'
                    ? lang === 'bn'
                      ? 'ছোট'
                      : 'Reduce'
                    : lang === 'bn'
                    ? 'সমান'
                    : 'Same'}{' '}
                  ({lang === 'bn' ? 'ক্ষেত্র' : 'area'}{' '}
                  {formatNumber(scalePlan.paperAreaRatio, 2, lang)}×)
                </strong>
              </div>
            )}
          </div>
        )}
      </div>
    );
  } else if (step === 3) {
    instruction =
      lang === 'bn'
        ? 'রি-প্লট করার এলাকা বেছে নিন (পুরো ম্যাপ বা নির্দিষ্ট উইন্ডো)'
        : 'Choose the area to re-plot (whole map or custom window)';
    hint =
      lang === 'bn'
        ? 'বড় নকশাকে ৩২″ বা ৬৪″ স্কেলে A4 কাগজে আঁকতে হলে কেবল দরকারি দাগের চারপাশে একটি উইন্ডো আঁকুন।'
        : 'When enlarging to 32″ or 64″ scale onto A4 paper, draw a crop window around the required plots.';
    onBack = () => onStepChange(2);
    canGoNext =
      Boolean(activeRaster) &&
      (session.areaMode === 'whole' || Boolean(session.windowBBox));
    nextLabel = lang === 'bn' ? 'প্রিভিউ দেখুন' : 'Preview Sheet';
    onNext = () => {
      onSetTool('select');
      onStepChange(4);
    };

    const fullBox = activeRaster ? getRasterLayerBBox(activeRaster) : null;
    const activeW = regionBBox ? Math.max(0, regionBBox.maxX - regionBBox.minX) : 0;
    const activeH = regionBBox ? Math.max(0, regionBBox.maxY - regionBBox.minY) : 0;
    const activeAreaShotok = (activeW * activeH) / 435.6;

    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              onSetTool('select');
              session.onAreaModeChange('whole');
            }}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border px-3 text-xs font-semibold ${
              session.areaMode === 'whole'
                ? 'border-[#115E59] bg-[#115E59] text-white'
                : 'border-[#D4DBD6] dark:border-slate-700'
            }`}
          >
            <Maximize2 className="h-4 w-4" />
            <span>{lang === 'bn' ? 'পুরো ম্যাপ' : 'Whole Map'}</span>
          </button>

          <button
            type="button"
            onClick={() => session.onAreaModeChange('window')}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border px-3 text-xs font-semibold ${
              session.areaMode === 'window'
                ? 'border-[#115E59] bg-[#115E59] text-white'
                : 'border-[#D4DBD6] dark:border-slate-700'
            }`}
          >
            <Crop className="h-4 w-4" />
            <span>{lang === 'bn' ? 'উইন্ডো আঁকুন' : 'Draw Window'}</span>
          </button>
        </div>

        {session.areaMode === 'window' && (
          <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onSetTool('pantograph-window');
                  onJumpToWorkspace();
                }}
                className="flex-1 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] px-3 text-xs font-bold text-white"
              >
                <Crop className="h-4 w-4" />
                <span>
                  {session.windowBBox
                    ? lang === 'bn'
                      ? 'নতুন উইন্ডো আঁকুন'
                      : 'Redraw Window'
                    : lang === 'bn'
                    ? 'ম্যাপে ২ কোণা ট্যাপ/ড্র্যাগ করে উইন্ডো আঁকুন'
                    : 'Draw Crop Window on Map'}
                </span>
              </button>
              {session.windowBBox && (
                <button
                  type="button"
                  onClick={session.onClearWindowBBox}
                  aria-label={t.actions.delete}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D4DBD6] dark:border-slate-700"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {!session.windowBBox ? (
              <p className="text-[11px] text-[#4A5550] dark:text-slate-400">
                {lang === 'bn'
                  ? 'ক্যানভাসে গিয়ে প্রয়োজনীয় অংশের ওপর-বাম ও নিচ-ডান কোণায় ট্যাপ করুন বা আঙুল টেনে আয়তক্ষেত্র আঁকুন।'
                  : 'Tap 2 opposite corners or drag a box over the area you want to re-plot.'}
              </p>
            ) : (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {lang === 'bn'
                  ? `নির্বাচিত উইন্ডো: ${formatNumber(activeW, 1, 'bn')} × ${formatNumber(activeH, 1, 'bn')} ফুট (${formatNumber(activeAreaShotok, 1, 'bn')} শতক)`
                  : `Selected window: ${activeW.toFixed(1)} × ${activeH.toFixed(1)} ft (${activeAreaShotok.toFixed(1)} shotok)`}
              </p>
            )}
          </div>
        )}

        {session.areaMode === 'whole' && fullBox && (
          <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 px-3 py-2.5 text-xs tabular-nums flex items-center justify-between">
            <span className="text-[#4A5550] dark:text-slate-400">
              {lang === 'bn' ? 'পুরো ম্যাপের বিস্তৃতি:' : 'Full map extent:'}
            </span>
            <strong>
              {formatNumber(fullBox.maxX - fullBox.minX, 0, lang)} ×{' '}
              {formatNumber(fullBox.maxY - fullBox.minY, 0, lang)}{' '}
              {lang === 'bn' ? 'ফুট' : 'ft'}
            </strong>
          </div>
        )}
      </div>
    );
  } else if (step === 4) {
    instruction =
      lang === 'bn'
        ? 'নতুন স্কেলে কাগজের মাপ ও প্রিভিউ যাচাই করুন'
        : 'Preview re-plotted map and choose paper size';
    hint =
      lang === 'bn'
        ? 'প্রিন্টের পর স্কেল যেন ১০০% সঠিক থাকে সেজন্য "আসল স্কেল" নির্বাচন করুন; বড় এলাকা এক পাতায় ধরতে "কাগজে ফিট" ব্যবহার করুন।'
        : 'Use "True Scale" to keep exact inches on printout, or "Fit to Paper" to fit a large region onto one sheet.';
    onBack = () => onStepChange(3);
    canGoNext = Boolean(previewDataUrl && !previewBusy);
    nextLabel = lang === 'bn' ? 'এক্সপোর্ট ধাপে যান' : 'Go to Export';
    onNext = () => onStepChange(5);

    body = (
      <div className="space-y-2.5">
        {/* Paper size + orientation + fit mode controls */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['a4', 'a3', 'letter', 'legal'] as PaperSizeId[]).map((ps) => (
            <button
              key={ps}
              type="button"
              onClick={() => session.onPaperSizeChange(ps)}
              className={`min-h-[34px] rounded-xl border text-xs font-bold uppercase ${
                session.paperSize === ps
                  ? 'border-[#115E59] bg-[#115E59] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {ps}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ['auto', lang === 'bn' ? 'অটো' : 'Auto'],
              ['portrait', lang === 'bn' ? 'লম্বা' : 'Portrait'],
              ['landscape', lang === 'bn' ? 'আড়াআড়ি' : 'Landscape'],
            ] as const
          ).map(([ori, lbl]) => (
            <button
              key={ori}
              type="button"
              onClick={() => session.onOrientationChange(ori)}
              className={`min-h-[32px] rounded-lg border text-[11px] font-semibold ${
                session.orientation === ori
                  ? 'border-[#0F5132] bg-[#0F5132]/12 text-[#0F5132] dark:text-emerald-300'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="grid flex-1 grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => session.onFitModeChange('true-scale')}
              className={`min-h-[34px] rounded-lg border px-2 text-[11px] font-semibold ${
                session.fitMode === 'true-scale'
                  ? 'border-[#115E59] bg-[#115E59] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? 'আসল স্কেল (True)' : 'True Scale'}
            </button>
            <button
              type="button"
              onClick={() => session.onFitModeChange('fit-to-paper')}
              className={`min-h-[34px] rounded-lg border px-2 text-[11px] font-semibold ${
                session.fitMode === 'fit-to-paper'
                  ? 'border-[#115E59] bg-[#115E59] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? 'কাগজে ফিট' : 'Fit to Paper'}
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap">
            <input
              type="checkbox"
              checked={session.includeVectors}
              onChange={(e) => session.onIncludeVectorsChange(e.target.checked)}
              className="h-4 w-4 accent-[#115E59]"
            />
            <span>{lang === 'bn' ? 'দাগসহ' : 'Vectors'}</span>
          </label>
        </div>

        {/* True-scale overflow info */}
        {previewLayout && !previewLayout.fitsAtTrueScale && (
          <div
            className={`rounded-xl border px-3 py-2 text-[11px] flex items-start gap-2 ${
              previewLayout.effectiveFitMode === 'true-scale'
                ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                : 'border-sky-300 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200'
            }`}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {previewLayout.effectiveFitMode === 'true-scale'
                ? lang === 'bn'
                  ? `আসল স্কেলে ${formatNumber(previewLayout.requiredWidthIn, 1, 'bn')}″×${formatNumber(previewLayout.requiredHeightIn, 1, 'bn')}″ কাগজ লাগে (প্রিন্ট এলাকা ${formatNumber(previewLayout.printableWidthIn, 1, 'bn')}″×${formatNumber(previewLayout.printableHeightIn, 1, 'bn')}″)। মাঝের অংশ আসল স্কেলে কাটা হয়েছে — অথবা "কাগজে ফিট" বা A3 বেছে নিন।`
                  : `True scale needs ${previewLayout.requiredWidthIn.toFixed(1)}″×${previewLayout.requiredHeightIn.toFixed(1)}″ (printable ${previewLayout.printableWidthIn.toFixed(1)}″×${previewLayout.printableHeightIn.toFixed(1)}″). Centered region shown at true scale — or switch to Fit-to-Paper / A3.`
                : lang === 'bn'
                ? `কাগজে ফিট মোডে স্কেল বার স্বয়ংক্রিয়ভাবে ~${formatNumber(previewLayout.plottedInchesPerMile, 1, 'bn')}″ = ১ মাইল অনুযায়ী সমন্বিত হয়েছে।`
                : `Fit-to-Paper adjusted graphic scale bar to ~${previewLayout.plottedInchesPerMile.toFixed(1)}″ = 1 mile.`}
            </span>
          </div>
        )}

        {/* Resampled Sheet Preview */}
        <div className="rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#EAECE7] dark:bg-slate-950 p-2 flex items-center justify-center min-h-[190px] max-h-[270px] overflow-hidden">
          {previewBusy ? (
            <div className="flex items-center gap-2 text-xs text-[#4A5550] dark:text-slate-300">
              <Ruler className="h-4 w-4 animate-pulse text-[#115E59]" />
              <span>
                {lang === 'bn'
                  ? 'মূল ছবি থেকে রিস্যাম্পল প্রিভিউ তৈরি হচ্ছে…'
                  : 'Resampling original raster preview…'}
              </span>
            </div>
          ) : previewError ? (
            <p className="text-xs text-red-600">{previewError}</p>
          ) : previewDataUrl ? (
            <img
              src={previewDataUrl}
              alt="Pantograph sheet preview"
              className="max-h-[250px] w-auto rounded-lg shadow-md object-contain border border-slate-300 dark:border-slate-700"
            />
          ) : null}
        </div>
      </div>
    );
  } else {
    instruction =
      lang === 'bn'
        ? 'রি-স্কেল করা ম্যাপ ছবি (PNG) বা PDF হিসেবে সেভ করুন'
        : 'Export re-scaled map as high-res PNG or PDF';
    hint =
      lang === 'bn'
        ? 'মূল হাই-রেজোলিউশন ছবি থেকে রিস্যাম্পল করা হবে; সাথে সঠিক স্কেল বার ও পুরোনো–নতুন স্কেল নোট থাকবে।'
        : 'Resampled directly from the original full-resolution image with accurate scale bar and old/new scale notes.';
    onBack = () => onStepChange(4);
    canGoNext = false;

    body = (
      <div className="space-y-3">
        <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/80 p-3 space-y-1.5 text-xs tabular-nums">
          <div className="flex items-center justify-between">
            <span className="text-[#4A5550] dark:text-slate-400">
              {lang === 'bn' ? 'পুরোনো স্কেল:' : 'Old Scale:'}
            </span>
            <strong className="truncate max-w-[200px]">{oldScaleDisplayText}</strong>
          </div>
          {newScaleResolved && (
            <div className="flex items-center justify-between">
              <span className="text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'নতুন স্কেল:' : 'New Scale:'}
              </span>
              <strong className="text-[#115E59] dark:text-teal-300">
                {newScaleResolved.label}
              </strong>
            </div>
          )}
          {previewLayout && (
            <div className="flex items-center justify-between">
              <span className="text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'কাগজ ও স্কেল বার:' : 'Sheet & Scale Bar:'}
              </span>
              <strong>
                {previewLayout.paper.label} (
                {previewLayout.paper.orientation === 'landscape'
                  ? lang === 'bn'
                    ? 'আড়াআড়ি'
                    : 'Landscape'
                  : lang === 'bn'
                  ? 'লম্বা'
                  : 'Portrait'}
                ) · {formatNumber(previewLayout.scaleBarFt, 0, lang)}{' '}
                {lang === 'bn' ? 'ফুট' : 'ft'}
              </strong>
            </div>
          )}
          {activeRaster && (
            <div className="flex items-center justify-between">
              <span className="text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'উৎস ছবির মান:' : 'Source Resolution:'}
              </span>
              <span>
                {formatNumber(activeRaster.widthPx, 0, lang)} ×{' '}
                {formatNumber(activeRaster.heightPx, 0, lang)} px
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={!renderOptions || session.isExporting}
            onClick={() => {
              if (renderOptions) void session.onExportPng(renderOptions);
            }}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#115E59] bg-white dark:bg-slate-900 px-3 text-xs font-bold text-[#115E59] dark:text-teal-300 disabled:opacity-40"
          >
            <FileImage className="h-4 w-4" />
            <span>
              {session.isExporting
                ? lang === 'bn'
                  ? 'তৈরি হচ্ছে…'
                  : 'Exporting…'
                : lang === 'bn'
                ? 'ছবি (PNG) সেভ'
                : 'Export PNG'}
            </span>
          </button>

          <button
            type="button"
            disabled={!renderOptions || session.isExporting}
            onClick={() => {
              if (renderOptions) void session.onExportPdf(renderOptions);
            }}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-40"
          >
            <FileText className="h-4 w-4" />
            <span>
              {session.isExporting
                ? lang === 'bn'
                  ? 'তৈরি হচ্ছে…'
                  : 'Exporting…'
                : lang === 'bn'
                ? 'PDF এক্সপোর্ট'
                : 'Export PDF'}
            </span>
          </button>
        </div>

        <p className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <Download className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {lang === 'bn'
              ? 'সঠিক মাপে প্রিন্ট পেতে PDF প্রিন্টার সেটিংসে "Actual Size / 100%" বেছে নিন (Fit-to-page বন্ধ রাখুন)।'
              : 'When printing the exported PDF, select "Actual Size (100%)" in your print dialog to preserve exact scale.'}
          </span>
        </p>
      </div>
    );
  }

  return (
    <WizardFramework
      title={t.wizards.pantograph.title}
      icon={<Maximize2 className="h-4 w-4 text-[#115E59] dark:text-teal-400" />}
      currentStep={step}
      totalSteps={5}
      instruction={instruction}
      hint={hint || undefined}
      canGoBack={step > 1}
      canGoNext={canGoNext}
      nextLabel={nextLabel}
      onBack={onBack}
      onNext={onNext}
      onJumpToWorkspace={onJumpToWorkspace}
      onClose={onClose}
      lang={lang}
    >
      {body}
    </WizardFramework>
  );
};
