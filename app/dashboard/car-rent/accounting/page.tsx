"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  X,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";

/* ----------------------------- Types ----------------------------- */

type EntryType = "income" | "expense";

const CATEGORIES: Record<EntryType, string[]> = {
  income: ["Rental Revenue", "Late Fees", "Damage Charges", "Other Income"],
  expense: [
    "Fuel",
    "Maintenance & Repairs",
    "Insurance",
    "Salaries",
    "Utilities",
    "Registration & Permits",
    "Other Expense",
  ],
};

interface LedgerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  refNo: string;
  type: EntryType;
  category: string;
  description: string;
  amount: number;
  vehicle?: string;
}

/* --------------------------- Placeholder --------------------------- */

const PLACEHOLDER_ENTRIES: LedgerEntry[] = [
  {
    id: "l1",
    date: "2026-08-25",
    refNo: "BILL-0001",
    type: "income",
    category: "Rental Revenue",
    description: "Payment received — Juan Dela Cruz (CON120)",
    amount: 2800,
    vehicle: "CON120",
  },
  {
    id: "l2",
    date: "2026-08-24",
    refNo: "EXP-0014",
    type: "expense",
    category: "Fuel",
    description: "Full tank refill before checkout",
    amount: 1200,
    vehicle: "CON120",
  },
  {
    id: "l3",
    date: "2026-08-22",
    refNo: "EXP-0013",
    type: "expense",
    category: "Maintenance & Repairs",
    description: "Oil change and brake inspection",
    amount: 2500,
    vehicle: "VAN045",
  },
  {
    id: "l4",
    date: "2026-08-21",
    refNo: "OR-1003",
    type: "income",
    category: "Rental Revenue",
    description: "GCash payment — Maria Santos (VAN045)",
    amount: 6000,
    vehicle: "VAN045",
  },
  {
    id: "l5",
    date: "2026-08-15",
    refNo: "EXP-0010",
    type: "expense",
    category: "Insurance",
    description: "Monthly fleet insurance premium",
    amount: 4800,
  },
];

const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CATEGORY_STYLES: Record<EntryType, string> = {
  income: "bg-emerald-50 text-emerald-600 border border-emerald-200",
  expense: "bg-rose-50 text-rose-600 border border-rose-200",
};

/* ------------------------------ Page ------------------------------ */

export default function AccountingPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [usingPlaceholder, setUsingPlaceholder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | EntryType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [viewEntry, setViewEntry] = useState<LedgerEntry | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/carrent/accounting/");
      if (!res.ok) throw new Error("Endpoint not reachable");
      const data = await res.json();
      setEntries(data);
      setUsingPlaceholder(false);
    } catch {
      setEntries(PLACEHOLDER_ENTRIES);
      setUsingPlaceholder(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const matchesType = typeFilter === "all" || e.type === typeFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        e.refNo.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.vehicle ?? "").toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [entries, search, typeFilter]);

  const summary = useMemo(() => {
    const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const expense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
    return { income, expense, net: income - expense };
  }, [entries]);

  function openAdd() {
    setModalMode("add");
    setViewEntry(null);
    setModalOpen(true);
  }

  function openEdit() {
    const e = entries.find((x) => x.id === selectedId);
    if (!e) return;
    setModalMode("edit");
    setViewEntry(e);
    setModalOpen(true);
  }

  async function handleDelete() {
    const e = entries.find((x) => x.id === selectedId);
    if (!e) return;
    if (!confirm(`Delete entry ${e.refNo}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/carrent/accounting/${e.id}/`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((x) => x.id !== e.id));
      setSelectedId(null);
    } catch {
      setError(`Couldn't delete ${e.refNo}. The accounting endpoint may not be connected yet.`);
    }
  }

  function handleSave(saved: LedgerEntry) {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      return exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev];
    });
    setModalOpen(false);
    setSelectedId(null);
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Accounting</h1>
        <p className="text-slate-500 mt-1">
          Income and expense ledger for your branch.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2.5">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Total Income</div>
            <div className="text-lg font-bold text-slate-900">{peso(summary.income)}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="rounded-lg bg-rose-50 p-2.5">
            <TrendingDown className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Total Expense</div>
            <div className="text-lg font-bold text-slate-900">{peso(summary.expense)}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="rounded-lg bg-orange-50 p-2.5">
            <Wallet className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Net</div>
            <div
              className={`text-lg font-bold ${
                summary.net >= 0 ? "text-slate-900" : "text-rose-500"
              }`}
            >
              {peso(summary.net)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-3.5 py-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>
            <button
              onClick={openEdit}
              disabled={!selectedId}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium px-3.5 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={!selectedId}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 text-rose-500 text-sm font-medium px-3.5 py-2 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium px-3.5 py-2 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="rounded-lg border border-slate-200 text-slate-600 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              <option value="all">All entries</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entries..."
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
        </div>

        {usingPlaceholder && (
          <div className="mx-4 mt-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3.5 py-2.5">
            Showing placeholder data — the accounting endpoint isn't connected yet.
          </div>
        )}
        {error && (
          <div className="mx-4 mt-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-sm px-3.5 py-2.5">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Ref No.</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No entries match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((e) => {
                const selected = selectedId === e.id;
                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedId(selected ? null : e.id)}
                    className={`border-b border-slate-50 cursor-pointer transition-colors ${
                      selected ? "bg-orange-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="radio"
                        checked={selected}
                        onChange={() => setSelectedId(e.id)}
                        className="accent-orange-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{e.date}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{e.refNo}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${CATEGORY_STYLES[e.type]}`}
                      >
                        {e.type === "income" ? "Income" : "Expense"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.category}</td>
                    <td className="px-4 py-3 text-slate-700">{e.description}</td>
                    <td className="px-4 py-3 text-slate-500">{e.vehicle ?? "—"}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        e.type === "income" ? "text-emerald-600" : "text-rose-500"
                      }`}
                    >
                      {e.type === "income" ? "+ " : "- "}
                      {peso(e.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <EntryModal
          mode={modalMode}
          entry={viewEntry}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */

function EntryModal({
  mode,
  entry,
  onClose,
  onSave,
}: {
  mode: "add" | "edit";
  entry: LedgerEntry | null;
  onClose: () => void;
  onSave: (e: LedgerEntry) => void;
}) {
  const [type, setType] = useState<EntryType>(entry?.type ?? "expense");
  const [date, setDate] = useState(entry?.date ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(entry?.category ?? CATEGORIES.expense[0]);
  const [description, setDescription] = useState(entry?.description ?? "");
  const [amount, setAmount] = useState(entry?.amount ?? 0);
  const [vehicle, setVehicle] = useState(entry?.vehicle ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Reset category to a valid option when switching type
    if (!CATEGORIES[type].includes(category)) {
      setCategory(CATEGORIES[type][0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload: LedgerEntry = {
      id: entry?.id ?? crypto.randomUUID(),
      date,
      refNo:
        entry?.refNo ??
        `${type === "income" ? "INC" : "EXP"}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      type,
      category,
      description,
      amount,
      vehicle: vehicle || undefined,
    };

    try {
      const res = await fetch(
        mode === "add" ? "/carrent/accounting/" : `/carrent/accounting/${payload.id}/`,
        {
          method: mode === "add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error();
      const saved = await res.json();
      onSave(saved);
    } catch {
      onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">
            {mode === "add" ? "Add Ledger Entry" : "Edit Ledger Entry"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setType("income")}
              className={`flex-1 py-2 font-medium transition-colors ${
                type === "income"
                  ? "bg-emerald-500 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Income
            </button>
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`flex-1 py-2 font-medium transition-colors ${
                type === "expense"
                  ? "bg-rose-500 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Expense
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              {CATEGORIES[type].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Description
            </label>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Oil change and brake inspection"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Vehicle (optional)
              </label>
              <input
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="e.g. CON120"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Saving..." : mode === "add" ? "Save Entry" : "Update Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}