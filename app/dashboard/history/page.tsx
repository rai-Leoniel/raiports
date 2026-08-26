'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, FilterX, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type HistoryItem = {
  __category?: string; // display name, e.g. "Petty Cash Voucher" -- tagged at fetch time
  [key: string]: any;
};

type TabKey = 'approved' | 'disapproved' | 'cancelled';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'approved', label: 'Approved' },
  { key: 'disapproved', label: 'Disapproved' },
  { key: 'cancelled', label: 'Cancelled' },
];

// Same 8 categories used on the dashboard -- must match the backend's
// transaction_type labels exactly (see dashboard/page.tsx).
const transactionTypes = [
  'All Types',
  'Petty Cash Voucher',
  'Disbursement Voucher',
  'Purchase Order',
  'Direct Purchase',
  'Stock Transfer',
  'Stock Adjustment',
  'Loan Approval',
  'Stock Issuance',
];

// NEW: same typeKeyMap as dashboard/page.tsx -- the decision-history
// endpoint expects the short backend code (e.g. "petty_cash"), not the
// display name, as its transaction_type query param.
const typeKeyMap: Record<string, string> = {
  'Petty Cash Voucher': 'petty_cash',
  'Disbursement Voucher': 'disbursement_voucher',
  'Purchase Order': 'purchase_order',
  'Direct Purchase': 'direct_purchase',
  'Stock Transfer': 'stock_transfer',
  'Stock Adjustment': 'stock_adjustment',
  'Loan Approval': 'loan_approval',
  'Stock Issuance': 'stock_issuance',
};

// CHANGED: added 'specific' (single exact date) and 'custom' (From/To
// range) alongside the existing quick presets.
type DateRangeKey = 'all' | 'today' | 'last7' | 'thisMonth' | 'specific' | 'custom';

const dateRanges: { key: DateRangeKey; label: string }[] = [
  { key: 'all', label: 'All Dates' },
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'specific', label: 'Specific Date' },
  { key: 'custom', label: 'Custom Range' },
];

// Helper: format a Date as yyyy-mm-dd for <input type="date"> values,
// using local time (not UTC) so it lines up with what the user picked.
const toDateInputValue = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function HistoryPage() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('approved');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Applied filters (used for fetching/filtering the list)
  const [transactionType, setTransactionType] = useState('All Types');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  // NEW: applied values for the specific-date / custom-range pickers.
  const [specificDate, setSpecificDate] = useState(''); // yyyy-mm-dd
  const [customFrom, setCustomFrom] = useState(''); // yyyy-mm-dd
  const [customTo, setCustomTo] = useState(''); // yyyy-mm-dd

  // Draft filters (edited inside the modal, only committed on "Apply")
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftType, setDraftType] = useState('All Types');
  const [draftDateRange, setDraftDateRange] = useState<DateRangeKey>('all');
  const [draftSpecificDate, setDraftSpecificDate] = useState('');
  const [draftCustomFrom, setDraftCustomFrom] = useState('');
  const [draftCustomTo, setDraftCustomTo] = useState('');

  const openFilter = () => {
    setDraftType(transactionType);
    setDraftDateRange(dateRange);
    setDraftSpecificDate(specificDate);
    setDraftCustomFrom(customFrom);
    setDraftCustomTo(customTo);
    setFilterOpen(true);
  };

  const applyFilter = () => {
    setTransactionType(draftType);
    setDateRange(draftDateRange);
    setSpecificDate(draftSpecificDate);
    setCustomFrom(draftCustomFrom);
    setCustomTo(draftCustomTo);
    setFilterOpen(false);
  };

  const clearFilter = () => {
    setDraftType('All Types');
    setDraftDateRange('all');
    setDraftSpecificDate('');
    setDraftCustomFrom('');
    setDraftCustomTo('');
  };

  const activeFilterCount =
    (transactionType !== 'All Types' ? 1 : 0) + (dateRange !== 'all' ? 1 : 0);

  // FIX: this used to call a nonexistent endpoint (/approval/history/) that
  // always 404'd/failed silently, so History showed "No records" regardless
  // of real data. Now fetches from the real /approval/decision-history/
  // endpoint, once per category -- same call pattern as the dashboard's
  // fetchDecidedData -- and combines the results into one flat list tagged
  // with the display category name (__category) for filtering/display.
  //
  // CHANGED: now uses apiFetch (same as dashboard/page.tsx) instead of raw
  // fetch(), so every request carries the X-Tenant header -- previously
  // this always queried whatever tenant the backend defaulted to,
  // regardless of which company was actually selected in Settings.
  useEffect(() => {
    if (!user?.branch) return;

    const fetchHistory = async () => {
      setLoading(true);

      try {
        const categoryNames = transactionTypes.filter((t) => t !== 'All Types');

        const results = await Promise.all(
          categoryNames.map(async (displayName) => {
            const backendType = typeKeyMap[displayName] ?? displayName;
            const res = await apiFetch(
              `/approval/decision-history/?branch=${user.branch}&transaction_type=${backendType}`
            );
            if (!res.ok) return [] as HistoryItem[];
            const data = await res.json();
            const list: HistoryItem[] = data?.[backendType] || [];
            return list.map((item) => ({ ...item, __category: displayName }));
          })
        );

        const combined = results.flat();

        if (combined.length > 0) {
          console.log('Sample history item:', combined[0]);
        }

        setItems(combined);
      } catch (error) {
        console.error('Error fetching history:', error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user?.branch]);

  // Real field names, matching the actual /approval/decision-history/
  // response shape confirmed from approval.py: id, reference_no, amount,
  // j_code, j_num, prepared_by, transaction_date, decision_datetime,
  // responded_by, reason_declined, transaction_type, transaction_status.
  const getTxRef = (item: HistoryItem) => item.reference_no || item.id || '—';
  const getPreparer = (item: HistoryItem) => item.prepared_by || 'System';
  const getAmount = (item: HistoryItem) =>
    typeof item.amount === 'number' ? item.amount : 0;
  const getType = (item: HistoryItem) => item.__category || '';
  const getRawDate = (item: HistoryItem) =>
    item.decision_datetime || item.transaction_date || null;
  const getDate = (item: HistoryItem) => {
    const raw = getRawDate(item);
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  // NEW: who actually approved/disapproved it, and why (for disapprovals).
  const getRespondedBy = (item: HistoryItem) => item.responded_by || 'System';
  const getReason = (item: HistoryItem) => item.reason_declined || null;

  // NEW: maps the backend's transaction_status ("Approved" / "Disapproved")
  // to the tab this item belongs on. Note: the backend's decision-history
  // query only ever produces "Approved" or "Disapproved" (see approval.py's
  // Decision_History) -- there's currently no "Cancelled" status coming
  // from the API, so that tab will stay empty until the backend adds one.
  const getTabForItem = (item: HistoryItem): TabKey | null => {
    const status = String(item.transaction_status || '').trim().toLowerCase();
    if (status === 'approved') return 'approved';
    if (status === 'disapproved' || status === 'declined') return 'disapproved';
    if (status === 'cancelled') return 'cancelled';
    return null;
  };

  const matchesDateRange = (item: HistoryItem) => {
    if (dateRange === 'all') return true;
    const raw = getRawDate(item);
    if (!raw) return false;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dateRange === 'today') {
      return d >= startOfToday;
    }
    if (dateRange === 'last7') {
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return d >= sevenDaysAgo;
    }
    if (dateRange === 'thisMonth') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    // NEW: exact single-day match. specificDate is a yyyy-mm-dd string from
    // <input type="date">; parse it as local time (not UTC) so "Aug 25"
    // means Aug 25 in the user's timezone, not the day before.
    if (dateRange === 'specific') {
      if (!specificDate) return true; // no date chosen yet -- don't filter anything out
      const [y, m, dd] = specificDate.split('-').map(Number);
      return (
        d.getFullYear() === y &&
        d.getMonth() === m - 1 &&
        d.getDate() === dd
      );
    }
    // NEW: inclusive From/To range. If only one side is set, treat it as
    // an open-ended range (>= From, or <= To).
    if (dateRange === 'custom') {
      if (!customFrom && !customTo) return true;
      if (customFrom) {
        const [fy, fm, fd] = customFrom.split('-').map(Number);
        const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
        if (d < from) return false;
      }
      if (customTo) {
        const [ty, tm, td] = customTo.split('-').map(Number);
        const to = new Date(ty, tm - 1, td, 23, 59, 59, 999);
        if (d > to) return false;
      }
      return true;
    }
    return true;
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (getTabForItem(item) !== activeTab) {
        return false;
      }
      if (transactionType !== 'All Types' && getType(item) !== transactionType) {
        return false;
      }
      if (!matchesDateRange(item)) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          String(getTxRef(item)).toLowerCase().includes(q) ||
          String(getPreparer(item)).toLowerCase().includes(q) ||
          String(getAmount(item)).includes(q);
        if (!matchesSearch) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeTab, search, transactionType, dateRange, specificDate, customFrom, customTo]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="font-heading text-3xl font-bold text-slate-900 dark:text-white mb-1">
          Decision History
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          View all past transactions and their approval decisions.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transaction, preparer, amount..."
            className="h-11 rounded-full pl-10 dark:bg-slate-800"
          />
        </div>
        <button
          type="button"
          onClick={openFilter}
          className="relative h-11 w-11 shrink-0 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          title="Filter history"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[10px] rounded-full flex items-center justify-center font-heading tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-700 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-center text-sm text-slate-400 py-16">Loading history...</p>
      )}

      {!loading && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <FilterX className="w-6 h-6 text-slate-400" />
          </div>
          <p className="font-heading font-semibold text-slate-900 dark:text-white mb-1">
            No {activeTab} records
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeTab === 'cancelled'
              ? "Cancelled isn't tracked by the API yet."
              : 'Try changing the filters or search keyword.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filteredItems.map((item, i) => (
          <div
            key={getTxRef(item) + i}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-heading font-semibold text-sm text-slate-900 dark:text-white truncate">
                  {getTxRef(item)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {getType(item)} &middot; {getPreparer(item)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-heading tabular-nums font-semibold text-sm text-slate-900 dark:text-white">
                  ₱{getAmount(item).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-400">{getDate(item)}</p>
              </div>
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                {activeTab === 'disapproved' ? 'Disapproved by' : 'Approved by'}{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {getRespondedBy(item)}
                </span>
              </span>
            </div>

            {activeTab === 'disapproved' && getReason(item) && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                Reason: {getReason(item)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Filter modal -- Transaction Type + Date Range pills, matching the mobile app */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setFilterOpen(false)}
          />

          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-800 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                Filter History
              </h3>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 pb-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Transaction Type
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {transactionTypes.map((type) => {
                  const isActive = draftType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDraftType(type)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10'
                          : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Date Range
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {dateRanges.map((range) => {
                  const isActive = draftDateRange === range.key;
                  return (
                    <button
                      key={range.key}
                      type="button"
                      onClick={() => setDraftDateRange(range.key)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10'
                          : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {range.label}
                    </button>
                  );
                })}
              </div>

              {/* NEW: single-date picker, shown only when "Specific Date" is selected */}
              {draftDateRange === 'specific' && (
                <div className="mb-6">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Select date
                  </label>
                  <input
                    type="date"
                    value={draftSpecificDate}
                    max={toDateInputValue(new Date())}
                    onChange={(e) => setDraftSpecificDate(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              )}

              {/* NEW: From/To range pickers, shown only when "Custom Range" is selected */}
              {draftDateRange === 'custom' && (
                <div className="mb-6 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      From
                    </label>
                    <input
                      type="date"
                      value={draftCustomFrom}
                      max={draftCustomTo || toDateInputValue(new Date())}
                      onChange={(e) => setDraftCustomFrom(e.target.value)}
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      To
                    </label>
                    <input
                      type="date"
                      value={draftCustomTo}
                      min={draftCustomFrom}
                      max={toDateInputValue(new Date())}
                      onChange={(e) => setDraftCustomTo(e.target.value)}
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
              )}

              {/* Spacer to preserve original bottom margin when neither picker is shown */}
              {draftDateRange !== 'specific' && draftDateRange !== 'custom' && (
                <div className="mb-3" />
              )}
            </div>

            <div className="flex items-center gap-3 px-6 pb-6">
              <Button
                type="button"
                variant="outline"
                onClick={clearFilter}
                className="h-11 flex-1 rounded-full border-slate-200 dark:border-slate-600"
              >
                Clear
              </Button>
              <Button
                type="button"
                onClick={applyFilter}
                className="h-11 flex-1 rounded-full bg-orange-500 text-white hover:bg-orange-600"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}