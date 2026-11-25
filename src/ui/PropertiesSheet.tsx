import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Move, Trash2, Unlock } from 'lucide-react';
import { EditEntityPropertiesPatch } from '../core/cad/commands';
import { getEntityCadType, resolveEntityLayer } from '../core/cad/entities';
import { arcLengthFt, arcSweepAngleRad } from '../core/cad/geometry';
import { CadEntity, CadLayer } from '../core/cad/types';
import { computeAreaBreakdown, polygonAreaSqFt, polygonPerimeterFt } from '../core/survey/area';
import { azimuthDegrees, wcbToReducedBearing } from '../core/survey/bearing';
import { distance2D } from '../core/survey/coordinates';
import { UnitProfile, formatNumber, parseLocalizedNumber } from '../core/survey/units';
import { BottomSheet } from './BottomSheet';
import { Lang } from './i18n';

interface PropertiesSheetProps {
  open: boolean;
  lang: Lang;
  entities: CadEntity[];
  layers: CadLayer[];
  unitProfile: UnitProfile;
  onEditProperties: (ids: string[], patch: EditEntityPropertiesPatch) => void;
  onMoveEntities: (ids: string[], dx: number, dy: number) => void;
  onDeleteEntities: (ids: string[]) => void;
  onClose: () => void;
}

const ENTITY_COLORS = [
  '#0F5132',
  '#15803D',
  '#0369A1',
  '#B45309',
  '#7C3AED',
  '#DC2626',
  '#1E293B',
  '#475569',
];

export const PropertiesSheet: React.FC<PropertiesSheetProps> = ({
  open,
  lang,
  entities,
  layers,
  unitProfile,
  onEditProperties,
  onMoveEntities,
  onDeleteEntities,
  onClose,
}) => {
  const first = entities[0] || null;
  const ids = entities.map((e) => e.id);

  const [textVal, setTextVal] = useState('');
  const [heightVal, setHeightVal] = useState('5');
  const [labelVal, setLabelVal] = useState('');
  const [dxVal, setDxVal] = useState('0');
  const [dyVal, setDyVal] = useState('0');

  useEffect(() => {
    if (!first) return;
    if (first.kind === 'text') {
      setTextVal(first.text);
      setHeightVal(String(first.heightFt));
    } else if (first.kind === 'point') {
      setLabelVal(first.label || '');
    } else if (first.kind === 'polygon') {
      setLabelVal(first.plotNumber || '');
    }
  }, [first]);

  if (!open || !first) return null;

  const currentLayer = resolveEntityLayer(first, layers);
  const cadType = getEntityCadType(first);
  const allLocked = entities.every((e) => Boolean(e.locked));
  const allHidden = entities.every((e) => e.visible === false);

  const renderMetrics = () => {
    if (entities.length > 1) return null;

    if (first.kind === 'line' || first.kind === 'dimension') {
      const len = distance2D(first.start, first.end);
      const wcb = azimuthDegrees(first.start, first.end);
      const rb = wcbToReducedBearing(wcb);
      return (
        <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5 text-xs tabular-nums space-y-1">
          <div>
            {lang === 'bn' ? 'দৈর্ঘ্য:' : 'Length:'}{' '}
            <strong>{formatNumber(len, 2, lang)} ft</strong> (
            {formatNumber(len / 66, 3, lang)} {lang === 'bn' ? 'চেইন' : 'ch'})
          </div>
          <div>
            {lang === 'bn' ? 'কোণ / বেয়ারিং:' : 'Angle / Bearing:'}{' '}
            <strong>{formatNumber(wcb, 1, lang)}°</strong> (
            {lang === 'bn' ? rb.formattedBn : rb.formattedEn})
          </div>
        </div>
      );
    }

    if (first.kind === 'circle') {
      const area = Math.PI * first.radiusFt * first.radiusFt;
      const b = computeAreaBreakdown(area, unitProfile);
      return (
        <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5 text-xs tabular-nums space-y-1">
          <div>
            {lang === 'bn' ? 'ব্যাসার্ধ (R):' : 'Radius:'}{' '}
            <strong>{formatNumber(first.radiusFt, 2, lang)} ft</strong>
          </div>
          <div>
            {lang === 'bn' ? 'ক্ষেত্রফল:' : 'Area:'}{' '}
            <strong>{formatNumber(b.shotok, 3, lang)}</strong>{' '}
            {lang === 'bn' ? 'শতক' : 'shotok'} ({formatNumber(b.sqFt, 1, lang)} sq ft)
          </div>
        </div>
      );
    }

    if (first.kind === 'arc') {
      const len = arcLengthFt(
        first.radiusFt,
        first.startAngleRad,
        first.endAngleRad,
        first.anticlockwise ?? true
      );
      const deg =
        (arcSweepAngleRad(
          first.startAngleRad,
          first.endAngleRad,
          first.anticlockwise ?? true
        ) *
          180) /
        Math.PI;
      return (
        <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5 text-xs tabular-nums space-y-1">
          <div>
            {lang === 'bn' ? 'ব্যাসার্ধ:' : 'Radius:'}{' '}
            <strong>{formatNumber(first.radiusFt, 2, lang)} ft</strong> ·{' '}
            {lang === 'bn' ? 'কোণ:' : 'Sweep:'}{' '}
            <strong>{formatNumber(deg, 1, lang)}°</strong>
          </div>
          <div>
            {lang === 'bn' ? 'চাপ দৈর্ঘ্য:' : 'Arc Length:'}{' '}
            <strong>{formatNumber(len, 2, lang)} ft</strong>
          </div>
        </div>
      );
    }

    if (first.kind === 'rectangle' || first.kind === 'polygon') {
      const area = polygonAreaSqFt(first.points);
      const b = computeAreaBreakdown(area, unitProfile);
      const perim = polygonPerimeterFt(first.points, true);
      return (
        <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 p-2.5 text-xs tabular-nums space-y-1">
          <div>
            {lang === 'bn' ? 'ক্ষেত্রফল:' : 'Area:'}{' '}
            <strong className="text-[#0F5132] dark:text-emerald-400">
              {formatNumber(b.shotok, 3, lang)} {lang === 'bn' ? 'শতক' : 'shotok'}
            </strong>{' '}
            · {formatNumber(b.katha, 3, lang)} {lang === 'bn' ? 'কাঠা' : 'katha'}
          </div>
          <div>
            {lang === 'bn' ? 'পরিসীমা:' : 'Perimeter:'}{' '}
            <strong>{formatNumber(perim, 2, lang)} ft</strong>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <BottomSheet
      open={open}
      title={
        entities.length > 1
          ? lang === 'bn'
            ? `নির্বাচিত অবজেক্ট (${formatNumber(entities.length, 0, lang)}টি)`
            : `Selected Entities (${entities.length})`
          : lang === 'bn'
          ? `অবজেক্ট প্রপার্টিজ (${cadType})`
          : `Properties (${cadType})`
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        {renderMetrics()}

        {/* Layer assignment */}
        <div>
          <label className="block text-xs font-semibold text-[#4A5550] dark:text-slate-400 mb-1.5">
            {lang === 'bn' ? 'লেয়ার (Layer)' : 'Layer'}
          </label>
          <select
            value={currentLayer?.id || ''}
            onChange={(e) => {
              const target = layers.find((l) => l.id === e.target.value);
              if (target) {
                onEditProperties(ids, {
                  layerId: target.id,
                  layer: target.name,
                });
              }
            }}
            className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-semibold"
          >
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-xs font-semibold text-[#4A5550] dark:text-slate-400 mb-1.5">
            {lang === 'bn' ? 'রং (Color)' : 'Color'}
          </label>
          <div className="flex flex-wrap gap-2">
            {ENTITY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => onEditProperties(ids, { color: c })}
                className={`h-8 w-8 rounded-lg border-2 ${
                  first.color === c
                    ? 'border-[#141A17] dark:border-white scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Text / Label editor */}
        {entities.length === 1 && first.kind === 'text' && (
          <div className="space-y-2 rounded-xl border border-[#E5E9E4] dark:border-slate-700 p-3">
            <label className="block text-xs font-semibold text-[#4A5550] dark:text-slate-400">
              {lang === 'bn' ? 'টেক্সট লেখা ও সাইজ' : 'Text Content & Height (ft)'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={textVal}
                onChange={(e) => setTextVal(e.target.value)}
                className="flex-1 min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
              />
              <input
                type="text"
                inputMode="decimal"
                value={heightVal}
                onChange={(e) => setHeightVal(e.target.value)}
                className="w-16 min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-sm font-mono-num"
              />
              <button
                type="button"
                onClick={() =>
                  onEditProperties(ids, {
                    text: textVal.trim() || first.text,
                    heightFt: Math.max(1, parseLocalizedNumber(heightVal) || 5),
                  })
                }
                className="min-h-[40px] rounded-xl bg-[#0F5132] px-3 text-xs font-bold text-white"
              >
                {lang === 'bn' ? 'আপডেট' : 'Set'}
              </button>
            </div>
          </div>
        )}

        {entities.length === 1 &&
          (first.kind === 'point' || first.kind === 'polygon') && (
            <div className="space-y-2 rounded-xl border border-[#E5E9E4] dark:border-slate-700 p-3">
              <label className="block text-xs font-semibold text-[#4A5550] dark:text-slate-400">
                {first.kind === 'polygon'
                  ? lang === 'bn'
                    ? 'দাগ নম্বর'
                    : 'Plot Number'
                  : lang === 'bn'
                  ? 'বিন্দুর লেবেল'
                  : 'Point Label'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={labelVal}
                  onChange={(e) => setLabelVal(e.target.value)}
                  className="flex-1 min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    onEditProperties(
                      ids,
                      first.kind === 'polygon'
                        ? { plotNumber: labelVal }
                        : { label: labelVal }
                    )
                  }
                  className="min-h-[40px] rounded-xl bg-[#0F5132] px-3 text-xs font-bold text-white"
                >
                  {lang === 'bn' ? 'আপডেট' : 'Set'}
                </button>
              </div>
            </div>
          )}

        {/* Visibility & Lock toggles */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onEditProperties(ids, { visible: allHidden })}
            className="flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            {allHidden ? (
              <>
                <Eye className="h-4 w-4 text-[#0F5132]" />
                <span>{lang === 'bn' ? 'দেখান' : 'Show'}</span>
              </>
            ) : (
              <>
                <EyeOff className="h-4 w-4 text-[#4A5550]" />
                <span>{lang === 'bn' ? 'লুকান' : 'Hide'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onEditProperties(ids, { locked: !allLocked })}
            className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl border text-xs font-semibold ${
              allLocked
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
            }`}
          >
            {allLocked ? (
              <>
                <Unlock className="h-4 w-4" />
                <span>{lang === 'bn' ? 'আনলক' : 'Unlock'}</span>
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                <span>{lang === 'bn' ? 'লক করুন' : 'Lock'}</span>
              </>
            )}
          </button>
        </div>

        {/* Relative Move ΔX, ΔY */}
        <div className="rounded-xl border border-[#E5E9E4] dark:border-slate-700 p-3 space-y-2">
          <div className="text-xs font-semibold text-[#4A5550] dark:text-slate-400">
            {lang === 'bn' ? 'সঠিক দূরত্বে সরান (ফুট)' : 'Move by Offset (ft)'}
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={dxVal}
              onChange={(e) => setDxVal(e.target.value)}
              placeholder="ΔX"
              className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-mono-num"
            />
            <input
              type="text"
              inputMode="decimal"
              value={dyVal}
              onChange={(e) => setDyVal(e.target.value)}
              placeholder="ΔY"
              className="min-h-[38px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-mono-num"
            />
            <button
              type="button"
              onClick={() => {
                const dx = parseLocalizedNumber(dxVal);
                const dy = parseLocalizedNumber(dyVal);
                if (dx !== 0 || dy !== 0) {
                  onMoveEntities(ids, dx, dy);
                }
              }}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-[#D4DBD6] dark:border-slate-700 px-3 text-xs font-semibold"
            >
              <Move className="h-3.5 w-3.5" />
              <span>{lang === 'bn' ? 'সরান' : 'Move'}</span>
            </button>
          </div>
        </div>

        {/* Delete Selected */}
        <button
          type="button"
          onClick={() => {
            onDeleteEntities(ids);
            onClose();
          }}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs font-bold text-red-700 dark:text-red-300"
        >
          <Trash2 className="h-4 w-4" />
          <span>{lang === 'bn' ? 'নির্বাচিত অংশ মুছুন' : 'Delete Selected'}</span>
        </button>
      </div>
    </BottomSheet>
  );
};
