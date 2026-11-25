import React, { useState } from 'react';
import {
  Download,
  HardDrive,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react';
import { AppSettings, ThemeMode } from '../adapters/storage';
import {
  DEFAULT_UNIT_PROFILE,
  LinearUnit,
  PRESET_UNIT_PROFILES,
  UnitProfile,
  formatNumber,
  getLinearUnitLabel,
  parseLocalizedNumber,
} from '../core/survey/units';
import { BottomSheet } from './BottomSheet';
import { PWAInstallButton } from './PWAInstallButton';
import { Lang, getTranslations } from './i18n';

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  linearUnit: LinearUnit;
  isLicensed: boolean;
  projectCount: number;
  isBackingUp?: boolean;
  onSave: (nextSettings: AppSettings, nextLinear: LinearUnit) => void;
  onExportAllBackup: () => Promise<void>;
  onImportAllBackup: (file: File) => Promise<void>;
  onOpenLicense: () => void;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  settings,
  linearUnit,
  isLicensed,
  projectCount,
  isBackingUp = false,
  onSave,
  onExportAllBackup,
  onImportAllBackup,
  onOpenLicense,
  onClose,
}) => {
  const [lang, setLang] = useState<Lang>(settings.language);
  const [theme, setTheme] = useState<ThemeMode>(settings.theme);
  const [selectedProfileId, setSelectedProfileId] = useState(settings.unitProfile.id);
  const [kathaSqFt, setKathaSqFt] = useState(String(settings.unitProfile.kathaSqFt));
  const [bighaShotok, setBighaShotok] = useState(
    String(Number(settings.unitProfile.bighaShotok.toFixed(4)))
  );
  const [lin, setLin] = useState<LinearUnit>(linearUnit);
  const [orgName, setOrgName] = useState(settings.organizationName || '');
  const [phone, setPhone] = useState(settings.phoneNumber || '');
  const [advancedMode, setAdvancedMode] = useState(settings.advancedMode);

  const t = getTranslations(lang);

  const applyPreset = (p: UnitProfile) => {
    setSelectedProfileId(p.id);
    setKathaSqFt(String(p.kathaSqFt));
    setBighaShotok(String(Number(p.bighaShotok.toFixed(4))));
  };

  const handleSave = () => {
    const k = parseLocalizedNumber(kathaSqFt);
    const b = parseLocalizedNumber(bighaShotok);
    const validK = k > 0 ? k : DEFAULT_UNIT_PROFILE.kathaSqFt;
    const validB = b > 0 ? b : DEFAULT_UNIT_PROFILE.bighaShotok;

    const unitProfile: UnitProfile = {
      id: selectedProfileId,
      nameBn:
        PRESET_UNIT_PROFILES.find((p) => p.id === selectedProfileId)?.nameBn ||
        `কাস্টম (কাঠা = ${formatNumber(validK, 1, 'bn')} ব.ফু., বিঘা = ${formatNumber(validB, 2, 'bn')} শতক)`,
      nameEn:
        PRESET_UNIT_PROFILES.find((p) => p.id === selectedProfileId)?.nameEn ||
        `Custom (Katha = ${validK} sq ft, Bigha = ${validB} shotok)`,
      kathaSqFt: validK,
      bighaShotok: validB,
    };

    onSave(
      {
        ...settings,
        language: lang,
        theme,
        unitProfile,
        organizationName: orgName.trim(),
        phoneNumber: phone.trim(),
        advancedMode,
      },
      lin
    );
  };

  const linearOptions: LinearUnit[] = ['ft', 'm', 'chain', 'link', 'hat', 'gaj'];

  return (
    <BottomSheet open={open} title={t.settings.title} onClose={onClose}>
      <div className="space-y-5">
        {/* Language & Theme */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#4A5550] dark:text-slate-400 mb-2">
              {t.settings.language}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['bn', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`min-h-[42px] rounded-xl border text-xs font-semibold transition-colors ${
                    lang === l
                      ? 'border-[#0F5132] bg-[#0F5132] text-white dark:border-emerald-500 dark:bg-emerald-600'
                      : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141A17] dark:text-slate-200'
                  }`}
                >
                  {l === 'bn' ? 'বাংলা' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#4A5550] dark:text-slate-400 mb-2">
              {t.settings.theme}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'light', label: t.settings.themeLight, icon: <Sun className="h-3.5 w-3.5" /> },
                  { id: 'dark', label: t.settings.themeDark, icon: <Moon className="h-3.5 w-3.5" /> },
                  { id: 'system', label: t.settings.themeSystem, icon: <Monitor className="h-3.5 w-3.5" /> },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id)}
                  className={`flex min-h-[42px] items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold transition-colors ${
                    theme === item.id
                      ? 'border-[#0F5132] bg-[#0F5132] text-white dark:border-emerald-500 dark:bg-emerald-600'
                      : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141A17] dark:text-slate-200'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced Mode Switch (off by default) */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/60 p-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[#141A17] dark:text-slate-100">
              {t.settings.advancedModeLabel}
            </div>
            <p className="mt-0.5 text-xs text-[#4A5550] dark:text-slate-400">
              {t.settings.advancedModeDesc}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={advancedMode}
            aria-label={t.settings.advancedModeLabel}
            onClick={() => setAdvancedMode((v) => !v)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
              advancedMode ? 'bg-[#0F5132] dark:bg-emerald-500' : 'bg-[#CBD5E1] dark:bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                advancedMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Unit Profile */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-[#4A5550] dark:text-slate-400">
            {t.actions.unitSettings}
          </label>
          <div className="space-y-1.5">
            {PRESET_UNIT_PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`w-full rounded-xl border p-2.5 text-left text-xs font-medium transition-colors ${
                  selectedProfileId === p.id
                    ? 'border-[#0F5132] bg-[#0F5132]/10 text-[#0F5132] dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141A17] dark:text-slate-200'
                }`}
              >
                {lang === 'bn' ? p.nameBn : p.nameEn}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#4A5550] dark:text-slate-400">
                {t.settings.kathaSqFt}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={kathaSqFt}
                onChange={(e) => {
                  setSelectedProfileId('custom');
                  setKathaSqFt(e.target.value);
                }}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] dark:text-slate-400">
                {t.settings.bighaShotok}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={bighaShotok}
                onChange={(e) => {
                  setSelectedProfileId('custom');
                  setBighaShotok(e.target.value);
                }}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {linearOptions.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setLin(u)}
                className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold ${
                  lin === u
                    ? 'border-[#0F5132] bg-[#0F5132] text-white dark:border-emerald-500 dark:bg-emerald-600'
                    : 'border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800'
                }`}
              >
                {getLinearUnitLabel(u, lang)}
              </button>
            ))}
          </div>
        </div>

        {/* Organization Name & Phone Number (stored locally) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#4A5550] dark:text-slate-400">
              {t.settings.orgName}
            </label>
            <input
              type="text"
              value={orgName}
              placeholder={t.settings.orgNamePlaceholder}
              onChange={(e) => setOrgName(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A5550] dark:text-slate-400">
              {t.settings.phone}
            </label>
            <input
              type="tel"
              value={phone}
              placeholder={t.settings.phonePlaceholder}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono-num"
            />
          </div>
        </div>

        {/* Offline Storage Notice + Full Projects Backup Export / Import */}
        <div className="rounded-2xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/60 p-3.5 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0F5132]/10 dark:bg-emerald-500/15 text-[#0F5132] dark:text-emerald-400">
              <HardDrive className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#141A17] dark:text-slate-100">
                  {lang === 'bn' ? 'অফলাইন ডাটা ও সম্পূর্ণ ব্যাকআপ' : 'Local Phone Data & Full Backup'}
                </h3>
                <span className="text-[11px] font-semibold text-[#0F5132] dark:text-emerald-400 tabular-nums whitespace-nowrap">
                  {formatNumber(projectCount, 0, lang)}{' '}
                  {lang === 'bn' ? 'টি প্রজেক্ট' : 'projects'}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#4A5550] dark:text-slate-300">
                {lang === 'bn'
                  ? 'আপনার সব ম্যাপ, দাগ, ডিমার্কেশন ও প্রজেক্ট কেবল এই ফোনের মেমোরিতে (IndexedDB) সংরক্ষিত থাকে — কোনো ইন্টারনেট বা সার্ভারে পাঠানো হয় না। ফোন পরিবর্তন বা ব্রাউজারের ডাটা মুছে ফেলার আগে নিচ থেকে সব প্রজেক্টের ব্যাকআপ ফাইল সংরক্ষণ করে রাখুন।'
                  : 'All your maps, plots, demarcations, and projects stay strictly on this phone (IndexedDB) and are never uploaded to any server. Export a backup file regularly before switching phones or clearing browser storage.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isBackingUp}
              onClick={() => {
                void onExportAllBackup();
              }}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#0F5132] dark:border-emerald-500 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-[#0F5132] dark:text-emerald-300 hover:bg-[#0F5132]/5 dark:hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>
                {lang === 'bn' ? 'সব প্রজেক্ট ব্যাকআপ নিন' : 'Export All Backup'}
              </span>
            </button>

            {/* Android WebView Safe Label File Input */}
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-[#141A17] dark:text-slate-200 hover:bg-[#EAECE7] dark:hover:bg-slate-800 transition-colors">
              <Upload className="h-4 w-4 shrink-0 text-[#0F5132] dark:text-emerald-400" />
              <span>
                {lang === 'bn' ? 'ব্যাকআপ ফিরিয়ে আনুন' : 'Import Backup'}
              </span>
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void onImportAllBackup(file);
                  }
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>

          <PWAInstallButton lang={lang} fullWidth />
        </div>

        {/* License trigger + Save */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onOpenLicense}
            className="inline-flex min-h-[46px] items-center gap-1.5 rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-semibold text-[#141A17] dark:text-slate-200 whitespace-nowrap"
          >
            <ShieldCheck className="h-4 w-4 text-[#0F5132] dark:text-emerald-400" />
            <span>
              {t.actions.license}
              {isLicensed ? (lang === 'bn' ? ' · প্রো' : ' · Pro') : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex-1 min-h-[46px] rounded-xl bg-[#0F5132] dark:bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-[#0B3D26] dark:hover:bg-emerald-500"
          >
            {t.actions.save}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
