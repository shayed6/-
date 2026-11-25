import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BookmarkPlus,
  Calculator,
  CheckCircle2,
  Compass,
  Divide,
  FileSpreadsheet,
  PieChart,
  Plus,
  Ruler,
  Scale,
  Sparkles,
  Table2,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { CalculatorRecord, CalculatorTableRow } from '../core/cad/types';
import { AreaBreakdown, computeAreaBreakdown } from '../core/survey/area';
import { Point2D } from '../core/survey/coordinates';
import {
  AnaGandaParts,
  CalculatorAreaUnit,
  CalculatorLinearUnit,
  HissaEntryInput,
  TofsilPersonInput,
  TraditionalShareUnit,
  anaGandaToFraction,
  calcAreaToSqFt,
  calcQuadFromSidesAndAngle,
  calcQuadFromSidesAndDiagonal,
  calcRectangleFromSides,
  calcTrapeziumArea,
  calcTriangleFromSides,
  computeHissaDistribution,
  computeMyShareInDag,
  computeRatioSplit,
  computeTofsilDistribution,
  convertAllAreaUnits,
  convertAllLengthUnits,
  convertTraditionalShareUnit,
  exportTofsilCsv,
  formatAnaGandaText,
  fractionToAnaGanda,
  parseShareExpression,
} from '../core/survey/calculator';
import {
  UnitProfile,
  formatNumber,
  parseLocalizedNumber,
} from '../core/survey/units';
import { exportFileCrossPlatform } from '../adapters/exportHelper';
import { Lang } from './i18n';

export type CalculatorToolId = CalculatorRecord['tool'];

interface CalculatorViewProps {
  open: boolean;
  lang: Lang;
  unitProfile: UnitProfile;
  onClose: () => void;
  onAddToPlotAndReport: (payload: {
    record: CalculatorRecord;
    polygonPoints?: Point2D[];
    plotLabel?: string;
  }) => void;
}

const AREA_UNITS: Array<{ id: CalculatorAreaUnit; bn: string; en: string }> = [
  { id: 'shotok', bn: 'শতক', en: 'Shotok' },
  { id: 'decimal', bn: 'ডেসিমেল', en: 'Decimal' },
  { id: 'katha', bn: 'কাঠা', en: 'Katha' },
  { id: 'bigha', bn: 'বিঘা', en: 'Bigha' },
  { id: 'acre', bn: 'একর', en: 'Acre' },
  { id: 'sqft', bn: 'বর্গফুট', en: 'Sq Ft' },
  { id: 'sqm', bn: 'বর্গমিটার', en: 'Sq M' },
];

const LINEAR_UNITS: Array<{ id: CalculatorLinearUnit; bn: string; en: string }> = [
  { id: 'ft', bn: 'ফুট', en: 'ft' },
  { id: 'm', bn: 'মিটার', en: 'm' },
  { id: 'hat', bn: 'হাত', en: 'hat' },
  { id: 'gaj', bn: 'গজ', en: 'gaj' },
  { id: 'chain', bn: 'চেইন', en: 'chain' },
  { id: 'link', bn: 'লিঙ্ক', en: 'link' },
  { id: 'inch', bn: 'ইঞ্চি', en: 'inch' },
];

const SHARE_UNITS: Array<{ id: TraditionalShareUnit; bn: string; en: string }> = [
  { id: 'ana', bn: 'আনা (১৬-তে)', en: 'Ana (/16)' },
  { id: 'ganda', bn: 'গণ্ডা (৩২০-তে)', en: 'Ganda (/320)' },
  { id: 'kora', bn: 'কড়া (১২৮০-তে)', en: 'Kora (/1280)' },
  { id: 'kranti', bn: 'ক্রান্তি (৩৮৪০-তে)', en: 'Kranti (/3840)' },
  { id: 'til', bn: 'তিল (৭৬৮০০-তে)', en: 'Til (/76800)' },
];

function numInputVal(s: string): number {
  const n = parseLocalizedNumber(s);
  return Number.isFinite(n) ? n : NaN;
}

function emptyAna(): {
  ana: string;
  ganda: string;
  kora: string;
  kranti: string;
  til: string;
} {
  return { ana: '0', ganda: '0', kora: '0', kranti: '0', til: '0' };
}

function toAnaParts(raw: {
  ana: string;
  ganda: string;
  kora: string;
  kranti: string;
  til: string;
}): AnaGandaParts {
  return {
    ana: parseLocalizedNumber(raw.ana) || 0,
    ganda: parseLocalizedNumber(raw.ganda) || 0,
    kora: parseLocalizedNumber(raw.kora) || 0,
    kranti: parseLocalizedNumber(raw.kranti) || 0,
    til: parseLocalizedNumber(raw.til) || 0,
  };
}

export const CalculatorView: React.FC<CalculatorViewProps> = ({
  open,
  lang,
  unitProfile,
  onClose,
  onAddToPlotAndReport,
}) => {
  const [activeTool, setActiveTool] = useState<CalculatorToolId>('area-sides');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Tool 1: Area from sides
  const [shapeKind, setShapeKind] = useState<
    'triangle' | 'quad-diag' | 'quad-angle' | 'rectangle' | 'trapezium'
  >('quad-diag');
  const [sideUnit, setSideUnit] = useState<CalculatorLinearUnit>('ft');
  const [tA, setTA] = useState('30');
  const [tB, setTB] = useState('40');
  const [tC, setTC] = useState('50');
  const [rL, setRL] = useState('100');
  const [rW, setRW] = useState('50');
  const [qAB, setQAB] = useState('80');
  const [qBC, setQBC] = useState('55');
  const [qCD, setQCD] = useState('75');
  const [qDA, setQDA] = useState('60');
  const [qDiag, setQDiag] = useState('98');
  const [qAngle, setQAngle] = useState('85');
  const [trapA, setTrapA] = useState('90');
  const [trapB, setTrapB] = useState('60');
  const [trapH, setTrapH] = useState('45');

  // Tool 2: Unit Converter
  const [convCat, setConvCat] = useState<'area' | 'length' | 'share'>('area');
  const [convAreaVal, setConvAreaVal] = useState('33');
  const [convAreaUnit, setConvAreaUnit] = useState<CalculatorAreaUnit>('shotok');
  const [convLenVal, setConvLenVal] = useState('1');
  const [convLenUnit, setConvLenUnit] = useState<CalculatorLinearUnit>('chain');
  const [convShareVal, setConvShareVal] = useState('4');
  const [convShareUnit, setConvShareUnit] = useState<TraditionalShareUnit>('ana');
  const [convShareBaseVal, setConvShareBaseVal] = useState('33');
  const [convShareBaseUnit, setConvShareBaseUnit] =
    useState<CalculatorAreaUnit>('shotok');

  // Tool 3: Ana-Ganda Converter
  const [agMode, setAgMode] = useState<'to-fraction' | 'from-fraction'>('to-fraction');
  const [agParts, setAgParts] = useState({
    ana: '4',
    ganda: '10',
    kora: '2',
    kranti: '1',
    til: '10',
  });
  const [agFracExpr, setAgFracExpr] = useState('1/4');
  const [agDagVal, setAgDagVal] = useState('40');
  const [agDagUnit, setAgDagUnit] = useState<CalculatorAreaUnit>('shotok');

  // Tool 4: Ratio Split
  const [ratioTotalVal, setRatioTotalVal] = useState('30');
  const [ratioTotalUnit, setRatioTotalUnit] = useState<CalculatorAreaUnit>('shotok');
  const [ratioRows, setRatioRows] = useState<
    Array<{ id: string; label: string; ratio: string }>
  >([
    { id: 'r1', label: 'করিম', ratio: '3' },
    { id: 'r2', label: 'রহিম', ratio: '2' },
    { id: 'r3', label: 'সালমা', ratio: '1' },
  ]);

  // Tool 5: My share in the dag
  const [myDagVal, setMyDagVal] = useState('40');
  const [myDagUnit, setMyDagUnit] = useState<CalculatorAreaUnit>('shotok');
  const [myDagNo, setMyDagNo] = useState('২৪৫');
  const [myShareInputMode, setMyShareInputMode] = useState<'expr' | 'ana'>('expr');
  const [myShareExpr, setMyShareExpr] = useState('1/4');
  const [myShareAna, setMyShareAna] = useState({
    ana: '4',
    ganda: '0',
    kora: '0',
    kranti: '0',
    til: '0',
  });

  // Tool 6: Hissa Calculator
  const [hissaDagVal, setHissaDagVal] = useState('32');
  const [hissaDagUnit, setHissaDagUnit] = useState<CalculatorAreaUnit>('shotok');
  const [hissaItems, setHissaItems] = useState<
    Array<{
      id: string;
      label: string;
      mode: 'fraction' | 'ana-ganda' | 'percent';
      fractionText: string;
      percentText: string;
      ana: { ana: string; ganda: string; kora: string; kranti: string; til: string };
    }>
  >([
    {
      id: 'h1',
      label: 'শরিক ১',
      mode: 'ana-ganda',
      fractionText: '1/2',
      percentText: '50',
      ana: { ana: '8', ganda: '0', kora: '0', kranti: '0', til: '0' },
    },
    {
      id: 'h2',
      label: 'শরিক ২',
      mode: 'fraction',
      fractionText: '1/4',
      percentText: '25',
      ana: emptyAna(),
    },
    {
      id: 'h3',
      label: 'শরিক ৩',
      mode: 'ana-ganda',
      fractionText: '1/4',
      percentText: '25',
      ana: { ana: '4', ganda: '0', kora: '0', kranti: '0', til: '0' },
    },
  ]);

  // Tool 7: Tofsil Distribution
  const [tofDagNo, setTofDagNo] = useState('৫১২');
  const [tofKhatianNo, setTofKhatianNo] = useState('১১৮');
  const [tofTotalVal, setTofTotalVal] = useState('48');
  const [tofTotalUnit, setTofTotalUnit] = useState<CalculatorAreaUnit>('shotok');
  const [tofPeople, setTofPeople] = useState<
    Array<{
      id: string;
      name: string;
      mode: 'fraction' | 'ana-ganda' | 'ratio' | 'percent';
      valueText: string;
      ana: { ana: string; ganda: string; kora: string; kranti: string; til: string };
    }>
  >([
    {
      id: 't1',
      name: 'আব্দুল করিম',
      mode: 'fraction',
      valueText: '1/2',
      ana: emptyAna(),
    },
    {
      id: 't2',
      name: 'জয়নব বেগম',
      mode: 'ana-ganda',
      valueText: '1/4',
      ana: { ana: '4', ganda: '0', kora: '0', kranti: '0', til: '0' },
    },
    {
      id: 't3',
      name: 'মোঃ সাইফুল',
      mode: 'percent',
      valueText: '25',
      ana: emptyAna(),
    },
  ]);

  const notifySaved = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 2600);
  };

  /* -------------------- Computed Tool Results -------------------- */

  const tool1Result = useMemo(() => {
    switch (shapeKind) {
      case 'triangle':
        return calcTriangleFromSides(
          numInputVal(tA),
          numInputVal(tB),
          numInputVal(tC),
          sideUnit,
          unitProfile
        );
      case 'rectangle':
        return calcRectangleFromSides(
          numInputVal(rL),
          numInputVal(rW),
          sideUnit,
          unitProfile
        );
      case 'quad-diag':
        return calcQuadFromSidesAndDiagonal(
          numInputVal(qAB),
          numInputVal(qBC),
          numInputVal(qCD),
          numInputVal(qDA),
          numInputVal(qDiag),
          sideUnit,
          unitProfile
        );
      case 'quad-angle':
        return calcQuadFromSidesAndAngle(
          numInputVal(qAB),
          numInputVal(qBC),
          numInputVal(qCD),
          numInputVal(qDA),
          numInputVal(qAngle),
          sideUnit,
          unitProfile
        );
      case 'trapezium':
        return calcTrapeziumArea(
          numInputVal(trapA),
          numInputVal(trapB),
          numInputVal(trapH),
          sideUnit,
          unitProfile
        );
    }
  }, [
    qAB,
    qAngle,
    qBC,
    qCD,
    qDA,
    qDiag,
    rL,
    rW,
    shapeKind,
    sideUnit,
    tA,
    tB,
    tC,
    trapA,
    trapB,
    trapH,
    unitProfile,
  ]);

  const convAreaRes = useMemo(
    () =>
      convertAllAreaUnits(
        Math.max(0, numInputVal(convAreaVal) || 0),
        convAreaUnit,
        unitProfile
      ),
    [convAreaVal, convAreaUnit, unitProfile]
  );

  const convLenRes = useMemo(
    () =>
      convertAllLengthUnits(
        Math.max(0, numInputVal(convLenVal) || 0),
        convLenUnit
      ),
    [convLenVal, convLenUnit]
  );

  const convShareRes = useMemo(() => {
    const baseSqFt = calcAreaToSqFt(
      Math.max(0, numInputVal(convShareBaseVal) || 0),
      convShareBaseUnit,
      unitProfile
    );
    return convertTraditionalShareUnit(
      Math.max(0, numInputVal(convShareVal) || 0),
      convShareUnit,
      baseSqFt,
      unitProfile
    );
  }, [convShareBaseUnit, convShareBaseVal, convShareUnit, convShareVal, unitProfile]);

  const agResult = useMemo(() => {
    const dagSqFt = calcAreaToSqFt(
      Math.max(0, numInputVal(agDagVal) || 0),
      agDagUnit,
      unitProfile
    );
    if (agMode === 'to-fraction') {
      const conv = anaGandaToFraction(toAnaParts(agParts));
      const areaSqFt = dagSqFt > 0 ? dagSqFt * conv.fraction : 0;
      return {
        valid: conv.valid,
        error: lang === 'bn' ? conv.errorBn : conv.errorEn,
        fraction: conv.fraction,
        percent: conv.percent,
        simplifiedFraction: conv.simplifiedFraction,
        totalTil: conv.totalTil,
        parts: toAnaParts(agParts),
        areaSqFt,
        breakdown: computeAreaBreakdown(areaSqFt, unitProfile),
      };
    }
    const parsed = parseShareExpression(agFracExpr);
    if (parsed === null) {
      return {
        valid: false,
        error:
          lang === 'bn'
            ? 'সঠিক ভগ্নাংশ, দশমিক বা % লিখুন (যেমন ১/৪, ০.২৫, ২৫%)।'
            : 'Enter valid fraction, decimal or % (e.g. 1/4, 0.25, 25%).',
        fraction: 0,
        percent: 0,
        simplifiedFraction: '0/1',
        totalTil: 0,
        parts: { ana: 0, ganda: 0, kora: 0, kranti: 0, til: 0 },
        areaSqFt: 0,
        breakdown: computeAreaBreakdown(0, unitProfile),
      };
    }
    const conv = fractionToAnaGanda(parsed);
    const areaSqFt = dagSqFt > 0 ? dagSqFt * parsed : 0;
    return {
      valid: true,
      fraction: parsed,
      percent: parsed * 100,
      simplifiedFraction: agFracExpr.trim(),
      totalTil: conv.exactTil,
      parts: conv.parts,
      areaSqFt,
      breakdown: computeAreaBreakdown(areaSqFt, unitProfile),
    };
  }, [agDagUnit, agDagVal, agFracExpr, agMode, agParts, lang, unitProfile]);

  const ratioResult = useMemo(() => {
    const totalSqFt = calcAreaToSqFt(
      Math.max(0, numInputVal(ratioTotalVal) || 0),
      ratioTotalUnit,
      unitProfile
    );
    return computeRatioSplit(
      totalSqFt,
      ratioRows.map((r) => ({
        label: r.label,
        ratio: parseLocalizedNumber(r.ratio) || 0,
      })),
      unitProfile
    );
  }, [ratioRows, ratioTotalUnit, ratioTotalVal, unitProfile]);

  const myShareResult = useMemo(() => {
    const totalSqFt = calcAreaToSqFt(
      Math.max(0, numInputVal(myDagVal) || 0),
      myDagUnit,
      unitProfile
    );
    let frac = 0;
    if (myShareInputMode === 'ana') {
      const conv = anaGandaToFraction(toAnaParts(myShareAna));
      frac = conv.valid ? conv.fraction : -1;
    } else {
      const parsed = parseShareExpression(myShareExpr);
      frac = parsed === null ? -1 : parsed;
    }
    return computeMyShareInDag(totalSqFt, frac, unitProfile);
  }, [myDagUnit, myDagVal, myShareAna, myShareExpr, myShareInputMode, unitProfile]);

  const hissaResult = useMemo(() => {
    const totalSqFt = calcAreaToSqFt(
      Math.max(0, numInputVal(hissaDagVal) || 0),
      hissaDagUnit,
      unitProfile
    );
    const inputs: HissaEntryInput[] = hissaItems.map((it) => ({
      label: it.label,
      mode: it.mode,
      fractionText: it.fractionText,
      percentText: it.percentText,
      anaGanda: toAnaParts(it.ana),
    }));
    return computeHissaDistribution(totalSqFt, inputs, unitProfile);
  }, [hissaDagUnit, hissaDagVal, hissaItems, unitProfile]);

  const tofsilResult = useMemo(() => {
    const totalSqFt = calcAreaToSqFt(
      Math.max(0, numInputVal(tofTotalVal) || 0),
      tofTotalUnit,
      unitProfile
    );
    const inputs: TofsilPersonInput[] = tofPeople.map((p) => ({
      name: p.name,
      mode: p.mode,
      valueText: p.valueText,
      anaGanda: toAnaParts(p.ana),
    }));
    return computeTofsilDistribution(
      totalSqFt,
      tofDagNo,
      tofKhatianNo,
      inputs,
      lang,
      unitProfile
    );
  }, [lang, tofDagNo, tofKhatianNo, tofPeople, tofTotalUnit, tofTotalVal, unitProfile]);

  if (!open) return null;

  /* -------------------- Reusable Sub-Renderers -------------------- */

  const renderSixUnitCard = (b: AreaBreakdown, highlightTitle?: string) => (
    <div className="space-y-2">
      {highlightTitle && (
        <div className="text-xs font-bold text-[#0F5132] dark:text-emerald-400">
          {highlightTitle}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 tabular-nums">
        <div className="rounded-xl border border-[#0F5132]/40 dark:border-emerald-700 bg-[#0F5132]/8 dark:bg-emerald-950/40 p-2.5">
          <div className="text-[11px] text-[#4A5550] dark:text-slate-300">
            {lang === 'bn' ? 'শতক (Shotok)' : 'Shotok'}
          </div>
          <div className="text-base sm:text-lg font-bold text-[#0F5132] dark:text-emerald-400">
            {formatNumber(b.shotok, 3, lang)}
          </div>
        </div>
        <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
          <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
            {lang === 'bn'
              ? `কাঠা (${formatNumber(unitProfile.kathaSqFt, 0, lang)} ব.ফু.)`
              : `Katha (${unitProfile.kathaSqFt} sq ft)`}
          </div>
          <div className="text-base sm:text-lg font-bold text-[#141A17] dark:text-white">
            {formatNumber(b.katha, 3, lang)}
          </div>
        </div>
        <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
          <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
            {lang === 'bn'
              ? `বিঘা (${formatNumber(unitProfile.bighaShotok, 1, lang)} শতক)`
              : `Bigha (${unitProfile.bighaShotok.toFixed(1)} sh)`}
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
            {formatNumber(b.sqFt, 2, lang)}
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
    </div>
  );

  const renderAnaInputs = (
    value: { ana: string; ganda: string; kora: string; kranti: string; til: string },
    onChange: (next: {
      ana: string;
      ganda: string;
      kora: string;
      kranti: string;
      til: string;
    }) => void
  ) => (
    <div className="grid grid-cols-5 gap-1.5">
      {(
        [
          ['ana', lang === 'bn' ? 'আনা' : 'Ana'],
          ['ganda', lang === 'bn' ? 'গণ্ডা' : 'Ganda'],
          ['kora', lang === 'bn' ? 'কড়া' : 'Kora'],
          ['kranti', lang === 'bn' ? 'ক্রান্তি' : 'Kranti'],
          ['til', lang === 'bn' ? 'তিল' : 'Til'],
        ] as const
      ).map(([k, lbl]) => (
        <label key={k} className="block">
          <span className="block text-[10px] font-semibold text-[#4A5550] dark:text-slate-400 mb-0.5">
            {lbl}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={value[k]}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            className="w-full min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm font-mono-num text-center tabular-nums"
          />
        </label>
      ))}
    </div>
  );

  const fillExample = () => {
    if (activeTool === 'area-sides') {
      setSideUnit('ft');
      if (shapeKind === 'triangle') {
        setTA('30');
        setTB('40');
        setTC('50');
      } else if (shapeKind === 'rectangle') {
        setRL('100');
        setRW('50');
      } else if (shapeKind === 'trapezium') {
        setTrapA('90');
        setTrapB('60');
        setTrapH('45');
      } else {
        setQAB('80');
        setQBC('55');
        setQCD('75');
        setQDA('60');
        setQDiag('98');
        setQAngle('88');
      }
    } else if (activeTool === 'converter') {
      setConvAreaVal('33');
      setConvAreaUnit('shotok');
      setConvLenVal('1');
      setConvLenUnit('chain');
      setConvShareVal('4');
      setConvShareUnit('ana');
      setConvShareBaseVal('33');
      setConvShareBaseUnit('shotok');
    } else if (activeTool === 'ana-ganda') {
      setAgParts({ ana: '4', ganda: '10', kora: '2', kranti: '1', til: '10' });
      setAgFracExpr('1/4');
      setAgDagVal('40');
      setAgDagUnit('shotok');
    } else if (activeTool === 'ratio-split') {
      setRatioTotalVal('30');
      setRatioTotalUnit('shotok');
      setRatioRows([
        { id: 'r1', label: lang === 'bn' ? 'করিম' : 'Karim', ratio: '3' },
        { id: 'r2', label: lang === 'bn' ? 'রহিম' : 'Rahim', ratio: '2' },
        { id: 'r3', label: lang === 'bn' ? 'সালমা' : 'Salma', ratio: '1' },
      ]);
    } else if (activeTool === 'my-share') {
      setMyDagNo('২৪৫');
      setMyDagVal('40');
      setMyDagUnit('shotok');
      setMyShareExpr('1/4');
      setMyShareAna({ ana: '4', ganda: '0', kora: '0', kranti: '0', til: '0' });
    } else if (activeTool === 'hissa') {
      setHissaDagVal('32');
      setHissaDagUnit('shotok');
      setHissaItems([
        {
          id: 'h1',
          label: lang === 'bn' ? 'শরিক ১' : 'Owner 1',
          mode: 'ana-ganda',
          fractionText: '1/2',
          percentText: '50',
          ana: { ana: '8', ganda: '0', kora: '0', kranti: '0', til: '0' },
        },
        {
          id: 'h2',
          label: lang === 'bn' ? 'শরিক ২' : 'Owner 2',
          mode: 'fraction',
          fractionText: '1/4',
          percentText: '25',
          ana: emptyAna(),
        },
        {
          id: 'h3',
          label: lang === 'bn' ? 'শরিক ৩' : 'Owner 3',
          mode: 'ana-ganda',
          fractionText: '1/4',
          percentText: '25',
          ana: { ana: '4', ganda: '0', kora: '0', kranti: '0', til: '0' },
        },
      ]);
    } else if (activeTool === 'tofsil') {
      setTofDagNo('৫১২');
      setTofKhatianNo('১১৮');
      setTofTotalVal('48');
      setTofTotalUnit('shotok');
      setTofPeople([
        {
          id: 't1',
          name: lang === 'bn' ? 'আব্দুল করিম' : 'Abdul Karim',
          mode: 'fraction',
          valueText: '1/2',
          ana: emptyAna(),
        },
        {
          id: 't2',
          name: lang === 'bn' ? 'জয়নব বেগম' : 'Joynab Begum',
          mode: 'ana-ganda',
          valueText: '1/4',
          ana: { ana: '4', ganda: '0', kora: '0', kranti: '0', til: '0' },
        },
        {
          id: 't3',
          name: lang === 'bn' ? 'মোঃ সাইফুল' : 'Md. Saiful',
          mode: 'percent',
          valueText: '25',
          ana: emptyAna(),
        },
      ]);
    }
    notifySaved(lang === 'bn' ? 'নমুনা মান বসানো হয়েছে' : 'Example values loaded');
  };

  const handleSaveCurrentToPlotAndReport = () => {
    const now = Date.now();
    const id = `calc-${now}-${Math.random().toString(36).slice(2, 6)}`;

    if (activeTool === 'area-sides') {
      if (!tool1Result.valid) return;
      onAddToPlotAndReport({
        polygonPoints: tool1Result.points.length >= 3 ? tool1Result.points : undefined,
        plotLabel:
          lang === 'bn'
            ? `ক্যালকুলেটর (${formatNumber(tool1Result.breakdown.shotok, 2, 'bn')} শতক)`
            : `Calc (${tool1Result.breakdown.shotok.toFixed(2)} sh)`,
        record: {
          id,
          createdAt: now,
          tool: 'area-sides',
          title:
            lang === 'bn' ? 'বাহু থেকে জমির ক্ষেত্রফল' : 'Area from Measured Sides',
          summary: `${formatNumber(tool1Result.breakdown.shotok, 3, lang)} ${
            lang === 'bn' ? 'শতক' : 'shotok'
          } (${formatNumber(tool1Result.areaSqFt, 1, lang)} ${
            lang === 'bn' ? 'ব.ফু.' : 'sq ft'
          })`,
          areaSqFt: tool1Result.areaSqFt,
        },
      });
      notifySaved(
        lang === 'bn'
          ? 'দাগ ক্যানভাস ও রিপোর্টে যুক্ত হয়েছে'
          : 'Added to Canvas Plot & Report'
      );
      return;
    }

    if (activeTool === 'converter') {
      const sqFt =
        convCat === 'area'
          ? convAreaRes.sqFt
          : convCat === 'share' && convShareRes.areaBreakdown
          ? convShareRes.areaBreakdown.sqFt
          : 0;
      const summary =
        convCat === 'area'
          ? `${formatNumber(convAreaRes.shotok, 3, lang)} ${
              lang === 'bn' ? 'শতক' : 'sh'
            } · ${formatNumber(convAreaRes.katha, 3, lang)} ${
              lang === 'bn' ? 'কাঠা' : 'ka'
            }`
          : convCat === 'length'
          ? `${formatNumber(convLenRes.ft, 2, lang)} ${
              lang === 'bn' ? 'ফুট' : 'ft'
            } · ${formatNumber(convLenRes.chain, 3, lang)} ${
              lang === 'bn' ? 'চেইন' : 'ch'
            }`
          : `${formatNumber(convShareRes.percent, 2, lang)}% (${formatAnaGandaText(
              convShareRes.normalizedParts,
              lang
            )})`;
      onAddToPlotAndReport({
        record: {
          id,
          createdAt: now,
          tool: 'converter',
          title: lang === 'bn' ? 'একক রূপান্তর হিসাব' : 'Unit Conversion',
          summary,
          areaSqFt: sqFt,
        },
      });
      notifySaved(lang === 'bn' ? 'রিপোর্টে যুক্ত হয়েছে' : 'Added to Report');
      return;
    }

    if (activeTool === 'ana-ganda') {
      if (!agResult.valid) return;
      onAddToPlotAndReport({
        record: {
          id,
          createdAt: now,
          tool: 'ana-ganda',
          title: lang === 'bn' ? 'আনা–গণ্ডা হিসাব' : 'Ana-Ganda Calculation',
          summary: `${formatAnaGandaText(agResult.parts, lang)} = ${formatNumber(
            agResult.percent,
            3,
            lang
          )}%${
            agResult.areaSqFt > 0
              ? ` (${formatNumber(agResult.breakdown.shotok, 3, lang)} ${
                  lang === 'bn' ? 'শতক' : 'sh'
                })`
              : ''
          }`,
          areaSqFt: agResult.areaSqFt,
        },
      });
      notifySaved(lang === 'bn' ? 'রিপোর্টে যুক্ত হয়েছে' : 'Added to Report');
      return;
    }

    if (activeTool === 'ratio-split') {
      if (!ratioResult.valid) return;
      const rows: CalculatorTableRow[] = ratioResult.items.map((it) => ({
        label: it.label,
        shareText: `${formatNumber(it.ratio, 2, lang)} (${formatNumber(
          it.percent,
          2,
          lang
        )}%)`,
        sqFt: it.areaSqFt,
        shotok: it.breakdown.shotok,
        katha: it.breakdown.katha,
        bigha: it.breakdown.bigha,
        acre: it.breakdown.acre,
        sqM: it.breakdown.sqM,
      }));
      onAddToPlotAndReport({
        record: {
          id,
          createdAt: now,
          tool: 'ratio-split',
          title: lang === 'bn' ? 'অনুপাতে জমি ভাগ' : 'Ratio Land Split',
          summary: `${formatNumber(rows.length, 0, lang)} ${
            lang === 'bn' ? 'অংশ' : 'parts'
          } · ${formatNumber(
            computeAreaBreakdown(ratioResult.totalAreaSqFt, unitProfile).shotok,
            3,
            lang
          )} ${lang === 'bn' ? 'শতক' : 'sh'}`,
          areaSqFt: ratioResult.totalAreaSqFt,
          rows,
        },
      });
      notifySaved(lang === 'bn' ? 'রিপোর্টে যুক্ত হয়েছে' : 'Added to Report');
      return;
    }

    if (activeTool === 'my-share') {
      if (!myShareResult.valid) return;
      onAddToPlotAndReport({
        record: {
          id,
          createdAt: now,
          tool: 'my-share',
          title:
            lang === 'bn'
              ? `দাগ ${myDagNo || '-'} — আমার অংশ`
              : `Dag ${myDagNo || '-'} — My Share`,
          summary: `${formatNumber(myShareResult.myBreakdown.shotok, 3, lang)} ${
            lang === 'bn' ? 'শতক' : 'sh'
          } (${formatAnaGandaText(myShareResult.anaGanda, lang)})`,
          areaSqFt: myShareResult.myAreaSqFt,
        },
      });
      notifySaved(lang === 'bn' ? 'রিপোর্টে যুক্ত হয়েছে' : 'Added to Report');
      return;
    }

    if (activeTool === 'hissa') {
      if (!hissaResult.valid) return;
      const rows: CalculatorTableRow[] = hissaResult.items.map((it) => ({
        label: it.label,
        shareText: `${formatAnaGandaText(it.anaGanda, lang)} (${formatNumber(
          it.percent,
          2,
          lang
        )}%)`,
        sqFt: it.areaSqFt,
        shotok: it.breakdown.shotok,
        katha: it.breakdown.katha,
        bigha: it.breakdown.bigha,
        acre: it.breakdown.acre,
        sqM: it.breakdown.sqM,
      }));
      onAddToPlotAndReport({
        record: {
          id,
          createdAt: now,
          tool: 'hissa',
          title: lang === 'bn' ? 'হিস্যা ও মোট অংশ বণ্টন' : 'Hissa Distribution',
          summary: `${formatNumber(hissaResult.sumPercent, 2, lang)}% (${formatAnaGandaText(
            hissaResult.sumAnaGanda,
            lang
          )})`,
          areaSqFt: hissaResult.totalDagSqFt,
          rows,
        },
      });
      notifySaved(lang === 'bn' ? 'রিপোর্টে যুক্ত হয়েছে' : 'Added to Report');
      return;
    }

    if (activeTool === 'tofsil' && tofsilResult.valid) {
      onAddToPlotAndReport({
        record: {
          id,
          createdAt: now,
          tool: 'tofsil',
          title:
            lang === 'bn'
              ? `তফসিল বণ্টন (দাগ ${tofDagNo || '-'}, খতিয়ান ${tofKhatianNo || '-'})`
              : `Tofsil (Dag ${tofDagNo || '-'}, Kh ${tofKhatianNo || '-'})`,
          summary: `${formatNumber(tofsilResult.rows.length, 0, lang)} ${
            lang === 'bn' ? 'জন' : 'recipients'
          } · ${formatNumber(tofsilResult.totalBreakdown.shotok, 3, lang)} ${
            lang === 'bn' ? 'শতক' : 'sh'
          }`,
          areaSqFt: tofsilResult.totalAreaSqFt,
          rows: tofsilResult.rows,
        },
      });
      notifySaved(
        lang === 'bn' ? 'তফসিল টেবিল রিপোর্টে যুক্ত হয়েছে' : 'Tofsil Table Added to Report'
      );
    }
  };

  const tabs: Array<{ id: CalculatorToolId; label: string; icon: React.ReactNode }> = [
    {
      id: 'area-sides',
      label: lang === 'bn' ? 'বাহু → ক্ষেত্রফল' : 'Area from Sides',
      icon: <Ruler className="h-4 w-4" />,
    },
    {
      id: 'converter',
      label: lang === 'bn' ? 'একক রূপান্তর' : 'Unit Converter',
      icon: <ArrowLeftRight className="h-4 w-4" />,
    },
    {
      id: 'ana-ganda',
      label: lang === 'bn' ? 'আনা–গণ্ডা' : 'Ana–Ganda',
      icon: <Scale className="h-4 w-4" />,
    },
    {
      id: 'ratio-split',
      label: lang === 'bn' ? 'অনুপাতে ভাগ' : 'Ratio Split',
      icon: <Divide className="h-4 w-4" />,
    },
    {
      id: 'my-share',
      label: lang === 'bn' ? 'দাগে আমার অংশ' : 'My Share in Dag',
      icon: <UserCheck className="h-4 w-4" />,
    },
    {
      id: 'hissa',
      label: lang === 'bn' ? 'হিস্যা যাচাই' : 'Hissa Check',
      icon: <PieChart className="h-4 w-4" />,
    },
    {
      id: 'tofsil',
      label: lang === 'bn' ? 'তফসিল বণ্টন' : 'Tofsil Table',
      icon: <Table2 className="h-4 w-4" />,
    },
  ];

  const canAddCurrent =
    activeTool === 'area-sides'
      ? tool1Result.valid
      : activeTool === 'ana-ganda'
      ? agResult.valid
      : activeTool === 'ratio-split'
      ? ratioResult.valid
      : activeTool === 'my-share'
      ? myShareResult.valid
      : activeTool === 'hissa'
      ? hissaResult.valid
      : activeTool === 'tofsil'
      ? tofsilResult.valid
      : true;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F6F6F2] dark:bg-slate-950 text-[#141A17] dark:text-slate-100">
      {/* Sticky Header */}
      <header className="shrink-0 border-b border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 sm:px-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold hover:bg-[#EAECE7] dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{lang === 'bn' ? 'ফিরুন' : 'Back'}</span>
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0F5132] text-white">
              <Calculator className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base sm:text-lg font-bold">
                {lang === 'bn' ? 'জমি ও হিস্যা ক্যালকুলেটর' : 'Land & Share Calculator'}
              </h1>
              <p className="truncate text-[11px] text-[#4A5550] dark:text-slate-400">
                {lang === 'bn' ? unitProfile.nameBn : unitProfile.nameEn}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fillExample}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#B45309]/40 bg-amber-50 dark:bg-amber-950/40 px-3 text-xs font-bold text-[#B45309] dark:text-amber-300 whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{lang === 'bn' ? 'নমুনা মান' : 'Example'}</span>
          </button>
        </div>

        {/* 7-Tool Horizontal Navigation */}
        <div className="mx-auto mt-2.5 flex max-w-5xl gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTool(tab.id)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTool === tab.id
                  ? 'border-[#0F5132] bg-[#0F5132] text-white'
                  : 'border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 text-[#141A17] dark:text-slate-200 hover:bg-[#EAECE7]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Scrollable Body */}
      <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {savedNotice && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* -------------------- TOOL 1: AREA FROM SIDES -------------------- */}
          {activeTool === 'area-sides' && (
            <section className="space-y-4 rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold">
                  {lang === 'bn' ? 'জমির আকৃতি ও মাপের একক' : 'Plot Shape & Measurement Unit'}
                </h2>
                <select
                  value={sideUnit}
                  onChange={(e) => setSideUnit(e.target.value as CalculatorLinearUnit)}
                  className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-3 text-xs font-semibold"
                >
                  {LINEAR_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {lang === 'bn' ? u.bn : u.en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {(
                  [
                    ['quad-diag', lang === 'bn' ? '৪ বাহু + কর্ণ' : '4 Sides + Diag'],
                    ['quad-angle', lang === 'bn' ? '৪ বাহু + কোণ' : '4 Sides + Angle'],
                    ['triangle', lang === 'bn' ? 'ত্রিভুজ (৩ বাহু)' : 'Triangle (3)'],
                    ['rectangle', lang === 'bn' ? 'আয়তক্ষেত্র' : 'Rectangle'],
                    ['trapezium', lang === 'bn' ? 'ট্রাপিজিয়াম' : 'Trapezium'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setShapeKind(id)}
                    className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold ${
                      shapeKind === id
                        ? 'border-[#0F5132] bg-[#0F5132]/10 text-[#0F5132] dark:text-emerald-300'
                        : 'border-[#D4DBD6] dark:border-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {shapeKind === 'triangle' && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    [lang === 'bn' ? '১ম বাহু (a)' : 'Side a', tA, setTA],
                    [lang === 'bn' ? '২য় বাহু (b)' : 'Side b', tB, setTB],
                    [lang === 'bn' ? '৩য় বাহু (c)' : 'Side c', tC, setTC],
                  ].map(([lbl, val, setter]) => (
                    <label key={lbl as string} className="block">
                      <span className="block text-xs font-medium mb-1">{lbl as string}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={val as string}
                        onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                      />
                    </label>
                  ))}
                </div>
              )}

              {shapeKind === 'rectangle' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="block text-xs font-medium mb-1">
                      {lang === 'bn' ? 'দৈর্ঘ্য (Length)' : 'Length'}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rL}
                      onChange={(e) => setRL(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1">
                      {lang === 'bn' ? 'প্রস্থ (Width)' : 'Width'}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rW}
                      onChange={(e) => setRW(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                    />
                  </label>
                </div>
              )}

              {(shapeKind === 'quad-diag' || shapeKind === 'quad-angle') && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    [lang === 'bn' ? 'উত্তর / AB' : 'Side AB', qAB, setQAB],
                    [lang === 'bn' ? 'পূর্ব / BC' : 'Side BC', qBC, setQBC],
                    [lang === 'bn' ? 'দক্ষিণ / CD' : 'Side CD', qCD, setQCD],
                    [lang === 'bn' ? 'পশ্চিম / DA' : 'Side DA', qDA, setQDA],
                  ].map(([lbl, val, setter]) => (
                    <label key={lbl as string} className="block">
                      <span className="block text-xs font-medium mb-1">{lbl as string}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={val as string}
                        onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                      />
                    </label>
                  ))}
                  {shapeKind === 'quad-diag' ? (
                    <label className="block col-span-2 sm:col-span-1">
                      <span className="block text-xs font-medium mb-1 text-[#B45309]">
                        {lang === 'bn' ? 'কর্ণ AC' : 'Diagonal AC'}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={qDiag}
                        onChange={(e) => setQDiag(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl border border-[#B45309]/50 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                      />
                    </label>
                  ) : (
                    <label className="block col-span-2 sm:col-span-1">
                      <span className="flex items-center gap-1 text-xs font-medium mb-1 text-[#B45309]">
                        <Compass className="h-3 w-3" />
                        <span>{lang === 'bn' ? 'কোণ A (°)' : 'Angle A (°)'}</span>
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={qAngle}
                        onChange={(e) => setQAngle(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl border border-[#B45309]/50 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                      />
                    </label>
                  )}
                </div>
              )}

              {shapeKind === 'trapezium' && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    [lang === 'bn' ? 'সমান্তরাল বাহু ১' : 'Parallel A', trapA, setTrapA],
                    [lang === 'bn' ? 'সমান্তরাল বাহু ২' : 'Parallel B', trapB, setTrapB],
                    [lang === 'bn' ? 'লম্ব উচ্চতা' : 'Height (h)', trapH, setTrapH],
                  ].map(([lbl, val, setter]) => (
                    <label key={lbl as string} className="block">
                      <span className="block text-xs font-medium mb-1">{lbl as string}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={val as string}
                        onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                      />
                    </label>
                  ))}
                </div>
              )}

              {!tool1Result.valid ? (
                <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  {lang === 'bn' ? tool1Result.errorBn : tool1Result.errorEn}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {renderSixUnitCard(
                    tool1Result.breakdown,
                    lang === 'bn' ? 'পরিমাপের ফলাফল' : 'Calculated Area Result'
                  )}
                  <div className="flex items-center justify-between rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-3 py-2 text-xs tabular-nums">
                    <span>{lang === 'bn' ? 'মোট পরিসীমা (Perimeter)' : 'Perimeter'}</span>
                    <span className="font-bold">
                      {formatNumber(tool1Result.perimeterFt, 2, lang)}{' '}
                      {lang === 'bn' ? 'ফুট' : 'ft'} (
                      {formatNumber(tool1Result.perimeterFt / 66, 3, lang)}{' '}
                      {lang === 'bn' ? 'চেইন' : 'ch'})
                    </span>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* -------------------- TOOL 2: UNIT CONVERTER -------------------- */}
          {activeTool === 'converter' && (
            <section className="space-y-4 rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#EAECE7] dark:bg-slate-800 p-1">
                {(
                  [
                    ['area', lang === 'bn' ? 'জমির ক্ষেত্রফল' : 'Land Area'],
                    ['length', lang === 'bn' ? 'দৈর্ঘ্যের একক' : 'Length Units'],
                    ['share', lang === 'bn' ? 'আনা–তিল অংশ' : 'Ana–Til Share'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setConvCat(id)}
                    className={`min-h-[38px] rounded-lg text-xs font-bold ${
                      convCat === id
                        ? 'bg-white dark:bg-slate-900 text-[#0F5132] dark:text-emerald-400 shadow-sm'
                        : 'text-[#4A5550] dark:text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {convCat === 'area' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-[1fr_135px] gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={convAreaVal}
                      onChange={(e) => setConvAreaVal(e.target.value)}
                      className="min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base font-bold font-mono-num"
                    />
                    <select
                      value={convAreaUnit}
                      onChange={(e) =>
                        setConvAreaUnit(e.target.value as CalculatorAreaUnit)
                      }
                      className="min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold"
                    >
                      {AREA_UNITS.map((u) => (
                        <option key={u.id} value={u.id}>
                          {lang === 'bn' ? u.bn : u.en}
                        </option>
                      ))}
                    </select>
                  </div>

                  {renderSixUnitCard({
                    sqFt: convAreaRes.sqFt,
                    sqM: convAreaRes.sqM,
                    shotok: convAreaRes.shotok,
                    katha: convAreaRes.katha,
                    bigha: convAreaRes.bigha,
                    acre: convAreaRes.acre,
                  })}

                  <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-3 py-2 text-xs flex justify-between tabular-nums">
                    <span>{lang === 'bn' ? 'ডেসিমেল (Decimal)' : 'Decimal'}</span>
                    <span className="font-bold">
                      {formatNumber(convAreaRes.decimal, 3, lang)}
                    </span>
                  </div>
                </div>
              )}

              {convCat === 'length' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-[1fr_135px] gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={convLenVal}
                      onChange={(e) => setConvLenVal(e.target.value)}
                      className="min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base font-bold font-mono-num"
                    />
                    <select
                      value={convLenUnit}
                      onChange={(e) =>
                        setConvLenUnit(e.target.value as CalculatorLinearUnit)
                      }
                      className="min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold"
                    >
                      {LINEAR_UNITS.map((u) => (
                        <option key={u.id} value={u.id}>
                          {lang === 'bn' ? u.bn : u.en}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 tabular-nums">
                    {LINEAR_UNITS.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5"
                      >
                        <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                          {lang === 'bn' ? u.bn : u.en}
                        </div>
                        <div className="text-base font-bold">
                          {formatNumber(convLenRes[u.id], 3, lang)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {convCat === 'share' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-[1fr_155px] gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={convShareVal}
                      onChange={(e) => setConvShareVal(e.target.value)}
                      className="min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base font-bold font-mono-num"
                    />
                    <select
                      value={convShareUnit}
                      onChange={(e) =>
                        setConvShareUnit(e.target.value as TraditionalShareUnit)
                      }
                      className="min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold"
                    >
                      {SHARE_UNITS.map((u) => (
                        <option key={u.id} value={u.id}>
                          {lang === 'bn' ? u.bn : u.en}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 tabular-nums">
                    <div className="rounded-xl border border-[#0F5132]/40 bg-[#0F5132]/8 dark:bg-emerald-950/40 p-2.5">
                      <div className="text-[11px] text-[#4A5550] dark:text-slate-300">
                        {lang === 'bn' ? 'শতাংশ (%)' : 'Percentage'}
                      </div>
                      <div className="text-base font-bold text-[#0F5132] dark:text-emerald-400">
                        {formatNumber(convShareRes.percent, 4, lang)}%
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5">
                      <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                        {lang === 'bn' ? 'দশমিক অংশ' : 'Fraction'}
                      </div>
                      <div className="text-base font-bold">
                        {formatNumber(convShareRes.fraction, 5, lang)}
                      </div>
                    </div>
                    {SHARE_UNITS.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5"
                      >
                        <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                          {lang === 'bn' ? u.bn : u.en}
                        </div>
                        <div className="text-base font-bold">
                          {formatNumber(convShareRes[u.id], 3, lang)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-3 space-y-2">
                    <div className="text-xs font-semibold">
                      {lang === 'bn'
                        ? 'দাগের মোট জমি দিলে এই অংশে কতটুকু জমি হবে:'
                        : 'Optional: Total plot area to get 6-unit land area:'}
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={convShareBaseVal}
                        onChange={(e) => setConvShareBaseVal(e.target.value)}
                        className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-sm font-mono-num"
                      />
                      <select
                        value={convShareBaseUnit}
                        onChange={(e) =>
                          setConvShareBaseUnit(e.target.value as CalculatorAreaUnit)
                        }
                        className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                      >
                        {AREA_UNITS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {lang === 'bn' ? u.bn : u.en}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {convShareRes.areaBreakdown &&
                    renderSixUnitCard(convShareRes.areaBreakdown)}
                </div>
              )}
            </section>
          )}

          {/* -------------------- TOOL 3: ANA-GANDA CONVERTER -------------------- */}
          {activeTool === 'ana-ganda' && (
            <section className="space-y-4 rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#EAECE7] dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setAgMode('to-fraction')}
                  className={`min-h-[38px] rounded-lg text-xs font-bold ${
                    agMode === 'to-fraction'
                      ? 'bg-white dark:bg-slate-900 text-[#0F5132] dark:text-emerald-400 shadow-sm'
                      : 'text-[#4A5550] dark:text-slate-400'
                  }`}
                >
                  {lang === 'bn' ? 'আনা–গণ্ডা → ভগ্নাংশ / %' : 'Ana–Ganda → Fraction / %'}
                </button>
                <button
                  type="button"
                  onClick={() => setAgMode('from-fraction')}
                  className={`min-h-[38px] rounded-lg text-xs font-bold ${
                    agMode === 'from-fraction'
                      ? 'bg-white dark:bg-slate-900 text-[#0F5132] dark:text-emerald-400 shadow-sm'
                      : 'text-[#4A5550] dark:text-slate-400'
                  }`}
                >
                  {lang === 'bn' ? 'ভগ্নাংশ / % → আনা–গণ্ডা' : 'Fraction / % → Ana–Ganda'}
                </button>
              </div>

              {agMode === 'to-fraction' ? (
                renderAnaInputs(agParts, setAgParts)
              ) : (
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn'
                      ? 'ভগ্নাংশ, দশমিক বা শতাংশ লিখুন (যেমন ১/৪, ০.২৫, ২৫%)'
                      : 'Enter fraction, decimal, or % (e.g. 1/4, 0.25, 25%)'}
                  </span>
                  <input
                    type="text"
                    value={agFracExpr}
                    onChange={(e) => setAgFracExpr(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base font-bold font-mono-num"
                  />
                </label>
              )}

              <div className="grid grid-cols-[1fr_130px] gap-2">
                <label className="block">
                  <span className="block text-[11px] font-medium mb-1 text-[#4A5550] dark:text-slate-400">
                    {lang === 'bn'
                      ? 'মোট দাগের জমি (৬ এককে অংশের জমি দেখতে)'
                      : 'Total plot area (for 6-unit breakdown)'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={agDagVal}
                    onChange={(e) => setAgDagVal(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium mb-1 text-[#4A5550] dark:text-slate-400">
                    {lang === 'bn' ? 'একক' : 'Unit'}
                  </span>
                  <select
                    value={agDagUnit}
                    onChange={(e) => setAgDagUnit(e.target.value as CalculatorAreaUnit)}
                    className="w-full min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold"
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {lang === 'bn' ? u.bn : u.en}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!agResult.valid ? (
                <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  {agResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 tabular-nums">
                    <div className="rounded-xl border border-[#0F5132]/40 bg-[#0F5132]/8 dark:bg-emerald-950/40 p-3">
                      <div className="text-[11px] text-[#4A5550] dark:text-slate-300">
                        {lang === 'bn' ? 'আনা–গণ্ডা–কড়া–ক্রান্তি–তিল' : 'Traditional Format'}
                      </div>
                      <div className="text-sm font-bold text-[#0F5132] dark:text-emerald-300 mt-0.5">
                        {formatAnaGandaText(agResult.parts, lang)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-3">
                      <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                        {lang === 'bn' ? 'ভগ্নাংশ ও দশমিক' : 'Fraction & Decimal'}
                      </div>
                      <div className="text-sm font-bold mt-0.5">
                        {agResult.simplifiedFraction} ({formatNumber(agResult.fraction, 5, lang)})
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-3">
                      <div className="text-[11px] text-[#4A5550] dark:text-slate-400">
                        {lang === 'bn' ? 'শতাংশ (%)' : 'Percentage'}
                      </div>
                      <div className="text-sm font-bold mt-0.5">
                        {formatNumber(agResult.percent, 4, lang)}%
                      </div>
                    </div>
                  </div>
                  {agResult.areaSqFt > 0 && renderSixUnitCard(agResult.breakdown)}
                </div>
              )}
            </section>
          )}

          {/* -------------------- TOOL 4: RATIO SPLIT -------------------- */}
          {activeTool === 'ratio-split' && (
            <section className="space-y-4 rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="grid grid-cols-[1fr_130px] gap-2">
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'মোট জমির পরিমাণ' : 'Total Plot Area'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ratioTotalVal}
                    onChange={(e) => setRatioTotalVal(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base font-bold font-mono-num"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'একক' : 'Unit'}
                  </span>
                  <select
                    value={ratioTotalUnit}
                    onChange={(e) =>
                      setRatioTotalUnit(e.target.value as CalculatorAreaUnit)
                    }
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold"
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {lang === 'bn' ? u.bn : u.en}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    {lang === 'bn' ? 'প্রাপক ও অনুপাত তালিকা' : 'Recipients & Ratios'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setRatioRows((prev) => [
                        ...prev,
                        {
                          id: `r-${Date.now()}`,
                          label:
                            lang === 'bn'
                              ? `ব্যক্তি ${formatNumber(prev.length + 1, 0, 'bn')}`
                              : `Person ${prev.length + 1}`,
                          ratio: '1',
                        },
                      ])
                    }
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#0F5132]/10 px-2.5 text-xs font-bold text-[#0F5132] dark:text-emerald-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'আরও যোগ' : 'Add'}</span>
                  </button>
                </div>

                {ratioRows.map((row, idx) => (
                  <div key={row.id} className="grid grid-cols-[1fr_92px_40px] gap-2">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) =>
                        setRatioRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, label: e.target.value } : r
                          )
                        )
                      }
                      placeholder={
                        lang === 'bn' ? `ব্যক্তি ${idx + 1}` : `Person ${idx + 1}`
                      }
                      className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.ratio}
                      onChange={(e) =>
                        setRatioRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, ratio: e.target.value } : r
                          )
                        )
                      }
                      className="min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-sm font-bold font-mono-num text-center"
                    />
                    <button
                      type="button"
                      disabled={ratioRows.length <= 1}
                      onClick={() =>
                        setRatioRows((prev) => prev.filter((r) => r.id !== row.id))
                      }
                      className="flex h-[40px] w-[40px] items-center justify-center rounded-xl border border-red-200 dark:border-red-900 text-red-600 disabled:opacity-30"
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {!ratioResult.valid ? (
                <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  {lang === 'bn' ? ratioResult.errorBn : ratioResult.errorEn}
                </div>
              ) : (
                <div className="space-y-3">
                  {ratioResult.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold tabular-nums">
                        <span>
                          {it.label} —{' '}
                          <span className="text-[#B45309]">
                            {lang === 'bn' ? 'অনুপাত' : 'Ratio'}:{' '}
                            {formatNumber(it.ratio, 2, lang)}/{formatNumber(ratioResult.totalRatio, 2, lang)} (
                            {formatNumber(it.percent, 2, lang)}%)
                          </span>
                        </span>
                        <span className="text-[#0F5132] dark:text-emerald-400">
                          {formatAnaGandaText(it.anaGanda, lang)}
                        </span>
                      </div>
                      {renderSixUnitCard(it.breakdown)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* -------------------- TOOL 5: MY SHARE IN THE DAG -------------------- */}
          {activeTool === 'my-share' && (
            <section className="space-y-4 rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'দাগ নম্বর (ঐচ্ছিক)' : 'Dag No (Optional)'}
                  </span>
                  <input
                    type="text"
                    value={myDagNo}
                    onChange={(e) => setMyDagNo(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'দাগের মোট জমি' : 'Total Dag Area'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={myDagVal}
                    onChange={(e) => setMyDagVal(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-bold font-mono-num"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'একক' : 'Unit'}
                  </span>
                  <select
                    value={myDagUnit}
                    onChange={(e) => setMyDagUnit(e.target.value as CalculatorAreaUnit)}
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold"
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {lang === 'bn' ? u.bn : u.en}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#EAECE7] dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setMyShareInputMode('expr')}
                  className={`min-h-[36px] rounded-lg text-xs font-bold ${
                    myShareInputMode === 'expr'
                      ? 'bg-white dark:bg-slate-900 text-[#0F5132] dark:text-emerald-400 shadow-sm'
                      : 'text-[#4A5550] dark:text-slate-400'
                  }`}
                >
                  {lang === 'bn' ? 'ভগ্নাংশ / দশমিক / %' : 'Fraction / Decimal / %'}
                </button>
                <button
                  type="button"
                  onClick={() => setMyShareInputMode('ana')}
                  className={`min-h-[36px] rounded-lg text-xs font-bold ${
                    myShareInputMode === 'ana'
                      ? 'bg-white dark:bg-slate-900 text-[#0F5132] dark:text-emerald-400 shadow-sm'
                      : 'text-[#4A5550] dark:text-slate-400'
                  }`}
                >
                  {lang === 'bn' ? 'আনা–গণ্ডা–কড়া–ক্রান্তি–তিল' : 'Ana–Ganda–Kora'}
                </button>
              </div>

              {myShareInputMode === 'expr' ? (
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn'
                      ? 'আমার অংশ লিখুন (যেমন ১/৪, ০.২৫, ২৫%)'
                      : 'Enter my share (e.g. 1/4, 0.25, 25%)'}
                  </span>
                  <input
                    type="text"
                    value={myShareExpr}
                    onChange={(e) => setMyShareExpr(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base font-bold font-mono-num"
                  />
                </label>
              ) : (
                renderAnaInputs(myShareAna, setMyShareAna)
              )}

              {!myShareResult.valid ? (
                <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  {lang === 'bn' ? myShareResult.errorBn : myShareResult.errorEn}
                </div>
              ) : (
                <div className="space-y-4">
                  {renderSixUnitCard(
                    myShareResult.myBreakdown,
                    lang === 'bn'
                      ? `আমার প্রাপ্য অংশ (${formatNumber(myShareResult.sharePercent, 3, 'bn')}% · ${formatAnaGandaText(myShareResult.anaGanda, 'bn')})`
                      : `My Share (${myShareResult.sharePercent.toFixed(3)}% · ${formatAnaGandaText(myShareResult.anaGanda, 'en')})`
                  )}

                  <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-3 space-y-2">
                    <div className="text-xs font-bold text-[#4A5550] dark:text-slate-300">
                      {lang === 'bn'
                        ? 'দাগের অবশিষ্ট জমি (অন্যান্য শরিকদের অংশ)'
                        : 'Remaining Land in the Dag'}
                    </div>
                    {renderSixUnitCard(myShareResult.remainingBreakdown)}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* -------------------- TOOL 6: HISSA CALCULATOR -------------------- */}
          {activeTool === 'hissa' && (
            <section className="space-y-4 rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="grid grid-cols-[1fr_130px] gap-2">
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'মোট দাগের জমি' : 'Total Dag Area'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={hissaDagVal}
                    onChange={(e) => setHissaDagVal(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base font-bold font-mono-num"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'একক' : 'Unit'}
                  </span>
                  <select
                    value={hissaDagUnit}
                    onChange={(e) => setHissaDagUnit(e.target.value as CalculatorAreaUnit)}
                    className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold"
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {lang === 'bn' ? u.bn : u.en}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    {lang === 'bn' ? 'শরিকদের হিস্যা তালিকা' : 'Shareholders / Hissa Entries'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setHissaItems((prev) => [
                        ...prev,
                        {
                          id: `h-${Date.now()}`,
                          label:
                            lang === 'bn'
                              ? `শরিক ${formatNumber(prev.length + 1, 0, 'bn')}`
                              : `Owner ${prev.length + 1}`,
                          mode: 'fraction',
                          fractionText: '1/8',
                          percentText: '12.5',
                          ana: emptyAna(),
                        },
                      ])
                    }
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#0F5132]/10 px-2.5 text-xs font-bold text-[#0F5132] dark:text-emerald-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'শরিক যোগ' : 'Add Share'}</span>
                  </button>
                </div>

                {hissaItems.map((it) => (
                  <div
                    key={it.id}
                    className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/60 p-3 space-y-2"
                  >
                    <div className="grid grid-cols-[1fr_130px_38px] gap-2">
                      <input
                        type="text"
                        value={it.label}
                        onChange={(e) =>
                          setHissaItems((prev) =>
                            prev.map((x) =>
                              x.id === it.id ? { ...x, label: e.target.value } : x
                            )
                          )
                        }
                        className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-semibold"
                      />
                      <select
                        value={it.mode}
                        onChange={(e) =>
                          setHissaItems((prev) =>
                            prev.map((x) =>
                              x.id === it.id
                                ? {
                                    ...x,
                                    mode: e.target.value as
                                      | 'fraction'
                                      | 'ana-ganda'
                                      | 'percent',
                                  }
                                : x
                            )
                          )
                        }
                        className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                      >
                        <option value="ana-ganda">
                          {lang === 'bn' ? 'আনা–গণ্ডা' : 'Ana–Ganda'}
                        </option>
                        <option value="fraction">
                          {lang === 'bn' ? 'ভগ্নাংশ/দশমিক' : 'Fraction'}
                        </option>
                        <option value="percent">%</option>
                      </select>
                      <button
                        type="button"
                        disabled={hissaItems.length <= 1}
                        onClick={() =>
                          setHissaItems((prev) => prev.filter((x) => x.id !== it.id))
                        }
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-red-200 dark:border-red-900 text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {it.mode === 'ana-ganda' ? (
                      renderAnaInputs(it.ana, (nextAna) =>
                        setHissaItems((prev) =>
                          prev.map((x) => (x.id === it.id ? { ...x, ana: nextAna } : x))
                        )
                      )
                    ) : (
                      <input
                        type="text"
                        value={it.mode === 'percent' ? it.percentText : it.fractionText}
                        onChange={(e) =>
                          setHissaItems((prev) =>
                            prev.map((x) =>
                              x.id === it.id
                                ? it.mode === 'percent'
                                  ? { ...x, percentText: e.target.value }
                                  : { ...x, fractionText: e.target.value }
                                : x
                            )
                          )
                        }
                        placeholder={
                          it.mode === 'percent' ? '25' : '1/4 or 0.25'
                        }
                        className="w-full min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-mono-num"
                      />
                    )}
                  </div>
                ))}
              </div>

              {!hissaResult.valid ? (
                <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  {lang === 'bn' ? hissaResult.errorBn : hissaResult.errorEn}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Sum & Remainder Validation Banner */}
                  <div
                    className={`rounded-xl border p-3 text-xs tabular-nums space-y-1 ${
                      hissaResult.status === 'exact'
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                        : hissaResult.status === 'under'
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                        : 'border-red-400 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
                    }`}
                  >
                    <div className="font-bold">
                      {hissaResult.status === 'exact'
                        ? lang === 'bn'
                          ? 'মোট ১৬ আনা (১০০%) সঠিকভাবে মিলেছে'
                          : 'Total equals 16 ana (100%) — exact match'
                        : hissaResult.status === 'under'
                        ? lang === 'bn'
                          ? `মোট ${formatNumber(hissaResult.sumPercent, 2, 'bn')}% · অবশিষ্ট ${formatNumber(hissaResult.remainingBreakdown.shotok, 3, 'bn')} শতক`
                          : `Sum ${hissaResult.sumPercent.toFixed(2)}% · Remaining ${hissaResult.remainingBreakdown.shotok.toFixed(3)} shotok`
                        : lang === 'bn'
                        ? `সতর্কতা: মোট অংশ ১৬ আনা (১০০%) ছাড়িয়েছে (${formatNumber(hissaResult.sumPercent, 2, 'bn')}%)`
                        : `Warning: Total exceeds 100% (${hissaResult.sumPercent.toFixed(2)}%)`}
                    </div>
                    <div>
                      {lang === 'bn' ? 'মোট হিস্যা:' : 'Combined:'}{' '}
                      {formatAnaGandaText(hissaResult.sumAnaGanda, lang)} ·{' '}
                      {formatNumber(hissaResult.sumBreakdown.shotok, 3, lang)}{' '}
                      {lang === 'bn' ? 'শতক' : 'shotok'}
                    </div>
                  </div>

                  {hissaResult.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-3 space-y-2"
                    >
                      <div className="flex justify-between text-xs font-bold tabular-nums">
                        <span>
                          {it.label} ({formatNumber(it.percent, 2, lang)}%)
                        </span>
                        <span className="text-[#0F5132] dark:text-emerald-400">
                          {formatAnaGandaText(it.anaGanda, lang)}
                        </span>
                      </div>
                      {renderSixUnitCard(it.breakdown)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* -------------------- TOOL 7: TOFSIL DISTRIBUTION -------------------- */}
          {activeTool === 'tofsil' && (
            <section className="space-y-4 rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'দাগ নং' : 'Dag No'}
                  </span>
                  <input
                    type="text"
                    value={tofDagNo}
                    onChange={(e) => setTofDagNo(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'খতিয়ান নং' : 'Khatian No'}
                  </span>
                  <input
                    type="text"
                    value={tofKhatianNo}
                    onChange={(e) => setTofKhatianNo(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'তফসিল জমি' : 'Total Area'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tofTotalVal}
                    onChange={(e) => setTofTotalVal(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-sm font-bold font-mono-num"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium mb-1">
                    {lang === 'bn' ? 'একক' : 'Unit'}
                  </span>
                  <select
                    value={tofTotalUnit}
                    onChange={(e) => setTofTotalUnit(e.target.value as CalculatorAreaUnit)}
                    className="w-full min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold"
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {lang === 'bn' ? u.bn : u.en}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    {lang === 'bn' ? 'প্রাপকদের নাম ও অংশ' : 'Recipients & Shares'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setTofPeople((prev) => [
                        ...prev,
                        {
                          id: `t-${Date.now()}`,
                          name:
                            lang === 'bn'
                              ? `ব্যক্তি ${formatNumber(prev.length + 1, 0, 'bn')}`
                              : `Person ${prev.length + 1}`,
                          mode: 'fraction',
                          valueText: '1/4',
                          ana: emptyAna(),
                        },
                      ])
                    }
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#0F5132]/10 px-2.5 text-xs font-bold text-[#0F5132] dark:text-emerald-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'প্রাপক যোগ' : 'Add Person'}</span>
                  </button>
                </div>

                {tofPeople.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/60 p-2.5 space-y-2"
                  >
                    <div className="grid grid-cols-[1fr_120px_38px] gap-2">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) =>
                          setTofPeople((prev) =>
                            prev.map((x) =>
                              x.id === p.id ? { ...x, name: e.target.value } : x
                            )
                          )
                        }
                        className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-semibold"
                      />
                      <select
                        value={p.mode}
                        onChange={(e) =>
                          setTofPeople((prev) =>
                            prev.map((x) =>
                              x.id === p.id
                                ? {
                                    ...x,
                                    mode: e.target.value as
                                      | 'fraction'
                                      | 'ana-ganda'
                                      | 'ratio'
                                      | 'percent',
                                  }
                                : x
                            )
                          )
                        }
                        className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                      >
                        <option value="fraction">
                          {lang === 'bn' ? 'ভগ্নাংশ' : 'Fraction'}
                        </option>
                        <option value="ana-ganda">
                          {lang === 'bn' ? 'আনা–গণ্ডা' : 'Ana–Ganda'}
                        </option>
                        <option value="percent">%</option>
                        <option value="ratio">{lang === 'bn' ? 'অনুপাত' : 'Ratio'}</option>
                      </select>
                      <button
                        type="button"
                        disabled={tofPeople.length <= 1}
                        onClick={() =>
                          setTofPeople((prev) => prev.filter((x) => x.id !== p.id))
                        }
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-red-200 dark:border-red-900 text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {p.mode === 'ana-ganda' ? (
                      renderAnaInputs(p.ana, (nextAna) =>
                        setTofPeople((prev) =>
                          prev.map((x) => (x.id === p.id ? { ...x, ana: nextAna } : x))
                        )
                      )
                    ) : (
                      <input
                        type="text"
                        value={p.valueText}
                        onChange={(e) =>
                          setTofPeople((prev) =>
                            prev.map((x) =>
                              x.id === p.id ? { ...x, valueText: e.target.value } : x
                            )
                          )
                        }
                        className="w-full min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-mono-num"
                      />
                    )}
                  </div>
                ))}
              </div>

              {tofsilResult.valid && (
                <div className="space-y-3">
                  {renderSixUnitCard(
                    tofsilResult.totalBreakdown,
                    lang === 'bn'
                      ? `তফসিল মোট জমি (দাগ ${tofDagNo || '-'}, খতিয়ান ${tofKhatianNo || '-'})`
                      : `Total Tofsil Land (Dag ${tofDagNo || '-'}, Khatian ${tofKhatianNo || '-'})`
                  )}

                  <div className="overflow-x-auto rounded-xl border border-[#D4DBD6] dark:border-slate-700">
                    <table className="w-full text-left text-xs tabular-nums">
                      <thead className="bg-[#EAECE7] dark:bg-slate-800 text-[#141A17] dark:text-slate-200">
                        <tr>
                          <th className="px-2.5 py-2">{lang === 'bn' ? 'নাম' : 'Name'}</th>
                          <th className="px-2.5 py-2">{lang === 'bn' ? 'অংশ' : 'Share'}</th>
                          <th className="px-2.5 py-2">{lang === 'bn' ? 'শতক' : 'Shotok'}</th>
                          <th className="px-2.5 py-2">{lang === 'bn' ? 'কাঠা' : 'Katha'}</th>
                          <th className="px-2.5 py-2">{lang === 'bn' ? 'বিঘা' : 'Bigha'}</th>
                          <th className="px-2.5 py-2">{lang === 'bn' ? 'একর' : 'Acre'}</th>
                          <th className="px-2.5 py-2">{lang === 'bn' ? 'ব.ফু.' : 'Sq Ft'}</th>
                          <th className="px-2.5 py-2">{lang === 'bn' ? 'ব.মি.' : 'Sq M'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E9E4] dark:divide-slate-800">
                        {tofsilResult.rows.map((r, idx) => (
                          <tr key={idx}>
                            <td className="px-2.5 py-2 font-semibold whitespace-nowrap">
                              {r.label}
                            </td>
                            <td className="px-2.5 py-2 whitespace-nowrap">{r.shareText}</td>
                            <td className="px-2.5 py-2 font-bold text-[#0F5132] dark:text-emerald-400">
                              {formatNumber(r.shotok, 3, lang)}
                            </td>
                            <td className="px-2.5 py-2">{formatNumber(r.katha, 3, lang)}</td>
                            <td className="px-2.5 py-2">{formatNumber(r.bigha, 4, lang)}</td>
                            <td className="px-2.5 py-2">{formatNumber(r.acre, 4, lang)}</td>
                            <td className="px-2.5 py-2">{formatNumber(r.sqFt, 1, lang)}</td>
                            <td className="px-2.5 py-2">{formatNumber(r.sqM, 2, lang)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const csv = exportTofsilCsv(tofsilResult, lang, unitProfile);
                      await exportFileCrossPlatform(
                        `tofsil_${tofDagNo || 'table'}.csv`,
                        csv,
                        'text/csv;charset=utf-8',
                        'SurveyCAD Tofsil'
                      );
                      notifySaved(
                        lang === 'bn' ? 'তফসিল CSV এক্সপোর্ট হয়েছে' : 'Tofsil CSV exported'
                      );
                    }}
                    className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[#0F5132] bg-white dark:bg-slate-800 px-3 text-xs font-bold text-[#0F5132] dark:text-emerald-400"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>
                      {lang === 'bn'
                        ? 'তফসিল বণ্টন CSV টেবিল ডাউনলোড'
                        : 'Export Tofsil Distribution CSV'}
                    </span>
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Add to Plot / Report Primary Action */}
          <button
            type="button"
            disabled={!canAddCurrent}
            onClick={handleSaveCurrentToPlotAndReport}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#0F5132] dark:bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-[#0B3D26] disabled:opacity-40"
          >
            <BookmarkPlus className="h-4 w-4" />
            <span>
              {lang === 'bn' ? 'দাগ/রিপোর্টে যোগ করুন' : 'Add to Plot / Report'}
            </span>
          </button>

          {/* Mandatory Non-Legal / Approximate Disclaimer */}
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
            <span>
              {lang === 'bn'
                ? 'সতর্কবার্তা: এই ক্যালকুলেটরের সকল ফলাফল আনুমানিক হিসাবের জন্য প্রস্তুত এবং কোনো আইনি পরামর্শ বা দলিলের চূড়ান্ত প্রমাণ হিসেবে গণ্য নয়। প্রয়োজনে রেজিস্টার্ড আমিন বা সাব-রেজিস্ট্রি অফিসের মাধ্যমে যাচাই করুন।'
                : 'Disclaimer: All results from this calculator are approximate calculations and do not constitute legal advice. Verify with a registered surveyor or legal authority before executing deeds.'}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};
