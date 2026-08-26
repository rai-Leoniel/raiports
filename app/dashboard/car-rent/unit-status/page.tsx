'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Car,
  CarTaxiFront,
  Plus,
  RefreshCw,
  Search,
  X,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------
// ⚠️ ENDPOINT ASSUMPTIONS — none of these are confirmed against your
// Django backend yet (unlike the approval dashboard, which had real,
// confirmed field names/endpoints). Swap these for the real routes:
//
//   GET  /carrent/units/?branch=<code>&status=<code>&unit_type=<code>&search=<q>
//        -> { units: Unit[] }
//   POST /carrent/units/
//        -> creates a vehicle, body = VehicleFormState
//   GET  /carrent/unit-types/
//        -> { unit_types: { value: string, label: string }[] }
//
// If your backend uses different field names (e.g. "cond_no" instead of
// "conduction_no"), update the Unit type + form field keys below —
// everything else (grid, filters, modal) is independent of that.
// ---------------------------------------------------------------------

type UnitStatus = 'vacant' | 'in_use' | 'out_of_order';

type Unit = {
  id: string | number;
  conduction_no: string;
  plate_no: string;
  cr_no?: string;
  engine_no?: string;
  make: string;
  series?: string;
  color?: string;
  year_model?: string;
  unit_type: string;
  daily_rate: number;
  status: UnitStatus;
};

type VehicleFormState = {
  conduction_no: string;
  plate_no: string;
  cr_no: string;
  engine_no: string;
  make: string;
  series: string;
  color: string;
  year_model: string;
  unit_type: string;
  daily_rate: string;
};

const emptyForm: VehicleFormState = {
  conduction_no: '',
  plate_no: '',
  cr_no: '',
  engine_no: '',
  make: '',
  series: '',
  color: '',
  year_model: '',
  unit_type: '',
  daily_rate: '',
};

const STATUS_META: Record<UnitStatus, { label: string; dot: string; card: string }> = {
  vacant: {
    label: 'Vacant',
    dot: 'bg-green-500',
    card: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-950/30 dark:border-green-900 dark:text-green-100',
  },
  in_use: {
    label: 'In Use',
    dot: 'bg-blue-500',
    card: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-100',
  },
  out_of_order: {
    label: 'Out of Order',
    dot: 'bg-purple-500',
    card: 'bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-950/30 dark:border-purple-900 dark:text-purple-100',
  },
};

// Shown whenever /carrent/units/ isn't reachable yet (404, network error,
// etc.) so the page still demonstrates the intended look instead of just
// showing an error banner. Remove this once the real endpoint is wired up.
const PLACEHOLDER_UNITS: Unit[] = [
  {
    id: 'placeholder-1',
    conduction_no: 'CON120',
    plate_no: 'PLATE124',
    make: 'MAKE',
    series: 'SERIES001',
    unit_type: '',
    daily_rate: 0,
    status: 'vacant',
  },
];

export default function UnitStatusPage() {
  const { user } = useAuth();

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UnitStatus>('all');
  const [unitTypeFilter, setUnitTypeFilter] = useState('all');
  const [unitTypes, setUnitTypes] = useState<{ value: string; label: string }[]>([]);
  const [showingPlaceholder, setShowingPlaceholder] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<VehicleFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchUnits = async () => {
    if (!user?.branch) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branch: user.branch });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (unitTypeFilter !== 'all') params.set('unit_type', unitTypeFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiFetch(`/carrent/units/?${params.toString()}`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setUnits(Array.isArray(data?.units) ? data.units : []);
      setShowingPlaceholder(false);
    } catch (err) {
      console.error('Error fetching units:', err);
      // Endpoint isn't wired up yet — fall back to a placeholder card
      // instead of an error banner so the page still looks intentional.
      setUnits(PLACEHOLDER_UNITS);
      setShowingPlaceholder(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch, statusFilter, unitTypeFilter]);

  // Debounced search — refetch 350ms after typing stops.
  useEffect(() => {
    const t = setTimeout(fetchUnits, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    apiFetch('/carrent/unit-types/')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.unit_types)) setUnitTypes(data.unit_types);
      })
      .catch((err) => console.error('Error fetching unit types:', err));
  }, []);

  const counts = useMemo(() => {
    const base = { vacant: 0, in_use: 0, out_of_order: 0 };
    units.forEach((u) => {
      if (u.status in base) base[u.status] += 1;
    });
    return base;
  }, [units]);

  const handleFormChange = (field: keyof VehicleFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveVehicle = async () => {
    setSaveError(null);

    if (!form.conduction_no.trim() || !form.plate_no.trim() || !form.make.trim() || !form.unit_type || !form.daily_rate) {
      setSaveError('Please fill in all required fields.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/carrent/units/', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          daily_rate: parseFloat(form.daily_rate) || 0,
          branch: user?.branch,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || body?.detail || 'Failed to save vehicle.');
      }

      setModalOpen(false);
      setForm(emptyForm);
      fetchUnits();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save vehicle.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
          Unit Status
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Vehicles currently registered under your fleet.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">
        {/* Filter sidebar */}
        <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700 lg:sticky lg:top-4">
          <CardContent className="p-4 space-y-4">
            <div>
              <Label htmlFor="unit_search" className="text-xs">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  id="unit_search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Plate, conduction no..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="unit_status_filter" className="text-xs">Unit Status</Label>
              <select
                id="unit_status_filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | UnitStatus)}
                className="w-full mt-1 h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
              >
                <option value="all">All</option>
                <option value="vacant">Vacant</option>
                <option value="in_use">In Use</option>
                <option value="out_of_order">Out of Order</option>
              </select>
            </div>

            <div>
              <Label htmlFor="unit_type_filter" className="text-xs">Unit Type</Label>
              <select
                id="unit_type_filter"
                value={unitTypeFilter}
                onChange={(e) => setUnitTypeFilter(e.target.value)}
                className="w-full mt-1 h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
              >
                <option value="all">All</option>
                {unitTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Add Vehicle / Refresh — stacked in the sidebar, matching
                the desktop app's FILTER panel layout. */}
            <div className="space-y-2 pt-1">
              <Button
                size="sm"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => {
                  setForm(emptyForm);
                  setSaveError(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Vehicle
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={fetchUnits}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Total unit status
              </p>
              <div className="space-y-1.5">
                {(Object.keys(STATUS_META) as UnitStatus[]).map((s) => (
                  <div key={s} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <span className={`w-2 h-2 rounded-full ${STATUS_META[s].dot}`} />
                      {STATUS_META[s].label}
                    </div>
                    <span className="font-heading tabular-nums font-semibold text-slate-900 dark:text-white">
                      {counts[s]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle grid */}
        <div>
          {showingPlaceholder && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs px-3 py-2">
              Showing placeholder data — the vehicle list endpoint isn&apos;t connected yet.
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : units.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 gap-2">
              <Car className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No vehicles match these filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {units.map((unit) => {
                const meta = STATUS_META[unit.status] ?? STATUS_META.vacant;
                return (
                  <Card
                    key={unit.id}
                    className={`border transition-shadow hover:shadow-md cursor-pointer ${meta.card}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-white/60 dark:bg-black/20 flex items-center justify-center shrink-0">
                          <CarTaxiFront className="w-5 h-5" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                            {meta.label}
                          </span>
                        </div>
                      </div>
                      <p className="font-heading text-sm font-bold truncate">
                        {unit.conduction_no}
                      </p>
                      <p className="text-xs opacity-80 truncate">{unit.plate_no}</p>
                      <p className="text-[11px] opacity-70 truncate mt-1">
                        {unit.make}{unit.series ? ` ${unit.series}` : ''}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Vehicle modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-lg dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Vehicle</p>
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                  Add Vehicle
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
                <Field label="Conduction No." required>
                  <Input value={form.conduction_no} onChange={(e) => handleFormChange('conduction_no', e.target.value)} />
                </Field>
                <Field label="Plate No." required>
                  <Input value={form.plate_no} onChange={(e) => handleFormChange('plate_no', e.target.value)} />
                </Field>
                <Field label="CR No.">
                  <Input value={form.cr_no} onChange={(e) => handleFormChange('cr_no', e.target.value)} />
                </Field>
                <Field label="Engine No.">
                  <Input value={form.engine_no} onChange={(e) => handleFormChange('engine_no', e.target.value)} />
                </Field>
                <Field label="Make" required>
                  <Input value={form.make} onChange={(e) => handleFormChange('make', e.target.value)} />
                </Field>
                <Field label="Series">
                  <Input value={form.series} onChange={(e) => handleFormChange('series', e.target.value)} />
                </Field>
                <Field label="Color">
                  <Input value={form.color} onChange={(e) => handleFormChange('color', e.target.value)} />
                </Field>
                <Field label="Year Model">
                  <Input value={form.year_model} onChange={(e) => handleFormChange('year_model', e.target.value)} />
                </Field>
                <Field label="Unit Type" required>
                  <select
                    value={form.unit_type}
                    onChange={(e) => handleFormChange('unit_type', e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                  >
                    <option value="">Select...</option>
                    {unitTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Daily Rate" required>
                  <Input
                    type="number"
                    value={form.daily_rate}
                    onChange={(e) => handleFormChange('daily_rate', e.target.value)}
                  />
                </Field>
              </div>
            </CardContent>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleSaveVehicle}
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
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}