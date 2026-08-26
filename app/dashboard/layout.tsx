'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import {
  ChartBar as BarChart3,
  Sun,
  Moon,
  Bell,
  BellOff,
  LogOut,
  House,
  History,
  Menu,
  X,
  RefreshCw,
  Star,
  Clock,
  Eye,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Car,
  ChevronDown,
} from 'lucide-react';

import { AuthGuard } from '@/components/auth-guard';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { getApiUrl } from '@/lib/api-config';

// NEW: `seanagroOnly` marks nav items that should be hidden for the
// easyeats tenant. Sales and Car Rent are Sean Agro-specific modules —
// every other tenant (including the default/no-tenant case) still sees
// them, only 'easyeats' is excluded. See visibleNavItems below, where this
// is applied.
//
// NEW: `moduleCode` maps each nav item to the module_code stored in the
// user_module_access table (via user.modules, populated by auth-context.tsx
// straight from the login response). Used by visibleNavItems below to hide
// items the logged-in user doesn't have access to.
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: House, moduleCode: 'dashboard' },
  { href: '/dashboard/history', label: 'History', icon: History, moduleCode: 'history' },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3, moduleCode: 'reports' },
  { href: '/dashboard/sales', label: 'Sales', icon: TrendingUp, seanagroOnly: true, moduleCode: 'sales' },
  {
    href: '/dashboard/car-rent',
    label: 'Car Rent',
    icon: Car,
    seanagroOnly: true,
    moduleCode: 'car_rent',
    // NEW: sub-navigation mirroring the desktop Car Rental Management
    // System's sidebar (Unit Status, Renters, Reservation, Registration,
    // Unit Billing, SOA, Accounting, FS by Units). Each maps to its own
    // route under /dashboard/car-rent/*.
    children: [
      { href: '/dashboard/car-rent/unit-status', label: 'Unit Status' },
      { href: '/dashboard/car-rent/renters', label: 'Renters Profile' },
      { href: '/dashboard/car-rent/reservation', label: 'Reservation' },
      { href: '/dashboard/car-rent/registration', label: 'Registration' },
      { href: '/dashboard/car-rent/unit-billing', label: 'Unit Billing' },
      { href: '/dashboard/car-rent/soa', label: 'SOA' },
      { href: '/dashboard/car-rent/unitsledger', label: 'Units Ledger' },
    ],
  },
];

// NEW: modules that are always shown regardless of user.modules — these
// are considered "core" navigation every logged-in user should see.
const CORE_MODULES = new Set(['dashboard', 'history']);

const NOTIF_CATEGORIES: { label: string; key: string }[] = [
  { label: 'Petty Cash Voucher', key: 'petty_cash' },
  { label: 'Disbursement Voucher', key: 'disbursement_voucher' },
  { label: 'Purchase Order', key: 'purchase_order' },
  { label: 'Direct Purchase', key: 'direct_purchase' },
  { label: 'Stock Transfer', key: 'stock_transfer' },
  { label: 'Stock Adjustment', key: 'stock_adjustment' },
  { label: 'Loan Approval', key: 'loan_approval' },
  { label: 'Stock Issuance', key: 'stock_issuance' },
];

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'pending' | 'approved' | 'declined';
  categoryLabel: string;
};

// NEW: shape of a single "recently opened" entry, persisted to localStorage.
type RecentPage = { href: string; label: string; time: string };

const API_URL = getApiUrl();
const ACCESS_TOKEN_KEY = 'raiports-access-token';
const READ_NOTIFICATION_KEY = 'raiports-read-notification-ids';
const COMPANY_NAME_CACHE_KEY = 'raiports-company-name-cache';
// NEW: storage key + cap for the Recently opened / Last viewed shortcuts.
const RECENT_PAGES_KEY = 'raiports-recently-opened';
const MAX_RECENT_PAGES = 8;

function normalizeDecisionStatus(status?: string) {
  return (status || '').trim().toLowerCase();
}

function formatTimeAgo(dateString?: string) {
  if (!dateString) return 'Just now';

  const value = new Date(dateString);
  if (isNaN(value.getTime())) return 'Just now';

  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return value.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// NEW: turns a raw pathname like "/dashboard/car-rent" into "Car Rent" when
// it doesn't match one of the labeled navItems (e.g. a deep link such as
// "/dashboard/disbursement-voucher/new").
function prettifyPathSegment(pathname: string) {
  const last = pathname.split('/').filter(Boolean).pop() || 'dashboard';
  return last
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DashboardChrome>{children}</DashboardChrome>
    </AuthGuard>
  );
}

function DashboardChrome({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // NEW: tracks whether the Car Rent sidebar item's submenu is expanded.
  const [carRentMenuOpen, setCarRentMenuOpen] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const notifPanelRef = useRef<HTMLDivElement>(null);

  // NEW: Recently opened / Last viewed state — persisted to localStorage,
  // updated on every route change (see effect below).
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const recentPanelRef = useRef<HTMLDivElement>(null);

  const [companyName, setCompanyName] = useState<string>('');

  const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
  const tenantLogoSrc =
    tenant === 'easyeats'
      ? '/logo-easyeats.png'
      : tenant === 'seanagro'
      ? '/logo-seanagro.jpg'
      : '/logo-icon.png';

  // NEW: an item is visible only if it passes BOTH checks:
  //  1. the existing tenant check (Sales/Car Rent hidden for easyeats)
  //  2. the module-access check — item.moduleCode must be present in
  //     user.modules, UNLESS it's a core module (dashboard/history) which
  //     is always shown.
  // If user.modules is missing/undefined (e.g. a cached session from
  // before this rollout, or the backend hasn't deployed the modules field
  // yet), we fail OPEN — show the item — so nobody gets locked out of
  // pages they used to see. Once every user has re-logged in post-deploy,
  // this can be tightened to fail closed for stricter access control.
  const visibleNavItems = navItems.filter((item) => {
    if (item.seanagroOnly && tenant === 'easyeats') return false;
    if (CORE_MODULES.has(item.moduleCode)) return true;
    if (!user?.modules) return true;
    return user.modules.includes(item.moduleCode);
  });

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  // NEW: keep the Car Rent submenu open automatically while the user is on
  // any /dashboard/car-rent/* route (e.g. after a page refresh or deep link).
  useEffect(() => {
    if (pathname?.startsWith('/dashboard/car-rent')) {
      setCarRentMenuOpen(true);
    }
  }, [pathname]);

  const confirmSignOut = async () => {
    setSignOutConfirmOpen(false);
    logout();
    router.push('/login');
  };

  const handleRefresh = async () => {
    const fn = (window as any).__refreshDashboardData;
    if (typeof fn !== 'function') return;
    setRefreshing(true);
    try {
      await fn();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(READ_NOTIFICATION_KEY);
      if (saved) setReadIds(JSON.parse(saved));
    } catch (e) {
      console.error('Failed to load read notification ids:', e);
    }
  }, []);

  // NEW: load previously saved "recently opened" history once on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_PAGES_KEY);
      if (saved) setRecentPages(JSON.parse(saved));
    } catch (e) {
      console.error('Failed to load recently opened pages:', e);
    }
  }, []);

  // NEW: record every route change into recentPages (most recent first,
  // de-duplicated by href, capped at MAX_RECENT_PAGES). Powers both the
  // "Recently opened" dropdown and the "Last viewed" shortcut below.
  useEffect(() => {
    if (!pathname) return;
    const matched = navItems.find((n) => isActive(n.href));
    const label = matched?.label || prettifyPathSegment(pathname);

    setRecentPages((prev) => {
      const withoutCurrent = prev.filter((item) => item.href !== pathname);
      const updated = [
        { href: pathname, label, time: new Date().toISOString() },
        ...withoutCurrent,
      ].slice(0, MAX_RECENT_PAGES);
      try {
        localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save recently opened pages:', e);
      }
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const branch = user?.branch;
    if (!branch) return;

    let cancelled = false;

    async function loadCompanyName(branch: string) {
      try {
        const cacheRaw = sessionStorage.getItem(COMPANY_NAME_CACHE_KEY);
        const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
        if (cache[branch]) {
          setCompanyName(cache[branch]);
          return;
        }
      } catch {
        // ignore corrupt cache, fall through to fetch
      }

      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      const tenant = localStorage.getItem('raiports-tenant');

      try {
        const res = await fetch(`${API_URL}/company/${encodeURIComponent(branch)}/`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenant ? { 'X-Tenant': tenant } : {}),
          },
        });
        const result = await res.json();
        if (cancelled) return;
        if (res.ok && result.success && result.data?.comp_name) {
          const name = result.data.comp_name as string;
          setCompanyName(name);
          try {
            const cacheRaw = sessionStorage.getItem(COMPANY_NAME_CACHE_KEY);
            const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
            cache[branch] = name;
            sessionStorage.setItem(COMPANY_NAME_CACHE_KEY, JSON.stringify(cache));
          } catch {
            // sessionStorage full/unavailable — non-fatal, just skip caching
          }
        }
      } catch (err) {
        console.error('Failed to load company name for header:', err);
      }
    }

    loadCompanyName(branch);
    return () => {
      cancelled = true;
    };
  }, [user?.branch]);

  const fetchNotifications = async () => {
    if (!user?.branch) return;
    setNotifLoading(true);

    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [pendingResults, decidedResults] = await Promise.all([
        Promise.all(
          NOTIF_CATEGORIES.map(async ({ label }) => {
            const res = await fetch(
              `${API_URL}/approval/pending/?branch=${user.branch}&transaction_type=${encodeURIComponent(
                label
              )}`,
              { headers }
            );
            if (!res.ok) return { label, items: [] as any[] };
            const data = await res.json();
            return { label, items: (data[label] || []) as any[] };
          })
        ),
        Promise.all(
          NOTIF_CATEGORIES.map(async ({ label, key }) => {
            const res = await fetch(
              `${API_URL}/approval/decision-history/?branch=${user.branch}&transaction_type=${key}`,
              { headers }
            );
            if (!res.ok) return { label, items: [] as any[] };
            const data = await res.json();
            return { label, items: (data[key] || []) as any[] };
          })
        ),
      ]);

      const list: NotificationItem[] = [];

      pendingResults.forEach(({ label, items }) => {
        items.forEach((item: any, index: number) => {
          list.push({
            id: `pending-${label}-${item.id ?? item.reference_no ?? 'no-ref'}-${
              item.requested_date ?? item.transaction_date ?? 'no-date'
            }-${index}`,
            title: 'New approval request',
            message: `New ${label} needs approval.`,
            time: item.requested_date ?? item.transaction_date ?? item.created_at ?? '',
            type: 'pending',
            categoryLabel: label,
          });
        });
      });

      decidedResults.forEach(({ label, items }) => {
        items.forEach((item: any, index: number) => {
          const normalized = normalizeDecisionStatus(item.transaction_status);
          const isApproved = normalized === 'approved';

          list.push({
            id: `decided-${label}-${item.id ?? item.reference_no ?? 'no-ref'}-${
              item.decision_date ?? item.transaction_date ?? 'no-date'
            }-${isApproved ? 'approved' : 'declined'}-${index}`,
            title: isApproved ? 'Decision approved' : 'Decision declined',
            message: isApproved ? `${label} approved.` : `${label} declined.`,
            time: item.decision_date ?? item.transaction_date ?? '',
            type: isApproved ? 'approved' : 'declined',
            categoryLabel: label,
          });
        });
      });

      list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setNotifications(list);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  // NEW: close the "Recently opened" dropdown on outside click — same
  // pattern as the notifications bell above.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (recentPanelRef.current && !recentPanelRef.current.contains(e.target as Node)) {
        setRecentOpen(false);
      }
    };
    if (recentOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [recentOpen]);

  const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length;

  const markAllRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    localStorage.setItem(READ_NOTIFICATION_KEY, JSON.stringify(allIds));
  };

  const handleNotificationClick = (item: NotificationItem) => {
    const updated = [...readIds, item.id];
    setReadIds(updated);
    localStorage.setItem(READ_NOTIFICATION_KEY, JSON.stringify(updated));
    setNotifOpen(false);

    if (item.type === 'pending') {
      router.push('/dashboard');
    } else {
      router.push('/dashboard/history');
    }
  };

  // NEW: everything in history except the page currently being viewed —
  // "Recently opened" lists all of these, "Last viewed" is just the first.
  const otherRecentPages = recentPages.filter((p) => p.href !== pathname);
  const lastViewedPage = otherRecentPages[0] ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 md:flex">
      <aside
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-200 ${
          sidebarCollapsed ? 'md:w-20' : 'md:w-64'
        }`}
      >
        <div
          className={`flex items-center gap-3 px-5 py-5 border-b border-slate-200 dark:border-slate-800 ${
            sidebarCollapsed ? 'justify-center px-2' : ''
          }`}
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
            <Image
              src={tenantLogoSrc}
              alt="RAI Reports logo"
              width={44}
              height={44}
              className="object-contain"
              priority
            />
          </div>

          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="font-heading font-bold text-base leading-tight dark:text-white truncate">
                <span className="text-slate-900 dark:text-white">RAI</span>{' '}
                <span className="text-orange-500">PORTAL</span>
              </h1>
            </div>
          )}

          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              title="Collapse sidebar"
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>

        {sidebarCollapsed && (
          <div className="flex justify-center py-2 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              title="Expand sidebar"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div className="space-y-1">
            {visibleNavItems.map(({ href, label, icon: Icon, children }) => {
              // NEW: items with `children` (currently just Car Rent) render
              // as an expandable group instead of a plain link.
              if (children && children.length > 0) {
                const parentActive = isActive(href);
                return (
                  <div key={href}>
                    <button
                      type="button"
                      title={sidebarCollapsed ? label : undefined}
                      onClick={() => {
                        if (sidebarCollapsed) {
                          setSidebarCollapsed(false);
                          setCarRentMenuOpen(true);
                          return;
                        }
                        setCarRentMenuOpen((prev) => !prev);
                      }}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        sidebarCollapsed ? 'justify-center px-0' : ''
                      } ${
                        parentActive
                          ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!sidebarCollapsed && (
                        <>
                          <span className="flex-1 text-left">{label}</span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                              carRentMenuOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </>
                      )}
                    </button>

                    {!sidebarCollapsed && carRentMenuOpen && (
                      <div className="mt-1 ml-4 pl-3 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
                        {children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                              isActive(child.href)
                                ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={href}
                  href={href}
                  title={sidebarCollapsed ? label : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    sidebarCollapsed ? 'justify-center px-0' : ''
                  } ${
                    isActive(href)
                      ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && label}
                </Link>
              );
            })}
          </div>

          {!sidebarCollapsed && (
            <div>
              <p className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                Quick actions
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 text-green-500 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh data
                </button>
              </div>
            </div>
          )}

          {!sidebarCollapsed && (
            <div>
              <p className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                Shortcuts
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <Star className="w-4 h-4 text-amber-500" />
                  Favorites
                </button>

                {/* NEW: Recently opened — dropdown of visited pages, most
                    recent first, persisted in localStorage. */}
                <div className="relative" ref={recentPanelRef}>
                  <button
                    type="button"
                    onClick={() => setRecentOpen((prev) => !prev)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <Clock className="w-4 h-4 text-slate-400" />
                    Recently opened
                  </button>

                  {recentOpen && (
                    <div className="absolute left-0 mt-1 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-20 overflow-hidden">
                      {otherRecentPages.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6 px-4">
                          Nothing else visited yet.
                        </p>
                      ) : (
                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                          {otherRecentPages.map((item) => (
                            <button
                              key={item.href}
                              type="button"
                              onClick={() => {
                                setRecentOpen(false);
                                router.push(item.href);
                              }}
                              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                            >
                              <span className="text-slate-700 dark:text-slate-300 truncate">
                                {item.label}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {formatTimeAgo(item.time)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* NEW: Last viewed — jumps straight to the page visited
                    right before the current one. Disabled if there isn't
                    one yet. */}
                <button
                  type="button"
                  onClick={() => lastViewedPage && router.push(lastViewedPage.href)}
                  disabled={!lastViewedPage}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    lastViewedPage
                      ? 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <Eye className="w-4 h-4 text-slate-400" />
                  <span className="truncate">
                    {lastViewedPage ? `Last viewed · ${lastViewedPage.label}` : 'Last viewed'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4">
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <div
              className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0"
              title={sidebarCollapsed ? user?.fullName || user?.name || 'User' : undefined}
            >
              {(user?.fullName || user?.name || 'U')
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {user?.fullName || user?.name || user?.email || 'User'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user?.department || 'Administrator'}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className={`flex-1 min-w-0 transition-all duration-200 ${sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'}`}>
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
          <div className="max-w-[1600px] mx-auto px-4 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-3 md:hidden shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </Button>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
                  <Image
                    src={tenantLogoSrc}
                    alt="RAI Reports logo"
                    width={40}
                    height={40}
                    className="object-contain"
                  />
                </div>
              </div>

              {companyName && (
                <h2
                  className="min-w-0 truncate font-heading font-bold text-lg sm:text-xl text-slate-900 dark:text-white"
                  title={companyName}
                >
                  {companyName}
                </h2>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full w-10 h-10"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>

              <div className="relative" ref={notifPanelRef}>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full w-10 h-10 relative"
                  onClick={() => setNotifOpen((prev) => !prev)}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-heading tabular-nums">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[28rem] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-20 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 shrink-0">
                      <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                        Notifications
                      </h4>
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                      >
                        Mark all read
                      </button>
                    </div>

                    <div className="overflow-y-auto flex-1">
                      {notifLoading && notifications.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8 px-4">
                          Loading notifications...
                        </p>
                      ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-10 px-4">
                          <BellOff className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            No notifications yet.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {notifications.map((item) => {
                            const isUnread = !readIds.includes(item.id);
                            const Icon =
                              item.type === 'approved'
                                ? CheckCircle2
                                : item.type === 'declined'
                                ? XCircle
                                : Bell;
                            const iconClass =
                              item.type === 'approved'
                                ? 'text-green-500'
                                : item.type === 'declined'
                                ? 'text-red-500'
                                : 'text-orange-500';

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleNotificationClick(item)}
                                className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                                  isUnread ? 'bg-orange-50/60 dark:bg-orange-950/10' : ''
                                }`}
                              >
                                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                  <Icon className={`w-4 h-4 ${iconClass}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                    {item.title}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                    {item.message}
                                  </p>
                                  <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-1">
                                    {formatTimeAgo(item.time)}
                                  </p>
                                </div>
                                {isUnread && (
                                  <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-1.5" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="rounded-full w-10 h-10"
                onClick={() => setSignOutConfirmOpen(true)}
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-2">
              {visibleNavItems.map(({ href, label, icon: Icon, children }) => {
                if (children && children.length > 0) {
                  return (
                    <div key={href}>
                      <button
                        type="button"
                        onClick={() => setCarRentMenuOpen((prev) => !prev)}
                        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                          isActive(href)
                            ? 'bg-orange-50 text-orange-500 dark:bg-orange-950/20'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1 text-left">{label}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            carRentMenuOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {carRentMenuOpen && (
                        <div className="mt-1 ml-4 pl-3 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
                          {children.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setMobileMenuOpen(false)}
                              className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                                isActive(child.href)
                                  ? 'bg-orange-50 text-orange-500 dark:bg-orange-950/20'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive(href)
                        ? 'bg-orange-50 text-orange-500 dark:bg-orange-950/20'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </header>

        {children}
      </div>

      {signOutConfirmOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          onClick={() => setSignOutConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white mb-1">
              Sign out?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              You&apos;ll need to sign in again to access your dashboard.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => setSignOutConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmSignOut}
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}