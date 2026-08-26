'use client';

import { useState, useEffect } from 'react';
import { Loader2, Search } from 'lucide-react';

import { apiFetch } from '@/lib/api-client';
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

// Full desktop-matching "Suppliers" window: left action panel (Add New /
// Update / Import Excel / Deactivate / Print List) beside a searchable
// list, with row SELECTION driving Update/Deactivate -- same layout as
// the standalone Master File page at /dashboard/suppliers, but shown
// as an overlay from inside the Disbursement Voucher's Add Item dialog
// when "Supplier" is picked. Confirmed via desktop screenshot: this is
// one and the same screen used from both places, not two different UIs.
//
// Selecting a supplier row here (double-click, or select + "Select"
// button) fills the caller's Subsidiary Name field and closes back to
// Add Item -- that's the one behavior specific to this embedded context
// vs. the standalone master-file page.
//
// FIXED — Address/Zip Code mapping. rssys.m07 has no dedicated zip
// column; c_addr1 is unused on every real supplier row (confirmed via
// live data sample — always NULL), and c_addr2 holds one free-text
// address blob with the zip embedded inline as plain text. The desktop
// form shows Address + Zip Code as two visual fields but must be
// concatenating them into that one blob before saving, since there's
// nowhere else for the zip to go. This form now matches that: a single
// Address field (multi-line, so the zip can just be typed at the end
// the same way real historical suppliers show it), written to c_addr2.
//
// Also added: Witholding Tax Expanded % (wte, confirmed real numeric
// column on rssys.m07) — was previously missing from this form
// entirely despite being a real, saved field on the desktop.
//
// Backend endpoints (all under /approval/reports/):
//   GET  suppliers-full/?search=...        -> Supplier_List
//   GET  suppliers/<code>/                 -> Supplier_Detail
//   POST suppliers/create/                 -> Create_Supplier
//   PUT  suppliers/<code>/update/          -> Update_Supplier
//   PUT  suppliers/<code>/deactivate/      -> Deactivate_Supplier
//   GET  payment-terms/                    -> List_Payment_Terms (rssys.m10)
//   GET  subledger-accounts/               -> List_Subledger_Accounts (rssys.m04, sl='Y')
//   GET  branches/                         -> List_Branches (rssys.branch)

export type SupplierOption = {
  value: string;
  label: string;
  address?: string;
};

type SupplierRow = {
  id: string;
  name: string;
  address: string;
  active: boolean;
};

type SupplierFormData = {
  branch: string;
  name: string;
  address: string;
  phone: string;
  fax: string;
  tin: string;
  contact_name: string;
  sub_ledger: string;
  mode_of_payment: string;
  wte: string;
};

const emptyForm = (branch: string): SupplierFormData => ({
  branch,
  name: '',
  address: '',
  phone: '',
  fax: '',
  tin: '',
  contact_name: '',
  sub_ledger: '',
  mode_of_payment: '',
  wte: '0',
});

type BranchOption = { value: string; label: string };

type ImportMethod = 'master_list' | 'master_list_po';

const IMPORT_METHODS: { value: ImportMethod; label: string }[] = [
  { value: 'master_list', label: 'Master List Only' },
  { value: 'master_list_po', label: 'Master List and Purchase Order' },
];

type SupplierPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (supplier: SupplierOption) => void;
};

export default function SupplierPickerModal({ open, onClose, onSelect }: SupplierPickerModalProps) {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [subLedgerOptions, setSubLedgerOptions] = useState<{ value: string; label: string }[]>([]);
  const [paymentTermOptions, setPaymentTermOptions] = useState<{ value: string; label: string }[]>([]);

  const [view, setView] = useState<'list' | 'import'>('list');

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'update'>('create');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierFormData>(emptyForm(''));
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  // ── Import Excel — UI shell only. Matches the desktop's real "Import
  // Excel" tab layout (Import Method dropdown hardcoded to the two real
  // options, Browse Excel file picker, filename display, progress bar).
  // NOT wired to a real backend endpoint yet — the expected column
  // layout for the uploaded file hasn't been confirmed against a real
  // sample, so this intentionally stops short of actually processing
  // anything rather than guessing at a format. ──
  const [importMethod, setImportMethod] = useState<ImportMethod>('master_list');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importLog, setImportLog] = useState<string[]>([]);

  const handleBrowseExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportLog([]);
    setImportProgress({ done: 0, total: 0 });
  };

  const handleStartImport = () => {
    // Not wired yet — see note above. Placeholder feedback only so the
    // button isn't a silent no-op while this is still being built out.
    setImportLog(['Import isn\'t fully built yet -- file format still needs to be confirmed against a real sample.']);
  };

  // ── Print List — desktop opens its own report-viewer window
  // (C:\RightApps\Prod report engine) showing a formatted printout of
  // the same Supplier List data. We don't have that report engine, and
  // don't need a new backend endpoint either -- the data's already
  // sitting in `suppliers` state from the same Supplier_List fetch that
  // powers the grid above. Build a print-friendly HTML page from that
  // and hand off to the browser's native print dialog, which is the
  // closest equivalent outcome (a printed/PDF'd supplier list) without
  // reimplementing a full report engine. ──
  const handlePrintList = () => {
    const rows = suppliers
      .map(
        (s) => `
          <tr>
            <td>${s.id}</td>
            <td>${s.name}</td>
            <td>${s.address || '--'}</td>
            <td>${s.active ? 'Active' : 'Inactive'}</td>
          </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Supplier List</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; }
            h1 { font-size: 16px; margin-bottom: 4px; }
            p.meta { color: #666; margin-top: 0; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Supplier List</h1>
          <p class="meta">Printed ${new Date().toLocaleString()} -- ${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'}</p>
          <table>
            <thead>
              <tr><th>ID</th><th>Supplier</th><th>Address</th><th>Status</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const fetchSuppliers = (q?: string) => {
    setLoading(true);
    setLoadError(false);
    const query = q ? `?search=${encodeURIComponent(q)}` : '';
    apiFetch(`/approval/reports/suppliers-full/${query}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.suppliers;
        if (Array.isArray(list)) {
          setSuppliers(list);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedId(null);
    setView('list');
    fetchSuppliers();

    apiFetch('/approval/reports/branches/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.branches)) setBranches(data.branches);
      })
      .catch(() => {});

    apiFetch('/approval/reports/subledger-accounts/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.accounts)) setSubLedgerOptions(data.accounts);
      })
      .catch(() => {});

    apiFetch('/approval/reports/payment-terms/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.payment_terms)) setPaymentTermOptions(data.payment_terms);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runSearch = () => {
    setSelectedId(null);
    fetchSuppliers(search || undefined);
  };

  const selectedSupplier = suppliers.find((s) => s.id === selectedId) ?? null;

  const chooseSupplier = (row: SupplierRow) => {
    onSelect({ value: row.id, label: row.name, address: row.address });
    onClose();
  };

  const openAddNew = () => {
    setFormMode('create');
    setEditingCode(null);
    setForm(emptyForm(branches[0]?.value ?? ''));
    setFormError(null);
    setFormOpen(true);
  };

  const openUpdate = async () => {
    if (!selectedSupplier) return;
    setFormMode('update');
    setEditingCode(selectedSupplier.id);
    setFormError(null);
    setFormOpen(true);
    setFormLoading(true);
    try {
      const res = await apiFetch(`/approval/reports/suppliers/${encodeURIComponent(selectedSupplier.id)}/`);
      const data = res.ok ? await res.json() : null;
      const s = data?.supplier;
      if (s) {
        setForm({
          branch: s.branch || '',
          name: s.name || '',
          address: s.address || '',
          phone: s.phone || '',
          fax: s.fax || '',
          tin: s.tin || '',
          contact_name: s.contact_name || '',
          sub_ledger: s.sub_ledger || '',
          mode_of_payment: s.mode_of_payment || '',
          wte: s.wte !== undefined && s.wte !== null ? String(s.wte) : '0',
        });
      } else {
        setFormError('Could not load supplier details.');
      }
    } catch {
      setFormError('Could not load supplier details.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleSave = async () => {
    setFormError(null);
    if (!form.name.trim()) return setFormError('Supplier Name is required.');
    if (!form.phone.trim()) return setFormError('Phone is required.');
    if (!form.contact_name.trim()) return setFormError('Contact Name is required.');
    if (!form.mode_of_payment) return setFormError('Mode of Payment is required.');
    if (!form.sub_ledger) return setFormError('Sub-ledger is required.');

    setSaving(true);
    try {
      const body = {
        branch: form.branch,
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        fax: form.fax.trim() || null,
        tin: form.tin.trim() || null,
        contact_name: form.contact_name.trim() || null,
        sub_ledger: form.sub_ledger || null,
        mode_of_payment: form.mode_of_payment || null,
        wte: parseFloat(form.wte) || 0,
      };

      const res =
        formMode === 'create'
          ? await apiFetch('/approval/reports/suppliers/create/', {
              method: 'POST',
              body: JSON.stringify(body),
            })
          : await apiFetch(`/approval/reports/suppliers/${encodeURIComponent(editingCode!)}/update/`, {
              method: 'PUT',
              body: JSON.stringify(body),
            });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const result = formMode === 'create' ? await res.json() : null;

      setFormOpen(false);
      fetchSuppliers(search || undefined);

      if (formMode === 'create' && result?.code) {
        chooseSupplier({ id: result.code, name: body.name, address: body.address || '', active: true });
      }
    } catch {
      setFormError('Could not save the supplier. Check the console for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selectedSupplier) return;
    setTogglingActive(true);
    try {
      const endpoint = selectedSupplier.active ? 'deactivate' : 'activate';
      const res = await apiFetch(
        `/approval/reports/suppliers/${encodeURIComponent(selectedSupplier.id)}/${endpoint}/`,
        { method: 'PUT' }
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setDeactivateConfirmOpen(false);
      fetchSuppliers(search || undefined);
    } catch {
      // Keep dialog open on failure.
    } finally {
      setTogglingActive(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="!max-w-3xl" style={{ maxWidth: '48rem' }}>
          <DialogHeader>
            <DialogTitle>Suppliers</DialogTitle>
          </DialogHeader>

          <div className="flex gap-3">
            <div className="w-32 shrink-0 flex flex-col gap-1.5">
              <Button
                size="sm"
                onClick={openAddNew}
                className="justify-start bg-orange-500 hover:bg-orange-600 text-white text-xs h-8"
              >
                Add New
              </Button>
              <Button
                size="sm"
                onClick={openUpdate}
                disabled={!selectedSupplier}
                variant="outline"
                className="justify-start text-xs h-8"
              >
                Update
              </Button>
              <Button
                size="sm"
                onClick={() => setView('import')}
                variant="outline"
                className="justify-start text-xs h-8"
              >
                Import / Excel
              </Button>
              <Button
                size="sm"
                onClick={() => selectedSupplier && setDeactivateConfirmOpen(true)}
                disabled={!selectedSupplier}
                variant="outline"
                className={`justify-start text-xs h-8 ${
                  selectedSupplier && !selectedSupplier.active
                    ? 'text-green-600 border-green-200 hover:bg-green-50 dark:border-green-900 dark:hover:bg-green-950/30'
                    : 'text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30'
                }`}
              >
                {selectedSupplier && !selectedSupplier.active ? 'Activate' : 'Deactivate'}
              </Button>
              <Button
                size="sm"
                onClick={handlePrintList}
                disabled={suppliers.length === 0}
                variant="outline"
                className="justify-start text-xs h-8"
              >
                Print List
              </Button>
            </div>

            <div className="flex-1 min-w-0">
              {view === 'import' ? (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
                  <div>
                    <Label htmlFor="import_method" className="text-xs">Import Method</Label>
                    <select
                      id="import_method"
                      value={importMethod}
                      onChange={(e) => setImportMethod(e.target.value as ImportMethod)}
                      className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                    >
                      {IMPORT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">Suppliers to Upload</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="import_file_input"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleBrowseExcel}
                        className="hidden"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8"
                        onClick={() => document.getElementById('import_file_input')?.click()}
                      >
                        Browse Excel
                      </Button>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {importFile ? importFile.name : 'Filename : .'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>{importProgress.done}</span>
                      <span>{importProgress.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-orange-500 transition-all"
                        style={{
                          width: importProgress.total
                            ? `${(importProgress.done / importProgress.total) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                  </div>

                  {importLog.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-32 overflow-y-auto text-xs text-slate-500 dark:text-slate-400">
                      {importLog.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setView('list')} disabled={importing}>
                      Back to List
                    </Button>
                    <Button size="sm" onClick={handleStartImport} disabled={!importFile || importing}>
                      {importing && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      Import
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                        placeholder="Search by supplier name or ID..."
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <Button size="sm" className="h-8 text-xs" onClick={runSearch}>Search</Button>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-[360px] overflow-y-auto">
                    <table className="text-xs w-full">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/80">
                        <tr className="text-slate-500 dark:text-slate-400 text-left">
                          <th className="px-3 py-2 font-medium w-24">ID</th>
                          <th className="px-3 py-2 font-medium">Supplier</th>
                          <th className="px-3 py-2 font-medium">Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                              <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading suppliers...
                            </td>
                          </tr>
                        ) : loadError ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-8 text-center text-red-500">
                              Could not load suppliers -- check backend connection.
                            </td>
                          </tr>
                        ) : suppliers.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                              No suppliers found.
                            </td>
                          </tr>
                        ) : (
                          suppliers.map((r) => (
                            <tr
                              key={r.id}
                              onClick={() => setSelectedId(r.id)}
                              onDoubleClick={() => chooseSupplier(r)}
                              className={`cursor-pointer text-slate-700 dark:text-slate-200 ${
                                selectedId === r.id
                                  ? 'bg-orange-50 dark:bg-orange-950/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                              }`}
                            >
                              <td className="px-3 py-2 text-slate-500">{r.id}</td>
                              <td className="px-3 py-2 font-medium">{r.name}</td>
                              <td className="px-3 py-2 text-slate-400">{r.address || '--'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {suppliers.length} supplier{suppliers.length === 1 ? '' : 's'} -- double-click a row, or select it and use Update/Deactivate.
                  </p>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button
              size="sm"
              onClick={() => selectedSupplier && chooseSupplier(selectedSupplier)}
              disabled={!selectedSupplier}
            >
              Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="!max-w-lg" style={{ maxWidth: '32rem' }}>
          <DialogHeader>
            <DialogTitle>{formMode === 'create' ? 'Add Supplier' : 'Update Supplier'}</DialogTitle>
          </DialogHeader>

          {formLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading supplier...
            </div>
          ) : (
            <div className="space-y-3">
              {formMode === 'create' && (
                <div>
                  <Label htmlFor="sp_branch" className="text-xs">Branch</Label>
                  <select
                    id="sp_branch"
                    value={form.branch}
                    onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                  >
                    {branches.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="sp_name" className="text-xs">Supplier Name</Label>
                <Input id="sp_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-9" />
              </div>
              <div>
                <Label htmlFor="sp_address" className="text-xs">Address</Label>
                <Textarea
                  id="sp_address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="min-h-[70px] text-sm"
                  placeholder="Street, city, zip -- e.g. K41 Level 4 Ayala Malls Central Bloc, Cebu IT Park, Apas 6000, City of Cebu"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Include the zip code as part of the address -- there is no separate zip field on this record.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sp_phone" className="text-xs">Phone</Label>
                  <Input id="sp_phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label htmlFor="sp_contact" className="text-xs">Contact Name</Label>
                  <Input id="sp_contact" value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} className="h-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sp_tin" className="text-xs">TIN Number</Label>
                  <Input id="sp_tin" value={form.tin} onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label htmlFor="sp_fax" className="text-xs">Fax Number</Label>
                  <Input id="sp_fax" value={form.fax} onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))} className="h-9" />
                </div>
              </div>
              <div>
                <Label htmlFor="sp_wte" className="text-xs">Witholding Tax Expanded %</Label>
                <Input
                  id="sp_wte"
                  type="number"
                  step="0.01"
                  value={form.wte}
                  onChange={(e) => setForm((f) => ({ ...f, wte: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div>
                <Label htmlFor="sp_mop" className="text-xs">Mode of Payment</Label>
                <select
                  id="sp_mop"
                  value={form.mode_of_payment}
                  onChange={(e) => setForm((f) => ({ ...f, mode_of_payment: e.target.value }))}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                >
                  <option value="">Select...</option>
                  {paymentTermOptions.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="sp_subledger" className="text-xs">Sub-ledger</Label>
                <select
                  id="sp_subledger"
                  value={form.sub_ledger}
                  onChange={(e) => setForm((f) => ({ ...f, sub_ledger: e.target.value }))}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                >
                  <option value="">Select...</option>
                  {subLedgerOptions.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Back</Button>
            <Button onClick={handleSave} disabled={saving || formLoading}>
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deactivateConfirmOpen} onOpenChange={setDeactivateConfirmOpen}>
        <DialogContent className="!max-w-sm" style={{ maxWidth: '24rem' }}>
          <DialogHeader>
            <DialogTitle>Confirmation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Are you sure you want to {selectedSupplier && !selectedSupplier.active ? 'activate' : 'deactivate'} this supplier?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateConfirmOpen(false)} disabled={togglingActive}>No</Button>
            <Button onClick={handleToggleActive} disabled={togglingActive}>
              {togglingActive && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}