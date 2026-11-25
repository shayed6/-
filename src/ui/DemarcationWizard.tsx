import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  Camera,
  Check,
  CheckCircle2,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FlipHorizontal2,
  ImagePlus,
  Layers,
  MousePointerClick,
  RotateCcw,
  Ruler,
  ShieldAlert,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  AlignmentPair,
  CadDocument,
  DemarcationRecord,
  PolygonEntity,
  RasterLayer,
} from '../core/cad/types';
import {
  rasterPixelToWorld,
  solveRasterTransformFromTwoPoints,
  worldToRasterPixel,
} from '../core/cad/geometry';
import {
  computePolygonOverlapMetrics,
  polygonAreaSqFt,
} from '../core/survey/area';
import { Point2D, distance2D } from '../core/survey/coordinates';
import { checkScaleAccuracy, computeScaleFromBar } from '../core/survey/scale';
import {
  LinearUnit,
  formatNumber,
  getLinearUnitLabel,
  parseLocalizedNumber,
  toFeet,
} from '../core/survey/units';
import { ActiveTool } from './CadCanvas';
import { WizardFramework } from './WizardFramework';
import { Lang, getTranslations } from './i18n';

interface DemarcationWizardProps {
  doc: CadDocument;
  lang: Lang;
  step: number;
  onStepChange: (step: number) => void;
  draftPoints: Point2D[];
  pickedPoints: Point2D[];
  onClearPickedPoints: () => void;
  onSetTool: (tool: ActiveTool) => void;
  onUndoDraftPoint: () => void;
  onCancelDraft: () => void;
  onAttachRasterFile: (file: File) => Promise<RasterLayer | null>;
  onUpdateRaster: (layer: RasterLayer) => void;

  // Lifted demarcation session state (survives jumpToWorkspace)
  baseRasterId: string | null;
  onBaseRasterIdChange: (id: string | null) => void;
  overlayRasterId: string | null;
  onOverlayRasterIdChange: (id: string | null) => void;
  baseMapLabel: string;
  onBaseMapLabelChange: (val: string) => void;
  overlayMapLabel: string;
  onOverlayMapLabelChange: (val: string) => void;
  pairPhase: 'base' | 'overlay';
  onSetPairPhase: (phase: 'base' | 'overlay') => void;
  onUndoLastPairTap: () => void;
  onDeletePair: (pairId: string) => void;
  onClearAllPairs: () => void;
  autoFocusTap: boolean;
  onAutoFocusTapChange: (v: boolean) => void;
  onFlipOverlayHorizontal?: () => Promise<void>;
  isFlippingOverlay?: boolean;

  traceTarget: 'base' | 'overlay';
  onStartTraceDag: (target: 'base' | 'overlay', dagNo: string) => void;
  onFinishTraceDag: (target: 'base' | 'overlay', dagNo: string, pts: Point2D[]) => void;
  baseDagNo: string;
  onBaseDagNoChange: (val: string) => void;
  overlayDagNo: string;
  onOverlayDagNoChange: (val: string) => void;
  basePolyId: string | null;
  onBasePolyIdChange: (id: string | null) => void;
  overlayPolyId: string | null;
  onOverlayPolyIdChange: (id: string | null) => void;

  onAddResultToReport: (rec: DemarcationRecord) => void;
  reportSavedForCurrent: boolean;

  onExportPdf: () => void;
  onExportCsv: () => void;
  onJumpToWorkspace: () => void;
  onClose: () => void;
}

export const DemarcationWizard: React.FC<DemarcationWizardProps> = ({
  doc,
  lang,
  step,
  onStepChange,
  draftPoints,
  pickedPoints,
  onClearPickedPoints,
  onSetTool,
  onUndoDraftPoint,
  onCancelDraft,
  onAttachRasterFile,
  onUpdateRaster,
  baseRasterId,
  onBaseRasterIdChange,
  overlayRasterId,
  onOverlayRasterIdChange,
  baseMapLabel,
  onBaseMapLabelChange,
  overlayMapLabel,
  onOverlayMapLabelChange,
  pairPhase,
  onSetPairPhase,
  onUndoLastPairTap,
  onDeletePair,
  onClearAllPairs,
  autoFocusTap,
  onAutoFocusTapChange,
  onFlipOverlayHorizontal,
  isFlippingOverlay = false,
  traceTarget,
  onStartTraceDag,
  onFinishTraceDag,
  baseDagNo,
  onBaseDagNoChange,
  overlayDagNo,
  onOverlayDagNoChange,
  basePolyId,
  onBasePolyIdChange,
  overlayPolyId,
  onOverlayPolyIdChange,
  onAddResultToReport,
  reportSavedForCurrent,
  onExportPdf,
  onExportCsv,
  onJumpToWorkspace,
  onClose,
}) => {
  const t = getTranslations(lang);
  const [calDist, setCalDist] = useState('1');
  const [calUnit, setCalUnit] = useState<LinearUnit>('chain');
  const [scaleErrorMsg, setScaleErrorMsg] = useState('');
  const [scaleCheckMsg, setScaleCheckMsg] = useState<{
    passed: boolean;
    text: string;
  } | null>(null);

  const baseLayer =
    doc.rasterLayers.find((r) => r.id === baseRasterId) ||
    doc.rasterLayers[0] ||
    null;
  const overlayLayer =
    doc.rasterLayers.find((r) => r.id === overlayRasterId && r.id !== baseLayer?.id) ||
    doc.rasterLayers.find((r) => r.id !== baseLayer?.id) ||
    null;

  const alignment = doc.overlayAlignment || null;
  const pairs: AlignmentPair[] = alignment?.pairs || [];
  const residuals = alignment?.residualsFt || [];
  const rmsFt = alignment?.rmsErrorFt ?? 0;
  const maxErrFt = alignment?.maxErrorFt ?? 0;
  const highError = pairs.length >= 3 && (rmsFt > 3.0 || maxErrFt > 4.8);

  const polygons = doc.entities.filter(
    (e): e is PolygonEntity => e.kind === 'polygon'
  );
  const basePoly = polygons.find((p) => p.id === basePolyId) || null;
  const overlayPoly = polygons.find((p) => p.id === overlayPolyId) || null;

  let instruction = '';
  let hint = '';
  let body: React.ReactNode = null;
  let onBack: (() => void) | undefined = undefined;
  let onNext: (() => void) | undefined = undefined;
  let canGoNext = true;
  let nextLabel: string | undefined = undefined;

  if (step === 1) {
    // Step 1: Open Base map (e.g. CS) and set its scale
    const p1 = pickedPoints[0] || null;
    const p2 = pickedPoints[1] || null;

    const handleCalibrateBase = () => {
      setScaleErrorMsg('');
      setScaleCheckMsg(null);
      if (!baseLayer || !p1 || !p2) return;
      const px1 = worldToRasterPixel(p1, baseLayer.transform);
      const px2 = worldToRasterPixel(p2, baseLayer.transform);
      const pxDist = distance2D(px1, px2);
      const barRes = computeScaleFromBar(
        pxDist,
        parseLocalizedNumber(calDist),
        calUnit
      );
      const curDist = distance2D(p1, p2);
      if (curDist < 1e-6 || !barRes) {
        setScaleErrorMsg(
          lang === 'bn'
            ? 'সঠিক স্কেল দূরত্ব দিন এবং ২টি আলাদা প্রান্তে ট্যাপ করুন।'
            : 'Enter positive distance and tap 2 distinct scale bar points.'
        );
        return;
      }
      const dirX = (p2.x - p1.x) / curDist;
      const dirY = (p2.y - p1.y) / curDist;
      const w2Target = {
        x: p1.x + dirX * barRes.realDistanceFt,
        y: p1.y + dirY * barRes.realDistanceFt,
      };
      const nextT = solveRasterTransformFromTwoPoints(px1, px2, p1, w2Target);
      if (!nextT) return;
      onUpdateRaster({
        ...baseLayer,
        transform: nextT,
        calibrated: true,
        visible: true,
        opacity: 1,
        pixelsPerFoot: barRes.pixelsPerFoot,
        calibrationMethod: 'bar',
      });
      onClearPickedPoints();
      const verified = checkScaleAccuracy(
        distance2D(
          rasterPixelToWorld(px1, nextT),
          rasterPixelToWorld(px2, nextT)
        ),
        barRes.realDistanceFt,
        3
      );
      if (verified) {
        setScaleCheckMsg({
          passed: verified.passed,
          text:
            lang === 'bn'
              ? `স্কেল সেট হয়েছে: ${formatNumber(barRes.pixelsPerFoot, 2, lang)} px/ft (ত্রুটি ${formatNumber(verified.errorPercent, 2, lang)}%)`
              : `Scale set: ${barRes.pixelsPerFoot.toFixed(2)} px/ft (error ${verified.errorPercent.toFixed(2)}%)`,
        });
      }
      onSetTool('select');
    };

    instruction =
      lang === 'bn'
        ? 'বেস ম্যাপ (যেমন CS) খুলুন এবং স্কেল সেট করুন'
        : 'Open the base map (e.g. CS) and set its scale';
    hint =
      lang === 'bn'
        ? 'প্রথমে মূল বা সাবেক মৌজা নকশা (CS) আপলোড করুন, তারপর স্কেল বারের ২ প্রান্তে ট্যাপ করে স্কেল ঠিক করুন।'
        : 'Load your reference base map (CS) first, then pick 2 points along its scale bar to calibrate feet.';
    canGoNext = Boolean(baseLayer);
    nextLabel = lang === 'bn' ? 'পরবর্তী: ওভারলে ম্যাপ' : 'Next: Overlay Map';
    onNext = () => {
      onClearPickedPoints();
      onSetTool('select');
      onStepChange(2);
    };

    body = (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#4A5550] dark:text-slate-300 shrink-0">
            {lang === 'bn' ? 'বেস ম্যাপের ধরন:' : 'Base Label:'}
          </span>
          {['CS (সাবেক)', 'SA', 'RS'].map((lbl) => (
            <button
              key={lbl}
              type="button"
              onClick={() => onBaseMapLabelChange(lbl)}
              className={`min-h-[30px] rounded-lg border px-2.5 text-[11px] font-bold ${
                baseMapLabel === lbl
                  ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex min-h-[54px] cursor-pointer items-center gap-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:border-[#1E3A8A]">
            <ImagePlus className="h-5 w-5 shrink-0 text-[#1E3A8A] dark:text-blue-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">
                {lang === 'bn' ? `গ্যালারি থেকে ${baseMapLabel}` : `Open ${baseMapLabel}`}
              </div>
              <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {baseLayer ? baseLayer.name : lang === 'bn' ? 'JPG / PNG বেছে নিন' : 'Choose image'}
              </div>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!f) return;
                const layer = await onAttachRasterFile(f);
                if (layer) {
                  onBaseRasterIdChange(layer.id);
                  onClearPickedPoints();
                  onSetTool('pick-point');
                }
              }}
            />
          </label>

          <label className="flex min-h-[54px] cursor-pointer items-center gap-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:border-[#1E3A8A]">
            <Camera className="h-5 w-5 shrink-0 text-[#B45309]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">
                {lang === 'bn' ? 'ক্যামেরায় ছবি তুলুন' : 'Capture Camera'}
              </div>
              <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'সরাসরি নকশার ছবি' : 'Take map photo'}
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!f) return;
                const layer = await onAttachRasterFile(f);
                if (layer) {
                  onBaseRasterIdChange(layer.id);
                  onClearPickedPoints();
                  onSetTool('pick-point');
                }
              }}
            />
          </label>
        </div>

        {baseLayer && (
          <div className="space-y-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/80 p-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5 text-[#0F5132]" />
                {lang === 'bn'
                  ? `স্কেল ক্যালিব্রেশন (${formatNumber(Math.min(2, pickedPoints.length), 0, lang)}/২ প্রান্ত)`
                  : `Scale Bar Ends (${Math.min(2, pickedPoints.length)}/2)`}
              </span>
              <button
                type="button"
                onClick={() => {
                  onClearPickedPoints();
                  onSetTool('pick-point');
                  onJumpToWorkspace();
                }}
                className="rounded-lg bg-[#0F5132]/10 px-2.5 py-1 text-[11px] font-bold text-[#0F5132] dark:text-emerald-300"
              >
                {lang === 'bn' ? 'ম্যাপে ২ প্রান্ত ট্যাপ করুন' : 'Pick 2 Ends on Map'}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 5, 10].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCalDist(String(c));
                    setCalUnit('chain');
                  }}
                  className={`min-h-[30px] rounded-lg border text-[11px] font-bold tabular-nums ${
                    calUnit === 'chain' && parseLocalizedNumber(calDist) === c
                      ? 'border-[#0F5132] bg-[#0F5132] text-white'
                      : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  {formatNumber(c, 0, lang)} {lang === 'bn' ? 'চেইন' : 'ch'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[1fr_90px_auto] gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                value={calDist}
                onChange={(e) => setCalDist(e.target.value)}
                className="min-h-[36px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-mono-num"
              />
              <select
                value={calUnit}
                onChange={(e) => setCalUnit(e.target.value as LinearUnit)}
                className="min-h-[36px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
              >
                {(['chain', 'ft', 'hat', 'gaj', 'm'] as LinearUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {getLinearUnitLabel(u, lang)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!p1 || !p2}
                onClick={handleCalibrateBase}
                className="min-h-[36px] rounded-xl bg-[#0F5132] px-3 text-xs font-bold text-white disabled:opacity-40"
              >
                {lang === 'bn' ? 'সেট করুন' : 'Set Scale'}
              </button>
            </div>

            {scaleCheckMsg && (
              <div
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                  scaleCheckMsg.passed
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                    : 'bg-red-100 text-red-900'
                }`}
              >
                {scaleCheckMsg.text}
              </div>
            )}
            {scaleErrorMsg && <p className="text-xs text-red-600">{scaleErrorMsg}</p>}
          </div>
        )}
      </div>
    );
  } else if (step === 2) {
    // Step 2: Open Overlay map (e.g. RS)
    instruction =
      lang === 'bn'
        ? 'এবার দ্বিতীয় বা ওভারলে ম্যাপ (যেমন RS) খুলুন'
        : 'Open the second / overlay map (e.g. RS)';
    hint =
      lang === 'bn'
        ? 'হাল বা পরবর্তী জরিপের ম্যাপ (RS/BS) খুলুন; পরের ধাপে উভয় ম্যাপের সাধারণ খুঁটি বা কোণা মেলানো হবে।'
        : 'Load the RS / current survey map. Next step matches landmarks to align it onto the base map.';
    onBack = () => onStepChange(1);
    canGoNext = Boolean(baseLayer && overlayLayer);
    nextLabel = lang === 'bn' ? 'পরবর্তী: সাধারণ বিন্দু মেলান' : 'Next: Match Landmarks';
    onNext = () => {
      onSetPairPhase('base');
      onSetTool('pick-point');
      onStepChange(3);
    };

    const handleAttachOverlay = async (f: File) => {
      const layer = await onAttachRasterFile(f);
      if (layer) {
        // Place overlay neatly beside baseLayer so both are initially non-overlapping & easy to tap
        const offsetTx = baseLayer
          ? baseLayer.transform.tx +
            baseLayer.widthPx * baseLayer.transform.scaleFtPerPx +
            24
          : layer.transform.tx + 120;
        const offsetLayer: RasterLayer = {
          ...layer,
          transform: {
            ...layer.transform,
            tx: offsetTx,
            ty: baseLayer ? baseLayer.transform.ty : layer.transform.ty,
          },
          opacity: 0.7,
          visible: true,
        };
        onUpdateRaster(offsetLayer);
        onOverlayRasterIdChange(offsetLayer.id);
      }
    };

    body = (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#4A5550] dark:text-slate-300 shrink-0">
            {lang === 'bn' ? 'ওভারলে ধরন:' : 'Overlay Label:'}
          </span>
          {['RS (হাল)', 'BS', 'SA'].map((lbl) => (
            <button
              key={lbl}
              type="button"
              onClick={() => onOverlayMapLabelChange(lbl)}
              className={`min-h-[30px] rounded-lg border px-2.5 text-[11px] font-bold ${
                overlayMapLabel === lbl
                  ? 'border-[#B45309] bg-[#B45309] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex min-h-[58px] cursor-pointer items-center gap-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:border-[#B45309]">
            <Layers className="h-5 w-5 shrink-0 text-[#B45309]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">
                {lang === 'bn' ? `গ্যালারি থেকে ${overlayMapLabel}` : `Open ${overlayMapLabel}`}
              </div>
              <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {overlayLayer ? overlayLayer.name : lang === 'bn' ? 'JPG / PNG বেছে নিন' : 'Choose image'}
              </div>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f) await handleAttachOverlay(f);
              }}
            />
          </label>

          <label className="flex min-h-[58px] cursor-pointer items-center gap-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:border-[#B45309]">
            <Camera className="h-5 w-5 shrink-0 text-[#B45309]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">
                {lang === 'bn' ? 'ক্যামেরায় ছবি তুলুন' : 'Capture Camera'}
              </div>
              <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'দ্বিতীয় ম্যাপের ছবি' : 'Take overlay photo'}
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f) await handleAttachOverlay(f);
              }}
            />
          </label>
        </div>

        {overlayLayer && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F5132]" />
            <span className="truncate">
              {overlayMapLabel}: {overlayLayer.name}
            </span>
          </div>
        )}
      </div>
    );
  } else if (step === 3) {
    // Step 3: Match points (base -> overlay, >= 2 pairs, 3+ recommended)
    const nextPairNum = pairs.length + 1;
    instruction =
      pairPhase === 'base'
        ? lang === 'bn'
          ? `জোড়া ${formatNumber(nextPairNum, 0, lang)} (১/২): বেস ম্যাপ (${baseMapLabel})-এ একটি সাধারণ চিহ্ন ট্যাপ করুন`
          : `Pair #${nextPairNum} (1/2): Tap a landmark on the BASE map (${baseMapLabel})`
        : lang === 'bn'
        ? `জোড়া ${formatNumber(nextPairNum, 0, lang)} (২/২): ওভারলে ম্যাপ (${overlayMapLabel})-এ ঠিক একই চিহ্নটি ট্যাপ করুন`
        : `Pair #${nextPairNum} (2/2): Now tap the SAME landmark on the OVERLAY map (${overlayMapLabel})`;

    hint =
      lang === 'bn'
        ? 'ত্রিমোহনী/খুঁটি/পুকুরের কোণার মতো সাধারণ চিহ্ন বাছুন। কমপক্ষে ২ জোড়া লাগবে; ৩ বা ততোধিক জোড়া দিলে লিস্ট-স্কোয়ার অ্যালাইনমেন্ট আরও নিখুঁত হয়।'
        : 'Pick unmistakable shared features (road junctions, pillars, tank corners). At least 2 pairs required; 3+ enables least-squares fit.';
    onBack = () => onStepChange(2);
    canGoNext = pairs.length >= 2;
    nextLabel = lang === 'bn' ? 'স্বয়ংক্রিয় ওভারলে দেখুন' : 'View Aligned Overlay';
    onNext = () => {
      // Ensure both layers are clearly visible for Step 4 slider
      if (baseLayer) onUpdateRaster({ ...baseLayer, visible: true, opacity: 1 });
      if (overlayLayer) {
        onUpdateRaster({
          ...overlayLayer,
          visible: true,
          opacity: overlayLayer.opacity < 0.25 ? 0.6 : overlayLayer.opacity,
        });
      }
      onSetTool('select');
      onStepChange(4);
    };

    body = (
      <div className="space-y-2.5">
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-xs font-bold ${
            pairPhase === 'base'
              ? 'border-[#1E3A8A] bg-blue-50 dark:bg-blue-950/40 text-[#1E3A8A] dark:text-blue-200'
              : 'border-[#B45309] bg-amber-50 dark:bg-amber-950/40 text-[#B45309] dark:text-amber-200'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Crosshair className="h-4 w-4 shrink-0" />
            <span>
              {pairPhase === 'base'
                ? lang === 'bn'
                  ? `এখন ট্যাপ করুন: ${baseMapLabel} (বেস)`
                  : `Now Tap: ${baseMapLabel} (Base)`
                : lang === 'bn'
                ? `এখন ট্যাপ করুন: ${overlayMapLabel} (ওভারলে)`
                : `Now Tap: ${overlayMapLabel} (Overlay)`}
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
              ? `সম্পন্ন জোড়া: ${formatNumber(pairs.length, 0, lang)} টি (সর্বনিম্ন ২ · সুপারিশ ৩+)`
              : `Matched pairs: ${pairs.length} (min 2 · 3+ recommended)`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onUndoLastPairTap}
              disabled={pairs.length === 0 && pairPhase === 'base'}
              className="inline-flex items-center gap-1 rounded-lg border border-[#D4DBD6] dark:border-slate-700 px-2 py-1 text-[11px] font-semibold disabled:opacity-40"
            >
              <Undo2 className="h-3 w-3" />
              <span>{lang === 'bn' ? 'ফিরুন' : 'Undo'}</span>
            </button>
            <button
              type="button"
              onClick={onClearAllPairs}
              disabled={pairs.length === 0 && pairPhase === 'base'}
              className="rounded-lg border border-[#D4DBD6] dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-red-600 disabled:opacity-40"
            >
              {lang === 'bn' ? 'রিসেট' : 'Reset'}
            </button>
          </div>
        </div>

        {/* Horizontal Flip button for mirrored archival overlay maps */}
        {overlayLayer && onFlipOverlayHorizontal && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
            <span className="text-[#4A5550] dark:text-slate-300 truncate">
              {overlayLayer.flippedX
                ? lang === 'bn'
                  ? `${overlayMapLabel} উল্টানো আছে (Mirrored)`
                  : `${overlayMapLabel} horizontally flipped`
                : lang === 'bn'
                ? `পুরোনো ম্যাপ উল্টা (Mirror) থাকলে ফ্লিপ করুন:`
                : `Mirrored archival map? Flip before aligning:`}
            </span>
            <button
              type="button"
              disabled={isFlippingOverlay}
              onClick={() => void onFlipOverlayHorizontal()}
              className={`inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                overlayLayer.flippedX
                  ? 'border-[#B45309] bg-[#B45309] text-white'
                  : 'border-[#1E3A8A]/40 bg-[#1E3A8A]/8 text-[#1E3A8A] dark:text-blue-300'
              }`}
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
              <span>
                {isFlippingOverlay
                  ? lang === 'bn'
                    ? 'হচ্ছে…'
                    : 'Flipping…'
                  : lang === 'bn'
                  ? 'হরিজন্টাল ফ্লিপ'
                  : 'Flip Horizontal'}
              </span>
            </button>
          </div>
        )}

        <label className="flex items-center gap-2 text-[11px] text-[#4A5550] dark:text-slate-300">
          <input
            type="checkbox"
            checked={autoFocusTap}
            onChange={(e) => onAutoFocusTapChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#1E3A8A]"
          />
          <span>
            {lang === 'bn'
              ? 'ট্যাপ করার সময় কেবল সক্রিয় ম্যাপ স্পষ্ট রাখুন (সহজ বাছাই)'
              : 'Auto-highlight active map while tapping landmarks'}
          </span>
        </label>

        {pairs.length > 0 && (
          <div className="max-h-28 overflow-y-auto space-y-1">
            {pairs.map((pair, idx) => (
              <div
                key={pair.id}
                className="flex items-center justify-between rounded-lg border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2.5 py-1.5 text-[11px] tabular-nums"
              >
                <span className="font-semibold">
                  {lang === 'bn' ? `জোড়া P${formatNumber(idx + 1, 0, lang)}` : `Pair P${idx + 1}`}
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
                    onClick={() => onDeletePair(pair.id)}
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
    // Step 4: Aligned overlay controls: opacity slider & show/hide
    const rotDeg = overlayLayer
      ? (overlayLayer.transform.rotationRad * 180) / Math.PI
      : 0;

    instruction =
      lang === 'bn'
        ? 'ওভারলে ম্যাপ স্বয়ংক্রিয়ভাবে বসেছে — স্বচ্ছতা ও দৃশ্যমানতা মিলিয়ে দেখুন'
        : 'Overlay aligned automatically — adjust opacity and visibility';
    hint =
      lang === 'bn'
        ? 'স্লাইডার টেনে এবং দেখান/লুকান বাটন চেপে CS ও RS ম্যাপের সীমানা ও রাস্তা সঠিকভাবে মিলেছে কি না দেখুন।'
        : 'Use the opacity slider and show/hide toggle to verify CS and RS roads and plot edges match.';
    onBack = () => {
      onSetPairPhase('base');
      onSetTool('pick-point');
      onStepChange(3);
    };
    nextLabel = lang === 'bn' ? 'পরবর্তী: ত্রুটি যাচাই (RMS)' : 'Next: Check Error';
    onNext = () => onStepChange(5);

    body = (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs tabular-nums">
          <span className="font-bold text-[#0F5132] dark:text-emerald-300">
            {alignment?.method === 'least-squares'
              ? lang === 'bn'
                ? `লিস্ট-স্কোয়ার ফিট (${formatNumber(pairs.length, 0, lang)} জোড়া)`
                : `Least-Squares Fit (${pairs.length} pairs)`
              : lang === 'bn'
              ? '২-বিন্দু সিমিলারিটি ফিট'
              : '2-Point Similarity Fit'}
          </span>
          <span className="text-[11px] font-semibold">
            {lang === 'bn' ? 'ঘূর্ণন:' : 'Rot:'} {formatNumber(rotDeg, 2, lang)}°
          </span>
        </div>

        {overlayLayer && (
          <div className="space-y-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="flex items-center justify-between text-xs font-semibold tabular-nums">
              <span>
                {lang === 'bn'
                  ? `${overlayMapLabel} স্বচ্ছতা (Opacity): ${formatNumber(
                      Math.round(overlayLayer.opacity * 100),
                      0,
                      lang
                    )}%`
                  : `${overlayMapLabel} Opacity: ${Math.round(overlayLayer.opacity * 100)}%`}
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateRaster({
                    ...overlayLayer,
                    visible: !overlayLayer.visible,
                  })
                }
                className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold ${
                  overlayLayer.visible
                    ? 'bg-[#B45309] text-white'
                    : 'border border-[#D4DBD6] dark:border-slate-600'
                }`}
              >
                {overlayLayer.visible ? (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'ওভারলে দেখাচ্ছে' : 'Showing'}</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'ওভারলে লুকানো' : 'Hidden'}</span>
                  </>
                )}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(overlayLayer.opacity * 100)}
              onChange={(e) =>
                onUpdateRaster({
                  ...overlayLayer,
                  visible: true,
                  opacity: Number(e.target.value) / 100,
                })
              }
              className="w-full accent-[#B45309]"
            />
          </div>
        )}

        {baseLayer && (
          <div className="flex items-center justify-between rounded-xl border border-[#E5E9E4] dark:border-slate-700 px-3 py-2 text-xs">
            <span className="font-semibold">
              {lang === 'bn' ? `বেস ম্যাপ (${baseMapLabel})` : `Base Map (${baseMapLabel})`}
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateRaster({
                  ...baseLayer,
                  visible: !baseLayer.visible,
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2.5 py-1 text-xs font-semibold"
            >
              {baseLayer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span>
                {baseLayer.visible
                  ? lang === 'bn'
                    ? 'দেখুন / লুকান'
                    : 'Visible'
                  : lang === 'bn'
                  ? 'লুকানো'
                  : 'Hidden'}
              </span>
            </button>
          </div>
        )}
      </div>
    );
  } else if (step === 5) {
    // Step 5: Alignment error (residual per point and RMS) + high error warning
    instruction =
      lang === 'bn'
        ? 'অ্যালাইনমেন্ট ত্রুটি (প্রতি বিন্দু ও RMS) যাচাই করুন'
        : 'Inspect alignment error (residual per point and RMS)';
    onBack = () => onStepChange(4);
    nextLabel = lang === 'bn' ? 'পরবর্তী: CS ও RS দাগ আঁকুন' : 'Next: Trace CS & RS Dag';
    onNext = () => {
      onSetTool('select');
      onStepChange(6);
    };

    body = (
      <div className="space-y-2.5 tabular-nums">
        <div
          className={`rounded-xl border p-3 ${
            highError
              ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
              : 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold">
              {highError ? (
                <ShieldAlert className="h-4 w-4 text-red-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-[#0F5132]" />
              )}
              <span>
                {lang === 'bn' ? 'RMS গড় ত্রুটি:' : 'RMS Alignment Error:'}
              </span>
            </span>
            <span className="text-lg font-bold">
              {formatNumber(rmsFt, 2, lang)} {lang === 'bn' ? 'ফুট' : 'ft'}
            </span>
          </div>
          <div className="mt-1 text-[11px]">
            {lang === 'bn'
              ? `সর্বোচ্চ ত্রুটি: ${formatNumber(maxErrFt, 2, lang)} ফু (${formatNumber(
                  maxErrFt / 0.66,
                  1,
                  lang
                )} লিংক) · পদ্ধতি: ${
                  alignment?.method === 'least-squares'
                    ? 'লিস্ট-স্কোয়ার (৩+)'
                    : '২-বিন্দু সিমিলারিটি'
                }`
              : `Max residual: ${maxErrFt.toFixed(2)} ft (${(maxErrFt / 0.66).toFixed(1)} links) · ${
                  alignment?.method === 'least-squares' ? 'Least-Squares' : '2-Pt Similarity'
                }`}
          </div>
        </div>

        {pairs.length === 2 && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
            {lang === 'bn'
              ? '২ জোড়া বিন্দুতে সিমিলারিটি ফিট ত্রুটি ০.০০ ফু হয়। প্রকৃত কাগজের সংকোচন ও ত্রুটি পরিমাপ করতে ধাপ ৩-এ গিয়ে আরও ১–২টি বিন্দু যোগ করুন।'
              : 'A 2-point similarity transform always has 0.00 ft residual. Add a 3rd+ tie point in Step 3 to measure true RMS fit error.'}
          </div>
        )}

        {highError && (
          <div className="rounded-xl border border-red-400 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-900 dark:text-red-200 space-y-1.5">
            <div className="font-bold">
              {lang === 'bn'
                ? 'সতর্কতা: অ্যালাইনমেন্ট ত্রুটি বেশি (>৩ ফুট)!'
                : 'Warning: High alignment error (> 3 ft)!'}
            </div>
            <p className="text-[11px]">
              {lang === 'bn'
                ? 'কোনো একটি চিহ্ন ভুল জায়গায় ট্যাপ হয়ে থাকতে পারে অথবা ম্যাপ বাঁকা। লাল চিহ্নিত জোড়াটি বাদ দিয়ে পুনরায় ট্যাপ করুন।'
                : 'One or more landmarks may be mismatched or distorted. Remove the worst pair and re-pick carefully.'}
            </p>
            <button
              type="button"
              onClick={() => {
                onSetPairPhase('base');
                onSetTool('pick-point');
                onStepChange(3);
              }}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white"
            >
              {lang === 'bn' ? 'ধাপ ৩-এ বিন্দু ঠিক করুন' : 'Refine Pairs in Step 3'}
            </button>
          </div>
        )}

        <div className="max-h-28 overflow-y-auto space-y-1">
          {pairs.map((p, idx) => {
            const err = residuals[idx] ?? 0;
            const bad = err > 3.0;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-[#E5E9E4] dark:border-slate-700 px-2.5 py-1.5 text-xs"
              >
                <span className="font-semibold">
                  {lang === 'bn' ? `বিন্দু P${formatNumber(idx + 1, 0, lang)}` : `Point P${idx + 1}`}
                </span>
                <span
                  className={`font-bold ${
                    bad ? 'text-red-600' : 'text-[#0F5132] dark:text-emerald-400'
                  }`}
                >
                  {formatNumber(err, 2, lang)} {lang === 'bn' ? 'ফু' : 'ft'} (
                  {formatNumber(err / 0.66, 1, lang)} {lang === 'bn' ? 'লিংক' : 'lk'})
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  } else if (step === 6) {
    // Step 6: Trace one dag polygon on CS and one on RS
    const isTracingNow = draftPoints.length > 0;
    instruction =
      lang === 'bn'
        ? `${baseMapLabel} ও ${overlayMapLabel} ম্যাপে ১টি করে দাগ সীমানা আঁকুন`
        : `Trace 1 dag polygon on ${baseMapLabel} and 1 on ${overlayMapLabel}`;
    hint =
      lang === 'bn'
        ? 'প্রথমে CS (সাবেক) দাগের কোণাগুলো ট্যাপ করে "শেষ করুন" চাপুন, তারপর RS (হাল) দাগের কোণাগুলো ট্যাপ করে "শেষ করুন" চাপুন।'
        : 'Trace the CS polygon first and tap Finish, then switch to RS and trace the RS polygon.';
    onBack = () => {
      onCancelDraft();
      onSetTool('select');
      onStepChange(5);
    };
    canGoNext = Boolean(basePoly && overlayPoly);
    nextLabel = lang === 'bn' ? 'ফলাফল ও ওভারল্যাপ দেখুন' : 'View Overlap Result';
    onNext = () => {
      onSetTool('select');
      if (baseLayer) onUpdateRaster({ ...baseLayer, visible: true, opacity: 1 });
      if (overlayLayer) onUpdateRaster({ ...overlayLayer, visible: true, opacity: 0.55 });
      onStepChange(7);
    };

    body = (
      <div className="space-y-2.5">
        {isTracingNow && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#0F5132] bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs">
            <span className="font-bold">
              {traceTarget === 'base'
                ? lang === 'bn'
                  ? `${baseMapLabel} আঁকা হচ্ছে: ${formatNumber(draftPoints.length, 0, lang)} বিন্দু`
                  : `Tracing ${baseMapLabel}: ${draftPoints.length} pts`
                : lang === 'bn'
                ? `${overlayMapLabel} আঁকা হচ্ছে: ${formatNumber(draftPoints.length, 0, lang)} বিন্দু`
                : `Tracing ${overlayMapLabel}: ${draftPoints.length} pts`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onUndoDraftPoint}
                className="rounded-lg border border-[#D4DBD6] bg-white dark:bg-slate-900 px-2 py-1 font-semibold"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={draftPoints.length < 3}
                onClick={() =>
                  onFinishTraceDag(
                    traceTarget,
                    traceTarget === 'base' ? baseDagNo : overlayDagNo,
                    draftPoints
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg bg-[#0F5132] px-2.5 py-1 font-bold text-white disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{lang === 'bn' ? 'শেষ করুন' : 'Finish'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Base (CS) Dag Row */}
        <div className="rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-[#1E3A8A] dark:text-blue-300">
              ১) {baseMapLabel}{' '}
              {basePoly &&
                `(${formatNumber(polygonAreaSqFt(basePoly.points) / 435.6, 2, lang)} ${
                  lang === 'bn' ? 'শতক' : 'sh'
                })`}
            </div>
            <input
              type="text"
              value={baseDagNo}
              onChange={(e) => onBaseDagNoChange(e.target.value)}
              placeholder={lang === 'bn' ? 'সাবেক দাগ নং' : 'CS Dag #'}
              className="w-24 rounded-lg border border-blue-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onStartTraceDag('base', baseDagNo)}
              className="flex-1 inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[#1D4ED8] text-xs font-bold text-white"
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              <span>
                {basePoly
                  ? lang === 'bn'
                    ? `${baseMapLabel} দাগ পুনরায় আঁকুন`
                    : `Re-trace ${baseMapLabel}`
                  : lang === 'bn'
                  ? `${baseMapLabel} দাগ আঁকুন`
                  : `Trace ${baseMapLabel} Dag`}
              </span>
            </button>
            {polygons.length > 0 && (
              <select
                value={basePolyId || ''}
                onChange={(e) => onBasePolyIdChange(e.target.value || null)}
                className="max-w-[125px] min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
              >
                <option value="">{lang === 'bn' ? 'বাছুন...' : 'Pick...'}</option>
                {polygons.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    {p.plotNumber || `#${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Overlay (RS) Dag Row */}
        <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-[#B91C1C] dark:text-red-300">
              ২) {overlayMapLabel}{' '}
              {overlayPoly &&
                `(${formatNumber(polygonAreaSqFt(overlayPoly.points) / 435.6, 2, lang)} ${
                  lang === 'bn' ? 'শতক' : 'sh'
                })`}
            </div>
            <input
              type="text"
              value={overlayDagNo}
              onChange={(e) => onOverlayDagNoChange(e.target.value)}
              placeholder={lang === 'bn' ? 'হাল দাগ নং' : 'RS Dag #'}
              className="w-24 rounded-lg border border-red-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onStartTraceDag('overlay', overlayDagNo)}
              className="flex-1 inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[#DC2626] text-xs font-bold text-white"
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              <span>
                {overlayPoly
                  ? lang === 'bn'
                    ? `${overlayMapLabel} দাগ পুনরায় আঁকুন`
                    : `Re-trace ${overlayMapLabel}`
                  : lang === 'bn'
                  ? `${overlayMapLabel} দাগ আঁকুন`
                  : `Trace ${overlayMapLabel} Dag`}
              </span>
            </button>
            {polygons.length > 0 && (
              <select
                value={overlayPolyId || ''}
                onChange={(e) => onOverlayPolyIdChange(e.target.value || null)}
                className="max-w-[125px] min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
              >
                <option value="">{lang === 'bn' ? 'বাছুন...' : 'Pick...'}</option>
                {polygons.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    {p.plotNumber || `#${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    // Step 7: Overlap Result in Shotok & % of Each + Add to Report
    const overlap =
      basePoly && overlayPoly
        ? computePolygonOverlapMetrics(
            basePoly.points,
            overlayPoly.points,
            doc.unitProfile
          )
        : null;

    instruction =
      lang === 'bn'
        ? `${baseMapLabel} ও ${overlayMapLabel} দাগের ওভারল্যাপ ফলাফল`
        : `${baseMapLabel} vs ${overlayMapLabel} Overlap Result`;
    onBack = () => onStepChange(6);
    nextLabel = lang === 'bn' ? 'সম্পন্ন' : 'Done';
    onNext = onClose;

    const currentRecord: DemarcationRecord | null =
      basePoly && overlayPoly
        ? {
            id: `dem-${basePoly.id}-${overlayPoly.id}`,
            createdAt: Date.now(),
            baseMapLabel,
            overlayMapLabel,
            baseDagNo: baseDagNo || basePoly.plotNumber || 'CS',
            overlayDagNo: overlayDagNo || overlayPoly.plotNumber || 'RS',
            basePolygonId: basePoly.id,
            overlayPolygonId: overlayPoly.id,
            basePolygon: basePoly.points,
            overlayPolygon: overlayPoly.points,
            rmsErrorFt: rmsFt,
          }
        : null;

    body = overlap ? (
      <div className="space-y-3 tabular-nums">
        <div className="rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 p-3">
          <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
            {lang === 'bn'
              ? 'মিলিত ওভারল্যাপ অংশ (Overlap Area)'
              : 'Overlapping Area (CS ∩ RS)'}
          </div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-[#B45309] dark:text-amber-300">
              {formatNumber(overlap.overlapBreakdown.shotok, 3, lang)}{' '}
              {lang === 'bn' ? 'শতক' : 'shotok'}
            </span>
            <span className="text-xs font-semibold text-[#4A5550] dark:text-slate-300">
              {formatNumber(overlap.overlapAreaSqFt, 1, lang)}{' '}
              {lang === 'bn' ? 'ব.ফু.' : 'sq ft'} ·{' '}
              {formatNumber(overlap.overlapBreakdown.katha, 3, lang)}{' '}
              {lang === 'bn' ? 'কাঠা' : 'katha'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 p-2.5">
            <div className="text-[11px] text-[#1E3A8A] dark:text-blue-300 font-semibold">
              {baseMapLabel} {lang === 'bn' ? 'দাগ' : 'Dag'} {baseDagNo}
            </div>
            <div className="text-base font-bold text-[#1E3A8A] dark:text-blue-200">
              {formatNumber(overlap.percentOfBase, 1, lang)}%
            </div>
            <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
              {lang === 'bn' ? 'মোট:' : 'Total:'}{' '}
              {formatNumber(overlap.baseBreakdown.shotok, 3, lang)}{' '}
              {lang === 'bn' ? 'শতক' : 'sh'}
            </div>
          </div>

          <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 p-2.5">
            <div className="text-[11px] text-[#B91C1C] dark:text-red-300 font-semibold">
              {overlayMapLabel} {lang === 'bn' ? 'দাগ' : 'Dag'} {overlayDagNo}
            </div>
            <div className="text-base font-bold text-[#B91C1C] dark:text-red-200">
              {formatNumber(overlap.percentOfOverlay, 1, lang)}%
            </div>
            <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
              {lang === 'bn' ? 'মোট:' : 'Total:'}{' '}
              {formatNumber(overlap.overlayBreakdown.shotok, 3, lang)}{' '}
              {lang === 'bn' ? 'শতক' : 'sh'}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30 p-2 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700" />
          <span>{t.disclaimer.rasterBody}</span>
        </div>

        {currentRecord && (
          <button
            type="button"
            disabled={reportSavedForCurrent}
            onClick={() => onAddResultToReport(currentRecord)}
            className={`flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl text-xs font-bold ${
              reportSavedForCurrent
                ? 'border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-[#0F5132] dark:text-emerald-300'
                : 'bg-[#1E3A8A] text-white'
            }`}
          >
            <BookmarkCheck className="h-4 w-4" />
            <span>
              {reportSavedForCurrent
                ? lang === 'bn'
                  ? 'ফলাফল টেবিল রিপোর্টে যুক্ত হয়েছে'
                  : 'Added Result Table to Report'
                : lang === 'bn'
                ? 'ফলাফল টেবিল রিপোর্টে যোগ করুন'
                : 'Add Result Table to Report'}
            </span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExportPdf}
            className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] dark:bg-emerald-600 text-xs font-semibold text-white"
          >
            <Download className="h-4 w-4" />
            <span>{t.actions.exportPdf}</span>
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 text-xs font-semibold"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />
            <span>{t.actions.exportCsv}</span>
          </button>
        </div>
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-[#CBD5E1] p-4 text-center text-xs text-[#64748B]">
        {lang === 'bn'
          ? 'আগের ধাপে CS ও RS উভয় দাগ আঁকুন।'
          : 'Trace both CS and RS polygons in Step 6 first.'}
      </div>
    );
  }

  return (
    <WizardFramework
      title={t.wizards.demarcation.title}
      icon={<Layers className="h-4 w-4 text-[#1E3A8A] dark:text-blue-400" />}
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
