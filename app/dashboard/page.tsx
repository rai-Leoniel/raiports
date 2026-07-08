'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  HandCoins,
  CreditCard,
  ShoppingCart,
  ShoppingBasket,
  ArrowRightLeft,
  Boxes,
  WalletCards,
  ClipboardList,
  ChartBar as BarChart3,
  Sun,
  Moon,
  Bell,
  LogOut,
  House,
  History,
  Menu,
  X,
} from 'lucide-react';

import { AuthGuard } from '@/components/auth-guard';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type TransactionCategory = {
  id: string;
  name: string;
  icon_type: string;
  color: string;
  created_at: string;
};

const iconMap: Record<string, any> = {
  'hand-coins': HandCoins,
  'credit-card': CreditCard,
  'shopping-cart': ShoppingCart,
  'shopping-basket': ShoppingBasket,
  'arrow-right-left': ArrowRightLeft,
  boxes: Boxes,
  'wallet-cards': WalletCards,
  'clipboard-list': ClipboardList,
};

const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300',
  purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300',
  orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300',
  green: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300',
  cyan: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900 dark:text-cyan-300',
  red: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300',
};

// Muted treatment for categories with nothing pending — keeps the grid
// legible as a status board (color = needs attention, gray = clear)
// instead of every tile shouting the same amount of visual weight.
const mutedColorClass =
  'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500';

// NOTE: These labels must match EXACTLY what the backend expects for
// transaction_type (same labels used in the mobile app's TRANSACTION_TYPES).
// "Disbursement" was previously wrong here -- it must be "Disbursement Voucher"
// or that category's real data would never match anything from the API.
const categories: TransactionCategory[] = [
  { id: '1', name: 'Petty Cash Voucher', icon_type: 'hand-coins', color: 'blue', created_at: '' },
  { id: '2', name: 'Disbursement Voucher', icon_type: 'credit-card', color: 'purple', created_at: '' },
  { id: '3', name: 'Purchase Order', icon_type: 'shopping-cart', color: 'orange', created_at: '' },
  { id: '4', name: 'Direct Purchase', icon_type: 'shopping-basket', color: 'green', created_at: '' },
  { id: '5', name: 'Stock Transfer', icon_type: 'arrow-right-left', color: 'cyan', created_at: '' },
  { id: '6', name: 'Stock Adjustment', icon_type: 'boxes', color: 'red', created_at: '' },
  { id: '7', name: 'Loan Approval', icon_type: 'wallet-cards', color: 'purple', created_at: '' },
  { id: '8', name: 'Stock Issuance', icon_type: 'clipboard-list', color: 'orange', created_at: '' },
];

const API_URL = 'http://raireports-api.duckdns.org/api';
const ACCESS_TOKEN_KEY = 'raiports-access-token';

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({
    totalAmount: 0,
    pendingItems: 0,
    pendingCategories: 0,
  });
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user?.branch) return;

    const fetchDashboardData = async () => {
      setLoading(true);

      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

      try {
        const results = await Promise.all(
          categories.map(async (category) => {
            const res = await fetch(
              `${API_URL}/approval/pending/?branch=${user.branch}&transaction_type=${encodeURIComponent(
                category.name
              )}`,
              { headers }
            );

            if (!res.ok) return { name: category.name, items: [] as any[] };

            const data = await res.json();
            return { name: category.name, items: data[category.name] || [] };
          })
        );

        const counts: Record<string, number> = {};
        let totalAmount = 0;
        let totalItems = 0;
        let categoriesWithItems = 0;

        results.forEach(({ name, items }) => {
          counts[name] = items.length;
          totalItems += items.length;
          if (items.length > 0) categoriesWithItems += 1;

          items.forEach((tx: any) => {
            totalAmount += typeof tx.amount === 'number' ? tx.amount : 0;
          });
        });

        setCategoryCounts(counts);
        setStats({
          totalAmount,
          pendingItems: totalItems,
          pendingCategories: categoriesWithItems,
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user?.branch]);

  const handleSignOut = async () => {
    logout();
    router.push('/login');
  };

  const handleCategoryClick = (categoryName: string) => {
    const slug = categoryName.toLowerCase().replace(/\s+/g, '-');
    router.push(`/dashboard/${slug}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
     <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl md:hidden"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>

            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-heading font-bold text-lg">R</span>
            </div>

            <div>
              <h1 className="font-heading font-bold text-lg leading-tight dark:text-white">
                <span className="text-slate-900 dark:text-white">RAI</span>{' '}
                <span className="text-orange-500">REPORTS</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 tracking-wide">WITH APPROVAL</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 flex-1 justify-center">
            <Link
              href="/dashboard"
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                pathname === '/dashboard'
                  ? 'text-orange-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <House className="w-4 h-4" />
              Dashboard
            </Link>

            <Link
              href="/dashboard/history"
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                pathname === '/dashboard/history'
                  ? 'text-orange-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              History
            </Link>

            <Link
              href="/dashboard/reports"
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                pathname.startsWith('/dashboard/reports')
                  ? 'text-orange-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Reports
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10 relative"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-heading tabular-nums">
                3
              </span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-2">
            <Link
              href="/dashboard"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                pathname === '/dashboard'
                  ? 'bg-orange-50 text-orange-500 dark:bg-orange-950/20'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <House className="w-4 h-4" />
              Dashboard
            </Link>

            <Link
              href="/dashboard/history"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                pathname === '/dashboard/history'
                  ? 'bg-orange-50 text-orange-500 dark:bg-orange-950/20'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <History className="w-4 h-4" />
              History
            </Link>

            <Link
              href="/dashboard/reports"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                pathname.startsWith('/dashboard/reports')
                  ? 'bg-orange-50 text-orange-500 dark:bg-orange-950/20'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <BarChart3 className="w-4 h-4" />
              Reports
            </Link>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="font-heading text-3xl font-bold text-slate-900 dark:text-white mb-1">
            Welcome, {user?.fullName || user?.name || user?.email || 'User'}!
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Track approvals and monitor pending requests.
          </p>
        </div>

        <Card className="mb-8 border-orange-200 dark:border-orange-900 shadow-lg overflow-hidden dark:bg-slate-800 relative pt-1">
          {/* Signature accent: a thin bridge between the two brand colors,
              a quiet nod to "WITH APPROVAL" tying orange and navy together. */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-slate-900 dark:to-slate-100" />

          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-heading font-semibold text-orange-500 uppercase tracking-wide mb-1">
                  Dashboard Overview
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Grand Total Pending Amount
                </p>
              </div>
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 hover:bg-green-100">
                {loading ? 'Syncing...' : 'Up to date'}
              </Badge>
            </div>

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
              <div>
                <div className="font-heading tabular-nums text-4xl font-bold text-slate-900 dark:text-white mb-1">
                  ₱{stats.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date().toLocaleString('en-PH', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              <Link href="/dashboard/summary">
                <Button className="bg-slate-900 dark:bg-orange-600 hover:bg-slate-800 dark:hover:bg-orange-700 text-white rounded-lg px-6">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Summary
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 text-center">
                <div className="font-heading tabular-nums text-3xl font-bold text-slate-900 dark:text-white mb-1">
                  {stats.pendingItems}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">Pending Items</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 text-center">
                <div className="font-heading tabular-nums text-3xl font-bold text-slate-900 dark:text-white mb-1">
                  {stats.pendingCategories}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">Pending Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6">
          <h3 className="font-heading text-xl font-bold text-slate-900 dark:text-white mb-2">
            Pending Transactions
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Click a card to view details
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((category) => {
            const Icon = iconMap[category.icon_type] || HandCoins;
            const count = categoryCounts[category.name] || 0;
            const hasPending = count > 0;
            const colorClass = hasPending
              ? colorMap[category.color] ||
                'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              : mutedColorClass;

            return (
              <button
                key={category.id}
                onClick={() => handleCategoryClick(category.name)}
                className="text-left"
              >
                <Card
                  className={`relative overflow-hidden transition-all duration-200 cursor-pointer border-slate-200 dark:border-slate-700 dark:bg-slate-800 group h-full ${
                    hasPending
                      ? 'hover:shadow-lg dark:hover:shadow-orange-500/20 hover:-translate-y-0.5'
                      : 'hover:shadow-md opacity-80 hover:opacity-100'
                  }`}
                >
                  <Badge
                    className={`absolute top-2 right-2 z-[1] min-w-7 h-7 rounded-full flex items-center justify-center px-1.5 text-xs font-heading tabular-nums shadow-md ${
                      hasPending
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500 shadow-none'
                    }`}
                  >
                    {count}
                  </Badge>
                  <CardContent className="p-6">
                    <div
                      className={`w-14 h-14 rounded-2xl ${colorClass} flex items-center justify-center mb-4 ${
                        hasPending ? 'group-hover:scale-110' : ''
                      } transition-transform`}
                    >
                      <Icon className="w-7 h-7" />
                    </div>

                    <h4
                      className={`font-heading text-sm font-semibold text-center leading-tight ${
                        hasPending
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {category.name}
                    </h4>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
