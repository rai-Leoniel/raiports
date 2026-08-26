'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Search,
  X,
  Loader2,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------
// ⚠️ NO REFERENCE SCREENSHOT for this screen — original design following
// the same conventions as Unit Status / Renters / Reservation. This
// treats "Registration" as the vehicle CHECKOUT step — turning a renter +
// vacant vehicle into a live rental agreement, separate from an advance
// Reservation. Adjust freely if your actual workflow is different.
//
// ⚠️ ENDPOINT ASSUMPTIONS — not confirmed against your Django backend:
//
//   GET  /carrent/registrations/?branch=<code>&search=<q>&status=<code>
//        -> { registrations: Registration[] }
//   GET  /carrent/renters/?branch=<code>        -> reused for the picker
//   GET  /carrent/units/?branch=<code>&status=vacant -> reused for picker
//   POST /carrent/registrations/                -> checkout (creates,
//        should also flip the unit's status to "in_use" server-side)
//   PUT  /carrent/registrations/<id>/return/     -> process return
//        (should flip the unit's status back to "vacant" server-side)
// ---------------------------------------------------------------------

type RegistrationStatus = 'active' | 'returned' | 'overdue';

type Registration = {
  id: string | number;
  agreement_no: string;
  renter_name: string;
  renter_id: string | number;
  unit_conduction_no: string;
  unit_id: string | number;
  date_out: string;
  expected_return: string;
  date_returned?: string;
  odometer_out: number;
  odometer_in?: number;
  deposit_amount: number;
  status: RegistrationStatus;
};

type RenterOption = { id: string | number; name: string };
type UnitOption = { id: string | number; label: string; daily_rate: number };

type RegistrationFormState = {
  renter_id: string;
  unit_id: string;
  date_out: string;
  expected_return: string;
  odometer_out: string;
  fuel_out: string;
  deposit_amount: string;
  license_verified: boolean;
};

const emptyForm: RegistrationFormState = {
  renter_id: '',
  unit_id: '',
  date_out: '',
  expected_return: '',
  odometer_out: '',
  fuel_out: 'Full',
  deposit_amount: '',
  license_verified: false,
};

const FUEL_LEVELS = ['Full', '3/4', '1/2', '1/4', 'Empty'];

const STATUS_META: Record<RegistrationStatus, { label: string; badge: string }> = {
  active: { label: 'Active', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  returned: { label: 'Returned', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  overdue: { label: 'Overdue', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

// Placeholder — shown whenever /carrent/registrations/ isn't reachable
// yet, so the page still demonstrates the intended look.
const PLACEHOLDER_REGISTRATIONS: Registration[] = [
  {
    id: 'placeholder-1',
    agreement_no: 'REG-0001',
    renter_name: 'Juan Dela Cruz',
    renter_id: 'placeholder-1',
    unit_conduction_no: 'CON120',
    unit_id: 'placeholder-1',
    date_out: '2026-08-25',
    expected_return: '2026-08-28',
    odometer_out: 12500,
    deposit_amount: 2000,
    status: 'active',
  },
];

export default function RegistrationPage() {
  const { user } = useAuth();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingPlaceholder, setShowingPlaceholder] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RegistrationStatus>('all');

  const [renterOptions, setRenterOptions] = useState<RenterOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);

  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RegistrationFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [odometerIn, setOdometerIn] = useState('');
  const [processingReturn, setProcessingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  const fetchRegistrations = async () => {
    if (!user?.branch) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branch: user.branch });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiFetch(`/carrent/registrations/?${params.toString()}`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setRegistrations(Array.isArray(data?.registrations) ? data.registrations : []);
      setShowingPlaceholder(false);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      setRegistrations(PLACEHOLDER_REGISTRATIONS);
      setShowingPlaceholder(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchRegistrations, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!user?.branch) return;

    apiFetch(`/carrent/renters/?branch=${user.branch}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.renters) ? data.renters : [];
        setRenterOptions(list.map((r: any) => ({ id: r.id, name: `${r.last_name}, ${r.first_name}` })));
      })
      .catch((err) => console.error('Error fetching renters for picker:', err));

    apiFetch(`/carrent/units/?branch=${user.branch}&status=vacant`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.units) ? data.units : [];
        setUnitOptions(
          list.map((u: any) => ({
            id: u.id,
            label: `${u.conduction_no} — ${u.plate_no}`,
            daily_rate: u.daily_rate ?? 0,
          }))
        );
      })
      .catch((err) => console.error('Error fetching vacant units for picker:', err));
  }, [user?.branch]);

  const counts = useMemo(() => {
    const base = { active: 0, returned: 0, overdue: 0 };
    registrations.forEach((r) => {
      if (r.status in base) base[r.status] += 1;
    });
    return base;
  }, [registrations]);

  const selectedRegistration = registrations.find((r) => r.id === selectedId) ?? null;

  const openAdd = () => {
    setForm(emptyForm);
    setSaveError(null);
    setModalOpen(true);
  };

  const handleFormChange = (field: keyof RegistrationFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaveError(null);

    if (!form.renter_id || !form.unit_id || !form.date_out || !form.expected_return || !form.odometer_out) {
      setSaveError('Please fill in all required fields.');
      return;
    }
    if (!form.license_verified) {
      setSaveError("Please confirm the renter's license has been verified.");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/carrent/registrations/', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          odometer_out: parseFloat(form.odometer_out) || 0,
          deposit_amount: parseFloat(form.deposit_amount) || 0,
          branch: user?.branch,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || body?.detail || 'Failed to register checkout.');
      }

      setModalOpen(false);
      setForm(emptyForm);
      fetchRegistrations();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to register checkout.');
    } finally {
      setSaving(false);
    }
  };

  const openReturn = () => {
    if (!selectedRegistration) return;
    setOdometerIn('');
    setReturnError(null);
    setReturnModalOpen(true);
  };

  const handleProcessReturn = async () => {
    if (!selectedRegistration) return;
    if (!odometerIn) {
      setReturnError('Please enter the odometer reading on return.');
      return;
    }

    setProcessingReturn(true);
    setReturnError(null);
    try {
      const res = await apiFetch(`/carrent/registrations/${selectedRegistration.id}/return/`, {
        method: 'PUT',
        body: JSON.stringify({
          odometer_in: parseFloat(odometerIn) || 0,
          date_returned: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error('Failed to process return.');
      setReturnModalOpen(false);
      setSelectedId(null);
      fetchRegistrations();
    } catch (err) {
      console.error('Error processing return:', err);
      setReturnError('Could not process this return. Try again.');
    } finally {
      setProcessingReturn(false);
    }
  };

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
          Registration
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Vehicle checkouts and active rental agreements for your branch.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
              <p className="font-heading tabular-nums text-lg font-bold text-slate-900 dark:text-white">{counts.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Returned</p>
              <p className="font-heading tabular-nums text-lg font-bold text-slate-900 dark:text-white">{counts.returned}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Overdue</p>
              <p className="font-heading tabular-nums text-lg font-bold text-slate-900 dark:text-white">{counts.overdue}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={openAdd}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Register Checkout
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={openReturn}
                disabled={!selectedRegistration || selectedRegistration.status !== 'active'}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Process Return
              </Button>
              <Button size="sm" variant="outline" onClick={fetchRegistrations} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Refresh
              </Button>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | RegistrationStatus)}
                className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
              >
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_META) as RegistrationStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search registrations..."
                className="pl-9 h-9"
              />
            </div>
          </div>

          {showingPlaceholder && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs px-3 py-2">
              Showing placeholder data — the registrations endpoint isn&apos;t connected yet.
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
                  <th className="px-4 py-2.5 font-medium">Agreement No.</th>
                  <th className="px-4 py-2.5 font-medium">Renter</th>
                  <th className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th className="px-4 py-2.5 font-medium">Date Out</th>
                  <th className="px-4 py-2.5 font-medium">Expected Return</th>
                  <th className="px-4 py-2.5 font-medium">Deposit</th>
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
                ) : registrations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <ClipboardCheck className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No registrations {search ? `match "${search}"` : 'yet'}.
                      </p>
                    </td>
                  </tr>
                ) : (
                  registrations.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === r.id
                          ? 'bg-orange-50 dark:bg-orange-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-heading font-semibold text-slate-900 dark:text-white">
                        {r.agreement_no}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.renter_name}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.unit_conduction_no}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.date_out}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.expected_return}</td>
                      <td className="px-4 py-2.5 font-heading tabular-nums font-semibold text-slate-900 dark:text-white">
                        ₱{r.deposit_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={`${STATUS_META[r.status]?.badge ?? ''} font-heading`}>
                          {STATUS_META[r.status]?.label ?? r.status}
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

      {/* Register Checkout modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-lg dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Registration</p>
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                  Register Checkout
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <CardContent className="p-5 max-h-[70vh] overflow-y-auto">
              {saveError && (
                <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs px-3 py-2">
                  {saveError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Renter" required full>
                  <select
                    value={form.renter_id}
                    onChange={(e) => handleFormChange('renter_id', e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                  >
                    <option value="">Select renter...</option>
                    {renterOptions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Vehicle" required full>
                  <select
                    value={form.unit_id}
                    onChange={(e) => handleFormChange('unit_id', e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                  >
                    <option value="">Select vacant vehicle...</option>
                    {unitOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Date/Time Out" required>
                  <Input type="datetime-local" value={form.date_out} onChange={(e) => handleFormChange('date_out', e.target.value)} />
                </Field>
                <Field label="Expected Return" required>
                  <Input type="datetime-local" value={form.expected_return} onChange={(e) => handleFormChange('expected_return', e.target.value)} />
                </Field>

                <Field label="Odometer Out (km)" required>
                  <Input type="number" value={form.odometer_out} onChange={(e) => handleFormChange('odometer_out', e.target.value)} />
                </Field>
                <Field label="Fuel Level Out">
                  <select
                    value={form.fuel_out}
                    onChange={(e) => handleFormChange('fuel_out', e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                  >
                    {FUEL_LEVELS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Deposit Amount" full>
                  <Input type="number" value={form.deposit_amount} onChange={(e) => handleFormChange('deposit_amount', e.target.value)} />
                </Field>

                <div className="col-span-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.license_verified}
                      onChange={(e) => handleFormChange('license_verified', e.target.checked)}
                      className="accent-orange-500"
                    />
                    Driver&apos;s license has been checked and verified
                  </label>
                </div>
              </div>
            </CardContent>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Register'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Process Return modal */}
      {returnModalOpen && selectedRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-sm dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                Process Return
              </h3>
              <button
                type="button"
                onClick={() => setReturnModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <CardContent className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Returning <span className="font-semibold text-slate-900 dark:text-white">{selectedRegistration.unit_conduction_no}</span> from{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{selectedRegistration.renter_name}</span> ({selectedRegistration.agreement_no}).
              </p>

              {returnError && (
                <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs px-3 py-2">
                  {returnError}
                </div>
              )}

              <Field label="Odometer In (km)" required>
                <Input type="number" value={odometerIn} onChange={(e) => setOdometerIn(e.target.value)} />
              </Field>
            </CardContent>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <Button variant="outline" onClick={() => setReturnModalOpen(false)} disabled={processingReturn}>
                Cancel
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleProcessReturn}
                disabled={processingReturn}
              >
                {processingReturn ? 'Processing...' : 'Confirm Return'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <Label className="text-xs">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}