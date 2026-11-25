import React from 'react';
import {
  Calculator,
  Compass,
  FileBarChart2,
  FolderOpen,
  Layers,
  ListChecks,
  Maximize2,
  PlusCircle,
  Ruler,
  Scissors,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import { ProjectSummary } from '../adapters/storage';
import { formatNumber } from '../core/survey/units';
import { Lang, getTranslations } from './i18n';
import { PWAInstallButton } from './PWAInstallButton';

export type WizardKind = 'measure' | 'pantograph' | 'joint' | 'demarcation' | 'partition';

interface HomeScreenProps {
  lang: Lang;
  onToggleLang: () => void;
  onStartWizard: (wizard: WizardKind) => void;
  onOpenBlankCanvas: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string, name: string) => void;
  onImportProjectFile: (file: File) => void;
  onOpenSavedWork: () => void;
  onOpenPlotList: () => void;
  onOpenReports: () => void;
  onOpenCalculator: () => void;
  onOpenSettings: () => void;
  projects: ProjectSummary[];
  organizationName?: string;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  lang,
  onToggleLang,
  onStartWizard,
  onOpenBlankCanvas,
  onOpenProject,
  onDeleteProject,
  onImportProjectFile,
  onOpenSavedWork,
  onOpenPlotList,
  onOpenReports,
  onOpenCalculator,
  onOpenSettings,
  projects,
  organizationName,
}) => {
  const t = getTranslations(lang);

  const wizardCards: Array<{
    key: WizardKind;
    title: string;
    desc: string;
    icon: React.ReactNode;
    accentBg: string;
  }> = [
    {
      key: 'measure',
      title: t.wizards.measure.title,
      desc: t.wizards.measure.desc,
      icon: <Ruler className="h-6 w-6" />,
      accentBg: 'bg-[#0F5132] text-white',
    },
    {
      key: 'pantograph',
      title: t.wizards.pantograph.title,
      desc: t.wizards.pantograph.desc,
      icon: <Maximize2 className="h-6 w-6" />,
      accentBg: 'bg-[#115E59] text-white',
    },
    {
      key: 'joint',
      title: t.wizards.joint.title,
      desc: t.wizards.joint.desc,
      icon: <Layers className="h-6 w-6" />,
      accentBg: 'bg-[#B45309] text-white',
    },
    {
      key: 'demarcation',
      title: t.wizards.demarcation.title,
      desc: t.wizards.demarcation.desc,
      icon: <Scissors className="h-6 w-6" />,
      accentBg: 'bg-[#1E3A8A] text-white',
    },
  ];

  const subEntries = [
    {
      key: 'partition',
      label: lang === 'bn' ? 'ভাগবণ্টন' : 'Plot Division',
      icon: <Scissors className="h-4 w-4 text-[#DC2626] dark:text-rose-400" />,
      onClick: () => onStartWizard('partition'),
    },
    {
      key: 'saved',
      label: t.homeMenu.savedWork,
      icon: <FolderOpen className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />,
      onClick: onOpenSavedWork,
    },
    {
      key: 'plots',
      label: t.homeMenu.plotList,
      icon: <ListChecks className="h-4 w-4 text-[#115E59] dark:text-teal-400" />,
      onClick: onOpenPlotList,
    },
    {
      key: 'reports',
      label: t.homeMenu.reports,
      icon: <FileBarChart2 className="h-4 w-4 text-[#B45309] dark:text-amber-400" />,
      onClick: onOpenReports,
    },
    {
      key: 'calculator',
      label: lang === 'bn' ? 'ক্যালকুলেটর' : 'Calculator',
      icon: <Calculator className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />,
      onClick: onOpenCalculator,
    },
    {
      key: 'settings',
      label: t.homeMenu.settings,
      icon: <Settings className="h-4 w-4 text-[#4A5550] dark:text-slate-300" />,
      onClick: onOpenSettings,
    },
  ];

  return (
    <div className="min-h-full bg-[#F6F6F2] dark:bg-slate-950 text-[#141A17] dark:text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#D4DBD6] dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F5132] text-white">
              <Compass className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-[#141A17] dark:text-white whitespace-nowrap">
              {t.appName}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton lang={lang} />
            <button
              type="button"
              onClick={onToggleLang}
              className="min-h-[40px] rounded-lg border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-[#141A17] dark:text-slate-100 hover:bg-[#EAECE7] dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              {lang === 'bn' ? 'English' : 'বাংলা'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-9">
        <section className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#141A17] dark:text-white text-balance">
            {t.tagline}
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-[#4A5550] dark:text-slate-400 max-w-2xl">
            {organizationName ? `${organizationName} · ${t.homeSubtitle}` : t.homeSubtitle}
          </p>
        </section>

        {/* Four Large Guided Wizard Buttons */}
        <section aria-label="Primary Workflows" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {wizardCards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => onStartWizard(card.key)}
              className="group flex min-h-[118px] items-start gap-4 rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-left transition-all hover:border-[#0F5132] dark:hover:border-emerald-500 hover:shadow-md active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-[#0F5132]"
            >
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${card.accentBg} transition-transform group-hover:scale-105`}
              >
                {card.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-[#141A17] dark:text-white leading-snug">
                  {card.title}
                </h2>
                <p className="mt-1.5 text-sm text-[#4A5550] dark:text-slate-400 leading-relaxed">
                  {card.desc}
                </p>
              </div>
            </button>
          ))}
        </section>

        {/* Smaller Entries Below: ভাগবণ্টন, সেভ করা কাজ, দাগ তালিকা, রিপোর্ট, ক্যালকুলেটর, সেটিংস */}
        <section aria-label="Secondary Navigation" className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {subEntries.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={entry.onClick}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-semibold text-[#141A17] dark:text-slate-100 hover:bg-[#FAFBF8] dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {entry.icon}
              <span>{entry.label}</span>
            </button>
          ))}
        </section>

        {/* Quick Workspace & File Import Strip */}
        <section className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenBlankCanvas}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B3D26] dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{t.actions.openCanvas}</span>
          </button>

          {/* Android WebView Safe Label File Input */}
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-[#141A17] dark:text-slate-200 hover:bg-[#EAECE7] dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0">
            <Upload className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />
            <span>{t.actions.importFile} (.json / .dxf)</span>
            <input
              type="file"
              accept=".json,.dxf,application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportProjectFile(file);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </section>

        {/* Recent Saved Projects (IndexedDB) */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#141A17] dark:text-slate-100">
              {t.actions.recentProjects}
            </h2>
            <span className="text-xs text-[#4A5550] dark:text-slate-400 tabular-nums">
              {formatNumber(projects.length, 0, lang)}{' '}
              {lang === 'bn' ? 'টি প্রজেক্ট' : 'projects'}
            </span>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#CBD5E1] dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 p-6 text-center text-sm text-[#4A5550] dark:text-slate-400">
              {t.actions.noRecentProjects}
            </div>
          ) : (
            <div className="divide-y divide-[#E5E9E4] dark:divide-slate-800 overflow-hidden rounded-2xl border border-[#D4DBD6] dark:border-slate-800 bg-white dark:bg-slate-900">
              {projects.slice(0, 5).map((proj) => (
                <div
                  key={proj.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#FAFBF8] dark:hover:bg-slate-800/60 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProject(proj.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left min-h-[44px]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAECE7] dark:bg-slate-800 text-[#0F5132] dark:text-emerald-400">
                      <FolderOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#141A17] dark:text-slate-100">
                        {proj.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[#4A5550] dark:text-slate-400 tabular-nums">
                        <span>
                          {formatNumber(proj.entityCount, 0, lang)}{' '}
                          {lang === 'bn' ? 'টি অংশ' : 'items'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {new Date(proj.updatedAt).toLocaleDateString(
                            lang === 'bn' ? 'bn-BD' : 'en-GB'
                          )}
                        </span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-label={t.actions.delete}
                    onClick={() => onDeleteProject(proj.id, proj.name)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#64748B] dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
