import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  CheckCircle2,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileImage,
  Hand,
  ImagePlus,
  Layers,
  Lock,
  MousePointerClick,
  Pencil,
  RotateCcw,
  RotateCw,
  Ruler,
  ShieldAlert,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  AlignmentPair,
  CadDocument,
  PolygonEntity,
  RasterLayer,
} from '../core/cad/types';
import {
  getRasterLayerBBox,
  rasterPixelToWorld,
  solveRasterTransformFromTwoPoints,
  worldToRasterPixel,
} from '../core/cad/geometry';
import {
  computeJoinedExportGeometry,
  computeJoinedWorldExtent,
} from '../core/cad/mapJointMath';
import { computeAreaBreakdown, polygonAreaSqFt } from '../core/survey/area';
import { Point2D, distance2D } from '../core/survey/coordinates';
import {
  computePixelsPerFootFromMapScale,
  computePixelsPerInch,
  computeScaleFromBar,
} from '../core/survey/scale';
import {
  LinearUnit,
  formatNumber,
  getLinearUnitLabel,
  parseLocalizedNumber,
} from '../core/survey/units';
import {
  JoinedExportResolution,
  JoinedMapRenderOptions,
  renderJoinedMapCanvas,
  resolutionToMaxDimPx,
} from '../adapters/mapJoint';
import { ActiveTool } from './CadCanvas';
import { WizardFramework } from './WizardFramework';
import { Lang, getTranslations } from './i18n';

export interface MapJointSessionProps {
  sheetARasterId: string | null;
  onSheetARasterIdChange: (id: string | null) => void;
  sheetBRasterId: string | null;
  onSheetBRasterIdChange: (id: string | null) => void;
  pairPhase: 'a' | 'b';
  onSetPairPhase: (phase: 'a' | 'b') => void;
  onUndoLastPairTap: () => void;
  onDeletePair: (pairId: string) => void;
  onClearAllPairs: () => void;
  autoFocusTap: boolean;
  onAutoFocusTapChange: (v: boolean) => void;
  onReapplyAutoAlignment: () => void;
  onStartDragSheetB: () => void;
  mergedLocked: boolean;
  onMergeKeepLayers: () => void;
  onStartCrossSheetMeasure: (kind: 'area' | 'distance') => void;
  exportResolution: JoinedExportResolution;
  onExportResolutionChange: (res: JoinedExportResolution) => void;
  exportIncludeVectors: boolean;
  onExportIncludeVectorsChange: (v: boolean) => void;
  exportIncludeAnnotations: boolean;
  onExportIncludeAnnotationsChange: (v: boolean) => void;
  onExportImage: (
    opts: JoinedMapRenderOptions & { format: 'png' | 'jpeg' }
  ) => Promise<void>;
  isExporting: boolean;
}

interface MapJointWizardProps {
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
  session: MapJointSessionProps;
  onJumpToWorkspace: () => void;
  onClose: () => void;
}

const CHAIN_CHIPS = [1, 2, 5, 10];

export const MapJointWizard: React.FC<MapJointWizardProps> = ({
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

  // Step 1 scale calibration state
  const [calMethod, setCalMethod] = useState<'bar' | 'mapScale'>('bar');
  const [barDist, setBarDist] = useState('1');
  const [barUnit, setBarUnit] = useState<LinearUnit>('chain');
  const [saveScannerCheck, setSaveScannerCheck] = useState(false);
  const [nominalIpm, setNominalIpm] = useState('16');
  const [calErrorMsg, setCalErrorMsg] = useState('');
  const [calStatusMsg, setCalStatusMsg] = useState<string | null>(null);

  // Step 5 nudge step size
  const [nudgeStepFt, setNudgeStepFt] = useState<number>(1);

  // Step 7 preview thumbnail
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const sheetA =
    doc.rasterLayers.find((r) => r.id === session.sheetARasterId) ||
    doc.rasterLayers[0] ||
    null;
  const sheetB =
    doc.rasterLayers.find(
      (r) => r.id === session.sheetBRasterId && r.id !== sheetA?.id
    ) ||
    doc.rasterLayers.find((r) => r.id !== sheetA?.id) ||
    null;

  const alignment = doc.overlayAlignment || null;
  const pairs: AlignmentPair[] = alignment?.pairs || [];
  const residuals = alignment?.residualsFt || [];
  const rmsFt = alignment?.rmsErrorFt ?? 0;
  const maxErrFt = alignment?.maxErrorFt ?? 0;
  const highError = pairs.length >= 3 && (rmsFt > 3.0 || maxErrFt > 4.8);

  const polygons = doc.entities.filter(
    (e): e is PolygonEntity => e.kind === 'polygon' && e.visible !== false
  );

  const exportPreviewGeom = useMemo(() => {
    if (!sheetA || !sheetB) return null;
    const maxDim = resolutionToMaxDimPx(session.exportResolution, sheetA, sheetB);
    return computeJoinedExportGeometry([sheetA, sheetB], maxDim);
  }, [session.exportResolution, sheetA, sheetB]);

  const joinedExtent = useMemo(() => {
    const active = [sheetA, sheetB].filter((r): r is RasterLayer => Boolean(r));
    return active.length > 0 ? computeJoinedWorldExtent(active) : null;
  }, [sheetA, sheetB]);

  // Generate compact preview when entering Step 7
  useEffect(() => {
    if (step !== 7 || !sheetA || !sheetB) return;
    let cancelled = false;
    setPreviewBusy(true);
    renderJoinedMapCanvas({
      projectName: doc.name,
      sheetA,
      sheetB,
      resolution: 'standard',
      includeVectors: session.exportIncludeVectors,
      includeAnnotations: session.exportIncludeAnnotations,
      entities: doc.entities,
      lang,
      orgInfo,
    })
      .then((res) => {
        if (cancelled) return;
        setPreviewUrl(res.canvas.toDataURL('image/png'));
        setPreviewBusy(false);
      })
      .catch(() => {
        if (!cancelled) setPreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    doc.entities,
    doc.name,
    lang,
    orgInfo,
    session.exportIncludeAnnotations,
    session.exportIncludeVectors,
    sheetA,
    sheetB,
    step,
  ]);

  const handleAttachA = async (file: File) => {
    setCalErrorMsg('');
    setCalStatusMsg(null);
    const layer = await onAttachRasterFile(file);
    if (layer) {
      onUpdateRaster({
        ...layer,
        name: layer.name || 'সিট A',
        opacity: 1,
      });
      session.onSheetARasterIdChange(layer.id);
      onClearPickedPoints();
    }
  };

  const handleAttachB = async (file: File) => {
    const layer = await onAttachRasterFile(file);
    if (!layer) return;
    let nextTx = layer.transform.tx + 140;
    let nextTy = layer.transform.ty;
    let nextScale = layer.transform.scaleFtPerPx;
    if (sheetA) {
      const boxA = getRasterLayerBBox(sheetA);
      nextScale = sheetA.transform.scaleFtPerPx;
      if (boxA) {
        nextTx = boxA.maxX + 18;
        nextTy = boxA.maxY;
      }
    }
    const positioned: RasterLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        tx: nextTx,
        ty: nextTy,
        scaleFtPerPx: nextScale,
      },
      opacity: 0.72,
    };
    onUpdateRaster(positioned);
    session.onSheetBRasterIdChange(positioned.id);
  };

  const handleApplySheetABarCalibration = () => {
    setCalErrorMsg('');
    setCalStatusMsg(null);
    if (!sheetA) {
      setCalErrorMsg(
        lang === 'bn' ? 'প্রথমে সিট A ছবি খুলুন।' : 'Open Sheet A image first.'
      );
      return;
    }
    if (pickedPoints.length < 2) {
      setCalErrorMsg(
        lang === 'bn'
          ? 'ক্যানভাসে স্কেল বারের ২ প্রান্ত ট্যাপ করুন।'
          : 'Tap 2 ends of the scale bar on canvas.'
      );
      return;
    }
    const val = parseLocalizedNumber(barDist);
    if (!val || val <= 0) {
      setCalErrorMsg(
        lang === 'bn' ? 'সঠিক দূরত্ব লিখুন।' : 'Enter a valid positive distance.'
      );
      return;
    }

    const p0 = pickedPoints[pickedPoints.length - 2];
    const p1 = pickedPoints[pickedPoints.length - 1];
    const curDist = distance2D(p0, p1);
    const pxDist = curDist / sheetA.transform.scaleFtPerPx;
    const cal = computeScaleFromBar(pxDist, val, barUnit);
    if (!cal) {
      setCalErrorMsg(
        lang === 'bn'
          ? 'বিন্দু দুটি খুব কাছাকাছি — আবার ট্যাপ করুন।'
          : 'Selected points are too close.'
      );
      return;
    }

    const p0Px = worldToRasterPixel(p0, sheetA.transform);
    const p1Px = worldToRasterPixel(p1, sheetA.transform);
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const ratio = cal.realDistanceFt / Math.max(1e-9, curDist);
    const targetA = {
      x: mid.x + (p0.x - mid.x) * ratio,
      y: mid.y + (p0.y - mid.y) * ratio,
    };
    const targetB = {
      x: mid.x + (p1.x - mid.x) * ratio,
      y: mid.y + (p1.y - mid.y) * ratio,
    };
    const nextT = solveRasterTransformFromTwoPoints(p0Px, p1Px, targetA, targetB);
    onUpdateRaster({
      ...sheetA,
      transform: {
        ...sheetA.transform,
        scaleFtPerPx: nextT?.scaleFtPerPx ?? cal.scaleFtPerPx,
        tx: nextT?.tx ?? sheetA.transform.tx,
        ty: nextT?.ty ?? sheetA.transform.ty,
      },
      pixelsPerFoot: cal.pixelsPerFoot,
      calibrated: true,
    });

    if (saveScannerCheck && onSaveScannerPpi) {
      const ipm = parseLocalizedNumber(nominalIpm) || 16;
      const ppi = computePixelsPerInch(cal.pixelsPerFoot, ipm);
      if (ppi) onSaveScannerPpi(ppi);
    }

    onClearPickedPoints();
    onSetTool('select');
    setCalStatusMsg(
      lang === 'bn'
        ? `সিট A স্কেল সেট: ${formatNumber(cal.pixelsPerFoot, 2, 'bn')} px/ফুট`
        : `Sheet A calibrated: ${cal.pixelsPerFoot.toFixed(2)} px/ft`
    );
  };

  const handleApplySheetAMapScale = (ipmVal: number) => {
    setCalErrorMsg('');
    setCalStatusMsg(null);
    if (!sheetA || !scannerPixelsPerInch) return;
    const res = computePixelsPerFootFromMapScale(scannerPixelsPerInch, ipmVal);
    if (!res) return;
    const oldMid = rasterPixelToWorld(
      { x: sheetA.widthPx / 2, y: sheetA.heightPx / 2 },
      sheetA.transform
    );
    const cosR = Math.cos(sheetA.transform.rotationRad);
    const sinR = Math.sin(sheetA.transform.rotationRad);
    const hw = (sheetA.widthPx / 2) * res.scaleFtPerPx;
    const hh = -(sheetA.heightPx / 2) * res.scaleFtPerPx;
    onUpdateRaster({
      ...sheetA,
      transform: {
        ...sheetA.transform,
        scaleFtPerPx: res.scaleFtPerPx,
        tx: oldMid.x - (hw * cosR - hh * sinR),
        ty: oldMid.y - (hw * sinR + hh * cosR),
      },
      pixelsPerFoot: res.pixelsPerFoot,
      calibrated: true,
    });
    setCalStatusMsg(
      lang === 'bn'
        ? `১ মাইল = ${formatNumber(ipmVal, 0, 'bn')}″ প্রয়োগ হয়েছে`
        : `Applied 1 mile = ${ipmVal}″`
    );
  };

  const nudgeSheetB = (dxFt: number, dyFt: number, dRotDeg: number) => {
    if (!sheetB) return;
    const centerWorld = rasterPixelToWorld(
      { x: sheetB.widthPx / 2, y: sheetB.heightPx / 2 },
      sheetB.transform
    );
    const nextRot = sheetB.transform.rotationRad + (dRotDeg * Math.PI) / 180;
    const cosR = Math.cos(nextRot);
    const sinR = Math.sin(nextRot);
    const hw = (sheetB.widthPx / 2) * sheetB.transform.scaleFtPerPx;
    const hh = -(sheetB.heightPx / 2) * sheetB.transform.scaleFtPerPx;
    const nextTx = centerWorld.x + dxFt - (hw * cosR - hh * sinR);
    const nextTy = centerWorld.y + dyFt - (hw * sinR + hh * cosR);

    onUpdateRaster({
      ...sheetB,
      locked: false,
      transform: {
        ...sheetB.transform,
        tx: nextTx,
        ty: nextTy,
        rotationRad: nextRot,
      },
    });
  };

  let instruction = '';
  let hint = '';
  let canGoNext = true;
  let nextLabel: string | undefined;
  let onBack: (() => void) | undefined;
  let onNext: (() => void) | undefined;
  let body: React.ReactNode = null;

  if (step === 1) {
    // Step 1: Open Sheet A and set its scale
    instruction =
      lang === 'bn'
        ? 'প্রথম ম্যাপ সিট (সিট A) খুলুন এবং তার স্কেল সেট করুন'
        : 'Open Sheet A and calibrate its scale';
    hint =
      lang === 'bn'
        ? 'সিট A-এর স্কেল সঠিকভাবে সেট করলে পরের সিট B-এর স্কেল স্বয়ংক্রিয়ভাবে সিট A-এর মাপে চলে আসবে।'
        : 'Setting Sheet A scale sets the shared world coordinate unit in feet; Sheet B scale will be derived automatically when matched.';
    canGoNext = Boolean(sheetA && sheetA.calibrated);
    onNext = () => {
      onClearPickedPoints();
      onSetTool('select');
      onStepChange(2);
    };

    const barPxSpan =
      sheetA && pickedPoints.length >= 2
        ? distance2D(
            pickedPoints[pickedPoints.length - 2],
            pickedPoints[pickedPoints.length - 1]
          ) / sheetA.transform.scaleFtPerPx
        : null;

    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#B45309] px-3 text-xs font-semibold text-white">
            <ImagePlus className="h-4 w-4" />
            <span>{lang === 'bn' ? 'গ্যালারি (সিট A)' : 'Open Sheet A'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f) void handleAttachA(f);
              }}
            />
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#B45309] bg-[#B45309]/8 dark:bg-amber-950/30 px-3 text-xs font-semibold text-[#B45309] dark:text-amber-300">
            <Camera className="h-4 w-4" />
            <span>{lang === 'bn' ? 'ক্যামেরা (সিট A)' : 'Camera Sheet A'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f) void handleAttachA(f);
              }}
            />
          </label>
        </div>

        {sheetA && (
          <div className="space-y-2">
            <div
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                sheetA.calibrated
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                  : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
              }`}
            >
              <span className="truncate font-semibold flex items-center gap-1.5">
                {sheetA.calibrated ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{sheetA.name}</span>
              </span>
              <span className="font-mono-num tabular-nums shrink-0">
                {sheetA.calibrated
                  ? `${formatNumber(1 / sheetA.transform.scaleFtPerPx, 2, lang)} px/ft`
                  : lang === 'bn'
                  ? 'স্কেল বাকি'
                  : 'Needs scale'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#EAECE7] dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setCalMethod('bar')}
                className={`min-h-[34px] rounded-lg text-xs font-semibold ${
                  calMethod === 'bar'
                    ? 'bg-white dark:bg-slate-900 text-[#B45309] shadow-sm'
                    : 'text-[#4A5550] dark:text-slate-400'
                }`}
              >
                {lang === 'bn' ? 'স্কেল বার দিয়ে' : 'Scale Bar (2 pts)'}
              </button>
              <button
                type="button"
                onClick={() => setCalMethod('mapScale')}
                className={`min-h-[34px] rounded-lg text-xs font-semibold ${
                  calMethod === 'mapScale'
                    ? 'bg-white dark:bg-slate-900 text-[#B45309] shadow-sm'
                    : 'text-[#4A5550] dark:text-slate-400'
                }`}
              >
                {lang === 'bn' ? '১ মাইল = N ইঞ্চি' : '1 mile = N inches'}
              </button>
            </div>

            {calMethod === 'bar' ? (
              <div className="space-y-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-2.5">
                <div className="flex items-center gap-2">
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
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4DBD6] dark:border-slate-700"
                      aria-label={t.actions.cancel}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {barPxSpan !== null && (
                  <p className="text-[11px] font-medium text-[#0F5132] dark:text-emerald-300 tabular-nums">
                    {lang === 'bn'
                      ? `নির্বাচিত স্প্যান: ${formatNumber(barPxSpan, 1, 'bn')} পিক্সেল`
                      : `Selected span: ${barPxSpan.toFixed(1)} px`}
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {CHAIN_CHIPS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        setBarDist(String(ch));
                        setBarUnit('chain');
                      }}
                      className={`min-h-[30px] rounded-lg border px-2.5 text-xs font-semibold tabular-nums ${
                        barUnit === 'chain' && parseLocalizedNumber(barDist) === ch
                          ? 'border-[#B45309] bg-[#B45309] text-white'
                          : 'border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      {formatNumber(ch, 0, lang)} {lang === 'bn' ? 'চেইন' : 'ch'}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={barDist}
                    onChange={(e) => setBarDist(e.target.value)}
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
                    disabled={pickedPoints.length < 2}
                    onClick={handleApplySheetABarCalibration}
                    className="col-span-1 min-h-[38px] rounded-xl bg-[#B45309] px-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {lang === 'bn' ? 'সেট' : 'Set'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <label className="flex items-center gap-1.5 text-[11px] text-[#4A5550] dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={saveScannerCheck}
                      onChange={(e) => setSaveScannerCheck(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#B45309]"
                    />
                    <span>
                      {lang === 'bn' ? 'স্ক্যানার DPI সেভ' : 'Save scanner PPI'}
                    </span>
                  </label>
                  {saveScannerCheck && (
                    <select
                      value={nominalIpm}
                      onChange={(e) => setNominalIpm(e.target.value)}
                      className="rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px]"
                    >
                      <option value="16">16″ = 1 mi</option>
                      <option value="32">32″ = 1 mi</option>
                      <option value="64">64″ = 1 mi</option>
                    </select>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-2.5 space-y-2">
                {scannerPixelsPerInch ? (
                  <>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {lang === 'bn'
                        ? `সংরক্ষিত স্ক্যানার: ${formatNumber(scannerPixelsPerInch, 1, 'bn')} px/″`
                        : `Saved scanner: ${scannerPixelsPerInch.toFixed(1)} px/″`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[16, 32, 64].map((ipm) => (
                        <button
                          key={ipm}
                          type="button"
                          onClick={() => handleApplySheetAMapScale(ipm)}
                          className="min-h-[36px] rounded-xl border border-[#B45309]/40 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-[#B45309]"
                        >
                          {formatNumber(ipm, 0, lang)}″ = {lang === 'bn' ? '১ মাইল' : '1 mi'}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    {lang === 'bn'
                      ? 'ফোন ছবির জন্য স্কেল বার ট্যাব দিয়ে ২ প্রান্ত মেপে স্কেল সেট করুন।'
                      : 'Use the Scale Bar tab to calibrate camera photos.'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {calStatusMsg && (
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {calStatusMsg}
          </p>
        )}
        {calErrorMsg && (
          <p className="text-xs font-semibold text-red-600">{calErrorMsg}</p>
        )}
      </div>
    );
  } else if (step === 2) {
    // Step 2: Open Sheet B (scale can be derived from matching points)
    instruction =
      lang === 'bn'
        ? 'সংলগ্ন দ্বিতীয় ম্যাপ সিট (সিট B) খুলুন'
        : 'Open the adjacent Sheet B map image';
    hint =
      lang === 'bn'
        ? 'সিট B-এর আলাদা স্কেল না দিলেও চলবে — পরের ধাপে সংযোগ রেখার ২টি বিন্দু মেলালে সিট A থেকে স্বয়ংক্রিয়ভাবে স্কেল বের হয়ে যাবে।'
        : 'You do not need to calibrate Sheet B separately — matching 2+ points along the shared edge derives Sheet B’s scale from Sheet A.';
    onBack = () => onStepChange(1);
    canGoNext = Boolean(sheetA && sheetB);
    nextLabel = lang === 'bn' ? 'পরবর্তী: সাধারণ বিন্দু মিলান' : 'Next: Match Edge Points';
    onNext = () => {
      session.onSetPairPhase('a');
      onSetTool('pick-point');
      onStepChange(3);
    };

    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-h-[54px] cursor-pointer items-center gap-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:border-[#0F5132]">
            <Layers className="h-5 w-5 shrink-0 text-[#0F5132]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">
                {lang === 'bn' ? 'গ্যালারি (সিট B)' : 'Open Sheet B'}
              </div>
              <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {sheetB ? sheetB.name : lang === 'bn' ? 'JPG / PNG বেছে নিন' : 'Choose image'}
              </div>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f) void handleAttachB(f);
              }}
            />
          </label>

          <label className="flex min-h-[54px] cursor-pointer items-center gap-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:border-[#0F5132]">
            <Camera className="h-5 w-5 shrink-0 text-[#0F5132]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">
                {lang === 'bn' ? 'ক্যামেরা (সিট B)' : 'Camera Sheet B'}
              </div>
              <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'সংলগ্ন সিটের ছবি' : 'Capture Sheet B'}
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f) void handleAttachB(f);
              }}
            />
          </label>
        </div>

        {sheetB && (
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold truncate">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {lang === 'bn' ? 'সিট B যুক্ত:' : 'Sheet B loaded:'} {sheetB.name}
              </span>
            </span>
            <span className="text-[11px] font-medium shrink-0">
              {sheetB.widthPx}×{sheetB.heightPx} px
            </span>
          </div>
        )}
      </div>
    );
  } else if (step === 3) {
    // Step 3: Mark >= 2 matching points along shared edge on both sheets
    const nextPairNum = pairs.length + 1;
    instruction =
      session.pairPhase === 'a'
        ? lang === 'bn'
          ? `জোড়া ${formatNumber(nextPairNum, 0, lang)} (১/২): সিট A-এর সংযোগ রেখায় সাধারণ বিন্দু ট্যাপ করুন`
          : `Pair #${nextPairNum} (1/2): Tap a shared-edge point on Sheet A`
        : lang === 'bn'
        ? `জোড়া ${formatNumber(nextPairNum, 0, lang)} (২/২): সিট B-এ ঠিক একই চিহ্নটি ট্যাপ করুন`
        : `Pair #${nextPairNum} (2/2): Tap the SAME landmark on Sheet B`;

    hint =
      lang === 'bn'
        ? 'দুটি সিটের সীমানার কাছাকাছি সাধারণ কোণা, রাস্তার ক্রসিং বা পিলার বাছুন। কমপক্ষে ২ জোড়া লাগবে (৩+ দিলে ত্রুটি মাপা যায়)।'
        : 'Pick boundary corners or road crossings along the shared edge. Minimum 2 pairs required (3+ computes least-squares RMS error).';
    onBack = () => {
      onSetTool('select');
      onStepChange(2);
    };
    canGoNext = pairs.length >= 2;
    nextLabel = lang === 'bn' ? 'সিট B স্বয়ংক্রিয়ভাবে বসান' : 'Align Sheet B to A';
    onNext = () => {
      if (sheetA) onUpdateRaster({ ...sheetA, visible: true, opacity: 1 });
      if (sheetB) {
        onUpdateRaster({
          ...sheetB,
          visible: true,
          opacity: sheetB.opacity < 0.25 ? 0.65 : sheetB.opacity,
        });
      }
      session.onReapplyAutoAlignment();
      onSetTool('select');
      onStepChange(4);
    };

    body = (
      <div className="space-y-2.5">
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-xs font-bold ${
            session.pairPhase === 'a'
              ? 'border-[#B45309] bg-amber-50 dark:bg-amber-950/40 text-[#B45309] dark:text-amber-200'
              : 'border-[#0F5132] bg-emerald-50 dark:bg-emerald-950/40 text-[#0F5132] dark:text-emerald-200'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Crosshair className="h-4 w-4 shrink-0" />
            <span>
              {session.pairPhase === 'a'
                ? lang === 'bn'
                  ? 'এখন ট্যাপ করুন: সিট A (মূল)'
                  : 'Now Tap: Sheet A'
                : lang === 'bn'
                ? 'এখন ট্যাপ করুন: সিট B (সংলগ্ন)'
                : 'Now Tap: Sheet B'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onSetTool('pick-point');
              onJumpToWorkspace();
            }}
            className="rounded-lg bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] border border-current"
          >
            {lang === 'bn' ? 'ম্যাপে ট্যাপ করুন' : 'Tap on Map'}
          </button>
        </div>

        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="font-semibold">
            {lang === 'bn'
              ? `মিলানো জোড়া: ${formatNumber(pairs.length, 0, lang)} টি (সর্বনিম্ন ২ · সুপারিশ ৩+)`
              : `Matched pairs: ${pairs.length} (min 2 · 3+ recommended)`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={session.onUndoLastPairTap}
              disabled={pairs.length === 0 && session.pairPhase === 'a'}
              className="inline-flex items-center gap-1 rounded-lg border border-[#D4DBD6] dark:border-slate-700 px-2 py-1 text-[11px] font-semibold disabled:opacity-40"
            >
              <Undo2 className="h-3 w-3" />
              <span>{lang === 'bn' ? 'ফিরুন' : 'Undo'}</span>
            </button>
            <button
              type="button"
              onClick={session.onClearAllPairs}
              disabled={pairs.length === 0 && session.pairPhase === 'a'}
              className="rounded-lg border border-[#D4DBD6] dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-red-600 disabled:opacity-40"
            >
              {lang === 'bn' ? 'রিসেট' : 'Reset'}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-[#4A5550] dark:text-slate-300">
          <input
            type="checkbox"
            checked={session.autoFocusTap}
            onChange={(e) => session.onAutoFocusTapChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#B45309]"
          />
          <span>
            {lang === 'bn'
              ? 'ট্যাপ করার সময় কেবল সক্রিয় সিট স্পষ্ট রাখুন'
              : 'Highlight active sheet while marking landmarks'}
          </span>
        </label>

        {pairs.length > 0 && (
          <div className="max-h-28 overflow-y-auto space-y-1">
            {pairs.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2.5 py-1.5 text-[11px] tabular-nums"
              >
                <span className="font-semibold">
                  {lang === 'bn'
                    ? `সংযোগ বিন্দু P${formatNumber(idx + 1, 0, lang)}`
                    : `Tie Point P${idx + 1}`}
                </span>
                <div className="flex items-center gap-2">
                  {residuals[idx] !== undefined && (
                    <span
                      className={`font-semibold ${
                        residuals[idx] > 4
                          ? 'text-red-600'
                          : 'text-[#0F5132] dark:text-emerald-400'
                      }`}
                    >
                      {lang === 'bn' ? 'ত্রুটি' : 'Err'}: {formatNumber(residuals[idx], 2, lang)} ft
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => session.onDeletePair(p.id)}
                    className="text-red-500 hover:text-red-700"
                    aria-label="Delete pair"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else if (step === 4) {
    // Step 4: Similarity alignment, RMS error readout & opacity slider
    const rotDeg = sheetB ? (sheetB.transform.rotationRad * 180) / Math.PI : 0;
    const derivedPxFt = sheetB ? 1 / Math.max(1e-9, sheetB.transform.scaleFtPerPx) : 0;

    instruction =
      lang === 'bn'
        ? 'সিট B স্বয়ংক্রিয়ভাবে সিট A-এর সাথে মিলেছে — RMS ত্রুটি ও স্বচ্ছতা দেখুন'
        : 'Sheet B aligned via similarity transform — review RMS error & opacity';
    hint =
      lang === 'bn'
        ? 'সীমানা রেখায় ওভারল্যাপ স্পষ্ট দেখতে স্বচ্ছতা স্লাইডার সরান। পরের ধাপে হাত দিয়ে টেনে আরও সূক্ষ্মভাবে বসাতে পারবেন।'
        : 'Use the opacity slider to check the shared boundary seam. You can fine-tune by dragging in the next step.';
    onBack = () => {
      session.onSetPairPhase('a');
      onSetTool('pick-point');
      onStepChange(3);
    };
    nextLabel = lang === 'bn' ? 'পরবর্তী: সূক্ষ্ম সমন্বয়' : 'Next: Fine Adjust';
    onNext = () => onStepChange(5);

    body = (
      <div className="space-y-2.5">
        <div
          className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${
            pairs.length < 3
              ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200'
              : highError
              ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
              : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          {highError ? (
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#0F5132] dark:text-emerald-400" />
          )}
          <div className="space-y-0.5 tabular-nums flex-1">
            <div className="font-bold">
              {pairs.length < 3
                ? lang === 'bn'
                  ? '২-বিন্দু সিমিলারিটি ট্রান্সফর্ম সম্পন্ন'
                  : '2-Point Similarity Fit Complete'
                : highError
                ? lang === 'bn'
                  ? `উচ্চ ত্রুটি সতর্কতা — RMS: ${formatNumber(rmsFt, 2, 'bn')} ফুট`
                  : `High Alignment Error — RMS: ${rmsFt.toFixed(2)} ft`
                : lang === 'bn'
                ? `সঠিক সংযোজন — RMS ত্রুটি: ${formatNumber(rmsFt, 2, 'bn')} ফুট`
                : `Aligned Cleanly — RMS Error: ${rmsFt.toFixed(2)} ft`}
            </div>
            <div className="text-[11px] opacity-90">
              {lang === 'bn'
                ? `সিট B স্কেল: ${formatNumber(derivedPxFt, 2, 'bn')} px/ফুট · ঘূর্ণন: ${formatNumber(rotDeg, 2, 'bn')}°`
                : `Derived Sheet B scale: ${derivedPxFt.toFixed(2)} px/ft · Rot: ${rotDeg.toFixed(2)}°`}
            </div>
          </div>
        </div>

        {sheetB && (
          <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold tabular-nums">
              <span>
                {lang === 'bn'
                  ? `সিট B স্বচ্ছতা: ${formatNumber(Math.round(sheetB.opacity * 100), 0, 'bn')}%`
                  : `Sheet B Opacity: ${Math.round(sheetB.opacity * 100)}%`}
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateRaster({ ...sheetB, visible: !sheetB.visible })
                }
                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2.5 text-[11px] font-bold"
              >
                {sheetB.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>
                  {sheetB.visible
                    ? lang === 'bn'
                      ? 'দেখাচ্ছে'
                      : 'Visible'
                    : lang === 'bn'
                    ? 'লুকানো'
                    : 'Hidden'}
                </span>
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sheetB.opacity * 100)}
              onChange={(e) =>
                onUpdateRaster({
                  ...sheetB,
                  visible: true,
                  opacity: Number(e.target.value) / 100,
                })
              }
              className="w-full accent-[#B45309]"
            />
          </div>
        )}

        {pairs.length >= 3 && (
          <div className="max-h-24 overflow-y-auto rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 divide-y divide-[#E5E9E4] dark:divide-slate-700 text-[11px] tabular-nums">
            {pairs.map((_, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-1">
                <span>
                  {lang === 'bn'
                    ? `বিন্দু P${formatNumber(idx + 1, 0, 'bn')}`
                    : `Point P${idx + 1}`}
                </span>
                <span className="font-semibold">
                  {formatNumber(residuals[idx] ?? 0, 2, lang)} {lang === 'bn' ? 'ফুট' : 'ft'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else if (step === 5) {
    // Step 5: Optional fine adjustment by dragging Sheet B + nudges
    instruction =
      lang === 'bn'
        ? 'প্রয়োজনে সিট B টেনে বা হালকা সরিয়ে সীমানা নিখুঁত করুন (ঐচ্ছিক)'
        : 'Optional fine adjustment — drag or nudge Sheet B along the seam';
    hint =
      lang === 'bn'
        ? '"ক্যানভাসে টেনে সরান" চাপলে আঙুল বা মাউস দিয়ে সরাসরি সিট B সরানো যাবে; অথবা নিচের তীর দিয়ে ০.৫ বা ২ ফুট সরান।'
        : 'Tap "Drag Sheet B on Canvas" to move Sheet B smoothly with finger/mouse, or use the fine nudge controls below.';
    onBack = () => onStepChange(4);
    nextLabel = lang === 'bn' ? 'পরবর্তী: মার্জ ও সমন্বয়' : 'Next: Merge Layers';
    onNext = () => {
      session.onMergeKeepLayers();
      onStepChange(6);
    };

    body = (
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => {
            session.onStartDragSheetB();
            onJumpToWorkspace();
          }}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#B45309] px-3 text-xs font-bold text-white"
        >
          <Hand className="h-4 w-4" />
          <span>
            {lang === 'bn'
              ? 'ক্যানভাসে হাত দিয়ে সিট B টেনে বসান'
              : 'Drag Sheet B Directly on Canvas'}
          </span>
        </button>

        <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-[#4A5550] dark:text-slate-300">
              {lang === 'bn' ? 'সূক্ষ্ম নড়াচড়া ধাপ:' : 'Nudge step:'}
            </span>
            <div className="flex gap-1">
              {[0.5, 1, 3].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setNudgeStepFt(v)}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    nudgeStepFt === v
                      ? 'border-[#0F5132] bg-[#0F5132] text-white'
                      : 'border-[#D4DBD6] dark:border-slate-600'
                  }`}
                >
                  {formatNumber(v, 1, lang)} {lang === 'bn' ? 'ফুট' : 'ft'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudgeSheetB(-nudgeStepFt, 0, 0)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] dark:border-slate-600 bg-white dark:bg-slate-900"
                aria-label="Move left"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => nudgeSheetB(nudgeStepFt, 0, 0)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] dark:border-slate-600 bg-white dark:bg-slate-900"
                aria-label="Move right"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => nudgeSheetB(0, nudgeStepFt, 0)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] dark:border-slate-600 bg-white dark:bg-slate-900"
                aria-label="Move up"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => nudgeSheetB(0, -nudgeStepFt, 0)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] dark:border-slate-600 bg-white dark:bg-slate-900"
                aria-label="Move down"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudgeSheetB(0, 0, 0.3)}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#CBD5E1] dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-[11px] font-semibold tabular-nums"
              >
                <RotateCcw className="h-3 w-3" />
                <span>+{formatNumber(0.3, 1, lang)}°</span>
              </button>
              <button
                type="button"
                onClick={() => nudgeSheetB(0, 0, -0.3)}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#CBD5E1] dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-[11px] font-semibold tabular-nums"
              >
                <RotateCw className="h-3 w-3" />
                <span>-{formatNumber(0.3, 1, lang)}°</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={session.onReapplyAutoAlignment}
            className="w-full min-h-[32px] rounded-lg border border-dashed border-[#CBD5E1] dark:border-slate-600 text-[11px] font-semibold text-[#4A5550] dark:text-slate-300"
          >
            {lang === 'bn'
              ? 'স্বয়ংক্রিয় সিমিলারিটি অবস্থানে ফিরে যান'
              : 'Reset to Similarity Alignment'}
          </button>
        </div>
      </div>
    );
  } else if (step === 6) {
    // Step 6: Merge both rasters as layers in one common coordinate system so plots/measures cross the seam
    const extW = joinedExtent ? joinedExtent.maxX - joinedExtent.minX : 0;
    const extH = joinedExtent ? joinedExtent.maxY - joinedExtent.minY : 0;
    const totalPlotAreaSqFt = polygons.reduce(
      (acc, p) => acc + polygonAreaSqFt(p.points),
      0
    );
    const totalBreak = computeAreaBreakdown(totalPlotAreaSqFt, doc.unitProfile);

    instruction =
      lang === 'bn'
        ? 'উভয় সিট একক স্থানাঙ্ক ব্যবস্থায় মার্জ হয়েছে — এখন সীমানা পার হয়ে মাপ বা দাগ আঁকতে পারেন'
        : 'Both sheets merged in one coordinate system — measure or draw across the seam';
    hint =
      lang === 'bn'
        ? 'দুটি রাস্টারই আলাদা লেয়ার হিসেবে প্রজেক্টে সংরক্ষিত থাকবে এবং একসাথে লক করা আছে যাতে দু-সিট জুড়ে থাকা দাগের মাপ বের করা যায়।'
        : 'Both sheets remain preserved as locked raster layers in one unified coordinate space, allowing plots and measurements to cross the seam.';
    onBack = () => onStepChange(5);
    nextLabel = lang === 'bn' ? 'পরবর্তী: সংযুক্ত ছবি এক্সপোর্ট' : 'Next: Export Image';
    onNext = () => onStepChange(7);

    body = (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs space-y-1 tabular-nums">
          <div className="flex items-center justify-between font-bold text-[#0F5132] dark:text-emerald-300">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              <span>
                {lang === 'bn'
                  ? 'সিট A + সিট B যৌথ লেয়ার সক্রিয়'
                  : 'Sheet A + Sheet B Merged Layers Active'}
              </span>
            </span>
            <span>
              {formatNumber(extW, 0, lang)} × {formatNumber(extH, 0, lang)}{' '}
              {lang === 'bn' ? 'ফুট' : 'ft'}
            </span>
          </div>
          {polygons.length > 0 && (
            <div className="text-[11px] text-[#141A17] dark:text-slate-200">
              {lang === 'bn'
                ? `প্রজেক্টে ${formatNumber(polygons.length, 0, 'bn')}টি দাগ (${formatNumber(totalBreak.shotok, 2, 'bn')} শতক)`
                : `${polygons.length} plots traced (${totalBreak.shotok.toFixed(2)} shotok)`}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => session.onStartCrossSheetMeasure('area')}
            className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-3 text-xs font-bold text-white"
          >
            <Pencil className="h-4 w-4" />
            <span>
              {lang === 'bn' ? 'সীমানা পার হয়ে দাগ আঁকুন' : 'Trace Plot Across Edge'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => session.onStartCrossSheetMeasure('distance')}
            className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border border-[#0F5132] px-3 text-xs font-bold text-[#0F5132] dark:text-emerald-400"
          >
            <Ruler className="h-4 w-4" />
            <span>
              {lang === 'bn' ? 'দু-সিট জুড়ে দূরত্ব মাপুন' : 'Measure Across Edge'}
            </span>
          </button>
        </div>
      </div>
    );
  } else {
    // Step 7: Export the joined map as one image at a chosen resolution
    instruction =
      lang === 'bn'
        ? 'সংযুক্ত ম্যাপের রেজোলিউশন বেছে একক ছবি হিসেবে এক্সপোর্ট করুন'
        : 'Choose resolution and export the joined map as a single image';
    hint =
      lang === 'bn'
        ? 'মূল হাই-রেজোলিউশন ছবি থেকে দুটি সিট সেলাই (Stitch) করে একক PNG বা JPEG ছবি তৈরি করা হবে।'
        : 'Stitches both sheets directly from their original full-resolution images into one continuous PNG or JPEG.';
    onBack = () => onStepChange(6);
    canGoNext = false;

    const currentOpts =
      sheetA && sheetB
        ? {
            projectName: doc.name,
            sheetA,
            sheetB,
            resolution: session.exportResolution,
            includeVectors: session.exportIncludeVectors,
            includeAnnotations: session.exportIncludeAnnotations,
            entities: doc.entities,
            lang,
            orgInfo,
          }
        : null;

    body = (
      <div className="space-y-2.5">
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ['standard', lang === 'bn' ? 'সাধারণ (১৮০০px)' : 'Standard'],
              ['high', lang === 'bn' ? 'প্রিন্ট (৩২০০px)' : 'High (3200px)'],
              ['ultra', lang === 'bn' ? 'আল্ট্রা (নেটিভ)' : 'Ultra (Native)'],
            ] as const
          ).map(([resId, label]) => (
            <button
              key={resId}
              type="button"
              onClick={() => session.onExportResolutionChange(resId)}
              className={`min-h-[38px] rounded-xl border px-2 text-[11px] font-bold ${
                session.exportResolution === resId
                  ? 'border-[#B45309] bg-[#B45309] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <label className="flex items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={session.exportIncludeVectors}
              onChange={(e) => session.onExportIncludeVectorsChange(e.target.checked)}
              className="h-4 w-4 accent-[#B45309]"
            />
            <span>{lang === 'bn' ? 'আঁকা দাগ/রেখা সহ' : 'Include Plots/Vectors'}</span>
          </label>
          <label className="flex items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={session.exportIncludeAnnotations}
              onChange={(e) => session.onExportIncludeAnnotationsChange(e.target.checked)}
              className="h-4 w-4 accent-[#B45309]"
            />
            <span>{lang === 'bn' ? 'শিরোনাম ও স্কেল বার' : 'Header & Scale Bar'}</span>
          </label>
          {exportPreviewGeom && (
            <span className="font-mono-num font-bold text-[#4A5550] dark:text-slate-300 tabular-nums">
              {formatNumber(exportPreviewGeom.widthPx, 0, lang)} ×{' '}
              {formatNumber(exportPreviewGeom.heightPx, 0, lang)} px
            </span>
          )}
        </div>

        <div className="rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#EAECE7] dark:bg-slate-950 p-2 flex items-center justify-center min-h-[140px] max-h-[210px] overflow-hidden">
          {previewBusy ? (
            <span className="text-xs text-[#4A5550] dark:text-slate-300">
              {lang === 'bn' ? 'সংযুক্ত প্রিভিউ তৈরি হচ্ছে…' : 'Rendering joined preview…'}
            </span>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="Joined map preview"
              className="max-h-[190px] w-auto rounded-lg object-contain shadow"
            />
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={!currentOpts || session.isExporting}
            onClick={() => {
              if (currentOpts) void session.onExportImage({ ...currentOpts, format: 'png' });
            }}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            <span>
              {session.isExporting
                ? lang === 'bn'
                  ? 'তৈরি হচ্ছে…'
                  : 'Exporting…'
                : lang === 'bn'
                ? 'PNG এক্সপোর্ট'
                : 'Export PNG'}
            </span>
          </button>

          <button
            type="button"
            disabled={!currentOpts || session.isExporting}
            onClick={() => {
              if (currentOpts) void session.onExportImage({ ...currentOpts, format: 'jpeg' });
            }}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#B45309] bg-white dark:bg-slate-900 px-3 text-xs font-bold text-[#B45309] disabled:opacity-40"
          >
            <FileImage className="h-4 w-4" />
            <span>{lang === 'bn' ? 'JPEG এক্সপোর্ট' : 'Export JPEG'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <WizardFramework
      title={t.wizards.joint.title}
      icon={<Layers className="h-4 w-4 text-[#B45309] dark:text-amber-400" />}
      currentStep={step}
      totalSteps={7}
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
