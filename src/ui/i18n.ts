export type Lang = 'bn' | 'en';

export interface Translations {
  appName: string;
  tagline: string;
  homeSubtitle: string;
  wizards: {
    measure: { title: string; desc: string };
    pantograph: { title: string; desc: string };
    joint: { title: string; desc: string };
    demarcation: { title: string; desc: string };
  };
  actions: {
    openCanvas: string;
    newProject: string;
    recentProjects: string;
    noRecentProjects: string;
    backHome: string;
    undo: string;
    redo: string;
    fitView: string;
    advancedMode: string;
    advancedModeOn: string;
    finish: string;
    cancel: string;
    close: string;
    save: string;
    apply: string;
    delete: string;
    rename: string;
    exportPdf: string;
    exportCsv: string;
    exportDxf: string;
    exportJson: string;
    importFile: string;
    installApp: string;
    offlineBadge: string;
    unitSettings: string;
    license: string;
    helpTip: string;
  };
  categories: {
    file: string;
    plot: string;
    draw: string;
    edit: string;
    dimension: string;
    measure: string;
    demarcation: string;
    attach: string;
  };
  disclaimer: {
    rasterTitle: string;
    rasterBody: string;
  };
  homeMenu: {
    savedWork: string;
    plotList: string;
    reports: string;
    settings: string;
  };
  workspace: {
    openMap: string;
    jumpToWorkspace: string;
    openWizard: string;
    hintLabel: string;
    next: string;
    back: string;
    plotsCount: string;
    totalArea: string;
    noPlotsYet: string;
  };
  settings: {
    title: string;
    language: string;
    theme: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    kathaSqFt: string;
    bighaShotok: string;
    orgName: string;
    orgNamePlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    advancedModeLabel: string;
    advancedModeDesc: string;
  };
}

const BN: Translations = {
  appName: 'SurveyCAD',
  tagline: 'অফলাইন ২ডি জমি পরিমাপ ও সার্ভে ক্যাড',
  homeSubtitle: 'কাজ শুরু করতে নিচের যেকোনো একটি সহজ নির্দেশিত পদ্ধতি বেছে নিন',
  wizards: {
    measure: {
      title: 'জমি মাপা',
      desc: 'হাতে দাগ টেনে, বাহুর মাপ লিখে বা নকশা থেকে জমি ও শতক-কাঠা বের করুন',
    },
    pantograph: {
      title: 'প্যান্টাগ্রাফ',
      desc: 'মৌজা নকশার স্কেল পরিবর্তন করে ১৬″, ৩২″ বা ৬৪″ অনুপাতে দাগ তুলুন',
    },
    joint: {
      title: 'জমি জয়েন্ট',
      desc: 'একাধিক মৌজা সিট বা নকশা সাধারণ বিন্দু মিলিয়ে একত্রে জোড়া দিন',
    },
    demarcation: {
      title: 'ডিমার্কেশন',
      desc: 'CS ও RS ম্যাপ ওভারলে করে সাবেক–হাল দাগ নির্ণয় ও ওভারল্যাপ মাপুন',
    },
  },
  actions: {
    openCanvas: 'সরাসরি ক্যানভাস খুলুন',
    newProject: 'নতুন প্রজেক্ট',
    recentProjects: 'সংরক্ষিত প্রজেক্টসমূহ',
    noRecentProjects: 'এখনো কোনো প্রজেক্ট সংরক্ষণ করা হয়নি। উপরে একটি কাজ শুরু করুন।',
    backHome: 'হোম',
    undo: 'পিছনে',
    redo: 'সামনে',
    fitView: 'পুরোটা দেখুন',
    advancedMode: 'উন্নত মোড',
    advancedModeOn: 'উন্নত মোড চালু',
    finish: 'সম্পন্ন',
    cancel: 'বাতিল',
    close: 'বন্ধ করুন',
    save: 'সংরক্ষণ',
    apply: 'প্রয়োগ করুন',
    delete: 'মুছুন',
    rename: 'নাম বদলান',
    exportPdf: 'PDF রিপোর্ট',
    exportCsv: 'CSV তালিকা',
    exportDxf: 'DXF ফাইল',
    exportJson: 'JSON ব্যাকআপ',
    importFile: 'ফাইল আনুন',
    installApp: 'ইনস্টল করুন',
    offlineBadge: 'অফলাইনে চলছে',
    unitSettings: 'একক প্রোফাইল',
    license: 'লাইসেন্স',
    helpTip: 'নির্দেশনা',
  },
  categories: {
    file: 'ফাইল',
    plot: 'দাগ',
    draw: 'আঁকা',
    edit: 'সম্পাদনা',
    dimension: 'ডাইমেনশন',
    measure: 'মাপ',
    demarcation: 'ডিমারকেশন',
    attach: 'সংযুক্ত',
  },
  disclaimer: {
    rasterTitle: 'স্ক্যান ম্যাপ সতর্কবার্তা',
    rasterBody:
      'স্ক্যান করা মৌজা নকশা বা ছবি থেকে পরিমাপকৃত ফলাফল আনুমানিক। চূড়ান্ত আইনি বা দলিলের কাজে সরেজমিন সার্ভে যাচাই আবশ্যক।',
  },
  homeMenu: {
    savedWork: 'সেভ করা কাজ',
    plotList: 'দাগ তালিকা',
    reports: 'রিপোর্ট',
    settings: 'সেটিংস',
  },
  workspace: {
    openMap: 'ম্যাপ খুলুন',
    jumpToWorkspace: 'ক্যানভাসে যান',
    openWizard: 'উইজার্ড খুলুন',
    hintLabel: 'টিপস',
    next: 'পরবর্তী',
    back: 'পিছনে',
    plotsCount: 'মোট দাগ',
    totalArea: 'মোট জমি',
    noPlotsYet: 'ক্যানভাসে কোনো দাগ নেই',
  },
  settings: {
    title: 'সেটিংস ও প্রোফাইল',
    language: 'ভাষা',
    theme: 'থিম',
    themeLight: 'হালকা',
    themeDark: 'গাঢ়',
    themeSystem: 'সিস্টেম',
    kathaSqFt: '১ কাঠা (বর্গফুট)',
    bighaShotok: '১ বিঘা (শতক)',
    orgName: 'প্রতিষ্ঠানের নাম (ঐচ্ছিক)',
    orgNamePlaceholder: 'যেমন: ডিজিটাল সার্ভে ও আমিন অফিস',
    phone: 'ফোন নম্বর (ঐচ্ছিক)',
    phonePlaceholder: 'যেমন: ০১৭XXXXXXXX',
    advancedModeLabel: 'উন্নত মোড (CAD টুলস)',
    advancedModeDesc: 'চালু করলে ক্যানভাসের নিচে ডানে "+" বোতামে পূর্ণাঙ্গ CAD টুল মেনু দেখা যাবে',
  },
};

const EN: Translations = {
  appName: 'SurveyCAD',
  tagline: 'Offline 2D Land Survey & CAD Workspace',
  homeSubtitle: 'Choose a guided workflow below to start measuring or drafting',
  wizards: {
    measure: {
      title: 'Measure Plot',
      desc: 'Draw on canvas, enter tape sides/diagonal, or calibrate a scanned map',
    },
    pantograph: {
      title: 'Pantograph',
      desc: 'Rescale mouza plots across 16″, 32″, 64″ per mile or custom ratios',
    },
    joint: {
      title: 'Map Joint',
      desc: 'Align and stitch two scanned mouza sheets using common tie points',
    },
    demarcation: {
      title: 'Demarcation',
      desc: 'Overlay RS on CS map to locate old (Sabek) & current (Hal) dag overlap',
    },
  },
  actions: {
    openCanvas: 'Open CAD Canvas',
    newProject: 'New Project',
    recentProjects: 'Saved Projects',
    noRecentProjects: 'No saved projects yet. Start a guided workflow above.',
    backHome: 'Home',
    undo: 'Undo',
    redo: 'Redo',
    fitView: 'Zoom Fit',
    advancedMode: 'Advanced Mode',
    advancedModeOn: 'Advanced On',
    finish: 'Finish',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    apply: 'Apply',
    delete: 'Delete',
    rename: 'Rename',
    exportPdf: 'PDF Report',
    exportCsv: 'CSV Table',
    exportDxf: 'DXF Export',
    exportJson: 'JSON Backup',
    importFile: 'Import File',
    installApp: 'Install App',
    offlineBadge: 'Running Offline',
    unitSettings: 'Unit Profile',
    license: 'License',
    helpTip: 'Guide',
  },
  categories: {
    file: 'File',
    plot: 'Plot',
    draw: 'Draw',
    edit: 'Edit',
    dimension: 'Dimension',
    measure: 'Measure',
    demarcation: 'Demarcation',
    attach: 'Attach',
  },
  disclaimer: {
    rasterTitle: 'Scanned Map Notice',
    rasterBody:
      'Measurements taken from scanned maps or photos are approximate. Verify with a physical ground survey before legal or deed execution.',
  },
  homeMenu: {
    savedWork: 'Saved Work',
    plotList: 'Plot List',
    reports: 'Reports',
    settings: 'Settings',
  },
  workspace: {
    openMap: 'Open Map',
    jumpToWorkspace: 'Jump to Canvas',
    openWizard: 'Open Wizard',
    hintLabel: 'Hint',
    next: 'Next',
    back: 'Back',
    plotsCount: 'Plots',
    totalArea: 'Total Area',
    noPlotsYet: 'No plots on canvas',
  },
  settings: {
    title: 'Settings & Profile',
    language: 'Language',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    kathaSqFt: '1 Katha (sq ft)',
    bighaShotok: '1 Bigha (shotok)',
    orgName: 'Organization Name (optional)',
    orgNamePlaceholder: 'e.g. Bengal Survey Office',
    phone: 'Phone Number (optional)',
    phonePlaceholder: 'e.g. 017XXXXXXXX',
    advancedModeLabel: 'Advanced Mode (CAD Tools)',
    advancedModeDesc: 'When enabled, shows the bottom-right "+" button with full CAD tool categories',
  },
};

export function getTranslations(lang: Lang): Translations {
  return lang === 'bn' ? BN : EN;
}
