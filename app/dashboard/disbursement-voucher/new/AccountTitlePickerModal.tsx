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

// Matches the desktop's real "Account Titles" window layout — left action
// panel (Add New / Update / Import Excel / Delete / Print List) beside a
// searchable list — same structural pattern as SupplierPickerModal.
//
// Add New:
//   GET  /approval/reports/account-groups/   -> rssys.m03 (Account Group dropdown)
//   POST /approval/create-account-title/     -> inserts into rssys.m04
//
// Update — now real, backed by:
//   GET /approval/account-title/<at_code>/          -> AccountTitle_Detail
//   PUT /approval/update-account-title/<at_code>/    -> Update_AccountTitle
// Same field set as Add New. bs_pl/dr_cr are re-derived server-side from
// whatever Account Group ends up selected — not user-editable directly,
// since they're properties of the group, not the account title itself.
//
// Matches the desktop's "Account Title Info" tab: Account Title ID,
// Account Name, Account Group, Subledger Account / Checkwriting / Cash
// Types / Closing Account checkboxes, Remarks, Definition.
// NOT included yet: "Linked to Previous Codes" sub-table (rssys.m04_link)
// — deferred to a follow-up, same as Add New.
//
// Delete — now real, and it's a SOFT delete, not a row removal:
//   PUT /approval/account-title/<at_code>/toggle-active/  -> Toggle_AccountTitle_Active
//   Body: { active: boolean }
// Flips rssys.m04.active. Nothing is ever removed from m04, so every
// past transaction that references at_code (tr02/m10 etc.) stays intact
// regardless of status. Same endpoint reactivates — if the selected
// account is already inactive, the button becomes "Reactivate" instead.
//
// Import Excel remains the same "isn't built yet" placeholder as before
// — honest about what's real vs. not, rather than wiring a fake action.
// Print List is real (see handlePrintList below) — same approach as
// SupplierPickerModal: no report engine, no new backend endpoint, just
// a print-friendly HTML page built from data already in state, handed
// to the browser's native print dialog.
//
// List endpoints:
//   GET /approval/reports/chart-of-accounts/       -> List_Chart_Of_Accounts
//   Minimal {value, label, sl} pairs — used by the DV entry form's own
//   Account Title combobox, kept lightweight on purpose.
//   GET /approval/reports/chart-of-accounts-full/  -> List_Chart_Of_Accounts_Full
//   Full row data (ID, Name, Type/dr_cr, SL, CIB, Sub Acct, Is Payment,
//   Closing, Definition, Remarks, Active) — powers the grid in THIS
//   modal's list view, same split as Supplier_List vs the plain
//   suppliers/ dropdown.

export type AccountTitleOption = {
  value: string;
  label: string;
};

type AccountTitleFullRow = {
  id: string;
  name: string;
  type: string;
  sl: boolean;
  cib: boolean;
  sub_acct: string;
  is_payment: boolean;
  closing_acct: boolean;
  definition: string;
  remarks: string;
  active: boolean;
};

type AccountGroupOption = {
  value: string;
  label: string;
};

type AccountTitlePickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (account: AccountTitleOption) => void;
};

const emptyForm = () => ({
  at_code: '',
  at_desc: '',
  acc_code: '',
  sl: false,
  cib_acct: false,
  payment: false,
  closing_acct: false,
  remarks: '',
  definition: '',
});

export default function AccountTitlePickerModal({
  open,
  onClose,
  onSelect,
}: AccountTitlePickerModalProps) {
  const [accounts, setAccounts] = useState<AccountTitleFullRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [view, setView] = useState<
    'list' | 'not_built' | 'add_new' | 'update' | 'confirm_toggle'
  >('list');

  // ── Add New / Update shared form state ──
  const [form, setForm] = useState(emptyForm());
  const [groups, setGroups] = useState<AccountGroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'update'>('create');
  const [editingCode, setEditingCode] = useState<string | null>(null);

  // ── Delete / Reactivate (soft delete via active flag) ──
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const loadAccounts = (q?: string) => {
    setLoading(true);
    setLoadError(false);
    const query = q ? `?search=${encodeURIComponent(q)}` : '';
    apiFetch(`/approval/reports/chart-of-accounts-full/${query}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.accounts;
        if (Array.isArray(list)) {
          setAccounts(list);
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
    setSelectedCode(null);
    setView('list');
    setForm(emptyForm());
    setFormError(null);
    setToggleError(null);
    loadAccounts();
  }, [open]);

  const loadGroupsIfNeeded = () => {
    if (groupsLoaded || groupsLoading) return;
    setGroupsLoading(true);
    apiFetch('/approval/reports/account-groups/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.groups;
        if (Array.isArray(list)) {
          setGroups(list);
          setGroupsLoaded(true);
        }
      })
      .catch(() => {})
      .finally(() => setGroupsLoading(false));
  };

  const openAddNew = () => {
    setFormMode('create');
    setEditingCode(null);
    setForm(emptyForm());
    setFormError(null);
    setView('add_new');
    loadGroupsIfNeeded();
  };

  const openUpdate = async () => {
    if (!selectedAccount) return;
    setFormMode('update');
    setEditingCode(selectedAccount.id);
    setFormError(null);
    setView('update');
    loadGroupsIfNeeded();
    setFormLoading(true);
    try {
      const res = await apiFetch(`/approval/account-title/${encodeURIComponent(selectedAccount.id)}/`);
      const data = res.ok ? await res.json() : null;
      const a = data?.account;
      if (a) {
        setForm({
          at_code: a.at_code || '',
          at_desc: a.at_desc || '',
          acc_code: a.acc_code || '',
          sl: !!a.sl,
          cib_acct: !!a.cib_acct,
          payment: !!a.payment,
          closing_acct: !!a.closing_acct,
          remarks: a.remarks || '',
          definition: a.definition || '',
        });
      } else {
        setFormError('Could not load account title details.');
      }
    } catch {
      setFormError('Could not load account title details.');
    } finally {
      setFormLoading(false);
    }
  };

  const saveAccountTitle = async () => {
    setFormError(null);
    if (formMode === 'create' && !form.at_code.trim()) return setFormError('Account Title ID is required.');
    if (!form.at_desc.trim()) return setFormError('Account Name is required.');
    if (!form.acc_code) return setFormError('Account Group is required.');

    setSaving(true);
    try {
      const body = {
        at_desc: form.at_desc.trim(),
        acc_code: form.acc_code,
        sl: form.sl,
        cib_acct: form.cib_acct,
        payment: form.payment,
        closing_acct: form.closing_acct,
        remarks: form.remarks.trim() || null,
        definition: form.definition.trim() || null,
      };

      const res =
        formMode === 'create'
          ? await apiFetch('/approval/create-account-title/', {
              method: 'POST',
              body: JSON.stringify({ ...body, at_code: form.at_code.trim() }),
            })
          : await apiFetch(`/approval/update-account-title/${encodeURIComponent(editingCode!)}/`, {
              method: 'PUT',
              body: JSON.stringify(body),
            });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(data?.error || data?.message || `Request failed (${res.status})`);
        return;
      }

      loadAccounts();
      setSelectedCode(formMode === 'create' ? (data?.value ?? form.at_code.trim()) : editingCode);
      setView('list');
    } catch (err) {
      console.error('Error saving account title:', err);
      setFormError('Could not save the account title. Check the console for details.');
    } finally {
      setSaving(false);
    }
  };

  const openConfirmToggle = () => {
    if (!selectedAccount) return;
    setToggleError(null);
    setView('confirm_toggle');
  };

  // ── Print List — same approach as SupplierPickerModal.handlePrintList:
  // no report engine, no new backend endpoint. Builds a print-friendly
  // HTML page from the account list already sitting in `accounts` state
  // and hands off to the browser's native print dialog. Always prints
  // the FULL list regardless of the current search box contents (a
  // fresh unfiltered fetch), matching "Print List -- 403 suppliers"
  // behavior on the Supplier screen, not whatever's currently filtered
  // in the grid.
  const handlePrintList = async () => {
    let printAccounts = accounts;
    if (search) {
      // Current view may be filtered by search -- Print List always
      // means the full list, so fetch fresh instead of reusing state.
      try {
        const res = await apiFetch('/approval/reports/chart-of-accounts-full/');
        const data = res.ok ? await res.json() : null;
        if (Array.isArray(data?.accounts)) printAccounts = data.accounts;
      } catch {
        // fall back to whatever's already in state
      }
    }

    const rows = printAccounts
      .map(
        (a) => `
          <tr>
            <td>${a.id}</td>
            <td>${a.name}</td>
            <td>${a.type || '--'}</td>
            <td>${a.sl ? 'Y' : 'N'}</td>
            <td>${a.cib ? 'Y' : 'N'}</td>
            <td>${a.sub_acct || '--'}</td>
            <td>${a.is_payment ? 'Y' : 'N'}</td>
            <td>${a.closing_acct ? 'Y' : 'N'}</td>
            <td>${a.definition || '--'}</td>
            <td>${a.remarks || '--'}</td>
            <td>${a.active ? 'Active' : 'Inactive'}</td>
          </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Account Title List</title>
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
          <h1>Account Title List</h1>
          <p class="meta">Printed ${new Date().toLocaleString()} -- ${printAccounts.length} account${printAccounts.length === 1 ? '' : 's'}</p>
          <table>
            <thead>
              <tr><th>ID</th><th>Name</th><th>Type</th><th>SL</th><th>CIB</th><th>Sub Acct</th><th>Is Payment</th><th>Closing</th><th>Definition</th><th>Remarks</th><th>Status</th></tr>
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

  const confirmToggle = async () => {
    if (!selectedAccount) return;
    setToggleError(null);
    setToggling(true);
    const nextActive = !selectedAccount.active;
    try {
      const res = await apiFetch(
        `/approval/account-title/${encodeURIComponent(selectedAccount.id)}/toggle-active/`,
        {
          method: 'PUT',
          body: JSON.stringify({ active: nextActive }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setToggleError(data?.message || `Request failed (${res.status})`);
        return;
      }
      loadAccounts(search || undefined);
      setView('list');
    } catch (err) {
      console.error('Error updating account title status:', err);
      setToggleError('Could not update the account title status. Check the console for details.');
    } finally {
      setToggling(false);
    }
  };

  const runSearch = () => {
    setSelectedCode(null);
    loadAccounts(search || undefined);
  };

  const selectedAccount = accounts.find((a) => a.id === selectedCode) ?? null;

  const chooseAccount = (row: AccountTitleFullRow) => {
    onSelect({ value: row.id, label: row.name });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="!max-w-6xl" style={{ maxWidth: '84rem' }}>
        <DialogHeader>
          <DialogTitle>Account Titles</DialogTitle>
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
              disabled={!selectedAccount}
              variant="outline"
              className="justify-start text-xs h-8"
            >
              Update
            </Button>
            <Button
              size="sm"
              onClick={() => setView('not_built')}
              variant="outline"
              className="justify-start text-xs h-8"
            >
              Import / Excel
            </Button>
            <Button
              size="sm"
              onClick={openConfirmToggle}
              disabled={!selectedAccount}
              variant="outline"
              className={
                selectedAccount && !selectedAccount.active
                  ? 'justify-start text-xs h-8 text-green-600 border-green-200 hover:bg-green-50 dark:border-green-900 dark:hover:bg-green-950/30'
                  : 'justify-start text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30'
              }
            >
              {selectedAccount && !selectedAccount.active ? 'Reactivate' : 'Delete'}
            </Button>
            <Button
              size="sm"
              onClick={handlePrintList}
              disabled={accounts.length === 0}
              variant="outline"
              className="justify-start text-xs h-8"
            >
              Print List
            </Button>
          </div>

          <div className="flex-1 min-w-0">
            {view === 'not_built' ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg">
                This action isn&apos;t built yet.
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => setView('list')}>Back to List</Button>
                </div>
              </div>
            ) : view === 'confirm_toggle' ? (
              <div className="p-6 text-center border border-slate-200 dark:border-slate-700 rounded-lg">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {selectedAccount && !selectedAccount.active ? (
                    <>
                      Reactivate <span className="font-medium">{selectedAccount.id} — {selectedAccount.name}</span>?
                    </>
                  ) : (
                    <>
                      Deactivate <span className="font-medium">{selectedAccount?.id} — {selectedAccount?.name}</span>?
                    </>
                  )}
                </p>
                <p className="text-xs text-slate-400 mt-1.5">
                  {selectedAccount && !selectedAccount.active
                    ? "It'll show as active again and be selectable in new transactions."
                    : "It stays in the system and on past transactions, but won't be selectable for new ones. You can reactivate it anytime."}
                </p>
                {toggleError && <p className="text-xs text-red-500 mt-2">{toggleError}</p>}
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setView('list')} disabled={toggling}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={confirmToggle}
                    disabled={toggling}
                    className={
                      selectedAccount && !selectedAccount.active
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }
                  >
                    {toggling && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    {selectedAccount && !selectedAccount.active ? 'Reactivate' : 'Deactivate'}
                  </Button>
                </div>
              </div>
            ) : view === 'add_new' || view === 'update' ? (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3 max-h-[420px] overflow-y-auto">
                {formLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading account title...
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="at_code" className="text-xs">
                          Account Title ID <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="at_code"
                          autoFocus={view === 'add_new'}
                          value={form.at_code}
                          disabled={view === 'update'}
                          onChange={(e) => setForm((f) => ({ ...f, at_code: e.target.value }))}
                          className="h-8 text-xs disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <Label htmlFor="acc_code" className="text-xs">
                          Account Group <span className="text-red-500">*</span>
                        </Label>
                        {groupsLoading ? (
                          <div className="h-8 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Loading...
                          </div>
                        ) : (
                          <select
                            id="acc_code"
                            value={form.acc_code}
                            onChange={(e) => setForm((f) => ({ ...f, acc_code: e.target.value }))}
                            className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                          >
                            <option value="">Select a group...</option>
                            {groups.map((g) => (
                              <option key={g.value} value={g.value}>{g.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="at_desc" className="text-xs">
                        Account Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="at_desc"
                        autoFocus={view === 'update'}
                        value={form.at_desc}
                        onChange={(e) => setForm((f) => ({ ...f, at_desc: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={form.sl}
                          onChange={(e) => setForm((f) => ({ ...f, sl: e.target.checked }))}
                        />
                        Subledger Account
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={form.cib_acct}
                          onChange={(e) => setForm((f) => ({ ...f, cib_acct: e.target.checked }))}
                        />
                        Checkwriting
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={form.payment}
                          onChange={(e) => setForm((f) => ({ ...f, payment: e.target.checked }))}
                        />
                        Cash Types
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={form.closing_acct}
                          onChange={(e) => setForm((f) => ({ ...f, closing_acct: e.target.checked }))}
                        />
                        Closing Account
                      </label>
                    </div>

                    <div>
                      <Label htmlFor="definition" className="text-xs">Definition</Label>
                      <Textarea
                        id="definition"
                        value={form.definition}
                        onChange={(e) => setForm((f) => ({ ...f, definition: e.target.value }))}
                        className="min-h-[60px] text-xs"
                      />
                    </div>

                    <div>
                      <Label htmlFor="remarks" className="text-xs">Remarks</Label>
                      <Textarea
                        id="remarks"
                        value={form.remarks}
                        onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                        className="min-h-[60px] text-xs"
                      />
                    </div>

                    {formError && <p className="text-xs text-red-500">{formError}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setView('list')} disabled={saving}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveAccountTitle} disabled={saving}>
                        {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </>
                )}
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
                      placeholder="Search by account name or code..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Button size="sm" className="h-8 text-xs" onClick={runSearch}>Search</Button>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-[420px] w-full overflow-auto">
                  <table className="text-xs w-full min-w-[980px]">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/80">
                      <tr className="text-slate-500 dark:text-slate-400 text-left">
                        <th className="px-3 py-2 font-medium w-20">ID</th>
                        <th className="px-3 py-2 font-medium w-48">Name</th>
                        <th className="px-3 py-2 font-medium w-14">Type</th>
                        <th className="px-3 py-2 font-medium w-12">SL</th>
                        <th className="px-3 py-2 font-medium w-12">CIB</th>
                        <th className="px-3 py-2 font-medium w-20">Sub Acct</th>
                        <th className="px-3 py-2 font-medium w-20">Is Payment</th>
                        <th className="px-3 py-2 font-medium w-16">Closing</th>
                        <th className="px-3 py-2 font-medium w-40">Definition</th>
                        <th className="px-3 py-2 font-medium w-40">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loading ? (
                        <tr>
                          <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading account titles...
                          </td>
                        </tr>
                      ) : loadError ? (
                        <tr>
                          <td colSpan={10} className="px-3 py-8 text-center text-red-500">
                            Could not load account titles -- check backend connection.
                          </td>
                        </tr>
                      ) : accounts.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                            No account titles found.
                          </td>
                        </tr>
                      ) : (
                        accounts.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() => setSelectedCode(r.id)}
                            onDoubleClick={() => chooseAccount(r)}
                            className={`cursor-pointer text-slate-700 dark:text-slate-200 ${
                              !r.active ? 'opacity-45' : ''
                            } ${
                              selectedCode === r.id
                                ? 'bg-orange-50 dark:bg-orange-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                            }`}
                          >
                            <td className="px-3 py-2 text-slate-500">{r.id}</td>
                            <td className="px-3 py-2 font-medium">
                              {r.name}
                              {!r.active && (
                                <span className="ml-1.5 text-[10px] font-normal text-red-500">(Inactive)</span>
                              )}
                            </td>
                            <td className="px-3 py-2">{r.type || '--'}</td>
                            <td className="px-3 py-2">{r.sl ? 'Y' : 'N'}</td>
                            <td className="px-3 py-2">{r.cib ? 'Y' : 'N'}</td>
                            <td className="px-3 py-2">{r.sub_acct || '--'}</td>
                            <td className="px-3 py-2">{r.is_payment ? 'Y' : 'N'}</td>
                            <td className="px-3 py-2">{r.closing_acct ? 'Y' : 'N'}</td>
                            <td className="px-3 py-2 text-slate-400 truncate max-w-[160px]">{r.definition || '--'}</td>
                            <td className="px-3 py-2 text-slate-400 truncate max-w-[160px]">{r.remarks || '--'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {accounts.length} account{accounts.length === 1 ? '' : 's'} -- double-click a row, or select it and use Select.
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {view === 'list' && (
            <Button
              size="sm"
              onClick={() => selectedAccount && chooseAccount(selectedAccount)}
              disabled={!selectedAccount}
            >
              Select
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}