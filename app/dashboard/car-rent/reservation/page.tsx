'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Search,
  X,
  Loader2,
  Ban,
  CalendarClock,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------
// ⚠️ NO REFERENCE SCREENSHOT for this screen originally — layout has
// since been aligned to match the desktop Reservation/Booking screen
// (Res No. / Renter / Vehicle / Plate No. / Pickup Date / Pickup Time /
// Return Date / Status / Notes, with New / Confirm / Cancel Res. /
// Refresh actions).
//
// ⚠️ ENDPOINT ASSUMPTIONS — not confirmed against your Django backend:
//
//   GET  /carrent/reservations/?branch=<code>&search=<q>&status=<code>
//        -> { reservations: Reservation[] }
//   GET  /carrent/units/?branch=<code>&status=vacant
//        -> reused from Unit Status, to populate the vehicle picker
//   GET  /carrent/renters/?branch=<code>
//        -> reused from Renters, to populate the renter picker
//   POST /carrent/reservations/          -> create
//   PUT  /carrent/reservations/<id>/     -> update (incl. status changes)
// ---------------------------------------------------------------------

type ReservationStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

type Reservation = {
  id: string | number;
  reservation_no: string;
  renter_name: string;
  renter_id: string | number;
  unit_conduction_no: string;
  unit_plate_no?: string;
  unit_id: string | number;
  pickup_date: string;
  pickup_time?: string;
  return_date: string;
  daily_rate: number;
  total_amount: number;
  status: ReservationStatus;
  notes?: string;
};

type RenterOption = { id: string | number; name: string };
type UnitOption = { id: string | number; label: string; daily_rate: number };

type ReservationFormState = {
  renter_id: string;
  unit_id: string;
  pickup_date: string;
  pickup_time: string;
  return_date: string;
  notes: string;
};

const emptyForm: ReservationFormState = {
  renter_id: '',
  unit_id: '',
  pickup_date: '',
  pickup_time: '',
  return_date: '',
  notes: '',
};

const STATUS_META: Record<ReservationStatus, { label: string; badge: string }> = {
  pending: { label: 'Pending', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  confirmed: { label: 'Confirmed', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  completed: { label: 'Completed', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  cancelled: { label: 'Cancelled', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
};

// Placeholder — shown whenever /carrent/reservations/ isn't reachable
// yet, so the page still demonstrates the intended look.
const PLACEHOLDER_RESERVATIONS: Reservation[] = [
  {
    id: 'placeholder-1',
    reservation_no: 'RES-0001',
    renter_name: 'Juan Dela Cruz',
    renter_id: 'placeholder-1',
    unit_conduction_no: 'CON120',
    unit_plate_no: 'PLATE124',
    unit_id: 'placeholder-1',
    pickup_date: '2026-08-26',
    pickup_time: '09:00',
    return_date: '2026-08-28',
    daily_rate: 1500,
    total_amount: 3000,
    status: 'pending',
    notes: '',
  },
];

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const start = new Date(a);
  const end = new Date(b);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export default function ReservationPage() {
  const { user } = useAuth();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingPlaceholder, setShowingPlaceholder] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReservationStatus>('all');

  const [renterOptions, setRenterOptions] = useState<RenterOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);

  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ReservationFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fetchReservations = async () => {
    if (!user?.branch) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branch: user.branch });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiFetch(`/carrent/reservations/?${params.toString()}`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setReservations(Array.isArray(data?.reservations) ? data.reservations : []);
      setShowingPlaceholder(false);
    } catch (err) {
      console.error('Error fetching reservations:', err);
      setReservations(PLACEHOLDER_RESERVATIONS);
      setShowingPlaceholder(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchReservations, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Populate renter + vacant-vehicle pickers for the modal.
  useEffect(() => {
    if (!user?.branch) return;

    apiFetch(`/carrent/renters/?branch=${user.branch}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.renters) ? data.renters : [];
        setRenterOptions(
          list.map((r: any) => ({ id: r.id, name: `${r.last_name}, ${r.first_name}` }))
        );
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

  const selectedReservation = reservations.find((r) => r.id === selectedId) ?? null;

  const selectedUnitRate = useMemo(() => {
    const unit = unitOptions.find((u) => String(u.id) === form.unit_id);
    return unit?.daily_rate ?? 0;
  }, [form.unit_id, unitOptions]);

  const estimatedTotal = useMemo(() => {
    const nights = daysBetween(form.pickup_date, form.return_date);
    return nights * selectedUnitRate;
  }, [form.pickup_date, form.return_date, selectedUnitRate]);

  const openAdd = () => {
    setForm(emptyForm);
    setSaveError(null);
    setModalOpen(true);
  };

  const handleFormChange = (field: keyof ReservationFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaveError(null);

    if (!form.renter_id || !form.unit_id || !form.pickup_date || !form.return_date) {
      setSaveError('Please fill in all required fields.');
      return;
    }
    if (daysBetween(form.pickup_date, form.return_date) <= 0) {
      setSaveError('Return date must be after the pickup date.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/carrent/reservations/', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          branch: user?.branch,
          daily_rate: selectedUnitRate,
          total_amount: estimatedTotal,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || body?.detail || 'Failed to save reservation.');
      }

      setModalOpen(false);
      setForm(emptyForm);
      fetchReservations();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save reservation.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReservation = async () => {
    if (!selectedReservation) return;
    setConfirming(true);
    try {
      const res = await apiFetch(`/carrent/reservations/${selectedReservation.id}/`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'confirmed' }),
      });
      if (!res.ok) throw new Error('Failed to confirm reservation.');
      fetchReservations();
    } catch (err) {
      console.error('Error confirming reservation:', err);
      setError('Could not confirm this reservation. Try again.');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!selectedReservation) return;
    if (!confirm(`Cancel reservation ${selectedReservation.reservation_no}?`)) return;

    setCancelling(true);
    try {
      const res = await apiFetch(`/carrent/reservations/${selectedReservation.id}/`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error('Failed to cancel reservation.');
      setSelectedId(null);
      fetchReservations();
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      setError('Could not cancel this reservation. Try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
          Reservation
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Upcoming and past vehicle bookings for your branch.
        </p>
      </div>

      <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={openAdd}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> New
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/30"
                onClick={handleConfirmReservation}
                disabled={!selectedReservation || selectedReservation.status !== 'pending' || confirming}
              >
                {confirming ? 'Confirming...' : 'Confirm'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={handleCancelReservation}
                disabled={!selectedReservation || selectedReservation.status === 'cancelled' || cancelling}
              >
                <Ban className="w-3.5 h-3.5 mr-1.5" /> {cancelling ? 'Cancelling...' : 'Cancel Res.'}
              </Button>
              <Button size="sm" variant="outline" onClick={fetchReservations} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Refresh
              </Button>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | ReservationStatus)}
                className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
              >
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_META) as ReservationStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reservations..."
                className="pl-9 h-9"
              />
            </div>
          </div>

          {showingPlaceholder && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs px-3 py-2">
              Showing placeholder data — the reservations endpoint isn&apos;t connected yet.
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
                  <th className="px-4 py-2.5 font-medium">Res No.</th>
                  <th className="px-4 py-2.5 font-medium">Renter</th>
                  <th className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th className="px-4 py-2.5 font-medium">Plate No.</th>
                  <th className="px-4 py-2.5 font-medium">Pickup Date</th>
                  <th className="px-4 py-2.5 font-medium">Pickup Time</th>
                  <th className="px-4 py-2.5 font-medium">Return Date</th>
                  <th className="px-4 py-2.5 font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                    </td>
                  </tr>
                ) : reservations.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center">
                      <CalendarClock className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No reservations {search ? `match "${search}"` : 'yet'}.
                      </p>
                    </td>
                  </tr>
                ) : (
                  reservations.map((r) => (
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
                        {r.reservation_no}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.renter_name}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.unit_conduction_no}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.unit_plate_no ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.pickup_date}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.pickup_time ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.return_date}</td>
                      <td className="px-4 py-2.5 font-heading tabular-nums font-semibold text-slate-900 dark:text-white">
                        ₱{r.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={`${STATUS_META[r.status]?.badge ?? ''} font-heading`}>
                          {STATUS_META[r.status]?.label ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                        {r.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Reservation modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-lg dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Reservation</p>
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                  Add Reservation
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

                <Field label="Pickup Date" required>
                  <Input type="date" value={form.pickup_date} onChange={(e) => handleFormChange('pickup_date', e.target.value)} />
                </Field>
                <Field label="Pickup Time">
                  <Input type="time" value={form.pickup_time} onChange={(e) => handleFormChange('pickup_time', e.target.value)} />
                </Field>
                <Field label="Return Date" required>
                  <Input type="date" value={form.return_date} onChange={(e) => handleFormChange('return_date', e.target.value)} />
                </Field>

                <Field label="Notes" full>
                  <Input value={form.notes} onChange={(e) => handleFormChange('notes', e.target.value)} />
                </Field>
              </div>

              {form.unit_id && form.pickup_date && form.return_date && (
                <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {daysBetween(form.pickup_date, form.return_date)} night(s) × ₱
                      {selectedUnitRate.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-slate-400">Estimated total</p>
                  </div>
                  <p className="font-heading tabular-nums text-lg font-bold text-slate-900 dark:text-white">
                    ₱{estimatedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
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
                {saving ? 'Saving...' : 'Save'}
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