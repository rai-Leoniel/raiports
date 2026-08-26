'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Calendar, Plus, ArrowLeft } from 'lucide-react';

// TEMPLATE / UI ONLY — rows below are placeholders matching the real
// "Sales Returned List" grid columns (SRET#, Customer, Ret. Date, Location,
// Refund, Jrnlz, Cancel, User ID, Date, Time, Cash ID, Cash Date, Cash Time,
// Loc. Code, ...). Once the backend exposes a Sales Return endpoint (same
// pattern as the Sales Order one), swap this static array for fetched state.

type ReturnStatus = 'pending' | 'journalized' | 'cancelled';

type SalesReturn = {
  sretNo: string;
  customer: string;
  retDate: string;
  location: string;
  refund: number;
  status: ReturnStatus;
  cashier: string;
  cashDate: string;
};

const placeholderReturns: SalesReturn[] = [
  {
    sretNo: 'SRET-0231',
    customer: 'Dela Cruz Trading',
    retDate: '2026-08-19',
    location: 'MANDAUE BRANCH',
    refund: 4250.0,
    status: 'pending',
    cashier: 'J. Reyes',
    cashDate: '2026-08-19',
  },
  {
    sretNo: 'SRET-0230',
    customer: 'Villamor Grocery',
    retDate: '2026-08-18',
    location: 'MANDAUE BRANCH',
    refund: 1180.5,
    status: 'journalized',
    cashier: 'M. Santos',
    cashDate: '2026-08-18',
  },
  {
    sretNo: 'SRET-0229',
    customer: 'Ong Sari-Sari Store',
    retDate: '2026-08-17',
    location: 'BUTUAN BRANCH',
    refund: 690.0,
    status: 'cancelled',
    cashier: 'J. Reyes',
    cashDate: '2026-08-17',
  },
];

const branches = ['MANDAUE BRANCH', 'BUTUAN BRANCH', 'CARCAR BRANCH', 'GENERAL SANTOS BRANCH'];
const searchFields = ['SRET No.', 'Customer Name', 'Location', 'Cashier'];

const statusStyles: Record<ReturnStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  journalized: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const statusLabels: Record<ReturnStatus, string> = {
  pending: 'Pending',
  journalized: 'Journalized',
  cancelled: 'Cancelled',
};

function currency(n: number) {
  return n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function SalesReturnsPage() {
  const router = useRouter();
  const [branch, setBranch] = useState(branches[0]);
  const [searchField, setSearchField] = useState(searchFields[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('2026-08-01');
  const [dateTo, setDateTo] = useState('2026-08-21');

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          {/* Back to Sales — same pattern as Billing and Sales Order List */}
          <button
            type="button"
            onClick={() => router.push('/dashboard/sales')}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Sales
          </button>
          <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
            Sales returns
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review and process returned sales transactions.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" /> New sales return
        </button>
      </div>

      {/* Filter card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Transaction dates
            </label>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="pl-8 pr-2 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                />
              </div>
              <span className="text-sm text-slate-400">to</span>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="pl-8 pr-2 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Branch
            </label>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Search
            </label>
            <div className="flex items-center gap-2">
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              >
                {searchFields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Search by ${searchField.toLowerCase()}...`}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3">SRET #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Return date</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3 text-right">Refund</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Cashier</th>
            </tr>
          </thead>
          <tbody>
            {placeholderReturns.map((r) => (
              <tr
                key={r.sretNo}
                className="border-b last:border-0 border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{r.sretNo}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.customer}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.retDate}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.location}</td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                  {currency(r.refund)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[r.status]}`}
                  >
                    {statusLabels[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.cashier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}