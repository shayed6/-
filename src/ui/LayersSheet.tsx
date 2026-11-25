import React, { useState } from 'react';
import {
  Check,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Trash2,
  Unlock,
} from 'lucide-react';
import { CadLayer } from '../core/cad/types';
import { BottomSheet } from './BottomSheet';
import { Lang } from './i18n';

interface LayersSheetProps {
  open: boolean;
  lang: Lang;
  layers: CadLayer[];
  activeLayerId: string;
  onSelectActiveLayer: (id: string) => void;
  onCreateLayer: (layer: CadLayer) => void;
  onUpdateLayer: (id: string, patch: Partial<CadLayer>) => void;
  onDeleteLayer: (id: string) => void;
  onClose: () => void;
}

const LAYER_COLORS = [
  '#0F5132',
  '#15803D',
  '#0369A1',
  '#B45309',
  '#7C3AED',
  '#DC2626',
  '#1E293B',
  '#475569',
];

export const LayersSheet: React.FC<LayersSheetProps> = ({
  open,
  lang,
  layers,
  activeLayerId,
  onSelectActiveLayer,
  onCreateLayer,
  onUpdateLayer,
  onDeleteLayer,
  onClose,
}) => {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#0F5132');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateLayer({
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: trimmed,
      color: newColor,
      visible: true,
      locked: false,
    });
    setNewName('');
  };

  return (
    <BottomSheet
      open={open}
      title={lang === 'bn' ? 'লেয়ার ব্যবস্থাপনা (Layers)' : 'Layers Manager'}
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Create New Layer */}
        <div className="rounded-xl border border-[#D4DBD6] dark:border-slate-700 bg-[#FAFBF8] dark:bg-slate-800/70 p-3 space-y-2.5">
          <div className="text-xs font-bold text-[#141A17] dark:text-slate-200">
            {lang === 'bn' ? 'নতুন লেয়ার তৈরি করুন' : 'Create New Layer'}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={lang === 'bn' ? 'লেয়ারের নাম লিখুন...' : 'New layer name...'}
              className="flex-1 min-h-[40px] rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-[#0F5132] dark:bg-emerald-600 px-3.5 text-xs font-bold text-white disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              <span>{lang === 'bn' ? 'যোগ করুন' : 'Add'}</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {LAYER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setNewColor(c)}
                className={`h-6 w-6 rounded-md border-2 ${
                  newColor === c
                    ? 'border-[#141A17] dark:border-white scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Layer Rows */}
        <div className="space-y-2">
          {layers.map((layer) => {
            const isActive = layer.id === activeLayerId;
            const isEditing = editingId === layer.id;

            return (
              <div
                key={layer.id}
                className={`rounded-xl border p-2.5 transition-colors ${
                  isActive
                    ? 'border-[#0F5132] bg-[#0F5132]/8 dark:border-emerald-500 dark:bg-emerald-500/15'
                    : 'border-[#E5E9E4] dark:border-slate-700 bg-white dark:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Active selector & Name */}
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 min-h-[34px] rounded-lg border border-[#0F5132] bg-white dark:bg-slate-900 px-2 text-xs font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = editingName.trim();
                          if (trimmed) {
                            onUpdateLayer(layer.id, { name: trimmed });
                          }
                          setEditingId(null);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F5132] text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectActiveLayer(layer.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/15"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span className="truncate text-sm font-bold text-[#141A17] dark:text-slate-100">
                        {layer.name}
                      </span>
                      {isActive && (
                        <span className="rounded-md bg-[#0F5132] dark:bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {lang === 'bn' ? 'সক্রিয়' : 'Active'}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Layer Controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={lang === 'bn' ? 'নাম বদলান' : 'Rename layer'}
                      onClick={() => {
                        setEditingId(layer.id);
                        setEditingName(layer.name);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#EAECE7] dark:hover:bg-slate-700"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-[#4A5550] dark:text-slate-300" />
                    </button>

                    <button
                      type="button"
                      aria-label={lang === 'bn' ? 'দৃশ্যমানতা' : 'Toggle visibility'}
                      onClick={() =>
                        onUpdateLayer(layer.id, { visible: !layer.visible })
                      }
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        layer.visible
                          ? 'text-[#0F5132] dark:text-emerald-400 hover:bg-[#EAECE7] dark:hover:bg-slate-700'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}
                    >
                      {layer.visible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label={lang === 'bn' ? 'লক' : 'Toggle lock'}
                      onClick={() =>
                        onUpdateLayer(layer.id, { locked: !layer.locked })
                      }
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        layer.locked
                          ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                          : 'text-[#4A5550] dark:text-slate-300 hover:bg-[#EAECE7] dark:hover:bg-slate-700'
                      }`}
                    >
                      {layer.locked ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {layers.length > 1 && (
                      <button
                        type="button"
                        aria-label={lang === 'bn' ? 'মুছুন' : 'Delete layer'}
                        onClick={() => onDeleteLayer(layer.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Color swatches row for active/editing */}
                <div className="mt-2 flex items-center gap-1.5">
                  {LAYER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onUpdateLayer(layer.id, { color: c })}
                      className={`h-4 w-4 rounded-sm border ${
                        layer.color === c
                          ? 'border-[#141A17] dark:border-white ring-1 ring-[#141A17] dark:ring-white'
                          : 'border-black/15'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
};
