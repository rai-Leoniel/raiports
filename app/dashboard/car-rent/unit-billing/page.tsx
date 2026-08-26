'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Search,
  X,
  Loader2,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ---------------------------------------------------------------------
// Matches the desktop "UNIT BILLING" screen: a per-contract summary list
// (Contract No. / Renter / Vehicle / Plate No. / Pickup Date / Expected
// Return / Monthly Rate / Total Charges / Total Paid / Balance / Status)
// with a single "Open Billing" action that opens the detail/payment view
// for the selected contract, plus a status filter, search, and Refresh.
//
// ⚠️ ENDPOINT ASSUMPTIONS — not confirmed against your Django backend:
//
//   GET /carrent/unit-billing/?branch=<code>&status=<code>&search=<q>
//       -> { billings: BillingContract[] }
// ---------------------------------------------------------------------

type BillingStatus = 'open' | 'partial' | 'paid' | 'overdue';

type BillingContract = {
  id: string | number;
  contract_no: string;
  renter: string;
  vehicle: string;
  plate_no: string;
  pickup_date: string;
  expected_return: string;
  monthly_rate: number;
  total_charges: number;
  total_paid: number;
  balance: number;
  status: BillingStatus;
};

const STATUS_META: Record<BillingStatus, { label: string; badge: string }> = {
  open: { label: 'Open', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  partial: { label: 'Partial', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  paid: { label: 'Paid', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  overdue: { label: 'Overdue', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shown whenever /carrent/unit-billing/ isn't reachable yet, so the page
// still demonstrates the intended look instead of an error banner.
const PLACEHOLDER_BILLINGS: BillingContract[] = [
  {
    id: 'placeholder-1',
    contract_no: 'CTR-0001',
    renter: 'Juan Dela Cruz',
    vehicle: 'CON120',
    plate_no: 'PLATE124',
    pickup_date: '2026-08-01',
    expected_return: '2026-09-01',
    monthly_rate: 15000,
    total_charges: 15000,
    total_paid: 5000,
    balance: 10000,
    status: 'partial',
  },
];

export default function UnitBillingPage() {
  const { user } = useAuth();

  const [billings, setBillings] = useState<BillingContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingPlaceholder, setShowingPlaceholder] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BillingStatus>('all');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const [billingModalOpen, setBillingModalOpen] = useState(false);

  const fetchBillings = async () => {
    if (!user?.branch) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branch: user.branch });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiFetch(`/carrent/unit-billing/?${params.toString()}`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setBillings(Array.isArray(data?.billings) ? data.billings : []);
      setShowingPlaceholder(false);
    } catch (err) {
      console.error('Error fetching unit billing:', err);
      setBillings(PLACEHOLDER_BILLINGS);
      setShowingPlaceholder(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchBillings, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selectedBilling = useMemo(
    () => billings.find((b) => b.id === selectedId) ?? null,
    [billings, selectedId]
  );

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
          Unit Billing
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Charges and payment status per rental contract.
        </p>
      </div>

      <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => setBillingModalOpen(true)}
                disabled={!selectedBilling}
              >
                <Receipt className="w-3.5 h-3.5 mr-1.5" /> Open Billing
              </Button>
              <Button size="sm" variant="outline" onClick={fetchBillings} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Refresh
              </Button>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | BillingStatus)}
                className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
              >
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_META) as BillingStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contracts..."
                className="pl-9 h-9"
              />
            </div>
          </div>

          {showingPlaceholder && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs px-3 py-2">
              Showing placeholder data — the unit billing endpoint isn&apos;t connected yet.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/40 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Contract No.</th>
                  <th className="px-4 py-2.5 font-medium">Renter</th>
                  <th className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th className="px-4 py-2.5 font-medium">Plate No.</th>
                  <th className="px-4 py-2.5 font-medium">Pickup Date</th>
                  <th className="px-4 py-2.5 font-medium">Expected Return</th>
                  <th className="px-4 py-2.5 font-medium text-right">Monthly Rate</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total Charges</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total Paid</th>
                  <th className="px-4 py-2.5 font-medium text-right">Balance</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                    </td>
                  </tr>
                ) : billings.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center">
                      <FileSpreadsheet className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No billing contracts {search ? `match "${search}"` : 'yet'}.
                      </p>
                    </td>
                  </tr>
                ) : (
                  billings.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}
                      onDoubleClick={() => {
                        setSelectedId(b.id);
                        setBillingModalOpen(true);
                      }}
                      className={`cursor-pointer transition-colors ${
                        selectedId === b.id
                          ? 'bg-orange-50 dark:bg-orange-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-heading font-semibold text-slate-900 dark:text-white">
                        {b.contract_no}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{b.renter}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{b.vehicle}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{b.plate_no}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{b.pickup_date}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{b.expected_return}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {peso(b.monthly_rate)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {peso(b.total_charges)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {peso(b.total_paid)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-heading font-semibold text-slate-900 dark:text-white">
                        {peso(b.balance)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={`${STATUS_META[b.status]?.badge ?? ''} font-heading`}>
                          {STATUS_META[b.status]?.label ?? b.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Open Billing — read-only detail/payment view for the selected contract */}
      {billingModalOpen && selectedBilling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-lg dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Contract</p>
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                  {selectedBilling.contract_no}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBillingModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Renter" value={selectedBilling.renter} />
                <InfoRow label="Vehicle" value={`${selectedBilling.vehicle} — ${selectedBilling.plate_no}`} />
                <InfoRow label="Pickup Date" value={selectedBilling.pickup_date} />
                <InfoRow label="Expected Return" value={selectedBilling.expected_return} />
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Monthly Rate</span>
                  <span className="tabular-nums">{peso(selectedBilling.monthly_rate)}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Total Charges</span>
                  <span className="tabular-nums">{peso(selectedBilling.total_charges)}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Total Paid</span>
                  <span className="tabular-nums">{peso(selectedBilling.total_paid)}</span>
                </div>
                <div className="flex justify-between font-heading font-semibold text-slate-900 dark:text-white text-base pt-1">
                  <span>Balance</span>
                  <span className="tabular-nums">{peso(selectedBilling.balance)}</span>
                </div>
              </div>
            </CardContent>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <Button variant="outline" onClick={() => setBillingModalOpen(false)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-slate-900 dark:text-white font-medium truncate">{value}</p>
    </div>
  );
}