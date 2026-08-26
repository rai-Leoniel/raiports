'use client';

import { useState, useEffect } from 'react';
import { Loader2, Search } from 'lucide-react';

import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// Employee picker matching the desktop "Clerk" screen (Employee List /
// Employee Basic Info tabs — screenshots confirmed this session).
// Backing table: rssys.hr_employee, confirmed via direct row match
// against 4 real employees (TIK-ING AGNES, MASAS CHARIZ MAE, ABAYON
// CECILE HERTY, MASAS GERALD).
//
// "Middle Name" on the desktop form maps to hr_employee.mi — a real
// 2-char MIDDLE INITIAL column, not a full middle name, despite the
// label. Every real sample row has it blank, consistent with either
// reading, so it's wired to mi as the closest confirmed match.
//
// "Debtor Link" — NOT CONFIRMED against real data (all 4 real employee
// rows have every candidate column NULL). Wired to hr_employee.sl_code
// (subsidiary ledger code — the same term this schema uses elsewhere
// for linking a record to a customer/debtor subledger account), with
// the dropdown sourced from existing Customers. Revisit if this
// mapping is ever found to be wrong once real data exists.
//
// Desktop shows a red "Delete" button (not "Deactivate") — hr_employee
// has no active/status column, so this is a genuine hard delete,
// matching what the desktop actually offers. No Import/Excel button
// on this screen (confirmed via screenshot — only Add New / Update /
// Delete / Print List).
//
// Backend endpoints:
//   GET    /approval/employees-full/              -> Employee_List
//   GET    /approval/employee/<empid>/             -> Employee_Detail
//   POST   /approval/create-employee/              -> Create_Employee
//   PUT    /approval/update-employee/<empid>/      -> Update_Employee
//   DELETE /approval/employee/<empid>/delete/      -> Delete_Employee
//   GET    /approval/reports/customers/            -> List_Customers (for Debtor Link dropdown)

export type EmployeeOption = {
  value: string;
  label: string;
};

type EmployeeRow = {
  empid: string;
  lastname: string;
  firstname: string;
  mi: string;
  debtor_link: string;
};

type LookupOption = { value: string; label: string };

type EmployeeFormData = {
  empid: string;
  lastname: string;
  firstname: string;
  mi: string;
  debtor_link: string;
};

const emptyForm = (): EmployeeFormData => ({
  empid: '',
  lastname: '',
  firstname: '',
  mi: '',
  debtor_link: '',
});

type EmployeePickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (employee: EmployeeOption) => void;
};

export default function EmployeePickerModal({
  open,
  onClose,
  onSelect,
}: EmployeePickerModalProps) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'not_built' | 'add_new' | 'update'>('list');

  const [customerOptions, setCustomerOptions] = useState<LookupOption[]>([]);

  const [form, setForm] = useState<EmployeeFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'update'>('create');
  const [editingEmpid, setEditingEmpid] = useState<string | null>(null);

  const loadEmployees = () => {
    setLoading(true);
    setLoadError(false);
    apiFetch('/approval/employees-full/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.employees;
        if (Array.isArray(list)) {
          setEmployees(list);
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
    loadEmployees();

    // Debtor Link dropdown — reuses the same Customer list source as
    // the Customers picker's own dropdowns.
    apiFetch('/approval/reports/customers/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.customers)) {
          setCustomerOptions(
            data.customers.map((c: { value: string; label: string }) => ({
              value: c.value,
              label: c.label,
            })),
          );
        }
      })
      .catch(() => {});
  }, [open]);

  const filteredEmployees = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const full = `${e.lastname} ${e.firstname} ${e.empid}`.toLowerCase();
    return full.includes(q);
  });

  const selectedEmployee = employees.find((e) => e.empid === selectedId) ?? null;

  const chooseEmployee = (row: EmployeeRow) => {
    onSelect({ value: row.empid, label: `${row.lastname}, ${row.firstname}`.replace(/,\s*$/, '') });
    onClose();
  };

  const openAddNew = () => {
    setFormMode('create');
    setEditingEmpid(null);
    setForm(emptyForm());
    setFormError(null);
    setView('add_new');
  };

  const openUpdate = async () => {
    if (!selectedEmployee) return;
    setFormMode('update');
    setEditingEmpid(selectedEmployee.empid);
    setFormError(null);
    setView('update');
    setFormLoading(true);
    try {
      const res = await apiFetch(`/approval/employee/${encodeURIComponent(selectedEmployee.empid)}/`);
      const data = res.ok ? await res.json() : null;
      const e = data?.employee;
      if (e) {
        setForm({
          empid: e.empid || '',
          lastname: e.lastname || '',
          firstname: e.firstname || '',
          mi: e.mi || '',
          debtor_link: e.debtor_link || '',
        });
      } else {
        setFormError('Could not load employee details.');
      }
    } catch {
      setFormError('Could not load employee details.');
    } finally {
      setFormLoading(false);
    }
  };

  const saveEmployee = async () => {
    setFormError(null);
    if (!form.lastname.trim()) return setFormError('Last Name is required.');

    setSaving(true);
    try {
      const body = {
        empid: formMode === 'create' ? (form.empid.trim() || undefined) : undefined,
        lastname: form.lastname.trim(),
        firstname: form.firstname.trim(),
        mi: form.mi.trim(),
        debtor_link: form.debtor_link || '',
      };

      const res =
        formMode === 'create'
          ? await apiFetch('/approval/create-employee/', {
              method: 'POST',
              body: JSON.stringify(body),
            })
          : await apiFetch(`/approval/update-employee/${encodeURIComponent(editingEmpid!)}/`, {
              method: 'PUT',
              body: JSON.stringify(body),
            });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(data?.message || `Request failed (${res.status})`);
        return;
      }

      loadEmployees();
      setView('list');
      if (formMode === 'create' && data?.empid) {
        setSelectedId(data.empid);
      } else if (formMode === 'update' && editingEmpid) {
        setSelectedId(editingEmpid);
      }
    } catch (err) {
      console.error('Error saving employee:', err);
      setFormError('Could not save the employee. Check the console for details.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async () => {
    if (!selectedEmployee) return;
    const confirmed = window.confirm(
      `Delete employee "${selectedEmployee.lastname}, ${selectedEmployee.firstname}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await apiFetch(`/approval/employee/${encodeURIComponent(selectedEmployee.empid)}/delete/`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.message || 'Could not delete this employee.');
        return;
      }
      setSelectedId(null);
      loadEmployees();
    } catch {
      alert('Could not delete this employee. Check the console for details.');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintList = () => {
    const rows = filteredEmployees
      .map(
        (e) => `
          <tr>
            <td>${e.empid}</td>
            <td>${e.lastname}</td>
            <td>${e.firstname}</td>
            <td>${e.mi}</td>
          </tr>`,
      )
      .join('');

    const html = `
      <html>
        <head>
          <title>Employee List</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; }
            h1 { font-size: 16px; margin-bottom: 4px; }
            p { color: #666; margin-top: 0; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Employee List</h1>
          <p>Printed ${new Date().toLocaleString()} — ${filteredEmployees.length} employee${filteredEmployees.length === 1 ? '' : 's'}</p>
          <table>
            <thead>
              <tr><th>Code</th><th>Last Name</th><th>First Name</th><th>Middle Name</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;

    const printWindow = window.open('', '_blank', 'width=800,height=650');
    if (!printWindow) {
      alert('Could not open the print window — check if your browser blocked the popup.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="!max-w-3xl" style={{ maxWidth: '48rem' }}>
        <DialogHeader>
          <DialogTitle>Clerk</DialogTitle>
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
              disabled={!selectedEmployee}
              variant="outline"
              className="justify-start text-xs h-8"
            >
              Update
            </Button>
            <Button
              size="sm"
              onClick={deleteEmployee}
              disabled={!selectedEmployee || deleting}
              variant="outline"
              className="justify-start text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
            >
              {deleting && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Delete
            </Button>
            <Button
              size="sm"
              onClick={handlePrintList}
              variant="outline"
              className="justify-start text-xs h-8"
            >
              Print List
            </Button>
          </div>

          <div className="flex-1 min-w-0">
            {view === 'add_new' || view === 'update' ? (
              formLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading employee...
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
                  <div>
                    <Label htmlFor="emp_id" className="text-xs">ID Number</Label>
                    <Input
                      id="emp_id"
                      value={formMode === 'update' ? (editingEmpid || '') : form.empid}
                      disabled={formMode === 'update'}
                      onChange={(e) => setForm((f) => ({ ...f, empid: e.target.value }))}
                      placeholder="(auto-generated)"
                      className="h-8 text-xs disabled:opacity-60"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Leave blank to auto-generate (sequential, e.g. 000005). Type a code here to
                      set it manually instead.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="emp_last" className="text-xs">
                      Last Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="emp_last"
                      autoFocus
                      value={form.lastname}
                      onChange={(e) => setForm((f) => ({ ...f, lastname: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div>
                    <Label htmlFor="emp_first" className="text-xs">First Name</Label>
                    <Input
                      id="emp_first"
                      value={form.firstname}
                      onChange={(e) => setForm((f) => ({ ...f, firstname: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div>
                    <Label htmlFor="emp_mi" className="text-xs">Middle Name</Label>
                    <Input
                      id="emp_mi"
                      value={form.mi}
                      maxLength={2}
                      onChange={(e) => setForm((f) => ({ ...f, mi: e.target.value }))}
                      placeholder="Initial"
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Stored as a middle initial (max 2 characters), not a full middle name.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="emp_debtor_link" className="text-xs">Debtor Link</Label>
                    <select
                      id="emp_debtor_link"
                      value={form.debtor_link}
                      onChange={(e) => setForm((f) => ({ ...f, debtor_link: e.target.value }))}
                      className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                    >
                      <option value="">None</option>
                      {customerOptions.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Links this employee to a customer/debtor record. Not confirmed against real
                      desktop data — no existing employee has this field populated yet.
                    </p>
                  </div>

                  {formError && <p className="text-xs text-red-500">{formError}</p>}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setView('list')} disabled={saving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveEmployee} disabled={saving}>
                      {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or code..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-[360px] overflow-y-auto">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/80">
                      <tr className="text-slate-500 dark:text-slate-400 text-left">
                        <th className="px-3 py-2 font-medium w-24">Code</th>
                        <th className="px-3 py-2 font-medium">Last Name</th>
                        <th className="px-3 py-2 font-medium">First Name</th>
                        <th className="px-3 py-2 font-medium">Middle Name</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loading ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading employees...
                          </td>
                        </tr>
                      ) : loadError ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-red-500">
                            Could not load employees -- check backend connection.
                          </td>
                        </tr>
                      ) : filteredEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                            No employees found.
                          </td>
                        </tr>
                      ) : (
                        filteredEmployees.map((r) => (
                          <tr
                            key={r.empid}
                            onClick={() => setSelectedId(r.empid)}
                            onDoubleClick={() => chooseEmployee(r)}
                            className={`cursor-pointer text-slate-700 dark:text-slate-200 ${
                              selectedId === r.empid
                                ? 'bg-orange-50 dark:bg-orange-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                            }`}
                          >
                            <td className="px-3 py-2 text-slate-500">{r.empid}</td>
                            <td className="px-3 py-2 font-medium">{r.lastname}</td>
                            <td className="px-3 py-2">{r.firstname}</td>
                            <td className="px-3 py-2 text-slate-500">{r.mi}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {filteredEmployees.length} employee{filteredEmployees.length === 1 ? '' : 's'} -- double-click a row, or select it and use Select.
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
              onClick={() => selectedEmployee && chooseEmployee(selectedEmployee)}
              disabled={!selectedEmployee}
            >
              Select
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}