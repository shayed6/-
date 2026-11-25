import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Lang } from './i18n';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC<{ lang: Lang; fullWidth?: boolean }> = ({
  lang,
  fullWidth = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#0F5132] dark:bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-[#0B3D26] dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 ${
          fullWidth ? 'w-full min-h-[44px] rounded-xl text-sm' : ''
        }`}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>{lang === 'bn' ? 'ইনস্টল করুন' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[#D4DBD6] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-[#141A17] dark:text-slate-100 hover:bg-[#EAECE7] dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 ${
            fullWidth ? 'w-full min-h-[44px] rounded-xl text-sm' : ''
          }`}
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>{lang === 'bn' ? 'ইনস্টল করুন' : 'Install App'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-[#D4DBD6] dark:border-slate-700">
              <h3 className="text-base font-bold text-[#141A17] dark:text-white">
                {lang === 'bn' ? 'iPhone / iPad-এ ইনস্টল করুন' : 'Install on iPhone / iPad'}
              </h3>
              <p className="mt-2 whitespace-pre-line text-sm text-[#4A5550] dark:text-slate-300 leading-relaxed">
                {lang === 'bn'
                  ? '১. Safari টুলবারে Share বোতামে ট্যাপ করুন।\n২. নিচে স্ক্রল করে "Add to Home Screen" নির্বাচন করুন।'
                  : '1. Tap the Share button in Safari toolbar.\n2. Scroll down and tap "Add to Home Screen".'}
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full min-h-[44px] rounded-xl bg-[#0F5132] dark:bg-emerald-600 py-2.5 text-sm font-medium text-white"
              >
                {lang === 'bn' ? 'বুঝেছি' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
