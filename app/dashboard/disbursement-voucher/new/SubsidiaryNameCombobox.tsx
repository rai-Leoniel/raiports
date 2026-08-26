'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';

import { apiFetch } from '@/lib/api-client';

// Matches the desktop's "Subsidiary Name" field on the Add Item line entry
// — a small inline searchable dropdown, same interaction pattern as
// AccountTitleCombobox. Confirmed via pgAdmin that the desktop's Subsidiary
// Name list is exactly rssys.m07 (the same Supplier master table already
// powering SupplierPickerModal / Check Payee) — so this reuses the existing
// GET /approval/reports/suppliers/ endpoint rather than adding a new one.
//
// Supports a `disabled` prop: the desktop disables this field entirely for
// accounts that aren't subledger accounts (m04.sl = 'N', e.g. Petty Cash
// Fund) — only subledger accounts (sl = 'Y', e.g. Accounts Payable) need a
// subsidiary attached. The page passes disabled={!draft.at_sl}.

export type SubsidiaryNameOption = {
  value: string;
  label: string;
};

type SubsidiaryNameRow = {
  value: string;
  label: string;
};

type SubsidiaryNameComboboxProps = {
  value: string;
  onChange: (subsidiary: SubsidiaryNameOption) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function SubsidiaryNameCombobox({
  value,
  onChange,
  placeholder = 'Click to select a subsidiary...',
  disabled = false,
}: SubsidiaryNameComboboxProps) {
  const [open, setOpen] = useState(false);
  const [subsidiaries, setSubsidiaries] = useState<SubsidiaryNameRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // If the field becomes disabled while its dropdown happens to be open,
  // close it immediately.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const loadSubsidiariesIfNeeded = () => {
    if (loaded || loading) return;
    setLoading(true);
    setLoadError(false);
    apiFetch('/approval/reports/suppliers/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.suppliers;
        if (Array.isArray(list)) {
          setSubsidiaries(list);
          setLoaded(true);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setSearch('');
    loadSubsidiariesIfNeeded();
  };

  const filteredSubsidiaries = subsidiaries.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.label.toLowerCase().includes(q) ||
      s.value.toLowerCase().includes(q)
    );
  });

  const chooseSubsidiary = (row: SubsidiaryNameRow) => {
    onChange({ value: row.value, label: row.label });
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={`w-full h-9 rounded-md border text-sm px-3 text-left flex items-center justify-between ${
          disabled
            ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/40 text-slate-400 cursor-not-allowed'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
        }`}
      >
        <span className={value && !disabled ? '' : 'text-slate-400'}>
          {disabled ? 'Not applicable for this account' : value || placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type to filter..."
            className="w-full h-8 px-3 text-xs border-b border-slate-100 dark:border-slate-700 bg-transparent outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading...
              </div>
            ) : loadError ? (
              <div className="px-3 py-6 text-center text-xs text-red-500">
                Could not load subsidiaries.
              </div>
            ) : filteredSubsidiaries.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                No matches.
              </div>
            ) : (
              filteredSubsidiaries.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => chooseSubsidiary(r)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                >
                  {r.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}