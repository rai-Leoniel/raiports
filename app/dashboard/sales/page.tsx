'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getApiUrl } from '@/lib/api-config';
import {
  Search,
  Calendar,
  MapPin,
  FileText,
  Receipt,
  Truck,
  Undo2,
  BookCheck,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Plus,
  SlidersHorizontal,
  X,
  UserPlus,
  Pencil,
  Printer,
  Save,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

// SHARED — this replaces the old inline CustomerPickerModal that used to
// live in this file. It's the same component used by the Disbursement
// Voucher entry form's Customer tab (moved to components/customers/ and
// widened to return address/phone/email/active so Sales can populate its
// order entry header without a second fetch). Adjust this import path if
// you moved the file somewhere else.
import CustomerPickerModal, { type CustomerOption } from '@/components/customers/CustomerPickerModal';

// TEMPLATE / UI ONLY — counts below are placeholders. Once the backend
// exposes real Sales Order / Billing / Dispatch / Sales Return / Journalize
// Sales counts (same pattern as /approval/pending/ on the main dashboard,
// or a dedicated totals endpoint like the Purchase Order one), swap these
// static numbers for fetched state and wire onClick to the real flow.
type FlowStage = {
  id: string;
  label: string;
  icon: typeof FileText;
  color: 'blue' | 'purple' | 'green' | 'red' | 'orange';
  count: number;
  desc: string;
};

const flowStages: FlowStage[] = [
  { id: 'sales_order', label: 'Sales order', icon: FileText, color: 'blue', count: 12, desc: 'Orders awaiting billing' },
  { id: 'billing', label: 'Billing', icon: Receipt, color: 'purple', count: 5, desc: 'Invoiced, ready to dispatch' },
  { id: 'dispatch', label: 'Dispatch', icon: Truck, color: 'green', count: 3, desc: 'Out for delivery' },
];

const returnFlow: FlowStage[] = [
  { id: 'sales_return', label: 'Sales return', icon: Undo2, color: 'red', count: 2, desc: 'Returns to process' },
  { id: 'journalize', label: 'Journalize sales', icon: BookCheck, color: 'orange', count: 4, desc: 'Pending journal entries' },
];

const colorMap: Record<FlowStage['color'], string> = {
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300',
  green: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300',
  red: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300',
};

function StageCard({ stage, isLast, onClick }: { stage: FlowStage; isLast?: boolean; onClick?: () => void }) {
  const Icon = stage.icon;
  return (
    <div className="flex items-center gap-3 flex-1">
      <button type="button" onClick={onClick} className="flex-1 text-left group">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colorMap[stage.color]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-0.5">{stage.label}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">{stage.desc}</p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            View details <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </button>
      {!isLast && <ArrowRight className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0 hidden md:block" />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Customer type used throughout Sales Order Entry / List                 */
/* ---------------------------------------------------------------------- */

type Customer = {
  seq: number;
  name: string;
  address: string;
  mobile: string;
  fax: string;
  email: string;
  tin: string;
  subLedger2: string;
  custId: string;
  type: string;
  modType: string;
  disc: string;
  active: boolean;
  inactive?: boolean;
};

// Maps the shared CustomerPickerModal's return shape (CustomerOption —
// value/label/address/phone/email/active) onto the richer Customer shape
// Sales Order Entry displays. Fields the picker doesn't provide (fax,
// TIN, sub-ledger2, mod type, discount) are mapped to '—' rather than
// faked, same convention the old inline version used.
function toSalesCustomer(c: CustomerOption): Customer {
  return {
    seq: 0,
    name: c.label,
    address: c.address || '—',
    mobile: c.phone || 'N/A',
    fax: 'N/A',
    email: c.email || '—',
    tin: '—',
    subLedger2: '—',
    custId: c.value,
    type: 'Customer',
    modType: '—',
    disc: '—',
    active: c.active !== false,
  };
}

/* ---------------------------------------------------------------------- */
/* Authorization Password modal — gates "New sales order" (Create New),   */
/* matching the desktop's popup exactly. Backed by rssys.repmst.          */
/* ---------------------------------------------------------------------- */

type AuthorizedRep = { value: string; label: string };

function AuthorizationModal({
  onClose,
  onAuthorized,
}: {
  onClose: () => void;
  onAuthorized: (repLabel: string) => void;
}) {
  const [reps, setReps] = useState<AuthorizedRep[]>([]);
  const [repsLoading, setRepsLoading] = useState(true);
  const [repCode, setRepCode] = useState('');
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const API_URL = getApiUrl();
  const token = typeof window !== 'undefined' ? localStorage.getItem('raiports-access-token') : null;
  const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
  const authHeaders = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { 'X-Tenant': tenant } : {}),
  };

  useEffect(() => {
    // Explicit safety net against Chrome autofill pre-populating this
    // field with a previously-saved password — autoComplete="new-password"
    // on the input handles most cases, this covers the rest.
    setPassword('');

    async function loadReps() {
      setRepsLoading(true);
      try {
        const res = await fetch(`${API_URL}/approval/authorized-reps/`, { headers: authHeaders });
        const data = await res.json();
        const list: AuthorizedRep[] = data.reps || [];
        setReps(list);
        if (list.length > 0) setRepCode(list[0].value);
      } catch (err) {
        console.error('Failed to load authorized reps:', err);
        setError('Could not load the authorized name list.');
      } finally {
        setRepsLoading(false);
      }
    }
    loadReps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    if (!repCode) {
      setError('Please select an authorized name.');
      return;
    }
    if (!password) {
      setError('Please enter the password.');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/approval/verify-authorization/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ rep_code: repCode, password }),
      });
      const data = await res.json();

       if (res.ok && data.authorized) {
        const repLabel = reps.find((r) => r.value === repCode)?.label || repCode;
        onAuthorized(repLabel);
        return;
      }
      setError(data.message || 'Incorrect name or password.');
    } catch (err) {
      console.error('Authorization verify failed:', err);
      setError('Could not reach the server. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerify();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-orange-500" />
            <h3 className="font-heading font-bold text-slate-900 dark:text-white">Authorization Password</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4" onKeyDown={handleKeyDown}>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Authorized Name
            </label>
            {repsLoading ? (
              <div className="h-10 flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...
              </div>
            ) : (
              <div className="relative">
                <select
                  value={repCode}
                  onChange={(e) => setRepCode(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {reps.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying || repsLoading}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {verifying && <Loader2 className="w-3.5 h-3.5 mr-1.5 inline animate-spin" />}
            {verifying ? 'Verifying...' : 'Authorize'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Journalize Sales modal — redesigned version of the desktop popup       */
/* ---------------------------------------------------------------------- */

type JournalizeResultRow = {
  invoiceNo: string;
  customer: string;
  date: string;
  amount: number;
  journalNo: string;
};

const PERIODS = ['2026 - August', '2026 - July', '2026 - June'];
const JOURNALIZE_BRANCHES = ['MANDAUE BRANCH', 'BUTUAN BRANCH', 'CARCAR BRANCH', 'GENERAL SANTOS BRANCH'];
const OUTLET_OPTIONS = ['All outlets', 'Main Store', 'Satellite Outlet 1', 'Satellite Outlet 2'];
const INVOICE_OPTIONS = ['INV-10001', 'INV-10050', 'INV-10100', 'INV-10231'];
const SALES_JOURNAL_OPTIONS = ['SJ-2026-08-MAN', 'SJ-2026-08-BUT', 'SJ-2026-08-CAR'];

const JOURNALIZE_RESULTS: JournalizeResultRow[] = [
  { invoiceNo: 'INV-10225', customer: 'Bacolod Hardware Supply', date: '2026-08-16', amount: 9800, journalNo: '—' },
  { invoiceNo: 'INV-10226', customer: 'Villareal Farm Supply', date: '2026-08-17', amount: 12750, journalNo: '—' },
  { invoiceNo: 'INV-10230', customer: 'Riverside Grocers', date: '2026-08-19', amount: 8200, journalNo: '—' },
];

function JournalizeSalesModal({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState(PERIODS[0]);
  const [dateFrom, setDateFrom] = useState('2026-08-01');
  const [dateTo, setDateTo] = useState('2026-08-31');
  const [branch, setBranch] = useState('');
  const [outlet, setOutlet] = useState('');
  const [invoicesFrom, setInvoicesFrom] = useState('');
  const [invoicesTo, setInvoicesTo] = useState('');
  const [salesJournal, setSalesJournal] = useState('');
  const [results, setResults] = useState<JournalizeResultRow[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const canProceed = Boolean(branch && outlet && salesJournal);

  const handleRefresh = () => {
    setResults(null);
  };

  const handleProceed = () => {
    if (!canProceed) return;
    setIsProcessing(true);
    setTimeout(() => {
      setResults(JOURNALIZE_RESULTS);
      setIsProcessing(false);
    }, 600);
  };

  const handleViewReport = () => {
    setResults(JOURNALIZE_RESULTS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white">Journalize sales</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Journalize options</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Period</label>
                <div className="relative flex-1">
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Dates</label>
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1">
                    <Calendar className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full pl-8 pr-2 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <span className="text-xs text-slate-400">to</span>
                  <div className="relative flex-1">
                    <Calendar className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full pl-8 pr-2 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Branch <span className="text-red-500">*</span></label>
                <div className="relative flex-1">
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select branch…</option>
                    {JOURNALIZE_BRANCHES.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Outlet <span className="text-red-500">*</span></label>
                <div className="relative flex-1">
                  <select
                    value={outlet}
                    onChange={(e) => setOutlet(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select outlet…</option>
                    {OUTLET_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Invoices from</label>
                <div className="relative flex-1">
                  <select
                    value={invoicesFrom}
                    onChange={(e) => setInvoicesFrom(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Any</option>
                    {INVOICE_OPTIONS.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Invoices to</label>
                <div className="relative flex-1">
                  <select
                    value={invoicesTo}
                    onChange={(e) => setInvoicesTo(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Any</option>
                    {INVOICE_OPTIONS.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-3 md:col-span-2">
                <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Sales journal <span className="text-red-500">*</span></label>
                <div className="relative flex-1">
                  <select
                    value={salesJournal}
                    onChange={(e) => setSalesJournal(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-orange-400 dark:border-orange-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select sales journal…</option>
                    {SALES_JOURNAL_OPTIONS.map((j) => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Transactions to journalize</p>
              {results && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{results.length} invoice{results.length === 1 ? '' : 's'}</span>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {!results ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                  Set the filters above, then Proceed or View Report to load transactions.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
                      <th className="px-4 py-2 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Invoice</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Customer</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-2 text-right font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Journal #</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.invoiceNo} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0">
                        <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{r.invoiceNo}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.customer}</td>
                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.date}</td>
                        <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">{peso(r.amount)}</td>
                        <td className="px-4 py-2 text-slate-400 dark:text-slate-500 whitespace-nowrap">{r.journalNo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleViewReport}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            View report
          </button>
          <button
            type="button"
            onClick={handleProceed}
            disabled={!canProceed || isProcessing}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? 'Processing…' : 'Proceed'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Item Search modal — now wired to real backend endpoints                */
/* ---------------------------------------------------------------------- */

type ItemRow = {
  seq: number;
  code: string;
  qty: number;
  unit: string;
  sku: string;
  description: string;
  priceA: number;
  priceB: number;
  priceC: number;
  rack: string;
  stkLocation: string;
  branch: string;
  category: string;
  brand: string;
  generic: string;
  active: boolean;
};

type LookupOption = { value: string; label: string };

// FIX: real Search-by fields — screenshot-confirmed against the desktop
// this session (Item Search dropdown). Replaces the earlier 3-option
// guess (Item Description / SKU No. / Item Code only).
const ITEM_SEARCH_FIELDS = [
  'Item Description',
  'Part Number',
  'Item Code',
  'Brand Name',
  'Category',
  'Quantity',
  'OEM',
  'Applications',
];

// FIX: real Sort-by options — screenshot-confirmed against the desktop
// this session. Replaces the earlier 4-option guess with different wording.
const ITEM_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'category', label: 'Category, Item Description' },
  { value: 'item_code', label: 'Item Code, Item Description' },
  { value: 'brand', label: 'Brand Name, Item Description' },
  { value: 'qty_category', label: 'Qty, Category, Item Desc' },
  { value: 'qty_asc', label: 'Quantity Only (ASC)' },
  { value: 'qty_desc', label: 'Quantity Only (DESC)' },
];

const PAGE_SIZE_OPTIONS = ['30', '50', '100'];

function ItemSearchModal({
  onClose,
  onSelectItem,
}: {
  onClose: () => void;
  onSelectItem?: (item: ItemRow) => void;
}) {
  const API_URL = getApiUrl();
  const token = typeof window !== 'undefined' ? localStorage.getItem('raiports-access-token') : null;
  const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
  const authHeaders = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { 'X-Tenant': tenant } : {}),
  };

  const [branches, setBranches] = useState<LookupOption[]>([]);
  const [branch, setBranch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [includeZeroQty, setIncludeZeroQty] = useState(true);
  const [tab, setTab] = useState<'product' | 'assembled'>('product');

  const [categories, setCategories] = useState<LookupOption[]>([]);
  const [brands, setBrands] = useState<LookupOption[]>([]);
  const [generics, setGenerics] = useState<LookupOption[]>([]);
  const [suppliers, setSuppliers] = useState<LookupOption[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [generic, setGeneric] = useState('');
  const [supplier, setSupplier] = useState('');
  const [searchField, setSearchField] = useState(ITEM_SEARCH_FIELDS[0]);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState(ITEM_SORT_OPTIONS[0].value);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');

  // Load branches + the four lookup dropdowns once on mount.
  // Category reuses /item-groups/ (rssys.itmgrp), Supplier reuses
  // /suppliers/ (rssys.m07) — both already existed and were confirmed
  // this session to match the desktop's real dropdown values exactly.
  // Brand/Generic are the two new endpoints built this session.
  useEffect(() => {
    async function loadLookups() {
      setLookupsLoading(true);
      try {
        const [branchRes, catRes, brandRes, genRes, supRes] = await Promise.all([
          fetch(`${API_URL}/approval/reports/branches/`, { headers: authHeaders }),
          fetch(`${API_URL}/approval/reports/item-groups/`, { headers: authHeaders }),
          fetch(`${API_URL}/approval/reports/item-brands/`, { headers: authHeaders }),
          fetch(`${API_URL}/approval/reports/item-generics/`, { headers: authHeaders }),
          fetch(`${API_URL}/approval/reports/suppliers/`, { headers: authHeaders }),
        ]);
        const [branchData, catData, brandData, genData, supData] = await Promise.all([
          branchRes.json(), catRes.json(), brandRes.json(), genRes.json(), supRes.json(),
        ]);
        const branchList: LookupOption[] = branchData.branches || branchData.data || [];
        setBranches(branchList);
        if (branchList.length > 0) setBranch(branchList[0].value);
        setCategories(catData.item_groups || []);
        setBrands(brandData.brands || []);
        setGenerics(genData.generics || []);
        setSuppliers(supData.suppliers || []);
      } catch (err) {
        console.error('Failed to load Item Search lookups:', err);
      } finally {
        setLookupsLoading(false);
      }
    }
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch items whenever branch or any filter changes
  useEffect(() => {
    if (!branch) return;

    async function loadItems() {
      setItemsLoading(true);
      setItemsError('');
      try {
        const params = new URLSearchParams({
          branch,
          active_only: String(activeOnly),
          include_zero_qty: String(includeZeroQty),
          sort_by: sortBy,
        });
        if (category) params.set('category', category);
        if (brand) params.set('brand', brand);
        if (generic) params.set('generic', generic);
        if (supplier) params.set('supplier', supplier);
        if (query.trim()) {
          params.set('search', query.trim());
          params.set('search_field', searchField);
        }

        const res = await fetch(`${API_URL}/approval/reports/items/?${params.toString()}`, { headers: authHeaders });
        const data = await res.json();

        if (data.status !== 'success') {
          setItemsError(data.message || 'Failed to load items.');
          setItems([]);
          return;
        }
        setItems(data.items || []);
      } catch (err) {
        console.error('Failed to load items:', err);
        setItemsError('Failed to load items.');
        setItems([]);
      } finally {
        setItemsLoading(false);
      }
    }

    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, category, brand, generic, supplier, query, searchField, activeOnly, includeZeroQty, sortBy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white">Item search</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main options row */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/30">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">Branch</label>
            <div className="relative">
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={lookupsLoading}
                className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
            Active items only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer">
            <input type="checkbox" checked={includeZeroQty} onChange={(e) => setIncludeZeroQty(e.target.checked)} className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
            Include zero qty
          </label>

          <div className="flex-1" />

          <button type="button" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
            Recompute FIFO inventory
          </button>
          <button type="button" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print list
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-100 dark:border-slate-700/60">
          {[
            { id: 'product' as const, label: 'Product items' },
            { id: 'assembled' as const, label: 'Assembled items / packages' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'product' ? (
          <>
            {/* Filter row */}
            <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700/60">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Category</label>
                <div className="relative">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={lookupsLoading} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">All categories</option>
                    {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Brand</label>
                <div className="relative">
                  <select value={brand} onChange={(e) => setBrand(e.target.value)} disabled={lookupsLoading} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">All brands</option>
                    {brands.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Generic</label>
                <div className="relative">
                  <select value={generic} onChange={(e) => setGeneric(e.target.value)} disabled={lookupsLoading} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">All generics</option>
                    {generics.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Supplier</label>
                <div className="relative">
                  <select value={supplier} onChange={(e) => setSupplier(e.target.value)} disabled={lookupsLoading} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">All suppliers</option>
                    {suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search by</label>
                <div className="flex">
                  <div className="relative">
                    <select value={searchField} onChange={(e) => setSearchField(e.target.value)} className="appearance-none pl-3 pr-7 py-2 text-sm rounded-l-lg border border-r-0 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500">
                      {ITEM_SEARCH_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${searchField.toLowerCase()}…`} className="w-full pl-8 pr-3 py-2 text-sm rounded-r-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Sort by</label>
                <div className="relative">
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                    {ITEM_SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/80 backdrop-blur">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Seq#', 'Code', 'Qty', 'Unit', 'SKU No.', 'Description', 'Price A', 'Price B', 'Price C', 'Rack', 'Stk location', 'Branch', 'Category', 'Brand', 'Generic', 'Active'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itemsLoading ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                        <Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" /> Loading items...
                      </td>
                    </tr>
                  ) : itemsError ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-10 text-center text-sm text-red-500">{itemsError}</td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                        No items match this search.
                      </td>
                    </tr>
                  ) : (
                    items.map((r) => (
                      <tr
                        key={r.code}
                        onClick={() => onSelectItem?.(r)}
                        className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-orange-50 dark:hover:bg-orange-900/10 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{r.seq}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.code}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">{r.qty}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.unit}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.sku}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{r.description}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">{peso(r.priceA)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">{peso(r.priceB)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">{peso(r.priceC)}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.rack}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.stkLocation}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.branch}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.category}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.brand}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.generic}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                            {r.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <button type="button" className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-white dark:hover:bg-slate-700">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="relative">
                  <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="appearance-none pl-2.5 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500">
                    {PAGE_SIZE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button type="button" className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-white dark:hover:bg-slate-700">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Total items: {items.length} · Rows shown: {items.length}
              </span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-10 text-sm text-slate-400 dark:text-slate-500">
            Assembled items / packages list goes here.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Enter Sales Item modal — Add Item (F4) -> Item search -> pick a row ->  */
/* this. Matches the desktop's "Enter Sales Item" popup. VAT Type (rssys. */
/* vat) and Disc.Type (rssys.disctbl, same table already used by the      */
/* Customer form's Discount field) are both real, fetched dropdowns now — */
/* previously hardcoded VAT_TYPES/DISC_TYPES placeholder arrays, replaced */
/* this session once both tables were confirmed against the desktop.      */
/* ---------------------------------------------------------------------- */

type VatTypeOption = { value: string; label: string; pct: number };

function EnterSalesItemModal({
  item,
  lineNumber,
  onClose,
  onSave,
}: {
  item: ItemRow;
  lineNumber: number;
  onClose: () => void;
  onSave: (line: OrderedItemLine) => void;
}) {
  const API_URL = getApiUrl();
  const token = typeof window !== 'undefined' ? localStorage.getItem('raiports-access-token') : null;
  const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
  const authHeaders = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { 'X-Tenant': tenant } : {}),
  };

  const [vatTypes, setVatTypes] = useState<VatTypeOption[]>([]);
  const [discountOptions, setDiscountOptions] = useState<LookupOption[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  const [qty, setQty] = useState('1');
  const [sellingPrice, setSellingPrice] = useState(String(item.priceA || 0));
  const [vatType, setVatType] = useState('I'); // rssys.vat.vat_code — 'I' = Inclusive of VAT, desktop default
  const [discType, setDiscType] = useState('');
  const [discReason, setDiscReason] = useState('');
  const [remarks, setRemarks] = useState('');

  // Load VAT Types (rssys.vat) and Discount Types (rssys.disctbl — same
  // endpoint already used by the Customer Information form's Discount
  // field, reused here as-is).
  useEffect(() => {
    async function loadLookups() {
      setLookupsLoading(true);
      try {
        const [vatRes, discRes] = await Promise.all([
          fetch(`${API_URL}/approval/reports/vat-types/`, { headers: authHeaders }),
          fetch(`${API_URL}/approval/reports/discount-codes/`, { headers: authHeaders }),
        ]);
        const [vatData, discData] = await Promise.all([vatRes.json(), discRes.json()]);
        const vats: VatTypeOption[] = vatData.vat_types || [];
        setVatTypes(vats);
        if (vats.length > 0) setVatType(vats.find((v) => v.value === 'I')?.value || vats[0].value);
        setDiscountOptions(discData.discounts || []);
      } catch (err) {
        console.error('Failed to load Enter Sales Item lookups:', err);
      } finally {
        setLookupsLoading(false);
      }
    }
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qtyNum = parseFloat(qty) || 0;
  const priceNum = parseFloat(sellingPrice) || 0;
  const subtotal = qtyNum * priceNum;

  // Discount % is parsed from the option label (e.g. "20% DISCOUNT" -> 20).
  // "NO DISCOUNT" and "ENTER DISCOUNT" (ZZZ, custom/manual) both resolve to
  // 0 here — ENTER DISCOUNT would need a manual amount field if the
  // desktop supports typing a custom peso value; not wired yet.
  const selectedDiscount = discountOptions.find((d) => d.value === discType);
  const discPct = selectedDiscount ? parseFloat(selectedDiscount.label) || 0 : 0;
  const discAmt = subtotal * (discPct / 100);

  const selectedVat = vatTypes.find((v) => v.value === vatType);
  const vatPct = selectedVat ? selectedVat.pct : 0;
  const isInclusive = vatType === 'I';
  const isExclusive = vatType === 'E';

  const netAfterDiscount = Math.max(subtotal - discAmt, 0);
  // INCLUSIVE: VAT is already inside the price (Line Amount = Net After Discount).
  // EXCLUSIVE: VAT is added on top (Line Amount = Net After Discount + VAT).
  // MANUAL / NO VAT: no VAT computation applied.
  const exclusiveTax = isExclusive ? netAfterDiscount * (vatPct / 100) : 0;
  const lineAmount = netAfterDiscount + exclusiveTax;
  const inclusiveTaxPortion = isInclusive && vatPct > 0 ? netAfterDiscount - netAfterDiscount / (1 + vatPct / 100) : 0;
  const netAmount = isInclusive ? netAfterDiscount - inclusiveTaxPortion : netAfterDiscount;

  const canSave = qtyNum > 0 && priceNum > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      line: lineNumber,
      qty: qtyNum,
      unit: item.unit || '',
      partNo: item.code,
      description: item.description,
      regPrice: item.priceA || 0,
      discount: discAmt,
      sellPrice: priceNum,
      netAmount,
      inclTax: isInclusive,
      lineAmount,
      discByUser: discAmt > 0 ? 'ADMINISTRATOR' : '', // TODO: real logged-in user, not hardcoded
      discReason,
      discCode: discType,
      remarks,
      itemCode: item.code,
      unitId: item.unit || '',
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white">Enter sales item</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Line number</label>
              <div className="h-9 flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-sm text-slate-500">
                {lineNumber}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">SKU number</label>
              <div className="h-9 flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-sm text-slate-500 font-mono truncate">
                {item.sku || '—'}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Item code</label>
            <div className="h-9 flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-sm text-slate-500 font-mono">
              {item.code}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Description</label>
            <div className="h-9 flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-sm text-slate-700 dark:text-slate-200 font-medium truncate">
              {item.description}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 text-sm text-right rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">VAT type</label>
              <select
                value={vatType}
                onChange={(e) => setVatType(e.target.value)}
                disabled={lookupsLoading}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {vatTypes.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Selling price <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="w-full px-3 py-2 text-sm text-right rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 tabular-nums"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{peso(subtotal)}</span>
            </div>
            {isExclusive && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Add exclusive tax</span>
                <span className="text-slate-700 dark:text-slate-200 tabular-nums">{peso(exclusiveTax)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Less: disc. amt</span>
              <span className="text-red-500 tabular-nums">{peso(discAmt)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Disc. type</label>
              <select
                value={discType}
                onChange={(e) => setDiscType(e.target.value)}
                disabled={lookupsLoading}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">{lookupsLoading ? 'Loading…' : 'None'}</option>
                {discountOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Reason</label>
              <input
                type="text"
                value={discReason}
                onChange={(e) => setDiscReason(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="rounded-xl bg-orange-500 text-white px-4 py-3 text-center">
            <p className="text-xs font-medium opacity-90">Line amount</p>
            <p className="text-3xl font-bold tabular-nums">{lineAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span>Net amount: <span className="font-medium text-slate-700 dark:text-slate-200">{peso(netAmount)}</span></span>
            <span>Inclusive tax: <span className="font-medium text-slate-700 dark:text-slate-200">{peso(inclusiveTaxPortion)}</span></span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button type="button" onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            Close
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------------- */
/* Items, All Locations modal — cross-branch inventory summary            */
/* ---------------------------------------------------------------------- */

type AllLocationsRow = {
  seq: number;
  code: string;
  description: string;
  category: string;
  brand: string;
  generic: string;
  qtyByBranch: Record<string, number>;
  totalQty: number;
};

const ALL_LOCATIONS_ROWS: AllLocationsRow[] = [
  {
    seq: 1,
    code: 'FD-00231',
    description: 'Premium Shrimp Feed 25kg',
    category: 'Feeds',
    brand: 'Sean Agro',
    generic: 'Shrimp Feed',
    qtyByBranch: { 'MANDAUE BRANCH': 480, 'BUTUAN BRANCH': 120, 'CARCAR BRANCH': 65, 'GENERAL SANTOS BRANCH': 0 },
    totalQty: 665,
  },
  {
    seq: 2,
    code: 'FD-00198',
    description: 'Starter Fish Feed 10kg',
    category: 'Feeds',
    brand: 'AquaPro',
    generic: 'Fish Feed',
    qtyByBranch: { 'MANDAUE BRANCH': 132, 'BUTUAN BRANCH': 40, 'CARCAR BRANCH': 0, 'GENERAL SANTOS BRANCH': 18 },
    totalQty: 190,
  },
  {
    seq: 3,
    code: 'CH-00087',
    description: 'Water Treatment Solution 20L',
    category: 'Chemicals',
    brand: 'FarmTech',
    generic: 'Water Treatment',
    qtyByBranch: { 'MANDAUE BRANCH': 56, 'BUTUAN BRANCH': 22, 'CARCAR BRANCH': 14, 'GENERAL SANTOS BRANCH': 9 },
    totalQty: 101,
  },
];

const ALL_LOCATIONS_BRANCHES = ['MANDAUE BRANCH', 'BUTUAN BRANCH', 'CARCAR BRANCH', 'GENERAL SANTOS BRANCH'];

// TEMPLATE / UI ONLY — still placeholder data for this modal (not wired to
// real backend endpoints this session, unlike ItemSearchModal above).
// Named separately from ITEM_SEARCH_FIELDS etc. so they don't collide with
// the real lists ItemSearchModal now uses.
const ALL_LOC_CATEGORIES = ['Feeds', 'Chemicals', 'Equipment', 'Packaging'];
const ALL_LOC_BRANDS = ['Sean Agro', 'AquaPro', 'FarmTech'];
const ALL_LOC_GENERICS = ['Shrimp Feed', 'Fish Feed', 'Water Treatment'];
const ALL_LOC_SEARCH_FIELDS = ['Item Description', 'SKU No.', 'Item Code'];

function ItemsAllLocationsModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [generic, setGeneric] = useState('');
  const [includeZeroQty, setIncludeZeroQty] = useState(true);
  const [searchField, setSearchField] = useState(ALL_LOC_SEARCH_FIELDS[0]);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState('300');

  const filtered = useMemo(() => {
    return ALL_LOCATIONS_ROWS.filter((r) => {
      if (!includeZeroQty && r.totalQty === 0) return false;
      if (category && r.category !== category) return false;
      if (brand && r.brand !== brand) return false;
      if (generic && r.generic !== generic) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const map: Record<string, string> = {
        'Item Description': r.description,
        'SKU No.': r.code,
        'Item Code': r.code,
      };
      return (map[searchField] ?? r.description).toLowerCase().includes(q);
    });
  }, [category, brand, generic, includeZeroQty, query, searchField]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="font-heading font-bold text-lg text-orange-600 dark:text-orange-400">Summary of items for all warehouses</h3>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors">
              <Printer className="w-3.5 h-3.5" /> Print list
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700/60">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Category</label>
            <div className="relative">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">All categories</option>
                {ALL_LOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Brand</label>
            <div className="relative">
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">All brands</option>
                {ALL_LOC_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Generic</label>
            <div className="relative">
              <select value={generic} onChange={(e) => setGeneric(e.target.value)} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">All generics</option>
                {ALL_LOC_GENERICS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer pb-2">
            <input type="checkbox" checked={includeZeroQty} onChange={(e) => setIncludeZeroQty(e.target.checked)} className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
            Include zero qty
          </label>

          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search by</label>
            <div className="flex">
              <div className="relative">
                <select value={searchField} onChange={(e) => setSearchField(e.target.value)} className="appearance-none pl-3 pr-7 py-2 text-sm rounded-l-lg border border-r-0 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {ALL_LOC_SEARCH_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${searchField.toLowerCase()}…`} className="w-full pl-8 pr-3 py-2 text-sm rounded-r-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
          </div>

          <button type="button" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            <Search className="w-3.5 h-3.5" /> Refresh list
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/80 backdrop-blur">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-2.5 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Seq#</th>
                <th className="px-4 py-2.5 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Code</th>
                <th className="px-4 py-2.5 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Description</th>
                <th className="px-4 py-2.5 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Category</th>
                <th className="px-4 py-2.5 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Brand</th>
                {ALL_LOCATIONS_BRANCHES.map((b) => (
                  <th key={b} className="px-4 py-2.5 text-right font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    {b.replace(' BRANCH', '')}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Total qty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.seq} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-orange-50 dark:hover:bg-orange-900/10 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{r.seq}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.code}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{r.description}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.category}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.brand}</td>
                  {ALL_LOCATIONS_BRANCHES.map((b) => (
                    <td key={b} className={`px-4 py-2.5 text-right whitespace-nowrap tabular-nums ${r.qtyByBranch[b] === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200'}`}>
                      {r.qtyByBranch[b]}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{r.totalQty}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5 + ALL_LOCATIONS_BRANCHES.length + 1} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                    No items match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <button type="button" className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-white dark:hover:bg-slate-700">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="relative">
              <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="appearance-none pl-2.5 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500">
                {['30', '50', '100', '300'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <button type="button" className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-white dark:hover:bg-slate-700">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Total items: {filtered.length} · Rows shown: {filtered.length}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sales Order List — shown inline when the "Sales order" card is clicked */
/* ---------------------------------------------------------------------- */

const SEARCH_FIELDS = ['Transaction No.', 'Customer Name', 'Assisted By', 'Cashier'];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  journalized: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  open: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  journalized: 'Journalized',
  cancelled: 'Cancelled',
  open: 'Open',
};

function peso(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[key] || STATUS_STYLES.open}`}>
      {STATUS_LABEL[key] || status}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Sales Order Entry — shown after a customer is picked                   */
/* ---------------------------------------------------------------------- */

type OrderedItemLine = {
  line: number;
  qty: number;
  unit: string;
  partNo: string;
  description: string;
  regPrice: number;
  discount: number;
  sellPrice: number;
  netAmount: number;
  inclTax: boolean;
  lineAmount: number;
  discByUser: string;
  discReason: string;
  discCode: string;
  remarks: string;
  itemCode: string;
  unitId: string;
};

const ORDERED_ITEM_COLUMNS = [
  'UPDATE', 'LINE', 'QTY', 'UNIT', 'PART NO', 'ITEM DESCRIPTION', 'REG PRICE',
  'DISCOUNT', 'SELL PRICE', 'NET AMOUNT', 'INCL. TAX', 'LINE AMOUNT',
  'DISC BY USER', 'DISC REASON', 'DISC CODE', 'REMARKS', 'ITEM CODE', 'UNIT ID',
];

const ITEM_SEARCH_MODES = ['Barcode', 'SKU Number', 'Item Description'];

const MARKET_OPTIONS = [
  'WALK-IN',
  'FACEBOOK ADS',
  'OLX ADS',
  'OTHER ONLINE ADS',
  'APPOINTMENT',
  'FLYERS',
  'MALL DISPLAY',
  'REFERRAL',
];

type AgentOption = { value: string; label: string };
const NO_AGENT: AgentOption = { value: '', label: 'NO AGENT' };

function SalesOrderEntry({
  customer,
  branchLabel,
  onBack,
  onChangeCustomer,
}: {
  customer: Customer;
  branchLabel: string;
  onBack: () => void;
  onChangeCustomer: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [salesDate, setSalesDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [items, setItems] = useState<OrderedItemLine[]>([]);
  const [itemSearchMode, setItemSearchMode] = useState(ITEM_SEARCH_MODES[0]);
  const [itemSearchValue, setItemSearchValue] = useState('');
  const [reference, setReference] = useState('');
  const [market, setMarket] = useState(MARKET_OPTIONS[0]);
  const [agent, setAgent] = useState('');
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([NO_AGENT]);
  // NEW — Add Item (F4) / Browse flow, moved here from the parent
  // (SalesOrderList) so Enter Sales Item has direct access to setItems.
  const [showItemSearchModal, setShowItemSearchModal] = useState(false);
  const [pickedItem, setPickedItem] = useState<ItemRow | null>(null);

  useEffect(() => {
    async function loadAgents() {
      try {
        const API_URL = getApiUrl();
        const token = typeof window !== 'undefined' ? localStorage.getItem('raiports-access-token') : null;
        const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
        const res = await fetch(`${API_URL}/approval/reports/sales/staff/`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenant ? { 'X-Tenant': tenant } : {}),
          },
        });
        const data = await res.json();
        const staff: AgentOption[] = data.staff || [];
        setAgentOptions([NO_AGENT, ...staff]);
      } catch (err) {
        console.error('Failed to load sales agents:', err);
      }
    }
    loadAgents();
  }, []);

  const gross = items.reduce((s, i) => s + i.lineAmount, 0);
  const discount = items.reduce((s, i) => s + i.discount, 0);
  const payment = 0;
  const net = gross - discount;
  const vat = 0;
  const total = net;
  const balance = total - payment;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Outlet type</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{branchLabel}</p>
        </div>
        <div className="rounded-xl bg-orange-500 text-white px-5 py-3 text-right min-w-[220px]">
          <p className="text-xs font-medium opacity-90">Balance (PHP)</p>
          <p className="text-2xl font-bold tabular-nums">{balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Transaction No.</label>
            <p className="text-sm text-slate-400 dark:text-slate-500 italic">Assigned on save</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Sales date</label>
            <input type="date" value={salesDate} onChange={(e) => setSalesDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Reference</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>

        <button
          type="button"
          onClick={onChangeCustomer}
          title="Click to change customer (F2)"
          className="mt-4 flex items-center gap-3 text-left rounded-lg px-3 py-2 -mx-3 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors group w-full md:w-auto"
        >
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Customer name</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
              {customer.name}
            </p>
            <p className="text-xs font-mono text-slate-400 dark:text-slate-500">{customer.custId}</p>
          </div>
          <Pencil className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Gross amount', value: gross },
          { label: 'Less: discount', value: discount },
          { label: 'Less: payment', value: payment },
          { label: 'Net amount', value: net },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{peso(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden mb-4">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Ordered items list (click the selected item row to update)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
                {ORDERED_ITEM_COLUMNS.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={ORDERED_ITEM_COLUMNS.length} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                    No items added yet. Use Search Item below or Add Item (F4).
                  </td>
                </tr>
              ) : (
                items.map((i) => (
                  <tr key={i.line} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-orange-50 dark:hover:bg-orange-900/10 cursor-pointer">
                    <td className="px-3 py-2 text-slate-400">✎</td>
                    <td className="px-3 py-2">{i.line}</td>
                    <td className="px-3 py-2 tabular-nums">{i.qty}</td>
                    <td className="px-3 py-2">{i.unit}</td>
                    <td className="px-3 py-2 font-mono text-xs">{i.partNo}</td>
                    <td className="px-3 py-2 font-medium">{i.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{peso(i.regPrice)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{peso(i.discount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{peso(i.sellPrice)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{peso(i.netAmount)}</td>
                    <td className="px-3 py-2">{i.inclTax ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{peso(i.lineAmount)}</td>
                    <td className="px-3 py-2">{i.discByUser}</td>
                    <td className="px-3 py-2">{i.discReason}</td>
                    <td className="px-3 py-2">{i.discCode}</td>
                    <td className="px-3 py-2">{i.remarks}</td>
                    <td className="px-3 py-2 font-mono text-xs">{i.itemCode}</td>
                    <td className="px-3 py-2">{i.unitId}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Search item (Home)</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative">
              <select
                value={itemSearchMode}
                onChange={(e) => setItemSearchMode(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {ITEM_SEARCH_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <input
              type="text"
              value={itemSearchValue}
              onChange={(e) => setItemSearchValue(e.target.value)}
              placeholder={`Scan or type ${itemSearchMode.toLowerCase()}…`}
              className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button type="button" onClick={() => setShowItemSearchModal(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
              <Search className="w-3.5 h-3.5" /> Browse
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Market</label>
              <div className="relative">
                <select value={market} onChange={(e) => setMarket(e.target.value)} className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {MARKET_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Agent</label>
              <div className="relative">
                <select value={agent} onChange={(e) => setAgent(e.target.value)} className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {agentOptions.map((a) => <option key={a.value || 'no-agent'} value={a.value}>{a.label}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Options</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              <ArrowLeft className="w-3.5 h-3.5" /> Go back (Esc)
            </button>
            <button type="button" onClick={onChangeCustomer} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <UserPlus className="w-3.5 h-3.5" /> Change customer (F2)
            </button>
            <button type="button" className="flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              <FileText className="w-3.5 h-3.5" /> Add text-item (F3)
            </button>
            <button type="button" onClick={() => setShowItemSearchModal(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600">
              <Plus className="w-3.5 h-3.5" /> Add item (F4)
            </button>
            <button type="button" className="flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
              <X className="w-3.5 h-3.5" /> Cancel order (Del)
            </button>
            <button type="button" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-900 dark:hover:bg-slate-500">
              <Save className="w-3.5 h-3.5" /> Save as pending (F8)
            </button>
            <button type="button" className="col-span-2 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              <Printer className="w-3.5 h-3.5" /> (Re)Print (F12)
            </button>
          </div>
        </div>
      </div>

      {/* NEW — Add Item (F4) / Browse flow: Item Search picks which item,
          Enter Sales Item sets qty/price/discount before it lands in the
          Ordered Items table above. Moved here (owned by SalesOrderEntry
          itself) since both modals need direct access to setItems. */}
      {showItemSearchModal && (
        <ItemSearchModal
          onClose={() => setShowItemSearchModal(false)}
          onSelectItem={(selected) => {
            setPickedItem(selected);
            setShowItemSearchModal(false);
          }}
        />
      )}
      {pickedItem && (
        <EnterSalesItemModal
          item={pickedItem}
          lineNumber={items.length + 1}
          onClose={() => setPickedItem(null)}
          onSave={(line) => {
            setItems((prev) => [...prev, line]);
            setPickedItem(null);
          }}
        />
      )}
    </div>
  );
}

type OrderRow = {
  id: string;
  customer: string;
  date: string;
  orderAmt: number;
  netAmt: number;
  balance: number;
  status: string;
  assistedBy: string;
  cashier: string;
};

type BranchOption = { value: string; label: string };

function SalesOrderList({ onBack }: { onBack: () => void }) {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branch, setBranch] = useState('');
  const [searchField, setSearchField] = useState(SEARCH_FIELDS[0]);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('2026-08-01');
  const [dateTo, setDateTo] = useState('2026-08-21');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [hasAuthorized, setHasAuthorized] = useState(false);
  const [authorizedName, setAuthorizedName] = useState('');
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entryCustomer, setEntryCustomer] = useState<Customer | null>(null);
  // NOTE: Item Search / Enter Sales Item state now lives inside
  // SalesOrderEntry itself (needs direct access to its own items array),
  // not here — see the entryCustomer branch below, which no longer passes
  // an onOpenItemSearch prop.

  const API_URL = getApiUrl();
  const token = typeof window !== 'undefined' ? localStorage.getItem('raiports-access-token') : null;
  const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

  useEffect(() => {
    async function loadBranches() {
      try {
        const res = await fetch(`${API_URL}/approval/reports/branches/`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenant ? { 'X-Tenant': tenant } : {}),
          },
        });
        const data = await res.json();
        const list: BranchOption[] = data.branches || data.data || [];
        setBranches(list);
        if (list.length > 0) setBranch(list[0].value);
      } catch (err) {
        console.error('Failed to load branches:', err);
      }
    }
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!branch || !dateFrom || !dateTo) return;

    async function loadOrders() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ branch, date_from: dateFrom, date_to: dateTo });
        const res = await fetch(`${API_URL}/approval/reports/sales/order-list/?${params.toString()}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenant ? { 'X-Tenant': tenant } : {}),
          },
        });
        const data = await res.json();

        if (data.status !== 'success') {
          setError(data.message || 'Failed to load sales orders.');
          setRows([]);
          return;
        }

        const mapped: OrderRow[] = (data.data || []).map((r: any) => ({
          id: r.transNo,
          customer: r.customer,
          date: r.date,
          orderAmt: r.orderAmount,
          netAmt: r.netAmount,
          balance: r.balanceDue,
          status: r.status,
          assistedBy: r.assistedBy || '—',
          cashier: r.cashier || '—',
        }));
        setRows(mapped);
      } catch (err) {
        console.error('Failed to load sales orders:', err);
        setError('Failed to load sales orders.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const map: Record<string, string> = {
        'Transaction No.': r.id,
        'Customer Name': r.customer,
        'Assisted By': r.assistedBy,
        Cashier: r.cashier,
      };
      return (map[searchField] || '').toLowerCase().includes(q);
    });
  }, [rows, query, searchField]);

  // Once a customer has been selected, hand off to the Sales Order Entry
  // screen. Clicking the Customer Name/ID block there (or "Change customer
  // F2") reopens the same shared CustomerPickerModal, and picking a new
  // customer simply swaps entryCustomer — matching desktop's Change
  // Customer flow.
  if (entryCustomer) {
    const branchLabel = branches.find((b) => b.value === branch)?.label || branch;
    return (
      <>
        <SalesOrderEntry
          customer={entryCustomer}
          branchLabel={branchLabel}
          onBack={() => setEntryCustomer(null)}
          onChangeCustomer={() => setShowCustomerModal(true)}
        />

        {/* EDITED — was {showCustomerModal && <CustomerPickerModal onClose .../>}.
            The shared component controls its own visibility via `open`, so it
            stays mounted and toggled instead of being conditionally rendered. */}
        <CustomerPickerModal
          open={showCustomerModal}
          onClose={() => setShowCustomerModal(false)}
          onSelect={(customer: CustomerOption) => {
            setEntryCustomer(toSalesCustomer(customer));
            setShowCustomerModal(false);
          }}
        />
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Sales
          </button>
          <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">Sales orders</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Loading…' : `${filtered.length} order${filtered.length === 1 ? '' : 's'} in range`}
          </p>
        </div>
        <button
            type="button"
            onClick={() => (hasAuthorized ? setShowCustomerModal(true) : setShowAuthModal(true))}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New sales order
          </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 mb-5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Branch</label>
            <div className="relative">
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                {branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search by</label>
            <div className="flex">
              <div className="relative">
                <select value={searchField} onChange={(e) => setSearchField(e.target.value)} className="appearance-none pl-3 pr-7 py-2 text-sm rounded-l-lg border border-r-0 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {SEARCH_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${searchField.toLowerCase()}…`} className="w-full pl-8 pr-3 py-2 text-sm rounded-r-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 mb-5">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                {['Trans No.', 'Customer', 'Date', 'Order Amount', 'Net Amount', 'Balance Due', 'Status', 'Assisted By', 'Cashier'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-medium text-orange-600 dark:text-orange-400 whitespace-nowrap">{r.id}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.customer}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">{peso(r.orderAmt)}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">{peso(r.netAmt)}</td>
                  <td className={`px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium ${r.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>{peso(r.balance)}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.assistedBy}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.cashier}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                    No orders match these filters. Try widening the date range or clearing search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <span className="text-xs text-slate-500 dark:text-slate-400">Showing {filtered.length} of {rows.length}</span>
          <div className="flex items-center gap-1">
            <button type="button" className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40" disabled>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400 px-2">Page 1 of 1</span>
            <button type="button" className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40" disabled>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showAuthModal && (
        <AuthorizationModal
          onClose={() => setShowAuthModal(false)}
          onAuthorized={() => {
            setShowAuthModal(false);
            setHasAuthorized(true);
            setShowCustomerModal(true);
          }}
        />
      )}

      {/* EDITED — was {showCustomerModal && <CustomerPickerModal onClose .../>}.
          Same reasoning as the entryCustomer branch above: the shared
          component takes `open` and manages its own visibility, so it stays
          mounted here too rather than being conditionally rendered. Picking
          a customer (row click / double-click / Select button inside the
          shared modal) drops us into Sales Order Entry via entryCustomer. */}
      <CustomerPickerModal
        open={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSelect={(customer: CustomerOption) => {
          setEntryCustomer(toSalesCustomer(customer));
          setShowCustomerModal(false);
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Main Sales page                                                        */
/* ---------------------------------------------------------------------- */

type View = 'overview' | 'sales_order';

export default function SalesPage() {
  const [view, setView] = useState<View>('overview');
  const [showJournalizeModal, setShowJournalizeModal] = useState(false);
  const [showItemSearchModal, setShowItemSearchModal] = useState(false);
  const [showAllLocationsModal, setShowAllLocationsModal] = useState(false);
  const router = useRouter();

  if (view === 'sales_order') {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <SalesOrderList onBack={() => setView('overview')} />
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">Sales</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track orders from creation through delivery.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
            <Calendar className="w-4 h-4" /> Calendar
          </button>
          <button type="button" onClick={() => setShowItemSearchModal(true)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
            <Search className="w-4 h-4" /> Item search
          </button>
          <button type="button" onClick={() => setShowAllLocationsModal(true)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
            <MapPin className="w-4 h-4" /> Items, all locations
          </button>
        </div>
      </div>

      <div className="mb-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Sales order flow</p>
        <div className="flex flex-col md:flex-row gap-3">
          {flowStages.map((stage, i) => {
            const handlers: Record<string, () => void> = {
              sales_order: () => setView('sales_order'),
              billing: () => router.push('/dashboard/sales/billing'),
            };
            return (
              <StageCard key={stage.id} stage={stage} isLast={i === flowStages.length - 1} onClick={handlers[stage.id]} />
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex flex-col md:flex-row gap-3 max-w-2xl">
          {returnFlow.map((stage, i) => {
            const returnHandlers: Record<string, () => void> = {
              sales_return: () => router.push('/dashboard/sales/returns'),
              journalize: () => setShowJournalizeModal(true),
            };
            return (
              <StageCard
                key={stage.id}
                stage={stage}
                isLast={i === returnFlow.length - 1}
                onClick={returnHandlers[stage.id]}
              />
            );
          })}
        </div>
      </div>

      {showJournalizeModal && (
        <JournalizeSalesModal onClose={() => setShowJournalizeModal(false)} />
      )}
      {showItemSearchModal && (
        <ItemSearchModal onClose={() => setShowItemSearchModal(false)} />
      )}
      {showAllLocationsModal && (
        <ItemsAllLocationsModal onClose={() => setShowAllLocationsModal(false)} />
      )}
    </main>
  );
}