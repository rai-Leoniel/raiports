'use client';

import { useEffect, useState } from 'react';
import {
  RefreshCw,
  Search,
  Printer,
  Loader2,
  FileText,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ---------------------------------------------------------------------
// Matches the desktop "STATEMENT OF ACCOUNT (SOA)" screen: a per-contract
// list (Contract No. / Renter / Vehicle / Plate No. / Pickup Date /
// Expected Return / Status) with a single "Print SOA" action for the
// selected contract, plus search and Refresh.
//
// ⚠️ ENDPOINT ASSUMPTIONS — not confirmed against your Django backend:
//
//   GET  /carrent/soa/?branch=<code>&search=<q>
//        -> { contracts: SoaContract[] }
//   GET  /carrent/soa/<id>/print/
//        -> returns a printable PDF/HTML for the selected contract
// ---------------------------------------------------------------------

type ContractStatus = 'active' | 'returned' | 'overdue' | 'closed';

type SoaContract = {
  id: string | number;
  contract_no: string;
  renter: string;
  vehicle: string;
  plate_no: string;
  pickup_date: string;
  expected_return: string;
  status: ContractStatus;
};

const STATUS_META: Record<ContractStatus, { label: string; badge: string }> = {
  active: { label: 'Active', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  returned: { label: 'Returned', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  overdue: { label: 'Overdue', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  closed: { label: 'Closed', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
};

// Shown whenever /carrent/soa/ isn't reachable yet, so the page still
// demonstrates the intended look instead of an error banner.
const PLACEHOLDER_CONTRACTS: SoaContract[] = [
  {
    id: 'placeholder-1',
    contract_no: 'CTR-0001',
    renter: 'Juan Dela Cruz',
    vehicle: 'CON120',
    plate_no: 'PLATE124',
    pickup_date: '2026-08-01',
    expected_return: '2026-09-01',
    status: 'active',
  },
];

export default function SoaPage() {
  const { user } = useAuth();

  const [contracts, setContracts] = useState<SoaContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingPlaceholder, setShowingPlaceholder] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [printing, setPrinting] = useState(false);

  const fetchContracts = async () => {
    if (!user?.branch) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branch: user.branch });
      if (search.trim()) params.set('search', search.trim());

      const res = await apiFetch(`/carrent/soa/?${params.toString()}`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setContracts(Array.isArray(data?.contracts) ? data.contracts : []);
      setShowingPlaceholder(false);
    } catch (err) {
      console.error('Error fetching SOA contracts:', err);
      setContracts(PLACEHOLDER_CONTRACTS);
      setShowingPlaceholder(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch]);

  useEffect(() => {
    const t = setTimeout(fetchContracts, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selectedContract = contracts.find((c) => c.id === selectedId) ?? null;

  const handlePrintSoa = async () => {
    if (!selectedContract) return;
    setPrinting(true);
    setError(null);
    try {
      const res = await apiFetch(`/carrent/soa/${selectedContract.id}/print/`);
      if (!res.ok) throw new Error('Failed to generate SOA.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error printing SOA:', err);
      setError('Could not generate the SOA for this contract. The print endpoint may not be connected yet.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
          Statement of Account (SOA)
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select a contract to generate its statement of account.
        </p>
      </div>

      <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handlePrintSoa}
                disabled={!selectedContract || printing}
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                {printing ? 'Preparing...' : 'Print SOA'}
              </Button>
              <Button size="sm" variant="outline" onClick={fetchContracts} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
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
              Showing placeholder data — the SOA endpoint isn&apos;t connected yet.
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
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                    </td>
                  </tr>
                ) : contracts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <FileText className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No contracts {search ? `match "${search}"` : 'yet'}.
                      </p>
                    </td>
                  </tr>
                ) : (
                  contracts.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === c.id
                          ? 'bg-orange-50 dark:bg-orange-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-heading font-semibold text-slate-900 dark:text-white">
                        {c.contract_no}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{c.renter}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{c.vehicle}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{c.plate_no}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{c.pickup_date}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{c.expected_return}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={`${STATUS_META[c.status]?.badge ?? ''} font-heading`}>
                          {STATUS_META[c.status]?.label ?? c.status}
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
    </main>
  );
}