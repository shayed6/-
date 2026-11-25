import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Compass,
  Crop,
  Crosshair,
  Download,
  FileDown,
  FileSpreadsheet,
  FolderOpen,
  ImagePlus,
  Maximize,
  Redo2,
  Ruler,
  SlidersHorizontal,
  Undo2,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AlignmentPair,
  CadDocument,
  CadEntity,
  CadLayer,
  CalculatorRecord,
  DemarcationRecord,
  OverlayAlignmentState,
  PartitionPartRecord,
  PartitionRecord,
  PolygonEntity,
  RasterLayer,
  Viewport,
  createEmptyDocument,
} from './core/cad/types';
import {
  createArcEntity,
  createCircleEntity,
  createDimensionEntity,
  createLineEntity,
  createPointEntity,
  createPolygonEntity,
  createPolylineEntity,
  createRectangleEntity,
  createTextEntity,
  getDocumentLayers,
  makeEntityId,
} from './core/cad/entities';
import {
  CadCommand,
  HistoryState,
  createHistory,
  dispatchCommand,
  redoHistory,
  undoHistory,
} from './core/cad/commands';
import {
  BBox,
  arcFromThreePoints,
  getDocumentBBox,
  offsetPolygon,
  partitionPolygonEqualParts,
  rasterPixelToWorld,
  rotateEntity,
  scaleEntity,
  solveRasterAlignmentFromPairs,
  translateEntity,
  worldToRasterPixel,
} from './core/cad/geometry';
import {
  PartitionComputationResult,
  PartitionDirectionMode,
  PartitionDivideMode,
  normalizePartitionShares,
  parseShareExpression,
  recomputePartitionFromLinearOffsets,
  recomputePartitionFromRadialAngles,
  solvePolygonPartition,
  updatePartitionByDragPoint,
} from './core/cad/partition';
import { DEFAULT_SNAP_CONFIG, SnapConfig } from './core/cad/snapping';
import {
  computeAreaBreakdown,
  computePolygonOverlapMetrics,
  polygonAreaSqFt,
  polygonCentroid,
  polygonPerimeterFt,
} from './core/survey/area';
import { coordinateDelta, measureThreePointAngle } from './core/survey/bearing';
import { Point2D, scalePoint2D } from './core/survey/coordinates';
import { PaperOrientation, PaperSizeId } from './core/survey/scale';
import {
  AreaUnit,
  DEFAULT_UNIT_PROFILE,
  formatNumber,
  parseLocalizedNumber,
  toSqFt,
} from './core/survey/units';
import {
  AppSettings,
  ProjectSummary,
  deleteProjectFromDb,
  exportAllProjectsBackupJson,
  importAllProjectsBackupJson,
  listProjectsFromDb,
  loadAppSettings,
  loadProjectFromDb,
  saveAppSettings,
  saveProjectToDb,
} from './adapters/storage';
import {
  createRasterLayerFromImage,
  flipPixelX,
  flipRasterImageHorizontal,
  loadImageFile,
} from './adapters/image';
import { exportDocumentToCsv } from './adapters/csv';
import { exportDocumentToDxf, importDxfToEntities } from './adapters/dxf';
import { parseProjectJson, serializeProjectJson } from './adapters/nativeJson';
import {
  JoinedExportResolution,
  JoinedMapRenderOptions,
  exportJoinedMapBytes,
} from './adapters/mapJoint';
import {
  PantographRenderOptions,
  exportPantographPdfBytes,
  exportPantographPngBytes,
} from './adapters/pantograph';
import { generateSurveyPdfBytes } from './adapters/pdf';
import { exportFileCrossPlatform } from './adapters/exportHelper';
import { LicenseStatus, validateLicenseCode } from './access/license';
import { ActiveTool, CadCanvas, PartitionCanvasOverlay, PickedPin } from './ui/CadCanvas';
import { HomeScreen, WizardKind } from './ui/HomeScreen';
import {
  DemarcationSessionProps,
  MapJointSessionProps,
  PantographSessionProps,
  PlotDivisionSessionProps,
  WizardMeasuredShape,
  WizardSheet,
} from './ui/WizardSheet';
import { AdvancedToolbar } from './ui/AdvancedToolbar';
import { CalculatorView } from './ui/CalculatorView';
import { SnapBar } from './ui/SnapBar';
import { LayersSheet } from './ui/LayersSheet';
import { PropertiesSheet } from './ui/PropertiesSheet';
import { CoordAngleSheet } from './ui/CoordAngleSheet';
import { BottomSheet, Toast } from './ui/BottomSheet';
import { SettingsDialog } from './ui/SettingsDialog';
import { RasterScaleSheet, RasterScaleTab } from './ui/RasterScaleSheet';
import {
  ConfirmDialog,
  LicenseDialog,
  TextPromptDialog,
  TraverseDialog,
  TriangulationDialog,
} from './ui/Dialogs';
import { Lang, getTranslations } from './ui/i18n';
import { useOnlineStatus } from './ui/usePWAInstall';

const SHARE_COLORS = ['#0F5132', '#1D4ED8', '#B45309', '#7C3AED', '#0F766E', '#BE123C'];

export default function App() {
  const isOnline = useOnlineStatus();
  const [appSettings, setAppSettings] = useState<AppSettings>({
    language: 'bn',
    theme: 'system',
    unitProfile: DEFAULT_UNIT_PROFILE,
    organizationName: '',
    phoneNumber: '',
    advancedMode: false,
    scannerPixelsPerInch: null,
    licenseCode: null,
  });
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  const lang = appSettings.language;
  const t = getTranslations(lang);

  const isDark =
    appSettings.theme === 'dark' ||
    (appSettings.theme === 'system' && systemDark);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const [view, setView] = useState<'home' | 'workspace'>('home');
  const [history, setHistory] = useState<HistoryState>(() =>
    createHistory(createEmptyDocument())
  );
  const doc = history.present;

  const [viewport, setViewport] = useState<Viewport>({
    centerX: 40,
    centerY: 30,
    zoomPxPerFt: 4,
  });

  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRasterId, setSelectedRasterId] = useState<string | null>(null);
  const [snapConfig, setSnapConfig] = useState<SnapConfig>(DEFAULT_SNAP_CONFIG);
  const [draftPoints, setDraftPoints] = useState<Point2D[]>([]);
  const [pickedPoints, setPickedPoints] = useState<Point2D[]>([]);

  const [activeWizard, setActiveWizard] = useState<WizardKind | null>(null);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [wizardMinimized, setWizardMinimized] = useState(false);
  const [wizardMeasuredShape, setWizardMeasuredShape] =
    useState<WizardMeasuredShape | null>(null);
  const [advancedMenuOpen, setAdvancedMenuOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>({
    active: false,
    tier: 'community',
    code: null,
  });

  // Angle & Coordinate tools state (Advanced Mode)
  const [showCoordAngleSheet, setShowCoordAngleSheet] = useState(false);
  const [coordAngleTab, setCoordAngleTab] = useState<'coord' | 'angle'>('coord');
  const [pickedCoords, setPickedCoords] = useState<Point2D[]>([]);
  const [anglePreview, setAnglePreview] = useState<{
    armA: Point2D;
    vertex: Point2D;
    armB: Point2D;
  } | null>(null);

  // CS–RS Demarcation / Map Overlay session state
  const [demBaseRasterId, setDemBaseRasterId] = useState<string | null>(null);
  const [demOverlayRasterId, setDemOverlayRasterId] = useState<string | null>(null);
  const [demBaseMapLabel, setDemBaseMapLabel] = useState('CS (সাবেক)');
  const [demOverlayMapLabel, setDemOverlayMapLabel] = useState('RS (হাল)');
  const [demPairPhase, setDemPairPhase] = useState<'base' | 'overlay'>('base');
  const [demPendingBasePt, setDemPendingBasePt] = useState<Point2D | null>(null);
  const [demAutoFocusTap, setDemAutoFocusTap] = useState(true);
  const [demTraceTarget, setDemTraceTarget] = useState<'base' | 'overlay'>('base');
  const [demBaseDagNo, setDemBaseDagNo] = useState('');
  const [demOverlayDagNo, setDemOverlayDagNo] = useState('');
  const [demBasePolyId, setDemBasePolyId] = useState<string | null>(null);
  const [demOverlayPolyId, setDemOverlayPolyId] = useState<string | null>(null);
  const [demFlipping, setDemFlipping] = useState(false);

  // Map Joint (জমি জয়েন্ট) 7-step wizard session state
  const [jointSheetAId, setJointSheetAId] = useState<string | null>(null);
  const [jointSheetBId, setJointSheetBId] = useState<string | null>(null);
  const [jointPairPhase, setJointPairPhase] = useState<'a' | 'b'>('a');
  const [jointPendingAPt, setJointPendingAPt] = useState<Point2D | null>(null);
  const [jointAutoFocusTap, setJointAutoFocusTap] = useState(true);
  const [jointMergedLocked, setJointMergedLocked] = useState(false);
  const [jointExportResolution, setJointExportResolution] =
    useState<JoinedExportResolution>('high');
  const [jointIncludeVectors, setJointIncludeVectors] = useState(true);
  const [jointIncludeAnnotations, setJointIncludeAnnotations] = useState(true);
  const [jointExporting, setJointExporting] = useState(false);

  // Pantograph Re-Plot Wizard session state
  const [pantoRasterId, setPantoRasterId] = useState<string | null>(null);
  const [pantoOldScaleInputMode, setPantoOldScaleInputMode] = useState<
    'inchesPerMile' | 'rf' | 'barOnly'
  >('inchesPerMile');
  const [pantoOldInchesPerMile, setPantoOldInchesPerMile] = useState('16');
  const [pantoOldRfDenominator, setPantoOldRfDenominator] = useState('3960');
  const [pantoNewScaleInputMode, setPantoNewScaleInputMode] = useState<
    'inchesPerMile' | 'rf'
  >('inchesPerMile');
  const [pantoNewInchesPerMile, setPantoNewInchesPerMile] = useState('32');
  const [pantoNewRfDenominator, setPantoNewRfDenominator] = useState('1980');
  const [pantoAreaMode, setPantoAreaMode] = useState<'whole' | 'window'>('whole');
  const [pantoWindowBBox, setPantoWindowBBox] = useState<BBox | null>(null);
  const [pantoPaperSize, setPantoPaperSize] = useState<PaperSizeId>('a4');
  const [pantoOrientation, setPantoOrientation] = useState<PaperOrientation | 'auto'>('auto');
  const [pantoFitMode, setPantoFitMode] = useState<'true-scale' | 'fit-to-paper'>('true-scale');
  const [pantoIncludeVectors, setPantoIncludeVectors] = useState(true);
  const [pantoExporting, setPantoExporting] = useState(false);

  // Plot Division (ভাগবণ্টন) 6-step wizard session state
  const [divSourcePolyId, setDivSourcePolyId] = useState<string | null>(null);
  const [divDivideMode, setDivDivideMode] = useState<PartitionDivideMode>('equal');
  const [divEqualParts, setDivEqualParts] = useState('2');
  const [divEqualNames, setDivEqualNames] = useState<string[]>(['অংশীদার ১', 'অংশীদার ২']);
  const [divRatioRows, setDivRatioRows] = useState<Array<{ id: string; name: string; expr: string }>>([
    { id: 'heir-1', name: 'ওয়ারিশ ১', expr: '1' },
    { id: 'heir-2', name: 'ওয়ারিশ ২', expr: '2' },
  ]);
  const [divExactAmount, setDivExactAmount] = useState('5');
  const [divExactUnit, setDivExactUnit] = useState<AreaUnit>('shotok');
  const [divExactFirstName, setDivExactFirstName] = useState('নির্দিষ্ট অংশ');
  const [divExactRemainderName, setDivExactRemainderName] = useState('অবশিষ্ট অংশ');
  const [divDirectionMode, setDivDirectionMode] =
    useState<PartitionDirectionMode>('parallel-edge');
  const [divChosenEdgeIndex, setDivChosenEdgeIndex] = useState(0);
  const [divFlipDirection, setDivFlipDirection] = useState(false);
  const [divRadialPivot, setDivRadialPivot] = useState<Point2D | null>(null);
  const [divRadialStartAngleDeg, setDivRadialStartAngleDeg] = useState<number | null>(null);
  const [divPickTarget, setDivPickTarget] = useState<'edge' | 'pivot' | null>(null);
  const [divResult, setDivResult] = useState<PartitionComputationResult | null>(null);
  const [divErrorMsg, setDivErrorMsg] = useState('');
  const [divKeepOriginalPlot, setDivKeepOriginalPlot] = useState(false);
  const [divAddPillars, setDivAddPillars] = useState(true);
  const [divSavedToPlots, setDivSavedToPlots] = useState(false);

  // In-app modals & notifications (never window.alert/confirm/prompt)
  const [toast, setToast] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [showLicenseDialog, setShowLicenseDialog] = useState(false);
  const [showTriangulationDialog, setShowTriangulationDialog] = useState(false);
  const [showTraverseDialog, setShowTraverseDialog] = useState(false);
  const [showPlotSummarySheet, setShowPlotSummarySheet] = useState(false);
  const [showSavedWorkSheet, setShowSavedWorkSheet] = useState(false);
  const [showReportsSheet, setShowReportsSheet] = useState(false);
  const [showLayersSheet, setShowLayersSheet] = useState(false);
  const [showPropertiesSheet, setShowPropertiesSheet] = useState(false);
  const [scaleSheetTab, setScaleSheetTab] = useState<RasterScaleTab | null>(null);
  const [pendingTextPoint, setPendingTextPoint] = useState<Point2D | null>(null);
  const [editingPlotMeta, setEditingPlotMeta] = useState<PolygonEntity | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [confirmDeleteProj, setConfirmDeleteProj] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Initial load of settings & saved projects from IndexedDB
  useEffect(() => {
    (async () => {
      const loaded = await loadAppSettings();
      setAppSettings(loaded);
      if (loaded.licenseCode) {
        setLicenseStatus(validateLicenseCode(loaded.licenseCode));
      }
      const list = await listProjectsFromDb();
      setProjects(list);
    })();
  }, []);

  // Debounced autosave to IndexedDB whenever document changes inside workspace
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (view !== 'workspace') return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      await saveProjectToDb(doc);
      const list = await listProjectsFromDb();
      setProjects(list);
    }, 450);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [doc, view]);

  const dispatch = useCallback((cmd: CadCommand) => {
    setHistory((h) => dispatchCommand(h, cmd));
  }, []);

  const fitViewToDocument = useCallback((targetDoc: CadDocument) => {
    const bbox = getDocumentBBox(targetDoc);
    if (!bbox) {
      setViewport({ centerX: 40, centerY: 30, zoomPxPerFt: 4 });
      return;
    }
    const bw = Math.max(10, bbox.maxX - bbox.minX);
    const bh = Math.max(10, bbox.maxY - bbox.minY);
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    const zoom = Math.max(
      0.25,
      Math.min(40, Math.min((vw * 0.72) / bw, (vh * 0.56) / bh))
    );
    setViewport({
      centerX: (bbox.minX + bbox.maxX) / 2,
      centerY: (bbox.minY + bbox.maxY) / 2,
      zoomPxPerFt: zoom,
    });
  }, []);

  const resetDemarcationState = useCallback(() => {
    setDemBaseRasterId(null);
    setDemOverlayRasterId(null);
    setDemBaseMapLabel('CS (সাবেক)');
    setDemOverlayMapLabel('RS (হাল)');
    setDemPairPhase('base');
    setDemPendingBasePt(null);
    setDemAutoFocusTap(true);
    setDemTraceTarget('base');
    setDemBaseDagNo('');
    setDemOverlayDagNo('');
    setDemBasePolyId(null);
    setDemOverlayPolyId(null);
    setDemFlipping(false);
  }, []);

  const resetMapJointState = useCallback(() => {
    setJointSheetAId(null);
    setJointSheetBId(null);
    setJointPairPhase('a');
    setJointPendingAPt(null);
    setJointAutoFocusTap(true);
    setJointMergedLocked(false);
    setJointExportResolution('high');
    setJointIncludeVectors(true);
    setJointIncludeAnnotations(true);
    setJointExporting(false);
  }, []);

  const resetPantographState = useCallback(() => {
    setPantoRasterId(null);
    setPantoOldScaleInputMode('inchesPerMile');
    setPantoOldInchesPerMile('16');
    setPantoOldRfDenominator('3960');
    setPantoNewScaleInputMode('inchesPerMile');
    setPantoNewInchesPerMile('32');
    setPantoNewRfDenominator('1980');
    setPantoAreaMode('whole');
    setPantoWindowBBox(null);
    setPantoPaperSize('a4');
    setPantoOrientation('auto');
    setPantoFitMode('true-scale');
    setPantoIncludeVectors(true);
    setPantoExporting(false);
  }, []);

  const resetPartitionState = useCallback(() => {
    setDivSourcePolyId(null);
    setDivDivideMode('equal');
    setDivEqualParts('2');
    setDivEqualNames(
      lang === 'bn' ? ['অংশীদার ১', 'অংশীদার ২'] : ['Share 1', 'Share 2']
    );
    setDivRatioRows(
      lang === 'bn'
        ? [
            { id: 'heir-1', name: 'ওয়ারিশ ১', expr: '1' },
            { id: 'heir-2', name: 'ওয়ারিশ ২', expr: '2' },
          ]
        : [
            { id: 'heir-1', name: 'Heir 1', expr: '1' },
            { id: 'heir-2', name: 'Heir 2', expr: '2' },
          ]
    );
    setDivExactAmount('5');
    setDivExactUnit('shotok');
    setDivExactFirstName(lang === 'bn' ? 'নির্দিষ্ট অংশ' : 'Target Share');
    setDivExactRemainderName(lang === 'bn' ? 'অবশিষ্ট অংশ' : 'Remaining Share');
    setDivDirectionMode('parallel-edge');
    setDivChosenEdgeIndex(0);
    setDivFlipDirection(false);
    setDivRadialPivot(null);
    setDivRadialStartAngleDeg(null);
    setDivPickTarget(null);
    setDivResult(null);
    setDivErrorMsg('');
    setDivKeepOriginalPlot(false);
    setDivAddPillars(true);
    setDivSavedToPlots(false);
  }, [lang]);

  const syncDemarcationFromDoc = useCallback(
    (loaded: CadDocument) => {
      resetDemarcationState();
      resetMapJointState();
      if (loaded.overlayAlignment) {
        setDemBaseRasterId(loaded.overlayAlignment.baseRasterId);
        setDemOverlayRasterId(loaded.overlayAlignment.overlayRasterId);
        setJointSheetAId(loaded.overlayAlignment.baseRasterId);
        setJointSheetBId(loaded.overlayAlignment.overlayRasterId);
      }
      if (loaded.demarcationResults && loaded.demarcationResults.length > 0) {
        const last = loaded.demarcationResults[loaded.demarcationResults.length - 1];
        setDemBaseMapLabel(last.baseMapLabel);
        setDemOverlayMapLabel(last.overlayMapLabel);
        setDemBaseDagNo(last.baseDagNo);
        setDemOverlayDagNo(last.overlayDagNo);
        if (last.basePolygonId) setDemBasePolyId(last.basePolygonId);
        if (last.overlayPolygonId) setDemOverlayPolyId(last.overlayPolygonId);
      }
    },
    [resetDemarcationState, resetMapJointState]
  );

  const startNewDocument = useCallback(
    (titleBn: string, titleEn: string) => {
      const newDoc = createEmptyDocument(lang === 'bn' ? titleBn : titleEn);
      newDoc.unitProfile = { ...appSettings.unitProfile };
      setHistory(createHistory(newDoc));
      setSelectedIds([]);
      setDraftPoints([]);
      setPickedPoints([]);
      setWizardMeasuredShape(null);
      setPickedCoords([]);
      setAnglePreview(null);
      resetDemarcationState();
      resetMapJointState();
      resetPantographState();
      resetPartitionState();
      setViewport({ centerX: 40, centerY: 30, zoomPxPerFt: 4 });
      return newDoc;
    },
    [
      appSettings.unitProfile,
      lang,
      resetDemarcationState,
      resetMapJointState,
      resetPantographState,
      resetPartitionState,
    ]
  );

  const handleStartWizard = (wizard: WizardKind) => {
    const names: Record<WizardKind, [string, string]> = {
      measure: ['জমি মাপা প্রজেক্ট', 'Land Measurement'],
      pantograph: ['প্যান্টাগ্রাফ প্রজেক্ট', 'Pantograph Project'],
      joint: ['জমি জয়েন্ট প্রজেক্ট', 'Map Joint Project'],
      demarcation: ['ডিমার্কেশন (CS–RS ওভারলে)', 'Demarcation (CS–RS Overlay)'],
      partition: ['জমি ভাগ প্রজেক্ট', 'Plot Partition Project'],
    };
    startNewDocument(names[wizard][0], names[wizard][1]);
    setAdvancedMenuOpen(false);
    setActiveTool('select');
    setActiveWizard(wizard);
    setWizardStep(1);
    setWizardMinimized(false);
    setView('workspace');
  };

  const handleOpenBlankCanvas = () => {
    startNewDocument('নতুন সার্ভে প্রজেক্ট', 'New Survey Project');
    setActiveWizard(null);
    setWizardStep(1);
    setWizardMinimized(false);
    setAdvancedMenuOpen(false);
    setActiveTool('draw-polygon');
    setView('workspace');
  };

  const handleOpenProject = async (id: string) => {
    const loaded = await loadProjectFromDb(id);
    if (!loaded) return;
    setHistory(createHistory(loaded));
    setSelectedIds([]);
    setDraftPoints([]);
    setPickedPoints([]);
    setWizardMeasuredShape(null);
    setPickedCoords([]);
    setAnglePreview(null);
    syncDemarcationFromDoc(loaded);
    resetPantographState();
    resetPartitionState();
    setActiveWizard(null);
    setWizardStep(1);
    setWizardMinimized(false);
    setAdvancedMenuOpen(false);
    setActiveTool('select');
    fitViewToDocument(loaded);
    setView('workspace');
  };

  const handleToggleLang = async () => {
    const nextLang: Lang = lang === 'bn' ? 'en' : 'bn';
    const nextSettings: AppSettings = { ...appSettings, language: nextLang };
    setAppSettings(nextSettings);
    await saveAppSettings(nextSettings);
  };

  const layers = useMemo(() => getDocumentLayers(doc), [doc]);
  const activeLayer: CadLayer = useMemo(
    () => layers.find((l) => l.id === doc.activeLayerId) || layers[1] || layers[0],
    [layers, doc.activeLayerId]
  );

  // CAD Commit Handlers (via commands)
  const commitPolygon = useCallback(
    (
      pts: Point2D[],
      isMeasureOnly = false,
      meta?: Partial<PolygonEntity>
    ): PolygonEntity | null => {
      if (pts.length < 3) return null;
      const plotCount = doc.entities.filter((e) => e.kind === 'polygon').length;
      const plotsLayer = layers.find((l) => l.id === 'plots') || activeLayer;
      const base = createPolygonEntity(pts, {
        id: makeEntityId('poly'),
        layer: plotsLayer,
        color: meta?.color || plotsLayer.color || '#0F5132',
        plotNumber: meta?.plotNumber || formatNumber(plotCount + 1, 0, lang),
        ownerName: meta?.ownerName,
        measuredFromRaster: doc.rasterLayers.length > 0,
      });
      const ent: PolygonEntity = {
        ...base,
        ...meta,
      };
      dispatch({
        type: 'ADD_ENTITIES',
        label: isMeasureOnly ? 'Measure Area' : 'Add Plot',
        entities: [ent],
        markRasterMeasurement: doc.rasterLayers.length > 0,
      });
      setSelectedIds([ent.id]);
      if (activeWizard === 'partition' && wizardStep === 1 && !isMeasureOnly) {
        setDivSourcePolyId(ent.id);
        setDivResult(null);
        setDivSavedToPlots(false);
        setActiveTool('select');
        setWizardMinimized(false);
        showToast(
          lang === 'bn'
            ? 'নতুন দাগ আঁকা সম্পন্ন ও নির্বাচিত হয়েছে'
            : 'New plot drawn and selected'
        );
      }
      return ent;
    },
    [
      activeLayer,
      activeWizard,
      dispatch,
      doc.entities,
      doc.rasterLayers.length,
      lang,
      layers,
      showToast,
      wizardStep,
    ]
  );

  const handleCommitLine = (a: Point2D, b: Point2D) => {
    const ent = createLineEntity(a, b, { layer: activeLayer });
    dispatch({
      type: 'ADD_ENTITIES',
      label: 'Add Line',
      entities: [ent],
      markRasterMeasurement: doc.rasterLayers.length > 0,
    });
  };

  const handleCommitRect = (a: Point2D, b: Point2D) => {
    const ent = createRectangleEntity(a, b, { layer: activeLayer });
    dispatch({
      type: 'ADD_ENTITIES',
      label: 'Add Rectangle',
      entities: [ent],
      markRasterMeasurement: doc.rasterLayers.length > 0,
    });
    setSelectedIds([ent.id]);
  };

  const handleCommitCircle = (center: Point2D, radiusFt: number) => {
    const ent = createCircleEntity(center, radiusFt, { layer: activeLayer });
    dispatch({
      type: 'ADD_ENTITIES',
      label: 'Add Circle',
      entities: [ent],
      markRasterMeasurement: doc.rasterLayers.length > 0,
    });
    setSelectedIds([ent.id]);
  };

  const handleCommitArc = (p1: Point2D, p2: Point2D, p3: Point2D) => {
    const solved = arcFromThreePoints(p1, p2, p3);
    if (!solved) {
      showToast(
        lang === 'bn'
          ? '৩টি বিন্দু একই সরলরেখায় রয়েছে — ভিন্ন বিন্দু বাছুন'
          : 'The 3 points are collinear — pick non-collinear points'
      );
      return;
    }
    const ent = createArcEntity(
      solved.center,
      solved.radiusFt,
      solved.startAngleRad,
      solved.endAngleRad,
      solved.anticlockwise,
      {
        layer: activeLayer,
        threePoints: [p1, p2, p3],
      }
    );
    dispatch({
      type: 'ADD_ENTITIES',
      label: 'Add Arc',
      entities: [ent],
      markRasterMeasurement: doc.rasterLayers.length > 0,
    });
    setSelectedIds([ent.id]);
  };

  const handleCommitPolyline = (pts: Point2D[]) => {
    if (pts.length < 2) return;
    const ent = createPolylineEntity(pts, false, { layer: activeLayer });
    dispatch({
      type: 'ADD_ENTITIES',
      label: 'Add Polyline',
      entities: [ent],
      markRasterMeasurement: doc.rasterLayers.length > 0,
    });
    setSelectedIds([ent.id]);
  };

  const handleCommitPoint = (p: Point2D) => {
    const count = doc.entities.filter((e) => e.kind === 'point').length + 1;
    const ent = createPointEntity(p, {
      layer: activeLayer,
      color: '#B45309',
      marker: 'pillar',
      label: `P${formatNumber(count, 0, lang)}`,
    });
    dispatch({
      type: 'ADD_ENTITIES',
      label: 'Add Point',
      entities: [ent],
    });
  };

  const handleCommitDimension = (a: Point2D, b: Point2D) => {
    const dimLayer = layers.find((l) => l.id === 'dimensions') || activeLayer;
    const ent = createDimensionEntity(
      a,
      b,
      activeTool === 'measure-dist' ? 'bearing' : 'aligned',
      { layer: dimLayer, color: dimLayer.color || '#0369A1' }
    );
    dispatch({
      type: 'ADD_ENTITIES',
      label: 'Add Dimension',
      entities: [ent],
    });
  };

  const handleAttachRasterFile = async (
    file: File,
    openScaleFlow = false
  ): Promise<RasterLayer | null> => {
    try {
      const loaded = await loadImageFile(file);
      const layer = createRasterLayerFromImage(
        loaded,
        { x: viewport.centerX, y: viewport.centerY },
        180
      );
      dispatch({
        type: 'ADD_RASTER_LAYER',
        label: 'Attach Raster Map',
        layer,
      });
      setSelectedRasterId(layer.id);
      if (activeWizard === 'pantograph') {
        setPantoRasterId(layer.id);
        setPantoWindowBBox(null);
      }
      if (openScaleFlow) {
        setWizardMinimized(true);
        setPickedPoints([]);
        setActiveTool('pick-point');
        setScaleSheetTab('calibrate');
      }
      showToast(lang === 'bn' ? 'ম্যাপ ছবি যুক্ত হয়েছে' : 'Map image attached');
      return layer;
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'FILE_TOO_LARGE') {
        showToast(
          lang === 'bn'
            ? 'ছবি ২০ মেগাবাইটের বেশি — সর্বোচ্চ ২০ MB ছবি নির্বাচন করুন।'
            : 'Image exceeds 20 MB limit. Please pick a file up to 20 MB.'
        );
      } else {
        showToast(lang === 'bn' ? 'ছবি লোড করা যায়নি।' : 'Failed to load image file.');
      }
      return null;
    }
  };

  const handlePantographScale = (
    sourceId: string,
    factor: number,
    offsetAside: boolean
  ) => {
    const src = doc.entities.find((e) => e.id === sourceId);
    if (!src || src.kind !== 'polygon') return;
    const center = polygonCentroid(src.points);
    const bbox = getDocumentBBox({ ...doc, entities: [src], rasterLayers: [] });
    const shiftX = offsetAside && bbox ? (bbox.maxX - bbox.minX) * Math.max(1, factor) + 25 : 0;
    const scaledPts = src.points.map((p) => {
      const sp = scalePoint2D(p, center, factor);
      return { x: sp.x + shiftX, y: sp.y };
    });
    const plotsLayer = layers.find((l) => l.id === 'plots') || activeLayer;
    const newPoly: PolygonEntity = {
      ...createPolygonEntity(scaledPts, {
        id: makeEntityId('poly'),
        layer: plotsLayer,
        color: '#115E59',
        plotNumber: `${src.plotNumber || '১'} (${formatNumber(factor, 2, lang)}×)`,
        measuredFromRaster: doc.rasterLayers.length > 0,
      }),
      fillColor: '#0D9488',
    };
    dispatch({
      type: 'ADD_ENTITIES',
      label: 'Pantograph Scale',
      entities: [newPoly],
    });
    setSelectedIds([newPoly.id]);
    fitViewToDocument({ ...doc, entities: [...doc.entities, newPoly] });
  };

  const handleDemarcatePlot = (
    sourceId: string,
    parts: Point2D[][],
    addPillars: boolean
  ) => {
    const src = doc.entities.find((e) => e.id === sourceId);
    const baseNum = src && src.kind === 'polygon' ? src.plotNumber || '১' : '১';
    const plotsLayer = layers.find((l) => l.id === 'plots') || activeLayer;
    const newEntities: CadEntity[] = [];

    parts.forEach((pts, idx) => {
      const col = SHARE_COLORS[idx % SHARE_COLORS.length];
      newEntities.push({
        ...createPolygonEntity(pts, {
          id: makeEntityId('poly'),
          layer: plotsLayer,
          color: col,
          plotNumber: `${baseNum}/${formatNumber(idx + 1, 0, lang)}`,
          measuredFromRaster: src?.measuredFromRaster,
        }),
        fillColor: col,
      });
    });

    if (addPillars) {
      const seen = new Set<string>();
      let pillarSeq = 1;
      for (const pts of parts) {
        for (const p of pts) {
          const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          if (!seen.has(key)) {
            seen.add(key);
            newEntities.push(
              createPointEntity(p, {
                id: makeEntityId('pt'),
                layer: layers.find((l) => l.id === 'boundary') || activeLayer,
                color: '#B45309',
                marker: 'pillar',
                label: `K${formatNumber(pillarSeq++, 0, lang)}`,
              })
            );
          }
        }
      }
    }

    dispatch({
      type: 'REPLACE_ENTITIES',
      label: 'Demarcate Plot',
      removeIds: [sourceId],
      addEntities: newEntities,
    });
    setSelectedIds(newEntities.filter((e) => e.kind === 'polygon').map((e) => e.id));
  };

  // Exports
  const safeFileBase = (doc.name || 'surveycad').replace(/[^a-zA-Z0-9\u0980-\u09FF_-]+/g, '_');
  const orgInfo = {
    organizationName: appSettings.organizationName,
    phoneNumber: appSettings.phoneNumber,
  };

  const handleExportPdf = async () => {
    try {
      const bytes = await generateSurveyPdfBytes(doc, lang, orgInfo);
      await exportFileCrossPlatform(`${safeFileBase}.pdf`, bytes, 'application/pdf', doc.name);
      showToast(lang === 'bn' ? 'PDF রিপোর্ট তৈরি হয়েছে' : 'PDF report exported');
    } catch {
      showToast(lang === 'bn' ? 'PDF তৈরি করতে সমস্যা হয়েছে' : 'PDF export failed');
    }
  };

  const handleExportCsv = async () => {
    const csv = exportDocumentToCsv(doc, lang, orgInfo);
    await exportFileCrossPlatform(`${safeFileBase}.csv`, csv, 'text/csv;charset=utf-8', doc.name);
    showToast(lang === 'bn' ? 'CSV তালিকা ডাউনলোড হয়েছে' : 'CSV exported');
  };

  const handleExportDxf = async () => {
    const dxf = exportDocumentToDxf(doc);
    await exportFileCrossPlatform(`${safeFileBase}.dxf`, dxf, 'application/dxf', doc.name);
    showToast(lang === 'bn' ? 'DXF ফাইল ডাউনলোড হয়েছে' : 'DXF exported');
  };

  const handleExportJson = async () => {
    const json = serializeProjectJson(doc);
    await exportFileCrossPlatform(
      `${safeFileBase}.surveycad.json`,
      json,
      'application/json',
      doc.name
    );
    showToast(lang === 'bn' ? 'JSON ব্যাকআপ ডাউনলোড হয়েছে' : 'JSON backup exported');
  };

  const handleExportAllBackup = async () => {
    setIsBackingUp(true);
    try {
      await saveProjectToDb(doc);
      const { json, projectCount } = await exportAllProjectsBackupJson();
      const dateStr = new Date().toISOString().slice(0, 10);
      await exportFileCrossPlatform(
        `SurveyCAD_All_Backup_${dateStr}.json`,
        json,
        'application/json',
        lang === 'bn' ? 'SurveyCAD সম্পূর্ণ ব্যাকআপ' : 'SurveyCAD Full Backup'
      );
      showToast(
        lang === 'bn'
          ? `${formatNumber(projectCount, 0, lang)}টি প্রজেক্টের সম্পূর্ণ ব্যাকআপ ডাউনলোড হয়েছে`
          : `Exported backup for ${projectCount} project(s)`
      );
    } catch {
      showToast(
        lang === 'bn' ? 'ব্যাকআপ তৈরি করতে সমস্যা হয়েছে' : 'Failed to export backup'
      );
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleImportAllBackup = async (file: File) => {
    setIsBackingUp(true);
    try {
      const text = await file.text();
      const { importedCount, restoredSettings } = await importAllProjectsBackupJson(text);
      const nextList = await listProjectsFromDb();
      setProjects(nextList);
      if (restoredSettings) {
        setAppSettings(restoredSettings);
      }
      showToast(
        lang === 'bn'
          ? `${formatNumber(importedCount, 0, lang)}টি প্রজেক্ট ফোনে ফিরিয়ে আনা হয়েছে`
          : `Restored ${importedCount} project(s) to this device`
      );
    } catch {
      showToast(
        lang === 'bn'
          ? 'ব্যাকআপ ফাইলটি সঠিক SurveyCAD ফরম্যাটে নেই'
          : 'Invalid SurveyCAD backup file'
      );
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleImportProjectOrDxf = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.dxf')) {
        const entities = importDxfToEntities(text);
        if (entities.length === 0) {
          showToast(lang === 'bn' ? 'DXF ফাইলে কোনো অংশ পাওয়া যায়নি' : 'No entities found in DXF');
          return;
        }
        const nextDoc = createEmptyDocument(file.name.replace(/\.dxf$/i, ''));
        nextDoc.entities = entities;
        nextDoc.unitProfile = { ...appSettings.unitProfile };
        setHistory(createHistory(nextDoc));
        fitViewToDocument(nextDoc);
        setView('workspace');
        showToast(lang === 'bn' ? 'DXF ফাইল লোড হয়েছে' : 'DXF imported');
      } else {
        const imported = parseProjectJson(text);
        setHistory(createHistory(imported));
        syncDemarcationFromDoc(imported);
        fitViewToDocument(imported);
        setView('workspace');
        showToast(lang === 'bn' ? 'প্রজেক্ট লোড হয়েছে' : 'Project imported');
      }
    } catch {
      showToast(lang === 'bn' ? 'ফাইলটি সঠিক ফরম্যাটে নেই' : 'Invalid project or DXF file');
    }
  };

  // CS–RS Demarcation derived rasters & handlers
  const demBaseLayer = useMemo(
    () =>
      doc.rasterLayers.find((r) => r.id === demBaseRasterId) ||
      doc.rasterLayers[0] ||
      null,
    [doc.rasterLayers, demBaseRasterId]
  );

  const demOverlayLayer = useMemo(
    () =>
      doc.rasterLayers.find(
        (r) => r.id === demOverlayRasterId && r.id !== demBaseLayer?.id
      ) ||
      doc.rasterLayers.find((r) => r.id !== demBaseLayer?.id) ||
      null,
    [doc.rasterLayers, demOverlayRasterId, demBaseLayer]
  );

  const focusLayerForDemarcation = useCallback(
    (phase: 'base' | 'overlay', enabled = demAutoFocusTap) => {
      if (!enabled) return;
      if (demBaseLayer) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Focus Base Map',
          id: demBaseLayer.id,
          next: {
            ...demBaseLayer,
            visible: true,
            opacity: phase === 'base' ? 1 : 0.2,
          },
        });
      }
      if (demOverlayLayer) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Focus Overlay Map',
          id: demOverlayLayer.id,
          next: {
            ...demOverlayLayer,
            visible: true,
            opacity: phase === 'overlay' ? 0.92 : 0.14,
          },
        });
      }
    },
    [demAutoFocusTap, demBaseLayer, demOverlayLayer, dispatch]
  );

  const applyAlignmentPairs = useCallback(
    (nextPairs: AlignmentPair[], targetPhaseAfter?: 'base' | 'overlay') => {
      if (!demBaseLayer || !demOverlayLayer) return;

      if (nextPairs.length < 2) {
        const partialState: OverlayAlignmentState = {
          baseRasterId: demBaseLayer.id,
          overlayRasterId: demOverlayLayer.id,
          pairs: nextPairs,
          method: 'similarity-2pt',
          rmsErrorFt: 0,
          maxErrorFt: 0,
          residualsFt: [],
          updatedAt: Date.now(),
        };
        dispatch({
          type: 'UPDATE_DOCUMENT_META',
          label: 'Update Tie Point',
          patch: { overlayAlignment: nextPairs.length === 0 ? null : partialState },
        });
        if (targetPhaseAfter) focusLayerForDemarcation(targetPhaseAfter);
        return;
      }

      const solved = solveRasterAlignmentFromPairs(
        nextPairs.map((p) => ({
          baseWorld: p.baseWorld,
          overlayPx: p.overlayPx,
        }))
      );
      if (!solved) {
        showToast(
          lang === 'bn'
            ? 'বিন্দুগুলো একই অবস্থানে রয়েছে — আলাদা দুটি চিহ্ন বাছুন'
            : 'Control points are coincident — pick distinct landmarks'
        );
        return;
      }

      const overlayOpacity =
        targetPhaseAfter && demAutoFocusTap
          ? targetPhaseAfter === 'overlay'
            ? 0.92
            : 0.18
          : 0.65;

      const updatedOverlay: RasterLayer = {
        ...demOverlayLayer,
        transform: solved.transform,
        calibrated: true,
        visible: true,
        opacity: overlayOpacity,
      };

      dispatch({
        type: 'UPDATE_RASTER_LAYER',
        label: 'Align Overlay Map',
        id: demOverlayLayer.id,
        next: updatedOverlay,
      });

      if (targetPhaseAfter && demAutoFocusTap) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Focus Base Map',
          id: demBaseLayer.id,
          next: {
            ...demBaseLayer,
            visible: true,
            opacity: targetPhaseAfter === 'base' ? 1 : 0.2,
          },
        });
      }

      const alignmentState: OverlayAlignmentState = {
        baseRasterId: demBaseLayer.id,
        overlayRasterId: demOverlayLayer.id,
        pairs: nextPairs,
        method: solved.method,
        rmsErrorFt: solved.rmsErrorFt,
        maxErrorFt: solved.maxErrorFt,
        residualsFt: solved.residualsFt,
        updatedAt: Date.now(),
      };

      dispatch({
        type: 'UPDATE_DOCUMENT_META',
        label: 'Save Overlay Alignment',
        patch: {
          overlayAlignment: alignmentState,
          hasRasterMeasurement: true,
        },
      });

      if (nextPairs.length === 2) {
        fitViewToDocument({
          ...doc,
          rasterLayers: doc.rasterLayers.map((r) =>
            r.id === updatedOverlay.id ? updatedOverlay : r
          ),
        });
        showToast(
          lang === 'bn'
            ? '২ বিন্দুতে ওভারলে মিলেছে! আরও নিখুঁত ফিট ও RMS দেখতে ৩য়+ বিন্দু যোগ করুন।'
            : 'Overlay aligned (2-pt)! Add a 3rd+ point for least-squares RMS check.'
        );
      } else {
        showToast(
          lang === 'bn'
            ? `লিস্ট-স্কোয়ার (${formatNumber(nextPairs.length, 0, lang)} জোড়া) · RMS ত্রুটি: ${formatNumber(
                solved.rmsErrorFt,
                2,
                lang
              )} ফুট`
            : `Least-squares (${nextPairs.length} pairs) · RMS error: ${solved.rmsErrorFt.toFixed(
                2
              )} ft`
        );
      }
    },
    [
      demAutoFocusTap,
      demBaseLayer,
      demOverlayLayer,
      dispatch,
      doc,
      fitViewToDocument,
      focusLayerForDemarcation,
      lang,
      showToast,
    ]
  );

  const handleDemarcationPickLandmark = useCallback(
    (worldPt: Point2D) => {
      if (!demBaseLayer || !demOverlayLayer) {
        showToast(
          lang === 'bn'
            ? 'আগে বেস ও ওভারলে উভয় ম্যাপ লোড করুন।'
            : 'Load both base and overlay maps first.'
        );
        return;
      }
      const existingPairs = doc.overlayAlignment?.pairs || [];
      if (demPairPhase === 'base') {
        setDemPendingBasePt(worldPt);
        setDemPairPhase('overlay');
        focusLayerForDemarcation('overlay');
        showToast(
          lang === 'bn'
            ? `জোড়া P${formatNumber(existingPairs.length + 1, 0, lang)} বেস ম্যাপে নেওয়া হয়েছে — এবার ${demOverlayMapLabel}-এ একই চিহ্ন ট্যাপ করুন`
            : `Base P${existingPairs.length + 1} captured — now tap the SAME landmark on ${demOverlayMapLabel}`
        );
      } else {
        if (!demPendingBasePt) {
          setDemPairPhase('base');
          focusLayerForDemarcation('base');
          return;
        }
        const overlayPx = worldToRasterPixel(worldPt, demOverlayLayer.transform);
        const newPair: AlignmentPair = {
          id: makeEntityId('pair'),
          baseWorld: demPendingBasePt,
          overlayPx,
          label: `P${existingPairs.length + 1}`,
        };
        const nextPairs = [...existingPairs, newPair];
        setDemPendingBasePt(null);
        setDemPairPhase('base');
        applyAlignmentPairs(nextPairs, 'base');
      }
    },
    [
      applyAlignmentPairs,
      demBaseLayer,
      demOverlayLayer,
      demOverlayMapLabel,
      demPairPhase,
      demPendingBasePt,
      doc.overlayAlignment?.pairs,
      focusLayerForDemarcation,
      lang,
      showToast,
    ]
  );

  const handleDemUndoLastPairTap = useCallback(() => {
    if (demPairPhase === 'overlay' && demPendingBasePt) {
      setDemPendingBasePt(null);
      setDemPairPhase('base');
      focusLayerForDemarcation('base');
      return;
    }
    const existing = doc.overlayAlignment?.pairs || [];
    if (existing.length > 0) {
      applyAlignmentPairs(existing.slice(0, -1), 'base');
    }
  }, [
    applyAlignmentPairs,
    demPairPhase,
    demPendingBasePt,
    doc.overlayAlignment?.pairs,
    focusLayerForDemarcation,
  ]);

  const handleDemDeletePair = useCallback(
    (pairId: string) => {
      const next = (doc.overlayAlignment?.pairs || []).filter((p) => p.id !== pairId);
      applyAlignmentPairs(next, demPairPhase);
    },
    [applyAlignmentPairs, demPairPhase, doc.overlayAlignment?.pairs]
  );

  const handleDemClearAllPairs = useCallback(() => {
    setDemPendingBasePt(null);
    setDemPairPhase('base');
    dispatch({
      type: 'UPDATE_DOCUMENT_META',
      label: 'Reset Alignment Pairs',
      patch: { overlayAlignment: null },
    });
    focusLayerForDemarcation('base');
  }, [dispatch, focusLayerForDemarcation]);

  const handleStartDemTraceDag = useCallback(
    (target: 'base' | 'overlay', _dagNo: string) => {
      setDemTraceTarget(target);
      setDraftPoints([]);
      setActiveTool('measure-area');
      setWizardMinimized(true);
      if (demBaseLayer) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Focus Trace Base',
          id: demBaseLayer.id,
          next: {
            ...demBaseLayer,
            visible: true,
            opacity: target === 'base' ? 1 : 0.35,
          },
        });
      }
      if (demOverlayLayer) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Focus Trace Overlay',
          id: demOverlayLayer.id,
          next: {
            ...demOverlayLayer,
            visible: true,
            opacity: target === 'overlay' ? 0.85 : 0.18,
          },
        });
      }
    },
    [demBaseLayer, demOverlayLayer, dispatch]
  );

  const handleFinishDemTraceDag = useCallback(
    (target: 'base' | 'overlay', dagNo: string, pts: Point2D[]) => {
      if (pts.length < 3) return;
      const cleanDag =
        dagNo.trim() ||
        (target === 'base'
          ? lang === 'bn'
            ? 'সাবেক'
            : 'CS'
          : lang === 'bn'
          ? 'হাল'
          : 'RS');
      const mapLbl = target === 'base' ? demBaseMapLabel : demOverlayMapLabel;
      const saved = commitPolygon(pts, false, {
        color: target === 'base' ? '#1D4ED8' : '#DC2626',
        fillColor: target === 'base' ? '#2563EB' : '#EF4444',
        plotNumber: `${mapLbl} ${cleanDag}`,
      });
      if (saved) {
        if (target === 'base') {
          setDemBasePolyId(saved.id);
        } else {
          setDemOverlayPolyId(saved.id);
        }
        showToast(
          lang === 'bn'
            ? `${mapLbl} দাগ ${cleanDag} সংরক্ষিত হয়েছে`
            : `${mapLbl} Dag ${cleanDag} saved`
        );
      }
      if (demBaseLayer) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Restore Base Opacity',
          id: demBaseLayer.id,
          next: { ...demBaseLayer, visible: true, opacity: 1 },
        });
      }
      if (demOverlayLayer) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Restore Overlay Opacity',
          id: demOverlayLayer.id,
          next: { ...demOverlayLayer, visible: true, opacity: 0.55 },
        });
      }
      setDraftPoints([]);
      setActiveTool('select');
      setWizardMinimized(false);
    },
    [
      commitPolygon,
      demBaseLayer,
      demBaseMapLabel,
      demOverlayLayer,
      demOverlayMapLabel,
      dispatch,
      lang,
      showToast,
    ]
  );

  const handleAddDemarcationResultToReport = useCallback(
    (rec: DemarcationRecord) => {
      const existing = doc.demarcationResults || [];
      if (existing.some((r) => r.id === rec.id)) {
        showToast(
          lang === 'bn' ? 'এই ফলাফল ইতোমধ্যে রিপোর্টে রয়েছে' : 'Result already in report'
        );
        return;
      }
      dispatch({
        type: 'UPDATE_DOCUMENT_META',
        label: 'Add Demarcation Result to Report',
        patch: {
          demarcationResults: [...existing, rec],
        },
      });
      showToast(
        lang === 'bn'
          ? 'ওভারল্যাপ ফলাফল টেবিল রিপোর্টে যুক্ত হয়েছে'
          : 'Overlap result table added to report'
      );
    },
    [dispatch, doc.demarcationResults, lang, showToast]
  );

  const selectedEntities = useMemo(
    () => doc.entities.filter((e) => selectedIds.includes(e.id)),
    [doc.entities, selectedIds]
  );

  const polygons = useMemo(
    () => doc.entities.filter((e): e is PolygonEntity => e.kind === 'polygon' && e.visible !== false),
    [doc.entities]
  );

  const totalAreaSqFt = useMemo(
    () => polygons.reduce((acc, p) => acc + polygonAreaSqFt(p.points), 0),
    [polygons]
  );
  const totalBreakdown = useMemo(
    () => computeAreaBreakdown(totalAreaSqFt, doc.unitProfile),
    [totalAreaSqFt, doc.unitProfile]
  );

  const handleFlipOverlayHorizontal = useCallback(async () => {
    if (!demOverlayLayer || demFlipping) return;
    setDemFlipping(true);
    try {
      const flipped = await flipRasterImageHorizontal(demOverlayLayer);
      dispatch({
        type: 'UPDATE_RASTER_LAYER',
        label: 'Flip Overlay Horizontally',
        id: flipped.id,
        next: flipped,
      });

      const curAlign = doc.overlayAlignment;
      if (
        curAlign &&
        curAlign.overlayRasterId === flipped.id &&
        curAlign.pairs.length > 0
      ) {
        const mirroredPairs: AlignmentPair[] = curAlign.pairs.map((p) => ({
          ...p,
          overlayPx: flipPixelX(p.overlayPx, flipped.widthPx),
        }));
        if (mirroredPairs.length >= 2) {
          const solved = solveRasterAlignmentFromPairs(
            mirroredPairs.map((p) => ({
              baseWorld: p.baseWorld,
              overlayPx: p.overlayPx,
            }))
          );
          if (solved) {
            dispatch({
              type: 'UPDATE_RASTER_LAYER',
              label: 'Re-align Flipped Overlay',
              id: flipped.id,
              next: { ...flipped, transform: solved.transform, calibrated: true },
            });
            dispatch({
              type: 'UPDATE_DOCUMENT_META',
              label: 'Update Mirrored Alignment Pairs',
              patch: {
                overlayAlignment: {
                  ...curAlign,
                  pairs: mirroredPairs,
                  method: solved.method,
                  rmsErrorFt: solved.rmsErrorFt,
                  maxErrorFt: solved.maxErrorFt,
                  residualsFt: solved.residualsFt,
                  updatedAt: Date.now(),
                },
              },
            });
          }
        } else {
          dispatch({
            type: 'UPDATE_DOCUMENT_META',
            label: 'Update Mirrored Pair',
            patch: {
              overlayAlignment: {
                ...curAlign,
                pairs: mirroredPairs,
                updatedAt: Date.now(),
              },
            },
          });
        }
      }

      showToast(
        lang === 'bn'
          ? 'ওভারলে ম্যাপ হরিজন্টালি ফ্লিপ করা হয়েছে'
          : 'Overlay map flipped horizontally'
      );
    } catch {
      showToast(
        lang === 'bn'
          ? 'ম্যাপ ফ্লিপ করতে সমস্যা হয়েছে'
          : 'Failed to flip overlay map'
      );
    } finally {
      setDemFlipping(false);
    }
  }, [demFlipping, demOverlayLayer, dispatch, doc.overlayAlignment, lang, showToast]);

  // Map Joint derived rasters & handlers
  const jointSheetA = useMemo(
    () =>
      doc.rasterLayers.find((r) => r.id === jointSheetAId) ||
      doc.rasterLayers[0] ||
      null,
    [doc.rasterLayers, jointSheetAId]
  );

  const jointSheetB = useMemo(
    () =>
      doc.rasterLayers.find(
        (r) => r.id === jointSheetBId && r.id !== jointSheetA?.id
      ) ||
      doc.rasterLayers.find((r) => r.id !== jointSheetA?.id) ||
      null,
    [doc.rasterLayers, jointSheetA, jointSheetBId]
  );

  const focusLayerForJoint = useCallback(
    (phase: 'a' | 'b', enabled = jointAutoFocusTap) => {
      if (!enabled) return;
      if (jointSheetA) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Focus Sheet A',
          id: jointSheetA.id,
          next: {
            ...jointSheetA,
            visible: true,
            opacity: phase === 'a' ? 1 : 0.3,
          },
        });
      }
      if (jointSheetB) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Focus Sheet B',
          id: jointSheetB.id,
          next: {
            ...jointSheetB,
            visible: true,
            opacity: phase === 'b' ? 0.95 : 0.25,
          },
        });
      }
    },
    [dispatch, jointAutoFocusTap, jointSheetA, jointSheetB]
  );

  const applyJointAlignmentPairs = useCallback(
    (nextPairs: AlignmentPair[], targetPhaseAfter?: 'a' | 'b') => {
      if (!jointSheetA || !jointSheetB) return;

      if (nextPairs.length < 2) {
        const partialState: OverlayAlignmentState = {
          baseRasterId: jointSheetA.id,
          overlayRasterId: jointSheetB.id,
          pairs: nextPairs,
          method: 'similarity-2pt',
          rmsErrorFt: 0,
          maxErrorFt: 0,
          residualsFt: [],
          updatedAt: Date.now(),
        };
        dispatch({
          type: 'UPDATE_DOCUMENT_META',
          label: 'Update Joint Tie Point',
          patch: { overlayAlignment: nextPairs.length === 0 ? null : partialState },
        });
        if (targetPhaseAfter) focusLayerForJoint(targetPhaseAfter);
        return;
      }

      const solved = solveRasterAlignmentFromPairs(
        nextPairs.map((p) => ({
          baseWorld: p.baseWorld,
          overlayPx: p.overlayPx,
        }))
      );
      if (!solved) {
        showToast(
          lang === 'bn'
            ? 'বিন্দু দুটি একই অবস্থানে — আলাদা সংযোগ বিন্দু বাছুন'
            : 'Control points are coincident — pick distinct edge landmarks'
        );
        return;
      }

      const bOpacity =
        targetPhaseAfter && jointAutoFocusTap
          ? targetPhaseAfter === 'b'
            ? 0.95
            : 0.25
          : 0.72;

      const updatedB: RasterLayer = {
        ...jointSheetB,
        transform: solved.transform,
        calibrated: true,
        pixelsPerFoot: 1 / Math.max(1e-9, solved.transform.scaleFtPerPx),
        visible: true,
        locked: false,
        opacity: bOpacity,
      };

      dispatch({
        type: 'UPDATE_RASTER_LAYER',
        label: 'Align Sheet B to A',
        id: jointSheetB.id,
        next: updatedB,
      });

      if (targetPhaseAfter && jointAutoFocusTap) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Focus Sheet A',
          id: jointSheetA.id,
          next: {
            ...jointSheetA,
            visible: true,
            opacity: targetPhaseAfter === 'a' ? 1 : 0.3,
          },
        });
      }

      const alignmentState: OverlayAlignmentState = {
        baseRasterId: jointSheetA.id,
        overlayRasterId: jointSheetB.id,
        pairs: nextPairs,
        method: solved.method,
        rmsErrorFt: solved.rmsErrorFt,
        maxErrorFt: solved.maxErrorFt,
        residualsFt: solved.residualsFt,
        updatedAt: Date.now(),
      };

      dispatch({
        type: 'UPDATE_DOCUMENT_META',
        label: 'Save Map Joint Alignment',
        patch: {
          overlayAlignment: alignmentState,
          hasRasterMeasurement: true,
        },
      });

      fitViewToDocument({
        ...doc,
        rasterLayers: doc.rasterLayers.map((r) =>
          r.id === updatedB.id ? updatedB : r
        ),
      });

      if (nextPairs.length === 2) {
        showToast(
          lang === 'bn'
            ? 'সিট B স্বয়ংক্রিয়ভাবে সিট A-এর সাথে বসেছে (আরও নিখুঁত RMS যাচাইয়ের জন্য ৩য় বিন্দু যোগ করতে পারেন)'
            : 'Sheet B aligned via similarity transform (add 3rd+ point for RMS check)'
        );
      } else {
        showToast(
          lang === 'bn'
            ? `সংযোজন RMS ত্রুটি: ${formatNumber(solved.rmsErrorFt, 2, lang)} ফুট`
            : `Joint alignment RMS error: ${solved.rmsErrorFt.toFixed(2)} ft`
        );
      }
    },
    [
      dispatch,
      doc,
      fitViewToDocument,
      focusLayerForJoint,
      jointAutoFocusTap,
      jointSheetA,
      jointSheetB,
      lang,
      showToast,
    ]
  );

  const handleJointPickLandmark = useCallback(
    (worldPt: Point2D) => {
      if (!jointSheetA || !jointSheetB) {
        showToast(
          lang === 'bn'
            ? 'আগে সিট A এবং সিট B উভয় ম্যাপ খুলুন।'
            : 'Open both Sheet A and Sheet B first.'
        );
        return;
      }
      const existingPairs = doc.overlayAlignment?.pairs || [];
      if (jointPairPhase === 'a') {
        setJointPendingAPt(worldPt);
        setJointPairPhase('b');
        focusLayerForJoint('b');
        showToast(
          lang === 'bn'
            ? `P${formatNumber(existingPairs.length + 1, 0, lang)} সিট A-তে নেওয়া হয়েছে — এবার সিট B-এ একই সংযোগ বিন্দু ট্যাপ করুন`
            : `Point P${existingPairs.length + 1} on Sheet A captured — now tap SAME landmark on Sheet B`
        );
      } else {
        if (!jointPendingAPt) {
          setJointPairPhase('a');
          focusLayerForJoint('a');
          return;
        }
        const overlayPx = worldToRasterPixel(worldPt, jointSheetB.transform);
        const newPair: AlignmentPair = {
          id: makeEntityId('jpair'),
          baseWorld: jointPendingAPt,
          overlayPx,
          label: `P${existingPairs.length + 1}`,
        };
        const nextPairs = [...existingPairs, newPair];
        setJointPendingAPt(null);
        setJointPairPhase('a');
        applyJointAlignmentPairs(nextPairs, 'a');
      }
    },
    [
      applyJointAlignmentPairs,
      doc.overlayAlignment?.pairs,
      focusLayerForJoint,
      jointPairPhase,
      jointPendingAPt,
      jointSheetA,
      jointSheetB,
      lang,
      showToast,
    ]
  );

  const handleJointUndoLastPairTap = useCallback(() => {
    if (jointPairPhase === 'b' && jointPendingAPt) {
      setJointPendingAPt(null);
      setJointPairPhase('a');
      focusLayerForJoint('a');
      return;
    }
    const existing = doc.overlayAlignment?.pairs || [];
    if (existing.length > 0) {
      applyJointAlignmentPairs(existing.slice(0, -1), 'a');
    }
  }, [
    applyJointAlignmentPairs,
    doc.overlayAlignment?.pairs,
    focusLayerForJoint,
    jointPairPhase,
    jointPendingAPt,
  ]);

  const handleJointDeletePair = useCallback(
    (pairId: string) => {
      const next = (doc.overlayAlignment?.pairs || []).filter((p) => p.id !== pairId);
      applyJointAlignmentPairs(next, jointPairPhase);
    },
    [applyJointAlignmentPairs, doc.overlayAlignment?.pairs, jointPairPhase]
  );

  const handleJointClearAllPairs = useCallback(() => {
    setJointPendingAPt(null);
    setJointPairPhase('a');
    dispatch({
      type: 'UPDATE_DOCUMENT_META',
      label: 'Reset Map Joint Tie Points',
      patch: { overlayAlignment: null },
    });
    focusLayerForJoint('a');
  }, [dispatch, focusLayerForJoint]);

  const handleExportJointImage = async (
    opts: JoinedMapRenderOptions & { format: 'png' | 'jpeg' }
  ) => {
    setJointExporting(true);
    try {
      const { bytes } = await exportJoinedMapBytes(opts);
      const mime = opts.format === 'png' ? 'image/png' : 'image/jpeg';
      const ext = opts.format === 'png' ? 'png' : 'jpg';
      await exportFileCrossPlatform(
        `${safeFileBase}_joined.${ext}`,
        bytes,
        mime,
        `${doc.name} (Joined)`
      );
      showToast(
        lang === 'bn'
          ? `সংযুক্ত ম্যাপ (${opts.format.toUpperCase()}) এক্সপোর্ট হয়েছে`
          : `Joined map exported as ${opts.format.toUpperCase()}`
      );
    } catch {
      showToast(
        lang === 'bn'
          ? 'সংযুক্ত ম্যাপ এক্সপোর্ট করতে সমস্যা হয়েছে'
          : 'Failed to export joined map'
      );
    } finally {
      setJointExporting(false);
    }
  };

  const mapJointSession: MapJointSessionProps = {
    sheetARasterId: jointSheetAId,
    onSheetARasterIdChange: setJointSheetAId,
    sheetBRasterId: jointSheetBId,
    onSheetBRasterIdChange: setJointSheetBId,
    pairPhase: jointPairPhase,
    onSetPairPhase: (phase) => {
      setJointPairPhase(phase);
      focusLayerForJoint(phase);
    },
    onUndoLastPairTap: handleJointUndoLastPairTap,
    onDeletePair: handleJointDeletePair,
    onClearAllPairs: handleJointClearAllPairs,
    autoFocusTap: jointAutoFocusTap,
    onAutoFocusTapChange: (v) => {
      setJointAutoFocusTap(v);
      if (v) focusLayerForJoint(jointPairPhase, true);
    },
    onReapplyAutoAlignment: () => {
      const curPairs = doc.overlayAlignment?.pairs || [];
      if (curPairs.length >= 2) {
        applyJointAlignmentPairs(curPairs);
      }
    },
    onStartDragSheetB: () => {
      if (!jointSheetB) return;
      setSelectedIds([]);
      setSelectedRasterId(jointSheetB.id);
      setActiveTool('select');
      dispatch({
        type: 'UPDATE_RASTER_LAYER',
        label: 'Unlock Sheet B for Drag',
        id: jointSheetB.id,
        next: { ...jointSheetB, locked: false, visible: true, opacity: 0.72 },
      });
    },
    mergedLocked: jointMergedLocked,
    onMergeKeepLayers: () => {
      if (jointSheetA) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Merge Lock Sheet A',
          id: jointSheetA.id,
          next: { ...jointSheetA, locked: true, visible: true, opacity: 1 },
        });
      }
      if (jointSheetB) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Merge Lock Sheet B',
          id: jointSheetB.id,
          next: { ...jointSheetB, locked: true, visible: true, opacity: 1 },
        });
      }
      setJointMergedLocked(true);
      fitViewToDocument(doc);
    },
    onStartCrossSheetMeasure: (kind) => {
      if (jointSheetA) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Lock Sheet A',
          id: jointSheetA.id,
          next: { ...jointSheetA, locked: true, visible: true, opacity: 1 },
        });
      }
      if (jointSheetB) {
        dispatch({
          type: 'UPDATE_RASTER_LAYER',
          label: 'Lock Sheet B',
          id: jointSheetB.id,
          next: { ...jointSheetB, locked: true, visible: true, opacity: 1 },
        });
      }
      setJointMergedLocked(true);
      setDraftPoints([]);
      setActiveTool(kind === 'area' ? 'measure-area' : 'measure-path');
      setWizardMinimized(true);
    },
    exportResolution: jointExportResolution,
    onExportResolutionChange: setJointExportResolution,
    exportIncludeVectors: jointIncludeVectors,
    onExportIncludeVectorsChange: setJointIncludeVectors,
    exportIncludeAnnotations: jointIncludeAnnotations,
    onExportIncludeAnnotationsChange: setJointIncludeAnnotations,
    onExportImage: handleExportJointImage,
    isExporting: jointExporting,
  };

  const pickedPins: PickedPin[] = useMemo(() => {
    if (activeWizard === 'demarcation' && wizardStep === 3) {
      const pins: PickedPin[] = [];
      const pairs = doc.overlayAlignment?.pairs || [];
      pairs.forEach((pair, idx) => {
        pins.push({
          point: pair.baseWorld,
          label: `CS${idx + 1}`,
          color: '#1D4ED8',
        });
        if (demOverlayLayer) {
          pins.push({
            point: rasterPixelToWorld(pair.overlayPx, demOverlayLayer.transform),
            label: `RS${idx + 1}`,
            color: '#DC2626',
          });
        }
      });
      if (demPendingBasePt) {
        pins.push({
          point: demPendingBasePt,
          label: `CS${pairs.length + 1}?`,
          color: '#2563EB',
        });
      }
      return pins;
    }

    if (activeWizard === 'joint' && wizardStep === 3) {
      const pins: PickedPin[] = [];
      const pairs = doc.overlayAlignment?.pairs || [];
      pairs.forEach((pair, idx) => {
        pins.push({
          point: pair.baseWorld,
          label: `A${idx + 1}`,
          color: '#B45309',
        });
        if (jointSheetB) {
          pins.push({
            point: rasterPixelToWorld(pair.overlayPx, jointSheetB.transform),
            label: `B${idx + 1}`,
            color: '#0F5132',
          });
        }
      });
      if (jointPendingAPt) {
        pins.push({
          point: jointPendingAPt,
          label: `A${pairs.length + 1}?`,
          color: '#D97706',
        });
      }
      return pins;
    }

    return pickedPoints.map((p, idx) => ({
      point: p,
      label:
        activeWizard === 'joint'
          ? `S${idx + 1}`
          : `P${idx + 1}`,
      color: idx < 2 ? '#DC2626' : '#1D4ED8',
    }));
  }, [
    activeWizard,
    demOverlayLayer,
    demPendingBasePt,
    doc.overlayAlignment?.pairs,
    jointPendingAPt,
    jointSheetB,
    pickedPoints,
    wizardStep,
  ]);

  const demarcationAlignmentVectors = useMemo(() => {
    const isDemarcation = activeWizard === 'demarcation';
    const isJoint = activeWizard === 'joint';
    const targetLayer = isDemarcation
      ? demOverlayLayer
      : isJoint
      ? jointSheetB
      : null;
    if (
      (!isDemarcation && !isJoint) ||
      (wizardStep !== 3 && wizardStep !== 4 && wizardStep !== 5) ||
      !targetLayer ||
      !doc.overlayAlignment ||
      doc.overlayAlignment.pairs.length < 2
    ) {
      return [];
    }
    const { pairs, residualsFt } = doc.overlayAlignment;
    return pairs.map((pair, idx) => ({
      from: rasterPixelToWorld(pair.overlayPx, targetLayer.transform),
      to: pair.baseWorld,
      label: `${(residualsFt[idx] ?? 0).toFixed(1)}ft`,
    }));
  }, [activeWizard, demOverlayLayer, doc.overlayAlignment, jointSheetB, wizardStep]);

  const demarcationOverlapRings = useMemo(() => {
    if (activeWizard === 'demarcation' && demBasePolyId && demOverlayPolyId) {
      const bp = polygons.find((p) => p.id === demBasePolyId);
      const op = polygons.find((p) => p.id === demOverlayPolyId);
      if (bp && op) {
        return computePolygonOverlapMetrics(bp.points, op.points, doc.unitProfile)
          .overlapRings;
      }
    }
    if (doc.demarcationResults && doc.demarcationResults.length > 0) {
      return doc.demarcationResults.flatMap(
        (rec) =>
          computePolygonOverlapMetrics(
            rec.basePolygon,
            rec.overlayPolygon,
            doc.unitProfile
          ).overlapRings
      );
    }
    return [];
  }, [
    activeWizard,
    demBasePolyId,
    demOverlayPolyId,
    doc.demarcationResults,
    doc.unitProfile,
    polygons,
  ]);

  const demarcationSession: DemarcationSessionProps = {
    baseRasterId: demBaseRasterId,
    onBaseRasterIdChange: setDemBaseRasterId,
    overlayRasterId: demOverlayRasterId,
    onOverlayRasterIdChange: setDemOverlayRasterId,
    baseMapLabel: demBaseMapLabel,
    onBaseMapLabelChange: setDemBaseMapLabel,
    overlayMapLabel: demOverlayMapLabel,
    onOverlayMapLabelChange: setDemOverlayMapLabel,
    pairPhase: demPairPhase,
    onSetPairPhase: (phase) => {
      setDemPairPhase(phase);
      focusLayerForDemarcation(phase);
    },
    onUndoLastPairTap: handleDemUndoLastPairTap,
    onDeletePair: handleDemDeletePair,
    onClearAllPairs: handleDemClearAllPairs,
    autoFocusTap: demAutoFocusTap,
    onAutoFocusTapChange: (v) => {
      setDemAutoFocusTap(v);
      if (v) focusLayerForDemarcation(demPairPhase, true);
    },
    onFlipOverlayHorizontal: handleFlipOverlayHorizontal,
    isFlippingOverlay: demFlipping,
    traceTarget: demTraceTarget,
    onStartTraceDag: handleStartDemTraceDag,
    onFinishTraceDag: handleFinishDemTraceDag,
    baseDagNo: demBaseDagNo,
    onBaseDagNoChange: setDemBaseDagNo,
    overlayDagNo: demOverlayDagNo,
    onOverlayDagNoChange: setDemOverlayDagNo,
    basePolyId: demBasePolyId,
    onBasePolyIdChange: setDemBasePolyId,
    overlayPolyId: demOverlayPolyId,
    onOverlayPolyIdChange: setDemOverlayPolyId,
    onAddResultToReport: handleAddDemarcationResultToReport,
    reportSavedForCurrent: Boolean(
      demBasePolyId &&
        demOverlayPolyId &&
        doc.demarcationResults?.some(
          (r) => r.id === `dem-${demBasePolyId}-${demOverlayPolyId}`
        )
    ),
  };

  const handleExportPantographPng = async (opts: PantographRenderOptions) => {
    setPantoExporting(true);
    try {
      const { bytes } = await exportPantographPngBytes(opts);
      await exportFileCrossPlatform(
        `${safeFileBase}_pantograph.png`,
        bytes,
        'image/png',
        `${doc.name} (Pantograph)`
      );
      showToast(
        lang === 'bn'
          ? 'রি-স্কেল করা PNG ছবি সেভ হয়েছে'
          : 'Re-scaled PNG image exported'
      );
    } catch {
      showToast(
        lang === 'bn'
          ? 'PNG তৈরি করতে সমস্যা হয়েছে'
          : 'Failed to export Pantograph PNG'
      );
    } finally {
      setPantoExporting(false);
    }
  };

  const handleExportPantographPdf = async (opts: PantographRenderOptions) => {
    setPantoExporting(true);
    try {
      const { bytes } = await exportPantographPdfBytes(opts);
      await exportFileCrossPlatform(
        `${safeFileBase}_pantograph.pdf`,
        bytes,
        'application/pdf',
        `${doc.name} (Pantograph)`
      );
      showToast(
        lang === 'bn'
          ? 'রি-স্কেল করা PDF সেভ হয়েছে'
          : 'Re-scaled PDF exported'
      );
    } catch {
      showToast(
        lang === 'bn'
          ? 'PDF তৈরি করতে সমস্যা হয়েছে'
          : 'Failed to export Pantograph PDF'
      );
    } finally {
      setPantoExporting(false);
    }
  };

  const pantographSession: PantographSessionProps = {
    rasterId: pantoRasterId,
    onRasterIdChange: setPantoRasterId,
    oldScaleInputMode: pantoOldScaleInputMode,
    onOldScaleInputModeChange: setPantoOldScaleInputMode,
    oldInchesPerMile: pantoOldInchesPerMile,
    onOldInchesPerMileChange: setPantoOldInchesPerMile,
    oldRfDenominator: pantoOldRfDenominator,
    onOldRfDenominatorChange: setPantoOldRfDenominator,
    newScaleInputMode: pantoNewScaleInputMode,
    onNewScaleInputModeChange: setPantoNewScaleInputMode,
    newInchesPerMile: pantoNewInchesPerMile,
    onNewInchesPerMileChange: setPantoNewInchesPerMile,
    newRfDenominator: pantoNewRfDenominator,
    onNewRfDenominatorChange: setPantoNewRfDenominator,
    areaMode: pantoAreaMode,
    onAreaModeChange: setPantoAreaMode,
    windowBBox: pantoWindowBBox,
    onClearWindowBBox: () => setPantoWindowBBox(null),
    paperSize: pantoPaperSize,
    onPaperSizeChange: setPantoPaperSize,
    orientation: pantoOrientation,
    onOrientationChange: setPantoOrientation,
    fitMode: pantoFitMode,
    onFitModeChange: setPantoFitMode,
    includeVectors: pantoIncludeVectors,
    onIncludeVectorsChange: setPantoIncludeVectors,
    onExportPng: handleExportPantographPng,
    onExportPdf: handleExportPantographPdf,
    isExporting: pantoExporting,
  };

  // Plot Division (ভাগবণ্টন) computed state & handlers
  const divSourcePoly = useMemo(
    () => polygons.find((p) => p.id === divSourcePolyId) || polygons[0] || null,
    [divSourcePolyId, polygons]
  );

  const buildDivNormalizedShares = useCallback(
    (totalSqFt: number) => {
      if (totalSqFt <= 1e-6) return [];
      if (divDivideMode === 'equal') {
        const count = Math.max(
          2,
          Math.min(20, Math.round(parseLocalizedNumber(divEqualParts) || 2))
        );
        return normalizePartitionShares(
          'equal',
          totalSqFt,
          { equalCount: count, names: divEqualNames },
          lang
        );
      }
      if (divDivideMode === 'exact') {
        const targetSqFt = toSqFt(
          parseLocalizedNumber(divExactAmount),
          divExactUnit,
          doc.unitProfile
        );
        return normalizePartitionShares(
          'exact',
          totalSqFt,
          {
            exactTargetSqFt: targetSqFt,
            exactFirstName: divExactFirstName,
            exactRemainderName: divExactRemainderName,
          },
          lang
        );
      }
      const ratioShares = divRatioRows.map((r) => ({
        id: r.id,
        name: r.name,
        value: parseShareExpression(r.expr),
        shareLabel: r.expr.trim(),
      }));
      return normalizePartitionShares('ratio', totalSqFt, { ratioShares }, lang);
    },
    [
      divDivideMode,
      divEqualNames,
      divEqualParts,
      divExactAmount,
      divExactFirstName,
      divExactRemainderName,
      divExactUnit,
      divRatioRows,
      doc.unitProfile,
      lang,
    ]
  );

  const handleSolvePartition = useCallback((): boolean => {
    if (!divSourcePoly || divSourcePoly.points.length < 3) {
      setDivErrorMsg(
        lang === 'bn'
          ? 'আগে একটি বৈধ বহুভুজ দাগ নির্বাচন করুন।'
          : 'Please select a valid polygon plot first.'
      );
      return false;
    }
    const totalSqFt = polygonAreaSqFt(divSourcePoly.points);
    const shares = buildDivNormalizedShares(totalSqFt);
    if (shares.length < 2) {
      setDivErrorMsg(
        lang === 'bn'
          ? 'সঠিক ভাগ সংখ্যা, অনুপাত বা নির্দিষ্ট ক্ষেত্রফল দিন।'
          : 'Please enter valid share counts, ratios, or exact area.'
      );
      return false;
    }

    const solved = solvePolygonPartition({
      polygon: divSourcePoly.points,
      mode: divDivideMode,
      shares,
      directionMode: divDirectionMode,
      edgeIndex: divChosenEdgeIndex,
      flipDirection: divFlipDirection,
      pivotPoint:
        divDirectionMode === 'radial-point'
          ? divRadialPivot || polygonCentroid(divSourcePoly.points)
          : undefined,
      radialStartAngleDeg:
        divRadialStartAngleDeg !== null ? divRadialStartAngleDeg : undefined,
    });

    if (!solved) {
      setDivErrorMsg(
        lang === 'bn'
          ? 'দাগটি বিভাজন করা যায়নি — অন্য দিক বা আকৃতি পরীক্ষা করুন।'
          : 'Could not divide polygon — try another direction or plot.'
      );
      return false;
    }

    setDivErrorMsg('');
    setDivResult(solved);
    setDivSavedToPlots(false);
    fitViewToDocument({ ...doc, entities: [divSourcePoly] });
    return true;
  }, [
    buildDivNormalizedShares,
    divChosenEdgeIndex,
    divDirectionMode,
    divDivideMode,
    divFlipDirection,
    divRadialPivot,
    divRadialStartAngleDeg,
    divSourcePoly,
    doc,
    fitViewToDocument,
    lang,
  ]);

  const handleDragPartitionSplitLine = useCallback(
    (splitIndex: number, worldPt: Point2D) => {
      if (!divSourcePoly || !divResult) return;
      const totalSqFt = polygonAreaSqFt(divSourcePoly.points);
      const shares = buildDivNormalizedShares(totalSqFt);
      if (shares.length < 2) return;
      const updated = updatePartitionByDragPoint(
        divSourcePoly.points,
        divResult,
        splitIndex,
        worldPt,
        shares
      );
      setDivResult(updated);
      setDivSavedToPlots(false);
    },
    [buildDivNormalizedShares, divResult, divSourcePoly]
  );

  const handleNudgePartitionLine = useCallback(
    (splitIndex: number, delta: number) => {
      if (!divSourcePoly || !divResult) return;
      if (splitIndex < 0 || splitIndex >= divResult.cutPositions.length) return;
      const totalSqFt = polygonAreaSqFt(divSourcePoly.points);
      const shares = buildDivNormalizedShares(totalSqFt);
      if (shares.length < 2) return;

      const positions = [...divResult.cutPositions];
      if (divResult.directionMode === 'radial-point' && divResult.pivotPoint) {
        const minB = (splitIndex > 0 ? positions[splitIndex - 1] : 0) + 1.5;
        const maxB =
          (splitIndex + 1 < positions.length ? positions[splitIndex + 1] : 360) - 1.5;
        if (minB >= maxB) return;
        positions[splitIndex] = Math.max(minB, Math.min(maxB, positions[splitIndex] + delta));
        setDivResult(
          recomputePartitionFromRadialAngles(
            divSourcePoly.points,
            divResult.mode,
            divResult.pivotPoint,
            divResult.radialStartAngleDeg,
            positions,
            shares
          )
        );
      } else {
        const span = Math.max(0.5, divResult.maxLinearProj - divResult.minLinearProj);
        const pad = Math.min(0.5, span * 0.02);
        const minB =
          (splitIndex > 0 ? positions[splitIndex - 1] : divResult.minLinearProj) + pad;
        const maxB =
          (splitIndex + 1 < positions.length
            ? positions[splitIndex + 1]
            : divResult.maxLinearProj) - pad;
        if (minB >= maxB) return;
        positions[splitIndex] = Math.max(minB, Math.min(maxB, positions[splitIndex] + delta));
        setDivResult(
          recomputePartitionFromLinearOffsets(
            divSourcePoly.points,
            divResult.mode,
            divResult.directionMode === 'perpendicular-edge'
              ? 'perpendicular-edge'
              : 'parallel-edge',
            divResult.cutAngleDeg,
            positions,
            shares
          )
        );
      }
      setDivSavedToPlots(false);
    },
    [buildDivNormalizedShares, divResult, divSourcePoly]
  );

  const handleSavePartitionToPlotsAndReport = useCallback(() => {
    if (!divSourcePoly || !divResult || divResult.parts.length < 2) return;
    const plotsLayer = layers.find((l) => l.id === 'plots') || activeLayer;
    const boundaryLayer = layers.find((l) => l.id === 'boundary') || activeLayer;
    const newEntities: CadEntity[] = [];

    const partRecords: PartitionPartRecord[] = divResult.parts.map((part) => {
      const ring = part.primaryRing.length >= 3 ? part.primaryRing : divSourcePoly.points;
      const polyEnt: PolygonEntity = {
        ...createPolygonEntity(ring, {
          id: makeEntityId('poly'),
          layer: plotsLayer,
          color: part.color,
          plotNumber: part.name,
          ownerName: part.name,
          measuredFromRaster: divSourcePoly.measuredFromRaster,
        }),
        fillColor: part.color,
      };
      newEntities.push(polyEnt);
      const b = computeAreaBreakdown(part.actualAreaSqFt, doc.unitProfile);
      return {
        name: part.name,
        shareLabel: part.shareLabel,
        sqFt: b.sqFt,
        shotok: b.shotok,
        katha: b.katha,
        bigha: b.bigha,
        acre: b.acre,
        perimeterFt: part.perimeterFt,
        sideLengthsFt: part.sideLengthsFt,
      };
    });

    if (divAddPillars) {
      const seen = new Set<string>();
      let pillarSeq = 1;
      for (const part of divResult.parts) {
        for (const p of part.primaryRing) {
          const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          if (!seen.has(key)) {
            seen.add(key);
            newEntities.push(
              createPointEntity(p, {
                id: makeEntityId('pt'),
                layer: boundaryLayer,
                color: '#B45309',
                marker: 'pillar',
                label: `K${formatNumber(pillarSeq++, 0, lang)}`,
              })
            );
          }
        }
      }
    }

    if (divKeepOriginalPlot) {
      dispatch({
        type: 'ADD_ENTITIES',
        label: 'Save Plot Division Parts',
        entities: newEntities,
      });
    } else {
      dispatch({
        type: 'REPLACE_ENTITIES',
        label: 'Replace Plot with Division Parts',
        removeIds: [divSourcePoly.id],
        addEntities: newEntities,
      });
    }

    const srcName =
      divSourcePoly.plotNumber ||
      (lang === 'bn' ? 'নির্বাচিত দাগ' : 'Selected Plot');
    const modeLabel =
      divResult.mode === 'equal'
        ? lang === 'bn'
          ? 'সমান ভাগ'
          : 'Equal Parts'
        : divResult.mode === 'exact'
        ? lang === 'bn'
          ? 'নির্দিষ্ট মাপ'
          : 'Exact Area'
        : lang === 'bn'
        ? 'অনুপাত / অংশ'
        : 'Ratio / Shares';
    const directionLabel =
      divResult.directionMode === 'radial-point'
        ? lang === 'bn'
          ? 'বিন্দু থেকে রেডিয়াল'
          : 'Radial from Point'
        : divResult.directionMode === 'perpendicular-edge'
        ? lang === 'bn'
          ? 'বাহুর লম্ব'
          : 'Perpendicular to Edge'
        : lang === 'bn'
        ? 'বাহুর সমান্তরাল'
        : 'Parallel to Edge';
    const recordId = `part-${divSourcePoly.id}`;
    const nextRecord: PartitionRecord = {
      id: recordId,
      createdAt: Date.now(),
      sourcePlotName: srcName,
      totalAreaSqFt: divResult.totalAreaSqFt,
      modeLabel,
      directionLabel,
      parts: partRecords,
    };
    const existingRecords = (doc.partitionResults || []).filter((r) => r.id !== recordId);
    dispatch({
      type: 'UPDATE_DOCUMENT_META',
      label: 'Save Division Table to Report',
      patch: {
        partitionResults: [...existingRecords, nextRecord],
      },
    });

    setSelectedIds(newEntities.filter((e) => e.kind === 'polygon').map((e) => e.id));
    setDivSavedToPlots(true);
    showToast(
      lang === 'bn'
        ? 'অংশীদারদের নামে দাগ ও রিপোর্ট টেবিল সংরক্ষিত হয়েছে'
        : 'Parts saved as plots and added to report'
    );
  }, [
    activeLayer,
    dispatch,
    divAddPillars,
    divKeepOriginalPlot,
    divResult,
    divSourcePoly,
    doc.partitionResults,
    lang,
    layers,
    showToast,
  ]);

  const partitionOverlay: PartitionCanvasOverlay | null = useMemo(() => {
    if (activeWizard !== 'partition' || !divSourcePoly || divSourcePoly.points.length < 3) {
      return null;
    }
    const pts = divSourcePoly.points;
    const safeEdgeIdx = ((divChosenEdgeIndex % pts.length) + pts.length) % pts.length;
    const chosenEdge =
      divDirectionMode !== 'radial-point'
        ? {
            a: pts[safeEdgeIdx],
            b: pts[(safeEdgeIdx + 1) % pts.length],
            label:
              lang === 'bn'
                ? `বাহু ${formatNumber(safeEdgeIdx + 1, 0, 'bn')}`
                : `Edge ${safeEdgeIdx + 1}`,
          }
        : null;
    const pivotPt =
      divDirectionMode === 'radial-point'
        ? divRadialPivot || polygonCentroid(pts)
        : null;

    if (wizardStep === 3) {
      return {
        parts: [],
        splitLines: [],
        chosenEdge,
        pivotPoint: pivotPt,
        interactive: false,
      };
    }

    if (wizardStep >= 4 && divResult) {
      return {
        parts: divResult.parts.map((part) => {
          const b = computeAreaBreakdown(part.actualAreaSqFt, doc.unitProfile);
          return {
            rings: part.rings,
            color: part.color,
            label: part.name,
            subLabel:
              lang === 'bn'
                ? `${formatNumber(b.shotok, 2, 'bn')} শতক · ${formatNumber(
                    part.actualAreaSqFt,
                    0,
                    'bn'
                  )} ব.ফু.`
                : `${b.shotok.toFixed(2)} sh · ${part.actualAreaSqFt.toFixed(0)} sq ft`,
            centroid: part.centroid,
          };
        }),
        splitLines: divResult.splitLines.map((line, idx) => ({
          index: line.index,
          segments: line.segments,
          handlePoint: line.handlePoint,
          label: `L${idx + 1}`,
        })),
        chosenEdge,
        pivotPoint: divResult.pivotPoint,
        interactive: wizardStep === 4 || wizardStep === 5,
      };
    }

    return null;
  }, [
    activeWizard,
    divChosenEdgeIndex,
    divDirectionMode,
    divRadialPivot,
    divResult,
    divSourcePoly,
    doc.unitProfile,
    lang,
    wizardStep,
  ]);

  const plotDivisionSession: PlotDivisionSessionProps = {
    sourcePolyId: divSourcePoly?.id || null,
    onSourcePolyIdChange: (id) => {
      setDivSourcePolyId(id);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    onStartDrawPolygon: () => {
      setDraftPoints([]);
      setActiveTool('draw-polygon');
      setWizardMinimized(true);
      showToast(
        lang === 'bn'
          ? 'মানচিত্রে কোণাগুলো ট্যাপ করে দাগ আঁকুন এবং শেষ করুন'
          : 'Tap polygon corners on the map and tap Finish'
      );
    },
    onAddSamplePolygon: (kind) => {
      const samplePts: Point2D[] =
        kind === 'rect'
          ? [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 50 },
              { x: 0, y: 50 },
            ]
          : kind === 'tri'
          ? [
              { x: 0, y: 0 },
              { x: 120, y: 0 },
              { x: 40, y: 80 },
            ]
          : [
              { x: 0, y: 0 },
              { x: 120, y: 0 },
              { x: 120, y: 45 },
              { x: 65, y: 45 },
              { x: 65, y: 95 },
              { x: 0, y: 95 },
            ];
      const plotNo =
        kind === 'rect'
          ? lang === 'bn'
            ? 'নমুনা ১০০×৫০'
            : 'Sample 100×50'
          : lang === 'bn'
          ? 'নমুনা বহুভুজ'
          : 'Sample Irregular';
      const created = commitPolygon(samplePts, false, { plotNumber: plotNo });
      if (created) {
        setDivSourcePolyId(created.id);
        setDivResult(null);
        setDivSavedToPlots(false);
        fitViewToDocument({ ...doc, entities: [...doc.entities, created] });
      }
    },
    divideMode: divDivideMode,
    onDivideModeChange: (m) => {
      setDivDivideMode(m);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    equalParts: divEqualParts,
    onEqualPartsChange: (val) => {
      setDivEqualParts(val);
      const count = Math.max(2, Math.min(20, Math.round(parseLocalizedNumber(val) || 2)));
      setDivEqualNames((prev) => {
        const next = [...prev];
        while (next.length < count) {
          next.push(
            lang === 'bn'
              ? `অংশীদার ${formatNumber(next.length + 1, 0, 'bn')}`
              : `Share ${next.length + 1}`
          );
        }
        return next;
      });
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    equalNames: divEqualNames,
    onEqualNamesChange: (names) => {
      setDivEqualNames(names);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    ratioRows: divRatioRows,
    onRatioRowsChange: (rows) => {
      setDivRatioRows(rows);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    exactAmount: divExactAmount,
    onExactAmountChange: (val) => {
      setDivExactAmount(val);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    exactUnit: divExactUnit,
    onExactUnitChange: (u) => {
      setDivExactUnit(u);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    exactFirstName: divExactFirstName,
    onExactFirstNameChange: (val) => {
      setDivExactFirstName(val);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    exactRemainderName: divExactRemainderName,
    onExactRemainderNameChange: (val) => {
      setDivExactRemainderName(val);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    directionMode: divDirectionMode,
    onDirectionModeChange: (m) => {
      setDivDirectionMode(m);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    chosenEdgeIndex: divChosenEdgeIndex,
    onChosenEdgeIndexChange: (idx) => {
      setDivChosenEdgeIndex(idx);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    flipDirection: divFlipDirection,
    onFlipDirectionChange: (v) => {
      setDivFlipDirection(v);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    radialPivot: divRadialPivot,
    onRadialPivotChange: (pt) => {
      setDivRadialPivot(pt);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    radialStartAngleDeg: divRadialStartAngleDeg,
    onRadialStartAngleDegChange: (deg) => {
      setDivRadialStartAngleDeg(deg);
      setDivResult(null);
      setDivSavedToPlots(false);
    },
    onStartPickEdgeOnMap: () => {
      setDivPickTarget('edge');
      setActiveTool('pick-point');
      setWizardMinimized(true);
      showToast(
        lang === 'bn' ? 'মানচিত্রে যেকোনো বাহুর উপর ট্যাপ করুন' : 'Tap near an edge on the map'
      );
    },
    onStartPickPivotOnMap: () => {
      setDivPickTarget('pivot');
      setActiveTool('pick-point');
      setWizardMinimized(true);
      showToast(
        lang === 'bn'
          ? 'মানচিত্রে কেন্দ্রবিন্দু (Pivot) ট্যাপ করুন'
          : 'Tap radial pivot point on the map'
      );
    },
    result: divResult,
    errorMsg: divErrorMsg,
    onSolvePartition: handleSolvePartition,
    onNudgeCutLine: handleNudgePartitionLine,
    onResetExactBisection: () => {
      handleSolvePartition();
    },
    onDragModeOnCanvas: () => {
      setActiveTool('select');
      setWizardMinimized(true);
      showToast(
        lang === 'bn'
          ? 'লাল গোল হ্যান্ডেল বা বিভাজন রেখা ধরে টেনে সরান'
          : 'Drag red split handles or dashed lines directly'
      );
    },
    keepOriginalPlot: divKeepOriginalPlot,
    onKeepOriginalPlotChange: setDivKeepOriginalPlot,
    addPillars: divAddPillars,
    onAddPillarsChange: setDivAddPillars,
    savedToPlots: divSavedToPlots,
    onSavePartsToPlotsAndReport: handleSavePartitionToPlotsAndReport,
    onExportPdf: handleExportPdf,
    onExportCsv: handleExportCsv,
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F6F6F2] dark:bg-slate-950 text-[#141A17] dark:text-slate-100">
      {view === 'home' ? (
        <div className="h-full overflow-y-auto">
          <HomeScreen
            lang={lang}
            onToggleLang={handleToggleLang}
            onStartWizard={handleStartWizard}
            onOpenBlankCanvas={handleOpenBlankCanvas}
            onOpenProject={handleOpenProject}
            onDeleteProject={(id, name) => setConfirmDeleteProj({ id, name })}
            onImportProjectFile={handleImportProjectOrDxf}
            onOpenSavedWork={() => setShowSavedWorkSheet(true)}
            onOpenPlotList={() => setShowPlotSummarySheet(true)}
            onOpenReports={() => setShowReportsSheet(true)}
            onOpenCalculator={() => setShowCalculator(true)}
            onOpenSettings={() => setShowSettingsDialog(true)}
            projects={projects}
            organizationName={appSettings.organizationName}
          />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col">
          {/* Workspace Top Bar: Back to Home + "ম্যাপ খুলুন" label overlay file input + Undo/Redo/Fit */}
          <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#D4DBD6] dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-2.5 sm:px-4 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveWizard(null);
                  setWizardMinimized(false);
                  setView('home');
                }}
                className="flex min-h-[40px] items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-[#141A17] dark:text-slate-100 hover:bg-[#EAECE7] dark:hover:bg-slate-800 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t.actions.backHome}</span>
              </button>

              <button
                type="button"
                onClick={() => setRenameModalOpen(true)}
                className="truncate max-w-[110px] sm:max-w-[220px] rounded-lg px-2 py-1 text-left text-sm font-bold hover:bg-[#EAECE7] dark:hover:bg-slate-800"
              >
                {doc.name}
              </button>

              {/* Android WebView Safe Label Overlay File Input: "ম্যাপ খুলুন" & Camera */}
              <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#0F5132]/30 dark:border-emerald-500/40 bg-[#0F5132]/8 dark:bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-[#0F5132] dark:text-emerald-300 hover:bg-[#0F5132]/15 whitespace-nowrap shrink-0">
                <ImagePlus className="h-3.5 w-3.5" />
                <span>{t.workspace.openMap}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAttachRasterFile(f, !activeWizard);
                    e.currentTarget.value = '';
                  }}
                />
              </label>

              <label
                aria-label={lang === 'bn' ? 'ক্যামেরা দিয়ে ম্যাপ তুলুন' : 'Capture map photo'}
                className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-[#141A17] dark:text-slate-200 hover:bg-[#EAECE7] dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <Camera className="h-3.5 w-3.5 text-[#B45309] dark:text-amber-400" />
                <span className="hidden sm:inline">
                  {lang === 'bn' ? 'ক্যামেরা' : 'Camera'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAttachRasterFile(f, !activeWizard);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                aria-label={t.actions.undo}
                disabled={history.past.length === 0}
                onClick={() => setHistory((h) => undoHistory(h))}
                className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#EAECE7] dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t.actions.redo}
                disabled={history.future.length === 0}
                onClick={() => setHistory((h) => redoHistory(h))}
                className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#EAECE7] dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <Redo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t.actions.fitView}
                onClick={() => fitViewToDocument(doc)}
                className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#EAECE7] dark:hover:bg-slate-800"
              >
                <Maximize className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t.homeMenu.settings}
                onClick={() => setShowSettingsDialog(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#EAECE7] dark:hover:bg-slate-800"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Main Interactive Canvas 2D Area */}
          <div className="relative flex-1 overflow-hidden">
            <CadCanvas
              doc={doc}
              viewport={viewport}
              onViewportChange={setViewport}
              activeTool={activeTool}
              selectedIds={selectedIds}
              onSelectIds={setSelectedIds}
              snapConfig={snapConfig}
              lang={lang}
              isDark={isDark}
              draftPoints={draftPoints}
              onDraftPointsChange={setDraftPoints}
              onCommitLine={handleCommitLine}
              onCommitRect={handleCommitRect}
              onCommitCircle={handleCommitCircle}
              onCommitArc={handleCommitArc}
              onCommitPolygon={(pts, isMeasure) => commitPolygon(pts, isMeasure)}
              onCommitPolyline={handleCommitPolyline}
              onCommitPoint={handleCommitPoint}
              onCommitTextRequest={(p) => setPendingTextPoint(p)}
              onCommitDimension={handleCommitDimension}
              onMoveEntity={(id, next) =>
                dispatch({ type: 'UPDATE_ENTITY', label: 'Move Entity', id, next })
              }
              onMoveEntities={(ids, dx, dy) =>
                dispatch({ type: 'MOVE_ENTITIES', label: 'Move Entities', ids, dx, dy })
              }
              onPickPoint={(p) => {
                if (activeWizard === 'partition' && wizardStep === 3 && divPickTarget) {
                  if (divPickTarget === 'edge' && divSourcePoly && divSourcePoly.points.length >= 2) {
                    const pts = divSourcePoly.points;
                    let bestIdx = 0;
                    let bestDist = Infinity;
                    for (let i = 0; i < pts.length; i++) {
                      const a = pts[i];
                      const b = pts[(i + 1) % pts.length];
                      const vx = b.x - a.x;
                      const vy = b.y - a.y;
                      const len2 = vx * vx + vy * vy;
                      const u =
                        len2 > 1e-12
                          ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2))
                          : 0;
                      const d = Math.hypot(p.x - (a.x + u * vx), p.y - (a.y + u * vy));
                      if (d < bestDist) {
                        bestDist = d;
                        bestIdx = i;
                      }
                    }
                    setDivChosenEdgeIndex(bestIdx);
                    setDivResult(null);
                    setDivSavedToPlots(false);
                    setDivPickTarget(null);
                    setActiveTool('select');
                    setWizardMinimized(false);
                    showToast(
                      lang === 'bn'
                        ? `বাহু ${formatNumber(bestIdx + 1, 0, 'bn')} নির্বাচিত হয়েছে`
                        : `Edge ${bestIdx + 1} selected`
                    );
                  } else if (divPickTarget === 'pivot') {
                    setDivRadialPivot(p);
                    setDivResult(null);
                    setDivSavedToPlots(false);
                    setDivPickTarget(null);
                    setActiveTool('select');
                    setWizardMinimized(false);
                    showToast(
                      lang === 'bn' ? 'রেডিয়াল কেন্দ্রবিন্দু নির্বাচিত হয়েছে' : 'Pivot point set'
                    );
                  }
                  return;
                }
                if (activeWizard === 'demarcation' && wizardStep === 3) {
                  handleDemarcationPickLandmark(p);
                  return;
                }
                if (activeWizard === 'joint' && wizardStep === 3) {
                  handleJointPickLandmark(p);
                  return;
                }
                setPickedPoints((prev) => {
                  const twoPointMode =
                    scaleSheetTab !== null ||
                    activeWizard === 'measure' ||
                    (activeWizard === 'pantograph' && wizardStep === 1) ||
                    (activeWizard === 'demarcation' && wizardStep === 1) ||
                    (activeWizard === 'joint' && wizardStep === 1);
                  if (twoPointMode && prev.length >= 2) {
                    return [p];
                  }
                  return [...prev, p];
                });
              }}
              onMeasureAngle={(armA, vertex, armB) => {
                setAnglePreview({ armA, vertex, armB });
                const res = measureThreePointAngle(armA, vertex, armB);
                showToast(
                  lang === 'bn'
                    ? `কোণ: ${formatNumber(res.includedDeg, 2, lang)}°`
                    : `Angle: ${res.includedDeg.toFixed(2)}°`
                );
              }}
              onPickCoord={(p) => {
                setPickedCoords((prev) => {
                  const prevPt = prev[prev.length - 1];
                  if (prevPt) {
                    const d = coordinateDelta(prevPt, p);
                    showToast(
                      `X:${formatNumber(p.x, 1, lang)}, Y:${formatNumber(p.y, 1, lang)} · ${formatNumber(d.distanceFt, 1, lang)}ft ∠${formatNumber(d.azimuthDeg, 1, lang)}°`
                    );
                  } else {
                    showToast(
                      `X:${formatNumber(p.x, 2, lang)} ft, Y:${formatNumber(p.y, 2, lang)} ft`
                    );
                  }
                  return [...prev.slice(-9), p];
                });
              }}
              measurementPreview={wizardMeasuredShape}
              anglePreview={anglePreview}
              overlapRings={demarcationOverlapRings}
              alignmentVectors={demarcationAlignmentVectors}
              pantographWindow={
                activeWizard === 'pantograph' && pantoAreaMode === 'window'
                  ? pantoWindowBBox
                  : null
              }
              onCommitPantographWindow={(bbox) => {
                setPantoWindowBBox(bbox);
                setPantoAreaMode('window');
                setActiveTool('select');
                setWizardMinimized(false);
                showToast(
                  lang === 'bn'
                    ? 'উইন্ডো নির্বাচিত হয়েছে'
                    : 'Crop window selected'
                );
              }}
              partitionOverlay={partitionOverlay}
              onDragPartitionSplitLine={handleDragPartitionSplitLine}
              pickedPins={pickedPins}
              selectedRasterId={selectedRasterId}
              onMoveRaster={(rid, dx, dy) => {
                const layer = doc.rasterLayers.find((r) => r.id === rid);
                if (!layer || layer.locked) return;
                dispatch({
                  type: 'UPDATE_RASTER_LAYER',
                  label: 'Move Raster',
                  id: rid,
                  next: {
                    ...layer,
                    transform: {
                      ...layer.transform,
                      tx: layer.transform.tx + dx,
                      ty: layer.transform.ty + dy,
                    },
                  },
                });
              }}
            />

            {/* Top CAD Snap, Ortho, Selection Mode & Active Layer Bar */}
            {!scaleSheetTab &&
              (!activeWizard || wizardMinimized || appSettings.advancedMode) && (
                <SnapBar
                  lang={lang}
                  snapConfig={snapConfig}
                  onChangeSnap={setSnapConfig}
                  activeTool={activeTool}
                  onSetTool={(tool) => {
                    setDraftPoints([]);
                    setActiveTool(tool);
                  }}
                  activeLayerName={activeLayer.name}
                  activeLayerColor={activeLayer.color}
                  onOpenLayers={() => setShowLayersSheet(true)}
                />
              )}

            {/* Floating Selection & Properties Pill (when entities selected) */}
            {selectedEntities.length > 0 && !scaleSheetTab && (
              <div className="pointer-events-auto absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setShowPropertiesSheet(true)}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#0F5132] dark:bg-emerald-600 px-3 text-xs font-bold text-white"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>
                    {lang === 'bn'
                      ? `নির্বাচিত: ${formatNumber(selectedEntities.length, 0, lang)}টি · প্রপার্টিজ`
                      : `${selectedEntities.length} Selected · Properties`}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t.actions.delete}
                  onClick={() => {
                    dispatch({
                      type: 'DELETE_ENTITIES',
                      label: 'Delete Selected',
                      ids: selectedIds,
                    });
                    setSelectedIds([]);
                  }}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Floating Finish/Undo/Cancel Bar during multi-point drawing & measuring */}
            {draftPoints.length > 0 &&
              (activeTool === 'draw-polygon' ||
                activeTool === 'draw-polyline' ||
                activeTool === 'draw-arc' ||
                activeTool === 'measure-area' ||
                activeTool === 'measure-path' ||
                activeTool === 'measure-angle') && (
                <div className="absolute left-1/2 top-[58px] z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-[#D4DBD6] dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 shadow-lg backdrop-blur-md">
                  <span className="text-xs font-semibold text-[#4A5550] dark:text-slate-300 tabular-nums pr-1">
                    {activeTool === 'draw-arc'
                      ? lang === 'bn'
                        ? `আর্ক ${formatNumber(draftPoints.length, 0, lang)}/৩`
                        : `Arc ${draftPoints.length}/3`
                      : activeTool === 'measure-angle'
                      ? lang === 'bn'
                        ? `কোণ ${formatNumber(draftPoints.length, 0, lang)}/৩`
                        : `Angle ${draftPoints.length}/3`
                      : `${formatNumber(draftPoints.length, 0, lang)} ${
                          lang === 'bn' ? 'বিন্দু' : 'pts'
                        }`}
                  </span>
                  <button
                    type="button"
                    aria-label={t.actions.undo}
                    onClick={() => setDraftPoints((prev) => prev.slice(0, -1))}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-2.5 text-xs font-medium"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'ফিরুন' : 'Undo'}</span>
                  </button>
                  {activeTool !== 'draw-arc' && activeTool !== 'measure-angle' && (
                    <button
                      type="button"
                      disabled={
                        activeTool === 'draw-polyline' || activeTool === 'measure-path'
                          ? draftPoints.length < 2
                          : draftPoints.length < 3
                      }
                      onClick={() => {
                        if (activeTool === 'measure-path') {
                          if (activeWizard === 'measure' && wizardStep === 4) {
                            setWizardMeasuredShape({
                              mode: 'distance',
                              points: draftPoints,
                            });
                            setDraftPoints([]);
                            setActiveTool('select');
                            setWizardStep(5);
                            setWizardMinimized(false);
                          } else if (activeWizard === 'joint' && wizardStep === 6) {
                            handleCommitPolyline(draftPoints);
                            setDraftPoints([]);
                            setActiveTool('select');
                            setWizardMinimized(false);
                            showToast(
                              lang === 'bn'
                                ? 'সীমানা পার হয়ে দূরত্ব মাপা সংরক্ষিত হয়েছে'
                                : 'Cross-sheet distance saved'
                            );
                          } else {
                            handleCommitPolyline(draftPoints);
                            setDraftPoints([]);
                          }
                          return;
                        }
                        if (activeTool === 'measure-area') {
                          if (activeWizard === 'measure' && wizardStep === 4) {
                            setWizardMeasuredShape({
                              mode: 'area',
                              points: draftPoints,
                            });
                            setDraftPoints([]);
                            setActiveTool('select');
                            setWizardStep(5);
                            setWizardMinimized(false);
                          } else if (activeWizard === 'demarcation' && wizardStep === 6) {
                            handleFinishDemTraceDag(
                              demTraceTarget,
                              demTraceTarget === 'base' ? demBaseDagNo : demOverlayDagNo,
                              draftPoints
                            );
                          } else if (activeWizard === 'joint' && wizardStep === 6) {
                            commitPolygon(draftPoints, false);
                            setDraftPoints([]);
                            setActiveTool('select');
                            setWizardMinimized(false);
                            showToast(
                              lang === 'bn'
                                ? 'দু-সিট জুড়ে দাগ সংরক্ষিত হয়েছে'
                                : 'Cross-sheet plot saved'
                            );
                          } else {
                            commitPolygon(draftPoints, true);
                            setDraftPoints([]);
                          }
                          return;
                        }
                        if (activeTool === 'draw-polyline') {
                          handleCommitPolyline(draftPoints);
                        } else {
                          commitPolygon(draftPoints, false);
                        }
                        setDraftPoints([]);
                      }}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-[#0F5132] px-3 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{t.actions.finish}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDraftPoints([])}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-2 text-xs font-medium text-red-600"
                    aria-label={t.actions.cancel}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

            {/* Minimized Demarcation Step 3 Floating Landmark Tap Guidance */}
            {activeWizard === 'demarcation' &&
              wizardStep === 3 &&
              wizardMinimized &&
              !scaleSheetTab && (
                <div className="pointer-events-auto absolute left-1/2 top-[58px] z-30 flex max-w-[95vw] -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#D4DBD6] dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs">
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold ${
                      demPairPhase === 'base'
                        ? 'bg-blue-100 text-[#1E3A8A] dark:bg-blue-950/60 dark:text-blue-200'
                        : 'bg-amber-100 text-[#B45309] dark:bg-amber-950/60 dark:text-amber-200'
                    }`}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[190px] sm:max-w-none">
                      {demPairPhase === 'base'
                        ? lang === 'bn'
                          ? `জোড়া ${formatNumber((doc.overlayAlignment?.pairs.length || 0) + 1, 0, lang)} (১/২): ${demBaseMapLabel}-এ ট্যাপ করুন`
                          : `Pair #${(doc.overlayAlignment?.pairs.length || 0) + 1} (1/2): Tap ${demBaseMapLabel}`
                        : lang === 'bn'
                        ? `জোড়া ${formatNumber((doc.overlayAlignment?.pairs.length || 0) + 1, 0, lang)} (২/২): ${demOverlayMapLabel}-এ একই বিন্দু`
                        : `Pair #${(doc.overlayAlignment?.pairs.length || 0) + 1} (2/2): Tap SAME on ${demOverlayMapLabel}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleDemUndoLastPairTap}
                    disabled={
                      (doc.overlayAlignment?.pairs.length || 0) === 0 &&
                      demPairPhase === 'base'
                    }
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-2 font-semibold disabled:opacity-40"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardMinimized(false)}
                    className="min-h-[32px] rounded-xl bg-[#0F5132] px-2.5 font-bold text-white whitespace-nowrap"
                  >
                    {(doc.overlayAlignment?.pairs.length || 0) >= 2
                      ? lang === 'bn'
                        ? 'ফলাফল দেখুন'
                        : 'View Overlay'
                      : t.workspace.openWizard}
                  </button>
                </div>
              )}

            {/* Minimized Map Joint Step 3 Floating Edge Landmark Guidance */}
            {activeWizard === 'joint' &&
              wizardStep === 3 &&
              wizardMinimized &&
              !scaleSheetTab && (
                <div className="pointer-events-auto absolute left-1/2 top-[58px] z-30 flex max-w-[95vw] -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#D4DBD6] dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs">
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold ${
                      jointPairPhase === 'a'
                        ? 'bg-amber-100 text-[#B45309] dark:bg-amber-950/60 dark:text-amber-200'
                        : 'bg-emerald-100 text-[#0F5132] dark:bg-emerald-950/60 dark:text-emerald-200'
                    }`}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[190px] sm:max-w-none">
                      {jointPairPhase === 'a'
                        ? lang === 'bn'
                          ? `জোড়া ${formatNumber((doc.overlayAlignment?.pairs.length || 0) + 1, 0, lang)} (১/২): সিট A-তে ট্যাপ`
                          : `Pair #${(doc.overlayAlignment?.pairs.length || 0) + 1} (1/2): Tap Sheet A`
                        : lang === 'bn'
                        ? `জোড়া ${formatNumber((doc.overlayAlignment?.pairs.length || 0) + 1, 0, lang)} (২/২): সিট B-এ ট্যাপ`
                        : `Pair #${(doc.overlayAlignment?.pairs.length || 0) + 1} (2/2): Tap Sheet B`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleJointUndoLastPairTap}
                    disabled={
                      (doc.overlayAlignment?.pairs.length || 0) === 0 &&
                      jointPairPhase === 'a'
                    }
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-2 font-semibold disabled:opacity-40"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardMinimized(false)}
                    className="min-h-[32px] rounded-xl bg-[#B45309] px-2.5 font-bold text-white whitespace-nowrap"
                  >
                    {(doc.overlayAlignment?.pairs.length || 0) >= 2
                      ? lang === 'bn'
                        ? 'ফলাফল দেখুন'
                        : 'Review Joint'
                      : t.workspace.openWizard}
                  </button>
                </div>
              )}

            {/* Minimized Map Joint Step 5 Direct Drag Guidance */}
            {activeWizard === 'joint' &&
              wizardStep === 5 &&
              wizardMinimized &&
              !scaleSheetTab && (
                <div className="pointer-events-auto absolute left-1/2 top-[58px] z-30 flex max-w-[95vw] -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#B45309]/40 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs">
                  <span className="font-semibold text-[#B45309] dark:text-amber-300 truncate max-w-[210px] sm:max-w-none">
                    {lang === 'bn'
                      ? 'সিট B টেনে সঠিক স্থানে বসান'
                      : 'Drag Sheet B to align seam'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWizardMinimized(false)}
                    className="min-h-[30px] rounded-xl bg-[#0F5132] px-2.5 font-bold text-white whitespace-nowrap"
                  >
                    {lang === 'bn' ? 'সমন্বয় সম্পন্ন' : 'Done'}
                  </button>
                </div>
              )}

            {/* Minimized Pantograph Step 3 Floating Crop Window Guidance */}
            {activeWizard === 'pantograph' &&
              activeTool === 'pantograph-window' &&
              wizardMinimized &&
              !scaleSheetTab && (
                <div className="pointer-events-auto absolute left-1/2 top-[58px] z-30 flex max-w-[95vw] -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#115E59]/40 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#115E59] dark:text-teal-300">
                    <Crop className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate max-w-[200px] sm:max-w-none">
                      {draftPoints.length === 1
                        ? lang === 'bn'
                          ? '২য় কোণা ট্যাপ করে উইন্ডো শেষ করুন'
                          : 'Tap opposite corner 2 to finish window'
                        : lang === 'bn'
                        ? 'উইন্ডোর ২ কোণা ট্যাপ বা ড্র্যাগ করুন'
                        : 'Tap 2 opposite corners or drag box'}
                    </span>
                  </span>
                  {draftPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDraftPoints([])}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-2 font-semibold"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDraftPoints([]);
                      setActiveTool('select');
                      setWizardMinimized(false);
                    }}
                    className="min-h-[30px] rounded-xl bg-[#115E59] px-2.5 font-bold text-white whitespace-nowrap"
                  >
                    {t.workspace.openWizard}
                  </button>
                </div>
              )}

            {/* Minimized Plot Division Step 3 Floating Edge/Pivot Pick Banner */}
            {activeWizard === 'partition' &&
              wizardStep === 3 &&
              wizardMinimized &&
              divPickTarget &&
              !scaleSheetTab && (
                <div className="pointer-events-auto absolute left-1/2 top-[58px] z-30 flex max-w-[95vw] -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#1E3A8A]/40 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#1E3A8A] dark:text-blue-300">
                    <Crosshair className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {divPickTarget === 'edge'
                        ? lang === 'bn'
                          ? 'প্লটের যেকোনো বাহুতে ট্যাপ করুন'
                          : 'Tap any edge of the plot'
                        : lang === 'bn'
                        ? 'রেডিয়াল বিভাজনের কেন্দ্রবিন্দু ট্যাপ করুন'
                        : 'Tap radial pivot point on map'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDivPickTarget(null);
                      setActiveTool('select');
                      setWizardMinimized(false);
                    }}
                    className="min-h-[30px] rounded-xl bg-[#1E3A8A] px-2.5 font-bold text-white whitespace-nowrap"
                  >
                    {t.workspace.openWizard}
                  </button>
                </div>
              )}

            {/* Minimized Plot Division Step 4/5 Floating Live Drag Area Readout Bar */}
            {activeWizard === 'partition' &&
              (wizardStep === 4 || wizardStep === 5) &&
              wizardMinimized &&
              divResult &&
              !scaleSheetTab && (
                <div className="pointer-events-auto absolute left-1/2 top-[58px] z-30 flex max-w-[96vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#DC2626]/40 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs">
                  <div className="flex flex-wrap items-center gap-2 tabular-nums">
                    {divResult.parts.map((part) => {
                      const b = computeAreaBreakdown(part.actualAreaSqFt, doc.unitProfile);
                      return (
                        <span
                          key={part.id}
                          className="inline-flex items-center gap-1 font-bold"
                          style={{ color: part.color }}
                        >
                          <span>{part.name}:</span>
                          <span>
                            {formatNumber(b.shotok, 2, lang)}{lang === 'bn' ? 'শ' : 'sh'}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleSolvePartition();
                    }}
                    className="min-h-[30px] rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-2.5 font-semibold whitespace-nowrap"
                  >
                    {lang === 'bn' ? 'রিসেট' : 'Reset'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardMinimized(false)}
                    className="min-h-[30px] rounded-xl bg-[#0F5132] px-2.5 font-bold text-white whitespace-nowrap"
                  >
                    {lang === 'bn' ? 'সম্পন্ন' : 'Done'}
                  </button>
                </div>
              )}

            {/* Quick Angle / Coordinate Readout Pill in Advanced Workspace */}
            {(activeTool === 'measure-coord' ||
              activeTool === 'measure-angle' ||
              anglePreview !== null) &&
              !showCoordAngleSheet &&
              (!activeWizard || wizardMinimized) && (
                <div className="pointer-events-auto absolute right-3 top-[58px] z-20 flex items-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-2.5 py-1.5 text-xs shadow-md backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      setCoordAngleTab(
                        activeTool === 'measure-angle' || anglePreview ? 'angle' : 'coord'
                      );
                      setShowCoordAngleSheet(true);
                    }}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#141A17] dark:text-slate-100"
                  >
                    {activeTool === 'measure-angle' || anglePreview ? (
                      <>
                        <Compass className="h-3.5 w-3.5 text-[#7C3AED]" />
                        <span>
                          {anglePreview
                            ? `${formatNumber(
                                measureThreePointAngle(
                                  anglePreview.armA,
                                  anglePreview.vertex,
                                  anglePreview.armB
                                ).includedDeg,
                                2,
                                lang
                              )}°`
                            : lang === 'bn'
                            ? '৩ বিন্দু ট্যাপ (কোণ)'
                            : 'Tap 3 pts (Angle)'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Crosshair className="h-3.5 w-3.5 text-[#0F5132] dark:text-emerald-400" />
                        <span>
                          {pickedCoords.length > 0
                            ? `X:${formatNumber(
                                pickedCoords[pickedCoords.length - 1].x,
                                1,
                                lang
                              )} Y:${formatNumber(
                                pickedCoords[pickedCoords.length - 1].y,
                                1,
                                lang
                              )}`
                            : lang === 'bn'
                            ? 'স্থানাঙ্ক (X, Y)'
                            : 'Coord (X, Y)'}
                        </span>
                      </>
                    )}
                  </button>
                  {anglePreview && (
                    <button
                      type="button"
                      onClick={() => setAnglePreview(null)}
                      className="rounded p-0.5 text-slate-400 hover:text-red-500"
                      aria-label="Clear angle"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

            {/* Guided Step-by-Step Wizard Bottom Sheet */}
            {activeWizard && !wizardMinimized && !scaleSheetTab && (
              <WizardSheet
                wizard={activeWizard}
                doc={doc}
                lang={lang}
                draftPoints={draftPoints}
                selectedIds={selectedIds}
                pickedPoints={pickedPoints}
                onClearPickedPoints={() => setPickedPoints([])}
                onSetTool={(tool) => {
                  setDraftPoints([]);
                  setActiveTool(tool);
                }}
                onUndoDraftPoint={() => setDraftPoints((prev) => prev.slice(0, -1))}
                onFinishDraftPolygon={() => {
                  if (draftPoints.length >= 3) {
                    commitPolygon(draftPoints, false);
                    setDraftPoints([]);
                    setActiveTool('select');
                  }
                }}
                onCancelDraft={() => {
                  setDraftPoints([]);
                }}
                onCreatePolygon={(pts, meta) => {
                  commitPolygon(pts, false, meta);
                  fitViewToDocument({
                    ...doc,
                    entities: [
                      ...doc.entities,
                      {
                        id: 'fit',
                        kind: 'polygon',
                        layer: 'PLOTS',
                        color: '#0F5132',
                        points: pts,
                      },
                    ],
                  });
                }}
                onAttachRasterFile={handleAttachRasterFile}
                onUpdateRaster={(layer) =>
                  dispatch({
                    type: 'UPDATE_RASTER_LAYER',
                    label: 'Update Raster',
                    id: layer.id,
                    next: layer,
                  })
                }
                scannerPixelsPerInch={appSettings.scannerPixelsPerInch}
                onSaveScannerPpi={(ppi) => {
                  const nextSettings = { ...appSettings, scannerPixelsPerInch: ppi };
                  setAppSettings(nextSettings);
                  void saveAppSettings(nextSettings);
                }}
                measuredShape={wizardMeasuredShape}
                onFinishWizardMeasure={(mode, pts) => {
                  setWizardMeasuredShape({ mode, points: pts });
                  setDraftPoints([]);
                  setActiveTool('select');
                }}
                onSaveMeasurementAsPlot={(mode, pts, meta) => {
                  if (mode === 'distance') {
                    const ent = createPolylineEntity(pts, false, { layer: activeLayer });
                    dispatch({
                      type: 'ADD_ENTITIES',
                      label: 'Save Distance Measurement',
                      entities: [ent],
                      markRasterMeasurement: doc.rasterLayers.length > 0,
                    });
                    setSelectedIds([ent.id]);
                    setWizardMeasuredShape({
                      mode,
                      points: pts,
                      savedPlotId: ent.id,
                    });
                    showToast(
                      lang === 'bn' ? 'দূরত্ব সংরক্ষিত হয়েছে' : 'Distance saved to project'
                    );
                  } else {
                    const saved = commitPolygon(pts, false, meta);
                    if (saved) {
                      setWizardMeasuredShape({
                        mode,
                        points: pts,
                        savedPlotId: saved.id,
                      });
                      showToast(
                        lang === 'bn' ? 'দাগ হিসেবে সংরক্ষিত হয়েছে' : 'Saved as plot'
                      );
                    }
                  }
                }}
                onClearMeasurementPreview={() => setWizardMeasuredShape(null)}
                wizardStep={wizardStep}
                onWizardStepChange={setWizardStep}
                onPantographScale={handlePantographScale}
                onDemarcatePlot={handleDemarcatePlot}
                onSelectEntity={(id) => setSelectedIds([id])}
                onExportPdf={handleExportPdf}
                onExportCsv={handleExportCsv}
                onJumpToWorkspace={() => setWizardMinimized(true)}
                demarcationSession={demarcationSession}
                pantographSession={pantographSession}
                mapJointSession={mapJointSession}
                plotDivisionSession={plotDivisionSession}
                orgInfo={orgInfo}
                onOpenScaleSheet={(tab) => {
                  setWizardMinimized(true);
                  setPickedPoints([]);
                  setActiveTool('pick-point');
                  setScaleSheetTab(tab);
                }}
                onClose={() => {
                  setActiveWizard(null);
                  setWizardStep(1);
                  setWizardMinimized(false);
                  setWizardMeasuredShape(null);
                  setActiveTool('select');
                }}
              />
            )}

            {/* Dedicated Raster Scale Calibration, Scale Check & Map-Scale Bottom Sheet */}
            <RasterScaleSheet
              open={scaleSheetTab !== null}
              tab={scaleSheetTab || 'calibrate'}
              onTabChange={(nextTab) => setScaleSheetTab(nextTab)}
              lang={lang}
              rasterLayers={doc.rasterLayers}
              selectedRasterId={selectedRasterId}
              onSelectRasterId={setSelectedRasterId}
              pickedPoints={pickedPoints}
              onClearPickedPoints={() => setPickedPoints([])}
              onAttachRasterFile={(f) => handleAttachRasterFile(f, false)}
              onUpdateRaster={(layer) =>
                dispatch({
                  type: 'UPDATE_RASTER_LAYER',
                  label: 'Calibrate Raster',
                  id: layer.id,
                  next: layer,
                })
              }
              scannerPixelsPerInch={appSettings.scannerPixelsPerInch}
              onSaveScannerPpi={(ppi) => {
                const nextSettings = { ...appSettings, scannerPixelsPerInch: ppi };
                setAppSettings(nextSettings);
                void saveAppSettings(nextSettings);
              }}
              onStartPicking={() => setActiveTool('pick-point')}
              onFinishCalibrationDraw={() => setActiveTool('draw-polygon')}
              onToast={showToast}
              onClose={() => {
                setScaleSheetTab(null);
                setPickedPoints([]);
                setActiveTool('select');
              }}
            />

            {/* Advanced Mode "+" Button & Full 8-Category Menu (only rendered when Settings -> Advanced Mode is ON) */}
            <AdvancedToolbar
              enabled={appSettings.advancedMode}
              open={advancedMenuOpen}
              onToggleOpen={() => {
                setAdvancedMenuOpen((o) => !o);
                if (!advancedMenuOpen && activeWizard) setWizardMinimized(true);
              }}
              lang={lang}
              doc={doc}
              activeTool={activeTool}
              onSetTool={(tool) => {
                setDraftPoints([]);
                setActiveTool(tool);
              }}
              selectedEntities={selectedEntities}
              snapConfig={snapConfig}
              onChangeSnap={setSnapConfig}
              onNewProject={() => {
                startNewDocument('নতুন সার্ভে প্রজেক্ট', 'New Survey Project');
                showToast(lang === 'bn' ? 'নতুন প্রজেক্ট তৈরি হয়েছে' : 'New project created');
              }}
              onOpenProjectsDrawer={() => setShowSavedWorkSheet(true)}
              onExportJson={handleExportJson}
              onExportDxf={handleExportDxf}
              onExportPdf={handleExportPdf}
              onExportCsv={handleExportCsv}
              onImportProjectOrDxf={handleImportProjectOrDxf}
              onOpenUnitProfile={() => setShowSettingsDialog(true)}
              onOpenLicense={() => setShowLicenseDialog(true)}
              onOpenTriangulation={() => setShowTriangulationDialog(true)}
              onOpenTraverse={() => setShowTraverseDialog(true)}
              onOpenPlotSummary={() => setShowPlotSummarySheet(true)}
              onOpenLayers={() => {
                setAdvancedMenuOpen(false);
                setShowLayersSheet(true);
              }}
              onOpenProperties={() => {
                setAdvancedMenuOpen(false);
                setShowPropertiesSheet(true);
              }}
              onOpenCoordAngle={(tab) => {
                setAdvancedMenuOpen(false);
                setCoordAngleTab(tab);
                setShowCoordAngleSheet(true);
              }}
              onEditPlotMeta={(poly) => setEditingPlotMeta(poly)}
              onDuplicateSelected={() => {
                const clones = selectedEntities.map((e) => ({
                  ...translateEntity(e, 15, 15),
                  id: makeEntityId(e.kind),
                }));
                if (clones.length > 0) {
                  dispatch({
                    type: 'ADD_ENTITIES',
                    label: 'Duplicate',
                    entities: clones,
                  });
                  setSelectedIds(clones.map((c) => c.id));
                }
              }}
              onRotateSelected={(deg) => {
                const rad = (deg * Math.PI) / 180;
                selectedEntities.forEach((e) => {
                  const origin =
                    e.kind === 'polygon' || e.kind === 'rectangle'
                      ? polygonCentroid(e.points)
                      : e.kind === 'line' || e.kind === 'dimension'
                      ? e.start
                      : e.kind === 'circle' || e.kind === 'arc'
                      ? e.center
                      : e.kind === 'point' || e.kind === 'text'
                      ? e.position
                      : e.points[0] || { x: 0, y: 0 };
                  dispatch({
                    type: 'UPDATE_ENTITY',
                    label: 'Rotate',
                    id: e.id,
                    next: rotateEntity(e, origin, rad),
                  });
                });
              }}
              onScaleSelected={(factor) => {
                selectedEntities.forEach((e) => {
                  const origin =
                    e.kind === 'polygon' || e.kind === 'rectangle'
                      ? polygonCentroid(e.points)
                      : e.kind === 'circle' || e.kind === 'arc'
                      ? e.center
                      : { x: 0, y: 0 };
                  dispatch({
                    type: 'UPDATE_ENTITY',
                    label: 'Scale',
                    id: e.id,
                    next: scaleEntity(e, origin, factor),
                  });
                });
              }}
              onOffsetSelected={(offsetFt) => {
                const poly = selectedEntities.find(
                  (e): e is PolygonEntity => e.kind === 'polygon'
                );
                if (!poly) return;
                const offPts = offsetPolygon(poly.points, offsetFt);
                commitPolygon(offPts, false, {
                  plotNumber: `${poly.plotNumber || '১'}_off`,
                });
              }}
              onDeleteSelected={() => {
                if (selectedIds.length === 0) return;
                dispatch({
                  type: 'DELETE_ENTITIES',
                  label: 'Delete Selected',
                  ids: selectedIds,
                });
                setSelectedIds([]);
              }}
              onStartDemarcationWizard={() => {
                setAdvancedMenuOpen(false);
                setActiveWizard('partition');
                setWizardStep(1);
                setWizardMinimized(false);
              }}
              onQuickEqualSplit={(parts) => {
                const poly = selectedEntities.find(
                  (e): e is PolygonEntity => e.kind === 'polygon'
                );
                if (!poly) return;
                const pieces = partitionPolygonEqualParts(poly.points, parts, 90);
                if (pieces.length >= 2) {
                  handleDemarcatePlot(poly.id, pieces, true);
                }
              }}
              onPlaceBoundaryPillars={() => {
                const poly = selectedEntities.find(
                  (e): e is PolygonEntity => e.kind === 'polygon'
                );
                if (!poly) return;
                const boundaryLayer = layers.find((l) => l.id === 'boundary') || activeLayer;
                const pts: CadEntity[] = poly.points.map((p, idx) =>
                  createPointEntity(p, {
                    id: makeEntityId('pt'),
                    layer: boundaryLayer,
                    color: '#B45309',
                    marker: 'pillar',
                    label: `K${formatNumber(idx + 1, 0, lang)}`,
                  })
                );
                dispatch({
                  type: 'ADD_ENTITIES',
                  label: 'Place Pillars',
                  entities: pts,
                });
              }}
              onAttachRasterFile={(f) => {
                void handleAttachRasterFile(f, true);
              }}
              onOpenRasterScale={(tab) => {
                setAdvancedMenuOpen(false);
                setPickedPoints([]);
                setActiveTool('pick-point');
                setScaleSheetTab(tab);
              }}
              onStartJointWizard={() => {
                setAdvancedMenuOpen(false);
                setActiveWizard('joint');
                setWizardStep(1);
                setWizardMinimized(false);
              }}
              selectedRasterId={selectedRasterId}
              onSelectRasterId={setSelectedRasterId}
              onUpdateRaster={(layer) =>
                dispatch({
                  type: 'UPDATE_RASTER_LAYER',
                  label: 'Update Raster',
                  id: layer.id,
                  next: layer,
                })
              }
              onDeleteRaster={(id) => {
                dispatch({
                  type: 'DELETE_RASTER_LAYER',
                  label: 'Delete Raster',
                  id,
                });
                if (selectedRasterId === id) setSelectedRasterId(null);
              }}
              onStartWizard={(w) => {
                setAdvancedMenuOpen(false);
                if (activeWizard !== w) {
                  setWizardStep(1);
                }
                setActiveWizard(w);
                setWizardMinimized(false);
              }}
              onOpenCalculator={() => {
                setAdvancedMenuOpen(false);
                setShowCalculator(true);
              }}
            />
          </div>

          {/* Workspace Bottom Info Panel */}
          <footer className="z-20 flex min-h-[44px] shrink-0 items-center justify-between gap-2 border-t border-[#D4DBD6] dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 text-xs backdrop-blur-md pb-safe">
            <div className="flex items-center gap-3 tabular-nums truncate">
              <button
                type="button"
                onClick={() => setShowPlotSummarySheet(true)}
                className="font-semibold text-[#0F5132] dark:text-emerald-400 hover:underline whitespace-nowrap"
              >
                {t.workspace.plotsCount}: {formatNumber(polygons.length, 0, lang)}
              </button>
              <span className="text-[#4A5550] dark:text-slate-400 truncate">
                {t.workspace.totalArea}:{' '}
                <strong className="text-[#141A17] dark:text-slate-100">
                  {formatNumber(totalBreakdown.shotok, 2, lang)}
                </strong>{' '}
                {lang === 'bn' ? 'শতক' : 'sh'} ·{' '}
                <strong className="text-[#141A17] dark:text-slate-100">
                  {formatNumber(totalBreakdown.katha, 2, lang)}
                </strong>{' '}
                {lang === 'bn' ? 'কাঠা' : 'ka'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 pr-16 sm:pr-0">
              {doc.rasterLayers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPickedPoints([]);
                    setActiveTool('pick-point');
                    setScaleSheetTab('calibrate');
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#0F5132]/40 dark:border-emerald-500/40 bg-[#0F5132]/8 dark:bg-emerald-500/15 px-2.5 text-[11px] font-semibold text-[#0F5132] dark:text-emerald-300 whitespace-nowrap"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  <span>{lang === 'bn' ? 'ম্যাপ স্কেল' : 'Map Scale'}</span>
                </button>
              )}
              {activeWizard && wizardMinimized && (
                <button
                  type="button"
                  onClick={() => {
                    setScaleSheetTab(null);
                    setWizardMinimized(false);
                  }}
                  className="min-h-[34px] rounded-lg bg-[#0F5132] dark:bg-emerald-600 px-2.5 text-[11px] font-semibold text-white whitespace-nowrap"
                >
                  {t.workspace.openWizard}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowReportsSheet(true)}
                className="min-h-[34px] rounded-lg border border-[#D4DBD6] dark:border-slate-700 px-2.5 text-[11px] font-semibold whitespace-nowrap"
              >
                {t.homeMenu.reports}
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* Offline Status Indicator */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-16 left-3 z-50 flex items-center gap-1.5 rounded-lg bg-amber-600/95 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>{t.actions.offlineBadge}</span>
        </div>
      )}

      {/* Reusable Toast */}
      <Toast message={toast} />

      {/* Settings Bottom Sheet / Modal */}
      {showSettingsDialog && (
        <SettingsDialog
          open={showSettingsDialog}
          settings={appSettings}
          linearUnit={doc.linearUnit}
          isLicensed={licenseStatus.active}
          projectCount={projects.length}
          isBackingUp={isBackingUp}
          onExportAllBackup={handleExportAllBackup}
          onImportAllBackup={handleImportAllBackup}
          onSave={async (nextSettings, nextLinear) => {
            setAppSettings(nextSettings);
            await saveAppSettings(nextSettings);
            if (!nextSettings.advancedMode) {
              setAdvancedMenuOpen(false);
            }
            if (view === 'workspace') {
              dispatch({
                type: 'UPDATE_DOCUMENT_META',
                label: 'Update Settings',
                patch: {
                  unitProfile: nextSettings.unitProfile,
                  linearUnit: nextLinear,
                },
              });
            }
            setShowSettingsDialog(false);
            showToast(
              nextSettings.language === 'bn' ? 'সেটিংস সংরক্ষিত হয়েছে' : 'Settings saved'
            );
          }}
          onOpenLicense={() => {
            setShowSettingsDialog(false);
            setShowLicenseDialog(true);
          }}
          onClose={() => setShowSettingsDialog(false)}
        />
      )}

      {/* Saved Work Bottom Sheet */}
      <BottomSheet
        open={showSavedWorkSheet}
        title={t.homeMenu.savedWork}
        onClose={() => setShowSavedWorkSheet(false)}
      >
        {projects.length === 0 ? (
          <p className="text-sm text-[#4A5550] dark:text-slate-400">
            {t.actions.noRecentProjects}
          </p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E9E4] dark:border-slate-700 px-3.5 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowSavedWorkSheet(false);
                    void handleOpenProject(p.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-[#0F5132] dark:text-emerald-400" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-[#4A5550] dark:text-slate-400 tabular-nums">
                      {formatNumber(p.entityCount, 0, lang)}{' '}
                      {lang === 'bn' ? 'টি অংশ' : 'items'}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteProj({ id: p.id, name: p.name })}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  {t.actions.delete}
                </button>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* Plot List Bottom Sheet */}
      <BottomSheet
        open={showPlotSummarySheet}
        title={t.homeMenu.plotList}
        onClose={() => setShowPlotSummarySheet(false)}
      >
        {polygons.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[#4A5550] dark:text-slate-400">
              {t.workspace.noPlotsYet}
            </p>
            {view === 'home' && (
              <button
                type="button"
                onClick={() => {
                  setShowPlotSummarySheet(false);
                  handleStartWizard('measure');
                }}
                className="w-full min-h-[44px] rounded-xl bg-[#0F5132] text-sm font-semibold text-white"
              >
                {t.wizards.measure.title}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {polygons.map((p, idx) => {
              const b = computeAreaBreakdown(polygonAreaSqFt(p.points), doc.unitProfile);
              const perim = polygonPerimeterFt(p.points, true);
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-3 text-xs tabular-nums"
                >
                  <div className="font-bold text-[#0F5132] dark:text-emerald-400">
                    {lang === 'bn' ? `দাগ ${p.plotNumber || idx + 1}` : `Plot ${p.plotNumber || idx + 1}`}
                  </div>
                  <div className="mt-1">
                    {formatNumber(b.shotok, 3, lang)} {lang === 'bn' ? 'শতক' : 'shotok'} ·{' '}
                    {formatNumber(b.katha, 3, lang)} {lang === 'bn' ? 'কাঠা' : 'katha'} ·{' '}
                    {formatNumber(b.sqFt, 1, lang)} {lang === 'bn' ? 'ব.ফু.' : 'sq ft'} ·{' '}
                    {lang === 'bn' ? 'পরিসীমা' : 'Perim'}: {formatNumber(perim, 1, lang)}{' '}
                    {lang === 'bn' ? 'ফুট' : 'ft'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </BottomSheet>

      {/* Reports Bottom Sheet */}
      <BottomSheet
        open={showReportsSheet}
        title={t.homeMenu.reports}
        onClose={() => setShowReportsSheet(false)}
      >
        <div className="space-y-3">
          <p className="text-xs text-[#4A5550] dark:text-slate-400">
            {lang === 'bn'
              ? `বর্তমান প্রজেক্ট: ${doc.name} (${formatNumber(polygons.length, 0, lang)}টি দাগ)`
              : `Active project: ${doc.name} (${polygons.length} plots)`}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleExportPdf}
              className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#0F5132] dark:bg-emerald-600 text-xs font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              <span>{t.actions.exportPdf}</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 text-xs font-semibold"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />
              <span>{t.actions.exportCsv}</span>
            </button>
            <button
              type="button"
              onClick={handleExportDxf}
              className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 text-xs font-semibold"
            >
              <FileDown className="h-4 w-4" />
              <span>{t.actions.exportDxf}</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 text-xs font-semibold"
            >
              <FileDown className="h-4 w-4" />
              <span>{t.actions.exportJson}</span>
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Other Dialogs */}
      {showLicenseDialog && (
        <LicenseDialog
          lang={lang}
          status={licenseStatus}
          onActivate={(code) => {
            const next = validateLicenseCode(code);
            if (!next.active) return false;
            setLicenseStatus(next);
            const nextSettings = { ...appSettings, licenseCode: next.code };
            setAppSettings(nextSettings);
            void saveAppSettings(nextSettings);
            setShowLicenseDialog(false);
            showToast(lang === 'bn' ? 'লাইসেন্স সক্রিয় হয়েছে' : 'License activated');
            return true;
          }}
          onDeactivate={() => {
            setLicenseStatus({ active: false, tier: 'community', code: null });
            const nextSettings = { ...appSettings, licenseCode: null };
            setAppSettings(nextSettings);
            void saveAppSettings(nextSettings);
          }}
          onClose={() => setShowLicenseDialog(false)}
        />
      )}

      {showTriangulationDialog && (
        <TriangulationDialog
          lang={lang}
          defaultUnit={doc.linearUnit}
          onCreatePlot={(pts, plotName) => {
            commitPolygon(pts, false, plotName ? { plotNumber: plotName } : undefined);
            fitViewToDocument({
              ...doc,
              entities: [
                ...doc.entities,
                {
                  id: 'tmp',
                  kind: 'polygon',
                  layer: 'PLOTS',
                  color: '#0F5132',
                  points: pts,
                },
              ],
            });
            setShowTriangulationDialog(false);
          }}
          onClose={() => setShowTriangulationDialog(false)}
        />
      )}

      {showTraverseDialog && (
        <TraverseDialog
          lang={lang}
          onCommitTraverse={(pts, closed) => {
            if (closed && pts.length >= 3) {
              commitPolygon(pts, false);
            } else {
              handleCommitPolyline(pts);
            }
            setShowTraverseDialog(false);
          }}
          onClose={() => setShowTraverseDialog(false)}
        />
      )}

      {/* Layers Manager Bottom Sheet */}
      <LayersSheet
        open={showLayersSheet}
        lang={lang}
        layers={layers}
        activeLayerId={activeLayer.id}
        onSelectActiveLayer={(layerId) =>
          dispatch({ type: 'SET_ACTIVE_LAYER', label: 'Set Active Layer', layerId })
        }
        onCreateLayer={(layer) =>
          dispatch({ type: 'CREATE_LAYER', label: 'Create Layer', layer, setActive: true })
        }
        onUpdateLayer={(id, patch) =>
          dispatch({ type: 'UPDATE_LAYER', label: 'Update Layer', id, patch })
        }
        onDeleteLayer={(id) =>
          dispatch({ type: 'DELETE_LAYER', label: 'Delete Layer', id })
        }
        onClose={() => setShowLayersSheet(false)}
      />

      {/* Selected Entity Properties Bottom Sheet */}
      <PropertiesSheet
        open={showPropertiesSheet}
        lang={lang}
        entities={selectedEntities}
        layers={layers}
        unitProfile={doc.unitProfile}
        onEditProperties={(ids, patch) =>
          dispatch({ type: 'EDIT_ENTITY_PROPERTIES', label: 'Edit Properties', ids, patch })
        }
        onMoveEntities={(ids, dx, dy) =>
          dispatch({ type: 'MOVE_ENTITIES', label: 'Move Entities', ids, dx, dy })
        }
        onDeleteEntities={(ids) => {
          dispatch({ type: 'DELETE_ENTITIES', label: 'Delete Entities', ids });
          setSelectedIds([]);
        }}
        onClose={() => setShowPropertiesSheet(false)}
      />

      {/* Angle & Coordinate Tools Bottom Sheet (Advanced Mode) */}
      <CoordAngleSheet
        open={showCoordAngleSheet}
        initialTab={coordAngleTab}
        lang={lang}
        linearUnit={doc.linearUnit}
        pickedCoords={pickedCoords}
        anglePoints={anglePreview}
        onStartPickCoord={() => {
          setDraftPoints([]);
          setActiveTool('measure-coord');
        }}
        onStartMeasureAngle={() => {
          setDraftPoints([]);
          setActiveTool('measure-angle');
        }}
        onClearCoords={() => setPickedCoords([])}
        onClearAngle={() => setAnglePreview(null)}
        onPlotPoint={(p) => {
          handleCommitPoint(p);
          setPickedCoords((prev) => [...prev.slice(-9), p]);
          showToast(
            lang === 'bn' ? 'স্থানাঙ্কে বিন্দু বসানো হয়েছে' : 'Point plotted at coordinate'
          );
        }}
        onPlotLine={(a, b) => handleCommitLine(a, b)}
        onStampAngleLabel={(vertex, label) => {
          const textLayer = layers.find((l) => l.id === 'text') || activeLayer;
          const ent = createTextEntity(vertex, label, {
            layer: textLayer,
            color: '#7C3AED',
            heightFt: 4,
          });
          dispatch({
            type: 'ADD_ENTITIES',
            label: 'Stamp Angle Label',
            entities: [ent],
          });
          showToast(lang === 'bn' ? 'কোণ টেক্সট যুক্ত হয়েছে' : 'Angle label placed');
        }}
        onClose={() => setShowCoordAngleSheet(false)}
      />

      {pendingTextPoint && (
        <TextPromptDialog
          title={lang === 'bn' ? 'টেক্সট লিখুন' : 'Add Text Label'}
          label={lang === 'bn' ? 'ক্যানভাসে বসানোর লেখা' : 'Label Text'}
          confirmLabel={t.actions.apply}
          cancelLabel={t.actions.cancel}
          onConfirm={(text) => {
            const textLayer = layers.find((l) => l.id === 'text') || activeLayer;
            const ent = createTextEntity(pendingTextPoint, text, {
              layer: textLayer,
              color: textLayer.color || '#141A17',
              heightFt: 5,
            });
            dispatch({
              type: 'ADD_ENTITIES',
              label: 'Add Text',
              entities: [ent],
            });
            setSelectedIds([ent.id]);
            setPendingTextPoint(null);
          }}
          onCancel={() => setPendingTextPoint(null)}
        />
      )}

      {renameModalOpen && (
        <TextPromptDialog
          title={t.actions.rename}
          label={lang === 'bn' ? 'প্রজেক্টের নাম' : 'Project Name'}
          initialValue={doc.name}
          confirmLabel={t.actions.save}
          cancelLabel={t.actions.cancel}
          onConfirm={(name) => {
            dispatch({
              type: 'UPDATE_DOCUMENT_META',
              label: 'Rename Project',
              patch: { name },
            });
            setRenameModalOpen(false);
          }}
          onCancel={() => setRenameModalOpen(false)}
        />
      )}

      {editingPlotMeta && (
        <TextPromptDialog
          title={lang === 'bn' ? 'দাগ নম্বর পরিবর্তন' : 'Edit Plot / Dag Number'}
          label={lang === 'bn' ? 'দাগ নম্বর' : 'Plot Number'}
          initialValue={editingPlotMeta.plotNumber || ''}
          confirmLabel={t.actions.save}
          cancelLabel={t.actions.cancel}
          onConfirm={(plotNumber) => {
            dispatch({
              type: 'UPDATE_ENTITY',
              label: 'Edit Plot Info',
              id: editingPlotMeta.id,
              next: { ...editingPlotMeta, plotNumber },
            });
            setEditingPlotMeta(null);
          }}
          onCancel={() => setEditingPlotMeta(null)}
        />
      )}

      {confirmDeleteProj && (
        <ConfirmDialog
          title={lang === 'bn' ? 'প্রজেক্ট মুছবেন?' : 'Delete Project?'}
          message={
            lang === 'bn'
              ? `"${confirmDeleteProj.name}" স্থায়ীভাবে মুছে ফেলা হবে।`
              : `Permanently delete "${confirmDeleteProj.name}"?`
          }
          confirmLabel={t.actions.delete}
          cancelLabel={t.actions.cancel}
          danger
          onConfirm={async () => {
            await deleteProjectFromDb(confirmDeleteProj.id);
            setProjects(await listProjectsFromDb());
            setConfirmDeleteProj(null);
          }}
          onCancel={() => setConfirmDeleteProj(null)}
        />
      )}

      {showCalculator && (
        <CalculatorView
          open={showCalculator}
          lang={lang}
          unitProfile={appSettings.unitProfile}
          onClose={() => setShowCalculator(false)}
          onAddToPlotAndReport={({ record, polygonPoints, plotLabel }) => {
            let addedEnt: PolygonEntity | null = null;
            if (polygonPoints && polygonPoints.length >= 3) {
              addedEnt = commitPolygon(polygonPoints, false, {
                plotNumber: plotLabel,
              });
            }
            const nextRecords: CalculatorRecord[] = [
              ...(doc.calculatorRecords || []),
              record,
            ];
            dispatch({
              type: 'UPDATE_DOCUMENT_META',
              label: 'Add Calculator Result to Report',
              patch: { calculatorRecords: nextRecords },
            });
            const updatedDoc: CadDocument = {
              ...doc,
              entities: addedEnt ? [...doc.entities, addedEnt] : doc.entities,
              calculatorRecords: nextRecords,
              updatedAt: Date.now(),
            };
            void saveProjectToDb(updatedDoc).then(async () => {
              setProjects(await listProjectsFromDb());
            });
            showToast(
              addedEnt
                ? lang === 'bn'
                  ? 'দাগ ক্যানভাস ও রিপোর্টে যুক্ত হয়েছে'
                  : 'Added to plot list & report'
                : lang === 'bn'
                ? 'ক্যালকুলেটর হিসাব রিপোর্টে যুক্ত হয়েছে'
                : 'Calculator summary added to report'
            );
          }}
        />
      )}
    </div>
  );
}
