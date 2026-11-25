import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, HelpCircle, X } from 'lucide-react';
import { formatNumber } from '../core/survey/units';
import { Lang, getTranslations } from './i18n';

export interface WizardFrameworkProps {
  title: string;
  icon?: React.ReactNode;
  currentStep: number;
  totalSteps: number;
  instruction: string;
  hint?: string;
  canGoBack?: boolean;
  canGoNext?: boolean;
  nextLabel?: string;
  backLabel?: string;
  onBack?: () => void;
  onNext?: () => void;
  onJumpToWorkspace: () => void;
  onClose: () => void;
  lang: Lang;
  children: React.ReactNode;
}

export const WizardFramework: React.FC<WizardFrameworkProps> = ({
  title,
  icon,
  currentStep,
  totalSteps,
  instruction,
  hint,
  canGoBack = true,
  canGoNext = true,
  nextLabel,
  backLabel,
  onBack,
  onNext,
  onJumpToWorkspace,
  onClose,
  lang,
  children,
}) => {
  const t = getTranslations(lang);
  const [showHint, setShowHint] = useState(false);

  return (
    <div className="pointer-events-auto fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-xl rounded-t-3xl border-t border-x border-[#D4DBD6] dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl pb-safe">
      <div className="mx-auto my-2 h-1.5 w-10 rounded-full bg-[#CBD5E1] dark:bg-slate-700" />

      {/* Top Bar: Icon + Title + Step Counter + Jump to Workspace + Close */}
      <div className="flex items-center justify-between gap-2 border-b border-[#E5E9E4] dark:border-slate-800 px-4 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="truncate text-sm font-bold text-[#141A17] dark:text-slate-100">
            {title}
          </h2>
          <span className="text-xs font-bold text-[#0F5132] dark:text-emerald-400 tabular-nums whitespace-nowrap">
            {formatNumber(currentStep, 0, lang)}/{formatNumber(totalSteps, 0, lang)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onJumpToWorkspace}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-2.5 text-[11px] font-semibold text-[#141A17] dark:text-slate-200 hover:bg-[#EAECE7] dark:hover:bg-slate-700 whitespace-nowrap"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>{t.workspace.jumpToWorkspace}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.actions.close}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#4A5550] dark:text-slate-300 hover:bg-[#EAECE7] dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Segmented Step Indicator Bar */}
      <div className="flex gap-1 px-4 pt-2.5">
        {Array.from({ length: totalSteps }).map((_, idx) => {
          const stepNum = idx + 1;
          const active = stepNum <= currentStep;
          return (
            <div
              key={stepNum}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                active
                  ? 'bg-[#0F5132] dark:bg-emerald-500'
                  : 'bg-[#E5E9E4] dark:bg-slate-800'
              }`}
            />
          );
        })}
      </div>

      {/* One Clear Instruction + Optional Hint */}
      <div className="px-4 pt-3 pb-1 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[#141A17] dark:text-slate-100 leading-snug">
          {instruction}
        </p>
        {hint && (
          <button
            type="button"
            onClick={() => setShowHint((h) => !h)}
            className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[#0F5132] dark:text-emerald-400 hover:bg-[#0F5132]/10 dark:hover:bg-emerald-500/10"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>{t.workspace.hintLabel}</span>
          </button>
        )}
      </div>

      {hint && showHint && (
        <div className="mx-4 mt-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/80 px-3 py-2 text-xs text-[#4A5550] dark:text-slate-300 leading-relaxed">
          {hint}
        </div>
      )}

      {/* Step Content */}
      <div className="max-h-[44vh] overflow-y-auto px-4 py-3 text-[#141A17] dark:text-slate-100">
        {children}
      </div>

      {/* Reusable Next / Back Bar */}
      {(onBack || onNext) && (
        <div className="flex items-center justify-between gap-2 border-t border-[#E5E9E4] dark:border-slate-800 px-4 py-3">
          {onBack ? (
            <button
              type="button"
              disabled={!canGoBack}
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-xs font-semibold text-[#141A17] dark:text-slate-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{backLabel || t.workspace.back}</span>
            </button>
          ) : (
            <div />
          )}

          {onNext && (
            <button
              type="button"
              disabled={!canGoNext}
              onClick={onNext}
              className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-[#0B3D26] dark:hover:bg-emerald-500 disabled:opacity-40"
            >
              <span>{nextLabel || t.workspace.next}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
