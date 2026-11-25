import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkPlus,
  Camera,
  Check,
  CheckCircle2,
  Compass,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Layers,
  Maximize2,
  MousePointerClick,
  RotateCcw,
  Ruler,
  Scissors,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import {
  CadDocument,
  DemarcationRecord,
  PolygonEntity,
  RasterLayer,
} from '../core/cad/types';
import {
  partitionPolygonEqualParts,
  rasterPixelToWorld,
  solveRasterTransformFromTwoPoints,
  splitPolygonByTargetArea,
  worldToRasterPixel,
} from '../core/cad/geometry';
import {
  buildQuadFromSidesAndDiagonal,
  computeAreaBreakdown,
  heronAreaSqFt,
  measurePolygonFromGeometry,
  measurePolylineFromGeometry,
  polygonAreaSqFt,
  polygonPerimeterFt,
} from '../core/survey/area';
import { formatDMS, wcbToReducedBearing } from '../core/survey/bearing';
import { Point2D, distance2D } from '../core/survey/coordinates';
import {
  checkScaleAccuracy,
  computePixelsPerFootFromMapScale,
  computePixelsPerInch,
  computeScaleFromBar,
} from '../core/survey/scale';
import {
  AreaUnit,
  LinearUnit,
  formatNumber,
  fromFeet,
  getAreaUnitLabel,
  getLinearUnitLabel,
  parseLocalizedNumber,
  toFeet,
  toSqFt,
} from '../core/survey/units';
import { ActiveTool } from './CadCanvas';
import { Lang, getTranslations } from './i18n';
import { WizardKind } from './HomeScreen';
import { WizardFramework } from './WizardFramework';
import { RasterScaleTab } from './RasterScaleSheet';
import { DemarcationWizard } from './DemarcationWizard';
import { PantographSessionProps, PantographWizard } from './PantographWizard';
import { MapJointSessionProps, MapJointWizard } from './MapJointWizard';
import { PlotDivisionSessionProps, PlotDivisionWizard } from './PlotDivisionWizard';

export type { MapJointSessionProps, PantographSessionProps, PlotDivisionSessionProps };

export interface DemarcationSessionProps {
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
}

export interface WizardMeasuredShape {
  mode: 'area' | 'distance';
  points: Point2D[];
  savedPlotId?: string;
}

interface WizardSheetProps {
  wizard: WizardKind;
  doc: CadDocument;
  lang: Lang;
  draftPoints: Point2D[];
  selectedIds: string[];
  pickedPoints: Point2D[];
  onClearPickedPoints: () => void;
  onSetTool: (tool: ActiveTool) => void;
  onUndoDraftPoint: () => void;
  onFinishDraftPolygon: () => void;
  onCancelDraft: () => void;
  onCreatePolygon: (pts: Point2D[], meta?: Partial<PolygonEntity>) => void;
  onAttachRasterFile: (file: File) => Promise<RasterLayer | null>;
  onUpdateRaster: (layer: RasterLayer) => void;
  scannerPixelsPerInch?: number | null;
  onSaveScannerPpi?: (ppi: number | null) => void;
  measuredShape?: WizardMeasuredShape | null;
  onFinishWizardMeasure?: (mode: 'area' | 'distance', points: Point2D[]) => void;
  onSaveMeasurementAsPlot?: (
    mode: 'area' | 'distance',
    points: Point2D[],
    meta: { plotNumber?: string; ownerName?: string }
  ) => void;
  onClearMeasurementPreview?: () => void;
  wizardStep?: number;
  onWizardStepChange?: (step: number) => void;
  onPantographScale: (sourceId: string, factor: number, offsetAside: boolean) => void;
  onDemarcatePlot: (
    sourceId: string,
    parts: Point2D[][],
    addPillars: boolean
  ) => void;
  onSelectEntity: (id: string) => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  onJumpToWorkspace: () => void;
  onOpenScaleSheet?: (tab: RasterScaleTab) => void;
  demarcationSession?: DemarcationSessionProps;
  pantographSession?: PantographSessionProps;
  mapJointSession?: MapJointSessionProps;
  plotDivisionSession?: PlotDivisionSessionProps;
  orgInfo?: { organizationName?: string; phoneNumber?: string };
  onClose: () => void;
}

export const WizardSheet: React.FC<WizardSheetProps> = ({
  wizard,
  doc,
  lang,
  draftPoints,
  selectedIds,
  pickedPoints,
  onClearPickedPoints,
  onSetTool,
  onUndoDraftPoint,
  onFinishDraftPolygon,
  onCancelDraft,
  onCreatePolygon,
  onAttachRasterFile,
  onUpdateRaster,
  scannerPixelsPerInch = null,
  onSaveScannerPpi,
  measuredShape = null,
  onFinishWizardMeasure,
  onSaveMeasurementAsPlot,
  onClearMeasurementPreview,
  wizardStep,
  onWizardStepChange,
  onPantographScale,
  onDemarcatePlot,
  onSelectEntity,
  onExportPdf,
  onExportCsv,
  onJumpToWorkspace,
  onOpenScaleSheet,
  demarcationSession,
  pantographSession,
  mapJointSession,
  plotDivisionSession,
  orgInfo,
  onClose,
}) => {
  const t = getTranslations(lang);
  const [localStep, setLocalStep] = useState(1);
  const step = wizardStep ?? localStep;
  const setStep = (s: number) => {
    setLocalStep(s);
    onWizardStepChange?.(s);
  };
  const [errorMsg, setErrorMsg] = useState('');

  // Measure wizard state (6-step guided flow)
  const [measureGoal, setMeasureGoal] = useState<'area' | 'distance' | 'tape'>('area');
  const [scaleSubMode, setScaleSubMode] = useState<'bar' | 'mapscale' | 'check'>('bar');
  const [tapeShape, setTapeShape] = useState<'quad' | 'tri'>('quad');
  const [tapeUnit, setTapeUnit] = useState<LinearUnit>('ft');
  const [s1, setS1] = useState('60');
  const [s2, setS2] = useState('40');
  const [s3, setS3] = useState('60');
  const [s4, setS4] = useState('40');
  const [diag, setDiag] = useState('72.1');
  const [calDist, setCalDist] = useState('1');
  const [calUnit, setCalUnit] = useState<LinearUnit>('chain');
  const [saveScannerDpi, setSaveScannerDpi] = useState(false);
  const [calInchesPerMile, setCalInchesPerMile] = useState('16');
  const [checkDist, setCheckDist] = useState('1');
  const [checkUnit, setCheckUnit] = useState<LinearUnit>('chain');
  const [calRasterId, setCalRasterId] = useState<string | null>(null);
  const [plotNumInput, setPlotNumInput] = useState('');
  const [ownerInput, setOwnerInput] = useState('');

  // Pantograph wizard state
  const [srcScale, setSrcScale] = useState<number>(16);
  const [dstScale, setDstScale] = useState<number>(32);
  const [customFactor, setCustomFactor] = useState('2');
  const [usePresetScale, setUsePresetScale] = useState(true);
  const [offsetAside, setOffsetAside] = useState(true);

  // Joint wizard state
  const [sheet1Id, setSheet1Id] = useState<string | null>(doc.rasterLayers[0]?.id || null);
  const [sheet2Id, setSheet2Id] = useState<string | null>(doc.rasterLayers[1]?.id || null);

  // Demarcation wizard state
  const [splitType, setSplitType] = useState<'equal' | 'exact'>('equal');
  const [equalParts, setEqualParts] = useState('2');
  const [exactAmount, setExactAmount] = useState('5');
  const [exactUnit, setExactUnit] = useState<AreaUnit>('shotok');
  const [cutAngle, setCutAngle] = useState<number>(90);
  const [addPillars, setAddPillars] = useState(true);

  const polygons = doc.entities.filter(
    (e): e is PolygonEntity => e.kind === 'polygon'
  );
  const selectedPoly =
    polygons.find((p) => selectedIds.includes(p.id)) ||
    polygons[polygons.length - 1] ||
    null;

  const hasRaster = doc.hasRasterMeasurement || doc.rasterLayers.length > 0;

  const renderAreaSummaryFromPoints = (points: Point2D[], showExports = true) => {
    const measured = measurePolygonFromGeometry(points, doc.unitProfile);
    const b = measured.breakdown;
    const perim = measured.perimeterFt;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 tabular-nums">
          <div className="rounded-xl border border-[#0F5132]/40 dark:border-emerald-700 bg-[#0F5132]/8 dark:bg-emerald-950/40 p-2.5">
            <div className="text-[11px] text-[#4A5550] dark:text-slate-300">
              {lang === 'bn' ? 'শতক (Shotok)' : 'Shotok'}
            </div>
            <div className="text-lg font-bold text-[#0F5132] dark:text-emerald-400">
              {formatNumber(b.shotok, 3, lang)}
            </div>
          </div>
          <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
            <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
              {lang === 'bn'
                ? `কাঠা (${formatNumber(doc.unitProfile.kathaSqFt, 0, lang)} ব.ফু.)`
                : `Katha (${doc.unitProfile.kathaSqFt} sq ft)`}
            </div>
            <div className="text-lg font-bold text-[#141A17] dark:text-white">
              {formatNumber(b.katha, 3, lang)}
            </div>
          </div>
          <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
            <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
              {lang === 'bn'
                ? `বিঘা (${formatNumber(doc.unitProfile.bighaShotok, 0, lang)} শতক)`
                : `Bigha (${doc.unitProfile.bighaShotok} sh)`}
            </div>
            <div className="text-base font-bold text-[#141A17] dark:text-white">
              {formatNumber(b.bigha, 4, lang)}
            </div>
          </div>
          <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
            <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
              {lang === 'bn' ? 'একর (Acre)' : 'Acre'}
            </div>
            <div className="text-base font-bold text-[#141A17] dark:text-white">
              {formatNumber(b.acre, 4, lang)}
            </div>
          </div>
          <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
            <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
              {lang === 'bn' ? 'বর্গফুট (Sq Ft)' : 'Sq Ft'}
            </div>
            <div className="text-base font-bold text-[#141A17] dark:text-white">
              {formatNumber(b.sqFt, 1, lang)}
            </div>
          </div>
          <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
            <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
              {lang === 'bn' ? 'বর্গমিটার (Sq M)' : 'Sq M'}
            </div>
            <div className="text-base font-bold text-[#141A17] dark:text-white">
              {formatNumber(b.sqM, 2, lang)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs tabular-nums">
          <span className="text-[#4A5550] dark:text-slate-400">
            {lang === 'bn' ? 'মোট পরিসীমা (Perimeter)' : 'Perimeter'}
          </span>
          <span className="font-semibold">
            {formatNumber(perim, 2, lang)} {lang === 'bn' ? 'ফুট' : 'ft'} (
            {formatNumber(perim / 66, 3, lang)} {lang === 'bn' ? 'চেইন' : 'ch'})
          </span>
        </div>

        {hasRaster && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
            <span>{t.disclaimer.rasterBody}</span>
          </div>
        )}

        {showExports && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onExportPdf}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              <span>{t.actions.exportPdf}</span>
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />
              <span>{t.actions.exportCsv}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderAreaSummary = (poly: PolygonEntity) =>
    renderAreaSummaryFromPoints(poly.points, true);

  if (wizard === 'demarcation' && demarcationSession) {
    return (
      <DemarcationWizard
        doc={doc}
        lang={lang}
        step={step}
        onStepChange={setStep}
        draftPoints={draftPoints}
        pickedPoints={pickedPoints}
        onClearPickedPoints={onClearPickedPoints}
        onSetTool={onSetTool}
        onUndoDraftPoint={onUndoDraftPoint}
        onCancelDraft={onCancelDraft}
        onAttachRasterFile={onAttachRasterFile}
        onUpdateRaster={onUpdateRaster}
        {...demarcationSession}
        onExportPdf={onExportPdf}
        onExportCsv={onExportCsv}
        onJumpToWorkspace={onJumpToWorkspace}
        onClose={onClose}
      />
    );
  }

  if (wizard === 'pantograph' && pantographSession) {
    return (
      <PantographWizard
        doc={doc}
        lang={lang}
        step={step}
        onStepChange={setStep}
        pickedPoints={pickedPoints}
        onClearPickedPoints={onClearPickedPoints}
        onSetTool={onSetTool}
        onAttachRasterFile={onAttachRasterFile}
        onUpdateRaster={onUpdateRaster}
        scannerPixelsPerInch={scannerPixelsPerInch}
        onSaveScannerPpi={onSaveScannerPpi}
        orgInfo={orgInfo}
        session={pantographSession}
        onJumpToWorkspace={onJumpToWorkspace}
        onClose={onClose}
      />
    );
  }

  if (wizard === 'joint' && mapJointSession) {
    return (
      <MapJointWizard
        doc={doc}
        lang={lang}
        step={step}
        onStepChange={setStep}
        pickedPoints={pickedPoints}
        onClearPickedPoints={onClearPickedPoints}
        onSetTool={onSetTool}
        onAttachRasterFile={onAttachRasterFile}
        onUpdateRaster={onUpdateRaster}
        scannerPixelsPerInch={scannerPixelsPerInch}
        onSaveScannerPpi={onSaveScannerPpi}
        orgInfo={orgInfo}
        session={mapJointSession}
        onJumpToWorkspace={onJumpToWorkspace}
        onClose={onClose}
      />
    );
  }

  if (wizard === 'partition' && plotDivisionSession) {
    return (
      <PlotDivisionWizard
        doc={doc}
        lang={lang}
        step={step}
        onStepChange={setStep}
        session={plotDivisionSession}
        onJumpToWorkspace={onJumpToWorkspace}
        onClose={onClose}
      />
    );
  }

  /* -------------------- Step Metadata & Handlers per Wizard -------------------- */
  let instruction = '';
  let hint = '';
  let body: React.ReactNode = null;
  let onBack: (() => void) | undefined = undefined;
  let onNext: (() => void) | undefined = undefined;
  let canGoNext = true;
  let nextLabel: string | undefined = undefined;

  if (wizard === 'measure') {
    const activeRaster =
      doc.rasterLayers.find((r) => r.id === calRasterId) ||
      doc.rasterLayers[doc.rasterLayers.length - 1] ||
      null;

    if (step === 1) {
      instruction =
        lang === 'bn'
          ? 'নকশা বা ম্যাপের ছবি খুলুন (গ্যালারি বা ক্যামেরা)'
          : 'Open a map image (gallery or camera)';
      hint =
        lang === 'bn'
          ? 'মৌজা ম্যাপ বা জমির স্কেচ থাকলে গ্যালারি বা ক্যামেরা থেকে খুলুন। ম্যাপ না থাকলে নিচের "ম্যাপ ছাড়া মাপুন" বাটনে চাপুন।'
          : 'Load a mouza map from Gallery or Camera (up to 20 MB), or continue directly on the blank survey grid.';
      nextLabel = activeRaster
        ? lang === 'bn'
          ? 'স্কেল সেট ও যাচাই করুন'
          : 'Set Scale & Check'
        : lang === 'bn'
        ? 'ম্যাপ ছাড়াই পরবর্তী ধাপ'
        : 'Continue Without Map';
      onNext = () => {
        setErrorMsg('');
        if (activeRaster) {
          onClearPickedPoints();
          onSetTool('pick-point');
          setScaleSubMode('bar');
          setStep(2);
        } else {
          setStep(3);
        }
      };

      body = (
        <div className="space-y-2.5">
          {activeRaster && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F5132] dark:text-emerald-400" />
                <span className="truncate font-semibold">{activeRaster.name}</span>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-[#0F5132] dark:text-emerald-400">
                {activeRaster.calibrated
                  ? lang === 'bn'
                    ? 'স্কেল সেট আছে'
                    : 'Calibrated'
                  : lang === 'bn'
                  ? 'স্কেল সেট বাকি'
                  : 'Needs Scale'}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex w-full min-h-[62px] cursor-pointer items-center gap-3 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-left hover:border-[#0F5132]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                <ImagePlus className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">
                  {lang === 'bn' ? 'গ্যালারি থেকে ম্যাপ' : 'Open from Gallery'}
                </div>
                <div className="text-xs text-[#4A5550] dark:text-slate-400 truncate">
                  {lang === 'bn' ? 'JPG / PNG (সর্বোচ্চ ২০ MB)' : 'JPG / PNG up to 20 MB'}
                </div>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (!file) return;
                  const layer = await onAttachRasterFile(file);
                  if (layer) {
                    setCalRasterId(layer.id);
                    onClearPickedPoints();
                    onSetTool('pick-point');
                    setScaleSubMode('bar');
                    setStep(2);
                  }
                }}
              />
            </label>

            <label className="flex w-full min-h-[62px] cursor-pointer items-center gap-3 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-left hover:border-[#0F5132]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F5132]/10 text-[#0F5132] dark:text-emerald-400">
                <Camera className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">
                  {lang === 'bn' ? 'ক্যামেরা দিয়ে ছবি' : 'Capture with Camera'}
                </div>
                <div className="text-xs text-[#4A5550] dark:text-slate-400 truncate">
                  {lang === 'bn' ? 'প্রতিবার বার ক্যালিব্রেশন লাগবে' : 'Bar calibration required'}
                </div>
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (!file) return;
                  const layer = await onAttachRasterFile(file);
                  if (layer) {
                    setCalRasterId(layer.id);
                    onClearPickedPoints();
                    onSetTool('pick-point');
                    setScaleSubMode('bar');
                    setStep(2);
                  }
                }}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => {
              setErrorMsg('');
              setStep(3);
            }}
            className="w-full min-h-[40px] rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 px-3 text-xs font-semibold text-[#4A5550] dark:text-slate-300 hover:border-[#0F5132]"
          >
            {lang === 'bn'
              ? 'ম্যাপ ছবি ছাড়াই সরাসরি ক্যানভাস / ফিতায় মাপুন →'
              : 'Measure directly without a map image →'}
          </button>
        </div>
      );
    } else if (step === 2) {
      const p1 = pickedPoints[0] || null;
      const p2 = pickedPoints[1] || null;

      const handleApplyBar = () => {
        setErrorMsg('');
        if (!activeRaster || !p1 || !p2) return;
        const px1 = worldToRasterPixel(p1, activeRaster.transform);
        const px2 = worldToRasterPixel(p2, activeRaster.transform);
        const pixelDist = distance2D(px1, px2);
        const barRes = computeScaleFromBar(
          pixelDist,
          parseLocalizedNumber(calDist),
          calUnit
        );
        const curDist = distance2D(p1, p2);
        if (curDist < 1e-6 || !barRes) {
          setErrorMsg(
            lang === 'bn'
              ? 'সঠিক দূরত্ব লিখুন এবং ২টি আলাদা প্রান্তে ট্যাপ করুন।'
              : 'Enter a positive distance and pick 2 distinct points.'
          );
          return;
        }
        const dirX = (p2.x - p1.x) / curDist;
        const dirY = (p2.y - p1.y) / curDist;
        const w2Target = {
          x: p1.x + dirX * barRes.realDistanceFt,
          y: p1.y + dirY * barRes.realDistanceFt,
        };
        const nextTransform = solveRasterTransformFromTwoPoints(px1, px2, p1, w2Target);
        if (!nextTransform) return;

        let inchesPerMile = activeRaster.inchesPerMile;
        if (saveScannerDpi && onSaveScannerPpi) {
          const n = parseLocalizedNumber(calInchesPerMile);
          const ppi = computePixelsPerInch(barRes.pixelsPerFoot, n);
          if (ppi) {
            inchesPerMile = n;
            onSaveScannerPpi(ppi);
          }
        }

        onUpdateRaster({
          ...activeRaster,
          transform: nextTransform,
          calibrated: true,
          pixelsPerFoot: barRes.pixelsPerFoot,
          inchesPerMile,
          calibrationMethod: 'bar',
        });
        onClearPickedPoints();
        setCheckDist(calDist);
        setCheckUnit(calUnit);
        setScaleSubMode('check');
        onSetTool('pick-point');
      };

      const handleApplyMapScale = () => {
        setErrorMsg('');
        if (!activeRaster || !scannerPixelsPerInch) return;
        const n = parseLocalizedNumber(calInchesPerMile);
        const res = computePixelsPerFootFromMapScale(scannerPixelsPerInch, n);
        if (!res) {
          setErrorMsg(
            lang === 'bn' ? 'সঠিক N মান লিখুন (যেমন ১৬ বা ৩২)।' : 'Enter valid N > 0.'
          );
          return;
        }
        const pxCenter: Point2D = {
          x: activeRaster.widthPx / 2,
          y: activeRaster.heightPx / 2,
        };
        const worldCenter = rasterPixelToWorld(pxCenter, activeRaster.transform);
        const sx = pxCenter.x * res.scaleFtPerPx;
        const sy = -pxCenter.y * res.scaleFtPerPx;
        const cos = Math.cos(activeRaster.transform.rotationRad);
        const sin = Math.sin(activeRaster.transform.rotationRad);
        onUpdateRaster({
          ...activeRaster,
          transform: {
            ...activeRaster.transform,
            tx: worldCenter.x - (sx * cos - sy * sin),
            ty: worldCenter.y - (sx * sin + sy * cos),
            scaleFtPerPx: res.scaleFtPerPx,
          },
          calibrated: true,
          pixelsPerFoot: res.pixelsPerFoot,
          inchesPerMile: n,
          calibrationMethod: 'scanner',
        });
        onClearPickedPoints();
        setScaleSubMode('check');
        onSetTool('pick-point');
      };

      const checkResult =
        p1 && p2
          ? checkScaleAccuracy(
              distance2D(p1, p2),
              toFeet(parseLocalizedNumber(checkDist), checkUnit),
              3
            )
          : null;

      instruction =
        lang === 'bn'
          ? 'স্কেল সেট করুন ও স্কেল বার যাচাই (≤৩%) চালান'
          : 'Set scale and run scale check (≤3%)';
      hint =
        lang === 'bn'
          ? 'আঙুল ধরে সরিয়ে লুপ দিয়ে স্কেল বারের দুই প্রান্ত ট্যাপ করুন। ফোনের ছবির জন্য প্রতিবার বার ক্যালিব্রেশন করুন।'
          : 'Use the loupe to pick both ends of the scale bar. Phone photos require bar calibration every time.';
      onBack = () => {
        onClearPickedPoints();
        setStep(1);
      };
      nextLabel = lang === 'bn' ? 'পরবর্তী: মাপের ধরন' : 'Next: What to Measure';
      onNext = () => {
        onClearPickedPoints();
        setStep(3);
      };

      body = !activeRaster ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 p-3 text-xs text-[#4A5550] dark:text-slate-300">
          {lang === 'bn'
            ? 'কোনো ম্যাপ ছবি লোড করা নেই। সরাসরি ক্যানভাসের ১ ফুট গ্রিডে মাপতে "পরবর্তী" চাপুন অথবা ফিরে গিয়ে ছবি খুলুন।'
            : 'No raster map attached. Tap Next to measure directly on the world coordinate grid, or go Back to attach a map.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F1F3EE] dark:bg-slate-800 p-1">
            {(
              [
                ['bar', lang === 'bn' ? 'স্কেল বার' : 'Scale Bar'],
                ['mapscale', lang === 'bn' ? '১ মাইল=N″' : '1mi=N″'],
                ['check', lang === 'bn' ? 'স্কেল যাচাই' : 'Scale Check'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setScaleSubMode(id);
                  onClearPickedPoints();
                  onSetTool('pick-point');
                }}
                className={`min-h-[34px] rounded-lg text-[11px] font-bold ${
                  scaleSubMode === id
                    ? 'bg-[#0F5132] text-white'
                    : 'text-[#4A5550] dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {scaleSubMode === 'bar' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span>
                  {lang === 'bn'
                    ? `স্কেল বারের ২ প্রান্ত: ${formatNumber(Math.min(2, pickedPoints.length), 0, lang)}/২`
                    : `Scale bar ends: ${Math.min(2, pickedPoints.length)}/2`}
                </span>
                <div className="flex items-center gap-3">
                  {onOpenScaleSheet && (
                    <button
                      type="button"
                      onClick={() => onOpenScaleSheet('calibrate')}
                      className="text-[11px] font-semibold text-[#B45309] underline"
                    >
                      {lang === 'bn' ? 'পূর্ণ স্কেল প্যানেল' : 'Full Panel'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onClearPickedPoints();
                      onSetTool('pick-point');
                    }}
                    className="font-semibold text-[#0F5132] dark:text-emerald-400 underline"
                  >
                    {lang === 'bn' ? 'রিসেট' : 'Reset'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 5, 10].map((c) => {
                  const active =
                    calUnit === 'chain' && parseLocalizedNumber(calDist) === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCalDist(String(c));
                        setCalUnit('chain');
                      }}
                      className={`min-h-[34px] rounded-lg border text-xs font-bold tabular-nums ${
                        active
                          ? 'border-[#0F5132] bg-[#0F5132] text-white'
                          : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {formatNumber(c, 0, lang)} {lang === 'bn' ? 'চেইন' : 'ch'}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-[1fr_95px_auto] gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={calDist}
                  onChange={(e) => setCalDist(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-sm font-mono-num"
                />
                <select
                  value={calUnit}
                  onChange={(e) => setCalUnit(e.target.value as LinearUnit)}
                  className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-medium"
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
                  onClick={handleApplyBar}
                  className="min-h-[38px] rounded-xl bg-[#0F5132] px-3 text-xs font-bold text-white disabled:opacity-40"
                >
                  {lang === 'bn' ? 'সেট ও যাচাই' : 'Set & Check'}
                </button>
              </div>

              <label className="flex items-center gap-2 text-[11px] text-[#4A5550] dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={saveScannerDpi}
                  onChange={(e) => setSaveScannerDpi(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0F5132]"
                />
                <span>
                  {lang === 'bn'
                    ? 'স্ক্যানার DPI সেভ করুন (১ মাইল = N″)'
                    : 'Save scanner DPI (1 mile = N″)'}
                </span>
                {saveScannerDpi && (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={calInchesPerMile}
                    onChange={(e) => setCalInchesPerMile(e.target.value)}
                    className="w-12 rounded border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-xs font-mono-num"
                  />
                )}
              </label>
            </div>
          )}

          {scaleSubMode === 'mapscale' && (
            <div className="space-y-2 text-xs">
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2 text-[11px] text-amber-900 dark:text-amber-200">
                {lang === 'bn'
                  ? 'ফোনের ছবির জন্য প্রতিবার "স্কেল বার" ব্যবহার করুন। একই স্ক্যানারের ম্যাপে সরাসরি ১ মাইল = N″ কাজ করে।'
                  : 'Phone photos require bar calibration every time. Direct 1 mile = N″ works for same-scanner maps.'}
              </div>
              {!scannerPixelsPerInch ? (
                <button
                  type="button"
                  onClick={() => {
                    setSaveScannerDpi(true);
                    setScaleSubMode('bar');
                  }}
                  className="w-full min-h-[38px] rounded-xl border border-[#0F5132] text-xs font-bold text-[#0F5132] dark:text-emerald-400"
                >
                  {lang === 'bn'
                    ? 'আগে স্কেল বার ক্যালিব্রেশন করে DPI সেভ করুন'
                    : 'Calibrate Bar & Save Scanner DPI First'}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {[16, 32, 64].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCalInchesPerMile(String(n))}
                      className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-bold ${
                        parseLocalizedNumber(calInchesPerMile) === n
                          ? 'border-[#0F5132] bg-[#0F5132] text-white'
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
                    className="w-16 min-h-[34px] rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-mono-num"
                  />
                  <button
                    type="button"
                    onClick={handleApplyMapScale}
                    className="flex-1 min-h-[34px] rounded-lg bg-[#0F5132] px-3 text-xs font-bold text-white"
                  >
                    {lang === 'bn' ? 'প্রয়োগ ও যাচাই' : 'Apply & Check'}
                  </button>
                </div>
              )}
            </div>
          )}

          {scaleSubMode === 'check' && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between tabular-nums">
                <span>
                  {lang === 'bn'
                    ? `স্কেল বারের ২ প্রান্ত ট্যাপ করুন (${formatNumber(
                        Math.min(2, pickedPoints.length),
                        0,
                        lang
                      )}/২)`
                    : `Tap scale bar ends (${Math.min(2, pickedPoints.length)}/2)`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClearPickedPoints();
                    onSetTool('pick-point');
                  }}
                  className="font-semibold text-[#0F5132] dark:text-emerald-400 underline"
                >
                  {lang === 'bn' ? 'পুনরায় ট্যাপ' : 'Re-pick'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 5, 10].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCheckDist(String(c));
                      setCheckUnit('chain');
                    }}
                    className={`min-h-[32px] rounded-lg border text-xs font-bold tabular-nums ${
                      checkUnit === 'chain' && parseLocalizedNumber(checkDist) === c
                        ? 'border-[#0F5132] bg-[#0F5132] text-white'
                        : 'border-[#D4DBD6] dark:border-slate-700'
                    }`}
                  >
                    {formatNumber(c, 0, lang)} {lang === 'bn' ? 'চেইন' : 'ch'}
                  </button>
                ))}
              </div>
              {checkResult &&
                (checkResult.passed ? (
                  <div className="rounded-xl border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 p-2.5 text-xs text-emerald-900 dark:text-emerald-200 tabular-nums">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        {lang === 'bn'
                          ? `স্কেল সঠিক! ত্রুটি ${formatNumber(checkResult.errorPercent, 2, lang)}%`
                          : `Scale Verified! Error ${checkResult.errorPercent.toFixed(2)}%`}
                      </span>
                    </div>
                    <div className="mt-1">
                      {lang === 'bn' ? 'মাপকৃত:' : 'Measured:'}{' '}
                      {formatNumber(checkResult.measuredFt, 2, lang)} ft ·{' '}
                      {lang === 'bn' ? 'প্রত্যাশিত:' : 'Expected:'}{' '}
                      {formatNumber(checkResult.expectedFt, 2, lang)} ft
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-500 bg-red-50 dark:bg-red-950/50 p-2.5 text-xs text-red-900 dark:text-red-200 tabular-nums space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-300">
                      <ShieldAlert className="h-4 w-4" />
                      <span>
                        {lang === 'bn'
                          ? `সতর্কতা: ত্রুটি ${formatNumber(checkResult.errorPercent, 2, lang)}% (>৩%)`
                          : `Warning: Error ${checkResult.errorPercent.toFixed(2)}% (>3%)`}
                      </span>
                    </div>
                    <div>
                      {lang === 'bn' ? 'মাপকৃত:' : 'Measured:'}{' '}
                      {formatNumber(checkResult.measuredFt, 2, lang)} ft vs{' '}
                      {lang === 'bn' ? 'প্রত্যাশিত:' : 'Expected:'}{' '}
                      {formatNumber(checkResult.expectedFt, 2, lang)} ft
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCalDist(checkDist);
                        setCalUnit(checkUnit);
                        setScaleSubMode('bar');
                        onClearPickedPoints();
                        onSetTool('pick-point');
                      }}
                      className="mt-1 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      {lang === 'bn' ? 'বার ক্যালিব্রেশনে ঠিক করুন' : 'Fix via Bar Calibration'}
                    </button>
                  </div>
                ))}
            </div>
          )}

          {errorMsg && <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>}
        </div>
      );
    } else if (step === 3) {
      instruction =
        lang === 'bn'
          ? 'আপনি কী মাপতে চান তা বেছে নিন'
          : 'Choose what to measure: distance or land area';
      hint =
        lang === 'bn'
          ? 'দুই বা ততোধিক বিন্দুর মধ্যকার দৈর্ঘ্য জানতে "দূরত্ব মাপুন", আর পুরো জমির শতক-কাঠা জানতে "জমির ক্ষেত্রফল মাপুন" বেছে নিন।'
          : 'Choose Distance for boundary/segment lengths, or Land Area for full shotok/katha/bigha/acre area.';
      onBack = () => {
        if (activeRaster) {
          onClearPickedPoints();
          onSetTool('pick-point');
          setStep(2);
        } else {
          setStep(1);
        }
      };

      body = (
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              setMeasureGoal('area');
              onClearMeasurementPreview?.();
              onCancelDraft();
              onSetTool('measure-area');
              setStep(4);
            }}
            className="flex w-full min-h-[60px] items-center gap-3 rounded-xl border-2 border-[#0F5132]/40 dark:border-emerald-700 bg-white dark:bg-slate-800 p-3 text-left hover:border-[#0F5132]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F5132]/12 text-[#0F5132] dark:text-emerald-400">
              <MousePointerClick className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold">
                {lang === 'bn' ? 'জমির ক্ষেত্রফল মাপুন' : 'Measure Land Area'}
              </div>
              <div className="text-xs text-[#4A5550] dark:text-slate-400">
                {lang === 'bn'
                  ? 'কোণাগুলো ট্যাপ করে শতক, কাঠা, বিঘা, একর ও পরিসীমা দেখুন'
                  : 'Tap corners for shotok, katha, bigha, acre, sq ft, sq m & perimeter'}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-[#0F5132]" />
          </button>

          <button
            type="button"
            onClick={() => {
              setMeasureGoal('distance');
              onClearMeasurementPreview?.();
              onCancelDraft();
              onSetTool('measure-path');
              setStep(4);
            }}
            className="flex w-full min-h-[60px] items-center gap-3 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-left hover:border-[#0369A1]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/40 text-[#0369A1] dark:text-sky-300">
              <Ruler className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold">
                {lang === 'bn' ? 'দূরত্ব মাপুন' : 'Measure Distance'}
              </div>
              <div className="text-xs text-[#4A5550] dark:text-slate-400">
                {lang === 'bn'
                  ? 'দুই বা একাধিক প্রান্ত ট্যাপ করে ফুট, চেইন, হাত ও গজে দৈর্ঘ্য মাপুন'
                  : 'Tap 2+ points with the loupe to measure distance & bearings'}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-[#64748B]" />
          </button>

          <button
            type="button"
            onClick={() => {
              setMeasureGoal('tape');
              setErrorMsg('');
              setStep(4);
            }}
            className="flex w-full min-h-[46px] items-center justify-between rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 px-3 py-2 text-xs font-semibold text-[#4A5550] dark:text-slate-300 hover:border-[#0F5132]"
          >
            <span>
              {lang === 'bn'
                ? 'মাঠের ফিতার মাপ লিখে হিসাব করুন (৪ বাহু + কর্ণ / ৩ বাহু)'
                : 'Or enter field tape sides & diagonal manually'}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    } else if (step === 4 && measureGoal === 'tape') {
      const handleBuildTape = () => {
        setErrorMsg('');
        const f1 = toFeet(parseLocalizedNumber(s1), tapeUnit);
        const f2 = toFeet(parseLocalizedNumber(s2), tapeUnit);
        const f3 = toFeet(parseLocalizedNumber(s3), tapeUnit);
        let pts: Point2D[] | null = null;
        if (tapeShape === 'tri') {
          if (!heronAreaSqFt(f1, f2, f3)) {
            setErrorMsg(
              lang === 'bn' ? 'ত্রিভুজের বাহুগুলোর মাপ সঠিক নয়।' : 'Invalid triangle sides.'
            );
            return;
          }
          const cosA = (f1 * f1 + f3 * f3 - f2 * f2) / (2 * f1 * f3);
          const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
          pts = [
            { x: 0, y: 0 },
            { x: f1, y: 0 },
            { x: f3 * cosA, y: f3 * sinA },
          ];
        } else {
          const f4 = toFeet(parseLocalizedNumber(s4), tapeUnit);
          const fDiag = toFeet(parseLocalizedNumber(diag), tapeUnit);
          pts = buildQuadFromSidesAndDiagonal(f1, f2, f3, f4, fDiag);
          if (!pts) {
            setErrorMsg(
              lang === 'bn'
                ? 'কর্ণের মাপ বাহুগুলোর সাথে মিলছে না। দয়া করে কর্ণ যাচাই করুন।'
                : 'Diagonal does not form valid triangles with the given sides.'
            );
            return;
          }
        }
        if (onFinishWizardMeasure) {
          onFinishWizardMeasure('area', pts);
        } else {
          onCreatePolygon(pts, {
            plotNumber: formatNumber(polygons.length + 1, 0, lang),
          });
        }
        setStep(5);
      };

      instruction =
        lang === 'bn'
          ? 'জমির চারপাশের বাহু ও একটি কর্ণের মাপ লিখুন'
          : 'Enter the plot side lengths and diagonal';
      hint =
        lang === 'bn'
          ? 'আঁকাবাঁকা ৪ কোণা জমির সঠিক ক্ষেত্রফলের জন্য ১ম কোণা থেকে ৩য় কোণার কর্ণ (A–C) মেপে লেখা জরুরি।'
          : 'Measuring one diagonal (A–C) splits a 4-sided plot into two exact triangles.';
      onBack = () => setStep(3);
      onNext = handleBuildTape;
      nextLabel = lang === 'bn' ? 'শেষ করুন' : 'Finish';

      body = (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTapeShape('quad')}
              className={`min-h-[38px] rounded-lg border text-xs font-semibold ${
                tapeShape === 'quad'
                  ? 'border-[#0F5132] bg-[#0F5132] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? '৪ বাহু + কর্ণ' : '4 Sides'}
            </button>
            <button
              type="button"
              onClick={() => setTapeShape('tri')}
              className={`min-h-[38px] rounded-lg border text-xs font-semibold ${
                tapeShape === 'tri'
                  ? 'border-[#0F5132] bg-[#0F5132] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? '৩ বাহু' : '3 Sides'}
            </button>
            <select
              value={tapeUnit}
              onChange={(e) => setTapeUnit(e.target.value as LinearUnit)}
              className="min-h-[38px] rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-medium"
            >
              {(['ft', 'hat', 'gaj', 'chain', 'link', 'm'] as LinearUnit[]).map((u) => (
                <option key={u} value={u}>
                  {getLinearUnitLabel(u, lang)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={s1}
              onChange={(e) => setS1(e.target.value)}
              placeholder={lang === 'bn' ? '১ম বাহু' : 'Side 1'}
              className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
            />
            <input
              type="text"
              inputMode="decimal"
              value={s2}
              onChange={(e) => setS2(e.target.value)}
              placeholder={lang === 'bn' ? '২য় বাহু' : 'Side 2'}
              className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
            />
            <input
              type="text"
              inputMode="decimal"
              value={s3}
              onChange={(e) => setS3(e.target.value)}
              placeholder={lang === 'bn' ? '৩য় বাহু' : 'Side 3'}
              className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
            />
            {tapeShape === 'quad' && (
              <>
                <input
                  type="text"
                  inputMode="decimal"
                  value={s4}
                  onChange={(e) => setS4(e.target.value)}
                  placeholder={lang === 'bn' ? '৪র্থ বাহু' : 'Side 4'}
                  className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={diag}
                  onChange={(e) => setDiag(e.target.value)}
                  placeholder={lang === 'bn' ? 'কর্ণ (A–C)' : 'Diagonal'}
                  className="col-span-2 min-h-[42px] rounded-xl border border-[#0F5132]/40 dark:border-emerald-600/50 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                />
              </>
            )}
          </div>
          {errorMsg && <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>}
        </div>
      );
    } else if (step === 4) {
      const isDist = measureGoal === 'distance';
      const minPts = isDist ? 2 : 3;
      const liveSummary =
        !isDist && draftPoints.length >= 3
          ? measurePolygonFromGeometry(draftPoints, doc.unitProfile)
          : null;
      const liveDistSummary =
        isDist && draftPoints.length >= 2
          ? measurePolylineFromGeometry(draftPoints)
          : null;

      const handleFinishCorners = () => {
        if (draftPoints.length < minPts) return;
        if (onFinishWizardMeasure) {
          onFinishWizardMeasure(isDist ? 'distance' : 'area', draftPoints);
        } else {
          onFinishDraftPolygon();
        }
        onSetTool('select');
        setStep(5);
      };

      instruction = isDist
        ? lang === 'bn'
          ? 'নকশায় প্রান্ত বা কোণাগুলো ট্যাপ করুন, তারপর "শেষ করুন" চাপুন'
          : 'Tap endpoints/corners on the map, then tap Finish'
        : lang === 'bn'
        ? 'নকশায় জমির কোণাগুলো ট্যাপ করুন, তারপর "শেষ করুন" চাপুন'
        : 'Tap plot corners with the loupe, then tap Finish';
      hint =
        lang === 'bn'
          ? 'আঙুল চেপে ধরে সরালে ম্যাগনিফায়ার লুপ দেখাবে—নিখুঁত বিন্দুতে আঙুল তুলুন। ভুল হলে "ফিরুন" চাপুন।'
          : 'Hold and drag your finger to aim with the loupe, lift to place a corner. Use Undo if needed.';
      onBack = () => {
        onCancelDraft();
        onSetTool('select');
        setStep(3);
      };
      canGoNext = draftPoints.length >= minPts;
      nextLabel = lang === 'bn' ? 'শেষ করুন' : 'Finish';
      onNext = handleFinishCorners;

      body = (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-[#FAFBF8] dark:bg-slate-800 border border-[#E5E9E4] dark:border-slate-700 p-3 text-xs tabular-nums">
            <div>
              <div className="font-bold text-[#141A17] dark:text-slate-100">
                {lang === 'bn'
                  ? `কোণা বসানো হয়েছে: ${formatNumber(draftPoints.length, 0, lang)} টি`
                  : `Corners placed: ${draftPoints.length}`}
              </div>
              <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                {isDist
                  ? lang === 'bn'
                    ? 'কমপক্ষে ২টি বিন্দু ট্যাপ করুন'
                    : 'Minimum 2 points required'
                  : lang === 'bn'
                  ? 'কমপক্ষে ৩টি কোণা ট্যাপ করুন'
                  : 'Minimum 3 corners required'}
              </div>
            </div>
            {liveSummary && (
              <div className="text-right">
                <div className="font-bold text-[#0F5132] dark:text-emerald-400">
                  {formatNumber(liveSummary.breakdown.shotok, 3, lang)}{' '}
                  {lang === 'bn' ? 'শতক' : 'shotok'}
                </div>
                <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                  {formatNumber(liveSummary.perimeterFt, 1, lang)}{' '}
                  {lang === 'bn' ? 'ফু' : 'ft'}
                </div>
              </div>
            )}
            {liveDistSummary && (
              <div className="text-right">
                <div className="font-bold text-[#0369A1] dark:text-sky-400">
                  {formatNumber(liveDistSummary.totalDistanceFt, 2, lang)}{' '}
                  {lang === 'bn' ? 'ফুট' : 'ft'}
                </div>
                <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                  {formatNumber(liveDistSummary.totalDistanceFt / 66, 3, lang)}{' '}
                  {lang === 'bn' ? 'চেইন' : 'ch'}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={draftPoints.length === 0}
              onClick={onUndoDraftPoint}
              className="flex-1 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
              <span>{lang === 'bn' ? 'ফিরুন (Undo)' : 'Undo'}</span>
            </button>
            <button
              type="button"
              disabled={draftPoints.length === 0}
              onClick={() => onCancelDraft()}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold text-red-600 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{lang === 'bn' ? 'সব মুছুন' : 'Clear'}</span>
            </button>
          </div>
        </div>
      );
    } else if (step === 5) {
      const targetMode = measuredShape?.mode || (measureGoal === 'distance' ? 'distance' : 'area');
      const pts = measuredShape?.points || selectedPoly?.points || [];

      instruction =
        targetMode === 'distance'
          ? lang === 'bn'
            ? 'দূরত্ব পরিমাপের পূর্ণাঙ্গ ফলাফল'
            : 'Distance Measurement Result'
          : lang === 'bn'
          ? 'জমির পরিমাপ ও ক্ষেত্রফলের ফলাফল'
          : 'Land Area & Perimeter Result';
      onBack = () => {
        onSetTool(targetMode === 'distance' ? 'measure-path' : 'measure-area');
        setStep(4);
      };
      nextLabel = lang === 'bn' ? 'পরবর্তী (দাগ সংরক্ষণ)' : 'Next (Save Plot)';
      canGoNext = pts.length >= (targetMode === 'distance' ? 2 : 3);
      onNext = () => {
        if (!plotNumInput) {
          setPlotNumInput(formatNumber(polygons.length + 1, 0, lang));
        }
        setStep(6);
      };

      if (targetMode === 'distance' && pts.length >= 2) {
        const distRes = measurePolylineFromGeometry(pts);
        const totalFt = distRes.totalDistanceFt;
        body = (
          <div className="space-y-3 tabular-nums">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-[#0369A1]/40 bg-sky-50 dark:bg-sky-950/40 p-2.5">
                <div className="text-[11px] text-[#4A5550] dark:text-slate-300">
                  {lang === 'bn' ? 'মোট ফুট (ft)' : 'Feet (ft)'}
                </div>
                <div className="text-lg font-bold text-[#0369A1] dark:text-sky-300">
                  {formatNumber(totalFt, 2, lang)}
                </div>
              </div>
              <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
                <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                  {lang === 'bn' ? 'চেইন (Chain)' : 'Chain'}
                </div>
                <div className="text-lg font-bold">
                  {formatNumber(fromFeet(totalFt, 'chain'), 3, lang)}
                </div>
              </div>
              <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
                <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                  {lang === 'bn' ? 'মিটার (m)' : 'Meter (m)'}
                </div>
                <div className="text-base font-bold">
                  {formatNumber(fromFeet(totalFt, 'm'), 2, lang)}
                </div>
              </div>
              <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
                <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                  {lang === 'bn' ? 'হাত (Hat)' : 'Hat'}
                </div>
                <div className="text-base font-bold">
                  {formatNumber(fromFeet(totalFt, 'hat'), 2, lang)}
                </div>
              </div>
              <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
                <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                  {lang === 'bn' ? 'গজ (Gaj)' : 'Gaj'}
                </div>
                <div className="text-base font-bold">
                  {formatNumber(fromFeet(totalFt, 'gaj'), 2, lang)}
                </div>
              </div>
              <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
                <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                  {lang === 'bn' ? 'সরল দূরত্ব' : 'Direct Span'}
                </div>
                <div className="text-base font-bold">
                  {formatNumber(distRes.netDisplacementFt, 2, lang)} ft
                </div>
              </div>
            </div>

            <div className="max-h-24 overflow-y-auto space-y-1 rounded-xl border border-[#E5E9E4] dark:border-slate-700 p-2 text-xs">
              {distRes.segmentLengthsFt.map((len, idx) => {
                const rb = wcbToReducedBearing(distRes.bearingsDeg[idx]);
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <span>
                      {lang === 'bn' ? `অংশ ${formatNumber(idx + 1, 0, lang)}:` : `Seg ${idx + 1}:`}
                    </span>
                    <span className="font-semibold">
                      {formatNumber(len, 2, lang)} ft ·{' '}
                      {lang === 'bn' ? rb.formattedBn : rb.formattedEn} (
                      {formatDMS(distRes.bearingsDeg[idx], lang)})
                    </span>
                  </div>
                );
              })}
            </div>

            {hasRaster && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                <span>{t.disclaimer.rasterBody}</span>
              </div>
            )}
          </div>
        );
      } else {
        body =
          pts.length >= 3 ? (
            renderAreaSummaryFromPoints(pts, false)
          ) : (
            <p className="text-xs text-[#4A5550] dark:text-slate-400">
              {t.workspace.noPlotsYet}
            </p>
          );
      }
    } else {
      // Step 6: Optional "দাগ হিসেবে রাখুন" to save as a plot
      const targetMode = measuredShape?.mode || (measureGoal === 'distance' ? 'distance' : 'area');
      const pts = measuredShape?.points || [];
      const alreadySaved = Boolean(measuredShape?.savedPlotId);

      instruction =
        lang === 'bn'
          ? 'ঐচ্ছিক: মাপটি "দাগ হিসেবে রাখুন" বা রিপোর্ট ডাউনলোড করুন'
          : 'Optional: Save measurement as a plot or finish';
      hint =
        lang === 'bn'
          ? '"দাগ হিসেবে রাখুন" চাপলে এটি প্রজেক্টের দাগ তালিকায় যুক্ত হবে—যেকোনো সময় ডিমার্কেশন বা রিপোর্ট করতে পারবেন।'
          : 'Saving as a plot stores vertex geometry only; area & perimeter are always recomputed live.';
      onBack = () => setStep(5);
      nextLabel = lang === 'bn' ? 'সম্পন্ন' : 'Done';
      onNext = () => {
        onClearMeasurementPreview?.();
        onClose();
      };

      body = (
        <div className="space-y-3">
          {alreadySaved ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs font-bold text-[#0F5132] dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>
                {targetMode === 'distance'
                  ? lang === 'bn'
                    ? 'দূরত্বের লাইনটি প্রজেক্টে সংরক্ষিত হয়েছে!'
                    : 'Distance measurement saved to project!'
                  : lang === 'bn'
                  ? 'জমিটি প্রজেক্টে "দাগ" হিসেবে সংরক্ষিত হয়েছে!'
                  : 'Saved as a plot in the project!'}
              </span>
            </div>
          ) : (
            <div className="space-y-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-3">
              {targetMode === 'area' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={plotNumInput}
                    onChange={(e) => setPlotNumInput(e.target.value)}
                    placeholder={lang === 'bn' ? 'দাগ নম্বর (যেমন: ১০৫)' : 'Plot / Dag No.'}
                    className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                  />
                  <input
                    type="text"
                    value={ownerInput}
                    onChange={(e) => setOwnerInput(e.target.value)}
                    placeholder={lang === 'bn' ? 'মালিকের নাম (ঐচ্ছিক)' : 'Owner (optional)'}
                    className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={pts.length < (targetMode === 'distance' ? 2 : 3)}
                onClick={() => {
                  if (onSaveMeasurementAsPlot) {
                    onSaveMeasurementAsPlot(targetMode, pts, {
                      plotNumber: plotNumInput.trim() || undefined,
                      ownerName: ownerInput.trim() || undefined,
                    });
                  } else if (targetMode === 'area') {
                    onCreatePolygon(pts, {
                      plotNumber: plotNumInput.trim() || undefined,
                      ownerName: ownerInput.trim() || undefined,
                    });
                  }
                }}
                className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                <BookmarkPlus className="h-4 w-4" />
                <span>
                  {targetMode === 'distance'
                    ? lang === 'bn'
                      ? 'দাগ/লাইন হিসেবে রাখুন'
                      : 'Save Line to Project'
                    : lang === 'bn'
                    ? 'দাগ হিসেবে রাখুন'
                    : 'Save as Plot'}
                </span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onExportPdf}
              className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#0F5132] text-xs font-semibold text-[#0F5132] dark:text-emerald-400"
            >
              <Download className="h-4 w-4" />
              <span>{t.actions.exportPdf}</span>
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 text-xs font-semibold"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />
              <span>{t.actions.exportCsv}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onClearMeasurementPreview?.();
              onCancelDraft();
              setPlotNumInput('');
              setOwnerInput('');
              setStep(3);
            }}
            className="w-full min-h-[38px] rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 text-xs font-semibold text-[#4A5550] dark:text-slate-300"
          >
            {lang === 'bn' ? 'আরেকটি দাগ/দূরত্ব মাপুন' : 'Measure Another Plot / Distance'}
          </button>
        </div>
      );
    }
  } else if (wizard === 'pantograph') {
    const ratio = usePresetScale
      ? srcScale / dstScale
      : Math.max(0.05, parseLocalizedNumber(customFactor) || 1);

    if (step === 1) {
      instruction =
        lang === 'bn'
          ? 'মূল নকশার স্কেল ও রূপান্তরিত স্কেল নির্বাচন করুন'
          : 'Choose source and target mouza map scales';
      hint =
        lang === 'bn'
          ? '১৬ ইঞ্চি = ১ মাইল নকশাকে ৩২ ইঞ্চিতে বড় করতে চাইলে ২× বা স্কেল অনুপাত বেছে নিন।'
          : 'Select a standard Bangladesh mouza preset or enter a custom multiplier.';
      onNext = () => setStep(2);
      body = (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setUsePresetScale(true)}
              className={`min-h-[40px] rounded-xl border text-xs font-semibold ${
                usePresetScale
                  ? 'border-[#115E59] bg-[#115E59] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? 'মৌজা স্কেল (ইঞ্চি/মাইল)' : 'Mouza Scale'}
            </button>
            <button
              type="button"
              onClick={() => setUsePresetScale(false)}
              className={`min-h-[40px] rounded-xl border text-xs font-semibold ${
                !usePresetScale
                  ? 'border-[#115E59] bg-[#115E59] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? 'কাস্টম গুণক (×)' : 'Custom Factor'}
            </button>
          </div>
          {usePresetScale ? (
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={srcScale}
                onChange={(e) => setSrcScale(Number(e.target.value))}
                className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
              >
                <option value={16}>{lang === 'bn' ? 'মূল: ১৬″ = ১ মাইল' : 'Src: 16″/mile'}</option>
                <option value={32}>{lang === 'bn' ? 'মূল: ৩২″ = ১ মাইল' : 'Src: 32″/mile'}</option>
                <option value={64}>{lang === 'bn' ? 'মূল: ৬৪″ = ১ মাইল' : 'Src: 64″/mile'}</option>
              </select>
              <select
                value={dstScale}
                onChange={(e) => setDstScale(Number(e.target.value))}
                className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
              >
                <option value={16}>{lang === 'bn' ? 'নতুন: ১৬″ = ১ মাইল' : 'Dst: 16″/mile'}</option>
                <option value={32}>{lang === 'bn' ? 'নতুন: ৩২″ = ১ মাইল' : 'Dst: 32″/mile'}</option>
                <option value={64}>{lang === 'bn' ? 'নতুন: ৬৪″ = ১ মাইল' : 'Dst: 64″/mile'}</option>
              </select>
            </div>
          ) : (
            <input
              type="text"
              inputMode="decimal"
              value={customFactor}
              onChange={(e) => setCustomFactor(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
            />
          )}
          <div className="rounded-xl bg-[#FAFBF8] dark:bg-slate-800 border border-[#E5E9E4] dark:border-slate-700 px-3 py-2 text-xs tabular-nums">
            {lang === 'bn' ? 'স্কেল অনুপাত:' : 'Scale Ratio:'}{' '}
            <strong>{formatNumber(ratio, 3, lang)}×</strong>
          </div>
        </div>
      );
    } else if (step === 2) {
      instruction =
        lang === 'bn'
          ? 'রূপান্তরের জন্য মূল দাগ নির্বাচন বা তৈরি করুন'
          : 'Select or create the source plot to rescale';
      onBack = () => setStep(1);
      canGoNext = Boolean(selectedPoly);
      nextLabel = lang === 'bn' ? 'প্যান্টাগ্রাফ তৈরি করুন' : 'Create Scaled Plot';
      onNext = () => {
        if (!selectedPoly) return;
        onPantographScale(selectedPoly.id, ratio, offsetAside);
        setStep(3);
      };
      body =
        polygons.length === 0 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() =>
                onCreatePolygon(
                  [
                    { x: 0, y: 0 },
                    { x: 80, y: 0 },
                    { x: 80, y: 55 },
                    { x: 0, y: 55 },
                  ],
                  { plotNumber: '১' }
                )
              }
              className="min-h-[42px] rounded-xl bg-[#115E59] px-4 text-xs font-semibold text-white"
            >
              {lang === 'bn' ? 'নমুনা দাগ যোগ করুন' : 'Add Sample Plot'}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <select
              value={selectedPoly?.id || ''}
              onChange={(e) => onSelectEntity(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
            >
              {polygons.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {lang === 'bn' ? `দাগ ${p.plotNumber || i + 1}` : `Plot ${p.plotNumber || i + 1}`} —{' '}
                  {formatNumber(polygonAreaSqFt(p.points) / 435.6, 2, lang)}{' '}
                  {lang === 'bn' ? 'শতক' : 'shotok'}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={offsetAside}
                onChange={(e) => setOffsetAside(e.target.checked)}
                className="h-4 w-4 accent-[#115E59]"
              />
              {lang === 'bn' ? 'তুলনার জন্য নতুন দাগ পাশে রাখুন' : 'Place copy beside original'}
            </label>
          </div>
        );
    } else {
      instruction =
        lang === 'bn'
          ? 'প্যান্টাগ্রাফ স্কেল রূপান্তর সম্পন্ন হয়েছে'
          : 'Pantograph rescaling complete';
      onBack = () => setStep(2);
      body = selectedPoly ? renderAreaSummary(selectedPoly) : null;
    }
  } else if (wizard === 'joint') {
    const layer1 = doc.rasterLayers.find((r) => r.id === sheet1Id) || doc.rasterLayers[0] || null;
    const layer2 = doc.rasterLayers.find((r) => r.id === sheet2Id) || doc.rasterLayers[1] || null;

    if (step === 1) {
      instruction =
        lang === 'bn'
          ? 'জোড়া দেওয়ার জন্য দুটি মৌজা ম্যাপের ছবি আপলোড করুন'
          : 'Upload two mouza map sheets to join together';
      hint =
        lang === 'bn'
          ? 'দুটি সিটের সীমানার কাছাকাছি সাধারণ (Common) যেকোনো ২টি খুঁটি বা কোণা থাকলে নিখুঁতভাবে জোড়া লাগানো যাবে।'
          : 'Pick two sheets that share at least 2 overlapping corner or landmark points.';
      canGoNext = Boolean(layer1 && layer2);
      onNext = () => {
        onClearPickedPoints();
        onSetTool('pick-point');
        setStep(2);
      };
      body = (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="flex min-h-[54px] cursor-pointer items-center gap-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 hover:border-[#B45309]">
            <ImagePlus className="h-5 w-5 text-[#B45309]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">{lang === 'bn' ? 'ম্যাপ সিট ১' : 'Map Sheet 1'}</div>
              <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {layer1 ? layer1.name : lang === 'bn' ? 'ছবি বেছে নিন' : 'Choose image'}
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!f) return;
                const l = await onAttachRasterFile(f);
                if (l) setSheet1Id(l.id);
              }}
            />
          </label>
          <label className="flex min-h-[54px] cursor-pointer items-center gap-2.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 hover:border-[#B45309]">
            <Layers className="h-5 w-5 text-[#B45309]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">{lang === 'bn' ? 'ম্যাপ সিট ২' : 'Map Sheet 2'}</div>
              <div className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {layer2 ? layer2.name : lang === 'bn' ? 'ছবি বেছে নিন' : 'Choose image'}
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!f) return;
                const l = await onAttachRasterFile(f);
                if (l) {
                  const offsetLayer: RasterLayer = {
                    ...l,
                    transform: { ...l.transform, tx: l.transform.tx + 120 },
                    opacity: 0.65,
                  };
                  onUpdateRaster(offsetLayer);
                  setSheet2Id(offsetLayer.id);
                }
              }}
            />
          </label>
        </div>
      );
    } else if (step === 2) {
      const nudgeSheet2 = (dx: number, dy: number, dRotDeg: number) => {
        if (!layer2) return;
        onUpdateRaster({
          ...layer2,
          transform: {
            ...layer2.transform,
            tx: layer2.transform.tx + dx,
            ty: layer2.transform.ty + dy,
            rotationRad: layer2.transform.rotationRad + (dRotDeg * Math.PI) / 180,
          },
        });
      };
      const handleTwoPointJoin = () => {
        if (!layer1 || !layer2 || pickedPoints.length < 4) return;
        const nextT = solveRasterTransformFromTwoPoints(
          worldToRasterPixel(pickedPoints[2], layer2.transform),
          worldToRasterPixel(pickedPoints[3], layer2.transform),
          pickedPoints[0],
          pickedPoints[1]
        );
        if (nextT) {
          onUpdateRaster({ ...layer2, transform: nextT, calibrated: true });
          onClearPickedPoints();
          setStep(3);
        }
      };

      instruction =
        lang === 'bn'
          ? 'প্রথমে ম্যাপ-১ এ ২টি সাধারণ বিন্দু, তারপর ম্যাপ-২ এ একই ২টি বিন্দু ট্যাপ করুন'
          : 'Tap 2 common points on Sheet 1, then the matching 2 points on Sheet 2';
      onBack = () => {
        onClearPickedPoints();
        setStep(1);
      };
      canGoNext = pickedPoints.length >= 4;
      nextLabel = lang === 'bn' ? 'জয়েন্ট সম্পন্ন করুন' : 'Join Maps';
      onNext = handleTwoPointJoin;
      body = (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span>
              {lang === 'bn'
                ? `বিন্দু নির্বাচিত: ${formatNumber(Math.min(4, pickedPoints.length), 0, lang)}/৪`
                : `Tie points: ${Math.min(4, pickedPoints.length)}/4`}
            </span>
            <button
              type="button"
              onClick={onClearPickedPoints}
              className="font-semibold text-[#B45309] underline"
            >
              {lang === 'bn' ? 'রিসেট' : 'Reset'}
            </button>
          </div>
          {layer2 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#FAFBF8] dark:bg-slate-800 border border-[#E5E9E4] dark:border-slate-700 p-2 text-xs">
              <button type="button" onClick={() => nudgeSheet2(-5, 0, 0)} className="rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2.5 py-1">←</button>
              <button type="button" onClick={() => nudgeSheet2(5, 0, 0)} className="rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2.5 py-1">→</button>
              <button type="button" onClick={() => nudgeSheet2(0, 5, 0)} className="rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2.5 py-1">↑</button>
              <button type="button" onClick={() => nudgeSheet2(0, -5, 0)} className="rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2.5 py-1">↓</button>
              <button type="button" onClick={() => nudgeSheet2(0, 0, 1)} className="rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2 py-1">+১°</button>
              <button type="button" onClick={() => nudgeSheet2(0, 0, -1)} className="rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2 py-1">-১°</button>
            </div>
          )}
        </div>
      );
    } else {
      instruction =
        lang === 'bn'
          ? 'ম্যাপ দুটি জোড়া লাগানো হয়েছে — এখন সম্মিলিত সীমানা মাপতে পারেন'
          : 'Maps joined — you can now trace combined boundaries';
      onBack = () => setStep(2);
      nextLabel = lang === 'bn' ? 'সীমানা আঁকা শুরু করুন' : 'Trace Plot';
      onNext = () => {
        onSetTool('draw-polygon');
        onJumpToWorkspace();
      };
      body = (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
          <span>{t.disclaimer.rasterBody}</span>
        </div>
      );
    }
  } else {
    // Demarcation wizard
    if (step === 1) {
      instruction =
        lang === 'bn'
          ? 'যে দাগটি ভাগ বা ডিমার্কেশন করবেন তা বেছে নিন'
          : 'Select the plot to partition';
      canGoNext = Boolean(selectedPoly);
      onNext = () => {
        setErrorMsg('');
        setStep(2);
      };
      body =
        polygons.length === 0 ? (
          <button
            type="button"
            onClick={() =>
              onCreatePolygon(
                [
                  { x: 0, y: 0 },
                  { x: 120, y: 0 },
                  { x: 120, y: 72.6 },
                  { x: 0, y: 72.6 },
                ],
                { plotNumber: '১' }
              )
            }
            className="min-h-[42px] rounded-xl bg-[#1E3A8A] px-4 text-xs font-semibold text-white"
          >
            {lang === 'bn' ? 'নমুনা দাগ (২০ শতক) যোগ করুন' : 'Add Sample 20-Shotok Plot'}
          </button>
        ) : (
          <select
            value={selectedPoly?.id || ''}
            onChange={(e) => onSelectEntity(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
          >
            {polygons.map((p, i) => (
              <option key={p.id} value={p.id}>
                {lang === 'bn' ? `দাগ ${p.plotNumber || i + 1}` : `Plot ${p.plotNumber || i + 1}`} —{' '}
                {formatNumber(polygonAreaSqFt(p.points) / 435.6, 2, lang)}{' '}
                {lang === 'bn' ? 'শতক' : 'shotok'}
              </option>
            ))}
          </select>
        );
    } else if (step === 2) {
      const handlePartition = () => {
        if (!selectedPoly) return;
        setErrorMsg('');
        let parts: Point2D[][] = [];
        if (splitType === 'equal') {
          const n = Math.max(2, Math.min(20, Math.round(parseLocalizedNumber(equalParts) || 2)));
          parts = partitionPolygonEqualParts(selectedPoly.points, n, cutAngle);
        } else {
          const targetSqFt = toSqFt(
            parseLocalizedNumber(exactAmount),
            exactUnit,
            doc.unitProfile
          );
          const totalSqFt = polygonAreaSqFt(selectedPoly.points);
          if (!targetSqFt || targetSqFt <= 0 || targetSqFt >= totalSqFt) {
            setErrorMsg(
              lang === 'bn'
                ? 'অংশের পরিমাণ মোট জমির চেয়ে কম এবং শূন্যের বড় হতে হবে।'
                : 'Target area must be > 0 and less than total plot area.'
            );
            return;
          }
          const res = splitPolygonByTargetArea(selectedPoly.points, targetSqFt, cutAngle);
          if (res) parts = [res[0], res[1]];
        }
        if (parts.length < 2) {
          setErrorMsg(lang === 'bn' ? 'বিভাজন করা যায়নি।' : 'Partition failed.');
          return;
        }
        onDemarcatePlot(selectedPoly.id, parts, addPillars);
        setStep(3);
      };

      instruction =
        lang === 'bn'
          ? 'কত ভাগে বা কত শতকে জমি ভাগ হবে তা নির্ধারণ করুন'
          : 'Configure shares or exact area split';
      onBack = () => setStep(1);
      nextLabel = lang === 'bn' ? 'জমি ভাগ করুন' : 'Split Plot';
      onNext = handlePartition;
      body = (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSplitType('equal')}
              className={`min-h-[40px] rounded-xl border text-xs font-semibold ${
                splitType === 'equal'
                  ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? 'সমান ভাগে ভাগ' : 'Equal Parts'}
            </button>
            <button
              type="button"
              onClick={() => setSplitType('exact')}
              className={`min-h-[40px] rounded-xl border text-xs font-semibold ${
                splitType === 'exact'
                  ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? 'নির্দিষ্ট জমি কাটা' : 'Exact Area Cut'}
            </button>
          </div>

          {splitType === 'equal' ? (
            <div className="grid grid-cols-4 gap-2">
              {['2', '3', '4', '5'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEqualParts(n)}
                  className={`min-h-[40px] rounded-xl border text-sm font-bold ${
                    equalParts === n
                      ? 'border-[#1E3A8A] bg-[#1E3A8A]/10 text-[#1E3A8A] dark:text-blue-300'
                      : 'border-[#D4DBD6] dark:border-slate-700'
                  }`}
                >
                  {formatNumber(Number(n), 0, lang)}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={exactAmount}
                onChange={(e) => setExactAmount(e.target.value)}
                className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
              />
              <select
                value={exactUnit}
                onChange={(e) => setExactUnit(e.target.value as AreaUnit)}
                className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-medium"
              >
                {(['shotok', 'katha', 'bigha', 'sqft', 'sqm'] as AreaUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {getAreaUnitLabel(u, lang)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCutAngle(90)}
              className={`min-h-[38px] rounded-xl border text-xs font-semibold ${
                cutAngle === 90
                  ? 'border-[#1E3A8A] bg-[#1E3A8A]/10 text-[#1E3A8A] dark:text-blue-300'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? 'উত্তর–দক্ষিণ' : 'North–South'}
            </button>
            <button
              type="button"
              onClick={() => setCutAngle(0)}
              className={`min-h-[38px] rounded-xl border text-xs font-semibold ${
                cutAngle === 0
                  ? 'border-[#1E3A8A] bg-[#1E3A8A]/10 text-[#1E3A8A] dark:text-blue-300'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              {lang === 'bn' ? 'পূর্ব–পশ্চিম' : 'East–West'}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={addPillars}
              onChange={(e) => setAddPillars(e.target.checked)}
              className="h-4 w-4 accent-[#1E3A8A]"
            />
            {lang === 'bn' ? 'সীমানায় খুঁটি (Pillar) বসান' : 'Place boundary pillars'}
          </label>
          {errorMsg && <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>}
        </div>
      );
    } else {
      instruction =
        lang === 'bn'
          ? 'ডিমার্কেশন ও প্রতিটি অংশের হিসাব প্রস্তুত'
          : 'Demarcation complete';
      onBack = () => setStep(2);
      body = (
        <div className="space-y-2.5">
          <div className="max-h-36 overflow-y-auto space-y-1.5">
            {polygons.map((p, idx) => {
              const b = computeAreaBreakdown(polygonAreaSqFt(p.points), doc.unitProfile);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-3 py-2 text-xs tabular-nums"
                >
                  <span className="font-semibold flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-[#0F5132] dark:text-emerald-400" />
                    {lang === 'bn' ? `অংশ ${p.plotNumber || idx + 1}` : `Share ${p.plotNumber || idx + 1}`}
                  </span>
                  <span className="font-bold text-[#0F5132] dark:text-emerald-400">
                    {formatNumber(b.shotok, 3, lang)} {lang === 'bn' ? 'শতক' : 'sh'} ·{' '}
                    {formatNumber(b.katha, 2, lang)} {lang === 'bn' ? 'কাঠা' : 'ka'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onExportPdf}
              className="min-h-[42px] rounded-xl bg-[#0F5132] dark:bg-emerald-600 text-xs font-semibold text-white"
            >
              {t.actions.exportPdf}
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="min-h-[42px] rounded-xl border border-[#D4DBD6] dark:border-slate-700 text-xs font-semibold"
            >
              {t.actions.exportCsv}
            </button>
          </div>
        </div>
      );
    }
  }

  const titleMap: Record<WizardKind, string> = {
    measure: t.wizards.measure.title,
    pantograph: t.wizards.pantograph.title,
    joint: t.wizards.joint.title,
    demarcation: t.wizards.demarcation.title,
    partition: lang === 'bn' ? 'জমি ভাগ (পার্টিশন)' : 'Plot Partition',
  };

  const iconMap: Record<WizardKind, React.ReactNode> = {
    measure: <Ruler className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />,
    pantograph: <Maximize2 className="h-4 w-4 text-[#115E59] dark:text-teal-400" />,
    joint: <Layers className="h-4 w-4 text-[#B45309] dark:text-amber-400" />,
    demarcation: <Layers className="h-4 w-4 text-[#1E3A8A] dark:text-blue-400" />,
    partition: <Scissors className="h-4 w-4 text-[#1E3A8A] dark:text-blue-400" />,
  };

  return (
    <WizardFramework
      title={titleMap[wizard]}
      icon={iconMap[wizard]}
      currentStep={step}
      totalSteps={wizard === 'measure' ? 6 : 3}
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
