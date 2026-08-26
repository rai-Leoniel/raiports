'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Search, X, Loader2, Pencil, Trash2, Users } from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------
// ⚠️ ENDPOINT ASSUMPTIONS — not confirmed against your Django backend.
// Swap these for the real routes/field names once you have them:
//
//   GET    /carrent/renters/?branch=<code>&search=<q>   -> { renters: Renter[] }
//   POST   /carrent/renters/                            -> create
//   PUT    /carrent/renters/<id>/                        -> update
//   DELETE /carrent/renters/<id>/                        -> delete
// ---------------------------------------------------------------------

type Renter = {
  id: string | number;
  last_name: string;
  first_name: string;
  address?: string;
  contact_no: string;
  email?: string;
  birthdate?: string;
  license_no: string;
  license_type?: string;
  restriction_code?: string;
  license_expiry?: string;
};

type RenterFormState = {
  last_name: string;
  first_name: string;
  address: string;
  contact_no: string;
  email: string;
  birthdate: string;
  license_no: string;
  license_type: string;
  restriction_code: string;
  license_expiry: string;
};

const emptyForm: RenterFormState = {
  last_name: '',
  first_name: '',
  address: '',
  contact_no: '',
  email: '',
  birthdate: '',
  license_no: '',
  license_type: '',
  restriction_code: '',
  license_expiry: '',
};

const LICENSE_TYPES = ['Non-Professional', 'Professional', 'Student Permit'];

function toForm(r: Renter): RenterFormState {
  return {
    last_name: r.last_name ?? '',
    first_name: r.first_name ?? '',
    address: r.address ?? '',
    contact_no: r.contact_no ?? '',
    email: r.email ?? '',
    birthdate: r.birthdate ?? '',
    license_no: r.license_no ?? '',
    license_type: r.license_type ?? '',
    restriction_code: r.restriction_code ?? '',
    license_expiry: r.license_expiry ?? '',
  };
}

// Shown whenever /carrent/renters/ isn't reachable yet (404, network
// error, etc.) so the page still demonstrates the intended look instead
// of an empty table. Remove this once the real endpoint is wired up.
const PLACEHOLDER_RENTERS: Renter[] = [
  {
    id: 'placeholder-1',
    last_name: 'Dela Cruz',
    first_name: 'Juan',
    address: 'Sample Address, Butuan City',
    contact_no: '0917-000-0000',
    email: '',
    birthdate: '',
    license_no: 'N01-00-000000',
    license_type: 'Non-Professional',
    restriction_code: '',
    license_expiry: '',
  },
];

export default function RentersPage() {
  const { user } = useAuth();

  const [renters, setRenters] = useState<Renter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [form, setForm] = useState<RenterFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [showingPlaceholder, setShowingPlaceholder] = useState(false);

  const fetchRenters = async () => {
    if (!user?.branch) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branch: user.branch });
      if (search.trim()) params.set('search', search.trim());

      const res = await apiFetch(`/carrent/renters/?${params.toString()}`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setRenters(Array.isArray(data?.renters) ? data.renters : []);
      setShowingPlaceholder(false);
    } catch (err) {
      console.error('Error fetching renters:', err);
      // Endpoint isn't wired up yet — fall back to a placeholder row
      // instead of an error banner so the page still looks intentional.
      setRenters(PLACEHOLDER_RENTERS);
      setShowingPlaceholder(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRenters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch]);

  useEffect(() => {
    const t = setTimeout(fetchRenters, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selectedRenter = renters.find((r) => r.id === selectedId) ?? null;

  const openAdd = () => {
    setModalMode('add');
    setForm(emptyForm);
    setSaveError(null);
    setModalOpen(true);
  };

  const openEdit = () => {
    if (!selectedRenter) return;
    setModalMode('edit');
    setForm(toForm(selectedRenter));
    setSaveError(null);
    setModalOpen(true);
  };

  const handleFormChange = (field: keyof RenterFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaveError(null);

    if (!form.last_name.trim() || !form.first_name.trim() || !form.contact_no.trim() || !form.license_no.trim()) {
      setSaveError('Please fill in all required fields.');
      return;
    }

    setSaving(true);
    try {
      const endpoint =
        modalMode === 'add'
          ? '/carrent/renters/'
          : `/carrent/renters/${selectedRenter?.id}/`;
      const method = modalMode === 'add' ? 'POST' : 'PUT';

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify({ ...form, branch: user?.branch }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || body?.detail || 'Failed to save renter.');
      }

      setModalOpen(false);
      setForm(emptyForm);
      fetchRenters();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save renter.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRenter) return;
    if (!confirm(`Delete ${selectedRenter.first_name} ${selectedRenter.last_name}? This can't be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await apiFetch(`/carrent/renters/${selectedRenter.id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete renter.');
      setSelectedId(null);
      fetchRenters();
    } catch (err) {
      console.error('Error deleting renter:', err);
      setError('Could not delete this renter. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
          Renters
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          People registered to rent vehicles from your branch.
        </p>
      </div>

      <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          {/* Toolbar — Add / Edit / Delete on the left, Search on the
              right, matching the desktop app's RENTERS panel layout. */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={openAdd}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={openEdit}
                disabled={!selectedRenter}
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={handleDelete}
                disabled={!selectedRenter || deleting}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> {deleting ? 'Deleting...' : 'Delete'}
              </Button>
              <Button size="sm" variant="outline" onClick={fetchRenters} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search:"
                className="pl-9 h-9"
              />
            </div>
          </div>

          {showingPlaceholder && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs px-3 py-2">
              Showing placeholder data — the renters endpoint isn&apos;t connected yet.
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
                  <th className="px-4 py-2.5 font-medium">ID</th>
                  <th className="px-4 py-2.5 font-medium">Last Name</th>
                  <th className="px-4 py-2.5 font-medium">First Name</th>
                  <th className="px-4 py-2.5 font-medium">Contact No.</th>
                  <th className="px-4 py-2.5 font-medium">License No.</th>
                  <th className="px-4 py-2.5 font-medium">License Expiry</th>
                  <th className="px-4 py-2.5 font-medium">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                    </td>
                  </tr>
                ) : renters.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Users className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No renters {search ? `match "${search}"` : 'yet'}.
                      </p>
                    </td>
                  </tr>
                ) : (
                  renters.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === r.id
                          ? 'bg-orange-50 dark:bg-orange-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 font-mono text-xs">{r.id}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{r.last_name}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.first_name}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.contact_no}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.license_no}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.license_expiry ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                        {r.address ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Renter modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-lg dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Renter</p>
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                  {modalMode === 'add' ? 'Add Renter' : 'Edit Renter'}
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
                <Field label="Last Name" required>
                  <Input value={form.last_name} onChange={(e) => handleFormChange('last_name', e.target.value)} />
                </Field>
                <Field label="First Name" required>
                  <Input value={form.first_name} onChange={(e) => handleFormChange('first_name', e.target.value)} />
                </Field>
                <Field label="Address" full>
                  <Input value={form.address} onChange={(e) => handleFormChange('address', e.target.value)} />
                </Field>
                <Field label="Contact No." required>
                  <Input value={form.contact_no} onChange={(e) => handleFormChange('contact_no', e.target.value)} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(e) => handleFormChange('email', e.target.value)} />
                </Field>
                <Field label="Birthdate">
                  <Input type="date" value={form.birthdate} onChange={(e) => handleFormChange('birthdate', e.target.value)} />
                </Field>
                <Field label="License No." required>
                  <Input value={form.license_no} onChange={(e) => handleFormChange('license_no', e.target.value)} />
                </Field>
                <Field label="License Type">
                  <select
                    value={form.license_type}
                    onChange={(e) => handleFormChange('license_type', e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2"
                  >
                    <option value="">Select...</option>
                    {LICENSE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Restriction Code">
                  <Input value={form.restriction_code} onChange={(e) => handleFormChange('restriction_code', e.target.value)} />
                </Field>
                <Field label="License Expiry">
                  <Input type="date" value={form.license_expiry} onChange={(e) => handleFormChange('license_expiry', e.target.value)} />
                </Field>
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