'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------
// Matches the desktop "FS CONSOLIDATION BY UNITS" screen: a date-range
// filtered summary per vehicle (Conduction No. / Vehicle / Plate No. /
// Status / # Contracts / Total Charges / Total Paid / Balance), with a
// Grand Total Charges / Total Paid / Net Balance footer.
//
// ⚠️ ENDPOINT ASSUMPTIONS — not confirmed against your Django backend:
//
//   GET /carrent/fs-by-units/?branch=<code>&from=<date>&to=<date>
//       -> { units: UnitConsolidation[] }
// ---------------------------------------------------------------------

type UnitConsolidationStatus = 'vacant' | 'in_use' | 'out_of_order';

type UnitConsolidation = {
  id: string | number;
  conduction_no: string;
  vehicle: string;
  plate_no: string;
  status: UnitConsolidationStatus;
  contract_count: number;
  total_charges: number;
  total_paid: number;
  balance: number;
};

const STATUS_META: Record<UnitConsolidationStatus, { label: string; badge: string }> = {
  vacant: { label: 'VAC', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  in_use: { label: 'USE', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  out_of_order: { label: 'OOO', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
};

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function defaultFromDate() {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// Shown whenever /carrent/fs-by-units/ isn't reachable yet, so the page
// still demonstrates the intended look instead of an error banner.
const PLACEHOLDER_UNITS: UnitConsolidation[] = [
  {
    id: 'placeholder-1',
    conduction_no: 'CON120',
    vehicle: 'MAKE SERIES001',
    plate_no: 'PLATE124',
    status: 'vacant',
    contract_count: 0,
    total_charges: 0,
    total_paid: 0,
    balance: 0,
  },
];

export default function FsByUnitsPage() {
  const { user } = useAuth();

  const [units, setUnits] = useState<UnitConsolidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingPlaceholder, setShowingPlaceholder] = useState(false);

  const [pickupFrom, setPickupFrom] = useState(defaultFromDate());
  const [pickupTo, setPickupTo] = useState(todayDate());

  const fetchUnits = async () => {
    if (!user?.branch) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        branch: user.branch,
        from: pickupFrom,
        to: pickupTo,
      });

      const res = await apiFetch(`/carrent/fs-by-units/?${params.toString()}`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setUnits(Array.isArray(data?.units) ? data.units : []);
      setShowingPlaceholder(false);
    } catch (err) {
      console.error('Error fetching FS by units:', err);
      setUnits(PLACEHOLDER_UNITS);
      setShowingPlaceholder(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch]);

  const grandTotals = useMemo(() => {
    return units.reduce(
      (acc, u) => ({
        charges: acc.charges + u.total_charges,
        paid: acc.paid + u.total_paid,
        balance: acc.balance + u.balance,
      }),
      { charges: 0, paid: 0, balance: 0 }
    );
  }, [units]);

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
          FS Consolidation by Units
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Charges, payments, and balances grouped by vehicle for a date range.
        </p>
      </div>

      <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-end flex-wrap gap-3 mb-4">
            <div>
              <Label className="text-xs">Pickup Date From</Label>
              <Input
                type="date"
                value={pickupFrom}
                onChange={(e) => setPickupFrom(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={pickupTo}
                onChange={(e) => setPickupTo(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
            <Button size="sm" variant="outline" onClick={fetchUnits} disabled={loading}>
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Refresh
            </Button>
          </div>

          {showingPlaceholder && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs px-3 py-2">
              Showing placeholder data — the FS by units endpoint isn&apos;t connected yet.
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
                  <th className="px-4 py-2.5 font-medium">Conduction No.</th>
                  <th className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th className="px-4 py-2.5 font-medium">Plate No.</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right"># Contracts</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total Charges</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total Paid</th>
                  <th className="px-4 py-2.5 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                    </td>
                  </tr>
                ) : units.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <FileSpreadsheet className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No units found for this date range.
                      </p>
                    </td>
                  </tr>
                ) : (
                  units.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-4 py-2.5 font-heading font-semibold text-slate-900 dark:text-white">
                        {u.conduction_no}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{u.vehicle}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{u.plate_no}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={`${STATUS_META[u.status]?.badge ?? ''} font-heading`}>
                          {STATUS_META[u.status]?.label ?? u.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {u.contract_count}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {peso(u.total_charges)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {peso(u.total_paid)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-heading font-semibold text-slate-900 dark:text-white">
                        {peso(u.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {units.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700">
                    <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Grand Total
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-heading font-bold text-slate-900 dark:text-white">
                      {peso(grandTotals.charges)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-heading font-bold text-slate-900 dark:text-white">
                      {peso(grandTotals.paid)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-heading font-bold text-green-600 dark:text-green-400">
                      {peso(grandTotals.balance)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}