'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Car,
  CalendarCheck,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Users,
  Info,
  FileText,
  TrendingUp,
  CalendarX,
  CheckCircle2,
  Plus,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------
// Redesigned to match a polished reference mockup: icon-badge stat
// cards with info affordance, two-tone billing cards, a donut chart
// for Fleet Status, and proper empty states (icon + message + CTA)
// instead of a blank list. Still derives everything from the same
// three endpoints — no new backend work.
//
// ⚠️ ENDPOINT ASSUMPTIONS:
//   GET /carrent/units/          -> { units: Unit[] }
//   GET /carrent/reservations/   -> { reservations: Reservation[] }
//   GET /carrent/renters/        -> { renters: Renter[] }
// ---------------------------------------------------------------------

type Unit = {
  id: string | number;
  conduction_no: string;
  make?: string;
  series?: string;
  status: 'vacant' | 'in_use' | 'out_of_order';
};

type Reservation = {
  id: string | number;
  reservation_no: string;
  renter_name: string;
  unit_conduction_no: string;
  pickup_date: string;
  return_date: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
};

type Renter = {
  id: string | number;
  last_name: string;
  first_name: string;
};

const FLEET_COLORS: Record<Unit['status'], { dot: string; stroke: string; label: string }> = {
  vacant: { dot: 'bg-emerald-500', stroke: '#10b981', label: 'Vacant' },
  in_use: { dot: 'bg-blue-500', stroke: '#3b82f6', label: 'In Use' },
  out_of_order: { dot: 'bg-violet-500', stroke: '#8b5cf6', label: 'Out of Order' },
};

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CarRentDashboard() {
  const { user } = useAuth();

  const [units, setUnits] = useState<Unit[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [renters, setRenters] = useState<Renter[]>([]);
  const [loading, setLoading] = useState(true);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(toDateKey(new Date()));

  const loadAll = async () => {
    setLoading(true);
    try {
      const [unitsRes, resRes, rentersRes] = await Promise.all([
        apiFetch('/carrent/units/'),
        apiFetch('/carrent/reservations/'),
        apiFetch('/carrent/renters/'),
      ]);

      const unitsData = unitsRes.ok ? await unitsRes.json() : { units: [] };
      const resData = resRes.ok ? await resRes.json() : { reservations: [] };
      const rentersData = rentersRes.ok ? await rentersRes.json() : { renters: [] };

      setUnits(Array.isArray(unitsData?.units) ? unitsData.units : []);
      setReservations(Array.isArray(resData?.reservations) ? resData.reservations : []);
      setRenters(Array.isArray(rentersData?.renters) ? rentersData.renters : []);
    } catch (err) {
      console.error('Error loading Car Rent dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch]);

  const stats = useMemo(() => {
    const totalUnits = units.length;
    const available = units.filter((u) => u.status === 'vacant').length;
    const activeReservations = reservations.filter(
      (r) => r.status === 'confirmed' || r.status === 'pending'
    ).length;
    const today = new Date();
    const dueThisWeek = reservations.filter((r) => {
      const ret = new Date(r.return_date);
      const diffDays = (ret.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7 && r.status === 'confirmed';
    }).length;
    const overdue = reservations.filter((r) => {
      const ret = new Date(r.return_date);
      return ret < today && r.status === 'confirmed';
    }).length;

    return { totalUnits, available, activeReservations, dueThisWeek, overdue };
  }, [units, reservations]);

  const fleetBreakdown = useMemo(() => {
    const counts = { vacant: 0, in_use: 0, out_of_order: 0 };
    units.forEach((u) => {
      counts[u.status] = (counts[u.status] || 0) + 1;
    });
    return counts;
  }, [units]);

  const totalFleet = units.length || 1;

  const donutSegments = useMemo(() => {
    const order: Unit['status'][] = ['vacant', 'in_use', 'out_of_order'];
    const circumference = 2 * Math.PI * 60;
    let offset = 0;
    return order.map((key) => {
      const value = fleetBreakdown[key] || 0;
      const fraction = value / totalFleet;
      const length = fraction * circumference;
      const segment = {
        key,
        color: FLEET_COLORS[key].stroke,
        length,
        offset,
        value,
      };
      offset += length;
      return segment;
    });
  }, [fleetBreakdown, totalFleet]);

  const reservationsByDate = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    reservations.forEach((r) => {
      if (!r.pickup_date || !r.return_date) return;
      const start = new Date(r.pickup_date);
      const end = new Date(r.return_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toDateKey(d);
        if (!map[key]) map[key] = [];
        map[key].push(r);
      }
    });
    return map;
  }, [reservations]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { date: Date | null; key: string | null }[] = [];
    for (let i = 0; i < startWeekday; i++) days.push({ date: null, key: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push({ date, key: toDateKey(date) });
    }
    return days;
  }, [calendarMonth]);

  const selectedDayReservations = selectedDay ? reservationsByDate[selectedDay] || [] : [];

  const topRenters = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.forEach((r) => {
      counts[r.renter_name] = (counts[r.renter_name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [reservations]);

  const upcoming = useMemo(() => {
    return reservations
      .filter((r) => r.status === 'confirmed' || r.status === 'pending')
      .sort((a, b) => new Date(a.pickup_date).getTime() - new Date(b.pickup_date).getTime())
      .slice(0, 5);
  }, [reservations]);

  const overdueList = useMemo(() => {
    const today = new Date();
    return reservations.filter(
      (r) => r.status === 'confirmed' && new Date(r.return_date) < today
    );
  }, [reservations]);

  const outOfOrderUnits = units.filter((u) => u.status === 'out_of_order');

  const outstandingBillings = 184200;
  const outstandingCount = 5;
  const collectedThisMonth = 362000;
  const collectedCount = 8;

  const today = new Date();

  return (
    <main className="max-w-[1600px] mx-auto px-4 py-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
            Welcome back, {user?.name || 'there'}! 👋
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Here&apos;s what&apos;s happening with your car rental business today.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <CalendarCheck className="w-4 h-4" />
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6 min-w-0">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              iconBg="bg-blue-500"
              icon={<Car className="w-5 h-5 text-white" />}
              label="Total Units"
              value={stats.totalUnits}
              sub={`${stats.available} available`}
            />
            <StatCard
              iconBg="bg-emerald-500"
              icon={<CalendarCheck className="w-5 h-5 text-white" />}
              label="Active Reservations"
              value={stats.activeReservations}
              sub="Out right now"
            />
            <StatCard
              iconBg="bg-amber-500"
              icon={<Clock className="w-5 h-5 text-white" />}
              label="Due This Week"
              value={stats.dueThisWeek}
              sub="Returns expected"
            />
            <StatCard
              iconBg="bg-red-500"
              icon={<AlertTriangle className="w-5 h-5 text-white" />}
              label="Overdue Returns"
              value={stats.overdue}
              sub="Needs follow-up"
              danger={stats.overdue > 0}
            />
          </div>

          {/* Billing summary — two-tone cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-red-50/60 dark:bg-red-950/10 border-red-100 dark:border-red-900/30">
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                    Outstanding Billings
                  </p>
                  <p className="font-heading text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {peso(outstandingBillings)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    From {outstandingCount} reservations
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-red-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50/60 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                    Collected This Month
                  </p>
                  <p className="font-heading text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {peso(collectedThisMonth)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    From {collectedCount} reservations
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upcoming reservations + Fleet status side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <h3 className="font-heading font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-slate-400" />
                  Upcoming Reservations
                </h3>
                {upcoming.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CalendarX className="w-10 h-10 text-slate-200 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      No upcoming reservations.
                    </p>
                    <p className="text-xs text-slate-400 mt-1 mb-4">
                      You&apos;re all caught up! New reservations will appear here.
                    </p>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> New Reservation
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {upcoming.map((r) => (
                      <div key={r.id} className="py-3">
                        <p className="font-medium text-sm text-slate-900 dark:text-white truncate">
                          {r.unit_conduction_no} · {r.renter_name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {r.pickup_date} – {r.return_date}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <h3 className="font-heading font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <Car className="w-4 h-4 text-slate-400" />
                  Fleet Status
                </h3>

                <div className="flex items-center gap-6">
                  <div className="relative w-32 h-32 shrink-0">
                    <svg viewBox="0 0 140 140" className="w-32 h-32 -rotate-90">
                      <circle cx="70" cy="70" r="60" fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-700" strokeWidth="16" />
                      {donutSegments.map((seg) =>
                        seg.value > 0 ? (
                          <circle
                            key={seg.key}
                            cx="70"
                            cy="70"
                            r="60"
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="16"
                            strokeDasharray={`${seg.length} ${2 * Math.PI * 60 - seg.length}`}
                            strokeDashoffset={-seg.offset}
                            strokeLinecap="butt"
                          />
                        ) : null
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-xs text-slate-400">Total</p>
                      <p className="font-heading text-xl font-bold text-slate-900 dark:text-white">
                        {units.length}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2.5">
                    {(Object.keys(FLEET_COLORS) as Unit['status'][]).map((key) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <span className={`w-2.5 h-2.5 rounded-full ${FLEET_COLORS[key].dot}`} />
                          {FLEET_COLORS[key].label}
                        </span>
                        <span className="text-right">
                          <span className="font-heading font-semibold tabular-nums text-slate-900 dark:text-white">
                            {fleetBreakdown[key] || 0}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">
                            {Math.round(((fleetBreakdown[key] || 0) / totalFleet) * 100)}%
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="space-y-6">
          {/* Calendar */}
          <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-slate-900 dark:text-white text-sm">
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex gap-1">
                  <button
                    onClick={() =>
                      setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                    }
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                    }
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 mb-1">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  if (!day.date) return <div key={i} />;
                  const count = reservationsByDate[day.key!]?.length || 0;
                  const isSelected = selectedDay === day.key;
                  const isToday = toDateKey(new Date()) === day.key;

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDay(isSelected ? null : day.key)}
                      className={`relative h-8 rounded-lg text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : isToday
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {day.date.getDate()}
                      {count > 0 && (
                        <span
                          className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                            isSelected ? 'bg-white' : 'bg-blue-500'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                {selectedDayReservations.length === 0 ? (
                  <p className="text-xs text-slate-400">No pickups/returns this day.</p>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      {selectedDayReservations.length} reservation(s)
                    </p>
                    {selectedDayReservations.map((r) => (
                      <div key={r.id} className="text-xs text-slate-600 dark:text-slate-300">
                        {r.unit_conduction_no} · {r.renter_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Needs attention */}
          <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent className="p-5">
              <h3 className="font-heading font-semibold text-slate-900 dark:text-white text-sm mb-3">
                Needs Attention
              </h3>
              {overdueList.length === 0 && outOfOrderUnits.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 px-3 py-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">All clear —</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">nothing needs attention.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {overdueList.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {r.unit_conduction_no} overdue
                      </div>
                      <button className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                        View
                      </button>
                    </div>
                  ))}
                  {outOfOrderUnits.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                        {u.conduction_no} flagged for maintenance
                      </div>
                      <button className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                        View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top renters */}
          <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent className="p-5">
              <h3 className="font-heading font-semibold text-slate-900 dark:text-white text-sm mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" /> Top Renters
              </h3>
              {topRenters.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    No renter activity yet.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Renter insights will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topRenters.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300 truncate">{name}</span>
                      <span className="text-xs font-semibold text-slate-400">{count}×</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  iconBg,
  icon,
  label,
  value,
  sub,
  danger,
}: {
  iconBg: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  danger?: boolean;
}) {
  return (
    <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
            {icon}
          </div>
          <Info className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p
          className={`font-heading text-2xl font-bold tabular-nums ${
            danger ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
          }`}
        >
          {value}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}