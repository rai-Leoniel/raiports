'use client';

import { useState, useEffect } from 'react';
import { Loader2, Search } from 'lucide-react';

import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// Matches the desktop's real "Unpaid Invoices" popup, opened via the
// Add Item dialog's "Get Link" button once an Account Title + Subsidiary
// are both selected on the line. Confirmed against live_easyeats
// (at_code=6150 TRANSPORTATION / sl_code=000-072 MAXIM) that Petty Cash
// Voucher lines legitimately show up here alongside Purchase Journal
// Book lines — do NOT filter by transaction type client-side either.
//
// Source: rssys.v_sl_invoices via GET /approval/unpaid-invoices/
//   ?at_code=<code>&sl_code=<code> -> Unpaid_Invoices (returns rows
//   with balance <> 0 only — already filtered server-side).
//
// Desktop column mapping (confirmed via screenshot):
//   Reference Link -> j_code + j_num (shown combined below)
//   OR Number      -> invoice
//   Type           -> j_desc
//   Amount         -> dr (or cr, whichever side is non-zero for the row)
//   Payment        -> derived: amount - |balance|
//   Balance        -> balance (shown unsigned, matching desktop display)
//   Group          -> grp
//   Acct Code      -> at_code
//   SI Code        -> sl_code

export type UnpaidInvoiceOption = {
  invoice: string;
  reference_link: string;
  balance: number;
};

type UnpaidInvoiceRow = {
  j_code: string;
  j_desc: string | null;
  j_num: string;
  grp: string | null;
  at_code: string;
  sl_code: string;
  invoice: string;
  t_date: string;
  dr: string | number;
  cr: string | number;
  balance: string | number;
  t_desc: string | null;
};

type UnpaidInvoicesModalProps = {
  open: boolean;
  atCode: string;
  atDesc: string;
  slCode: string;
  slName: string;
  onClose: () => void;
  onSelect: (invoice: UnpaidInvoiceOption) => void;
};

const peso = (n: number) =>
  n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

export default function UnpaidInvoicesModal({
  open,
  atCode,
  atDesc,
  slCode,
  slName,
  onClose,
  onSelect,
}: UnpaidInvoicesModalProps) {
  const [rows, setRows] = useState<UnpaidInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !atCode || !slCode) return;
    setSearch('');
    setSelectedIdx(null);
    setLoading(true);
    setLoadError(false);

    apiFetch(
      `/approval/unpaid-invoices/?at_code=${encodeURIComponent(atCode)}&sl_code=${encodeURIComponent(slCode)}`
    )
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.invoices;
        if (Array.isArray(list)) {
          setRows(list);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [open, atCode, slCode]);

  const filteredRows = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.invoice || '').toLowerCase().includes(q) ||
      (r.j_desc || '').toLowerCase().includes(q) ||
      (r.j_num || '').toLowerCase().includes(q)
    );
  });

  const selectedRow = selectedIdx !== null ? filteredRows[selectedIdx] : null;

  const toOption = (r: UnpaidInvoiceRow): UnpaidInvoiceOption => {
    const dr = Number(r.dr) || 0;
    const cr = Number(r.cr) || 0;
    const amount = dr !== 0 ? dr : cr;
    return {
      invoice: r.invoice,
      reference_link: `${r.j_code}-${r.j_num}`,
      balance: amount,
    };
  };

  const chooseRow = (r: UnpaidInvoiceRow) => {
    onSelect(toOption(r));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="!max-w-3xl" style={{ maxWidth: '48rem' }}>
        <DialogHeader>
          <DialogTitle>Unpaid Invoices</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 mb-2 text-xs">
          <p>
            <span className="text-slate-400">Account Title: </span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {atCode} - {atDesc}
            </span>
          </p>
          <p>
            <span className="text-slate-400">Subsidiary Name: </span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {slCode} - {slName}
            </span>
          </p>
        </div>

        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIdx(null);
            }}
            placeholder="Search Invoice..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-[360px] overflow-y-auto">
          <table className="text-xs w-full">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/80">
              <tr className="text-slate-500 dark:text-slate-400 text-left">
                <th className="px-2 py-2 font-medium w-8"></th>
                <th className="px-2 py-2 font-medium">Reference Link</th>
                <th className="px-2 py-2 font-medium">OR Number</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium text-right">Amount</th>
                <th className="px-2 py-2 font-medium text-right">Payment</th>
                <th className="px-2 py-2 font-medium text-right">Balance</th>
                <th className="px-2 py-2 font-medium">Group</th>
                <th className="px-2 py-2 font-medium">Acct Code</th>
                <th className="px-2 py-2 font-medium">SI Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading unpaid invoices...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-red-500">
                    Could not load unpaid invoices -- check backend connection.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                    No unpaid invoices for this subsidiary.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, i) => {
                  const dr = Number(r.dr) || 0;
                  const cr = Number(r.cr) || 0;
                  const amount = dr !== 0 ? dr : cr;
                  const balanceNum = Number(r.balance) || 0;
                  const payment = amount - Math.abs(balanceNum);
                  return (
                    <tr
                      key={`${r.j_code}-${r.j_num}-${r.invoice}-${i}`}
                      onClick={() => setSelectedIdx(i)}
                      onDoubleClick={() => chooseRow(r)}
                      className={`cursor-pointer text-slate-700 dark:text-slate-200 ${
                        selectedIdx === i
                          ? 'bg-orange-50 dark:bg-orange-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <td className="px-2 py-2">
                        <input type="checkbox" readOnly checked={selectedIdx === i} />
                      </td>
                      <td className="px-2 py-2 text-slate-500">{r.j_code}-{r.j_num}</td>
                      <td className="px-2 py-2">{r.invoice || '0'}</td>
                      <td className="px-2 py-2">{r.j_desc || '—'}</td>
                      <td className="px-2 py-2 text-right">{peso(amount)}</td>
                      <td className="px-2 py-2 text-right">{peso(payment)}</td>
                      <td className="px-2 py-2 text-right font-semibold">
                        {peso(Math.abs(balanceNum))}
                      </td>
                      <td className="px-2 py-2">{r.grp || '—'}</td>
                      <td className="px-2 py-2 text-red-500">{r.at_code}</td>
                      <td className="px-2 py-2 text-red-500">{r.sl_code}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">
          {filteredRows.length} invoice{filteredRows.length === 1 ? '' : 's'} -- double-click a row, or select it and use Select.
        </p>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button
            size="sm"
            onClick={() => selectedRow && chooseRow(selectedRow)}
            disabled={!selectedRow}
          >
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}