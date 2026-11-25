import React from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  title,
  onClose,
  children,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-[#D4DBD6] dark:border-slate-700 shadow-2xl max-h-[88vh] flex flex-col pb-safe">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-[#CBD5E1] dark:bg-slate-700 sm:hidden" />
        <div className="flex items-center justify-between border-b border-[#E5E9E4] dark:border-slate-800 px-5 py-3.5">
          <h3 className="text-base font-bold text-[#141A17] dark:text-slate-100 truncate pr-2">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#4A5550] dark:text-slate-300 hover:bg-[#EAECE7] dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 text-[#141A17] dark:text-slate-100">
          {children}
        </div>
      </div>
    </div>
  );
};

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-xl bg-[#141A17] dark:bg-slate-100 px-4 py-2.5 text-xs font-semibold text-white dark:text-slate-900 shadow-xl whitespace-nowrap max-w-[92vw] truncate"
    >
      {message}
    </div>
  );
};
