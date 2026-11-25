import React from 'react';
import {
  BoxSelect,
  Crosshair,
  Grid,
  Layers,
  Magnet,
  MousePointer,
} from 'lucide-react';
import { SnapConfig } from '../core/cad/snapping';
import { formatNumber } from '../core/survey/units';
import { ActiveTool } from './CadCanvas';
import { Lang } from './i18n';

interface SnapBarProps {
  lang: Lang;
  snapConfig: SnapConfig;
  onChangeSnap: (next: SnapConfig) => void;
  activeTool: ActiveTool;
  onSetTool: (tool: ActiveTool) => void;
  activeLayerName: string;
  activeLayerColor: string;
  onOpenLayers: () => void;
}

const TOLERANCE_PRESETS = [12, 18, 28] as const;

export const SnapBar: React.FC<SnapBarProps> = ({
  lang,
  snapConfig,
  onChangeSnap,
  activeTool,
  onSetTool,
  activeLayerName,
  activeLayerColor,
  onOpenLayers,
}) => {
  const chip = (
    label: string,
    active: boolean,
    onClick: () => void,
    disabled = false
  ) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
        active
          ? 'border-[#0F5132] bg-[#0F5132] text-white dark:border-emerald-500 dark:bg-emerald-600'
          : 'border-[#D4DBD6] dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 text-[#334155] dark:text-slate-200'
      }`}
    >
      {label}
    </button>
  );

  const cycleTolerance = () => {
    const idx = TOLERANCE_PRESETS.indexOf(
      snapConfig.tolerancePx as (typeof TOLERANCE_PRESETS)[number]
    );
    const next = TOLERANCE_PRESETS[(idx + 1) % TOLERANCE_PRESETS.length];
    onChangeSnap({ ...snapConfig, tolerancePx: next });
  };

  return (
    <div className="pointer-events-auto absolute left-2 right-2 top-2 z-20 flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-xl border border-[#D4DBD6]/90 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-2 py-1.5 shadow-sm backdrop-blur-md">
      {/* Layer Picker Button */}
      <button
        type="button"
        onClick={onOpenLayers}
        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2 text-[11px] font-bold text-[#141A17] dark:text-slate-100 whitespace-nowrap shrink-0"
      >
        <span
          className="h-2.5 w-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: activeLayerColor }}
        />
        <Layers className="h-3.5 w-3.5 text-[#0F5132] dark:text-emerald-400" />
        <span>{activeLayerName}</span>
      </button>

      <div className="h-5 w-px bg-[#E5E9E4] dark:bg-slate-700 shrink-0" />

      {/* Selection mode: Tap vs Box (Window/Crossing) */}
      <button
        type="button"
        onClick={() => onSetTool('select')}
        className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
          activeTool === 'select'
            ? 'border-[#B45309] bg-[#B45309] text-white'
            : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#334155] dark:text-slate-200'
        }`}
      >
        <MousePointer className="h-3 w-3" />
        <span>{lang === 'bn' ? 'ট্যাপ' : 'Tap'}</span>
      </button>

      <button
        type="button"
        onClick={() => onSetTool('box-select')}
        className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
          activeTool === 'box-select'
            ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
            : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#334155] dark:text-slate-200'
        }`}
      >
        <BoxSelect className="h-3 w-3" />
        <span>{lang === 'bn' ? 'বক্স' : 'Box'}</span>
      </button>

      <div className="h-5 w-px bg-[#E5E9E4] dark:bg-slate-700 shrink-0" />

      {/* Master Snap Toggle */}
      <button
        type="button"
        onClick={() => onChangeSnap({ ...snapConfig, enabled: !snapConfig.enabled })}
        className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[11px] font-bold whitespace-nowrap shrink-0 ${
          snapConfig.enabled
            ? 'border-[#0F5132] bg-[#0F5132] text-white dark:border-emerald-500 dark:bg-emerald-600'
            : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#64748B]'
        }`}
      >
        <Magnet className="h-3.5 w-3.5" />
        <span>{lang === 'bn' ? 'স্ন্যাপ' : 'Snap'}</span>
      </button>

      {chip(
        lang === 'bn' ? 'প্রান্ত' : 'End',
        snapConfig.enabled && snapConfig.endpoint,
        () => onChangeSnap({ ...snapConfig, endpoint: !snapConfig.endpoint }),
        !snapConfig.enabled
      )}
      {chip(
        lang === 'bn' ? 'মধ্য' : 'Mid',
        snapConfig.enabled && snapConfig.midpoint,
        () => onChangeSnap({ ...snapConfig, midpoint: !snapConfig.midpoint }),
        !snapConfig.enabled
      )}
      {chip(
        lang === 'bn' ? 'কেন্দ্র' : 'Ctr',
        snapConfig.enabled && snapConfig.center,
        () => onChangeSnap({ ...snapConfig, center: !snapConfig.center }),
        !snapConfig.enabled
      )}
      {chip(
        lang === 'bn' ? 'ছেদ' : 'Int',
        snapConfig.enabled && snapConfig.intersection,
        () =>
          onChangeSnap({ ...snapConfig, intersection: !snapConfig.intersection }),
        !snapConfig.enabled
      )}
      {chip(
        lang === 'bn' ? 'লম্ব' : 'Perp',
        snapConfig.enabled && snapConfig.perpendicular,
        () =>
          onChangeSnap({
            ...snapConfig,
            perpendicular: !snapConfig.perpendicular,
          }),
        !snapConfig.enabled
      )}

      {/* Ortho Mode Toggle */}
      <button
        type="button"
        onClick={() => onChangeSnap({ ...snapConfig, ortho: !snapConfig.ortho })}
        className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[11px] font-bold whitespace-nowrap shrink-0 ${
          snapConfig.ortho
            ? 'border-[#0369A1] bg-[#0369A1] text-white'
            : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#334155] dark:text-slate-200'
        }`}
      >
        <Crosshair className="h-3 w-3" />
        <span>{lang === 'bn' ? 'অর্থো' : 'Ortho'}</span>
      </button>

      {/* Grid Snap */}
      <button
        type="button"
        disabled={!snapConfig.enabled}
        onClick={() => onChangeSnap({ ...snapConfig, grid: !snapConfig.grid })}
        className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold whitespace-nowrap shrink-0 disabled:opacity-40 ${
          snapConfig.enabled && snapConfig.grid
            ? 'border-[#0F5132] bg-[#0F5132]/15 text-[#0F5132] dark:text-emerald-300'
            : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#334155] dark:text-slate-200'
        }`}
      >
        <Grid className="h-3 w-3" />
        <span>{lang === 'bn' ? 'গ্রিড' : 'Grid'}</span>
      </button>

      {/* Snap tolerance in screen pixels */}
      <button
        type="button"
        onClick={cycleTolerance}
        title={lang === 'bn' ? 'স্ন্যাপ রেঞ্জ (পিক্সেল)' : 'Snap Tolerance (px)'}
        className="min-h-[32px] rounded-lg border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2 text-[11px] font-mono-num text-[#4A5550] dark:text-slate-300 whitespace-nowrap shrink-0"
      >
        {formatNumber(snapConfig.tolerancePx, 0, lang)}px
      </button>
    </div>
  );
};
