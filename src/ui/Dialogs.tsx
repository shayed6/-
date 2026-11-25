import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  DEFAULT_UNIT_PROFILE,
  LinearUnit,
  PRESET_UNIT_PROFILES,
  UnitProfile,
  formatNumber,
  parseLocalizedNumber,
  toFeet,
  getLinearUnitLabel,
} from '../core/survey/units';
import { buildQuadFromSidesAndDiagonal, heronAreaSqFt } from '../core/survey/area';
import { TraverseLeg, solveTraverse } from '../core/survey/traverse';
import { Point2D } from '../core/survey/coordinates';
import { LicenseStatus, generateLicenseCode, validateLicenseCode } from '../access/license';
import { Lang } from './i18n';

/* ---------- Generic Modal Wrapper ---------- */
const ModalShell: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
    <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-[#D4DBD6] dark:border-slate-700 shadow-2xl max-h-[88vh] flex flex-col">
      <div className="flex items-center justify-between border-b border-[#E5E9E4] dark:border-slate-800 px-5 py-4">
        <h3 className="text-base font-bold text-[#141A17] dark:text-slate-100">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#4A5550] dark:text-slate-300 hover:bg-[#EAECE7] dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="overflow-y-auto p-5 text-[#141A17] dark:text-slate-100">{children}</div>
    </div>
  </div>
);

/* ---------- Confirm Dialog (Replaces window.confirm) ---------- */
export const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) => (
  <ModalShell title={title} onClose={onCancel}>
    <p className="text-sm text-[#4A5550] leading-relaxed">{message}</p>
    <div className="mt-5 flex justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-[44px] rounded-xl border border-[#D4DBD6] px-4 py-2 text-sm font-medium text-[#141A17] hover:bg-[#EAECE7]"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold text-white ${
          danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#0F5132] hover:bg-[#0B3D26]'
        }`}
      >
        {confirmLabel}
      </button>
    </div>
  </ModalShell>
);

/* ---------- Prompt Input Dialog (Replaces window.prompt) ---------- */
export const TextPromptDialog: React.FC<{
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (val: string) => void;
  onCancel: () => void;
}> = ({
  title,
  label,
  initialValue = '',
  placeholder = '',
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const [val, setVal] = useState(initialValue);
  return (
    <ModalShell title={title} onClose={onCancel}>
      <label className="block text-sm font-medium text-[#141A17]">{label}</label>
      <input
        type="text"
        autoFocus
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        className="mt-2 w-full min-h-[44px] rounded-xl border border-[#CBD5E1] px-3.5 py-2 text-sm focus:border-[#0F5132] focus:outline-none"
      />
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-xl border border-[#D4DBD6] px-4 py-2 text-sm font-medium text-[#141A17]"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            if (val.trim()) onConfirm(val.trim());
          }}
          className="min-h-[44px] rounded-xl bg-[#0F5132] px-4 py-2 text-sm font-semibold text-white"
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
};

/* ---------- Unit Profile Settings Dialog ---------- */
export const UnitProfileDialog: React.FC<{
  lang: Lang;
  profile: UnitProfile;
  linearUnit: LinearUnit;
  onSave: (nextProfile: UnitProfile, nextLinear: LinearUnit) => void;
  onClose: () => void;
}> = ({ lang, profile, linearUnit, onSave, onClose }) => {
  const [selectedId, setSelectedId] = useState(profile.id);
  const [kathaSqFt, setKathaSqFt] = useState(String(profile.kathaSqFt));
  const [bighaShotok, setBighaShotok] = useState(String(profile.bighaShotok));
  const [lin, setLin] = useState<LinearUnit>(linearUnit);

  const applyPreset = (p: UnitProfile) => {
    setSelectedId(p.id);
    setKathaSqFt(String(p.kathaSqFt));
    setBighaShotok(String(Number(p.bighaShotok.toFixed(4))));
  };

  const handleSave = () => {
    const k = parseLocalizedNumber(kathaSqFt);
    const b = parseLocalizedNumber(bighaShotok);
    const nextProfile: UnitProfile = {
      id: selectedId,
      nameBn:
        PRESET_UNIT_PROFILES.find((p) => p.id === selectedId)?.nameBn ||
        `কাস্টম (কাঠা = ${formatNumber(k, 1, 'bn')} ব.ফু., বিঘা = ${formatNumber(b, 2, 'bn')} শতক)`,
      nameEn:
        PRESET_UNIT_PROFILES.find((p) => p.id === selectedId)?.nameEn ||
        `Custom (Katha = ${k} sq ft, Bigha = ${b} shotok)`,
      kathaSqFt: k > 0 ? k : DEFAULT_UNIT_PROFILE.kathaSqFt,
      bighaShotok: b > 0 ? b : DEFAULT_UNIT_PROFILE.bighaShotok,
    };
    onSave(nextProfile, lin);
  };

  const linearOptions: LinearUnit[] = ['ft', 'm', 'chain', 'link', 'hat', 'gaj'];

  return (
    <ModalShell
      title={lang === 'bn' ? 'একক প্রোফাইল সেটিংস' : 'Unit Profile Settings'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-[#4A5550] mb-2">
            {lang === 'bn' ? 'আঞ্চলিক প্রিসেট নির্বাচন করুন' : 'Regional Presets'}
          </p>
          <div className="space-y-2">
            {PRESET_UNIT_PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`w-full rounded-xl border p-3 text-left text-xs font-medium transition-colors ${
                  selectedId === p.id
                    ? 'border-[#0F5132] bg-[#0F5132]/8 text-[#0F5132]'
                    : 'border-[#D4DBD6] bg-white text-[#141A17] hover:bg-[#FAFBF8]'
                }`}
              >
                {lang === 'bn' ? p.nameBn : p.nameEn}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#4A5550]">
              {lang === 'bn' ? '১ কাঠা (বর্গফুট)' : '1 Katha (sq ft)'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={kathaSqFt}
              onChange={(e) => {
                setSelectedId('custom');
                setKathaSqFt(e.target.value);
              }}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A5550]">
              {lang === 'bn' ? '১ বিঘা (শতক)' : '1 Bigha (shotok)'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={bighaShotok}
              onChange={(e) => {
                setSelectedId('custom');
                setBighaShotok(e.target.value);
              }}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm font-mono-num"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A5550] mb-2">
            {lang === 'bn' ? 'দৈর্ঘ্য প্রদর্শনের একক' : 'Display Linear Unit'}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {linearOptions.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setLin(u)}
                className={`min-h-[42px] rounded-xl border px-2 py-1.5 text-xs font-semibold ${
                  lin === u
                    ? 'border-[#0F5132] bg-[#0F5132] text-white'
                    : 'border-[#D4DBD6] bg-white text-[#141A17]'
                }`}
              >
                {getLinearUnitLabel(u, lang)}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-[#4A5550]">
          {lang === 'bn'
            ? 'স্থির মান: ১ শতক = ৪৩৫.৬ ব.ফু. · ১ একর = ১০০ শতক · ১ চেইন = ৬৬ ফুট · ১ হাত = ১.৫ ফুট · ১ গজ = ৩ ফুট'
            : 'Fixed: 1 shotok = 435.6 sq ft · 1 acre = 100 shotok · 1 chain = 66 ft · 1 hat = 1.5 ft · 1 gaj = 3 ft'}
        </p>

        <button
          type="button"
          onClick={handleSave}
          className="w-full min-h-[46px] rounded-xl bg-[#0F5132] py-2.5 text-sm font-semibold text-white hover:bg-[#0B3D26]"
        >
          {lang === 'bn' ? 'প্রোফাইল সংরক্ষণ করুন' : 'Save Profile'}
        </button>
      </div>
    </ModalShell>
  );
};

/* ---------- Triangulation / Field Tape Plot Dialog ---------- */
export const TriangulationDialog: React.FC<{
  lang: Lang;
  defaultUnit: LinearUnit;
  onCreatePlot: (points: Point2D[], plotName: string) => void;
  onClose: () => void;
}> = ({ lang, defaultUnit, onCreatePlot, onClose }) => {
  const [shape, setShape] = useState<'quad' | 'tri'>('quad');
  const [unit, setUnit] = useState<LinearUnit>(defaultUnit);
  const [ab, setAb] = useState('60');
  const [bc, setBc] = useState('45');
  const [cd, setCd] = useState('60');
  const [da, setDa] = useState('45');
  const [diag, setDiag] = useState('75');
  const [plotName, setPlotName] = useState('');
  const [error, setError] = useState('');

  const handleBuild = () => {
    setError('');
    const fab = toFeet(parseLocalizedNumber(ab), unit);
    const fbc = toFeet(parseLocalizedNumber(bc), unit);
    if (shape === 'tri') {
      const fca = toFeet(parseLocalizedNumber(cd), unit);
      const area = heronAreaSqFt(fab, fbc, fca);
      if (!area) {
        setError(
          lang === 'bn'
            ? 'ত্রিভুজের তিনটি বাহুর মাপ সঠিক নয় (দুটি বাহুর যোগফল তৃতীয় বাহুর চেয়ে বড় হতে হবে)।'
            : 'Invalid triangle sides (sum of any two sides must exceed the third).'
        );
        return;
      }
      // Build triangle points
      const pA = { x: 0, y: 0 };
      const pB = { x: fab, y: 0 };
      const cosA = (fab * fab + fca * fca - fbc * fbc) / (2 * fab * fca);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const pC = { x: fca * cosA, y: fca * sinA };
      onCreatePlot([pA, pB, pC], plotName);
      return;
    }

    const fcd = toFeet(parseLocalizedNumber(cd), unit);
    const fda = toFeet(parseLocalizedNumber(da), unit);
    const fdiag = toFeet(parseLocalizedNumber(diag), unit);
    const pts = buildQuadFromSidesAndDiagonal(fab, fbc, fcd, fda, fdiag);
    if (!pts) {
      setError(
        lang === 'bn'
          ? 'চতুর্ভুজ ও কর্ণের মাপ দিয়ে ত্রিভুজ গঠন সম্ভব হচ্ছে না। কর্ণের মাপ যাচাই করুন।'
          : 'Cannot construct quadrilateral with those sides and diagonal. Check diagonal length.'
      );
      return;
    }
    onCreatePlot(pts, plotName);
  };

  return (
    <ModalShell
      title={lang === 'bn' ? 'ফিতা/বাহুর মাপে দাগ তৈরি' : 'Build Plot by Sides & Diagonal'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShape('quad')}
            className={`min-h-[42px] rounded-xl border text-xs font-semibold ${
              shape === 'quad'
                ? 'border-[#0F5132] bg-[#0F5132] text-white'
                : 'border-[#D4DBD6] text-[#141A17]'
            }`}
          >
            {lang === 'bn' ? '৪ বাহু + ১ কর্ণ' : '4 Sides + Diagonal'}
          </button>
          <button
            type="button"
            onClick={() => setShape('tri')}
            className={`min-h-[42px] rounded-xl border text-xs font-semibold ${
              shape === 'tri'
                ? 'border-[#0F5132] bg-[#0F5132] text-white'
                : 'border-[#D4DBD6] text-[#141A17]'
            }`}
          >
            {lang === 'bn' ? '৩ বাহু (ত্রিভুজ)' : '3 Sides (Triangle)'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[#4A5550]">
              {lang === 'bn' ? 'দাগ নম্বর (ঐচ্ছিক)' : 'Plot / Dag No.'}
            </label>
            <input
              type="text"
              value={plotName}
              onChange={(e) => setPlotName(e.target.value)}
              placeholder={lang === 'bn' ? 'যেমন: ১০২' : 'e.g. 102'}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#4A5550]">
              {lang === 'bn' ? 'মাপের একক' : 'Input Unit'}
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as LinearUnit)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm"
            >
              {(['ft', 'hat', 'gaj', 'chain', 'link', 'm'] as LinearUnit[]).map((u) => (
                <option key={u} value={u}>
                  {getLinearUnitLabel(u, lang)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[#4A5550]">
              {lang === 'bn' ? 'দক্ষিণ / ১ম বাহু (AB)' : 'Side 1 (AB)'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={ab}
              onChange={(e) => setAb(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] px-3 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="text-xs text-[#4A5550]">
              {lang === 'bn' ? 'পূর্ব / ২য় বাহু (BC)' : 'Side 2 (BC)'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={bc}
              onChange={(e) => setBc(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] px-3 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="text-xs text-[#4A5550]">
              {shape === 'tri'
                ? lang === 'bn'
                  ? '৩য় বাহু (CA)'
                  : 'Side 3 (CA)'
                : lang === 'bn'
                ? 'উত্তর / ৩য় বাহু (CD)'
                : 'Side 3 (CD)'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={cd}
              onChange={(e) => setCd(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] px-3 text-sm font-mono-num"
            />
          </div>
          {shape === 'quad' && (
            <>
              <div>
                <label className="text-xs text-[#4A5550]">
                  {lang === 'bn' ? 'পশ্চিম / ৪র্থ বাহু (DA)' : 'Side 4 (DA)'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={da}
                  onChange={(e) => setDa(e.target.value)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] px-3 text-sm font-mono-num"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-[#0F5132]">
                  {lang === 'bn' ? 'কর্ণের দৈর্ঘ্য (A থেকে C কোণা)' : 'Diagonal (A to C)'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={diag}
                  onChange={(e) => setDiag(e.target.value)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-[#0F5132]/40 px-3 text-sm font-mono-num"
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleBuild}
          className="w-full min-h-[46px] rounded-xl bg-[#0F5132] py-2.5 text-sm font-semibold text-white hover:bg-[#0B3D26]"
        >
          {lang === 'bn' ? 'ক্যানভাসে দাগ আঁকুন' : 'Create Plot on Canvas'}
        </button>
      </div>
    </ModalShell>
  );
};

/* ---------- Traverse Calculator Dialog ---------- */
export const TraverseDialog: React.FC<{
  lang: Lang;
  onCommitTraverse: (points: Point2D[], closed: boolean) => void;
  onClose: () => void;
}> = ({ lang, onCommitTraverse, onClose }) => {
  const [legs, setLegs] = useState<Array<{ dist: string; az: string }>>([
    { dist: '100', az: '90' },
    { dist: '80', az: '0' },
    { dist: '100', az: '270' },
    { dist: '80', az: '180' },
  ]);
  const [closed, setClosed] = useState(true);

  const parsedLegs: TraverseLeg[] = legs
    .map((l) => ({
      distanceFt: parseLocalizedNumber(l.dist),
      azimuthDeg: parseLocalizedNumber(l.az),
    }))
    .filter((l) => l.distanceFt > 0 && Number.isFinite(l.azimuthDeg));

  const solved = solveTraverse(parsedLegs, { x: 0, y: 0 }, closed);

  return (
    <ModalShell
      title={lang === 'bn' ? 'ট্র্যাভার্স (বেয়ারিং ও দূরত্ব)' : 'Traverse Solver (Bearing & Distance)'}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#4A5550]">
            {lang === 'bn' ? 'উত্তর = ০°, পূর্ব = ৯০°, দক্ষিণ = ১৮০°, পশ্চিম = ২৭০°' : 'N = 0°, E = 90°, S = 180°, W = 270°'}
          </span>
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={closed}
              onChange={(e) => setClosed(e.target.checked)}
              className="h-4 w-4 accent-[#0F5132]"
            />
            {lang === 'bn' ? 'বদ্ধ ট্র্যাভার্স (Bowditch)' : 'Closed (Bowditch)'}
          </label>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {legs.map((leg, i) => (
            <div key={i} className="grid grid-cols-[32px_1fr_1fr_36px] items-center gap-2">
              <span className="text-xs font-mono-num text-[#4A5550]">
                {formatNumber(i + 1, 0, lang)}
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder={lang === 'bn' ? 'দূরত্ব (ফুট)' : 'Dist (ft)'}
                value={leg.dist}
                onChange={(e) => {
                  const next = [...legs];
                  next[i] = { ...leg, dist: e.target.value };
                  setLegs(next);
                }}
                className="min-h-[40px] rounded-lg border border-[#CBD5E1] px-2.5 text-sm font-mono-num"
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder={lang === 'bn' ? 'বেয়ারিং (°)' : 'Bearing (°)'}
                value={leg.az}
                onChange={(e) => {
                  const next = [...legs];
                  next[i] = { ...leg, az: e.target.value };
                  setLegs(next);
                }}
                className="min-h-[40px] rounded-lg border border-[#CBD5E1] px-2.5 text-sm font-mono-num"
              />
              <button
                type="button"
                onClick={() => setLegs(legs.filter((_, idx) => idx !== i))}
                className="h-10 rounded-lg text-xs text-red-600 hover:bg-red-50"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setLegs([...legs, { dist: '50', az: '0' }])}
          className="text-xs font-semibold text-[#0F5132] hover:underline"
        >
          + {lang === 'bn' ? 'আরও বাহু যোগ করুন' : 'Add Leg'}
        </button>

        <div className="rounded-xl bg-[#FAFBF8] border border-[#E5E9E4] p-3 text-xs space-y-1 tabular-nums">
          <div>
            {lang === 'bn' ? 'মোট দৈর্ঘ্য:' : 'Total Length:'}{' '}
            <strong>{formatNumber(solved.totalLengthFt, 2, lang)}</strong> {lang === 'bn' ? 'ফুট' : 'ft'}
          </div>
          <div>
            {lang === 'bn' ? 'ক্লোজিং ত্রুটি:' : 'Closing Error:'}{' '}
            <strong>{formatNumber(solved.linearMisclosureFt, 3, lang)}</strong> {lang === 'bn' ? 'ফুট' : 'ft'}
          </div>
          {closed && (
            <div>
              {lang === 'bn' ? 'ক্ষেত্রফল:' : 'Area:'}{' '}
              <strong>{formatNumber(solved.areaSqFt / 435.6, 3, lang)}</strong> {lang === 'bn' ? 'শতক' : 'shotok'}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            const pts = solved.stations.map((s) => s.adjusted);
            const finalPts = closed && pts.length > 3 ? pts.slice(0, -1) : pts;
            if (finalPts.length >= 2) onCommitTraverse(finalPts, closed);
          }}
          className="w-full min-h-[46px] rounded-xl bg-[#0F5132] py-2.5 text-sm font-semibold text-white"
        >
          {lang === 'bn' ? 'ক্যানভাসে আঁকুন' : 'Plot Traverse on Canvas'}
        </button>
      </div>
    </ModalShell>
  );
};

/* ---------- License Activation Dialog ---------- */
export const LicenseDialog: React.FC<{
  lang: Lang;
  status: LicenseStatus;
  onActivate: (code: string) => boolean;
  onDeactivate: () => void;
  onClose: () => void;
}> = ({ lang, status, onActivate, onDeactivate, onClose }) => {
  const [input, setInput] = useState(status.code || '');
  const [err, setErr] = useState('');
  const sampleDemoCode = generateLicenseCode('AMIN', '2026');

  const handleApply = () => {
    const check = validateLicenseCode(input);
    if (!check.active) {
      setErr(
        lang === 'bn'
          ? 'লাইসেন্স কোডটি সঠিক নয়। ফরম্যাট: SCAD-XXXX-XXXX-XXXX'
          : 'Invalid license code. Expected format: SCAD-XXXX-XXXX-XXXX'
      );
      return;
    }
    setErr('');
    onActivate(check.code!);
  };

  return (
    <ModalShell
      title={lang === 'bn' ? 'SurveyCAD লাইসেন্স' : 'SurveyCAD License'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div
          className={`flex items-center gap-3 rounded-xl border p-3.5 ${
            status.active
              ? 'border-[#0F5132]/30 bg-emerald-50 text-[#0F5132]'
              : 'border-[#D4DBD6] bg-[#FAFBF8] text-[#141A17]'
          }`}
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <div className="font-bold">
              {status.active
                ? lang === 'bn'
                  ? 'প্রো সার্ভেয়ার লাইসেন্স সক্রিয়'
                  : 'Pro Surveyor License Active'
                : lang === 'bn'
                ? 'কমিউনিটি সংস্করণ (সকল মূল টুল উন্মুক্ত)'
                : 'Community Edition (All Core Tools Enabled)'}
            </div>
            {status.code && <div className="text-xs font-mono-num mt-0.5">{status.code}</div>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A5550]">
            {lang === 'bn' ? 'অফলাইন লাইসেন্স কোড লিখুন' : 'Enter Offline License Code'}
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="SCAD-XXXX-XXXX-XXXX"
            className="mt-1.5 w-full min-h-[44px] rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm font-mono-num uppercase"
          />
          <p className="mt-1.5 text-[11px] text-[#64748B]">
            {lang === 'bn' ? 'পরীক্ষামূলক কোড:' : 'Sample test code:'}{' '}
            <button
              type="button"
              onClick={() => setInput(sampleDemoCode)}
              className="font-mono-num font-semibold text-[#0F5132] underline"
            >
              {sampleDemoCode}
            </button>
          </p>
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 min-h-[44px] rounded-xl bg-[#0F5132] py-2 text-sm font-semibold text-white"
          >
            {lang === 'bn' ? 'সক্রিয় করুন' : 'Activate'}
          </button>
          {status.active && (
            <button
              type="button"
              onClick={onDeactivate}
              className="min-h-[44px] rounded-xl border border-[#D4DBD6] px-4 py-2 text-sm font-medium text-[#4A5550]"
            >
              {lang === 'bn' ? 'বন্ধ করুন' : 'Deactivate'}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
