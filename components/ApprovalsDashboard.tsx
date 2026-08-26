'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  HandCoins,
  CreditCard,
  ShoppingCart,
  ShoppingBasket,
  ArrowRightLeft,
  Boxes,
  WalletCards,
  ClipboardList,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Search,
  XCircle,
  FileText,
  ChevronRight,
  ChevronLeft,
  Eye,
  Lock,
  AlertTriangle,
  Info,
  LifeBuoy,
  ExternalLink,
  Plus,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TransactionCategory = {
  id: string;
  name: string;
  icon_type: string;
  color: string;
  created_at: string;
};

type PendingTransaction = {
  id?: string | number;
  transaction_no?: string;
  journal_code?: string;
  journal_number?: string;
  description?: string;
  amount?: number;
  status?: string;
  prepared_by?: string;
  date?: string;
  created_at?: string;
  j_code?: string;
  j_num?: string;
  [key: string]: any;
};

// Real field names confirmed from the live API response:
// id, j_code, j_num, reference_no, amount, prepared_by,
// transaction_date, description, transaction_type, transaction_status

// Maps the display category name to the short backend code used by the
// itemized-details endpoint — matches the mobile app's typeKeyMap exactly.
const typeKeyMap: Record<string, string> = {
  'Petty Cash Voucher': 'petty_cash',
  'Disbursement Voucher': 'disbursement_voucher',
  'Purchase Order': 'purchase_order',
  'Direct Purchase': 'direct_purchase',
  'Stock Transfer': 'stock_transfer',
  'Stock Adjustment': 'stock_adjustment',
  'Loan Approval': 'loan_approval',
  'Stock Issuance': 'stock_issuance',
};

// j_code/j_num are only relevant (and only sent) for these two types,
// same as the mobile app.
const TYPES_WITH_JOURNAL_REF = new Set(['Petty Cash Voucher', 'Disbursement Voucher']);

// Real decision endpoint per category — matches mobile's endpointMap exactly.
// Falls back to /approval/decision/ for any type not listed here.
const endpointMap: Record<string, string> = {
  'Petty Cash Voucher': '/approval/decision-petty-cash/',
  'Disbursement Voucher': '/approval/decision-disbursement-voucher/',
  'Purchase Order': '/approval/decision-purchase-order/',
  'Direct Purchase': '/approval/decision-direct-purchase/',
  'Stock Transfer': '/approval/decision-stock-transfer/',
};

// Same decline-reason options as mobile's bottom sheet.
const declineReasonOptions = [
  'Incomplete documents',
  'Incorrect amount',
  'Duplicate request',
  'Not aligned with policy',
  'Other',
];

// Only CDB (Check Disbursement Book) is wired into the approval system.
// DSR (Deposit Slip Receipt) isn't tracked in any endpoint here — it needs
// its own fields, endpoint, and workflow before it can do anything real.
const DV_TYPES: { code: 'CDB' | 'DSR'; label: string }[] = [
  { code: 'CDB', label: 'CHECK DISBURSEMENT BOOK' },
  { code: 'DSR', label: 'DEPOSIT SLIP RECEIPT' },
];

// Field-picker for the toolbar's search box, mirroring the desktop app's
// "Voucher No. / Description / Check Payee / Check No. / Link Reference /
// OR Number" dropdown. ⚠️ Only Voucher No. (transaction_no/id), Description,
// Check Payee (payee), and OR Number (reference_no) map to fields confirmed
// real from the live API. Check No. and Link Reference aren't confirmed —
// they'll just filter to nothing until confirmed against approval.py.
const DV_SEARCH_FIELDS: { label: string; getValue: (tx: PendingTransaction) => string }[] = [
  { label: 'Voucher No.', getValue: (tx) => String(tx.transaction_no ?? tx.id ?? '') },
  { label: 'Description', getValue: (tx) => String(tx.description ?? '') },
  { label: 'Check Payee', getValue: (tx) => String(tx.payee ?? tx.check_payee ?? '') },
  { label: 'Check No.', getValue: (tx) => String(tx.ck_num ?? tx.check_no ?? '') },
  { label: 'Link Reference', getValue: (tx) => String(tx.link_reference ?? tx.pr_code ?? tx.purc_ord ?? '') },
  { label: 'OR Number', getValue: (tx) => String(tx.reference_no ?? tx.or_num ?? '') },
];

// Categories that are hardcoded view-only regardless of permissions.
// Empty now — same as mobile, Petty Cash Voucher is governed purely by
// the approve_petty_cash permission below, not a hardcoded block.
const VIEW_ONLY_CATEGORIES = new Set<string>([]);

// NEW: mirrors mobile's permissionKeyMap in PendingTransactionDetailsScreen
// exactly — maps each category's display name to the approve_* permission
// key stored on the logged-in user (set via UserPermissionsScreen, fetched
// from /users/<uid>/permissions/ at login in auth-context.tsx).
const permissionKeyMap: Record<string, string> = {
  'Disbursement Voucher': 'approve_disbursement_voucher',
  'Purchase Order': 'approve_purchase_orders',
  'Direct Purchase': 'approve_direct_purchase',
  'Stock Transfer': 'approve_stock_transfer',
  'Petty Cash Voucher': 'approve_petty_cash',
};

// Card preview fields per transaction type — mirrors the mobile app's
// CARD_PREVIEW_FIELDS so the same rows appear first (line no, title, 2 amounts).
const CARD_PREVIEW_FIELDS: Record<string, string[]> = {
  petty_cash: ['Line No.', 'Account Title', 'Net Amount', 'Total Amount'],
  disbursement_voucher: ['Line No.', 'Account Title', 'Net Amount', 'Total Amount'],
  direct_purchase: ['Line No.', 'Item Description', 'Quantity', 'Line Amount'],
  purchase_order: ['Line No.', 'Item Description', 'Order Quantity', 'Line Amount'],
};

const CURRENCY_COLUMNS = new Set([
  'Net Amount', 'Petty Cash Amount', 'Tax Amount', 'Total Amount',
  'Unit Price', 'Discount Amount', 'Line VAT', 'Net Price',
  'Line Amount', 'New Price',
]);

function formatCurrencyValue(value: any): string {
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return String(value ?? '');
  return num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCellValue(col: string, value: any): string {
  if (CURRENCY_COLUMNS.has(col)) return formatCurrencyValue(value);
  return String(value ?? '');
}

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

const mutedColorClass =
  'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500';

const categories: TransactionCategory[] = [
  { id: '1', name: 'Petty Cash Voucher', icon_type: 'hand-coins', color: 'blue', created_at: '' },
  { id: '2', name: 'Disbursement Voucher', icon_type: 'credit-card', color: 'purple', created_at: '' },
  { id: '3', name: 'Purchase Order', icon_type: 'shopping-cart', color: 'orange', created_at: '' },
  { id: '4', name: 'Direct Purchase', icon_type: 'shopping-basket', color: 'green', created_at: '' },
  { id: '5', name: 'Stock Transfer', icon_type: 'arrow-right-left', color: 'cyan', created_at: '' },
  { id: '6', name: 'Stock Adjustment', icon_type: 'boxes', color: 'red', created_at: '' },
  { id: '7', name: 'Stock Issuance', icon_type: 'clipboard-list', color: 'orange', created_at: '' },
];

type View = 'overview' | 'list';

// Formats a Date as YYYY-MM-DD using LOCAL time, not toISOString() (which
// is UTC and silently shifts to the previous day in timezones ahead of UTC,
// e.g. PHT/UTC+8 — this was quietly turning "today" into "yesterday" in
// every default-date computation below).
const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function DashboardPageContent() {
  const { user, company } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [categoryItems, setCategoryItems] = useState<Record<string, PendingTransaction[]>>({});
  // NEW: raw total Purchase Order count (all statuses), separate from the
  // finalized-only pending count in categoryCounts. Powers the "840 total"
  // line under the Purchase Order card below.
  const [poTotalCount, setPoTotalCount] = useState<number | null>(null);
  const [stats, setStats] = useState({
    totalAmount: 0,
    pendingItems: 0,
    pendingCategories: 0,
  });
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<View>('overview');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTransaction, setActiveTransaction] = useState<PendingTransaction | null>(null);
  const [listSearch, setListSearch] = useState('');

  // Itemized details — fetched live from /approval/view-more-details/,
  // same endpoint the mobile app's ViewMoreTransactionDetailsScreen uses.
  const [itemizedLoading, setItemizedLoading] = useState(false);
  const [itemizedRows, setItemizedRows] = useState<Record<string, any>[]>([]);

  // Approve/Reject — real submission state, mirrors mobile's decision flow.
  const [declinePanelOpen, setDeclinePanelOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Decided (approved/disapproved/cancelled) transactions per category —
  // fetched from /approval/decision-history/, same endpoint mobile's
  // DecisionHistoryScreen uses. Powers the status donut and weekly chart
  // below with real data instead of placeholders.
  const [decidedItems, setDecidedItems] = useState<Record<string, PendingTransaction[]>>({});
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Top search bar — searches across all already-loaded pending transactions.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Calendar widget — static month navigation only, no real events yet.
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // -----------------------------------------------------------------
  // Disbursement Voucher — toolbar (Branch/Type/date-range/search) filters
  // Column 1's list below. "New Entry" now navigates to its own dedicated
  // page instead of opening a dialog — see
  // /dashboard/disbursement-voucher/new for the create form itself.
  //
  // Branch list — fetched live from /approval/reports/branches/ (rssys.branch),
  // scoped to whichever tenant is currently logged in. FIXED this pass: this
  // used to be a hardcoded DV_BRANCHES array (BUT/CAR/GEN/MAN) that was
  // confirmed against a different tenant's data during an earlier session —
  // it was showing every tenant the same 4 branches regardless of which
  // company they were actually logged into, a real cross-tenant data leak.
  // Now matches the New Entry form, which already fetched this correctly.
  // -----------------------------------------------------------------
  const [dvBranches, setDvBranches] = useState<{ code: string; label: string }[]>([]);
  const [dvBranchesLoading, setDvBranchesLoading] = useState(true);

  useEffect(() => {
    apiFetch('/approval/reports/branches/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.branches;
        if (Array.isArray(list) && list.length > 0) {
          setDvBranches(
            list.map((b: { value: string; label: string }) => ({ code: b.value, label: b.label }))
          );
        }
      })
      .catch((err) => console.error('Error fetching branches:', err))
      .finally(() => setDvBranchesLoading(false));
  }, []);

  const [dvBranch, setDvBranch] = useState('');

  useEffect(() => {
    if (dvBranches.length > 0 && !dvBranch) {
      const match = dvBranches.find((b) => b.code === user?.branch);
      setDvBranch(match?.code ?? dvBranches[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dvBranches, user?.branch]);

  const [dvType, setDvType] = useState<'CDB' | 'DSR'>('CDB');
  const [dvBranchItems, setDvBranchItems] = useState<PendingTransaction[]>([]);
  const [dvBranchLoading, setDvBranchLoading] = useState(false);
  const [dvSearchField, setDvSearchField] = useState(DV_SEARCH_FIELDS[0].label);
  const [dvSearchQuery, setDvSearchQuery] = useState('');
  const [dvHideCancelled, setDvHideCancelled] = useState(true);
  // Defaults OFF — a pending-approvals list should show everything needing
  // action regardless of age by default. An old unapproved voucher is more
  // urgent, not less; hiding it by default caused real data to silently
  // disappear (this exact bug: a real Jan 2026 pending voucher vanished
  // because it fell outside the "this month" default range).
  const [dvDateFilterEnabled, setDvDateFilterEnabled] = useState(false);
  const [dvDateFrom, setDvDateFrom] = useState(() => {
    const now = new Date();
    return formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [dvDateTo, setDvDateTo] = useState(() => formatLocalDate(new Date()));


  // NEW: shared "Show unfinalized" toggle — one checkbox controls
  // visibility for EVERY category card (Petty Cash Voucher, Disbursement
  // Voucher, etc.) at once, plus the Disbursement Voucher toolbar's own
  // list view below. Defaults to false (finalized-only), matching the
  // existing behavior mobile relies on for its ready-to-approve queue —
  // this is purely an additive opt-in for web, mobile never sends the
  // param and is completely unaffected.
  const [includeUnfinalized, setIncludeUnfinalized] = useState(false);

  // NEW: status filter checkboxes for the "Pending transactions" section.
  // Pending is always included. Checking these adds matching decided
  // transactions (from decidedItems, already fetched via
  // /approval/decision-history/) into each category's count/list.
  const [showApproved, setShowApproved] = useState(false);
  const [showDisapproved, setShowDisapproved] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  // NEW: catches any decided transaction whose transaction_status isn't
  // exactly 'approved' / 'disapproved' / 'cancelled' (e.g. 'for revision',
  // 'on hold', null, or an unexpected value) so those rows are visible
  // instead of silently vanishing from every count on this page.
  const [showOther, setShowOther] = useState(false);

  const fetchDashboardData = async () => {
    if (!user?.branch) return;
    setLoading(true);

    try {
      const results = await Promise.all(
        categories.map(async (category) => {
          const res = await apiFetch(
            `/approval/pending/?branch=${user.branch}&transaction_type=${encodeURIComponent(
              category.name
            )}&include_unfinalized=${includeUnfinalized}`
          );

          if (!res.ok) return { name: category.name, items: [] as PendingTransaction[] };

          const data = await res.json();
          return { name: category.name, items: (data[category.name] || []) as PendingTransaction[] };
        })
      );

      const counts: Record<string, number> = {};
      const items: Record<string, PendingTransaction[]> = {};
      let totalAmount = 0;
      let totalItems = 0;
      let categoriesWithItems = 0;

      results.forEach(({ name, items: catItems }) => {
        counts[name] = catItems.length;
        items[name] = catItems;
        totalItems += catItems.length;
        if (catItems.length > 0) categoriesWithItems += 1;

        catItems.forEach((tx) => {
          totalAmount += typeof tx.amount === 'number' ? tx.amount : 0;
        });
      });

      setCategoryCounts(counts);
      setCategoryItems(items);
      setStats({
        totalAmount,
        pendingItems: totalItems,
        pendingCategories: categoriesWithItems,
      });
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    (window as any).__refreshDashboardData = fetchDashboardData;
    return () => {
      if ((window as any).__refreshDashboardData === fetchDashboardData) {
        delete (window as any).__refreshDashboardData;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch, includeUnfinalized]);

  // NEW: raw total Purchase Order count (rssys.purhdr, all statuses) for
  // the logged-in user's branch — independent of the finalized-only
  // pending count above. Powers the "840 total" line on the Purchase
  // Order category card.
  useEffect(() => {
    if (!user?.branch) return;
    apiFetch(`/approval/purchase-order-total/?branch=${user.branch}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (data && typeof data.total === 'number') {
          setPoTotalCount(data.total);
        }
      })
      .catch((err) => console.error('Error fetching PO total:', err));
  }, [user?.branch]);

  // Approved/disapproved/cancelled transactions — real data for the status
  // donut and the weekly chart, using the same endpoint mobile's decision
  // history screen calls. NEW: now also sends include_unfinalized, matching
  // fetchDashboardData — decided rows with isfinalized:'N' were previously
  // excluded from decision-history the same way pending rows used to be,
  // which is what caused the Purchase Order "Other" count (823) to fall
  // short of the raw total (840).
  const fetchDecidedData = async () => {
    if (!user?.branch) return;

    try {
      const results = await Promise.all(
        categories.map(async (category) => {
          const backendType = typeKeyMap[category.name] ?? category.name;
          const res = await apiFetch(
            `/approval/decision-history/?branch=${user.branch}&transaction_type=${backendType}&include_unfinalized=${includeUnfinalized}`
          );
          if (!res.ok) return { name: category.name, items: [] as PendingTransaction[] };
          const data = await res.json();
          return { name: category.name, items: (data[backendType] || []) as PendingTransaction[] };
        })
      );

      const items: Record<string, PendingTransaction[]> = {};
      results.forEach(({ name, items: catItems }) => {
        items[name] = catItems;
      });
      setDecidedItems(items);
    } catch (error) {
      console.error('Error fetching decision history:', error);
    }
  };

  useEffect(() => {
    fetchDecidedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch, includeUnfinalized]);

  // NEW: merges pending items with decided items matching the checked
  // status filters, per category. Falls back to plain categoryItems when
  // no extra filters are checked (keeps existing behavior untouched).
  const normalizeStatusLocal = (status?: string) => (status || '').trim().toLowerCase();

  const displayedCategoryItems: Record<string, PendingTransaction[]> = {};
  categories.forEach((c) => {
    const pending = categoryItems[c.name] || [];
    const decided = decidedItems[c.name] || [];
    const extra = decided.filter((tx) => {
      const s = normalizeStatusLocal(tx.transaction_status);
      if (showApproved && s === 'approved') return true;
      if (showDisapproved && s === 'disapproved') return true;
      if (showCancelled && s === 'cancelled') return true;
      if (showOther && s !== 'approved' && s !== 'disapproved' && s !== 'cancelled') return true;
      return false;
    });
    displayedCategoryItems[c.name] = [...pending, ...extra];
  });

  const displayedCategoryCounts: Record<string, number> = {};
  categories.forEach((c) => {
    displayedCategoryCounts[c.name] = displayedCategoryItems[c.name].length;
  });

  // Disbursement Voucher toolbar — branch/type-aware fetch, reusing the same
  // /approval/pending/ endpoint the rest of this file already uses,
  // parameterized by whichever branch is picked in the toolbar instead of
  // being locked to the logged-in user's own branch. Feeds Column 1 below
  // (via listItems) rather than a separate table — the 3-column view itself
  // is untouched. Skipped for DSR since nothing in the API tracks that type.
  const fetchDvList = async () => {
    if (dvType !== 'CDB' || !dvBranch) {
      setDvBranchItems([]);
      return;
    }
    setDvBranchLoading(true);
    try {
      const res = await apiFetch(
        `/approval/pending/?branch=${dvBranch}&transaction_type=${encodeURIComponent('Disbursement Voucher')}&include_unfinalized=${includeUnfinalized}`
      );
      const data = res.ok ? await res.json() : {};
      setDvBranchItems(data['Disbursement Voucher'] || []);
    } catch (error) {
      console.error('Error fetching Disbursement Voucher list:', error);
      setDvBranchItems([]);
    } finally {
      setDvBranchLoading(false);
    }
  };

  useEffect(() => {
    if (view !== 'list' || activeCategory !== 'Disbursement Voucher') return;
    fetchDvList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeCategory, dvBranch, dvType, includeUnfinalized]);

  const handleCategoryClick = (categoryName: string) => {
    setActiveCategory(categoryName);
    setActiveTransaction(null);
    setItemizedRows([]);
    setListSearch('');
    setActionMessage(null);
    setView('list');
  };

  // Deep-link support — this app doesn't route per category (there's no
  // /dashboard/<category> page; category switching is local state on this
  // single page). Other pages that need to send someone back into a
  // specific category's list (e.g. the Disbursement Voucher create page's
  // "Go Back") use /dashboard?category=<name> instead, and this reads that
  // param once on load to land directly in that category's list rather
  // than the overview grid.
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat && categories.some((c) => c.name === cat)) {
      handleCategoryClick(cat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTransactionClick = (tx: PendingTransaction) => {
    setActiveTransaction(tx);
    setActionMessage(null);
    setDeclinePanelOpen(false);
  };

  const handleBack = () => {
    setView('overview');
    setActiveCategory(null);
    setActiveTransaction(null);
    setItemizedRows([]);
  };

  // Real approve/reject submission — mirrors mobile's sendData() exactly:
  // same endpoint-per-category map, same payload shape.
  const submitDecision = async (
    decision: 'approve' | 'decline',
    reasonWhy: string = '',
    reasonWhyOthers: string = ''
  ) => {
    if (!activeCategory || !activeTransaction) return;

    // NEW: safety net — never submit a decision for a view-only category
    // or a category the user lacks the specific approve_* permission for,
    // even if this function is somehow triggered directly. Mirrors the
    // same guard in mobile's authenticate().
    if (isViewOnlyCategory) return;

    setActionLoading(true);
    setActionMessage(null);

    const endpoint = endpointMap[activeCategory] ?? '/approval/decision/';
    const txId = activeTransaction.id ?? activeTransaction.transaction_no ?? '';

    const payload = {
      id: txId,
      transaction_type: activeCategory,
      decision,
      reason_why: reasonWhy,
      reason_why_others: reasonWhyOthers,
      user_id: user?.id ?? '',
      j_code: activeTransaction.j_code,
      j_num: activeTransaction.j_num,
    };

    try {
      const res = await apiFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Transaction ${decision === 'approve' ? 'approved' : 'disapproved'} successfully.`,
        });

        // Remove the decided transaction from the local list/counts so the
        // 3-column view reflects it immediately, then re-sync with the server.
        setCategoryItems((prev) => ({
          ...prev,
          [activeCategory]: (prev[activeCategory] || []).filter(
            (t) => (t.id ?? t.transaction_no) !== txId
          ),
        }));
        setCategoryCounts((prev) => ({
          ...prev,
          [activeCategory]: Math.max((prev[activeCategory] || 1) - 1, 0),
        }));
        setActiveTransaction(null);
        setItemizedRows([]);
        setDeclinePanelOpen(false);
        setSelectedReason('');
        setOtherReason('');
        fetchDashboardData();
      } else {
        const errBody = await res.json().catch(() => null);
        setActionMessage({
          type: 'error',
          text:
            errBody?.message ||
            errBody?.detail ||
            `Failed to ${decision === 'approve' ? 'approve' : 'disapprove'} the transaction.`,
        });
      }
    } catch (error) {
      console.error('Error submitting decision:', error);
      setActionMessage({
        type: 'error',
        text: 'Could not reach the server. Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = () => submitDecision('approve');

  const handleConfirmDecline = () => {
    if (!selectedReason) {
      setActionMessage({ type: 'error', text: 'Please select a reason before proceeding.' });
      return;
    }
    if (selectedReason === 'Other' && !otherReason.trim()) {
      setActionMessage({ type: 'error', text: 'Please type your specific reason.' });
      return;
    }
    submitDecision(
      'decline',
      selectedReason,
      selectedReason === 'Other' ? otherReason.trim() : ''
    );
  };

  // Fetches the itemized line-item breakdown for the active transaction,
  // exactly like the mobile app's ViewMoreTransactionDetailsScreen does.
  const fetchItemizedDetails = async () => {
    if (!activeTransaction || !activeCategory) return;

    setItemizedLoading(true);
    setItemizedRows([]);

    const backendType = typeKeyMap[activeCategory] ?? activeCategory;
    const txId = activeTransaction.id ?? activeTransaction.transaction_no ?? '';

    const params = new URLSearchParams({
      branch: user?.branch ?? '',
      transaction_type: backendType,
      id: String(txId),
    });

    if (TYPES_WITH_JOURNAL_REF.has(activeCategory)) {
      if (activeTransaction.j_code) params.set('j_code', activeTransaction.j_code);
      if (activeTransaction.j_num) params.set('j_num', activeTransaction.j_num);
    }

    try {
      const res = await apiFetch(`/approval/view-more-details/?${params.toString()}`);

      if (!res.ok) {
        setItemizedRows([]);
        return;
      }

      const data = await res.json();
      const fetched = data?.[backendType];
      setItemizedRows(Array.isArray(fetched) ? fetched : []);
    } catch (error) {
      console.error('Error fetching itemized details:', error);
      setItemizedRows([]);
    } finally {
      setItemizedLoading(false);
    }
  };

  // 3-column layout: itemized details load automatically the moment a
  // transaction is selected in the list column, instead of behind a click.
  useEffect(() => {
    if (activeTransaction) {
      fetchItemizedDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTransaction?.id, activeTransaction?.transaction_no]);

  const activeCategoryMeta = categories.find((c) => c.name === activeCategory);
  const ActiveCategoryIcon = activeCategoryMeta
    ? iconMap[activeCategoryMeta.icon_type] || HandCoins
    : HandCoins;

  // NEW: same two-part gating mobile uses — a hardcoded category block
  // (currently empty, see VIEW_ONLY_CATEGORIES above) OR the logged-in
  // user lacking the specific approve_* permission for this category.
  const isCategoryHardcodedViewOnly = activeCategory
    ? VIEW_ONLY_CATEGORIES.has(activeCategory)
    : false;
  const permissionKey = activeCategory ? permissionKeyMap[activeCategory] : undefined;
  const hasApprovalPermission = permissionKey
    ? !!user?.permissions?.[permissionKey]
    : true;
  const isViewOnlyCategory = isCategoryHardcodedViewOnly || !hasApprovalPermission;

  // Disbursement Voucher toolbar filtering — cancelled/date-range/search-
  // field applied on top of whatever fetchDvList pulled for the selected
  // branch. Everything else (categories other than Disbursement Voucher)
  // is untouched below.
  const dvSearchFieldConfig =
    DV_SEARCH_FIELDS.find((f) => f.label === dvSearchField) ?? DV_SEARCH_FIELDS[0];
  const dvFilteredList = dvBranchItems.filter((tx) => {
    if (dvHideCancelled) {
      const status = String(tx.transaction_status ?? tx.status ?? '').toLowerCase();
      if (status.includes('cancel')) return false;
    }
    if (dvDateFilterEnabled) {
      const raw = tx.transaction_date ?? tx.date ?? tx.t_date;
      if (raw) {
        const parsed = new Date(raw as string);
        if (!isNaN(parsed.getTime())) {
          const d = formatLocalDate(parsed);
          if (d < dvDateFrom || d > dvDateTo) return false;
        }
      }
      // No parseable date on the item — don't hide it just because the
      // field name might differ from what's assumed above.
    }
    const q = dvSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return dvSearchFieldConfig.getValue(tx).toLowerCase().includes(q);
  });

  const listItems =
    activeCategory === 'Disbursement Voucher'
      ? dvFilteredList
      : (activeCategory ? displayedCategoryItems[activeCategory] : []) || [];
  const filteredListItems = listItems.filter((tx) => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(tx.transaction_no ?? tx.id ?? '').toLowerCase().includes(q) ||
      String(tx.description ?? '').toLowerCase().includes(q) ||
      String(tx.prepared_by ?? '').toLowerCase().includes(q)
    );
  });

  const backendTypeForActive = activeCategory ? typeKeyMap[activeCategory] ?? activeCategory : '';
  const previewFields =
    CARD_PREVIEW_FIELDS[backendTypeForActive] ??
    (itemizedRows[0] ? Object.keys(itemizedRows[0]).slice(0, 4) : []);
  const [lineField, titleField, ...amountFields] = previewFields;

  // Company name, sourced from the same login response the mobile app uses
  // (result.company.comp_name) -- falls back to user.company in case the
  // separate `company` object hasn't loaded yet, so it never shows a gap.
  const companyName = company?.comp_name || user?.company || '';

  // --- Real data for the new bottom charts + sidebar --------------------

  const allDecidedFlat = Object.values(decidedItems).flat();

  const normalizeStatus = (status?: string) => (status || '').trim().toLowerCase();

  const statusBreakdown = {
    pending: stats.pendingItems,
    approved: allDecidedFlat.filter((t) => normalizeStatus(t.transaction_status) === 'approved').length,
    disapproved: allDecidedFlat.filter((t) => normalizeStatus(t.transaction_status) === 'disapproved')
      .length,
    cancelled: allDecidedFlat.filter((t) => normalizeStatus(t.transaction_status) === 'cancelled').length,
    // NEW: anything decided that isn't approved/disapproved/cancelled —
    // this is what was making poTotalCount (840) not line up with the
    // finalized-only counts elsewhere on this page. Surfaced instead of
    // silently dropped.
    other: allDecidedFlat.filter((t) => {
      const s = normalizeStatus(t.transaction_status);
      return s !== 'approved' && s !== 'disapproved' && s !== 'cancelled';
    }).length,
  };
  const otherStatusTotal = statusBreakdown.other;
  const statusTotal =
    statusBreakdown.pending +
    statusBreakdown.approved +
    statusBreakdown.disapproved +
    statusBreakdown.cancelled +
    statusBreakdown.other;

  // Top categories by total pending amount — real sums from categoryItems.
  const topPendingByAmount = categories
    .map((c) => ({
      name: c.name,
      color: c.color,
      total: (categoryItems[c.name] || []).reduce(
        (sum, tx) => sum + (typeof tx.amount === 'number' ? tx.amount : 0),
        0
      ),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // Weekly decisions — real counts of approved/disapproved transactions per
  // day, from actual decision_date values, for the current Mon–Sun week.
  // (Not a "pending trend" since we don't store historical pending counts —
  // labeled honestly as "Decisions this week".)
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const startOfWeek = (() => {
    const now = new Date();
    const day = now.getDay() === 0 ? 7 : now.getDay(); // Mon=1..Sun=7
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    monday.setHours(0, 0, 0, 0);
    return monday;
  })();

  const weeklyDecisionCounts = weekDays.map((_, i) => {
    const dayStart = new Date(startOfWeek);
    dayStart.setDate(startOfWeek.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    return allDecidedFlat.filter((t) => {
      const raw = t.decision_date || t.transaction_date;
      if (!raw) return false;
      const d = new Date(raw as string);
      return d >= dayStart && d < dayEnd;
    }).length;
  });
  const maxWeeklyCount = Math.max(...weeklyDecisionCounts, 1);

  // Search — flattens every loaded pending transaction across categories.
  const searchResults =
    searchQuery.trim().length > 0
      ? categories
          .flatMap((c) =>
            (categoryItems[c.name] || []).map((tx) => ({ ...tx, __category: c.name }))
          )
          .filter((tx) => {
            const q = searchQuery.trim().toLowerCase();
            return (
              String(tx.transaction_no ?? tx.id ?? '').toLowerCase().includes(q) ||
              String(tx.description ?? '').toLowerCase().includes(q) ||
              String(tx.prepared_by ?? '').toLowerCase().includes(q) ||
              String(tx.__category ?? '').toLowerCase().includes(q)
            );
          })
          .slice(0, 8)
      : [];

  const handleSearchResultClick = (tx: PendingTransaction & { __category: string }) => {
    setSearchQuery('');
    setSearchFocused(false);
    setActiveCategory(tx.__category);
    setActiveTransaction(tx);
    setView('list');
  };

  // Approval queue — most recent pending items across all categories.
  const approvalQueue = categories
    .flatMap((c) => (categoryItems[c.name] || []).map((tx) => ({ ...tx, __category: c.name })))
    .sort((a, b) => {
      const da = new Date((a as any).transaction_date || 0).getTime();
      const db = new Date((b as any).transaction_date || 0).getTime();
      return db - da;
    })
    .slice(0, 5);

  const syncedAgoText = (() => {
    if (!lastSyncTime) return null;
    const diffMin = Math.floor((Date.now() - lastSyncTime.getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  })();

  const categoriesFullyCleared = categories.filter((c) => (categoryCounts[c.name] || 0) === 0).length;

  // Calendar grid for the currently displayed month — real "today"
  // highlight, but no event data (static navigation only).
  const calendarGrid = (() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: { day: number; inMonth: boolean }[] = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, inMonth: true });
    }
    while (cells.length % 7 !== 0 || cells.length < 42) {
      cells.push({ day: cells.length - (startOffset + daysInMonth) + 1, inMonth: false });
    }
    return cells;
  })();

  const today = new Date();
  const isToday = (day: number, inMonth: boolean) =>
    inMonth &&
    day === today.getDate() &&
    calendarMonth.getMonth() === today.getMonth() &&
    calendarMonth.getFullYear() === today.getFullYear();

  return (
    <main className="max-w-[1600px] mx-auto px-4 py-8">
      {view === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
          <div>
            {/* Real search — filters across all already-loaded pending
                transactions by transaction no, description, preparer, or
                category. */}
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search transactions, preparers, categories..."
                className="pl-11 h-12 rounded-xl"
              />

              {searchFocused && searchQuery.trim().length > 0 && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                      No matching pending transactions.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-80 overflow-y-auto">
                      {searchResults.map((tx, i) => (
                        <button
                          key={`${tx.__category}-${tx.id ?? tx.transaction_no ?? i}`}
                          type="button"
                          onMouseDown={() => handleSearchResultClick(tx)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {tx.transaction_no ?? tx.id ?? '—'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {tx.__category} &middot; {tx.prepared_by ?? 'System'}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white shrink-0">
                            ₱{(tx.amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          <div className="mb-8">
  <h2 className="font-heading text-3xl font-bold text-slate-900 dark:text-white mb-1">
    Welcome back, {user?.fullName || user?.name || user?.email || 'User'}!{' '}
    <span role="img" aria-label="waving hand">👋</span>
  </h2>
  <p className="text-sm text-slate-600 dark:text-slate-400">
    Here&apos;s what&apos;s happening with your approvals today.
  </p>
</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <div className="w-11 h-11 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 flex items-center justify-center mb-3">
                  <WalletCards className="w-5 h-5" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Grand total pending</p>
                <p className="font-heading tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  ₱{stats.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-400 mt-1">{loading ? 'Syncing...' : 'Up to date'}</p>
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <div className="w-11 h-11 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center mb-3">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Pending items</p>
                <p className="font-heading tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {stats.pendingItems}
                </p>
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-3">
                  <Boxes className="w-5 h-5" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Pending categories</p>
                <p className="font-heading tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {stats.pendingCategories}
                </p>
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <div className="w-11 h-11 rounded-xl bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Today&apos;s approvals</p>
                <p className="font-heading tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  —
                </p>
                <p className="text-xs text-slate-400 mt-1">Coming soon</p>
              </CardContent>
            </Card>
          </div>

          <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-heading text-xl font-bold text-slate-900 dark:text-white mb-1">
                Pending transactions
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Click a module to view details and take action.
              </p>
            </div>
            {/* NEW: shared toggle — affects every card's count/list below,
                AND the Disbursement Voucher toolbar's list view. Off by
                default (finalized-only), matching the existing mobile
                ready-to-approve behavior. Plus the 3 status checkboxes,
                which fold matching decided transactions (from decidedItems)
                into each category's count/list on top of Pending. */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={includeUnfinalized}
                  onChange={(e) => setIncludeUnfinalized(e.target.checked)}
                  className="accent-orange-500"
                />
                Show unfinalized (Petty Cash / Disbursement Voucher)
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showApproved}
                  onChange={(e) => setShowApproved(e.target.checked)}
                  className="accent-green-600"
                />
                Approved
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showDisapproved}
                  onChange={(e) => setShowDisapproved(e.target.checked)}
                  className="accent-red-600"
                />
                Disapproved
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(e) => setShowCancelled(e.target.checked)}
                  className="accent-purple-600"
                />
                Cancelled
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showOther}
                  onChange={(e) => setShowOther(e.target.checked)}
                  className="accent-slate-500"
                />
                Other{otherStatusTotal > 0 ? ` (${otherStatusTotal})` : ''}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
            {categories.map((category) => {
              const Icon = iconMap[category.icon_type] || HandCoins;
              const count = displayedCategoryCounts[category.name] || 0;
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
                      className={`absolute top-3 right-3 z-[1] min-w-7 h-7 rounded-full flex items-center justify-center px-1.5 text-xs font-heading tabular-nums shadow-md ${
                        hasPending
                          ? 'bg-orange-500 text-white'
                          : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500 shadow-none'
                      }`}
                    >
                      {count}
                    </Badge>
                    <CardContent className="p-5">
                      <div
                        className={`w-12 h-12 rounded-xl ${colorClass} flex items-center justify-center mb-3 ${
                          hasPending ? 'group-hover:scale-110' : ''
                        } transition-transform`}
                      >
                        <Icon className="w-6 h-6" />
                      </div>

                      <h4
                        className={`font-heading text-sm font-semibold leading-tight mb-1 ${
                          hasPending
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {category.name}
                      </h4>

                      {/* NEW: raw total count line, Purchase Order only */}
                      {category.name === 'Purchase Order' && poTotalCount !== null && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-0.5 mb-1">
                          {poTotalCount.toLocaleString()} total
                        </p>
                      )}

                      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 mt-2">
                        View details <ArrowRight className="w-3 h-3" />
                      </span>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pending by status — real counts: pending (live) + approved/
                disapproved/cancelled (from decision history). */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <h4 className="font-heading font-semibold text-slate-900 dark:text-white mb-4">
                  Pending by status
                </h4>
                {statusTotal === 0 ? (
                  <p className="text-xs text-slate-400">No transaction data yet.</p>
                ) : (
                  <div className="flex items-center gap-5">
                    <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0 -rotate-90">
                      {(() => {
                        const segments = [
                          { value: statusBreakdown.pending, color: '#f97316' },
                          { value: statusBreakdown.approved, color: '#22c55e' },
                          { value: statusBreakdown.disapproved, color: '#ef4444' },
                          { value: statusBreakdown.cancelled, color: '#a855f7' },
                          { value: statusBreakdown.other, color: '#94a3b8' },
                        ];
                        const circumference = 2 * Math.PI * 40;
                        let offsetAcc = 0;
                        return segments.map((seg, i) => {
                          const fraction = seg.value / statusTotal;
                          const dash = fraction * circumference;
                          const dashArray = `${dash} ${circumference - dash}`;
                          const dashOffset = -offsetAcc;
                          offsetAcc += dash;
                          if (seg.value === 0) return null;
                          return (
                            <circle
                              key={i}
                              cx="50"
                              cy="50"
                              r="40"
                              fill="none"
                              stroke={seg.color}
                              strokeWidth="14"
                              strokeDasharray={dashArray}
                              strokeDashoffset={dashOffset}
                            />
                          );
                        });
                      })()}
                    </svg>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-heading text-lg font-bold text-slate-900 dark:text-white -mt-1">
                        {statusTotal} <span className="text-xs font-normal text-slate-400">total</span>
                      </p>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                        Pending ({statusBreakdown.pending})
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        Approved ({statusBreakdown.approved})
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        Disapproved ({statusBreakdown.disapproved})
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                        Cancelled ({statusBreakdown.cancelled})
                      </div>
                      {statusBreakdown.other > 0 && (
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                          Other ({statusBreakdown.other})
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Decisions this week — real counts of approved/disapproved
                transactions per day, from actual decision dates. Labeled
                honestly since we don't store historical pending snapshots. */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-heading font-semibold text-slate-900 dark:text-white">
                    Decisions this week
                  </h4>
                  <span className="text-xs font-medium text-slate-400">Mon–Sun</span>
                </div>
                {allDecidedFlat.length === 0 ? (
                  <p className="text-xs text-slate-400">No decisions recorded yet this week.</p>
                ) : (
                  <div className="flex items-end justify-between gap-2 h-28">
                    {weeklyDecisionCounts.map((count, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                        <div
                          className="w-full rounded-t-md bg-orange-500 dark:bg-orange-600 transition-all"
                          style={{ height: `${Math.max((count / maxWeeklyCount) * 88, count > 0 ? 6 : 2)}px` }}
                          title={`${count} decision${count === 1 ? '' : 's'}`}
                        />
                        <span className="text-[10px] font-medium text-slate-400">{weekDays[i]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top pending by amount — real per-category sums, links to
                the real Reports nav item. */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-heading font-semibold text-slate-900 dark:text-white">
                    Top pending by amount
                  </h4>
                  <Link
                    href="/dashboard/reports"
                    className="text-xs font-medium text-orange-600 dark:text-orange-400 inline-flex items-center gap-1"
                  >
                    View full report <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                {topPendingByAmount.length === 0 ? (
                  <p className="text-xs text-slate-400">No pending amounts yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {topPendingByAmount.map((c) => (
                      <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              colorMap[c.color]?.split(' ')[0]?.replace('bg-', 'bg-') || 'bg-slate-400'
                            }`}
                          />
                          <span className="text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                        </div>
                        <span className="font-heading tabular-nums font-semibold text-slate-900 dark:text-white shrink-0">
                          ₱{c.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          </div>

          {/* Right sidebar */}
          <aside className="space-y-4">
            {/* Calendar — static month navigation, today highlighted.
                No event data yet, so nothing is plotted on specific days. */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                    Calendar
                  </h4>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                        )
                      }
                      className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                        )
                      }
                      className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {calendarMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
                </p>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i} className="text-[10px] font-medium text-slate-400">
                      {d}
                    </span>
                  ))}
                  {calendarGrid.map((cell, i) => (
                    <span
                      key={i}
                      className={`text-[11px] py-1 rounded-full ${
                        isToday(cell.day, cell.inMonth)
                          ? 'bg-orange-500 text-white font-bold'
                          : cell.inMonth
                          ? 'text-slate-700 dark:text-slate-300'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    >
                      {cell.day}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Approval queue — real pending transactions, most recent
                first, across all categories. */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                    Approval queue
                  </h4>
                  {approvalQueue.length > 0 && (
                    <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                      {stats.pendingItems} total
                    </span>
                  )}
                </div>

                {approvalQueue.length === 0 ? (
                  <p className="text-xs text-slate-400">Nothing pending right now.</p>
                ) : (
                  <div className="space-y-1">
                    {approvalQueue.map((tx, i) => {
                      const meta = categories.find((c) => c.name === tx.__category);
                      const Icon = meta ? iconMap[meta.icon_type] || HandCoins : HandCoins;
                      return (
                        <button
                          key={`${tx.__category}-${tx.id ?? tx.transaction_no ?? i}`}
                          type="button"
                          onClick={() => {
                            setActiveCategory(tx.__category);
                            setActiveTransaction(tx);
                            setView('list');
                          }}
                          className="w-full flex items-center gap-2.5 px-1.5 py-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {tx.transaction_no ?? tx.id ?? '—'}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {tx.__category}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System alerts — kept honest: only real, derived observations
                (sync recency, categories fully cleared), no fabricated
                claims about attachments/backups/etc. */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-4">
                <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white mb-3">
                  System status
                </h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                      <Info className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        Data last synced
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {syncedAgoText ? `Up to date · ${syncedAgoText}` : 'Syncing...'}
                      </p>
                    </div>
                  </div>

                  {categoriesFullyCleared > 0 && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          {categoriesFullyCleared} categor{categoriesFullyCleared === 1 ? 'y' : 'ies'} fully cleared
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          No pending items in these modules
                        </p>
                      </div>
                    </div>
                  )}

                  {VIEW_ONLY_CATEGORIES.size > 0 && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          {Array.from(VIEW_ONLY_CATEGORIES).join(', ')} is view-only
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Approve/Disapprove isn&apos;t available for this category
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Help center — static, decorative link card. */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 flex items-center justify-center shrink-0">
                    <LifeBuoy className="w-4 h-4" />
                  </div>
                  <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                    Need help?
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Reach out if anything here doesn&apos;t look right.
                </p>
                <a
                  href="mailto:support@raireports.example"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                >
                  Contact support <ExternalLink className="w-3 h-3" />
                </a>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}

      {/* 3-COLUMN VIEW — list, detail, and itemized breakdown all visible
          together for the selected category. Real data only: fields the
          backend doesn't return simply don't render (no placeholders). */}
      {view === 'list' && activeCategory && (
        <div>
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </button>

          <Card className="mb-5 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 flex items-center justify-center shrink-0">
                <ActiveCategoryIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Total pending {activeCategory}
                  </p>
                  {isViewOnlyCategory && (
                    <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300 gap-1">
                      {isCategoryHardcodedViewOnly ? (
                        <Eye className="w-3 h-3" />
                      ) : (
                        <Lock className="w-3 h-3" />
                      )}
                      View only
                    </Badge>
                  )}
                </div>
                <p className="font-heading tabular-nums text-2xl font-bold text-slate-900 dark:text-white">
                  ₱
                  {listItems
                    .reduce((sum, tx) => sum + (typeof tx.amount === 'number' ? tx.amount : 0), 0)
                    .toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </CardContent>
          </Card>

          {activeCategory === 'Disbursement Voucher' && (
            <div className="space-y-2 mb-4">
              {/* New Entry + Refresh — Cancel Entry, that unlabeled dropdown,
                  Print Form, and Print All are skipped: no backend support
                  for void or printing, so building those buttons would just
                  be dead UI. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => router.push('/dashboard/disbursement-voucher/new')}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> New Entry
                </Button>
                <Button size="sm" variant="outline" onClick={fetchDvList} disabled={dvBranchLoading}>
                  {dvBranchLoading ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5 mr-1" />
                  )}
                  Refresh List
                </Button>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[130px]">
                  <Label htmlFor="dv_branch" className="text-xs">Branch</Label>
                  {dvBranchesLoading ? (
                    <div className="h-8 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Loading...
                    </div>
                  ) : dvBranches.length === 0 ? (
                    <div className="h-8 flex items-center px-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400">
                      Could not load branches.
                    </div>
                  ) : (
                    <select
                      id="dv_branch"
                      value={dvBranch}
                      onChange={(e) => setDvBranch(e.target.value)}
                      className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                    >
                      {dvBranches.map((b) => (
                        <option key={b.code} value={b.code}>{b.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex-1 min-w-[150px]">
                  <Label htmlFor="dv_type" className="text-xs">Type</Label>
                  <select
                    id="dv_type"
                    value={dvType}
                    onChange={(e) => setDvType(e.target.value as 'CDB' | 'DSR')}
                    className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                  >
                    {DV_TYPES.map((t) => (
                      <option key={t.code} value={t.code}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 h-8 shrink-0 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={dvHideCancelled}
                    onChange={(e) => setDvHideCancelled(e.target.checked)}
                    className="accent-orange-500"
                  />
                  Not included cancelled
                </label>
                {/* Same shared toggle as the category cards above — kept
                    visible here too since this toolbar is its own screen a
                    user might land on directly without seeing the overview
                    checkbox first. */}
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 h-8 shrink-0 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeUnfinalized}
                    onChange={(e) => setIncludeUnfinalized(e.target.checked)}
                    className="accent-orange-500"
                  />
                  Show unfinalized
                </label>
              </div>

              {dvType === 'DSR' && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  Deposit Slip Receipt isn&apos;t tracked in the approval system yet — it needs its own
                  fields, endpoint, and workflow. Switch back to &quot;Check Disbursement Book&quot; to
                  continue.
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 h-8 shrink-0 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={dvDateFilterEnabled}
                    onChange={(e) => setDvDateFilterEnabled(e.target.checked)}
                    className="accent-orange-500"
                  />
                  Transaction dates
                </label>
                <Input
                  type="date"
                  value={dvDateFrom}
                  onChange={(e) => setDvDateFrom(e.target.value)}
                  disabled={!dvDateFilterEnabled}
                  className="h-8 text-xs w-36"
                />
                <span className="text-xs text-slate-400">to</span>
                <Input
                  type="date"
                  value={dvDateTo}
                  onChange={(e) => setDvDateTo(e.target.value)}
                  disabled={!dvDateFilterEnabled}
                  className="h-8 text-xs w-36"
                />
                <select
                  value={dvSearchField}
                  onChange={(e) => setDvSearchField(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 w-36 shrink-0"
                >
                  {DV_SEARCH_FIELDS.map((f) => (
                    <option key={f.label} value={f.label}>{f.label}</option>
                  ))}
                </select>
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    value={dvSearchQuery}
                    onChange={(e) => setDvSearchQuery(e.target.value)}
                    placeholder={`Search by ${dvSearchField}...`}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* COLUMN 1 — transaction list */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700 lg:sticky lg:top-4">
              <CardContent className="p-4">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search transaction..."
                    className="pl-9 h-10"
                  />
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[32rem] overflow-y-auto">
                  {filteredListItems.map((tx, i) => {
                    const txId = tx.id ?? tx.transaction_no ?? i;
                    const isSelected =
                      activeTransaction &&
                      (activeTransaction.id ?? activeTransaction.transaction_no) === txId;

                    return (
                      <button
                        key={txId}
                        type="button"
                        onClick={() => handleTransactionClick(tx)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-orange-50 dark:bg-orange-950/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
                            <ActiveCategoryIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {tx.transaction_no ?? tx.id ?? '—'}
                              </p>
                              {tx.isfinalized === 'N' && (
                                <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                                  Not finalized
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {tx.prepared_by ?? 'System'}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white shrink-0">
                          ₱{(tx.amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </p>
                      </button>
                    );
                  })}

                  {filteredListItems.length === 0 && (
                    <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 px-4">
                      No pending transactions{listSearch ? ` match "${listSearch}"` : ''}.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* COLUMN 2 — transaction detail + approve/reject */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700 lg:sticky lg:top-4">
              <CardContent className="p-5">
                {!activeTransaction ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
                    <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Select a transaction to view details.
                    </p>
                  </div>
                ) : (
                  <>
                    {actionMessage && (
                      <div
                        className={`mb-4 rounded-lg px-3 py-2 text-xs font-medium ${
                          actionMessage.type === 'success'
                            ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                            : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                        }`}
                      >
                        {actionMessage.text}
                      </div>
                    )}

                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Amount</p>
                        <p className="font-heading tabular-nums text-2xl font-bold text-slate-900 dark:text-white">
                          ₱
                          {(activeTransaction.amount ?? 0).toLocaleString('en-PH', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
                        <ActiveCategoryIcon className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Prepared by</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {activeTransaction.prepared_by ?? 'System'}
                        </p>
                      </div>
                      {(() => {
                        const statusRaw =
                          activeTransaction.status ?? activeTransaction.transaction_status ?? 'Pending';
                        const statusLower = String(statusRaw).toLowerCase();
                        const statusClass =
                          statusLower.includes('approve') && !statusLower.includes('dis')
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                            : statusLower.includes('dis') ||
                              statusLower.includes('decline') ||
                              statusLower.includes('reject')
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
                        return <Badge className={`${statusClass} font-heading`}>{statusRaw}</Badge>;
                      })()}
                    </div>

                    <dl className="space-y-2.5 text-sm border-t border-slate-100 dark:border-slate-700 pt-4 mb-4">
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-slate-400">Transaction no.</dt>
                        <dd className="font-heading tabular-nums font-medium text-slate-900 dark:text-white">
                          {activeTransaction.transaction_no ?? activeTransaction.id ?? '—'}
                        </dd>
                      </div>
                      {(activeTransaction.journal_code ?? activeTransaction.j_code) && (
                        <div className="flex justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">Journal code</dt>
                          <dd className="font-heading tabular-nums font-medium text-slate-900 dark:text-white">
                            {activeTransaction.journal_code ?? activeTransaction.j_code}
                          </dd>
                        </div>
                      )}
                      {(activeTransaction.journal_number ?? activeTransaction.j_num) && (
                        <div className="flex justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">Journal number</dt>
                          <dd className="font-heading tabular-nums font-medium text-slate-900 dark:text-white">
                            {activeTransaction.journal_number ?? activeTransaction.j_num}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {activeTransaction.description && (
                      <div className="mb-5">
                        <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white mb-1">
                          Description
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {activeTransaction.description}
                        </p>
                      </div>
                    )}

                    {isViewOnlyCategory ? (
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-4 py-3 flex items-center gap-2.5">
                        {isCategoryHardcodedViewOnly ? (
                          <Eye className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {isCategoryHardcodedViewOnly
                            ? `${activeCategory} is view-only. Approval actions aren't available.`
                            : "You don't have permission to approve or disapprove this transaction type."}
                        </p>
                      </div>
                    ) : declinePanelOpen ? (
                      /* Decline reason panel — same options and remarks field as mobile */
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                        <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white mb-3">
                          Select reason for disapproval
                        </h4>
                        <div className="space-y-2 mb-3">
                          {declineReasonOptions.map((reason) => (
                            <label
                              key={reason}
                              className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name="declineReason"
                                checked={selectedReason === reason}
                                onChange={() => setSelectedReason(reason)}
                                className="accent-orange-500"
                              />
                              {reason}
                            </label>
                          ))}
                        </div>

                        {selectedReason === 'Other' && (
                          <textarea
                            value={otherReason}
                            onChange={(e) => setOtherReason(e.target.value)}
                            placeholder="Type specific reason (remarks)"
                            maxLength={150}
                            rows={3}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white px-3 py-2 mb-3 resize-none"
                          />
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setDeclinePanelOpen(false);
                              setSelectedReason('');
                              setOtherReason('');
                              setActionMessage(null);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={handleConfirmDecline}
                            disabled={actionLoading}
                          >
                            {actionLoading ? 'Submitting...' : 'Confirm disapproval'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                          onClick={() => setDeclinePanelOpen(true)}
                          disabled={actionLoading}
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          Disapprove
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={handleApprove}
                          disabled={actionLoading}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          {actionLoading ? 'Submitting...' : 'Approve'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* COLUMN 3 — itemized breakdown, auto-loads on selection */}
            <Card className="dark:bg-slate-800 border-slate-200 dark:border-slate-700 lg:sticky lg:top-4">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                    Itemized details
                  </h4>
                  {activeTransaction && (
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full font-heading tabular-nums">
                      {itemizedRows.length}
                    </Badge>
                  )}
                </div>

                {!activeTransaction ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
                    <ChevronRight className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Itemized details will appear here.
                    </p>
                  </div>
                ) : itemizedLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
                    Loading transaction details...
                  </p>
                ) : itemizedRows.length > 0 ? (
                  <div className="space-y-3 max-h-[32rem] overflow-y-auto">
                    {itemizedRows.map((row, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                      >
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-xs font-heading font-semibold flex items-center justify-center">
                              {formatCellValue(lineField, row[lineField]) || i + 1}
                            </span>
                            <p className="text-xs font-semibold text-slate-900 dark:text-white uppercase truncate">
                              {formatCellValue(titleField, row[titleField])}
                            </p>
                          </div>
                        </div>

                        <div
                          className={`grid divide-x divide-slate-100 dark:divide-slate-700 ${
                            amountFields.length === 2 ? 'grid-cols-2' : ''
                          }`}
                          style={
                            amountFields.length !== 2
                              ? { gridTemplateColumns: `repeat(${amountFields.length || 1}, minmax(0, 1fr))` }
                              : undefined
                          }
                        >
                          {amountFields.map((field, fi) => (
                            <div key={fi} className="px-3 py-2 text-center">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">
                                {field}
                              </p>
                              <p className="font-heading tabular-nums text-xs font-bold text-orange-600 dark:text-orange-400">
                                {CURRENCY_COLUMNS.has(field) ? '₱' : ''}
                                {formatCellValue(field, row[field])}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                      No itemized records
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      There are no itemized records available for this transaction yet.
                    </p>
                    <Button variant="outline" size="sm" onClick={fetchItemizedDetails}>
                      Reload
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}

export function ApprovalsDashboard() {
  return (
    <Suspense fallback={null}>
      <DashboardPageContent />
    </Suspense>
  );
}