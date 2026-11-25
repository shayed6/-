import React, { useState } from 'react';
import {
  BoxSelect,
  Calculator,
  Camera,
  CheckCircle2,
  Circle,
  Compass,
  Copy,
  Crosshair,
  FileDown,
  FilePlus,
  FileSpreadsheet,
  FolderOpen,
  Grid,
  Hand,
  ImagePlus,
  Layers,
  Magnet,
  MapPin,
  Maximize2,
  Minus,
  MousePointer,
  Move,
  Pencil,
  Plus,
  RotateCw,
  Ruler,
  Scissors,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Spline,
  Square,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { CadDocument, CadEntity, PolygonEntity, RasterLayer } from '../core/cad/types';
import { SnapConfig } from '../core/cad/snapping';
import { ActiveTool } from './CadCanvas';
import { Lang, getTranslations } from './i18n';
import { WizardKind } from './HomeScreen';
import { RasterScaleTab } from './RasterScaleSheet';

export type AdvancedCategory =
  | 'file'
  | 'plot'
  | 'draw'
  | 'edit'
  | 'dimension'
  | 'measure'
  | 'demarcation'
  | 'attach';

interface AdvancedToolbarProps {
  enabled: boolean;
  open: boolean;
  onToggleOpen: () => void;
  lang: Lang;
  doc: CadDocument;
  activeTool: ActiveTool;
  onSetTool: (tool: ActiveTool) => void;
  selectedEntities: CadEntity[];
  snapConfig: SnapConfig;
  onChangeSnap: (next: SnapConfig) => void;
  onNewProject: () => void;
  onOpenProjectsDrawer: () => void;
  onExportJson: () => void;
  onExportDxf: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  onImportProjectOrDxf: (file: File) => void;
  onOpenUnitProfile: () => void;
  onOpenLicense: () => void;
  onOpenTriangulation: () => void;
  onOpenTraverse: () => void;
  onOpenPlotSummary: () => void;
  onOpenLayers: () => void;
  onOpenProperties: () => void;
  onOpenCoordAngle: (tab: 'coord' | 'angle') => void;
  onEditPlotMeta: (poly: PolygonEntity) => void;
  onDuplicateSelected: () => void;
  onRotateSelected: (deg: number) => void;
  onScaleSelected: (factor: number) => void;
  onOffsetSelected: (offsetFt: number) => void;
  onDeleteSelected: () => void;
  onStartDemarcationWizard: () => void;
  onQuickEqualSplit: (parts: number) => void;
  onPlaceBoundaryPillars: () => void;
  onAttachRasterFile: (file: File) => void;
  onOpenRasterScale: (tab: RasterScaleTab) => void;
  onStartJointWizard: () => void;
  selectedRasterId: string | null;
  onSelectRasterId: (id: string | null) => void;
  onUpdateRaster: (layer: RasterLayer) => void;
  onDeleteRaster: (id: string) => void;
  onStartWizard: (w: WizardKind) => void;
  onOpenCalculator?: () => void;
}

export const AdvancedToolbar: React.FC<AdvancedToolbarProps> = ({
  enabled,
  open,
  onToggleOpen,
  lang,
  doc,
  activeTool,
  onSetTool,
  selectedEntities,
  snapConfig,
  onChangeSnap,
  onNewProject,
  onOpenProjectsDrawer,
  onExportJson,
  onExportDxf,
  onExportPdf,
  onExportCsv,
  onImportProjectOrDxf,
  onOpenUnitProfile,
  onOpenLicense,
  onOpenTriangulation,
  onOpenTraverse,
  onOpenPlotSummary,
  onOpenLayers,
  onOpenProperties,
  onOpenCoordAngle,
  onEditPlotMeta,
  onDuplicateSelected,
  onRotateSelected,
  onScaleSelected,
  onOffsetSelected,
  onDeleteSelected,
  onStartDemarcationWizard,
  onQuickEqualSplit,
  onPlaceBoundaryPillars,
  onAttachRasterFile,
  onOpenRasterScale,
  onStartJointWizard,
  selectedRasterId,
  onSelectRasterId,
  onUpdateRaster,
  onDeleteRaster,
  onStartWizard,
  onOpenCalculator,
}) => {
  const t = getTranslations(lang);
  const [cat, setCat] = useState<AdvancedCategory>('draw');

  if (!enabled) return null;

  const categories: Array<{ id: AdvancedCategory; label: string }> = [
    { id: 'file', label: t.categories.file },
    { id: 'plot', label: t.categories.plot },
    { id: 'draw', label: t.categories.draw },
    { id: 'edit', label: t.categories.edit },
    { id: 'dimension', label: t.categories.dimension },
    { id: 'measure', label: t.categories.measure },
    { id: 'demarcation', label: t.categories.demarcation },
    { id: 'attach', label: t.categories.attach },
  ];

  const selectedPoly = selectedEntities.find(
    (e): e is PolygonEntity => e.kind === 'polygon'
  );
  const activeRaster =
    doc.rasterLayers.find((r) => r.id === selectedRasterId) ||
    doc.rasterLayers[0] ||
    null;

  const toolBtn = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    active = false,
    disabled = false
  ) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
        active
          ? 'border-[#0F5132] bg-[#0F5132] text-white'
          : 'border-[#D4DBD6] bg-white text-[#141A17] hover:bg-[#FAFBF8]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <>
      {/* Advanced Mode Sheet (only visible when toggled ON via floating "+") */}
      {open && (
        <div className="pointer-events-auto fixed bottom-20 left-3 right-3 z-30 mx-auto max-w-4xl rounded-2xl border border-[#D4DBD6] bg-white/95 backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#E5E9E4] px-3.5 py-2">
            <span className="text-xs font-bold text-[#0F5132]">
              {t.actions.advancedModeOn}
            </span>
            <button
              type="button"
              onClick={onToggleOpen}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4A5550] hover:bg-[#EAECE7]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 8 Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar border-b border-[#E5E9E4] px-3 py-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  cat === c.id
                    ? 'bg-[#0F5132] text-white'
                    : 'bg-[#F1F3EE] text-[#4A5550] hover:text-[#141A17]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Category Tool Actions */}
          <div className="flex flex-wrap gap-2 p-3 max-h-44 overflow-y-auto">
            {cat === 'file' && (
              <>
                {toolBtn(t.actions.newProject, <FilePlus className="h-4 w-4" />, onNewProject)}
                {toolBtn(
                  lang === 'bn' ? 'প্রজেক্ট তালিকা' : 'Projects',
                  <FolderOpen className="h-4 w-4" />,
                  onOpenProjectsDrawer
                )}
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#D4DBD6] bg-white px-3 py-2 text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF8] whitespace-nowrap shrink-0">
                  <Upload className="h-4 w-4 text-[#0F5132]" />
                  <span>{lang === 'bn' ? 'JSON / DXF আনুন' : 'Import JSON/DXF'}</span>
                  <input
                    type="file"
                    accept=".json,.dxf,application/json"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onImportProjectOrDxf(f);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                {toolBtn(t.actions.exportPdf, <FileDown className="h-4 w-4" />, onExportPdf)}
                {toolBtn(t.actions.exportCsv, <FileSpreadsheet className="h-4 w-4" />, onExportCsv)}
                {toolBtn(t.actions.exportDxf, <FileDown className="h-4 w-4" />, onExportDxf)}
                {toolBtn(t.actions.exportJson, <FileDown className="h-4 w-4" />, onExportJson)}
                {toolBtn(t.actions.unitSettings, <Settings2 className="h-4 w-4" />, onOpenUnitProfile)}
                {toolBtn(t.actions.license, <ShieldCheck className="h-4 w-4" />, onOpenLicense)}
              </>
            )}

            {cat === 'plot' && (
              <>
                {toolBtn(
                  lang === 'bn' ? 'দাগ আঁকুন (পলিগন)' : 'Draw Plot',
                  <Pencil className="h-4 w-4" />,
                  () => onSetTool('draw-polygon'),
                  activeTool === 'draw-polygon'
                )}
                {toolBtn(
                  lang === 'bn' ? 'ফিতা ও কর্ণ দিয়ে দাগ' : 'Tape Triangulation',
                  <Ruler className="h-4 w-4" />,
                  onOpenTriangulation
                )}
                {toolBtn(
                  lang === 'bn' ? 'দাগ তালিকা ও হিসাব' : 'Plot Summary',
                  <FileSpreadsheet className="h-4 w-4" />,
                  onOpenPlotSummary
                )}
                {toolBtn(
                  lang === 'bn' ? 'দাগ তথ্য সম্পাদনা' : 'Edit Plot Info',
                  <Type className="h-4 w-4" />,
                  () => selectedPoly && onEditPlotMeta(selectedPoly),
                  false,
                  !selectedPoly
                )}
              </>
            )}

            {cat === 'draw' && (
              <>
                {toolBtn(
                  lang === 'bn' ? 'বিন্দু / খুঁটি' : 'Point',
                  <MapPin className="h-4 w-4" />,
                  () => onSetTool('draw-point'),
                  activeTool === 'draw-point'
                )}
                {toolBtn(
                  lang === 'bn' ? 'লাইন' : 'Line',
                  <Minus className="h-4 w-4" />,
                  () => onSetTool('draw-line'),
                  activeTool === 'draw-line'
                )}
                {toolBtn(
                  lang === 'bn' ? 'পলিলাইন' : 'Polyline',
                  <Pencil className="h-4 w-4" />,
                  () => onSetTool('draw-polyline'),
                  activeTool === 'draw-polyline'
                )}
                {toolBtn(
                  lang === 'bn' ? 'আয়তক্ষেত্র' : 'Rectangle',
                  <Square className="h-4 w-4" />,
                  () => onSetTool('draw-rect'),
                  activeTool === 'draw-rect'
                )}
                {toolBtn(
                  lang === 'bn' ? 'বৃত্ত (কেন্দ্র+ব্যাসার্ধ)' : 'Circle',
                  <Circle className="h-4 w-4" />,
                  () => onSetTool('draw-circle'),
                  activeTool === 'draw-circle'
                )}
                {toolBtn(
                  lang === 'bn' ? 'আর্ক (৩ বিন্দু)' : 'Arc (3 pts)',
                  <Spline className="h-4 w-4" />,
                  () => onSetTool('draw-arc'),
                  activeTool === 'draw-arc'
                )}
                {toolBtn(
                  lang === 'bn' ? 'টেক্সট (বাংলা/EN)' : 'Text',
                  <Type className="h-4 w-4" />,
                  () => onSetTool('draw-text'),
                  activeTool === 'draw-text'
                )}
                {toolBtn(
                  lang === 'bn' ? 'লেয়ার' : 'Layers',
                  <Layers className="h-4 w-4" />,
                  onOpenLayers
                )}
              </>
            )}

            {cat === 'edit' && (
              <>
                {toolBtn(
                  lang === 'bn' ? 'ট্যাপ সিলেক্ট / সরান' : 'Tap Select / Move',
                  <MousePointer className="h-4 w-4" />,
                  () => onSetTool('select'),
                  activeTool === 'select'
                )}
                {toolBtn(
                  lang === 'bn' ? 'বক্স সিলেক্ট' : 'Box Select',
                  <BoxSelect className="h-4 w-4" />,
                  () => onSetTool('box-select'),
                  activeTool === 'box-select'
                )}
                {toolBtn(
                  lang === 'bn' ? 'প্রপার্টিজ' : 'Properties',
                  <SlidersHorizontal className="h-4 w-4" />,
                  onOpenProperties,
                  false,
                  selectedEntities.length === 0
                )}
                {toolBtn(
                  lang === 'bn' ? 'লেয়ার' : 'Layers',
                  <Layers className="h-4 w-4" />,
                  onOpenLayers
                )}
                {toolBtn(
                  lang === 'bn' ? 'হাত (প্যান)' : 'Pan',
                  <Hand className="h-4 w-4" />,
                  () => onSetTool('pan'),
                  activeTool === 'pan'
                )}
                {toolBtn(
                  lang === 'bn' ? 'কপি' : 'Copy',
                  <Copy className="h-4 w-4" />,
                  onDuplicateSelected,
                  false,
                  selectedEntities.length === 0
                )}
                {toolBtn(
                  lang === 'bn' ? 'ঘোরান +১৫°' : 'Rotate +15°',
                  <RotateCw className="h-4 w-4" />,
                  () => onRotateSelected(15),
                  false,
                  selectedEntities.length === 0
                )}
                {toolBtn(
                  lang === 'bn' ? 'স্কেল ২×' : 'Scale 2×',
                  <Maximize2 className="h-4 w-4" />,
                  () => onScaleSelected(2),
                  false,
                  selectedEntities.length === 0
                )}
                {toolBtn(
                  lang === 'bn' ? 'অফসেট +৫ ফু' : 'Offset +5ft',
                  <Move className="h-4 w-4" />,
                  () => onOffsetSelected(5),
                  false,
                  !selectedPoly
                )}
                {toolBtn(
                  t.actions.delete,
                  <Trash2 className="h-4 w-4 text-red-600" />,
                  onDeleteSelected,
                  false,
                  selectedEntities.length === 0
                )}
              </>
            )}

            {cat === 'dimension' && (
              <>
                {toolBtn(
                  lang === 'bn' ? 'রৈখিক / অ্যালাইনড মাপ' : 'Aligned Dim',
                  <Ruler className="h-4 w-4" />,
                  () => onSetTool('draw-dim'),
                  activeTool === 'draw-dim'
                )}
                {toolBtn(
                  lang === 'bn' ? 'দূরত্ব ও বেয়ারিং' : 'Dist & Bearing',
                  <Compass className="h-4 w-4" />,
                  () => onSetTool('measure-dist'),
                  activeTool === 'measure-dist'
                )}
              </>
            )}

            {cat === 'measure' && (
              <>
                {toolBtn(
                  lang === 'bn' ? 'দূরত্ব মাপুন' : 'Measure Dist',
                  <Ruler className="h-4 w-4" />,
                  () => onSetTool('measure-dist'),
                  activeTool === 'measure-dist'
                )}
                {toolBtn(
                  lang === 'bn' ? 'ক্ষেত্রফল মাপুন' : 'Measure Area',
                  <Square className="h-4 w-4" />,
                  () => onSetTool('measure-area'),
                  activeTool === 'measure-area'
                )}
                {toolBtn(
                  lang === 'bn' ? 'কোণ মাপুন (৩ বিন্দু)' : 'Measure Angle',
                  <Compass className="h-4 w-4" />,
                  () => onSetTool('measure-angle'),
                  activeTool === 'measure-angle'
                )}
                {toolBtn(
                  lang === 'bn' ? 'স্থানাঙ্ক (X, Y)' : 'Coordinates',
                  <Crosshair className="h-4 w-4" />,
                  () => onSetTool('measure-coord'),
                  activeTool === 'measure-coord'
                )}
                {toolBtn(
                  lang === 'bn' ? 'কোণ ও স্থানাঙ্ক প্যানেল' : 'Angle / Coord Tool',
                  <MapPin className="h-4 w-4" />,
                  () => onOpenCoordAngle('coord')
                )}
                {toolBtn(
                  lang === 'bn' ? 'ট্র্যাভার্স ক্যালকুলেটর' : 'Traverse Solver',
                  <Compass className="h-4 w-4" />,
                  onOpenTraverse
                )}
                {onOpenCalculator &&
                  toolBtn(
                    lang === 'bn' ? 'জমি ও হিস্যা ক্যালকুলেটর' : 'Land Calculator',
                    <Calculator className="h-4 w-4" />,
                    onOpenCalculator
                  )}
                {toolBtn(
                  lang === 'bn'
                    ? `স্ন্যাপ: ${snapConfig.enabled ? 'চালু' : 'বন্ধ'}`
                    : `Snap: ${snapConfig.enabled ? 'On' : 'Off'}`,
                  <Magnet className="h-4 w-4" />,
                  () => onChangeSnap({ ...snapConfig, enabled: !snapConfig.enabled }),
                  snapConfig.enabled
                )}
                {toolBtn(
                  lang === 'bn'
                    ? `অর্থো: ${snapConfig.ortho ? 'চালু' : 'বন্ধ'}`
                    : `Ortho: ${snapConfig.ortho ? 'On' : 'Off'}`,
                  <Crosshair className="h-4 w-4" />,
                  () => onChangeSnap({ ...snapConfig, ortho: !snapConfig.ortho }),
                  snapConfig.ortho
                )}
                {toolBtn(
                  lang === 'bn'
                    ? `গ্রিড স্ন্যাপ: ${snapConfig.grid ? 'চালু' : 'বন্ধ'}`
                    : `Grid Snap: ${snapConfig.grid ? 'On' : 'Off'}`,
                  <Grid className="h-4 w-4" />,
                  () => onChangeSnap({ ...snapConfig, grid: !snapConfig.grid }),
                  snapConfig.grid
                )}
              </>
            )}

            {cat === 'demarcation' && (
              <>
                {toolBtn(
                  lang === 'bn'
                    ? 'সাবেক–হাল ডিমার্কেশন (CS–RS ওভারলে)'
                    : 'CS–RS Overlay Demarcation',
                  <Layers className="h-4 w-4" />,
                  () => onStartWizard('demarcation')
                )}
                {toolBtn(
                  lang === 'bn' ? 'ভাগবণ্টন (জমি বিভাজন)' : 'Plot Division (Bhagbonton)',
                  <Scissors className="h-4 w-4" />,
                  onStartDemarcationWizard
                )}
                {toolBtn(
                  lang === 'bn' ? 'সমান ২ ভাগ' : 'Split 2 Equal',
                  <Scissors className="h-4 w-4" />,
                  () => onQuickEqualSplit(2),
                  false,
                  !selectedPoly
                )}
                {toolBtn(
                  lang === 'bn' ? 'সমান ৩ ভাগ' : 'Split 3 Equal',
                  <Scissors className="h-4 w-4" />,
                  () => onQuickEqualSplit(3),
                  false,
                  !selectedPoly
                )}
                {toolBtn(
                  lang === 'bn' ? 'কোণায় খুঁটি বসান' : 'Place Pillars',
                  <MapPin className="h-4 w-4" />,
                  onPlaceBoundaryPillars,
                  false,
                  !selectedPoly
                )}
              </>
            )}

            {cat === 'attach' && (
              <>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#D4DBD6] bg-white px-3 py-2 text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF8] whitespace-nowrap shrink-0">
                  <ImagePlus className="h-4 w-4 text-[#0F5132]" />
                  <span>{lang === 'bn' ? 'JPG / PNG যুক্ত' : 'Open Map JPG/PNG'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onAttachRasterFile(f);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#D4DBD6] bg-white px-3 py-2 text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF8] whitespace-nowrap shrink-0">
                  <Camera className="h-4 w-4 text-[#B45309]" />
                  <span>{lang === 'bn' ? 'ক্যামেরা ছবি' : 'Camera Capture'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onAttachRasterFile(f);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                {toolBtn(
                  lang === 'bn' ? 'স্কেল বার ক্যালিব্রেশন' : 'Bar Calibration',
                  <Ruler className="h-4 w-4" />,
                  () => onOpenRasterScale('calibrate')
                )}
                {toolBtn(
                  lang === 'bn' ? 'স্কেল যাচাই (≤৩%)' : 'Scale Check',
                  <CheckCircle2 className="h-4 w-4" />,
                  () => onOpenRasterScale('check')
                )}
                {toolBtn(
                  lang === 'bn' ? '১ মাইল = N″ মোড' : '1 Mile = N″ Mode',
                  <Compass className="h-4 w-4" />,
                  () => onOpenRasterScale('mapscale')
                )}
                {toolBtn(
                  lang === 'bn' ? 'জমি জয়েন্ট উইজার্ড' : 'Map Joint Wizard',
                  <Layers className="h-4 w-4" />,
                  onStartJointWizard
                )}
                {activeRaster && (
                  <>
                    <select
                      value={activeRaster.id}
                      onChange={(e) => onSelectRasterId(e.target.value)}
                      className="min-h-[44px] rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                    >
                      {doc.rasterLayers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRaster({
                          ...activeRaster,
                          visible: !activeRaster.visible,
                        })
                      }
                      className="min-h-[44px] rounded-xl border border-[#D4DBD6] px-3 text-xs font-semibold"
                    >
                      {activeRaster.visible
                        ? lang === 'bn'
                          ? 'লুকান'
                          : 'Hide'
                        : lang === 'bn'
                        ? 'দেখান'
                        : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRaster(activeRaster.id)}
                      className="min-h-[44px] rounded-xl border border-red-200 px-3 text-xs font-semibold text-red-700"
                    >
                      {t.actions.delete}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating "+" Button (Bottom-Right) toggling Advanced Mode */}
      <button
        type="button"
        aria-label={open ? t.actions.advancedModeOn : t.actions.advancedMode}
        onClick={onToggleOpen}
        className={`fixed bottom-5 right-4 z-40 flex h-14 items-center gap-2 rounded-2xl px-4 shadow-lg transition-all active:scale-95 ${
          open
            ? 'bg-[#141A17] text-white'
            : 'bg-[#0F5132] text-white hover:bg-[#0B3D26]'
        }`}
      >
        <Plus className={`h-5 w-5 transition-transform ${open ? 'rotate-45' : ''}`} />
        <span className="text-xs font-bold whitespace-nowrap">
          {t.actions.advancedMode}
        </span>
      </button>
    </>
  );
};
