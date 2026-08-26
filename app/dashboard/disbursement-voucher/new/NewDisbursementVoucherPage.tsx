'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Pencil,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import SupplierPickerModal, { type SupplierOption } from './SupplierPickerModal';
import AccountTitlePickerModal, { type AccountTitleOption as AccountTitlePickerOption } from './AccountTitlePickerModal';
import AccountTitleCombobox, { type AccountTitleOption } from './AccountTitleCombobox';
import CustomerPickerModal, { type CustomerOption } from '../../../../components/customers/CustomerPickerModal';
import EmployeePickerModal, { type EmployeeOption } from './EmployeePickerModal';
import SubsidiaryNameCombobox, { type SubsidiaryNameOption } from './SubsidiaryNameCombobox';
import UnpaidInvoicesModal, { type UnpaidInvoiceOption } from './UnpaidInvoicesModal';

// ✅ Confirmed real from the desktop app's actual dropdown (screenshot).
const VAT_TYPES = [
  { code: 'INC', label: 'INCLUSIVE OF VAT' },
  { code: 'EXC', label: 'EXCLUSIVE OF VAT' },
  { code: 'MANUAL', label: 'MANUAL INPUT' },
  { code: 'NOVAT', label: 'NO VAT / NO O.R.' },
];

// ✅ Confirmed real — only three options exist, much simpler than the
// category system I was avoiding guessing at before.
const EWT_TYPES = [
  { code: 'NONE', label: 'NO EWT', rate: 0 },
  { code: 'EWT1', label: '1% EWT', rate: 1 },
  { code: 'EWT2', label: '2% EWT', rate: 2 },
];

// ✅ Confirmed real from screenshot — this branch/company only has one
// Center/Dept and Sub Center option visible in the dropdown.
const DEPT_OPTIONS = ['GENERAL'];

const SUBSIDIARY_KINDS = [
  { code: 'account', label: 'Account Title' },
  { code: 'supplier', label: 'Supplier' },
  { code: 'customer', label: 'Customer' },
  { code: 'employee', label: 'Employee' },
] as const;

type SubsidiaryKind = (typeof SUBSIDIARY_KINDS)[number]['code'];

type LineItem = {
  key: string;
  kind: SubsidiaryKind;
  at_code: string;
  at_code_value: string; // real m04.at_code — needed for Get Link
  at_sl: boolean;
  sl_name: string;
  sl_code: string; // real m07.c_code — needed for Get Link
  invoice: string;
  cc_code: string;
  scc_code: string;
  taxtype: string;
  gross: string;
  manualVat: string;
  ewttype: string;
  seq_desc: string;
  rep_code: string;
};

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const emptyLine = (): LineItem => ({
  key: uid(),
  kind: 'account',
  at_code: '',
  at_code_value: '',
  at_sl: false,
  sl_name: '',
  sl_code: '',
  invoice: '',
  cc_code: 'GENERAL',
  scc_code: 'GENERAL',
  taxtype: 'INC',
  gross: '',
  manualVat: '',
  ewttype: 'NONE',
  seq_desc: '',
  rep_code: '',
});

function computeLine(gross: number, vatType: string, manualVat: number, ewtRatePercent: number) {
  let vat = 0;
  let netOfVat = gross;
  if (vatType === 'INC') {
    netOfVat = gross / 1.12;
    vat = gross - netOfVat;
  } else if (vatType === 'EXC') {
    vat = gross * 0.12;
    netOfVat = gross;
  } else if (vatType === 'MANUAL') {
    vat = manualVat;
    netOfVat = gross - manualVat;
  }
  const ewtAmt = netOfVat * (ewtRatePercent / 100);
  const netPayable = netOfVat - ewtAmt;
  return { vat, netOfVat, ewtAmt, netPayable };
}

const ewtRateFor = (ewttype: string) => EWT_TYPES.find((e) => e.code === ewttype)?.rate ?? 0;

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

export default function NewDisbursementVoucherPage() {
  const { user } = useAuth();
  const router = useRouter();

  // ── Branch — fetched from /approval/reports/branches/ (rssys.branch) ──
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branch, setBranch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setBranchesLoading(true);
    apiFetch('/approval/reports/branches/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.branches;
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setBranches(list);
        }
      })
      .catch((err) => console.error('Error fetching branches:', err))
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (branches.length > 0 && !branch) {
      const match = branches.find((b) => b.value === user?.branch);
      setBranch(match?.value ?? branches[0].value);
    }
  }, [branches, user?.branch, branch]);

  const [previewVoucherNo, setPreviewVoucherNo] = useState<string | null>(null);
  const [voucherNoLoading, setVoucherNoLoading] = useState(true);

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    setVoucherNoLoading(true);
    apiFetch(
      `/approval/next-voucher-number/?branch=${branch}&transaction_type=${encodeURIComponent('Disbursement Voucher')}`
    )
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (!cancelled) setPreviewVoucherNo(data?.voucher_no ?? null);
      })
      .catch(() => {
        if (!cancelled) setPreviewVoucherNo(null);
      })
      .finally(() => {
        if (!cancelled) setVoucherNoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branch]);

  const [voucherDate, setVoucherDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [particular, setParticular] = useState('');
  const [explanation, setExplanation] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<LineItem>(emptyLine());
  // Separate from the field's own combobox — this is the "manage account
  // titles" screen (Add New/Update/Delete/Import/Print List), opened only
  // via the "Account Title" tab, matching the desktop's distinct
  // "Account Titles" window. It is NOT used to fill the field.
  const [accountTitleManagerOpen, setAccountTitleManagerOpen] = useState(false);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  // "Get Link" — Unpaid Invoices popup, opened from the OR/Invoice field
  // once both Account Title and Subsidiary are picked on the line.
  const [unpaidInvoicesOpen, setUnpaidInvoicesOpen] = useState(false);

  // ── Safety net: if every dialog is closed but the body is still locked
  // (Radix can leave `pointer-events: none` on <body> stuck when one
  // Dialog closes and another opens in the same tick), force-clear it so
  // the page never becomes permanently unclickable. ──
  useEffect(() => {
    if (
      !itemModalOpen &&
      !accountTitleManagerOpen &&
      !supplierPickerOpen &&
      !customerPickerOpen &&
      !employeePickerOpen &&
      !unpaidInvoicesOpen
    ) {
      document.body.style.pointerEvents = '';
    }
  }, [
    itemModalOpen,
    accountTitleManagerOpen,
    supplierPickerOpen,
    customerPickerOpen,
    employeePickerOpen,
    unpaidInvoicesOpen,
  ]);

  const [paymentThruOptions, setPaymentThruOptions] = useState<{ value: string; label: string }[]>([]);
  const [paymentThruLoading, setPaymentThruLoading] = useState(true);
  const [paymentThru, setPaymentThru] = useState('');

  const [suppliers, setSuppliers] = useState<{ value: string; label: string }[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setPaymentThruLoading(true);
    apiFetch('/approval/reports/payment-thru/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const options = data?.payment_thru;
        if (!cancelled && Array.isArray(options) && options.length > 0) {
          setPaymentThruOptions(options);
          setPaymentThru((prev) => prev || options[0].value);
        }
      })
      .catch((err) => console.error('Error fetching payment thru options:', err))
      .finally(() => {
        if (!cancelled) setPaymentThruLoading(false);
      });

    setSuppliersLoading(true);
    apiFetch('/approval/reports/suppliers/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.suppliers;
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setSuppliers(list);
        }
      })
      .catch((err) => console.error('Error fetching suppliers:', err))
      .finally(() => {
        if (!cancelled) setSuppliersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const [payment, setPayment] = useState('');
  const [paymentSubsidiary, setPaymentSubsidiary] = useState('');

  const [checkPayee, setCheckPayee] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState(voucherDate);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const computeLineItem = (l: LineItem) =>
    computeLine(parseFloat(l.gross) || 0, l.taxtype, parseFloat(l.manualVat) || 0, ewtRateFor(l.ewttype));

  const lineTotals = lines.map(computeLineItem);
  const totalNet = lineTotals.reduce((s, t) => s + t.netOfVat, 0);
  const totalTax = lineTotals.reduce((s, t) => s + t.vat, 0);
  const totalEwt = lineTotals.reduce((s, t) => s + t.ewtAmt, 0);
  const subtotal = totalNet;
  const paymentAmt = parseFloat(payment) || 0;
  const balance = subtotal - totalEwt - paymentAmt;

  const openAddItem = () => {
    setEditingKey(null);
    setDraft(emptyLine());
    setItemModalOpen(true);
  };
  const openEditItem = (line: LineItem) => {
    setEditingKey(line.key);
    setDraft(line);
    setItemModalOpen(true);
  };
  const saveItem = () => {
    if (!draft.at_code.trim()) return;
    setLines((prev) =>
      editingKey ? prev.map((l) => (l.key === editingKey ? draft : l)) : [...prev, draft]
    );
    setItemModalOpen(false);
  };
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const draftComputed = computeLineItem(draft);

  const failValidation = (msg: string, fieldId?: string) => {
    setError(msg);
    setToast({ type: 'error', text: msg });
    if (fieldId) {
      requestAnimationFrame(() => {
        const el = document.getElementById(fieldId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus();
      });
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setAttemptedSubmit(true);
    if (!branch) return failValidation('Branch could not be loaded — try refreshing the page.', 'dv_branch');
    if (!particular.trim()) return failValidation('Particular is required.', 'dv_particular');
    if (lines.length === 0) return failValidation('Add at least one line item.');
    if (!checkPayee.trim()) return failValidation('Check Payee is required.', 'check_payee');
    if (!paymentThru) return failValidation('Payment Thru could not be loaded — try refreshing the page.', 'payment_thru');

    setSubmitting(true);
    try {
      const res = await apiFetch('/approval/create-disbursement-voucher/', {
        method: 'POST',
        body: JSON.stringify({
          branch,
          t_date: voucherDate,
          t_desc: particular.trim(),
          explanation: explanation.trim() || null,
          payee: checkPayee.trim(),
          ck_num: checkNumber.trim() || null,
          ck_date: checkDate || null,
          payment_thru: paymentThru,
          payment: paymentAmt || null,
          payment_subsidiary: paymentSubsidiary.trim() || null,
          lines: lines.map((l) => {
            const c = computeLineItem(l);
            return {
              at_code: l.at_code.trim(),
              subsidiary_kind: l.kind,
              sl_name: l.sl_name.trim() || null,
              invoice: l.invoice.trim() || null,
              cc_code: l.cc_code.trim() || null,
              scc_code: l.scc_code.trim() || null,
              rep_code: l.rep_code.trim() || null,
              taxtype: l.taxtype,
              gross: parseFloat(l.gross) || 0,
              tax: c.vat,
              ewttype: l.ewttype,
              ewt: c.ewtAmt,
              total: c.netPayable,
              seq_desc: l.seq_desc.trim() || null,
            };
          }),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setToast({ type: 'success', text: 'Voucher saved as pending.' });
      setSuccess(true);
    } catch (err) {
      console.error('Error creating voucher:', err);
      setError('Could not create the voucher. Check the console for details.');
      setToast({ type: 'error', text: 'Could not create the voucher.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="font-heading text-xl font-bold text-slate-900 dark:text-white mb-2">
          Voucher created
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          It won&apos;t appear in the pending list until it&apos;s finalized on the desktop system —
          that&apos;s expected.
        </p>
        <Button onClick={() => router.push('/dashboard?category=' + encodeURIComponent('Disbursement Voucher'))}>
          Back to Disbursement Voucher
        </Button>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => router.push('/dashboard?category=' + encodeURIComponent('Disbursement Voucher'))}
          className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
        >
          Disbursement List
        </button>
        <span className="px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white border-b-2 border-orange-500">
          Disbursement Information
        </span>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard?category=' + encodeURIComponent('Disbursement Voucher'))}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Go Back
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          Save As Pending
        </Button>
      </div>

      <Card className="mb-4 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div>
              <Label className="text-xs">Branch</Label>
              {branchesLoading ? (
                <div className="h-9 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading branches...
                </div>
              ) : branches.length === 0 ? (
                <div className="h-9 flex items-center px-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400">
                  Could not load branches — check backend connection.
                </div>
              ) : (
                <select
                  id="dv_branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                >
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <div className="h-9 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-sm text-slate-500 dark:text-slate-400 truncate">
                Check Disbursement Book
              </div>
            </div>
            <div>
              <Label className="text-xs">Voucher No.</Label>
              <div className="h-9 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-sm text-slate-500 dark:text-slate-400 truncate">
                {voucherNoLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : previewVoucherNo ? (
                  <span className="font-heading tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                    {previewVoucherNo}
                  </span>
                ) : (
                  <>{String(new Date().getFullYear()).slice(-2)}-(assigned on save)</>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="dv_date" className="text-xs">Date</Label>
              <Input id="dv_date" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className="h-9" />
            </div>
          </div>
          {!voucherNoLoading && previewVoucherNo && (
            <p className="text-[10px] text-slate-400 -mt-2 mb-3">
              Preview only — the final voucher number is assigned by the server when you save,
              in case someone else creates one in the meantime.
            </p>
          )}
          <div>
            <Label htmlFor="dv_particular" className="text-xs">Particular</Label>
            <Input
              id="dv_particular"
              value={particular}
              onChange={(e) => setParticular(e.target.value)}
              className={`h-9 ${
                attemptedSubmit && !particular.trim()
                  ? 'border-red-400 dark:border-red-700 ring-1 ring-red-400 dark:ring-red-700'
                  : ''
              }`}
            />
            {attemptedSubmit && !particular.trim() && (
              <p className="text-[11px] text-red-500 mt-1">Particular is required.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Button size="sm" onClick={openAddItem}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add New
            </Button>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Debit side — AR / AP subsidiary accounts / expenses
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="text-xs w-full min-w-[900px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-left">
                  <th className="px-2 py-2 font-medium">Line</th>
                  <th className="px-2 py-2 font-medium">Account Title</th>
                  <th className="px-2 py-2 font-medium">Subsidiary</th>
                  <th className="px-2 py-2 font-medium">OR/Invoice</th>
                  <th className="px-2 py-2 font-medium text-right">Gross Amt</th>
                  <th className="px-2 py-2 font-medium text-right">Net of VAT</th>
                  <th className="px-2 py-2 font-medium text-right">EWT Amt</th>
                  <th className="px-2 py-2 font-medium text-right">Net Payable</th>
                  <th className="px-2 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {lines.map((line, i) => {
                  const c = lineTotals[i];
                  return (
                    <tr key={line.key} className="text-slate-700 dark:text-slate-200">
                      <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2">{line.at_code || '—'}</td>
                      <td className="px-2 py-2">{line.sl_name || '—'}</td>
                      <td className="px-2 py-2">{line.invoice || '—'}</td>
                      <td className="px-2 py-2 text-right">{peso(parseFloat(line.gross) || 0)}</td>
                      <td className="px-2 py-2 text-right">{peso(c.netOfVat)}</td>
                      <td className="px-2 py-2 text-right">{peso(c.ewtAmt)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{peso(c.netPayable)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => openEditItem(line)} className="text-slate-400 hover:text-blue-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeLine(line.key)} className="text-slate-400 hover:text-red-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2 py-10 text-center text-slate-400">
                      No line items yet — click &quot;Add New&quot; to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              (Credit side) Payment info
            </p>
            <div>
              <Label htmlFor="payment_thru" className="text-xs">Payment Thru</Label>
              {paymentThruLoading ? (
                <div className="h-9 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading payment thru options...
                </div>
              ) : paymentThruOptions.length === 0 ? (
                <div className="h-9 flex items-center px-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400">
                  Could not load payment thru options — check backend connection.
                </div>
              ) : (
                <select
                  id="payment_thru"
                  value={paymentThru}
                  onChange={(e) => setPaymentThru(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                >
                  {paymentThruOptions.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label htmlFor="payment" className="text-xs">Payment</Label>
              <Input id="payment" type="number" value={payment} onChange={(e) => setPayment(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label htmlFor="payment_sub" className="text-xs">Subsidiary</Label>
              <Input id="payment_sub" value={paymentSubsidiary} onChange={(e) => setPaymentSubsidiary(e.target.value)} className="h-9" />
            </div>
            <div className="flex justify-between text-sm pt-1 border-t border-slate-100 dark:border-slate-700">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Balance</span>
              <span className={`font-heading tabular-nums font-bold ${balance < 0 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                {peso(balance)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Summary
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Total Net</span><span className="font-medium">{peso(totalNet)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Less: Total EWT</span><span className="font-medium">{peso(totalEwt)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Tax</span><span className="font-medium">{peso(totalTax)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Less: Payment (CR)</span><span className="font-medium">{peso(paymentAmt)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-medium">{peso(subtotal)}</span></div>
              <div className="flex justify-between font-semibold border-t border-slate-100 dark:border-slate-700 pt-2 col-span-2">
                <span>Balance</span>
                <span className={balance < 0 ? 'text-red-500' : ''}>{peso(balance)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Check info
            </p>
            <div>
              <Label htmlFor="check_payee" className="text-xs">Check Payee</Label>
              {suppliersLoading ? (
                <div className="h-9 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading suppliers...
                </div>
              ) : suppliers.length === 0 ? (
                <div className="h-9 flex items-center px-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400">
                  Could not load suppliers — check backend connection.
                </div>
              ) : (
                <select
                  id="check_payee"
                  value={checkPayee}
                  onChange={(e) => setCheckPayee(e.target.value)}
                  className={`w-full h-9 rounded-md border bg-white dark:bg-slate-800 text-sm px-2 ${
                    attemptedSubmit && !checkPayee.trim()
                      ? 'border-red-400 dark:border-red-700 ring-1 ring-red-400 dark:ring-red-700'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <option value="">Select payee...</option>
                  {suppliers.map((s) => (
                    <option key={s.value} value={s.label}>{s.label}</option>
                  ))}
                </select>
              )}
              {attemptedSubmit && !checkPayee.trim() && (
                <p className="text-[11px] text-red-500 mt-1">Check Payee is required.</p>
              )}
            </div>
            <div>
              <Label htmlFor="check_num" className="text-xs">Check Number</Label>
              <Input id="check_num" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label htmlFor="check_date" className="text-xs">Check Date</Label>
              <Input id="check_date" type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} className="h-9" />
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4">
            <Label htmlFor="explanation" className="text-xs">Explanation</Label>
            <Textarea
              id="explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="min-h-[120px] mt-1"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              ⚠️ Not a confirmed database column — tr01 only has t_desc (used above for Particular).
              Sent as a separate field so the backend can decide where it belongs.
            </p>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
        <DialogContent className="!max-w-lg" style={{ maxWidth: '32rem' }}>
          <DialogHeader>
            <DialogTitle>{editingKey ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-1">
              {SUBSIDIARY_KINDS.map((k) => (
                <button
                  key={k.code}
                  type="button"
                  onClick={() => {
                    setDraft((d) => ({ ...d, kind: k.code }));
                    if (k.code === 'account') {
                      // Opens the manage-account-titles screen (Add New /
                      // Update / Delete / Import / Print List). It does NOT
                      // fill the field below — that's the combobox's job.
                      setItemModalOpen(false);
                      setTimeout(() => setAccountTitleManagerOpen(true), 0);
                    } else if (k.code === 'supplier') {
                      setItemModalOpen(false);
                      setTimeout(() => setSupplierPickerOpen(true), 0);
                    } else if (k.code === 'customer') {
                      setItemModalOpen(false);
                      setTimeout(() => setCustomerPickerOpen(true), 0);
                    } else if (k.code === 'employee') {
                      setItemModalOpen(false);
                      setTimeout(() => setEmployeePickerOpen(true), 0);
                    }
                  }}
                  className={`flex-1 text-xs py-1.5 rounded-md border ${
                    draft.kind === k.code
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <div>
              <Label htmlFor="item_account" className="text-xs">Account Title</Label>
              <AccountTitleCombobox
                value={draft.at_code}
                onChange={(account: AccountTitleOption) =>
                  setDraft((d) => ({
                    ...d,
                    at_code: account.label,
                    at_code_value: account.value,
                    at_sl: account.sl,
                    // Clear any previously picked subsidiary if the new
                    // account doesn't use one — matches desktop behavior.
                    sl_name: account.sl ? d.sl_name : '',
                    sl_code: account.sl ? d.sl_code : '',
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="item_sub" className="text-xs">Subsidiary Name</Label>
              <SubsidiaryNameCombobox
                value={draft.sl_name}
                onChange={(subsidiary: SubsidiaryNameOption) =>
                  setDraft((d) => ({ ...d, sl_name: subsidiary.label, sl_code: subsidiary.value }))
                }
                disabled={!draft.at_sl}
              />
            </div>
            <div>
              <Label htmlFor="item_invoice" className="text-xs">OR / Invoice No.</Label>
              <div className="flex gap-2">
                <Input
                  id="item_invoice"
                  value={draft.invoice}
                  onChange={(e) => setDraft((d) => ({ ...d, invoice: e.target.value }))}
                  className="h-9 flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!draft.at_code_value || !draft.sl_code}
                  onClick={() => {
                    setItemModalOpen(false);
                    setTimeout(() => setUnpaidInvoicesOpen(true), 0);
                  }}
                  className="h-9 shrink-0 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                >
                  Get Link
                </Button>
              </div>
              {!draft.at_code_value || !draft.sl_code ? (
                <p className="text-[10px] text-slate-400 mt-1">
                  Pick an Account Title and Subsidiary first to look up unpaid invoices.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="item_cc" className="text-xs">Center / Dept</Label>
                <select
                  id="item_cc"
                  value={draft.cc_code}
                  onChange={(e) => setDraft((d) => ({ ...d, cc_code: e.target.value }))}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                >
                  {DEPT_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="item_scc" className="text-xs">Sub Center</Label>
                <select
                  id="item_scc"
                  value={draft.scc_code}
                  onChange={(e) => setDraft((d) => ({ ...d, scc_code: e.target.value }))}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                >
                  {DEPT_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="item_vat" className="text-xs">VAT Type</Label>
                <select
                  id="item_vat"
                  value={draft.taxtype}
                  onChange={(e) => setDraft((d) => ({ ...d, taxtype: e.target.value }))}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                >
                  {VAT_TYPES.map((v) => (
                    <option key={v.code} value={v.code}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="item_vat_amt" className="text-xs">VAT</Label>
                {draft.taxtype === 'MANUAL' ? (
                  <Input
                    id="item_vat_amt"
                    type="number"
                    value={draft.manualVat}
                    onChange={(e) => setDraft((d) => ({ ...d, manualVat: e.target.value }))}
                    className="h-9"
                  />
                ) : (
                  <div className="h-9 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-sm">
                    {peso(draftComputed.vat)}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="item_gross" className="text-xs">Gross Amount</Label>
                <Input
                  id="item_gross"
                  type="number"
                  value={draft.gross}
                  onChange={(e) => setDraft((d) => ({ ...d, gross: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Net of VAT</Label>
                <div className="h-9 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-sm">
                  {peso(draftComputed.netOfVat)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="item_ewt" className="text-xs">Less EWT</Label>
                <select
                  id="item_ewt"
                  value={draft.ewttype}
                  onChange={(e) => setDraft((d) => ({ ...d, ewttype: e.target.value }))}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                >
                  {EWT_TYPES.map((e) => (
                    <option key={e.code} value={e.code}>{e.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">EWT Amt</Label>
                <div className="h-9 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-sm">
                  {peso(draftComputed.ewtAmt)}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Net Payable</span>
              <span className="font-heading tabular-nums text-lg font-bold text-slate-900 dark:text-white">
                {peso(draftComputed.netPayable)}
              </span>
            </div>

            <div>
              <Label htmlFor="item_notes" className="text-xs">Notes</Label>
              <Input
                id="item_notes"
                value={draft.seq_desc}
                onChange={(e) => setDraft((d) => ({ ...d, seq_desc: e.target.value }))}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor="item_staff" className="text-xs">Requested by Staff</Label>
              <Input
                id="item_staff"
                value={draft.rep_code}
                onChange={(e) => setDraft((d) => ({ ...d, rep_code: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemModalOpen(false)}>Close</Button>
            <Button onClick={saveItem} disabled={!draft.at_code.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Titles management screen — opened by the "Account Title"
          tab only. Selecting a row here also fills the field for
          convenience, but it is a separate entry point from the field's
          own inline combobox above. */}
      <AccountTitlePickerModal
        open={accountTitleManagerOpen}
        onClose={() => {
          setAccountTitleManagerOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
        onSelect={(account: AccountTitlePickerOption) => {
          setDraft((d) => ({ ...d, kind: 'account', at_code: account.label, at_code_value: account.value }));
          setAccountTitleManagerOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
      />

      <SupplierPickerModal
        open={supplierPickerOpen}
        onClose={() => {
          setSupplierPickerOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
        onSelect={(supplier: SupplierOption) => {
          setDraft((d) => ({ ...d, kind: 'supplier', sl_name: supplier.label, sl_code: supplier.value }));
          setSupplierPickerOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
      />

      <CustomerPickerModal
        open={customerPickerOpen}
        onClose={() => {
          setCustomerPickerOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
        onSelect={(customer: CustomerOption) => {
          setDraft((d) => ({ ...d, kind: 'customer', sl_name: customer.label, sl_code: customer.value }));
          setCustomerPickerOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
      />

      <EmployeePickerModal
        open={employeePickerOpen}
        onClose={() => {
          setEmployeePickerOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
        onSelect={(employee: EmployeeOption) => {
          setDraft((d) => ({ ...d, kind: 'employee', sl_name: employee.label, sl_code: employee.value }));
          setEmployeePickerOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
      />

      {/* Get Link — Unpaid Invoices popup, matches the desktop's window
          opened from the Add Item dialog's OR/Invoice field. */}
      <UnpaidInvoicesModal
        open={unpaidInvoicesOpen}
        atCode={draft.at_code_value}
        atDesc={draft.at_code}
        slCode={draft.sl_code}
        slName={draft.sl_name}
        onClose={() => {
          setUnpaidInvoicesOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
        onSelect={(inv: UnpaidInvoiceOption) => {
          setDraft((d) => ({ ...d, invoice: inv.invoice }));
          setUnpaidInvoicesOpen(false);
          setTimeout(() => setItemModalOpen(true), 0);
        }}
      />
    </main>
  );
}