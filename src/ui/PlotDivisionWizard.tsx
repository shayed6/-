import React from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Compass,
  FileDown,
  FileSpreadsheet,
  Hand,
  MousePointerClick,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
  Trash2,
} from 'lucide-react';
import { CadDocument, PolygonEntity } from '../core/cad/types';
import {
  PartitionComputationResult,
  PartitionDirectionMode,
  PartitionDivideMode,
  PartitionShareInput,
  parseShareExpression,
} from '../core/cad/partition';
import { computeAreaBreakdown, polygonAreaSqFt, polygonPerimeterFt } from '../core/survey/area';
import { Point2D, distance2D } from '../core/survey/coordinates';
import {
  AreaUnit,
  formatNumber,
  getAreaUnitLabel,
  parseLocalizedNumber,
  toSqFt,
} from '../core/survey/units';
import { Lang, getTranslations } from './i18n';
import { WizardFramework } from './WizardFramework';

export interface PlotDivisionSessionProps {
  sourcePolyId: string | null;
  onSourcePolyIdChange: (id: string) => void;
  onStartDrawPolygon: () => void;
  onAddSamplePolygon: (kind: 'rect' | 'tri' | 'lshape') => void;
  divideMode: PartitionDivideMode;
  onDivideModeChange: (mode: PartitionDivideMode) => void;
  equalParts: string;
  onEqualPartsChange: (val: string) => void;
  equalNames: string[];
  onEqualNamesChange: (names: string[]) => void;
  ratioRows: Array<{ id: string; name: string; expr: string }>;
  onRatioRowsChange: (rows: Array<{ id: string; name: string; expr: string }>) => void;
  exactAmount: string;
  onExactAmountChange: (val: string) => void;
  exactUnit: AreaUnit;
  onExactUnitChange: (u: AreaUnit) => void;
  exactFirstName: string;
  onExactFirstNameChange: (val: string) => void;
  exactRemainderName: string;
  onExactRemainderNameChange: (val: string) => void;
  directionMode: PartitionDirectionMode;
  onDirectionModeChange: (m: PartitionDirectionMode) => void;
  chosenEdgeIndex: number;
  onChosenEdgeIndexChange: (idx: number) => void;
  flipDirection: boolean;
  onFlipDirectionChange: (v: boolean) => void;
  radialPivot: Point2D | null;
  onRadialPivotChange: (pt: Point2D) => void;
  radialStartAngleDeg: number | null;
  onRadialStartAngleDegChange: (deg: number | null) => void;
  onStartPickEdgeOnMap: () => void;
  onStartPickPivotOnMap: () => void;
  result: PartitionComputationResult | null;
  errorMsg: string;
  onSolvePartition: () => boolean;
  onNudgeCutLine: (splitIdx: number, delta: number) => void;
  onResetExactBisection: () => void;
  onDragModeOnCanvas: () => void;
  keepOriginalPlot: boolean;
  onKeepOriginalPlotChange: (v: boolean) => void;
  addPillars: boolean;
  onAddPillarsChange: (v: boolean) => void;
  savedToPlots: boolean;
  onSavePartsToPlotsAndReport: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
}

interface PlotDivisionWizardProps {
  doc: CadDocument;
  lang: Lang;
  step: number;
  onStepChange: (s: number) => void;
  session: PlotDivisionSessionProps;
  onJumpToWorkspace: () => void;
  onClose: () => void;
}

export const PlotDivisionWizard: React.FC<PlotDivisionWizardProps> = ({
  doc,
  lang,
  step,
  onStepChange,
  session,
  onJumpToWorkspace,
  onClose,
}) => {
  const t = getTranslations(lang);
  const polygons = doc.entities.filter(
    (e): e is PolygonEntity => e.kind === 'polygon' && e.visible !== false
  );
  const sourcePoly =
    polygons.find((p) => p.id === session.sourcePolyId) || polygons[0] || null;

  const totalSqFt = sourcePoly ? polygonAreaSqFt(sourcePoly.points) : 0;
  const totalBreakdown = computeAreaBreakdown(totalSqFt, doc.unitProfile);

  const disclaimerText =
    lang === 'bn'
      ? 'নোট: এই ভাগবণ্টন ফলাফল আনুমানিক এবং এটি কোনো আইনি পরামর্শ নয়। চূড়ান্ত দলিল বা সীমানা নির্ধারণের আগে সরেজমিন সার্ভে যাচাই করুন।'
      : 'Note: These plot division results are approximate and are not legal advice. Verify with a physical field survey before deed or legal execution.';

  // Validate Step 2 share setup
  const isStep2Valid = (() => {
    if (!sourcePoly || totalSqFt <= 1e-6) return false;
    if (session.divideMode === 'equal') {
      const n = Math.round(parseLocalizedNumber(session.equalParts));
      return n >= 2 && n <= 20;
    }
    if (session.divideMode === 'exact') {
      const target = toSqFt(
        parseLocalizedNumber(session.exactAmount),
        session.exactUnit,
        doc.unitProfile
      );
      return target > 1e-3 && target < totalSqFt - 1e-3;
    }
    const validWeights = session.ratioRows
      .map((r) => parseShareExpression(r.expr))
      .filter((v) => Number.isFinite(v) && v > 0);
    return validWeights.length >= 2 && validWeights.length === session.ratioRows.length;
  })();

  let instruction = '';
  let hint = '';
  let canGoNext = true;
  let nextLabel: string | undefined;
  let onNext: (() => void) | undefined;
  let onBack: (() => void) | undefined;
  let body: React.ReactNode = null;

  if (step === 1) {
    instruction =
      lang === 'bn'
        ? 'ভাগ করার জন্য একটি দাগ বেছে নিন অথবা মানচিত্রে নতুন বহুভুজ আঁকুন'
        : 'Pick an existing plot or draw a polygon on the map';
    hint =
      lang === 'bn'
        ? 'যেকোনো আকৃতির (আয়ত, ত্রিভুজ বা অনিয়মিত) দাগ ভাগ করা যাবে।'
        : 'Works for any-shape polygon: rectangle, triangle, L-shape, or irregular.';
    canGoNext = Boolean(sourcePoly && sourcePoly.points.length >= 3);
    onNext = () => onStepChange(2);

    body = (
      <div className="space-y-3">
        {polygons.length > 0 ? (
          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-0.5">
            {polygons.map((p, idx) => {
              const area = polygonAreaSqFt(p.points);
              const b = computeAreaBreakdown(area, doc.unitProfile);
              const active = sourcePoly?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => session.onSourcePolyIdChange(p.id)}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-[#0F5132] bg-[#0F5132]/10 dark:border-emerald-500 dark:bg-emerald-500/15'
                      : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#141A17] dark:text-white truncate">
                      {p.plotNumber ||
                        (lang === 'bn'
                          ? `দাগ ${formatNumber(idx + 1, 0, 'bn')}`
                          : `Plot ${idx + 1}`)}
                      {p.ownerName ? ` · ${p.ownerName}` : ''}
                    </div>
                    <div className="text-xs text-[#4A5550] dark:text-slate-400 tabular-nums">
                      {formatNumber(p.points.length, 0, lang)}{' '}
                      {lang === 'bn' ? 'কোণা' : 'vertices'} ·{' '}
                      {formatNumber(polygonPerimeterFt(p.points, true), 1, lang)}{' '}
                      {lang === 'bn' ? 'ফু পরিসীমা' : 'ft perim'}
                    </div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-sm font-bold text-[#0F5132] dark:text-emerald-400">
                      {formatNumber(b.shotok, 2, lang)}{' '}
                      {lang === 'bn' ? 'শতক' : 'sh'}
                    </div>
                    <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                      {formatNumber(area, 0, lang)}{' '}
                      {lang === 'bn' ? 'ব.ফু.' : 'sq ft'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 p-3 text-xs text-[#4A5550] dark:text-slate-400">
            {lang === 'bn'
              ? 'ক্যানভাসে এখনো কোনো দাগ নেই। নিচ থেকে মানচিত্রে দাগ আঁকুন বা একটি নমুনা দাগ যোগ করুন।'
              : 'No plots on canvas yet. Draw one on the map or add a sample polygon below.'}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={session.onStartDrawPolygon}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>
              {lang === 'bn' ? 'মানচিত্রে নতুন দাগ আঁকুন' : 'Draw Polygon on Map'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => session.onAddSamplePolygon('rect')}
            className="min-h-[42px] rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-3 text-xs font-semibold"
          >
            {lang === 'bn' ? '+ ১০০×৫০ আয়ত' : '+ 100×50 Rect'}
          </button>

          <button
            type="button"
            onClick={() => session.onAddSamplePolygon('lshape')}
            className="min-h-[42px] rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-3 text-xs font-semibold"
          >
            {lang === 'bn' ? '+ অনিয়মিত বহুভুজ' : '+ Irregular Plot'}
          </button>
        </div>
      </div>
    );
  } else if (step === 2) {
    instruction =
      lang === 'bn'
        ? 'কীভাবে জমি ভাগ করবেন (সমান ভাগ, অনুপাত/অংশ বা নির্দিষ্ট পরিমাণ) তা নির্বাচন করুন'
        : 'Choose how to divide: equal parts, ratio/fractions, or exact area';
    onBack = () => onStepChange(1);
    canGoNext = isStep2Valid;
    onNext = () => onStepChange(3);

    const equalCountNum = Math.max(
      2,
      Math.min(12, Math.round(parseLocalizedNumber(session.equalParts) || 2))
    );

    const parsedRatioWeights = session.ratioRows.map((r) =>
      parseShareExpression(r.expr)
    );
    const ratioTotal = parsedRatioWeights.reduce(
      (acc, w) => acc + (Number.isFinite(w) && w > 0 ? w : 0),
      0
    );

    body = (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-[#4A5550] dark:text-slate-400 tabular-nums">
          <span>
            {lang === 'bn' ? 'নির্বাচিত দাগের মোট জমি:' : 'Selected plot total:'}
          </span>
          <span className="font-bold text-[#0F5132] dark:text-emerald-400">
            {formatNumber(totalBreakdown.shotok, 3, lang)}{' '}
            {lang === 'bn' ? 'শতক' : 'sh'} ·{' '}
            {formatNumber(totalSqFt, 1, lang)}{' '}
            {lang === 'bn' ? 'ব.ফু.' : 'sq ft'}
          </span>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              {
                id: 'equal',
                label: lang === 'bn' ? 'সমান ভাগ' : 'Equal (N)',
              },
              {
                id: 'ratio',
                label: lang === 'bn' ? 'অনুপাত / অংশ' : 'Ratio / Heirs',
              },
              {
                id: 'exact',
                label: lang === 'bn' ? 'নির্দিষ্ট মাপ' : 'Exact Area',
              },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => session.onDivideModeChange(m.id)}
              className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold transition-colors ${
                session.divideMode === m.id
                  ? 'border-[#0F5132] bg-[#0F5132] text-white dark:border-emerald-500 dark:bg-emerald-600'
                  : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {session.divideMode === 'equal' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-5 gap-1.5 flex-1">
                {['2', '3', '4', '5', '6'].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => session.onEqualPartsChange(n)}
                    className={`min-h-[40px] rounded-xl border text-sm font-bold ${
                      session.equalParts === n
                        ? 'border-[#0F5132] bg-[#0F5132]/10 text-[#0F5132] dark:text-emerald-300'
                        : 'border-[#D4DBD6] dark:border-slate-700'
                    }`}
                  >
                    {formatNumber(Number(n), 0, lang)}
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={session.equalParts}
                onChange={(e) => session.onEqualPartsChange(e.target.value)}
                aria-label={lang === 'bn' ? 'ভাগ সংখ্যা' : 'Number of equal parts'}
                className="w-16 min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-center text-sm font-bold font-mono-num"
              />
            </div>

            <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {Array.from({ length: equalCountNum }, (_, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={
                    session.equalNames[idx] ??
                    (lang === 'bn'
                      ? `অংশীদার ${formatNumber(idx + 1, 0, 'bn')}`
                      : `Share ${idx + 1}`)
                  }
                  onChange={(e) => {
                    const next = [...session.equalNames];
                    while (next.length <= idx) {
                      next.push(
                        lang === 'bn'
                          ? `অংশীদার ${formatNumber(next.length + 1, 0, 'bn')}`
                          : `Share ${next.length + 1}`
                      );
                    }
                    next[idx] = e.target.value;
                    session.onEqualNamesChange(next);
                  }}
                  placeholder={
                    lang === 'bn' ? `অংশীদার ${idx + 1}` : `Share ${idx + 1}`
                  }
                  className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs"
                />
              ))}
            </div>
          </div>
        )}

        {session.divideMode === 'ratio' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: '১ : ২', exprs: ['1', '2'] },
                { label: '১ : ১ : ২', exprs: ['1', '1', '2'] },
                { label: '১/২ : ১/৩ : ১/৬', exprs: ['1/2', '1/3', '1/6'] },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    session.onRatioRowsChange(
                      preset.exprs.map((ex, i) => ({
                        id: `heir-${i + 1}`,
                        name:
                          session.ratioRows[i]?.name ||
                          (lang === 'bn'
                            ? `ওয়ারিশ ${formatNumber(i + 1, 0, 'bn')}`
                            : `Heir ${i + 1}`),
                        expr: ex,
                      }))
                    )
                  }
                  className="min-h-[32px] rounded-lg border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2.5 text-[11px] font-semibold"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5">
              {session.ratioRows.map((row, idx) => {
                const w = parsedRatioWeights[idx];
                const pct =
                  ratioTotal > 0 && Number.isFinite(w) && w > 0
                    ? (w / ratioTotal) * 100
                    : 0;
                const sh = (totalBreakdown.shotok * pct) / 100;
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_76px_auto_auto] items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => {
                        const next = session.ratioRows.map((r, i) =>
                          i === idx ? { ...r, name: e.target.value } : r
                        );
                        session.onRatioRowsChange(next);
                      }}
                      placeholder={
                        lang === 'bn' ? 'অংশীদারের নাম' : 'Share holder'
                      }
                      className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs"
                    />
                    <input
                      type="text"
                      value={row.expr}
                      onChange={(e) => {
                        const next = session.ratioRows.map((r, i) =>
                          i === idx ? { ...r, expr: e.target.value } : r
                        );
                        session.onRatioRowsChange(next);
                      }}
                      placeholder="1/2"
                      className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-center text-xs font-mono-num"
                    />
                    <span className="text-[11px] font-semibold text-[#0F5132] dark:text-emerald-400 tabular-nums whitespace-nowrap">
                      {formatNumber(sh, 2, lang)} {lang === 'bn' ? 'শ' : 'sh'}
                    </span>
                    <button
                      type="button"
                      disabled={session.ratioRows.length <= 2}
                      onClick={() => {
                        if (session.ratioRows.length <= 2) return;
                        session.onRatioRowsChange(
                          session.ratioRows.filter((_, i) => i !== idx)
                        );
                      }}
                      aria-label={t.actions.delete}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                session.onRatioRowsChange([
                  ...session.ratioRows,
                  {
                    id: `heir-${Date.now()}`,
                    name:
                      lang === 'bn'
                        ? `ওয়ারিশ ${formatNumber(session.ratioRows.length + 1, 0, 'bn')}`
                        : `Heir ${session.ratioRows.length + 1}`,
                    expr: '1',
                  },
                ])
              }
              className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-[#0F5132] dark:border-emerald-500 px-3 text-xs font-semibold text-[#0F5132] dark:text-emerald-300"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{lang === 'bn' ? 'অংশীদার যোগ করুন' : 'Add Share Holder'}</span>
            </button>
          </div>
        )}

        {session.divideMode === 'exact' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-[1fr_115px] gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={session.exactAmount}
                onChange={(e) => session.onExactAmountChange(e.target.value)}
                placeholder="5"
                className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-bold font-mono-num"
              />
              <select
                value={session.exactUnit}
                onChange={(e) => session.onExactUnitChange(e.target.value as AreaUnit)}
                className="min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold"
              >
                {(['shotok', 'katha', 'bigha', 'acre', 'sqft', 'sqm'] as AreaUnit[]).map(
                  (u) => (
                    <option key={u} value={u}>
                      {getAreaUnitLabel(u, lang)}
                    </option>
                  )
                )}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={session.exactFirstName}
                onChange={(e) => session.onExactFirstNameChange(e.target.value)}
                placeholder={lang === 'bn' ? 'প্রথম অংশের নাম' : 'First part name'}
                className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs"
              />
              <input
                type="text"
                value={session.exactRemainderName}
                onChange={(e) => session.onExactRemainderNameChange(e.target.value)}
                placeholder={lang === 'bn' ? 'অবশিষ্ট অংশের নাম' : 'Remainder name'}
                className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs"
              />
            </div>
            {!isStep2Valid && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {lang === 'bn'
                  ? 'নির্দিষ্ট পরিমাণ অবশ্যই ০ থেকে বড় এবং মোট জমির চেয়ে কম হতে হবে।'
                  : 'Exact area must be > 0 and strictly less than total plot area.'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  } else if (step === 3) {
    instruction =
      lang === 'bn'
        ? 'বিভাজন রেখার দিক নির্ধারণ করুন (বাহুর সমান্তরাল, লম্ব, বা বিন্দু থেকে রেডিয়াল)'
        : 'Choose dividing line direction: parallel to edge, perpendicular, or radial from point';
    onBack = () => onStepChange(2);
    nextLabel = lang === 'bn' ? 'বিভাজন হিসাব করুন' : 'Compute Split';
    onNext = () => {
      const ok = session.onSolvePartition();
      if (ok) onStepChange(4);
    };

    const pts = sourcePoly?.points || [];
    const safeEdgeIdx =
      pts.length > 0 ? ((session.chosenEdgeIndex % pts.length) + pts.length) % pts.length : 0;

    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              {
                id: 'parallel-edge',
                label: lang === 'bn' ? 'বাহুর সমান্তরাল' : 'Parallel to Edge',
              },
              {
                id: 'perpendicular-edge',
                label: lang === 'bn' ? 'বাহুর লম্ব' : 'Perp to Edge',
              },
              {
                id: 'radial-point',
                label: lang === 'bn' ? 'বিন্দু থেকে রেডিয়াল' : 'Radial from Point',
              },
            ] as const
          ).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => session.onDirectionModeChange(d.id)}
              className={`min-h-[42px] rounded-xl border px-2 text-xs font-semibold transition-colors ${
                session.directionMode === d.id
                  ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {session.directionMode !== 'radial-point' ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#4A5550] dark:text-slate-300">
                {lang === 'bn' ? 'কোন বাহু ধরে কাটবেন?' : 'Reference Edge'}
              </label>
              <button
                type="button"
                onClick={session.onStartPickEdgeOnMap}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#1E3A8A] px-2.5 text-[11px] font-semibold text-[#1E3A8A] dark:text-blue-300"
              >
                <MousePointerClick className="h-3.5 w-3.5" />
                <span>{lang === 'bn' ? 'মানচিত্রে বাহু ট্যাপ করুন' : 'Tap Edge on Map'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {pts.map((pt, i) => {
                const next = pts[(i + 1) % pts.length];
                const len = distance2D(pt, next);
                const selected = safeEdgeIdx === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => session.onChosenEdgeIndexChange(i)}
                    className={`min-h-[36px] rounded-xl border px-2.5 text-xs font-semibold tabular-nums ${
                      selected
                        ? 'border-[#1E3A8A] bg-[#1E3A8A]/10 text-[#1E3A8A] dark:text-blue-300'
                        : 'border-[#D4DBD6] dark:border-slate-700'
                    }`}
                  >
                    {lang === 'bn'
                      ? `বাহু ${formatNumber(i + 1, 0, 'bn')} (${formatNumber(len, 1, 'bn')} ফু)`
                      : `Edge ${i + 1} (${len.toFixed(1)} ft)`}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => session.onFlipDirectionChange(!session.flipDirection)}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
                session.flipDirection
                  ? 'border-[#B45309] bg-[#B45309]/10 text-[#B45309]'
                  : 'border-[#D4DBD6] dark:border-slate-700'
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>
                {lang === 'bn'
                  ? 'বিপরীত দিক থেকে শুরু করুন (Flip)'
                  : 'Start from Opposite Side (Flip)'}
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={session.onStartPickPivotOnMap}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#7C3AED] px-3 text-xs font-semibold text-white"
              >
                <MousePointerClick className="h-3.5 w-3.5" />
                <span>
                  {lang === 'bn' ? 'মানচিত্রে কেন্দ্রবিন্দু ট্যাপ করুন' : 'Tap Pivot on Map'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sourcePoly || sourcePoly.points.length === 0) return;
                  const cx =
                    sourcePoly.points.reduce((a, p) => a + p.x, 0) /
                    sourcePoly.points.length;
                  const cy =
                    sourcePoly.points.reduce((a, p) => a + p.y, 0) /
                    sourcePoly.points.length;
                  session.onRadialPivotChange({ x: cx, y: cy });
                }}
                className="min-h-[38px] rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-3 text-xs font-semibold"
              >
                {lang === 'bn' ? 'প্লটের মাঝখানের বিন্দু' : 'Plot Center'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {pts.map((pt, i) => {
                const isActive =
                  session.radialPivot && distance2D(session.radialPivot, pt) < 1e-3;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => session.onRadialPivotChange({ ...pt })}
                    className={`min-h-[34px] rounded-xl border px-2.5 text-xs font-semibold ${
                      isActive
                        ? 'border-[#7C3AED] bg-[#7C3AED]/10 text-[#7C3AED] dark:text-violet-300'
                        : 'border-[#D4DBD6] dark:border-slate-700'
                    }`}
                  >
                    {lang === 'bn'
                      ? `কোণা ${formatNumber(i + 1, 0, 'bn')}`
                      : `Corner ${i + 1}`}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? 'শুরুর কৌণিক দিক:' : 'Start Ray Angle:'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    session.onRadialStartAngleDegChange(
                      (((session.radialStartAngleDeg ?? 0) - 15 + 360) % 360)
                    )
                  }
                  className="min-h-[32px] rounded-lg border border-[#D4DBD6] dark:border-slate-700 px-2.5 font-semibold"
                >
                  −১৫°
                </button>
                <button
                  type="button"
                  onClick={() => session.onRadialStartAngleDegChange(null)}
                  className="min-h-[32px] rounded-lg border border-[#D4DBD6] dark:border-slate-700 px-2.5 font-semibold"
                >
                  {lang === 'bn' ? 'স্বয়ংক্রিয়' : 'Auto'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    session.onRadialStartAngleDegChange(
                      (((session.radialStartAngleDeg ?? 0) + 15) % 360)
                    )
                  }
                  className="min-h-[32px] rounded-lg border border-[#D4DBD6] dark:border-slate-700 px-2.5 font-semibold"
                >
                  +১৫°
                </button>
              </div>
            </div>
          </div>
        )}

        {session.errorMsg && (
          <p className="text-xs text-red-600 dark:text-red-400">{session.errorMsg}</p>
        )}
      </div>
    );
  } else if (step === 4) {
    instruction =
      lang === 'bn'
        ? 'প্রতিটি অংশের ক্ষেত্রফল (শতক, কাঠা, বর্গফুট) ও বাহুর মাপ যাচাই করুন'
        : 'Review computed area (shotok, katha, sq ft) and side lengths for each share';
    onBack = () => onStepChange(3);
    canGoNext = Boolean(session.result && session.result.parts.length >= 2);
    nextLabel = lang === 'bn' ? 'রেখা ড্র্যাগ / সমন্বয়' : 'Drag & Adjust Lines';
    onNext = () => onStepChange(5);

    const res = session.result;
    body = !res ? (
      <div className="text-xs text-red-600">
        {lang === 'bn' ? 'বিভাজন হিসাব পাওয়া যায়নি।' : 'No division result computed.'}
      </div>
    ) : (
      <div className="space-y-2.5">
        <div className="max-h-48 overflow-y-auto space-y-2 pr-0.5">
          {res.parts.map((part) => {
            const b = computeAreaBreakdown(part.actualAreaSqFt, doc.unitProfile);
            return (
              <div
                key={part.id}
                className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-2.5 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#141A17] dark:text-white flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-xs shrink-0"
                      style={{ backgroundColor: part.color }}
                    />
                    <span>{part.name}</span>
                    <span className="text-[#4A5550] dark:text-slate-400 font-medium">
                      ({part.shareLabel})
                    </span>
                  </span>
                  <span className="font-bold text-[#0F5132] dark:text-emerald-400 tabular-nums">
                    {formatNumber(b.shotok, 3, lang)} {lang === 'bn' ? 'শতক' : 'sh'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#4A5550] dark:text-slate-300 tabular-nums">
                  <span>
                    {lang === 'bn' ? 'কাঠা:' : 'Katha:'}{' '}
                    <strong>{formatNumber(b.katha, 3, lang)}</strong>
                  </span>
                  <span>
                    {lang === 'bn' ? 'ব.ফু.:' : 'Sq Ft:'}{' '}
                    <strong>{formatNumber(part.actualAreaSqFt, 2, lang)}</strong>
                  </span>
                  <span>
                    {lang === 'bn' ? 'পরিসীমা:' : 'Perim:'}{' '}
                    <strong>{formatNumber(part.perimeterFt, 1, lang)} ফু</strong>
                  </span>
                </div>
                {part.sideLengthsFt.length > 0 && (
                  <div className="text-[11px] text-[#4A5550] dark:text-slate-400 tabular-nums">
                    {lang === 'bn' ? 'বাহুসমূহ (ফুট): ' : 'Sides (ft): '}
                    {part.sideLengthsFt.map((s) => formatNumber(s, 1, lang)).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
          <span>{disclaimerText}</span>
        </div>
      </div>
    );
  } else if (step === 5) {
    instruction =
      lang === 'bn'
        ? 'প্রয়োজনে বিভাজন রেখা মানচিত্রে টেনে বা +/- দিয়ে সূক্ষ্ম পরিবর্তন করুন'
        : 'Drag split lines directly on the map or fine-tune with controls (live recalculation)';
    onBack = () => onStepChange(4);
    nextLabel = lang === 'bn' ? 'সেভ ও রিপোর্টে যান' : 'Save & Report';
    onNext = () => onStepChange(6);

    const res = session.result;
    const isRadial = res?.directionMode === 'radial-point';
    const stepSize = isRadial ? 2 : 0.5;

    body = !res ? null : (
      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={session.onDragModeOnCanvas}
            className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#DC2626] px-3 text-xs font-semibold text-white"
          >
            <Hand className="h-3.5 w-3.5" />
            <span>
              {lang === 'bn'
                ? 'মানচিত্রে লাল রেখা টেনে সরান'
                : 'Drag Red Split Handle on Map'}
            </span>
          </button>

          <button
            type="button"
            onClick={session.onResetExactBisection}
            className="min-h-[42px] inline-flex items-center gap-1 rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-3 text-xs font-semibold"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{lang === 'bn' ? 'সঠিক মাপে রিসেট' : 'Reset Exact'}</span>
          </button>
        </div>

        {/* Inline split line fine adjusters */}
        <div className="space-y-1.5 max-h-28 overflow-y-auto">
          {res.splitLines.map((line, i) => (
            <div
              key={line.index}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E9E4] dark:border-slate-700 px-3 py-1.5 text-xs"
            >
              <span className="font-semibold text-[#141A17] dark:text-slate-200">
                {lang === 'bn'
                  ? `রেখা ${formatNumber(i + 1, 0, 'bn')} (${res.parts[i]?.name} | ${res.parts[i + 1]?.name})`
                  : `Line ${i + 1} (${res.parts[i]?.name} | ${res.parts[i + 1]?.name})`}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => session.onNudgeCutLine(i, -stepSize)}
                  className="min-h-[34px] rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2.5 font-bold"
                >
                  {isRadial ? '−২°' : '−০.৫ ফু'}
                </button>
                <button
                  type="button"
                  onClick={() => session.onNudgeCutLine(i, stepSize)}
                  className="min-h-[34px] rounded-lg border border-[#D4DBD6] dark:border-slate-600 px-2.5 font-bold"
                >
                  {isRadial ? '+২°' : '+০.৫ ফু'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Live part area readout */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-24 overflow-y-auto">
          {res.parts.map((part) => {
            const b = computeAreaBreakdown(part.actualAreaSqFt, doc.unitProfile);
            return (
              <div
                key={part.id}
                className="rounded-lg border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2 py-1.5 text-[11px] tabular-nums"
              >
                <div className="font-bold truncate" style={{ color: part.color }}>
                  {part.name}
                </div>
                <div className="font-semibold text-[#141A17] dark:text-slate-100">
                  {formatNumber(b.shotok, 3, lang)} {lang === 'bn' ? 'শতক' : 'sh'} ·{' '}
                  {formatNumber(part.actualAreaSqFt, 1, lang)}{' '}
                  {lang === 'bn' ? 'ব.ফু.' : 'sq ft'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
          <span>{disclaimerText}</span>
        </div>
      </div>
    );
  } else {
    // Step 6: Save each part as a plot named after its share holder & add table to report
    instruction =
      lang === 'bn'
        ? 'প্রতিটি অংশ অংশীদারের নামে দাগ হিসেবে সেভ করুন এবং রিপোর্টে টেবিল যুক্ত করুন'
        : 'Save each part as a plot named after its share holder and add table to report';
    onBack = () => onStepChange(5);
    nextLabel = lang === 'bn' ? 'হোম / সমাপ্তি' : 'Done';
    onNext = onClose;

    const res = session.result;
    body = !res ? null : (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={session.keepOriginalPlot}
              onChange={(e) => session.onKeepOriginalPlotChange(e.target.checked)}
              className="h-4 w-4 accent-[#0F5132]"
            />
            <span>
              {lang === 'bn' ? 'মূল দাগটিও ক্যানভাসে রাখুন' : 'Keep original plot on canvas'}
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={session.addPillars}
              onChange={(e) => session.onAddPillarsChange(e.target.checked)}
              className="h-4 w-4 accent-[#0F5132]"
            />
            <span>
              {lang === 'bn' ? 'নতুন কোণায় খুঁটি (Pillar) বসান' : 'Place corner pillars'}
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={session.onSavePartsToPlotsAndReport}
          className={`w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-colors ${
            session.savedToPlots
              ? 'bg-[#115E59]'
              : 'bg-[#0F5132] hover:bg-[#0B3D26]'
          }`}
        >
          <Check className="h-4 w-4" />
          <span>
            {session.savedToPlots
              ? lang === 'bn'
                ? 'দাগ ও রিপোর্ট টেবিল সংরক্ষিত হয়েছে (পুনরায় আপডেট করুন)'
                : 'Saved to Plots & Report (Update Again)'
              : lang === 'bn'
              ? 'অংশগুলো দাগ হিসেবে রাখুন ও রিপোর্টে টেবিল যোগ করুন'
              : 'Save Parts as Plots & Add Table to Report'}
          </span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={session.onExportPdf}
            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1E3A8A] px-3 text-xs font-semibold text-white"
          >
            <FileDown className="h-4 w-4" />
            <span>{t.actions.exportPdf}</span>
          </button>
          <button
            type="button"
            onClick={session.onExportCsv}
            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-3 text-xs font-semibold"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>{t.actions.exportCsv}</span>
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
          <span>{disclaimerText}</span>
        </div>
      </div>
    );
  }

  return (
    <WizardFramework
      title={lang === 'bn' ? 'ভাগবণ্টন (জমি বিভাজন)' : 'Plot Division (Bhagbonton)'}
      icon={<Scissors className="h-4 w-4 text-[#1E3A8A] dark:text-blue-400" />}
      currentStep={step}
      totalSteps={6}
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
