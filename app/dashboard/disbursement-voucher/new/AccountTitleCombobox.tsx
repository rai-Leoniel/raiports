'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';

import { apiFetch } from '@/lib/api-client';

export type AccountTitleOption = {
  value: string;
  label: string;
  sl: boolean;
};

type AccountTitleRow = {
  value: string;
  label: string;
  sl: boolean;
};

type AccountTitleComboboxProps = {
  value: string;
  onChange: (account: AccountTitleOption) => void;
  placeholder?: string;
};

export default function AccountTitleCombobox({
  value,
  onChange,
  placeholder = 'Click to select an account title...',
}: AccountTitleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountTitleRow[]>([]);
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

  const loadAccountsIfNeeded = () => {
    if (loaded || loading) return;
    setLoading(true);
    setLoadError(false);
    apiFetch('/approval/reports/chart-of-accounts/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.accounts;
        if (Array.isArray(list)) {
          const mapped = list.map((a: { value: string; label: string; sl?: boolean }) => ({
            value: a.value,
            label: a.label,
            sl: !!a.sl,
          }));
          // Sorted alphabetically by name here only — the backend keeps
          // at_code order since reports/other pickers rely on that to
          // match the desktop's chart-of-accounts sequence.
          mapped.sort((a, b) => a.label.localeCompare(b.label));
          setAccounts(mapped);
          setLoaded(true);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  const openDropdown = () => {
    setOpen(true);
    setSearch('');
    loadAccountsIfNeeded();
  };

  const filteredAccounts = accounts.filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      a.label.toLowerCase().includes(q) ||
      a.value.toLowerCase().includes(q)
    );
  });

  const chooseAccount = (row: AccountTitleRow) => {
    onChange({ value: row.value, label: row.label, sl: row.sl });
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-3 text-left flex items-center justify-between"
      >
        <span className={value ? '' : 'text-slate-400'}>
          {value || placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
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
                Could not load account titles.
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                No matches.
              </div>
            ) : (
              filteredAccounts.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => chooseAccount(r)}
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