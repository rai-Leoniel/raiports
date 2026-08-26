'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Calendar,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ShoppingCart,
  RefreshCw,
  X,
  UserPlus,
  Pencil,
  Upload,
  UserX,
  Printer,
  History,
  Save,
  MapPin as PinIcon,
  Plus,
} from 'lucide-react';

/* ---------------------------------------------------------------------- */
/* Customer picker modal — same popup used from the Sales Order List,     */
/* duplicated here since Billing lives in its own route/file.             */
/* If you'd rather share one copy, pull this component (and the           */
/* Customer type + CUSTOMERS data) into a shared file like                */
/* app/dashboard/sales/_components/customer-picker-modal.tsx and import   */
/* it from both page.tsx and billing/page.tsx.                            */
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

const CUSTOMERS: Customer[] = [
  { seq: 1, name: '2SJ AQUA FARM', address: '—', mobile: 'N/A', fax: 'N/A', email: '—', tin: '—', subLedger2: '—', custId: 'MAN-000047', type: 'Customer', modType: 'R', disc: '—', active: true },
  { seq: 2, name: 'ALBERT ROXAS', address: '—', mobile: 'N/A', fax: 'N/A', email: '—', tin: '—', subLedger2: '—', custId: 'MAN-000065', type: 'Customer', modType: 'R', disc: '—', active: true },
  { seq: 3, name: 'ALFONSO ABDUL KARIM', address: '—', mobile: 'N/A', fax: 'N/A', email: '—', tin: '—', subLedger2: '—', custId: 'MAN-000006', type: 'Customer', modType: 'R', disc: '—', active: true },
  { seq: 4, name: 'ALLIN ARRAEZ', address: '—', mobile: 'N/A', fax: 'N/A', email: '—', tin: '—', subLedger2: '—', custId: 'MAN-000019', type: 'Customer', modType: 'R', disc: '—', active: true },
  { seq: 5, name: 'ALMARIO, EDGAR', address: '—', mobile: 'N/A', fax: 'N/A', email: '—', tin: '—', subLedger2: '—', custId: 'MAN-000020', type: 'Customer', modType: 'R', disc: '—', active: true },
];

const CUSTOMER_SEARCH_FIELDS = ['Customer name', 'Mobile', 'Email', 'TIN'];
type ModalTab = 'list' | 'info' | 'import';

function CustomerPickerModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (c: Customer) => void;
}) {
  const [tab, setTab] = useState<ModalTab>('list');
  const [searchField, setSearchField] = useState(CUSTOMER_SEARCH_FIELDS[0]);
  const [query, setQuery] = useState('');
  const [hideInactive, setHideInactive] = useState(true);

  const [form, setForm] = useState({
    id: '',
    active: true,
    block: false,
    type: '',
    priceType: 'Retail Price',
    lastName: '',
    firstName: '',
    midName: '',
    company: false,
    birthdate: '2026-08-21',
    tinNumber: '',
    contactPerson: '',
    emailAddress: '',
    mobileNumber: '',
    phone: '',
    faxNumber: '',
    modeOfPayment: '',
    creditLimit: '0.00',
    discount: '',
    remarks: '',
  });
  const updateForm = (field: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const filtered = useMemo(() => {
    return CUSTOMERS.filter((c) => {
      if (hideInactive && c.inactive) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const map: Record<string, string> = { 'Customer name': c.name, Mobile: c.mobile, Email: c.email, TIN: c.tin };
      return map[searchField].toLowerCase().includes(q);
    });
  }, [query, searchField, hideInactive]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white">Select customer</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-44 shrink-0 flex flex-col gap-2 p-4 border-r border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/30">
            {tab === 'list' && (
              <>
                <button type="button" onClick={() => setTab('info')} className="flex items-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" /> Add new
                </button>
                <button type="button" className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Pencil className="w-3.5 h-3.5" /> Update
                </button>
                <button type="button" className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Upload className="w-3.5 h-3.5" /> Import Excel
                </button>
                <button type="button" className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Printer className="w-3.5 h-3.5" /> Print list
                </button>
                <div className="flex-1" />
                <button type="button" className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <UserX className="w-3.5 h-3.5" /> Deactivate
                </button>
              </>
            )}
            {tab === 'info' && (
              <>
                <button type="button" className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <History className="w-3.5 h-3.5" /> History
                </button>
                <button type="button" className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Upload className="w-3.5 h-3.5" /> Import
                </button>
                <div className="flex-1" />
                <button type="button" className="flex items-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
                <button type="button" onClick={() => setTab('list')} className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              </>
            )}
            {tab === 'import' && (
              <button type="button" onClick={() => setTab('list')} className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-100 dark:border-slate-700/60">
              {[
                { id: 'list' as ModalTab, label: 'Customer list' },
                { id: 'info' as ModalTab, label: 'Customer information' },
                { id: 'import' as ModalTab, label: 'Import Excel' },
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

            {tab === 'list' && (
              <>
                <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="relative">
                    <select
                      value={searchField}
                      onChange={(e) => setSearchField(e.target.value)}
                      className="appearance-none pl-3 pr-7 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {CUSTOMER_SEARCH_FIELDS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search ${searchField.toLowerCase()}…`}
                      className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideInactive}
                      onChange={(e) => setHideInactive(e.target.checked)}
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                    Hide inactive
                  </label>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/80 backdrop-blur">
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        {['Seq#', 'Customer', 'Address', 'Mobile', 'Fax', 'Email', 'TIN', 'Sub-ledger2', 'ID', 'Type', 'Mod Type', 'Disc', 'Active'].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => (
                        <tr
                          key={c.seq}
                          onClick={() => onSelect(c)}
                          className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-orange-50 dark:hover:bg-orange-900/10 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{c.seq}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{c.name}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.address}</td>
                          <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{c.mobile}</td>
                          <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{c.fax}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.email}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.tin}</td>
                          <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{c.subLedger2}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono text-xs">{c.custId}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.type}</td>
                          <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{c.modType}</td>
                          <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{c.disc}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                c.active
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                              }`}
                            >
                              {c.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={13} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                            No customers match this search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Showing {filtered.length} of {CUSTOMERS.length}</span>
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
              </>
            )}

            {tab === 'info' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                  <div className="md:col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="flex items-center gap-3 min-w-[240px]">
                      <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">ID</label>
                      <input
                        type="text"
                        value={form.id}
                        onChange={(e) => updateForm('id', e.target.value)}
                        placeholder="Auto-generated"
                        disabled
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer">
                      <input type="checkbox" checked={form.active} onChange={(e) => updateForm('active', e.target.checked)} className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
                      Active
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer">
                      <input type="checkbox" checked={form.block} onChange={(e) => updateForm('block', e.target.checked)} className="rounded border-slate-300 text-red-500 focus:ring-red-500" />
                      Block
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Price type <span className="text-red-500">*</span></label>
                    <div className="relative flex-1">
                      <select
                        value={form.priceType}
                        onChange={(e) => updateForm('priceType', e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option>Retail Price</option>
                        <option>Wholesale Price</option>
                        <option>Distributor Price</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Type</label>
                    <div className="relative flex-1">
                      <select
                        value={form.type}
                        onChange={(e) => updateForm('type', e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Select type…</option>
                        <option value="Customer">Customer</option>
                        <option value="Distributor">Distributor</option>
                        <option value="Walk-in">Walk-in</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer">
                    <input type="checkbox" checked={form.company} onChange={(e) => updateForm('company', e.target.checked)} className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
                    Company
                  </label>

                  <div className="flex items-center gap-3">
                    <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Last name <span className="text-red-500">*</span></label>
                    <input type="text" value={form.lastName} onChange={(e) => updateForm('lastName', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Birthdate <span className="text-red-500">*</span></label>
                    <div className="relative flex-1">
                      <Calendar className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="date" value={form.birthdate} onChange={(e) => updateForm('birthdate', e.target.value)} className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">First name <span className="text-red-500">*</span></label>
                    <input type="text" value={form.firstName} onChange={(e) => updateForm('firstName', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div />

                  <div className="flex items-center gap-3">
                    <label className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Mid name</label>
                    <input type="text" value={form.midName} onChange={(e) => updateForm('midName', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Information details</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">TIN number</label>
                      <input type="text" value={form.tinNumber} onChange={(e) => updateForm('tinNumber', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Email address <span className="text-red-500">*</span></label>
                      <input type="email" value={form.emailAddress} onChange={(e) => updateForm('emailAddress', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Contact person</label>
                      <input type="text" value={form.contactPerson} onChange={(e) => updateForm('contactPerson', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Mobile number <span className="text-red-500">*</span></label>
                      <input type="tel" value={form.mobileNumber} onChange={(e) => updateForm('mobileNumber', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div />
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Phone <span className="text-red-500">*</span></label>
                      <input type="tel" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div />
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Fax number</label>
                      <input type="text" value={form.faxNumber} onChange={(e) => updateForm('faxNumber', e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                  </div>

                  <button type="button" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors mt-4">
                    <PinIcon className="w-3.5 h-3.5" /> Add address
                  </button>

                  <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                          {['Line', 'Main', 'Type', 'Full address', 'Country', 'Zip code', 'Province', 'City', 'Barangay', 'Sitio', ''].map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={11} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                            No addresses added yet.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Settings</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Mode of payment <span className="text-red-500">*</span></label>
                      <div className="relative flex-1">
                        <select
                          value={form.modeOfPayment}
                          onChange={(e) => updateForm('modeOfPayment', e.target.value)}
                          className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="">Select mode…</option>
                          <option value="Cash">Cash</option>
                          <option value="Credit">Credit</option>
                          <option value="Bank transfer">Bank transfer</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Credit limit</label>
                      <input type="text" value={form.creditLimit} onChange={(e) => updateForm('creditLimit', e.target.value)} className="flex-1 px-3 py-2 text-sm text-right rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 tabular-nums" />
                    </div>
                    <div />
                    <div className="flex items-center gap-3">
                      <label className="w-28 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Discount</label>
                      <div className="relative flex-1">
                        <select
                          value={form.discount}
                          onChange={(e) => updateForm('discount', e.target.value)}
                          className="w-full appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="">None</option>
                          <option value="5">5%</option>
                          <option value="10">10%</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <button type="button" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors mt-4">
                    <Plus className="w-3.5 h-3.5" /> Add account
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            {['Lir', 'Code', 'Account name', 'Main'].map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                              No accounts added yet.
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Remarks</label>
                      <textarea
                        value={form.remarks}
                        onChange={(e) => updateForm('remarks', e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'import' && (
              <div className="flex-1 flex items-center justify-center p-10 text-sm text-slate-400 dark:text-slate-500">
                Excel import goes here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Billing List — mirrors the desktop app's Billing tab                   */
/* ---------------------------------------------------------------------- */

type BillingRow = {
  transNo: string;
  customer: string;
  ordDate: string;
  transDate: string;
  ordAmount: number;
  discount: number;
  totalAmnt: number;
  netAmnt: number;
  tax: number;
  payment: number;
  balanceDue: number;
  pending: boolean;
  assistedBy: string;
  cashier: string;
  jrnlzd: boolean;
  cancelled: boolean;
  userCancld: string;
  dateCancld: string;
  timeCancld: string;
  outlet: string;
  location: string;
  userId: string;
};

const BILLING_ROWS: BillingRow[] = [
  { transNo: 'BIL-20114', customer: 'Bacolod Hardware Supply', ordDate: '2026-08-19', transDate: '2026-08-19', ordAmount: 24500, discount: 0, totalAmnt: 24500, netAmnt: 24500, tax: 2625, payment: 0, balanceDue: 24500, pending: true, assistedBy: 'J. Reyes', cashier: 'M. Santos', jrnlzd: false, cancelled: false, userCancld: '', dateCancld: '', timeCancld: '', outlet: 'MANDAUE BRANCH', location: 'Mandaue', userId: 'jreyes' },
  { transNo: 'BIL-20113', customer: 'Riverside Grocers', ordDate: '2026-08-19', transDate: '2026-08-19', ordAmount: 8200, discount: 200, totalAmnt: 8000, netAmnt: 8000, tax: 857, payment: 8000, balanceDue: 0, pending: false, assistedBy: 'A. Cruz', cashier: 'M. Santos', jrnlzd: true, cancelled: false, userCancld: '', dateCancld: '', timeCancld: '', outlet: 'MANDAUE BRANCH', location: 'Mandaue', userId: 'acruz' },
  { transNo: 'BIL-20112', customer: 'Golden Fields Trading', ordDate: '2026-08-18', transDate: '2026-08-18', ordAmount: 154300, discount: 0, totalAmnt: 154300, netAmnt: 154300, tax: 16532, payment: 0, balanceDue: 154300, pending: true, assistedBy: 'J. Reyes', cashier: 'R. Tan', jrnlzd: false, cancelled: false, userCancld: '', dateCancld: '', timeCancld: '', outlet: 'BUTUAN BRANCH', location: 'Butuan', userId: 'jreyes' },
  { transNo: 'BIL-20111', customer: 'Sunrise Bakery Co.', ordDate: '2026-08-18', transDate: '2026-08-18', ordAmount: 3600, discount: 180, totalAmnt: 3420, netAmnt: 3420, tax: 366, payment: 0, balanceDue: 0, pending: false, assistedBy: 'P. Lim', cashier: 'R. Tan', jrnlzd: false, cancelled: true, userCancld: 'rtan', dateCancld: '2026-08-18', timeCancld: '3:40 PM', outlet: 'BUTUAN BRANCH', location: 'Butuan', userId: 'plim' },
  { transNo: 'BIL-20110', customer: 'Northgate Electronics', ordDate: '2026-08-17', transDate: '2026-08-17', ordAmount: 61250, discount: 0, totalAmnt: 61250, netAmnt: 61250, tax: 6562, payment: 30625, balanceDue: 30625, pending: true, assistedBy: 'A. Cruz', cashier: 'M. Santos', jrnlzd: false, cancelled: false, userCancld: '', dateCancld: '', timeCancld: '', outlet: 'MANDAUE BRANCH', location: 'Mandaue', userId: 'acruz' },
  { transNo: 'BIL-20109', customer: 'Villareal Farm Supply', ordDate: '2026-08-17', transDate: '2026-08-17', ordAmount: 12750, discount: 0, totalAmnt: 12750, netAmnt: 12750, tax: 1366, payment: 12750, balanceDue: 0, pending: false, assistedBy: 'J. Reyes', cashier: 'R. Tan', jrnlzd: true, cancelled: false, userCancld: '', dateCancld: '', timeCancld: '', outlet: 'BUTUAN BRANCH', location: 'Butuan', userId: 'jreyes' },
];

const OUTLETS = ['All outlets', 'MANDAUE BRANCH', 'BUTUAN BRANCH'];

const BILLING_COLUMNS: { key: keyof BillingRow; label: string; align?: 'right' }[] = [
  { key: 'transNo', label: 'Trans.No' },
  { key: 'customer', label: 'Customer' },
  { key: 'ordDate', label: 'Ord Date' },
  { key: 'transDate', label: 'Trans. Date' },
  { key: 'ordAmount', label: 'Ord Amount', align: 'right' },
  { key: 'discount', label: 'Discount', align: 'right' },
  { key: 'totalAmnt', label: 'Total Amnt', align: 'right' },
  { key: 'netAmnt', label: 'Net Amnt', align: 'right' },
  { key: 'tax', label: 'Tax', align: 'right' },
  { key: 'payment', label: 'Payment', align: 'right' },
  { key: 'balanceDue', label: 'Balance Due', align: 'right' },
  { key: 'pending', label: 'Pending' },
  { key: 'assistedBy', label: 'Assisted By' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'jrnlzd', label: 'Jrnlzd' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'userCancld', label: 'User Cancld' },
  { key: 'dateCancld', label: 'Date Cancld' },
  { key: 'timeCancld', label: 'Time Cancld' },
  { key: 'outlet', label: 'Outlet' },
  { key: 'location', label: 'Location' },
  { key: 'userId', label: 'user_id' },
];

function peso(n: number) {
  return n === 0 ? '—' : `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function BoolPill({ value, trueLabel, falseLabel, tone }: { value: boolean; trueLabel: string; falseLabel: string; tone: 'green' | 'amber' | 'red' }) {
  const toneMap = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${value ? toneMap[tone] : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`}>
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function renderCell(row: BillingRow, key: keyof BillingRow) {
  const value = row[key];
  if (key === 'pending') return <BoolPill value={row.pending} trueLabel="Pending" falseLabel="—" tone="amber" />;
  if (key === 'jrnlzd') return <BoolPill value={row.jrnlzd} trueLabel="Yes" falseLabel="No" tone="green" />;
  if (key === 'cancelled') return <BoolPill value={row.cancelled} trueLabel="Cancelled" falseLabel="No" tone="red" />;
  if (key === 'ordAmount' || key === 'discount' || key === 'totalAmnt' || key === 'netAmnt' || key === 'tax' || key === 'payment') {
    return <span className="tabular-nums">{peso(value as number)}</span>;
  }
  if (key === 'balanceDue') {
    const n = value as number;
    return <span className={`tabular-nums font-medium ${n > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>{peso(n)}</span>;
  }
  if (key === 'transNo') return <span className="font-medium text-orange-600 dark:text-orange-400">{value as string}</span>;
  return <span>{(value as string) || '—'}</span>;
}

export default function BillingPage() {
  const router = useRouter();
  const [outlet, setOutlet] = useState(OUTLETS[0]);
  const [dateFrom, setDateFrom] = useState('2026-08-21');
  const [dateTo, setDateTo] = useState('2026-08-21');
  const [viewPendingOnly, setViewPendingOnly] = useState(true);
  const [notIncludeCancelled, setNotIncludeCancelled] = useState(true);
  const [query, setQuery] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const filtered = useMemo(() => {
    return BILLING_ROWS.filter((r) => {
      if (r.transDate < dateFrom || r.transDate > dateTo) return false;
      if (outlet !== 'All outlets' && r.outlet !== outlet) return false;
      if (viewPendingOnly && !r.pending) return false;
      if (notIncludeCancelled && r.cancelled) return false;
      if (query.trim() && !r.customer.toLowerCase().includes(query.trim().toLowerCase()) && !r.transNo.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [dateFrom, dateTo, outlet, viewPendingOnly, notIncludeCancelled, query]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          {/* Back to Sales — same pattern as the Sales Order List's back link */}
          <button
            type="button"
            onClick={() => router.push('/dashboard/sales')}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Sales
          </button>
          <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">Billing</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} record{filtered.length === 1 ? '' : 's'} in range</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCustomerModal(true)}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-sm"
        >
          <ShoppingCart className="w-4 h-4" /> Create New (F1)
        </button>
      </div>

      {/* Filter bar — same fields as the desktop Sales Order List toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Transaction dates from</label>
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
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Outlet</label>
            <div className="relative">
              <select value={outlet} onChange={(e) => setOutlet(e.target.value)} className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                {OUTLETS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Trans No. or Customer…" className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer pb-2">
            <input type="checkbox" checked={viewPendingOnly} onChange={(e) => setViewPendingOnly(e.target.checked)} className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
            View Pending Only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer pb-2">
            <input type="checkbox" checked={notIncludeCancelled} onChange={(e) => setNotIncludeCancelled(e.target.checked)} className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
            Not Include Cancelled
          </label>
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors mb-0.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh List
          </button>
        </div>
      </div>

      {/* Table — full 22-column set from the desktop Billing screen */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                {BILLING_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.transNo} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                  {BILLING_COLUMNS.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {renderCell(r, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={BILLING_COLUMNS.length} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                    No billing records match these filters. Try widening the date range or clearing filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <span className="text-xs text-slate-500 dark:text-slate-400">Showing {filtered.length} of {BILLING_ROWS.length}</span>
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

      {/* Same Customer List / Customer Information / Import popup, opened from Create New */}
      {showCustomerModal && (
        <CustomerPickerModal
          onClose={() => setShowCustomerModal(false)}
          onSelect={(customer) => {
            // TODO: once selected, move into the Billing Entry form with this
            // customer pre-filled — same next step as the desktop app.
            console.log('Selected customer for billing:', customer);
            setShowCustomerModal(false);
          }}
        />
      )}
    </main>
  );
}